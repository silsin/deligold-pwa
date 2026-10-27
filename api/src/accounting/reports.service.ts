import { Injectable } from '@nestjs/common';
import { AccountType, LedgerKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ACCOUNTS, AccountsService } from './accounts.service';
import { dec, money } from '../common/money';

export interface DateRange {
  from?: Date;
  to?: Date;
}

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  debit: number;
  credit: number;
  net: number;
  balance: number;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
  ) {}

  // ── helpers ──────────────────────────────────────────────────────────────

  private dateFilter(range: DateRange): Prisma.DateTimeFilter | undefined {
    if (!range.from && !range.to) return undefined;
    return { gte: range.from, lte: range.to };
  }

  // ── 1. Trial balance ──────────────────────────────────────────────────────

  async trialBalance(
    range: DateRange = {},
    brokerId?: string | null,
  ): Promise<{
    rows: TrialBalanceRow[];
    totalDebit: number;
    totalCredit: number;
    difference: number;
    balanced: boolean;
  }> {
    const accounts = await this.prisma.account.findMany({
      where: { active: true, brokerId: brokerId ?? null },
      orderBy: { code: 'asc' },
    });

    const sums = await this.prisma.ledgerLine.groupBy({
      by: ['accountId'],
      where: {
        accountId: { in: accounts.map(a => a.id) },
        entry: range.from || range.to ? { postedAt: { gte: range.from, lte: range.to } } : undefined,
      },
      _sum: { debit: true, credit: true },
    });
    const byAccount = new Map(sums.map(s => [s.accountId, s._sum]));

    const rows: TrialBalanceRow[] = accounts.map(a => {
      const sum = byAccount.get(a.id);
      const debit = dec(sum?.debit);
      const credit = dec(sum?.credit);
      const net = money(debit - credit);
      const flip = a.type === AccountType.LIABILITY || a.type === AccountType.EQUITY || a.type === AccountType.REVENUE;
      return { accountId: a.id, code: a.code, name: a.name, type: a.type, debit, credit, net, balance: flip ? -net : net };
    });

    const totalDebit = money(rows.reduce((s, r) => s + r.debit, 0));
    const totalCredit = money(rows.reduce((s, r) => s + r.credit, 0));
    const difference = money(totalDebit - totalCredit);

    return { rows, totalDebit, totalCredit, difference, balanced: difference === 0 };
  }

  // ── 2. Trade report ────────────────────────────────────────────────────────

  async tradeReport(
    range: DateRange = {},
    opts: { symbol?: string; userId?: string; brokerId?: string | null } = {},
  ) {
    const where: Prisma.OrderWhereInput = {
      status: 'FILLED',
      createdAt: this.dateFilter(range),
      symbol: opts.symbol || undefined,
      userId: opts.userId || undefined,
    };
    if (opts.brokerId) where.user = { brokerId: opts.brokerId };

    const grouped = await this.prisma.order.groupBy({
      by: ['symbol', 'side'],
      where,
      _count: { _all: true },
      _sum: { grams: true, amount: true, fee: true, pnl: true },
    });

    const rows = grouped.map(g => {
      const totalGrams = dec(g._sum.grams);
      const totalAmount = dec(g._sum.amount);
      return {
        symbol: g.symbol,
        side: g.side as 'BUY' | 'SELL',
        orderCount: g._count._all,
        totalGrams,
        totalAmount,
        totalFee: money(dec(g._sum.fee)),
        avgPrice: totalGrams > 0 ? money(totalAmount / totalGrams) : 0,
        realisedPnl: money(dec(g._sum.pnl)),
      };
    });
    rows.sort((a, b) => a.symbol.localeCompare(b.symbol) || a.side.localeCompare(b.side));

    return {
      rows,
      totals: {
        orders: rows.reduce((s, r) => s + r.orderCount, 0),
        grams: Number(rows.reduce((s, r) => s + r.totalGrams, 0).toFixed(6)),
        amount: money(rows.reduce((s, r) => s + r.totalAmount, 0)),
        fee: money(rows.reduce((s, r) => s + r.totalFee, 0)),
        pnl: money(rows.reduce((s, r) => s + r.realisedPnl, 0)),
      },
    };
  }

  // ── 3. Order list ─────────────────────────────────────────────────────────

  async orderList(
    range: DateRange = {},
    opts: {
      symbol?: string;
      side?: string;
      status?: string;
      kind?: string;
      userId?: string;
      brokerId?: string | null;
      limit?: number;
    } = {},
  ) {
    const where: Prisma.OrderWhereInput = {
      createdAt: this.dateFilter(range),
      symbol: opts.symbol || undefined,
      side: (opts.side as any) || undefined,
      status: (opts.status as any) || undefined,
      kind: (opts.kind as any) || undefined,
      userId: opts.userId || undefined,
    };
    if (opts.brokerId) where.user = { brokerId: opts.brokerId };

    const rows = await this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(opts.limit ?? 500, 5000),
      include: { user: { select: { name: true, phone: true, brokerId: true } } },
    });

    return rows.map(o => ({
      ref: o.ref,
      symbol: o.symbol,
      side: o.side,
      kind: o.kind,
      status: o.status,
      grams: Number(o.grams),
      price: money(dec(o.price)),
      amount: money(dec(o.amount)),
      fee: money(dec(o.fee)),
      pnl: o.pnl == null ? null : money(dec(o.pnl)),
      userName: o.user?.name ?? '',
      userPhone: o.user?.phone ?? '',
      createdAt: o.createdAt,
    }));
  }

  // ── 4. Customer report ────────────────────────────────────────────────────

  async customerReport(
    range: DateRange = {},
    opts: { brokerId?: string | null; verified?: boolean; status?: string } = {},
  ) {
    const where: Prisma.UserWhereInput = {
      role: 'CUSTOMER',
      createdAt: this.dateFilter(range),
      brokerId: opts.brokerId || undefined,
      verifiedAt: opts.verified === true ? { not: null } : opts.verified === false ? null : undefined,
      status: (opts.status as any) || undefined,
    };

    const rows = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        wallet: { select: { balance: true, realizedPnl: true } },
        _count: { select: { orders: true } },
      },
    });

    return rows.map(u => ({
      name: u.name,
      phone: u.phone ?? '',
      email: u.email ?? '',
      nationalId: u.nationalId ?? '',
      status: u.status,
      verified: u.verifiedAt != null,
      balance: money(dec(u.wallet?.balance)),
      realizedPnl: money(dec(u.wallet?.realizedPnl)),
      orderCount: u._count.orders,
      createdAt: u.createdAt,
    }));
  }

  // ── 5. Wallet / balance report ────────────────────────────────────────────

  async walletReport(opts: { brokerId?: string | null; minBalance?: number; maxBalance?: number } = {}) {
    const where: Prisma.WalletWhereInput = {};
    if (opts.brokerId) where.user = { brokerId: opts.brokerId };
    if (opts.minBalance != null) where.balance = { gte: opts.minBalance };
    if (opts.maxBalance != null) {
      where.balance = { ...(where.balance as any), lte: opts.maxBalance };
    }

    const rows = await this.prisma.wallet.findMany({
      where,
      orderBy: { balance: 'desc' },
      include: {
        user: { select: { name: true, phone: true, brokerId: true } },
        positions: { select: { symbol: true, grams: true, avgCost: true } },
      },
    });

    return rows.map(w => ({
      userName: w.user?.name ?? '',
      userPhone: w.user?.phone ?? '',
      balance: money(dec(w.balance)),
      realizedPnl: money(dec(w.realizedPnl)),
      positions: w.positions.map(p => ({
        symbol: p.symbol,
        grams: Number(p.grams),
        avgCost: money(dec(p.avgCost)),
      })),
    }));
  }

  // ── 6. Deposit / withdrawal report ────────────────────────────────────────

  async cashMovementReport(
    range: DateRange = {},
    opts: {
      kind: 'deposit' | 'withdrawal';
      status?: string;
      brokerId?: string | null;
    },
  ) {
    if (opts.kind === 'deposit') {
      const where: Prisma.DepositWhereInput = {
        createdAt: this.dateFilter(range),
        status: (opts.status as any) || undefined,
      };
      if (opts.brokerId) where.wallet = { user: { brokerId: opts.brokerId } };

      const rows = await this.prisma.deposit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { wallet: { include: { user: { select: { name: true, phone: true } } } } },
      });

      return rows.map(d => ({
        ref: d.ref,
        kind: 'واریز',
        userName: d.wallet?.user?.name ?? '',
        userPhone: d.wallet?.user?.phone ?? '',
        amount: money(dec(d.amount)),
        status: d.status,
        method: d.method,
        note: d.note ?? '',
        createdAt: d.createdAt,
      }));
    }

    // withdrawal
    const where: Prisma.WithdrawalWhereInput = {
      createdAt: this.dateFilter(range),
      status: (opts.status as any) || undefined,
    };
    if (opts.brokerId) where.wallet = { user: { brokerId: opts.brokerId } };

    const rows = await this.prisma.withdrawal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { wallet: { include: { user: { select: { name: true, phone: true } } } } },
    });

    return rows.map(w => ({
      ref: w.ref,
      kind: 'برداشت',
      userName: w.wallet?.user?.name ?? '',
      userPhone: w.wallet?.user?.phone ?? '',
      amount: money(dec(w.amount)),
      fee: money(dec(w.fee)),
      status: w.status,
      destination: w.destination ?? '',
      note: w.note ?? '',
      createdAt: w.createdAt,
    }));
  }

  // ── 7. Position / gold holdings report ────────────────────────────────────

  async positionReport(opts: { symbol?: string; brokerId?: string | null } = {}) {
    const where: Prisma.PositionWhereInput = {
      grams: { gt: 0 },
      symbol: opts.symbol || undefined,
    };
    if (opts.brokerId) where.wallet = { user: { brokerId: opts.brokerId } };

    const rows = await this.prisma.position.findMany({
      where,
      orderBy: [{ symbol: 'asc' }, { grams: 'desc' }],
      include: { wallet: { include: { user: { select: { name: true, phone: true } } } } },
    });

    return rows.map(p => ({
      userName: p.wallet?.user?.name ?? '',
      userPhone: p.wallet?.user?.phone ?? '',
      symbol: p.symbol,
      grams: Number(p.grams),
      avgCost: money(dec(p.avgCost)),
      value: money(Number(p.grams) * dec(p.avgCost)),
    }));
  }

  // ── 8. Ledger entries ────────────────────────────────────────────────────

  async ledgerReport(
    range: DateRange = {},
    opts: { kind?: string; brokerId?: string | null; limit?: number } = {},
  ) {
    const where: Prisma.LedgerEntryWhereInput = {
      postedAt: this.dateFilter(range),
      kind: (opts.kind as any) || undefined,
    };
    if (opts.brokerId) where.wallet = { user: { brokerId: opts.brokerId } };

    const rows = await this.prisma.ledgerEntry.findMany({
      where,
      orderBy: { postedAt: 'desc' },
      take: Math.min(opts.limit ?? 500, 5000),
      include: { user: { select: { name: true } } },
    });

    return rows.map(e => ({
      ref: e.ref,
      kind: e.kind,
      memo: e.memo,
      totalDebit: money(dec(e.totalDebit)),
      totalCredit: money(dec(e.totalCredit)),
      userName: e.user?.name ?? '',
      postedAt: e.postedAt,
    }));
  }
}
