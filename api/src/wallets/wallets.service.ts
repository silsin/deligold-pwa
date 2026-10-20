import { Injectable } from '@nestjs/common';
import { DepositStatus, Prisma, WithdrawalStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountsService, ACCOUNTS } from '../accounting/accounts.service';
import { LedgerService } from '../accounting/ledger.service';
import { PushService } from '../push/push.service';
import { TradeError } from '../common/errors';
import { dec, money } from '../common/money';

/**
 * Deposits and withdrawals — the cash side of the wallet.
 *
 * Neither credits a balance directly. A deposit becomes money the platform
 * *owes* the customer only once staff confirm it arrived, and a withdrawal
 * takes the money out of their spendable balance the moment they ask, leaving a
 * payable until staff actually send it. That split is what stops a customer
 * spending the same deposit twice by racing two requests.
 *
 * Limits are deliberately conservative while no payment gateway is wired.
 */
const MAX_DEPOSIT = 500_000_000;
const MIN_WITHDRAWAL = 100_000;
const MAX_WITHDRAWAL = 500_000_000;
/** Percentage charged on a withdrawal, covering the transfer fee. */
const WITHDRAW_FEE_PERCENT = 0.1;

export interface CashMoveView {
  id: string;
  ref: string;
  amount: number;
  fee: number;
  status: DepositStatus | WithdrawalStatus;
  method?: string;
  destination?: string | null;
  note: string | null;
  createdAt: Date;
}

