import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundError } from '../common/errors';
import type { Account, AccountType } from '@prisma/client';

/**
 * Chart of accounts codes.
 *
 * The numbering follows the convention documented in the schema so reports read
 * like a real general ledger: assets 1000–1999, liabilities 2000–2999,
 * equity 3000–3999, revenue 4000–4999, expense 5000–5999.
 *
 * Cash held for customers is an ASSET of the platform (the money is in our bank)
 * and simultaneously a LIABILITY (we owe it back to them) — that pair is what
 * makes «بدهکار/بستانکار» balance on every deposit.
 */
export const ACCOUNTS = {
  /** Platform bank/cash account — where deposited money actually sits. */
  CASH: '1000',
  /** Gold held for customers, split per symbol via `symbol`. */
  GOLD_INVENTORY: '1100',
  /** Gold sitting in a physical store vault. */
  STORE_INVENTORY: '1200',
  /** Money owed back to customers (their wallet balances). */
  CUSTOMER_CASH_PAYABLE: '2000',
  /** Gold owed to customers (their wallet grams). */
  CUSTOMER_GOLD_PAYABLE: '2100',
  /** Withdrawals requested but not yet paid out. */
  WITHDRAWAL_PAYABLE: '2200',
  /** Owner's stake in the platform. */
  PAID_IN_CAPITAL: '3000',
  /** Commission and trading spread earned. */
  TRADING_REVENUE: '4000',
  /** Realised trading profit/loss on customer positions. */
  TRADING_PNL: '4100',
  /** Operating costs (gateway fees, salaries). */
  OPERATING_EXPENSE: '5000',
} as const;

export type AccountCode = (typeof ACCOUNTS)[keyof typeof ACCOUNTS];

/**
 * Resolves an account by code, optionally scoped to a broker or a gold symbol.
 *
 * The unique key is (code, brokerId, symbol), so a platform-wide account
 * (brokerId null, symbol null) and a broker's own copy of the same code never
 * collide — which is exactly what lets a BROKER_ADMIN see a ledger restricted to
 * their own book.
 *
 * Prisma composite-unique lookups cannot match null, so the platform-wide row
 * is located with a find-first rather than the unique where.
 */
@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async find(
    code: AccountCode,
    opts: { brokerId?: string | null; symbol?: string | null } = {},
  ): Promise<Account> {
    const account = await this.prisma.account.findFirst({
      where: {
        code,
        brokerId: opts.brokerId ?? null,
        symbol: opts.symbol ?? null,
      },
    });
    if (!account) {
      throw new NotFoundError(
        `حساب با کد ${code} در دفتر حساب یافت نشد`,
      );
    }
    return account;
  }

  /** Finds by id, for endpoints that take an account directly. */
  async byId(id: string): Promise<Account> {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) throw new NotFoundError('حساب یافت نشد');
    return account;
  }

  /**
   * Creates the default chart for a broker, copying every platform account so a
   * new organisation starts with a complete, balanced book rather than an empty
   * one the admin has to hand-build.
   *
   * A broker row is uniquely keyed by (code, brokerId, symbol) with a real id,
   * so an upsert works; the find-first overlap check keeps a re-run from
   * minting a second copy when one already exists under a different symbol
   * spelling.
   */
  async seedForBroker(brokerId: string, symbols: string[]): Promise<number> {
    const templates: Array<{ code: string; name: string; type: AccountType; perSymbol?: boolean }> = [
      { code: ACCOUNTS.CASH, name: 'نقد و بانک', type: 'ASSET' },
      { code: ACCOUNTS.GOLD_INVENTORY, name: 'طلای مشتریان', type: 'ASSET', perSymbol: true },
      { code: ACCOUNTS.STORE_INVENTORY, name: 'طلای انبار', type: 'ASSET' },
      { code: ACCOUNTS.CUSTOMER_CASH_PAYABLE, name: 'بستانکاران — وجه نقد مشتریان', type: 'LIABILITY' },
      { code: ACCOUNTS.CUSTOMER_GOLD_PAYABLE, name: 'بستانکاران — طلای مشتریان', type: 'LIABILITY' },
      { code: ACCOUNTS.WITHDRAWAL_PAYABLE, name: 'برداشت‌های در انتظار', type: 'LIABILITY' },
      { code: ACCOUNTS.PAID_IN_CAPITAL, name: 'سرمایه', type: 'EQUITY' },
      { code: ACCOUNTS.TRADING_REVENUE, name: 'درآمد کارمزد معاملات', type: 'REVENUE' },
      { code: ACCOUNTS.TRADING_PNL, name: 'سود/زیان معاملات', type: 'REVENUE' },
      { code: ACCOUNTS.OPERATING_EXPENSE, name: 'هزینه‌های عملیاتی', type: 'EXPENSE' },
    ];

    let created = 0;
    for (const t of templates) {
      const keys = t.perSymbol
        ? symbols.map(symbol => ({ code: t.code, name: `${t.name} — ${symbol}`, type: t.type, symbol }))
        : [{ code: t.code, name: t.name, type: t.type, symbol: null as string | null }];

      for (const k of keys) {
        const existing = await this.prisma.account.findFirst({
          where: { code: k.code, brokerId, symbol: k.symbol },
        });
        if (existing) {
          await this.prisma.account.update({
            where: { id: existing.id },
            data: { name: k.name },
          });
        } else {
          await this.prisma.account.create({
            data: {
              code: k.code,
              name: k.name,
              type: k.type,
              brokerId,
              symbol: k.symbol,
            },
          });
        }
        created++;
      }
    }
    return created;
  }
}
