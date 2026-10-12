import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { ReportsService } from '../accounting/reports.service';

/** Staff roles allowed to see the books. */
const STAFF = [Role.BROKER_MANAGER, Role.BROKER_ADMIN, Role.SUPER_ADMIN] as const;

/**
 * Accounting reports (گزارش‌گیری).
 *
 * Every report is a view over the double-entry ledger, never a recomputation
 * of application state — that is the point of the books. The trial balance
 * must come out at zero difference before any other number can be trusted.
 */
@Controller('reports')
@Roles(...STAFF)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** Dates arrive as `YYYY-MM-DD`; everything else passes through untouched. */
  private range(from?: string, to?: string) {
    return {
      from: from ? new Date(`${from}T00:00:00`) : undefined,
      to: to ? new Date(`${to}T23:59:59`) : undefined,
    };
  }

  /** Which broker's books to read — yours, unless you run the platform. */
  private brokerOf(user: AuthUser): string | null | undefined {
    return user.role === Role.SUPER_ADMIN ? undefined : (user.brokerId ?? NO_BROKER);
  }

  /**
   * The trial balance — debits and credits per account, which must net to zero.
   * The first thing an accountant asks for, because a broken trial balance
   * means no other report is trustworthy.
   */
  @Get('trial-balance')
  trialBalance(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.trialBalance(this.range(from, to), this.brokerOf(user));
  }

  /**
   * Buy/sell report (خرید و فروش) — volume, value and commission per symbol,
   * with a weighted-average fill price.
   */
  @Get('trades')
  trades(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('symbol') symbol?: string,
  ) {
    return this.reports.tradeReport(this.range(from, to), { symbol });
  }
}

/**
 * A broker id that matches no real organisation, so an unscoped staff account
 * sees an empty book instead of the whole platform's. Same sentinel the
 * trading service uses, kept local because the two modules do not share code.
 */
const NO_BROKER = '__no_broker__';