@Injectable()
export class WalletsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
    private readonly ledger: LedgerService,
    private readonly push: PushService,
  ) {}

  // ── Deposits ──────────────────────────────────────────────────────────────

  /**
   * Requests a deposit.
   *
   * The money has not arrived yet — this only records the intent, so the row
   * starts PENDING and the balance is untouched until staff approve it.
   */
  async requestDeposit(
    userId: string,
    input: { amount: number; method?: string; reference?: string; note?: string },
  ): Promise<CashMoveView> {
    const amount = money(Number(input.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new TradeError('مبلغ واریز نامعتبر است');
    }
    if (amount > MAX_DEPOSIT) {
      throw new TradeError('حداکثر مبلغ هر واریز ۵۰۰ میلیون تومان است');
    }

    const wallet = await this.ensureWallet(userId);
    const count = await this.prisma.deposit.count();
    const ref = `DEP-${String(count + 1).padStart(6, '0')}`;

    const row = await this.prisma.deposit.create({
      data: {
        ref,
        walletId: wallet.id,
        amount: new Prisma.Decimal(String(amount)),
        method: (input.method ?? 'BANK_TRANSFER').trim(),
        reference: input.reference?.trim() || null,
        note: input.note?.trim() || null,
        status: 'PENDING',
      },
    });

    const depUser = await this.prisma.user.findUnique({ where: { id: userId }, select: { brokerId: true } });
    this.push.notify({ type: 'NEW_DEPOSIT', userId, brokerId: depUser?.brokerId ?? '', ref, amount });

    return this.depositView(row);
  }

  /**
   * Approves a pending deposit, crediting the customer's balance.
   *
   * The ledger records the cash arriving and the matching liability to the
   * customer, so «بستانکار» and «بدهکار» balance on every deposit.
   * Scoped to the actor's broker.
   */
  async approveDeposit(actor: { role: string; brokerId: string | null }, depositId: string): Promise<CashMoveView> {
    const deposit = await this.prisma.deposit.findUnique({
      where: { id: depositId },
      include: { wallet: { include: { user: { select: { id: true, brokerId: true } } } } },
    });
    if (!deposit) throw new TradeError('واریز یافت نشد', 404);
    if (deposit.status !== 'PENDING') {
      throw new TradeError('فقط واریزهای در انتظار قابل تأیید هستند');
    }

    // Check same broker
    if (actor.role !== 'SUPER_ADMIN') {
      if (
        (deposit.wallet.user.brokerId ?? null) !==
        (actor.brokerId ?? null)
      ) {
        throw new TradeError('این واریز متعلق به مشتری سازمان شما نیست', 403);
      }
    }

    const amount = money(dec(deposit.amount));

    const updated = await this.prisma.$transaction(async tx => {
      await tx.wallet.update({
        where: { id: deposit.walletId },
        data: { balance: { increment: amount } },
      });
      return tx.deposit.update({
        where: { id: depositId },
        data: { status: 'APPROVED', approvedById: actor.role, approvedAt: new Date() },
      });
    });

    const cash = await this.accounts.find(ACCOUNTS.CASH);
    const owed = await this.accounts.find(ACCOUNTS.CUSTOMER_CASH_PAYABLE);
    await this.ledger.post({
      kind: 'DEPOSIT',
      walletId: deposit.walletId,
      memo: `واریز ${deposit.ref}`,
      lines: [
        { accountId: cash.id, debit: amount },
        { accountId: owed.id, credit: amount },
      ],
    });

    this.push.notify({ type: 'DEPOSIT_DECISION', userId: deposit.wallet.user.id, ref: deposit.ref, approved: true });
    return this.depositView(updated);
  }

  /** Rejects a pending deposit — the money never reached the platform. */
  async rejectDeposit(actor: { role: string; brokerId: string | null }, depositId: string, note?: string): Promise<CashMoveView> {
    const deposit = await this.prisma.deposit.findUnique({
      where: { id: depositId },
      include: { wallet: { include: { user: { select: { id: true, brokerId: true } } } } },
    });
    if (!deposit) throw new TradeError('واریز یافت نشد', 404);
    if (deposit.status !== 'PENDING') {
      throw new TradeError('فقط واریزهای در انتظار قابل رد هستند');
    }

    // Check same broker
    if (actor.role !== 'SUPER_ADMIN') {
      if (
        (deposit.wallet.user.brokerId ?? null) !==
        (actor.brokerId ?? null)
      ) {
        throw new TradeError('این واریز متعلق به مشتری سازمان شما نیست', 403);
      }
    }

    const updated = await this.prisma.deposit.update({
      where: { id: depositId },
      data: { status: 'REJECTED', note: note?.trim() || deposit.note },
    });
    this.push.notify({ type: 'DEPOSIT_DECISION', userId: deposit.wallet.user.id, ref: deposit.ref, approved: false });
    return this.depositView(updated);
  }

  /** The caller's own deposits, newest first. */
  async myDeposits(userId: string): Promise<CashMoveView[]> {
    const wallet = await this.ensureWallet(userId);
    const rows = await this.prisma.deposit.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map(r => this.depositView(r));
  }

  // ── Withdrawals ───────────────────────────────────────────────────────────

  /**
   * Requests a withdrawal.
   *
   * The money leaves the spendable balance immediately and becomes a payable,
   * so a customer cannot withdraw the same balance twice by firing two requests
   * before staff get to the first one. The fee is charged on the way out.
   */
  async requestWithdrawal(
    userId: string,
    input: { amount: number; destination?: string; note?: string },
  ): Promise<CashMoveView> {
    const gross = money(Number(input.amount));
    if (!Number.isFinite(gross) || gross <= 0) throw new TradeError('مبلغ برداشت نامعتبر است');
    if (gross < MIN_WITHDRAWAL) throw new TradeError('حداقل مبلغ برداشت ۱۰۰٬۰۰۰ تومان است');
    if (gross > MAX_WITHDRAWAL) throw new TradeError('حداکثر مبلغ هر برداشت ۵۰۰ میلیون تومان است');

    const destination = (input.destination ?? '').trim();
    if (!destination) throw new TradeError('شماره حساب مقصد الزامی است');

    const fee = money((gross * WITHDRAW_FEE_PERCENT) / 100);
    const net = money(gross - fee);
    const wallet = await this.ensureWallet(userId);

    const count = await this.prisma.withdrawal.count();
    const ref = `WDR-${String(count + 1).padStart(6, '0')}`;

    const row = await this.prisma.$transaction(async tx => {
      // Decrement and check inside the transaction, so two concurrent requests
      // cannot both pass an outer balance check and overdraw the wallet.
      const fresh = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: gross } },
      });
      if (dec(fresh.balance) < 0) {
        throw new TradeError('موجودی کیف پول کافی نیست');
      }

      return tx.withdrawal.create({
        data: {
          ref,
          walletId: wallet.id,
          amount: new Prisma.Decimal(String(net)),
          fee: new Prisma.Decimal(String(fee)),
          destination,
          note: input.note?.trim() || null,
          status: 'PENDING',
        },
      });
    });

    const owed = await this.accounts.find(ACCOUNTS.CUSTOMER_CASH_PAYABLE);
    const pending = await this.accounts.find(ACCOUNTS.WITHDRAWAL_PAYABLE);
    await this.ledger.post({
      kind: 'WITHDRAWAL',
      walletId: wallet.id,
      memo: `برداشت ${ref}`,
      lines: [
        { accountId: owed.id, debit: gross },
        { accountId: pending.id, credit: net },
      ],
    });

    const wdrUser = await this.prisma.user.findUnique({ where: { id: userId }, select: { brokerId: true } });
    this.push.notify({ type: 'NEW_WITHDRAWAL', userId, brokerId: wdrUser?.brokerId ?? '', ref, amount: gross });

    return this.withdrawalView(row);
  }

  /** Marks a withdrawal as paid out, clearing the payable (scoped by broker). */
  async approveWithdrawal(actor: { role: string; brokerId: string | null }, withdrawalId: string): Promise<CashMoveView> {
    const w = await this.prisma.withdrawal.findUnique({
      where: { id: withdrawalId },
      include: { wallet: { include: { user: { select: { id: true, brokerId: true } } } } },
    });
    if (!w) throw new TradeError('برداشت یافت نشد', 404);
    if (w.status !== 'PENDING') {
      throw new TradeError('فقط برداشت‌های در انتظار قابل تأیید هستند');
    }

    // Check same broker
    if (actor.role !== 'SUPER_ADMIN') {
      if (
        (w.wallet.user.brokerId ?? null) !==
        (actor.brokerId ?? null)
      ) {
        throw new TradeError('این برداشت متعلق به مشتری سازمان شما نیست', 403);
      }
    }

    const updated = await this.prisma.withdrawal.update({
      where: { id: withdrawalId },
      data: { status: 'APPROVED', approvedById: actor.role, approvedAt: new Date() },
    });

    const cash = await this.accounts.find(ACCOUNTS.CASH);
    const pending = await this.accounts.find(ACCOUNTS.WITHDRAWAL_PAYABLE);
    const net = money(dec(w.amount));
    await this.ledger.post({
      kind: 'WITHDRAWAL',
      walletId: w.walletId,
      memo: `پرداخت برداشت ${w.ref}`,
      lines: [
        { accountId: pending.id, debit: net },
        { accountId: cash.id, credit: net },
      ],
    });

    this.push.notify({ type: 'WITHDRAWAL_DECISION', userId: w.wallet.user.id, ref: w.ref, approved: true });
    return this.withdrawalView(updated);
  }

  /**
   * Refuses a withdrawal and returns the money to the customer's balance
   * (scoped by broker).
   *
   * The refund matters: the balance was taken at request time, so rejecting
   * without crediting it back would silently destroy the customer's money.
   */
  async rejectWithdrawal(actor: { role: string; brokerId: string | null }, withdrawalId: string, note?: string): Promise<CashMoveView> {
    const w = await this.prisma.withdrawal.findUnique({
      where: { id: withdrawalId },
      include: { wallet: { include: { user: { select: { id: true, brokerId: true } } } } },
    });
    if (!w) throw new TradeError('برداشت یافت نشد', 404);
    if (w.status !== 'PENDING') {
      throw new TradeError('فقط برداشت‌های در انتظار قابل رد هستند');
    }

    // Check same broker
    if (actor.role !== 'SUPER_ADMIN') {
      if (
        (w.wallet.user.brokerId ?? null) !==
        (actor.brokerId ?? null)
      ) {
        throw new TradeError('این برداشت متعلق به مشتری سازمان شما نیست', 403);
      }
    }

    const gross = money(dec(w.amount) + dec(w.fee));

    const updated = await this.prisma.$transaction(async tx => {
      await tx.wallet.update({
        where: { id: w.walletId },
        data: { balance: { increment: gross } },
      });
      return tx.withdrawal.update({
        where: { id: withdrawalId },
        data: { status: 'REJECTED', note: note?.trim() || w.note },
      });
    });

    const owed = await this.accounts.find(ACCOUNTS.CUSTOMER_CASH_PAYABLE);
    const pending = await this.accounts.find(ACCOUNTS.WITHDRAWAL_PAYABLE);
    await this.ledger.post({
      kind: 'ADJUSTMENT',
      walletId: w.walletId,
      memo: `استرداد برداشت ${w.ref}`,
      lines: [
        { accountId: pending.id, debit: dec(w.amount) },
        { accountId: owed.id, credit: gross },
      ],
    });

    this.push.notify({ type: 'WITHDRAWAL_DECISION', userId: w.wallet.user.id, ref: w.ref, approved: false });
    return this.withdrawalView(updated);
  }

  /** The caller's own withdrawals, newest first. */
  async myWithdrawals(userId: string): Promise<CashMoveView[]> {
    const wallet = await this.ensureWallet(userId);
    const rows = await this.prisma.withdrawal.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map(r => this.withdrawalView(r));
  }

  /** Staff: every pending cash movement, for the approval screens (scoped by broker). */
  async pending(actor: { role: string; brokerId: string | null }): Promise<{ deposits: CashMoveView[]; withdrawals: CashMoveView[] }> {
    const scope =
      actor.role === 'SUPER_ADMIN'
        ? {}
        : { wallet: { user: { brokerId: actor.brokerId ?? '__no_broker__' } } };

    const [deposits, withdrawals] = await Promise.all([
      this.prisma.deposit.findMany({
        where: { status: 'PENDING', ...scope },
        include: {
          wallet: {
            include: {
              user: { select: { id: true, name: true, phone: true } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
        take: 200,
      }),
      this.prisma.withdrawal.findMany({
        where: { status: 'PENDING', ...scope },
        include: {
          wallet: {
            include: {
              user: { select: { id: true, name: true, phone: true } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
        take: 200,
      }),
    ]);

    return {
      deposits: deposits.map(d => this.depositView(d)),
      withdrawals: withdrawals.map(w => this.withdrawalView(w)),
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async ensureWallet(userId: string) {
    return this.prisma.wallet.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  private depositView(d: {
    id: string; ref: string; amount: unknown; status: DepositStatus;
    method: string; note: string | null; createdAt: Date;
  }): CashMoveView {
    return {
      id: d.id,
      ref: d.ref,
      amount: money(dec(d.amount)),
      fee: 0,
      status: d.status,
      method: d.method,
      note: d.note,
      createdAt: d.createdAt,
    };
  }

  private withdrawalView(w: {
    id: string; ref: string; amount: unknown; fee: unknown;
    status: WithdrawalStatus; destination: string | null; note: string | null; createdAt: Date;
  }): CashMoveView {
    return {
      id: w.id,
      ref: w.ref,
      amount: money(dec(w.amount)),
      fee: money(dec(w.fee)),
      status: w.status,
      destination: w.destination,
      note: w.note,
      createdAt: w.createdAt,
    };
  }
}


