import { Injectable, Logger } from '@nestjs/common';
import { Role } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TradeError } from '../common/errors';
import { CreateInviteDto, UpdateInviteDto } from './dto/invites.dto';
import { RANK } from '../auth/roles';

// 32-symbol alphabet: no 0/O/1/I to avoid ambiguity
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface InviteView {
  id: string;
  code: string;
  brokerId: string;
  brokerName: string | null;
  createdByName: string | null;
  expiresAt: Date | null;
  maxUses: number | null;
  uses: number;
  remaining: number | null;
  active: boolean;
  valid: boolean;
  createdAt: Date;
}

export interface InviteLookupView {
  code: string;
  brokerName: string;
  active: boolean;
  expired: boolean;
  exhausted: boolean;
  valid: boolean;
}

/**
 * Generate an 8-character code from the invite alphabet.
 */
function generateCode(): string {
  const chars: string[] = [];
  for (let i = 0; i < 8; i++) {
    const randomIndex = randomBytes(1)[0] % INVITE_ALPHABET.length;
    chars.push(INVITE_ALPHABET[randomIndex]);
  }
  return chars.join('');
}

@Injectable()
export class InvitesService {
  private readonly logger = new Logger(InvitesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a new invite code.
   */
  async generate(
    actor: { userId: string; role: Role; brokerId: string | null },
    dto: CreateInviteDto,
  ): Promise<InviteView> {
    // Resolve the target broker
    let targetBrokerId: string;
    if (actor.role === Role.SUPER_ADMIN) {
      if (dto.brokerId) {
        // Verify broker exists
        const broker = await this.prisma.broker.findUnique({
          where: { id: dto.brokerId },
        });
        if (!broker) {
          throw new TradeError('سازمان مشخص نیست', 400);
        }
        targetBrokerId = dto.brokerId;
      } else {
        // A super admin has no broker of their own. With a single broker the
        // choice is unambiguous, so default to it rather than demanding an id
        // the PWA has no screen to look up.
        const brokers = await this.prisma.broker.findMany({ select: { id: true }, take: 2 });
        if (brokers.length !== 1) {
          throw new TradeError('شناسه کارگزاری را وارد کنید', 400);
        }
        targetBrokerId = brokers[0].id;
      }
    } else {
      if (!actor.brokerId) {
        throw new TradeError('سازمان شما مشخص نیست', 400);
      }
      targetBrokerId = actor.brokerId;
    }

    // Validate expiresAt
    if (dto.expiresAt) {
      const expiresAt = new Date(dto.expiresAt);
      if (expiresAt.getTime() <= Date.now()) {
        throw new TradeError('تاریخ انقضای دعوت باید در آینده باشد', 400);
      }
    }

    // Try to generate a unique code (up to 5 attempts)
    let code: string;
    let attempt = 0;
    while (attempt < 5) {
      code = generateCode();
      const existing = await this.prisma.invite.findUnique({
        where: { code },
      });
      if (!existing) break;
      attempt++;
    }

    if (attempt >= 5) {
      throw new TradeError('ایجاد کد دعوت ناموفق بود', 500);
    }

    const invite = await this.prisma.invite.create({
      data: {
        code: code!,
        brokerId: targetBrokerId,
        createdById: actor.userId,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        maxUses: dto.maxUses ?? null,
      },
      include: {
        broker: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    });

    this.logger.log(`invite ${code} created by ${actor.userId}`);

    return this.toInviteView(invite);
  }

  /**
   * List invites for the actor's broker (or all if SUPER_ADMIN).
   */
  async list(
    actor: { userId: string; role: Role; brokerId: string | null },
    query?: { brokerId?: string },
  ): Promise<InviteView[]> {
    let brokerId: string | undefined;

    if (actor.role === Role.SUPER_ADMIN) {
      brokerId = query?.brokerId;
    } else {
      brokerId = actor.brokerId ?? undefined;
    }

    const where = brokerId ? { brokerId } : {};

    const invites = await this.prisma.invite.findMany({
      where,
      include: {
        broker: { select: { name: true } },
        createdBy: { select: { name: true } },
        _count: { select: { users: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return invites.map(inv => this.toInviteView(inv));
  }

  /**
   * Lookup an invite code (public endpoint).
   */
  async lookup(code: string): Promise<InviteLookupView> {
    const invite = await this.prisma.invite.findUnique({
      where: { code: code.trim().toUpperCase() },
      include: { broker: { select: { name: true } } },
    });

    if (!invite) {
      throw new TradeError('کد دعوت یافت نشد', 404);
    }

    const now = new Date();
    const expired = invite.expiresAt != null && invite.expiresAt < now;
    const exhausted =
      invite.maxUses != null && invite.uses >= invite.maxUses;
    const valid = invite.active && !expired && !exhausted;

    return {
      code: invite.code,
      brokerName: invite.broker.name,
      active: invite.active,
      expired,
      exhausted,
      valid,
    };
  }

  /**
   * Update an invite (e.g., disable or change expiry).
   */
  async update(
    actor: { userId: string; role: Role; brokerId: string | null },
    id: string,
    dto: UpdateInviteDto,
  ): Promise<InviteView> {
    const invite = await this.prisma.invite.findUnique({
      where: { id },
      include: { broker: { select: { name: true } } },
    });

    if (!invite) {
      throw new TradeError('کد دعوت یافت نشد', 404);
    }

    // assertSameBroker
    if (actor.role !== Role.SUPER_ADMIN) {
      if (
        (invite.brokerId ?? null) !== (actor.brokerId ?? null)
      ) {
        throw new TradeError('این دعوت متعلق به سازمان شما نیست', 403);
      }
    }

    // Validate expiresAt if provided
    if (dto.expiresAt !== undefined && dto.expiresAt !== null) {
      const expiresAt = new Date(dto.expiresAt);
      if (expiresAt.getTime() <= Date.now()) {
        throw new TradeError('تاریخ انقضای دعوت باید در آینده باشد', 400);
      }
    }

    const updated = await this.prisma.invite.update({
      where: { id },
      data: {
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.expiresAt !== undefined
          ? { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null }
          : {}),
      },
      include: {
        broker: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    });

    return this.toInviteView(updated);
  }

  /**
   * Convert a Prisma Invite row to InviteView.
   */
  private toInviteView(invite: any): InviteView {
    const now = new Date();
    const expired =
      invite.expiresAt != null && invite.expiresAt < now;
    const exhausted =
      invite.maxUses != null && invite.uses >= invite.maxUses;
    const valid = invite.active && !expired && !exhausted;
    const remaining =
      invite.maxUses == null
        ? null
        : Math.max(0, invite.maxUses - invite.uses);

    return {
      id: invite.id,
      code: invite.code,
      brokerId: invite.brokerId,
      brokerName: invite.broker?.name ?? null,
      createdByName: invite.createdBy?.name ?? null,
      expiresAt: invite.expiresAt,
      maxUses: invite.maxUses,
      uses: invite.uses,
      remaining,
      active: invite.active,
      valid,
      createdAt: invite.createdAt,
    };
  }
}
