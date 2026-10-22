import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/current-user.decorator';

export interface NotificationView {
  id: string;
  title: string;
  body: string;
  kind: string;
  read: boolean;
  url: string | null;
  createdAt: Date;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    data: { title: string; body: string; kind: string; url?: string },
  ): Promise<void> {
    await this.prisma.notification.create({
      data: {
        userId,
        title: data.title,
        body: data.body,
        kind: data.kind,
        url: data.url ?? null,
      },
    });
  }

  async list(userId: string, limit = 50): Promise<NotificationView[]> {
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(r => ({ ...r, url: r.url ?? null }));
  }

  async markRead(userId: string, id: string): Promise<void> {
    const row = await this.prisma.notification.findUnique({ where: { id } });
    if (!row || row.userId !== userId) throw new NotFoundException('اعلان یافت نشد');
    await this.prisma.notification.update({ where: { id }, data: { read: true } });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, read: false } });
  }

  async broadcast(
    actor: AuthUser,
    dto: { title: string; body: string; url?: string; targetRole?: string },
  ): Promise<{ count: number }> {
    const where: Record<string, unknown> = {};
    if (actor.role !== 'SUPER_ADMIN' && actor.brokerId) {
      where.brokerId = actor.brokerId;
    }
    if (dto.targetRole) where.role = dto.targetRole;
    const users = await this.prisma.user.findMany({ where, select: { id: true } });
    if (!users.length) return { count: 0 };
    await this.prisma.notification.createMany({
      data: users.map(u => ({
        userId: u.id,
        title: dto.title,
        body: dto.body,
        kind: 'BROADCAST',
        url: dto.url ?? null,
      })),
    });
    return { count: users.length };
  }
}
