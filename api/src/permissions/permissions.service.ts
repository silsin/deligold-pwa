import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TradeError } from '../common/errors';
import { isTradeSymbol, TRADE_SYMBOLS } from '../market/symbols';

export interface PermissionView {
  symbol: string;
  name: string;
  allowBuy: boolean;
  allowSell: boolean;
  explicit: boolean;
}

export interface PermissionItem {
  symbol: string;
  allowBuy: boolean;
  allowSell: boolean;
}

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List all permissions for a customer (fills in defaults for missing rows).
   */
  async listForUser(
    actor: { userId: string; role: Role; brokerId: string | null },
    userId: string,
  ): Promise<PermissionView[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, brokerId: true },
    });

    if (!user) {
      throw new TradeError('کاربر یافت نشد', 404);
    }

    this.assertSameBroker(actor, user);

    if (user.role !== Role.CUSTOMER) {
      throw new TradeError('دسترسی معامله فقط برای مشتریان تنظیم می‌شود', 400);
    }

    // Load all explicit permission rows for this user
    const rows = await this.prisma.customerPermission.findMany({
      where: { userId },
    });

    const rowsBySymbol = new Map(rows.map(r => [r.symbol, r]));

    // Return one entry per trade symbol
    return TRADE_SYMBOLS.map(sym => {
      const row = rowsBySymbol.get(sym.symbol);
      return {
        symbol: sym.symbol,
        name: sym.name,
        allowBuy: row?.allowBuy ?? true,
        allowSell: row?.allowSell ?? true,
        explicit: !!row,
      };
    });
  }

  /**
   * Set permissions for a customer.
   */
  async setForUser(
    actor: { userId: string; role: Role; brokerId: string | null },
    userId: string,
    items: PermissionItem[],
  ): Promise<PermissionView[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, brokerId: true },
    });

    if (!user) {
      throw new TradeError('کاربر یافت نشد', 404);
    }

    this.assertSameBroker(actor, user);

    if (user.role !== Role.CUSTOMER) {
      throw new TradeError('دسترسی معامله فقط برای مشتریان تنظیم می‌شود', 400);
    }

    // Validate each item
    for (const item of items) {
      if (!isTradeSymbol(item.symbol)) {
        throw new TradeError(`نماد ${item.symbol} معاملاتی نیست`, 400);
      }
      if (
        typeof item.allowBuy !== 'boolean' ||
        typeof item.allowSell !== 'boolean'
      ) {
        throw new TradeError('اجازات باید boolean باشند', 400);
      }
    }

    // Upsert/delete rows in a transaction
    await this.prisma.$transaction(async tx => {
      for (const item of items) {
        // If both allow, delete the row (default = allowed)
        if (item.allowBuy && item.allowSell) {
          await tx.customerPermission.deleteMany({
            where: { userId, symbol: item.symbol },
          });
        } else {
          // Upsert otherwise
          await tx.customerPermission.upsert({
            where: { userId_symbol: { userId, symbol: item.symbol } },
            create: {
              userId,
              symbol: item.symbol,
              allowBuy: item.allowBuy,
              allowSell: item.allowSell,
              updatedById: actor.userId,
            },
            update: {
              allowBuy: item.allowBuy,
              allowSell: item.allowSell,
              updatedById: actor.userId,
            },
          });
        }
      }
    });

    // Return updated list
    return this.listForUser(actor, userId);
  }

  /**
   * Check if a user can trade a symbol on a given side.
   * Throws if denied, returns void if allowed.
   */
  async canTrade(
    userId: string,
    symbol: string,
    side: 'BUY' | 'SELL',
  ): Promise<void> {
    const row = await this.prisma.customerPermission.findUnique({
      where: { userId_symbol: { userId, symbol } },
    });

    // No row = allowed (default)
    if (!row) {
      return;
    }

    // Row present: check the appropriate side
    const allowed = side === 'BUY' ? row.allowBuy : row.allowSell;
    if (!allowed) {
      throw new TradeError('معامله این نماد برای شما محدود شده است', 403);
    }
  }

  /**
   * Helper: verify the actor and target are in the same broker.
   */
  private assertSameBroker(
    actor: { userId: string; role: Role; brokerId: string | null },
    target: { id?: string; brokerId: string | null },
  ): void {
    if (actor.role === Role.SUPER_ADMIN) {
      return; // SUPER_ADMIN can see all
    }
    if ((target.brokerId ?? null) !== (actor.brokerId ?? null)) {
      throw new TradeError('این کاربر متعلق به سازمان شما نیست', 403);
    }
  }
}
