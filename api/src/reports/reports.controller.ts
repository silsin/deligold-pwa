import { Controller, Get, Query, Res } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { ReportsService } from '../accounting/reports.service';
import { buildPdf, buildCsv } from './pdf.builder';

/** All staff roles — broker manager is now allowed to generate reports. */
const STAFF = [Role.BROKER_MANAGER, Role.BROKER_ADMIN, Role.SUPER_ADMIN] as const;

/** A broker id that never matches any real org — keeps unscoped staff safe. */
const NO_BROKER = '__no_broker__';

/**
 * Report generation (گزارش‌گیری).
 *
 * Eight report types, each available as:
 *   - JSON  (no format param)
 *   - CSV   (?format=csv)
 *   - PDF   (?format=pdf)
 *
 * All routes are guarded at `BROKER_MANAGER` and above. A manager only sees
 * their own broker's data; a broker admin the same; a super admin sees all.
 */
@Controller('reports')
@Roles(...STAFF)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  // ── Scoping helpers ────────────────────────────────────────────────────────

  private range(from?: string, to?: string) {
    return {
      from: from ? new Date(`${from}T00:00:00`) : undefined,
      to: to ? new Date(`${to}T23:59:59`) : undefined,
    };
  }

  /** Which broker to scope to — undefined = all (super admin only). */
  private brokerOf(user: AuthUser): string | null | undefined {
    return user.role === Role.SUPER_ADMIN ? undefined : (user.brokerId ?? NO_BROKER);
  }

  /** Deliver data as JSON, CSV attachment, or PDF attachment. */
  private async respond<T extends Record<string, unknown>>(
    res: Response,
    data: T | T[],
    opts: { format?: string; title: string; subtitle?: string; columns?: string[] },
  ) {
    const rows: T[] = Array.isArray(data) ? data : ((data as any).rows ?? [data]);
    const fmt = (opts.format ?? 'json').toLowerCase();

    if (fmt === 'csv') {
      const csv = buildCsv(rows as any, opts.columns);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${slugify(opts.title)}.csv"`);
      return res.send(csv);
    }

    if (fmt === 'pdf') {
      const buf = await buildPdf({ title: opts.title, subtitle: opts.subtitle, rows: rows as any, columns: opts.columns });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${slugify(opts.title)}.pdf"`);
      return res.send(buf);
    }

    // Default: JSON (wrapped in the standard envelope)
    return res.json({ success: true, data });
  }

  // ── 1. Trial balance ────────────────────────────────────────────────────────

  @Get('trial-balance')
  async trialBalance(
    @CurrentUser() user: AuthUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    const data = await this.reports.trialBalance(this.range(from, to), this.brokerOf(user));
    return this.respond(res, data.rows, {
      format, title: 'تراز آزمایشی',
      subtitle: `اختلاف: ${data.difference} — ${data.balanced ? 'متوازن' : 'نامتوازن'}`,
      columns: ['code', 'name', 'type', 'debit', 'credit', 'balance'],
    });
  }

  // ── 2. Trade summary ────────────────────────────────────────────────────────

  @Get('trades')
  async trades(
    @CurrentUser() user: AuthUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('symbol') symbol: string,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    const data = await this.reports.tradeReport(this.range(from, to), { symbol, brokerId: this.brokerOf(user) });
    return this.respond(res, data.rows, {
      format, title: 'گزارش معاملات',
      columns: ['symbol', 'side', 'orderCount', 'totalGrams', 'totalAmount', 'totalFee', 'avgPrice', 'realisedPnl'],
    });
  }

  // ── 3. Order list ────────────────────────────────────────────────────────────

  @Get('orders')
  async orders(
    @CurrentUser() user: AuthUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('symbol') symbol: string,
    @Query('side') side: string,
    @Query('status') status: string,
    @Query('kind') kind: string,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    const rows = await this.reports.orderList(this.range(from, to), {
      symbol, side, status, kind, brokerId: this.brokerOf(user),
    });
    return this.respond(res, rows, {
      format, title: 'لیست سفارشات',
      columns: ['ref', 'symbol', 'side', 'kind', 'status', 'grams', 'price', 'amount', 'fee', 'pnl', 'userName', 'userPhone', 'createdAt'],
    });
  }

  // ── 4. Customer report ────────────────────────────────────────────────────────

  @Get('customers')
  async customers(
    @CurrentUser() user: AuthUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('verified') verified: string,
    @Query('status') status: string,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    const verifiedBool = verified === 'true' ? true : verified === 'false' ? false : undefined;
    const rows = await this.reports.customerReport(this.range(from, to), {
      brokerId: this.brokerOf(user), verified: verifiedBool, status,
    });
    return this.respond(res, rows, {
      format, title: 'گزارش مشتریان',
      columns: ['name', 'phone', 'email', 'nationalId', 'status', 'verified', 'balance', 'realizedPnl', 'orderCount', 'createdAt'],
    });
  }

  // ── 5. Wallet balances ────────────────────────────────────────────────────────

  @Get('wallets')
  async wallets(
    @CurrentUser() user: AuthUser,
    @Query('minBalance') minBalance: string,
    @Query('maxBalance') maxBalance: string,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    const rows = await this.reports.walletReport({
      brokerId: this.brokerOf(user),
      minBalance: minBalance ? Number(minBalance) : undefined,
      maxBalance: maxBalance ? Number(maxBalance) : undefined,
    });
    // Flatten positions into comma-separated text for export.
    const flat = rows.map(r => ({
      ...r,
      positions: r.positions.map(p => `${p.symbol}: ${p.grams}g`).join(' | '),
    }));
    return this.respond(res, flat, {
      format, title: 'گزارش کیف پول‌ها',
      columns: ['userName', 'userPhone', 'balance', 'realizedPnl', 'positions'],
    });
  }

  // ── 6. Deposits ────────────────────────────────────────────────────────────────

  @Get('deposits')
  async deposits(
    @CurrentUser() user: AuthUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('status') status: string,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    const rows = await this.reports.cashMovementReport(this.range(from, to), {
      kind: 'deposit', status, brokerId: this.brokerOf(user),
    });
    return this.respond(res, rows, {
      format, title: 'گزارش واریزها',
      columns: ['ref', 'userName', 'userPhone', 'amount', 'status', 'method', 'note', 'createdAt'],
    });
  }

  // ── 7. Withdrawals ─────────────────────────────────────────────────────────────

  @Get('withdrawals')
  async withdrawals(
    @CurrentUser() user: AuthUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('status') status: string,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    const rows = await this.reports.cashMovementReport(this.range(from, to), {
      kind: 'withdrawal', status, brokerId: this.brokerOf(user),
    });
    return this.respond(res, rows, {
      format, title: 'گزارش برداشت‌ها',
      columns: ['ref', 'userName', 'userPhone', 'amount', 'fee', 'status', 'destination', 'note', 'createdAt'],
    });
  }

  // ── 8. Gold positions ──────────────────────────────────────────────────────────

  @Get('positions')
  async positions(
    @CurrentUser() user: AuthUser,
    @Query('symbol') symbol: string,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    const rows = await this.reports.positionReport({ symbol, brokerId: this.brokerOf(user) });
    return this.respond(res, rows, {
      format, title: 'گزارش موجودی طلا',
      columns: ['userName', 'userPhone', 'symbol', 'grams', 'avgCost', 'value'],
    });
  }

  // ── 9. Ledger entries ──────────────────────────────────────────────────────────

  @Get('ledger')
  async ledger(
    @CurrentUser() user: AuthUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('kind') kind: string,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    const rows = await this.reports.ledgerReport(this.range(from, to), {
      kind, brokerId: this.brokerOf(user),
    });
    return this.respond(res, rows, {
      format, title: 'گزارش دفتر کل',
      columns: ['ref', 'kind', 'memo', 'totalDebit', 'totalCredit', 'userName', 'postedAt'],
    });
  }
}

function slugify(s: string) {
  return s.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\u0600-\u06FF-]/g, '').slice(0, 60);
}
