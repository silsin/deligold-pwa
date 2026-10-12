import { Injectable } from '@nestjs/common';
import { AccountType, LedgerKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ACCOUNTS, AccountsService } from './accounts.service';
import { dec, money } from '../common/money';

/**
 * Reporting (گزارش‌گیری).
 *
 * Every report here is a *view over the ledger*, never a recomputation of
 * application state. That is the point of double-entry: the books are the
 * record, so a report is a SELECT, and if a report and a wallet ever disagree
 * the discrepancy is a bug in a posting — not a rounding argument.
 *
 * All report queries are broker-scoped through the accounts themselves: a
 * BROKER_ADMIN's book is a set of accounts with `brokerId` set, so restricting
 * `accountId IN (…)` restricts the whole report at once.
 */

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
  /** Debit − credit. Assets/expenses are naturally debit-positive. */
  net: number;
  /** Closing balance, signed the way the account type is normally read. */
  balance: number;
}

/**
 * The trial balance — the report that proves the books balance at all.
 *
 * Σ(debit − credit) must be zero across every account. If it is not, a posting
 * is broken and no other report on this system can be trusted, which is why it
 * is the first thing an accountant asks for.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
  ) {}

  async trialBalance(
    range: DateRange = {},
    brokerId?: string | null,
  ): Promise<{
    rows: TrialBalanceRow[];
    totalDebit: number;
    totalCredit: number;
    /** Σ(debit − credit). Must be 0. */
    difference: number;
    balanced: boolean;
  }> {
    const accounts = await this.prisma.account.findMany({
      where: {
        active: true,
        // A broker's ledger is their own accounts; the platform's are brokerId null.
        brokerId: brokerId ?? null,
      },
      orderBy: { code: 'asc' },
    });

    // One grouped query for every account, rather than one query per account —
    // the balance table is small but the line table is not.
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

      // Assets and expenses grow on the debit side; the other three types are
      // the reverse. Presenting them in their natural sign is what makes the
      // report readable to an accountant.
      const flip = a.type === AccountType.LIABILITY || a.type === AccountType.EQUITY ||
        a.type === AccountType.REVENUE;
      return {
        accountId: a.id,
        code: a.code,
        name: a.name,
        type: a.type,
        debit,
        credit,
        net,
        balance: flip ? -net : net,
      };
    });

    const totalDebit = money(rows.reduce((s, r) => s + r.debit, 0));
    const totalCredit = money(rows.reduce((s, r) => s + r.credit, 0));
    const difference = money(totalDebit - totalCredit);

    return { rows, totalDebit, totalCredit, difference, balanced: difference === 0 };
  }

  /**
   * Buy/sell report (خرید و فروش) — volume, value and commission per symbol.
   *
   * Answers "how much gold did we buy from and sell to customers, at what
   * average price" — the trading desk's daily close.
   */
  async tradeReport(
    range: DateRange = {},
    opts: { symbol?: string; userId?: string } = {},
  ): Promise<{
    rows: Array<{
      symbol: string;
      side: 'BUY' | 'SELL';
      orderCount: number;
      totalGrams: number;
      totalAmount: number;
      totalFee: number;
      /// Weighted-average execution price across the orders.
      avgPrice: number;
      realisedPnl: number;
    }>;
    totals: { orders: number; grams: number; amount: number; fee: number; pnl: number };
  }> {
    const where: Prisma.OrderWhereInput = {
      status: 'FILLED',
      createdAt: range.from || range.to ? { gte: range.from, lte: range.to } : undefined,
      symbol: opts.symbol,
      userId: opts.userId,
    };

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
        // Amount/grams rather than averaging the per-order prices, so a large
        // order is not outweighed by a small one.
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
}
