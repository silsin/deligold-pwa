import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { SubscribeDto } from './dto/push.dto';

// ── Payload / event types ─────────────────────────────────────────────────

export interface NotifyPayload {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

export type PushEvent =
  | { type: 'NEW_ORDER';           userId: string; brokerId: string; ref: string; symbol: string; grams: number }
  | { type: 'ORDER_STATUS';        userId: string; brokerId: string; ref: string; status: string }
  | { type: 'NEW_DEPOSIT';         userId: string; brokerId: string; ref: string; amount: number }
  | { type: 'DEPOSIT_DECISION';    userId: string; ref: string; approved: boolean }
  | { type: 'NEW_WITHDRAWAL';      userId: string; brokerId: string; ref: string; amount: number }
  | { type: 'WITHDRAWAL_DECISION'; userId: string; ref: string; approved: boolean }
  | { type: 'NEW_CUSTOMER';        userId: string; brokerId: string; customerName: string }
  | { type: 'IDENTITY_DECISION';   userId: string; verified: boolean }
  | { type: 'ACCOUNT_SUSPENDED';   userId: string };

const ICON = '/icons/icon-192x192.png';

function buildPayload(event: PushEvent): NotifyPayload {
  switch (event.type) {
    case 'NEW_ORDER':
      return {
        title: 'سفارش جدید',
        body: `سفارش ${event.ref} — ${event.grams} گرم ${event.symbol}`,
        icon: ICON, tag: 'NEW_ORDER',
        data: { url: '/review' },
      };

    case 'ORDER_STATUS': {
      if (event.status === 'PENDING_REVIEW') {
        return {
          title: 'رسید بارگذاری شد',
          body: `سفارش ${event.ref} منتظر بررسی است`,
          icon: ICON, tag: 'ORDER_STATUS_REVIEW',
          data: { url: '/review' },
        };
      }
      if (event.status === 'APPROVED') {
        return {
          title: 'سفارش تأیید شد',
          body: `سفارش ${event.ref} شما تأیید شد`,
          icon: ICON, tag: 'ORDER_APPROVED',
          data: { url: '/orders' },
        };
      }
      if (event.status === 'REJECTED') {
        return {
          title: 'سفارش رد شد',
          body: `سفارش ${event.ref} شما رد شد`,
          icon: ICON, tag: 'ORDER_REJECTED',
          data: { url: '/orders' },
        };
      }
      if (event.status === 'FULFILLED') {
        return {
          title: 'سفارش تحویل داده شد',
          body: `سفارش ${event.ref} تحویل داده شد`,
          icon: ICON, tag: 'ORDER_FULFILLED',
          data: { url: '/orders' },
        };
      }
      return {
        title: 'وضعیت سفارش تغییر کرد',
        body: `سفارش ${event.ref}: ${event.status}`,
        icon: ICON, tag: 'ORDER_STATUS',
        data: { url: '/orders' },
      };
    }

    case 'NEW_DEPOSIT':
      return {
        title: 'واریز جدید',
        body: `درخواست واریز ${event.ref} — ${event.amount.toLocaleString('fa-IR')} تومان`,
        icon: ICON, tag: 'NEW_DEPOSIT',
        data: { url: '/desk' },
      };

    case 'DEPOSIT_DECISION':
      return event.approved
        ? { title: 'واریز تأیید شد', body: `واریز ${event.ref} شما تأیید شد`, icon: ICON, tag: 'DEPOSIT_APPROVED', data: { url: '/wallet' } }
        : { title: 'واریز رد شد', body: `واریز ${event.ref} شما رد شد`, icon: ICON, tag: 'DEPOSIT_REJECTED', data: { url: '/wallet' } };

    case 'NEW_WITHDRAWAL':
      return {
        title: 'برداشت جدید',
        body: `درخواست برداشت ${event.ref} — ${event.amount.toLocaleString('fa-IR')} تومان`,
        icon: ICON, tag: 'NEW_WITHDRAWAL',
        data: { url: '/desk' },
      };

    case 'WITHDRAWAL_DECISION':
      return event.approved
        ? { title: 'برداشت تأیید شد', body: `برداشت ${event.ref} شما تأیید شد`, icon: ICON, tag: 'WITHDRAWAL_APPROVED', data: { url: '/wallet' } }
        : { title: 'برداشت رد شد', body: `برداشت ${event.ref} شما رد شد`, icon: ICON, tag: 'WITHDRAWAL_REJECTED', data: { url: '/wallet' } };

    case 'NEW_CUSTOMER':
      return {
        title: 'مشتری جدید',
        body: `${event.customerName} ثبت‌نام کرد`,
        icon: ICON, tag: 'NEW_CUSTOMER',
        data: { url: '/customers' },
      };

    case 'IDENTITY_DECISION':
      return event.verified
        ? { title: 'هویت تأیید شد', body: 'هویت شما با موفقیت تأیید شد', icon: ICON, tag: 'IDENTITY_VERIFIED', data: { url: '/account' } }
        : { title: 'هویت رد شد', body: 'تأیید هویت شما رد شد', icon: ICON, tag: 'IDENTITY_REJECTED', data: { url: '/account' } };

    case 'ACCOUNT_SUSPENDED':
      return {
        title: 'حساب مسدود شد',
        body: 'حساب شما توسط مدیر مسدود شد',
        icon: ICON, tag: 'ACCOUNT_SUSPENDED',
        data: { url: '/account' },
      };
  }
}

// ── Service ───────────────────────────────────────────────────────────────

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    const subject = this.config.get<string>('VAPID_SUBJECT');
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');

