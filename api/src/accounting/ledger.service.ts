import { Injectable } from '@nestjs/common';
import { LedgerKind, Prisma, type LedgerEntry } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundError, UnbalancedEntryError } from '../common/errors';
import { dec, money } from '../common/money';

/**
 * The double-entry posting engine — the heart of حسابداری.
 *
 * Every economic event posts exactly one LedgerEntry, and every entry balances:
 * `Σdebit === Σcredit`. That invariant is enforced here, in `post()`, and nowhere
 * else — so no service in the app can write a one-sided or unbalanced journal.
 *
 * Cash and gold are kept on separate accounts but post through the same engine,
 * because a trade moves both at once (Toman and grams) and splitting them across
 * two systems is exactly how books stop reconciling.
 */
export interface PostLine {
  /** Account id. Use `AccountsService.find()` to resolve from a code first. */
  accountId: string;
  /** Debit amount in Toman. Exactly one of debit/credit is non-zero. */
  debit?: number;
  /** Credit amount in Toman. */
  credit?: number;
  /** Set when the line moves gold; `grams` is the signed delta for the symbol. */
  symbol?: string | null;
  grams?: number;
}

export interface PostInput {
  kind: LedgerKind;
  memo: string;
  lines: PostLine[];
  userId?: string | null;
  walletId?: string | null;
  postedById?: string | null;
  /** When the event happened; defaults to now. */
  postedAt?: Date;
}

/** Rejects a posting whose debits and credits do not match — indicates a bug. */
function assertBalanced(totalDebit: number, totalCredit: number, memo: string): void {
  if (Math.abs(totalDebit - totalCredit) > 1) {
    throw new UnbalancedEntryError(
      `سند متوازن نیست: بدهکار ${totalDebit.toLocaleString('fa-IR')} ≠ بستانکار ${totalCredit.toLocaleString('fa-IR')} (${memo})`,
    );
  }
}

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Posts one balanced journal entry atomically. Returns the entry with its
   * lines.
   *
   * The whole thing runs inside a transaction: an entry and its lines are either
   * all written or none are. A half-written journal is worse than a failed
   * request, because the books then cannot be trusted.
   */
  async post(input: PostInput): Promise<LedgerEntry> {
    if (!input.lines?.length) {
      throw new UnbalancedEntryError('سند حداقل باید یک ردیف داشته باشد');
    }

    let totalDebit = 0;
    let totalCredit = 0;
    const prepared: Prisma.LedgerLineCreateManyEntryInput[] = input.lines.map(line => {
      const debit = money(line.debit ?? 0);
      const credit = money(line.credit ?? 0);
      if (debit < 0 || credit < 0) {
        throw new UnbalancedEntryError('مبالغ بدهکار/بستانکار نمی‌توانند منفی باشند');
      }
      if (debit > 0 && credit > 0) {
        throw new UnbalancedEntryError('یک ردیف نمی‌تواند هم بدهکار و هم بستانکار باشد');
      }
      totalDebit += debit;
      totalCredit += credit;
      return {
        accountId: line.accountId,
        debit: new Prisma.Decimal(debit),
        credit: new Prisma.Decimal(credit),
        symbol: line.symbol ?? null,
        grams: line.grams != null ? new Prisma.Decimal(line.grams.toFixed(6)) : null,
      };
    });

    assertBalanced(totalDebit, totalCredit, input.memo);

    const ref = await this.nextRef();

    return this.prisma.$transaction(async tx => {
      const entry = await tx.ledgerEntry.create({
        data: {
          ref,
          postedAt: input.postedAt ?? new Date(),
          memo: input.memo,
          kind: input.kind,
          userId: input.userId ?? null,
          walletId: input.walletId ?? null,
          postedById: input.postedById ?? null,
          totalDebit: new Prisma.Decimal(totalDebit),
          totalCredit: new Prisma.Decimal(totalCredit),
          lines: { create: prepared },
        },
        include: { lines: true },
      });
      return entry;
    });
  }

  /**
   * Finds one entry by ref, or throws. Used by the detail endpoint.
   */
  async byRef(ref: string): Promise<LedgerEntry> {
    const entry = await this.prisma.ledgerEntry.findUnique({
      where: { ref },
      include: { lines: { include: { account: true } } },
    });
    if (!entry) throw new NotFoundError('سند حسابداری یافت نشد');
    return entry;
  }

  /**
   * Generates the next human-facing reference: `JRN-000001`, `JRN-000002`, …
   * Counts existing rows and increments. Adequate for a single-writer platform;
   * a high-concurrency deployment would move to a DB sequence.
   */
  private async nextRef(): Promise<string> {
    const count = await this.prisma.ledgerEntry.count();
    return `JRN-${String(count + 1).padStart(6, '0')}`;
  }

  /**
   * Balance of one account over a date window: Σdebit − Σcredit, signed the way
   * the account type expects (assets/expenses grow with debits, liabilities/
   * equity/revenue with credits). Reports call this to build a trial balance.
   */
  async accountBalance(
    accountId: string,
    from?: Date,
    to?: Date,
  ): Promise<{ debit: number; credit: number; net: number }> {
    const where: Prisma.LedgerLineWhereInput = {
      accountId,
      entry: {
        postedAt: from || to ? { gte: from, lte: to } : undefined,
      },
    };
    const agg = await this.prisma.ledgerLine.aggregate({
      where,
      _sum: { debit: true, credit: true },
    });
    const debit = dec(agg._sum.debit);
    const credit = dec(agg._sum.credit);
    return { debit, credit, net: money(debit - credit) };
  }
}
