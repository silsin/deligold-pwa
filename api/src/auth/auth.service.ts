import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, type User } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { TradeError } from '../common/errors';
import { assignableRoles } from './roles';
import type { AuthUser } from './current-user.decorator';
import { PHONE_RE, type LoginDto, type RegisterDto } from './dto/auth.dto';

/** Refresh tokens live a week, so a device stays signed in across restarts. */
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** The public shape of a user — never leaks the password hash. */
export interface PublicUser {
  id: string;
  phone: string | null;
  email: string | null;
  name: string;
  nationalId: string | null;
  role: Role;
  brokerId: string | null;
  /** True once staff have checked this customer — unlocks wallet trading. */
  verified: boolean;
  verifyNote: string | null;
  address: string | null;
  createdAt: Date;
}

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

/** Strip everything private before a user object leaves the API. */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    phone: user.phone,
    email: user.email,
    name: user.name,
    nationalId: user.nationalId,
    role: user.role,
    brokerId: user.brokerId,
    verified: user.verifiedAt !== null,
    verifyNote: user.verifyNote,
    address: user.address,
    createdAt: user.createdAt,
  };
}

/**
 * Normalise phone input so `+98912…`, `98912…` and `0912…` all collapse to one
 * stored form. Without this the same person could register three times under
 * three spellings of their number.
 */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  if (!PHONE_RE.test(trimmed)) return trimmed;
  return trimmed.replace(/^\+?98/, '0').replace(/^98/, '0');
}

