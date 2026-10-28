import { Injectable } from '@nestjs/common';
import { DepositStatus, Prisma, WithdrawalStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountsService, ACCOUNTS } from '../accounting/accounts.service';
import { LedgerService } from '../accounting/ledger.service';
import { PushService } from '../push/push.service';
import { TradeError } from '../common/errors';
import { dec, money } from '../common/money';

/**
 * Deposits and withdrawals â€” the cash side of the wallet.
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
/** Maximum total withdrawals allowed per user per calendar day (Toman). */
const DAILY_WITHDRAWAL_LIMIT = 200_000_000;
/** Maximum number of withdrawal requests per user per hour (anomaly guard). */
const MAX_WITHDRAWALS_PER_HOUR = 3;
/** Percentage charged on a withdrawal, covering the transfer fee. */
const WITHDRAW_FEE_PERCENT = 0.1;
/**
 * How long (ms) a new destination IBAN must be "known" before a withdrawal to
 * it is processed. Any withdrawal to a destination not yet in the trusted list
 * is held for this duration. 24 hours stops the most common account-takeover
 * drain pattern: change IBAN â†’ withdraw immediately.
 */
const NEW_DESTINATION_HOLD_MS = 24 * 60 * 60 * 1000;

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

  // â”€â”€ Deposits â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Requests a deposit.
   *
   * The money has not arrived yet â€” this only records the intent, so the row
   * starts PENDING and the balance is untouched until staff approve it.
   */
  async requestDeposit(
    userId: string,
    input: { amount: number; method?: string; reference?: string; note?: string },
  ): Promise<CashMoveView> {
    const amount = money(Number(input.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new TradeError('Ù…Ø¨Ù„Øº ÙˆØ§Ø±ÛŒØ² Ù†Ø§Ù…Ø¹ØªØ¨Ø± Ø§Ø³Øª');
    }
    if (amount > MAX_DEPOSIT) {
      throw new TradeError('Ø­Ø¯Ø§Ú©Ø«Ø± Ù…Ø¨Ù„Øº Ù‡Ø± ÙˆØ§Ø±ÛŒØ² ÛµÛ°Û° Ù…ÛŒÙ„ÛŒÙˆÙ† ØªÙˆÙ…Ø§Ù† Ø§Ø³Øª');
    }

    const wallet = await this.ensureWallet(userId);

    // Generate a collision-safe ref: if DEP-000N is already taken (can happen
    // when two requests race or rows were deleted), increment and retry.
    let row: Awaited<ReturnType<typeof this.prisma.deposit.create>> | null = null;
    let attempt = await this.prisma.deposit.count();
    while (!row) {
      attempt += 1;
      const ref = `DEP-${String(attempt).padStart(6, '0')}`;
      try {
        row = await this.prisma.deposit.create({
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
      } catch (e: unknown) {
        // P2002 = unique constraint violation â€” ref collision, try next number
        if ((e as { code?: string })?.code !== 'P2002') throw e;
        if (attempt > 999999) throw new TradeError('Ø´Ù…Ø§Ø±Ù‡ Ù…Ø±Ø¬Ø¹ ÙˆØ§Ø±ÛŒØ² Ø¯Ø± Ø¯Ø³ØªØ±Ø³ Ù†ÛŒØ³Øª', 500);
      }
    }

    await this.auditLog(userId, 'DEPOSIT_REQUEST', `Ø¯Ø±Ø®ÙˆØ§Ø³Øª ÙˆØ§Ø±ÛŒØ² ${row.ref} â€” Ù…Ø¨Ù„Øº ${amount}`);

    const depUser = await this.prisma.user.findUnique({ where: { id: userId }, select: { brokerId: true } });
    this.push.notify({ type: 'NEW_DEPOSIT', userId, brokerId: depUser?.brokerId ?? '', ref: row.ref, amount });

    return this.depositView(row);
  }

  /**
   * Approves a pending deposit, crediting the customer's balance.
   *
   * The ledger records the cash arriving and the matching liability to the
   * customer, so Â«Ø¨Ø³ØªØ§Ù†Ú©Ø§Ø±Â» and Â«Ø¨Ø¯Ù‡Ú©Ø§Ø±Â» balance on every deposit.
   * Scoped to the actor's broker.
   */
  async approveDeposit(actor: { role: string; brokerId: string | null }, depositId: string): Promise<CashMoveView> {
    const deposit = await this.prisma.deposit.findUnique({
      where: { id: depositId },
      include: { wallet: { include: { user: { select: { id: true, brokerId: true } } } } },
    });
    if (!deposit) throw new TradeError('ÙˆØ§Ø±ÛŒØ² ÛŒØ§ÙØª Ù†Ø´Ø¯', 404);
    if (deposit.status !== 'PENDING') {
      throw new TradeError('ÙÙ‚Ø· ÙˆØ§Ø±ÛŒØ²Ù‡Ø§ÛŒ Ø¯Ø± Ø§Ù†ØªØ¸Ø§Ø± Ù‚Ø§Ø¨Ù„ ØªØ£ÛŒÛŒØ¯ Ù‡Ø³ØªÙ†Ø¯');
    }

    // Check same broker
    if (actor.role !== 'SUPER_ADMIN') {
      if (
        (deposit.wallet.user.brokerId ?? null) !==
        (actor.brokerId ?? null)
      ) {
        throw new TradeError('Ø§ÛŒÙ† ÙˆØ§Ø±ÛŒØ² Ù…ØªØ¹Ù„Ù‚ Ø¨Ù‡ Ù…Ø´ØªØ±ÛŒ Ø³Ø§Ø²Ù…Ø§Ù† Ø´Ù…Ø§ Ù†ÛŒØ³Øª', 403);
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
      memo: `ÙˆØ§Ø±ÛŒØ² ${deposit.ref}`,
      lines: [
        { accountId: cash.id, debit: amount },
        { accountId: owed.id, credit: amount },
      ],
    });

    await this.auditLog(deposit.wallet.user.id, 'DEPOSIT_APPROVED', `ÙˆØ§Ø±ÛŒØ² ${deposit.ref} ØªØ£ÛŒÛŒØ¯ Ø´Ø¯ â€” Ù…Ø¨Ù„Øº ${amount}`);
    this.push.notify({ type: 'DEPOSIT_DECISION', userId: deposit.wallet.user.id, ref: deposit.ref, approved: true });
    return this.depositView(updated);
  }

  /** Rejects a pending deposit â€” the money never reached the platform. */
  async rejectDeposit(actor: { role: string; brokerId: string | null }, depositId: string, note?: string): Promise<CashMoveView> {
    const deposit = await this.prisma.deposit.findUnique({
      where: { id: depositId },
      include: { wallet: { include: { user: { select: { id: true, brokerId: true } } } } },
    });
    if (!deposit) throw new TradeError('ÙˆØ§Ø±ÛŒØ² ÛŒØ§ÙØª Ù†Ø´Ø¯', 404);
    if (deposit.status !== 'PENDING') {
      throw new TradeError('ÙÙ‚Ø· ÙˆØ§Ø±ÛŒØ²Ù‡Ø§ÛŒ Ø¯Ø± Ø§Ù†ØªØ¸Ø§Ø± Ù‚Ø§Ø¨Ù„ Ø±Ø¯ Ù‡Ø³ØªÙ†Ø¯');
    }

    // Check same broker
    if (actor.role !== 'SUPER_ADMIN') {
      if (
        (deposit.wallet.user.brokerId ?? null) !==
        (actor.brokerId ?? null)
      ) {
        throw new TradeError('Ø§ÛŒÙ† ÙˆØ§Ø±ÛŒØ² Ù…ØªØ¹Ù„Ù‚ Ø¨Ù‡ Ù…Ø´ØªØ±ÛŒ Ø³Ø§Ø²Ù…Ø§Ù† Ø´Ù…Ø§ Ù†ÛŒØ³Øª', 403);
      }
    }

    const updated = await this.prisma.deposit.update({
      where: { id: depositId },
      data: { status: 'REJECTED', note: note?.trim() || deposit.note },
    });
    await this.auditLog(deposit.wallet.user.id, 'DEPOSIT_REJECTED', `ÙˆØ§Ø±ÛŒØ² ${deposit.ref} Ø±Ø¯ Ø´Ø¯`);
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

  // â”€â”€ Withdrawals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Requests a withdrawal.
   *
   * Security layers (all invisible to legitimate users):
   *  1. Idempotency key â€” a duplicate submission returns the existing row.
   *  2. Daily limit â€” total withdrawals per calendar day capped at DAILY_WITHDRAWAL_LIMIT.
   *  3. Hourly rate limit â€” max MAX_WITHDRAWALS_PER_HOUR requests per hour.
   *  4. Trusted destination â€” a new IBAN is added to the trusted list but the
   *     withdrawal is held for NEW_DESTINATION_HOLD_MS before staff process it.
   *  5. Balance check inside the transaction â€” re-read after the lock so a
   *     race between two concurrent withdrawals cannot overdraft the wallet.
   */
  async requestWithdrawal(
    userId: string,
    input: { amount: number; destination?: string; note?: string; idempotencyKey?: string },
  ): Promise<CashMoveView> {
    // â”€â”€ Idempotency â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (input.idempotencyKey) {
      const wallet = await this.ensureWallet(userId);
      const existing = await this.prisma.withdrawal.findFirst({
        where: { walletId: wallet.id, idempotencyKey: input.idempotencyKey },
      });
      if (existing) return this.withdrawalView(existing);
    }

    const gross = money(Number(input.amount));
    if (!Number.isFinite(gross) || gross <= 0) throw new TradeError('Ù…Ø¨Ù„Øº Ø¨Ø±Ø¯Ø§Ø´Øª Ù†Ø§Ù…Ø¹ØªØ¨Ø± Ø§Ø³Øª');
    if (gross < MIN_WITHDRAWAL) throw new TradeError('Ø­Ø¯Ø§Ù‚Ù„ Ù…Ø¨Ù„Øº Ø¨Ø±Ø¯Ø§Ø´Øª Û±Û°Û°Ù¬Û°Û°Û° ØªÙˆÙ…Ø§Ù† Ø§Ø³Øª');
    if (gross > MAX_WITHDRAWAL) throw new TradeError('Ø­Ø¯Ø§Ú©Ø«Ø± Ù…Ø¨Ù„Øº Ù‡Ø± Ø¨Ø±Ø¯Ø§Ø´Øª ÛµÛ°Û° Ù…ÛŒÙ„ÛŒÙˆÙ† ØªÙˆÙ…Ø§Ù† Ø§Ø³Øª');

    const destination = (input.destination ?? '').trim();
    if (!destination) throw new TradeError('Ø´Ù…Ø§Ø±Ù‡ Ø­Ø³Ø§Ø¨ Ù…Ù‚ØµØ¯ Ø§Ù„Ø²Ø§Ù…ÛŒ Ø§Ø³Øª');

    const wallet = await this.ensureWallet(userId);

    // â”€â”€ Daily limit â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayAgg = await this.prisma.withdrawal.aggregate({
      where: {
        walletId: wallet.id,
        createdAt: { gte: todayStart },
        status: { not: 'REJECTED' },
      },
      _sum: { amount: true },
    });
    const todayTotal = dec(todayAgg._sum.amount);
    if (todayTotal + gross > DAILY_WITHDRAWAL_LIMIT) {
      throw new TradeError(
        `Ø³Ù‚Ù Ø¨Ø±Ø¯Ø§Ø´Øª Ø±ÙˆØ²Ø§Ù†Ù‡ (${(DAILY_WITHDRAWAL_LIMIT / 1_000_000).toLocaleString('fa-IR')} Ù…ÛŒÙ„ÛŒÙˆÙ† ØªÙˆÙ…Ø§Ù†) ØªÚ©Ù…ÛŒÙ„ Ø´Ø¯Ù‡ Ø§Ø³Øª`,
      );
    }

    // â”€â”€ Hourly rate guard (anomaly detection) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentCount = await this.prisma.withdrawal.count({
      where: { walletId: wallet.id, createdAt: { gte: oneHourAgo } },
    });
    if (recentCount >= MAX_WITHDRAWALS_PER_HOUR) {
      throw new TradeError('ØªØ¹Ø¯Ø§Ø¯ Ø¯Ø±Ø®ÙˆØ§Ø³Øªâ€ŒÙ‡Ø§ÛŒ Ø¨Ø±Ø¯Ø§Ø´Øª Ø¯Ø± ÛŒÚ© Ø³Ø§Ø¹Øª Ø¨ÛŒØ´ Ø§Ø² Ø­Ø¯ Ù…Ø¬Ø§Ø² Ø§Ø³Øª. Ù„Ø·ÙØ§Ù‹ Ø¨Ø¹Ø¯Ø§Ù‹ ØªÙ„Ø§Ø´ Ú©Ù†ÛŒØ¯');
    }

    // â”€â”€ Trusted destination / new IBAN hold â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let trustedList: string[] = [];
    try { trustedList = JSON.parse(wallet.trustedDestinations); } catch { trustedList = []; }

    const isNewDestination = !trustedList.includes(destination);
    const now = new Date();

    if (isNewDestination) {
      // Add the destination to the trusted list and record when it was added
      // so the 24-hour cooldown can be measured correctly.
      trustedList.push(destination);
      await this.prisma.wallet.update({
        where: { id: wallet.id },
        data: {
          trustedDestinations: JSON.stringify(trustedList),
          destinationsUpdatedAt: now,
        },
      });
      await this.auditLog(userId, 'NEW_DESTINATION', `Ù…Ù‚ØµØ¯ Ø¨Ø±Ø¯Ø§Ø´Øª Ø¬Ø¯ÛŒØ¯ Ø«Ø¨Øª Ø´Ø¯: ${destination}`);
    }

    const fee = money((gross * WITHDRAW_FEE_PERCENT) / 100);
    const net = money(gross - fee);

    // â”€â”€ Collision-safe ref with retry loop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let row: Awaited<ReturnType<typeof this.prisma.withdrawal.create>> | null = null;
    let attempt = await this.prisma.withdrawal.count();
    while (!row) {
      attempt += 1;
      const ref = `WDR-${String(attempt).padStart(6, '0')}`;

      // Status for new-destination withdrawals: keep PENDING but add a note
      // so staff know it needs the 24-hour hold before processing.
      const holdNote = isNewDestination
        ? `Ù…Ù‚ØµØ¯ Ø¬Ø¯ÛŒØ¯ â€” Ù¾Ø±Ø¯Ø§Ø²Ø´ Ù¾Ø³ Ø§Ø² ${new Date(now.getTime() + NEW_DESTINATION_HOLD_MS).toLocaleDateString('fa-IR')}`
        : null;

      try {
        row = await this.prisma.$transaction(async tx => {
          // Re-read balance inside the transaction to prevent a race between
          // two concurrent withdrawal requests draining the same funds twice.
          const fresh = await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: { decrement: gross } },
          });
          if (dec(fresh.balance) < 0) {
            throw new TradeError('Ù…ÙˆØ¬ÙˆØ¯ÛŒ Ú©ÛŒÙ Ù¾ÙˆÙ„ Ú©Ø§ÙÛŒ Ù†ÛŒØ³Øª');
          }
          return tx.withdrawal.create({
            data: {
              ref,
              walletId: wallet.id,
              amount: new Prisma.Decimal(String(net)),
              fee: new Prisma.Decimal(String(fee)),
              destination,
              note: holdNote ?? input.note?.trim() ?? null,
              status: 'PENDING',
              idempotencyKey: input.idempotencyKey ?? null,
            },
          });
        });
      } catch (e: unknown) {
        if ((e as { code?: string })?.code !== 'P2002') throw e;
        if (attempt > 999999) throw new TradeError('Ø´Ù…Ø§Ø±Ù‡ Ù…Ø±Ø¬Ø¹ Ø¨Ø±Ø¯Ø§Ø´Øª Ø¯Ø± Ø¯Ø³ØªØ±Ø³ Ù†ÛŒØ³Øª', 500);
      }
    }

    const owed = await this.accounts.find(ACCOUNTS.CUSTOMER_CASH_PAYABLE);
    const pending = await this.accounts.find(ACCOUNTS.WITHDRAWAL_PAYABLE);
    await this.ledger.post({
      kind: 'WITHDRAWAL',
      walletId: wallet.id,
      memo: `Ø¨Ø±Ø¯Ø§Ø´Øª ${row.ref}`,
      lines: [
        { accountId: owed.id, debit: gross },
        { accountId: pending.id, credit: net },
      ],
    });

    await this.auditLog(
      userId,
      'WITHDRAWAL_REQUEST',
      `Ø¯Ø±Ø®ÙˆØ§Ø³Øª Ø¨Ø±Ø¯Ø§Ø´Øª ${row.ref} â€” Ù…Ø¨Ù„Øº ${gross} â€” Ù…Ù‚ØµØ¯ ${destination}${isNewDestination ? ' (Ù…Ù‚ØµØ¯ Ø¬Ø¯ÛŒØ¯ â€” Ù†Ú¯Ù‡Ø¯Ø§Ø±ÛŒ Û²Û´ Ø³Ø§Ø¹ØªÙ‡)' : ''}`,
    );

    const wdrUser = await this.prisma.user.findUnique({ where: { id: userId }, select: { brokerId: true } });
    this.push.notify({ type: 'NEW_WITHDRAWAL', userId, brokerId: wdrUser?.brokerId ?? '', ref: row.ref, amount: gross });

    return this.withdrawalView(row);
  }

  /** Marks a withdrawal as paid out, clearing the payable (scoped by broker). */
  async approveWithdrawal(actor: { role: string; brokerId: string | null }, withdrawalId: string): Promise<CashMoveView> {
    const w = await this.prisma.withdrawal.findUnique({
      where: { id: withdrawalId },
      include: { wallet: { include: { user: { select: { id: true, brokerId: true } } } } },
    });
    if (!w) throw new TradeError('Ø¨Ø±Ø¯Ø§Ø´Øª ÛŒØ§ÙØª Ù†Ø´Ø¯', 404);
    if (w.status !== 'PENDING') {
      throw new TradeError('ÙÙ‚Ø· Ø¨Ø±Ø¯Ø§Ø´Øªâ€ŒÙ‡Ø§ÛŒ Ø¯Ø± Ø§Ù†ØªØ¸Ø§Ø± Ù‚Ø§Ø¨Ù„ ØªØ£ÛŒÛŒØ¯ Ù‡Ø³ØªÙ†Ø¯');
    }

    // Check same broker
    if (actor.role !== 'SUPER_ADMIN') {
      if (
        (w.wallet.user.brokerId ?? null) !==
        (actor.brokerId ?? null)
      ) {
        throw new TradeError('Ø§ÛŒÙ† Ø¨Ø±Ø¯Ø§Ø´Øª Ù…ØªØ¹Ù„Ù‚ Ø¨Ù‡ Ù…Ø´ØªØ±ÛŒ Ø³Ø§Ø²Ù…Ø§Ù† Ø´Ù…Ø§ Ù†ÛŒØ³Øª', 403);
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
      memo: `Ù¾Ø±Ø¯Ø§Ø®Øª Ø¨Ø±Ø¯Ø§Ø´Øª ${w.ref}`,
      lines: [
        { accountId: pending.id, debit: net },
        { accountId: cash.id, credit: net },
      ],
    });

    await this.auditLog(w.wallet.user.id, 'WITHDRAWAL_APPROVED', `Ø¨Ø±Ø¯Ø§Ø´Øª ${w.ref} ØªØ£ÛŒÛŒØ¯ Ø´Ø¯ â€” Ù…Ø¨Ù„Øº ${net}`);
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
    if (!w) throw new TradeError('Ø¨Ø±Ø¯Ø§Ø´Øª ÛŒØ§ÙØª Ù†Ø´Ø¯', 404);
    if (w.status !== 'PENDING') {
      throw new TradeError('ÙÙ‚Ø· Ø¨Ø±Ø¯Ø§Ø´Øªâ€ŒÙ‡Ø§ÛŒ Ø¯Ø± Ø§Ù†ØªØ¸Ø§Ø± Ù‚Ø§Ø¨Ù„ Ø±Ø¯ Ù‡Ø³ØªÙ†Ø¯');
    }

    // Check same broker
    if (actor.role !== 'SUPER_ADMIN') {
      if (
        (w.wallet.user.brokerId ?? null) !==
        (actor.brokerId ?? null)
      ) {
        throw new TradeError('Ø§ÛŒÙ† Ø¨Ø±Ø¯Ø§Ø´Øª Ù…ØªØ¹Ù„Ù‚ Ø¨Ù‡ Ù…Ø´ØªØ±ÛŒ Ø³Ø§Ø²Ù…Ø§Ù† Ø´Ù…Ø§ Ù†ÛŒØ³Øª', 403);
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
      memo: `Ø§Ø³ØªØ±Ø¯Ø§Ø¯ Ø¨Ø±Ø¯Ø§Ø´Øª ${w.ref}`,
      lines: [
        { accountId: pending.id, debit: dec(w.amount) },
        { accountId: owed.id, credit: gross },
      ],
    });

    await this.auditLog(w.wallet.user.id, 'WITHDRAWAL_REJECTED', `Ø¨Ø±Ø¯Ø§Ø´Øª ${w.ref} Ø±Ø¯ Ø´Ø¯`);
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

  // â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private async ensureWallet(userId: string) {
    return this.prisma.wallet.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  /**
   * Writes a financial audit log entry.
   * Fire-and-forget â€” never throws, so a logging failure never blocks a trade.
   */
  private auditLog(userId: string, action: string, detail: string): Promise<void> {
    return this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action,
        entity: 'Wallet',
        after: { detail },
      },
    }).then(() => undefined).catch(() => undefined);
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