    if (!subject || !publicKey || !privateKey) {
      throw new Error('VAPID_SUBJECT, VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must all be set');
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);
    this.logger.log('VAPID keys configured');
  }

  getVapidPublicKey(): string {
    return this.config.get<string>('VAPID_PUBLIC_KEY') ?? '';
  }

  async hasSubscriptions(userId: string): Promise<boolean> {
    const count = await this.prisma.pushSubscription.count({ where: { userId } });
    return count > 0;
  }

  async subscribe(userId: string, dto: SubscribeDto): Promise<void> {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        userId,
        endpoint: dto.endpoint,
        keys: JSON.stringify(dto.keys),
      },
      update: {
        userId,
        keys: JSON.stringify(dto.keys),
      },
    });
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
  }

  async sendToUser(userId: string, payload: NotifyPayload): Promise<void> {
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    
    // Log if user has no subscriptions — this is a follow-up opportunity
    if (!subs.length) {
      this.logger.warn(`push subscription missing for user ${userId} — cannot deliver notification`);
    }
    
    await Promise.allSettled(
      subs.map(sub => this.sendOne(sub, payload)),
    );
  }

  /** Fire-and-forget push to many users at once (e.g. a broadcast). Never throws. */
  async sendToUsers(userIds: string[], payload: NotifyPayload): Promise<void> {
    if (!userIds.length) return;
    await Promise.allSettled(userIds.map(id => this.sendToUser(id, payload)));
  }

  async sendToBrokerManagers(brokerId: string, payload: NotifyPayload): Promise<void> {
    if (!brokerId) return;
    const managers = await this.prisma.user.findMany({
      where: { brokerId, role: { in: ['BROKER_MANAGER', 'BROKER_ADMIN'] } },
      select: { id: true },
    });
    await Promise.allSettled(
      managers.map(m => this.sendToUser(m.id, payload)),
    );
  }

  /** Fire-and-forget entry point for other services. Never throws. */
  notify(event: PushEvent): void {
    const payload = buildPayload(event);
    void this.dispatch(event, payload).catch(e =>
      this.logger.warn(`push dispatch failed [${event.type}]: ${e?.message}`),
    );
  }

  private async dispatch(event: PushEvent, payload: NotifyPayload): Promise<void> {
    switch (event.type) {
      // Broker manager events
      case 'NEW_ORDER':
        await this.sendToBrokerManagers(event.brokerId, payload);
        await this.saveForManagers(event.brokerId, {
          title: payload.title, body: payload.body, kind: event.type, url: '/review',
        });
        // Also notify the customer who placed the order
        await this.sendToUser(event.userId, {
          title: 'سفارش ثبت شد',
          body: `سفارش ${event.ref} شما با موفقیت ثبت شد`,
          icon: ICON, tag: 'ORDER_PLACED',
          data: { url: '/orders' },
        });
        this.notifications.create(event.userId, {
          title: 'سفارش ثبت شد',
          body: `سفارش ${event.ref} شما با موفقیت ثبت شد`,
          kind: 'NEW_ORDER', url: '/orders',
        }).catch(() => undefined);
        break;

      case 'NEW_DEPOSIT':
      case 'NEW_WITHDRAWAL':
      case 'NEW_CUSTOMER':
        await this.sendToBrokerManagers(event.brokerId, payload);
        await this.saveForManagers(event.brokerId, {
          title: payload.title, body: payload.body, kind: event.type, url: '/desk',
        });
        break;

      case 'ORDER_STATUS':
        if (event.status === 'PENDING_REVIEW') {
          await this.sendToBrokerManagers(event.brokerId, payload);
          await this.saveForManagers(event.brokerId, {
            title: payload.title, body: payload.body, kind: event.type, url: '/review',
          });
        } else {
          await this.sendToUser(event.userId, payload);
          this.notifications.create(event.userId, {
            title: payload.title, body: payload.body, kind: event.type, url: '/orders',
          }).catch(() => undefined);
        }
        break;

      // Customer-only events
      case 'DEPOSIT_DECISION':
      case 'WITHDRAWAL_DECISION':
      case 'IDENTITY_DECISION':
      case 'ACCOUNT_SUSPENDED':
        await this.sendToUser(event.userId, payload);
        this.notifications.create(event.userId, {
          title: payload.title,
          body: payload.body,
          kind: event.type,
          url: (event.type === 'ACCOUNT_SUSPENDED' || event.type === 'IDENTITY_DECISION')
            ? '/account' : '/wallet',
        }).catch(() => undefined);
        break;
    }
  }

  private async saveForManagers(
    brokerId: string,
    data: { title: string; body: string; kind: string; url: string },
  ): Promise<void> {
    if (!brokerId) return;
    const managers = await this.prisma.user.findMany({
      where: { brokerId, role: { in: ['BROKER_MANAGER', 'BROKER_ADMIN'] } },
      select: { id: true },
    });
    await Promise.allSettled(
      managers.map(m => this.notifications.create(m.id, data).catch(() => undefined)),
    );
  }

  private async sendOne(
    sub: { id: string; endpoint: string; keys: string },
    payload: NotifyPayload,
  ): Promise<void> {
    let keys: { p256dh: string; auth: string };
    try {
      keys = JSON.parse(sub.keys);
    } catch {
      await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
      return;
    }

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys },
        JSON.stringify(payload),
      );
    } catch (err: unknown) {
      const wpErr = err as { statusCode?: number };
      if (wpErr?.statusCode === 410 || wpErr?.statusCode === 404) {
        // Endpoint is gone — clean it up
        await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
      } else {
        this.logger.warn(`push send failed (${wpErr?.statusCode ?? 'unknown'}): ${sub.endpoint.slice(0, 60)}`);
      }
    }
  }
}