/** Refresh tokens are stored only as a hash, so a database leak is not a keyring. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Creates a self-registered CUSTOMER, or a staff account when an operator
   * with a high enough role asks for one.
   *
   * A member of the public always becomes a CUSTOMER, whatever `role` the body
   * claimed: otherwise the sign-up form would be a privilege-escalation hole.
   * Staff-created accounts may name any role strictly below their own.
   */
  async register(
    dto: RegisterDto,
    actor?: { userId: string; role: Role },
  ): Promise<AuthResult> {
    const phone = normalizePhone(dto.phone);
    const requested = actor ? (dto.role ?? Role.CUSTOMER) : Role.CUSTOMER;

    // You can never mint a role at or above your own — that is what stops one
    // BROKER_ADMIN from cloning another, or a manager promoting themselves.
    if (actor && !assignableRoles(actor.role).includes(requested)) {
      throw new TradeError(`شما مجاز به ایجاد کاربر با نقش ${requested} نیستید`, 403);
    }
    if (!actor && requested !== Role.CUSTOMER) {
      throw new TradeError('ثبت‌نام عمومی فقط برای مشتری امکان‌پذیر است', 403);
    }

    const existing = await this.prisma.user.findFirst({ where: { phone } });
    if (existing) {
      // Deliberately vague: tells the user they can log in rather than
      // confirming the number exists (prevents phone enumeration).
      throw new TradeError('این شماره موبایل قبلاً ثبت شده است. لطفاً وارد شوید', 409);
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    // Resolve invite if provided (public self-registration only)
    let brokerId: string | null = null;
    let redeemedInviteId: string | null = null;

    if (!actor && dto.inviteCode) {
      const invite = await this.usableInvite(dto.inviteCode);
      brokerId = invite.brokerId;
      redeemedInviteId = invite.id;
    }

    const user = await this.prisma.$transaction(async tx => {
      const created = await tx.user.create({
        data: {
          phone,
          name: dto.name.trim(),
          nationalId: dto.nationalId ?? null,
          password: passwordHash,
          role: requested,
          // A self-registered customer is unverified until staff check them;
          // that is what routes their first buys through the receipt flow.
          status: 'ACTIVE',
          createdById: actor?.userId ?? null,
          brokerId,
          redeemedInviteId,
        },
      });
      // Every account gets a wallet on day one, so the first screen after
      // sign-up shows a balance rather than an error.
      await tx.wallet.create({ data: { userId: created.id } });

      // If redeemed an invite, increment its uses
      if (redeemedInviteId) {
        const updated = await tx.invite.update({
          where: { id: redeemedInviteId },
          data: { uses: { increment: 1 } },
        });

        // Re-check exhaustion in the transaction
        if (
          updated.maxUses != null &&
          updated.uses > updated.maxUses
        ) {
          throw new TradeError('ظرفیت این کد دعوت تکمیل شده است', 400);
        }
      }

      return created;
    });

    this.logger.log(`registered ${requested} ${user.id} (${phone})`);
    return this.issue(user);
  }

  /**
   * An existing customer joins a broker by invite code — the in-app QR scan
   * or typed code, for someone who registered without an invite.
   *
   * Only an unattached CUSTOMER may join: moving a customer between brokers
   * would carry their wallet and positions across organisations, so that stays
   * a staff decision. The broker lives in the JWT, so a fresh token pair is
   * issued and the very next request is already broker-scoped.
   */
  async joinBroker(actor: AuthUser, code: string): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { id: actor.userId } });
    if (!user) throw new TradeError('کاربر یافت نشد', 404);
    if (user.role !== Role.CUSTOMER) {
      throw new TradeError('فقط مشتریان می‌توانند با کد دعوت عضو کارگزاری شوند', 403);
    }

    const invite = await this.usableInvite(code);
    if (user.brokerId) {
      throw new TradeError(
        user.brokerId === invite.brokerId
          ? 'شما هم‌اکنون عضو این کارگزاری هستید'
          : 'شما عضو کارگزاری دیگری هستید؛ برای تغییر با پشتیبانی تماس بگیرید',
        409,
      );
    }

    const joined = await this.prisma.$transaction(async tx => {
      // Conditional on still being unattached, so two scans racing each other
      // cannot both succeed.
      const { count } = await tx.user.updateMany({
        where: { id: user.id, brokerId: null },
        data: { brokerId: invite.brokerId, redeemedInviteId: invite.id },
      });
      if (count !== 1) throw new TradeError('شما عضو کارگزاری دیگری هستید', 409);

      const updated = await tx.invite.update({
        where: { id: invite.id },
        data: { uses: { increment: 1 } },
      });
      if (updated.maxUses != null && updated.uses > updated.maxUses) {
        throw new TradeError('ظرفیت این کد دعوت تکمیل شده است', 400);
      }
      return tx.user.findUniqueOrThrow({ where: { id: user.id } });
    });

    this.logger.log(`customer ${user.id} joined broker ${invite.brokerId} via invite ${invite.code}`);
    return this.issue(joined);
  }

  /** Loads an invite by code and rejects it, with a specific reason, unless usable now. */
  private async usableInvite(code: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { code: code.trim().toUpperCase() },
    });
    if (!invite) throw new TradeError('کد دعوت یافت نشد', 404);
    if (!invite.active) throw new TradeError('این کد دعوت غیرفعال است', 400);
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw new TradeError('کد دعوت منقضی شده است', 400);
    }
    if (invite.maxUses != null && invite.uses >= invite.maxUses) {
      throw new TradeError('ظرفیت این کد دعوت تکمیل شده است', 400);
    }
    return invite;
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const phone = normalizePhone(dto.phone);
    const user = await this.prisma.user.findFirst({ where: { phone } });

    // One vague error for "no such user" and "wrong password", so the endpoint
    // does not leak which numbers have accounts.
    const invalid = new TradeError('شماره موبایل یا رمز عبور اشتباه است', 401);
    if (!user?.password) throw invalid;

    if (!(await bcrypt.compare(dto.password, user.password))) throw invalid;

    if (user.status === 'SUSPENDED') {
      throw new TradeError('حساب شما مسدود شده است. با پشتیبانی تماس بگیرید', 403);
    }
    if (user.status === 'PENDING') {
      throw new TradeError('حساب شما هنوز فعال نشده است', 403);
    }

    return this.issue(user);
  }

  /**
   * Exchanges a refresh token for a fresh pair, rotating it on the way out.
   *
   * The old row is deleted as part of the same swap, so a stolen refresh token
   * works at most once and its theft is visible: the legitimate device's next
   * refresh fails, which signs it out.
   */
  async refresh(refreshToken: string): Promise<AuthResult> {
    const session = await this.prisma.session.findFirst({
      where: { tokenHash: hashToken(refreshToken) },
    });

    if (!session || session.expiresAt.getTime() < Date.now()) {
      throw new TradeError('نشست منقضی شده است؛ دوباره وارد شوید', 401);
    }

    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || user.status !== 'ACTIVE') {
      throw new TradeError('حساب شما در دسترس نیست', 401);
    }

    await this.prisma.session
      .delete({ where: { id: session.id } })
      .catch(() => undefined);
    return this.issue(user);
  }

  /** Deletes the caller's refresh token so that device is signed out. */
  async logout(refreshToken: string): Promise<void> {
    await this.prisma.session
      .deleteMany({ where: { tokenHash: hashToken(refreshToken) } })
      .catch(() => undefined);
  }

  /** Loads a user by id, for the `/me` endpoint. */
  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new TradeError('کاربر یافت نشد', 404);
    return toPublicUser(user);
  }

  /** Signs an access token, mints a refresh token, and records the session. */
  private async issue(user: User): Promise<AuthResult> {
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      role: user.role,
      brokerId: user.brokerId,
      name: user.name,
    });

    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });

    return { user: toPublicUser(user), accessToken, refreshToken };
  }
}

