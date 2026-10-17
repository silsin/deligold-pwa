import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Role } from '@prisma/client';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { WalletsService } from './wallets.service';

/** Body of `POST /wallet/deposits`. */
class RequestDepositDto {
  @Min(1, { message: 'مبلغ واریز نامعتبر است' })
  amount!: number;

  /** How the money is being sent — a PSP code, or BANK_TRANSFER by default. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  method?: string;

  /** Tracing number from the transfer, so staff can match it to the bank. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

/** Body of `POST /wallet/withdrawals`. */
class RequestWithdrawalDto {
  @Min(1, { message: 'مبلغ برداشت نامعتبر است' })
  amount!: number;

  /** Bank account the money should be sent to. */
  @IsString()
  @IsNotEmpty({ message: 'شماره حساب مقصد الزامی است' })
  @MaxLength(200)
  destination!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

/** Staff roles allowed to approve cash movement. */
const STAFF = [Role.BROKER_MANAGER, Role.BROKER_ADMIN, Role.SUPER_ADMIN] as const;

/**
 * Cash in and out: deposits and withdrawals.
 *
 * Customers request movement here; nothing is credited or refunded until staff
 * approve it. Approval is a separate step on purpose — a pending deposit is a
 * claim that money arrived, and honouring that claim automatically would let
 * anyone fund a wallet by asserting they had paid.
 */
@Controller('wallet')
export class WalletsController {
  constructor(private readonly wallets: WalletsService) {}

  // ── Customer ──────────────────────────────────────────────────────────────

  /** Asks to top up. The balance is untouched until staff approve it. */
  @Post('deposits')
  requestDeposit(@CurrentUser() user: AuthUser, @Body() dto: RequestDepositDto) {
    return this.wallets.requestDeposit(user.userId, {
      amount: dto.amount,
      method: dto.method,
      reference: dto.reference,
      note: dto.note,
    });
  }

  /** The caller's own deposit history, newest first. */
  @Get('deposits')
  myDeposits(@CurrentUser() user: AuthUser) {
    return this.wallets.myDeposits(user.userId);
  }

  /**
   * Asks to cash out. The balance is debited immediately and held as a payable
   * until staff actually send the money, so it cannot be spent twice.
   */
  @Post('withdrawals')
  requestWithdrawal(@CurrentUser() user: AuthUser, @Body() dto: RequestWithdrawalDto) {
    return this.wallets.requestWithdrawal(user.userId, {
      amount: dto.amount,
      destination: dto.destination,
      note: dto.note,
    });
  }

  /** The caller's own withdrawal history, newest first. */
  @Get('withdrawals')
  myWithdrawals(@CurrentUser() user: AuthUser) {
    return this.wallets.myWithdrawals(user.userId);
  }

  // ── Staff ─────────────────────────────────────────────────────────────────

  /** Every pending deposit and withdrawal, for the approval screens (scoped by broker). */
  @Roles(...STAFF)
  @Get('pending')
  pending(@CurrentUser() user: AuthUser) {
    return this.wallets.pending(user);
  }

  /** Confirms the money arrived, crediting the customer's balance. */
  @Roles(...STAFF)
  @Post('deposits/:id/approve')
  approveDeposit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.wallets.approveDeposit(user, id);
  }

  /** Refuses a deposit — the money never reached the platform. */
  @Roles(...STAFF)
  @Post('deposits/:id/reject')
  rejectDeposit(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { note?: string }) {
    return this.wallets.rejectDeposit(user, id, body?.note);
  }

  /** Marks a withdrawal as sent, clearing the payable. */
  @Roles(...STAFF)
  @Post('withdrawals/:id/approve')
  approveWithdrawal(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.wallets.approveWithdrawal(user, id);
  }

  /** Refuses a withdrawal and returns the money to the customer's balance. */
  @Roles(...STAFF)
  @Post('withdrawals/:id/reject')
  rejectWithdrawal(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { note?: string }) {
    return this.wallets.rejectWithdrawal(user, id, body?.note);
  }
}
