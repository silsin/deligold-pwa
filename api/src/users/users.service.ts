import { Injectable } from '@nestjs/common';
import { Role, type User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TradeError } from '../common/errors';
import { RANK, assignableRoles } from '../auth/roles';
import { toPublicUser, type PublicUser } from '../auth/auth.service';
import { ChangeRoleDto, CreateUserDto, UpdateProfileDto } from './dto/users.dto';
import * as bcrypt from 'bcryptjs';

/**
 * User administration: profiles, the verification badge, and role grants.
 *
 * The verification badge is the hinge of the whole trading flow. A customer
 * without it can still buy gold, but only against a bank transfer whose receipt
 * a broker manager approves; with it they settle instantly from their wallet.
 * Granting it is therefore a staff action that always records who did it.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Own profile ───────────────────────────────────────────────────────────

  /** The signed-in user's profile, including their badge state. */
  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new TradeError('کاربر یافت نشد', 404);
    return toPublicUser(user);
  }

  /**
   * Lets a customer edit their own name, national ID and delivery address.
   *
   * Deliberately narrow: role, status and `verifiedAt` are not in the DTO, so a
   * customer cannot grant themselves a badge or promote themselves by editing
   * their profile.
   */
  async updateOwnProfile(userId: string, dto: UpdateProfileDto): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new TradeError('کاربر یافت نشد', 404);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.nationalId !== undefined ? { nationalId: dto.nationalId } : {}),
        ...(dto.address !== undefined ? { address: dto.address.trim() || null } : {}),
      },
    });
    return toPublicUser(updated);
  }

  /**
   * How complete this customer's profile is.
   *
   * The app uses this to nudge them toward the missing fields, and a broker
   * manager sees it before granting the badge — an incomplete profile is the
   * usual reason a check is refused.
   */
  async profileCheck(userId: string): Promise<{
    complete: boolean;
    missing: string[];
    verified: boolean;
    verifyNote: string | null;
  }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new TradeError('کاربر یافت نشد', 404);

    const missing: string[] = [];
    if (!user.name?.trim()) missing.push('name');
    if (!user.nationalId?.trim()) missing.push('nationalId');
    if (!user.phone?.trim()) missing.push('phone');
    if (!user.address?.trim()) missing.push('address');

    return {
      complete: missing.length === 0,
      missing,
      verified: user.verifiedAt !== null,
      verifyNote: user.verifyNote,
    };
  }

  // ── Staff ─────────────────────────────────────────────────────────────────

  /**
   * Grants or revokes the verification badge.
   *
   * Only staff may do this, and only for customers inside their own broker —
   * the same subtree rule the rest of the platform applies. The actor is
   * recorded on the row, so "who vouched for this customer" is answerable
   * months later.
   */
  async setVerified(
    actor: { userId: string; role: Role; brokerId: string | null },
    targetId: string,
    decision: { verified: boolean; note?: string },
  ): Promise<PublicUser> {
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) throw new TradeError('کاربر یافت نشد', 404);
    this.assertSameBroker(actor, target);
    if (target.role !== Role.CUSTOMER) {
      throw new TradeError('تأیید هویت فقط برای مشتریان اعمال می‌شود');
    }

    const updated = await this.prisma.user.update({
      where: { id: targetId },
      data: decision.verified
        ? { verifiedAt: new Date(), verifiedById: actor.userId, verifyNote: null }
        : { verifiedAt: null, verifiedById: null, verifyNote: decision.note?.trim() || null },
    });
    return toPublicUser(updated);
  }

  /**
   * Lists customers visible to the caller.
   *
   * A SUPER_ADMIN sees everyone; a BROKER_ADMIN or BROKER_MANAGER sees only
   * their own organisation, and a customer sees nothing — this endpoint is for
   * staff screens, so a CUSTOMER gets an empty list rather than a 403 and can
   * simply render no directory.
   */
  async list(
    actor: { userId: string; role: Role; brokerId: string | null },
    opts: { search?: string; role?: Role; verified?: boolean; limit?: number } = {},
  ): Promise<PublicUser[]> {
    const limit = Math.min(opts.limit ?? 50, 200);
    const scope =
      actor.role === Role.SUPER_ADMIN
        ? {}
        : actor.role === Role.CUSTOMER
          ? { id: '__nobody__' }
          : { brokerId: actor.brokerId ?? '__no_broker__' };

    const rows = await this.prisma.user.findMany({
      where: {
        ...scope,
        ...(opts.role ? { role: opts.role } : {}),
        ...(opts.verified === undefined
          ? {}
          : opts.verified
            ? { verifiedAt: { not: null } }
            : { verifiedAt: null }),
        ...(opts.search?.trim()
          ? {
              OR: [
                { name: { contains: opts.search.trim() } },
                { phone: { contains: opts.search.trim() } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(toPublicUser);
  }

  /**
   * Creates an account on someone's behalf — an operator signing up a customer
   * who cannot do it themselves, or minting a colleague's staff login.
   */
  async create(
    actor: { userId: string; role: Role; brokerId: string | null },
    dto: CreateUserDto,
  ): Promise<PublicUser> {
    const requested = dto.role ?? Role.CUSTOMER;

    // You can never mint a role at or above your own. This is the rule that
    // stops a BROKER_ADMIN from cloning another BROKER_ADMIN.
    if (!assignableRoles(actor.role).includes(requested)) {
      throw new TradeError(`شما مجاز به ایجاد کاربر با نقش ${requested} نیستید`, 403);
    }
    if (actor.role !== Role.SUPER_ADMIN && requested === Role.SUPER_ADMIN) {
      throw new TradeError('فقط مدیر سیستم می‌تواند کاربر مدیر بسازد', 403);
    }

    const phone = dto.phone.trim();
    const existing = await this.prisma.user.findFirst({ where: { phone } });
    if (existing) throw new TradeError('این شماره موبایل قبلاً ثبت شده است', 409);

    // Staff accounts belong to the operator's own broker, so a BROKER_ADMIN
    // cannot create a manager who outlives their own organisation. A SUPER_ADMIN
    // creates platform-level accounts with no broker attached.
    const brokerId = actor.role === Role.SUPER_ADMIN ? null : actor.brokerId;

    const user = await this.prisma.user.create({
      data: {
        phone,
        name: dto.name.trim(),
        nationalId: dto.nationalId ?? null,
        role: requested,
        status: 'ACTIVE',
        brokerId,
        createdById: actor.userId,
        // A null password simply cannot log in; the operator sets one out of band.
        password: dto.password ? await bcrypt.hash(dto.password, 10) : null,
      },
    });
    return toPublicUser(user);
  }

  /**
   * Changes a user's role, recording the change on the audit trail.
   *
   * Three guards make this safe: you cannot change your own role, you cannot
   * grant a role at or above your own, and — when raising someone — you cannot
   * touch a user outside your own broker. Together they stop privilege being
   * laundered through this endpoint.
   */
  async changeRole(
    actor: { userId: string; role: Role; brokerId: string | null },
    targetId: string,
    dto: ChangeRoleDto,
  ): Promise<PublicUser> {
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) throw new TradeError('کاربر یافت نشد', 404);

    if (targetId === actor.userId) {
      throw new TradeError('نمی‌توانید نقش خودتان را تغییر دهید', 403);
    }
    if (!assignableRoles(actor.role).includes(dto.role)) {
      throw new TradeError(`شما مجاز به اعطای نقش ${dto.role} نیستید`, 403);
    }
    // Lowering someone's role is always allowed; raising it needs the subtree check.
    if (RANK[dto.role] > RANK[target.role]) {
      this.assertSameBroker(actor, target);
    }

    const [, updated] = await this.prisma.$transaction([
      this.prisma.roleChange.create({
        data: {
          targetId,
          granterId: actor.userId,
          fromRole: target.role,
          toRole: dto.role,
          reason: dto.note?.trim() || null,
        },
      }),
      this.prisma.user.update({ where: { id: targetId }, data: { role: dto.role } }),
    ]);

    return toPublicUser(updated);
  }

  /** Blocks or unblocks an account without deleting its history. */
  async setStatus(
    actor: { userId: string; role: Role; brokerId: string | null },
    targetId: string,
    status: 'ACTIVE' | 'SUSPENDED' | 'PENDING',
  ): Promise<PublicUser> {
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) throw new TradeError('کاربر یافت نشد', 404);
    if (targetId === actor.userId) {
      throw new TradeError('نمی‌توانید حساب خودتان را مسدود کنید', 403);
    }
    if (actor.role !== Role.SUPER_ADMIN) {
      this.assertSameBroker(actor, target);
      if (RANK[target.role] >= RANK[actor.role]) {
        throw new TradeError('نمی‌توانید کاربر هم‌سطح یا بالاتر را مسدود کنید', 403);
      }
    }

    const updated = await this.prisma.user.update({ where: { id: targetId }, data: { status } });
    return toPublicUser(updated);
  }

  /**
   * Guards a staff action against a user in another organisation.
   *
   * SUPER_ADMIN crosses every boundary; everyone else is confined to their own
   * broker's users, which is what keeps two competing brokers apart.
   */
  private assertSameBroker(
    actor: { role: Role; brokerId: string | null },
    target: Pick<User, 'brokerId'>,
  ): void {
    if (actor.role === Role.SUPER_ADMIN) return;
    if ((target.brokerId ?? null) !== (actor.brokerId ?? null)) {
      throw new TradeError('این کاربر متعلق به سازمان شما نیست', 403);
    }
  }
}

