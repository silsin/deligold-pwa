import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { TradingService } from './trading.service';
import { PlaceOrderDto, ReviewOrderDto, SubmitReceiptDto } from './dto/trade.dto';

/** The staff roles allowed to work the review queue. */
const STAFF = [Role.BROKER_MANAGER, Role.BROKER_ADMIN, Role.SUPER_ADMIN] as const;

/**
 * Trading endpoints.
 *
 * Split by audience: `/trade/*` is the customer's own account, and
 * `/trade/review/*` is the broker manager's queue. Both sit behind the global
 * JWT guard, so every route here knows who the caller is and scopes to them —
 * a customer can only ever read or act on their own orders.
 */
@Controller('trade')
export class TradingController {
  constructor(private readonly trading: TradingService) {}

  // ── Customer ──────────────────────────────────────────────────────────────

  /** Cash balance plus live value of holdings — one call for the wallet screen. */
  @Get('wallet')
  wallet(@CurrentUser() user: AuthUser) {
    return this.trading.wallet(user.userId);
  }

  /** Every non-empty holding, marked to the live board. */
  @Get('positions')
  positions(@CurrentUser() user: AuthUser) {
    return this.trading.positions(user.userId);
  }

  /** The caller's own orders, newest first. */
  @Get('orders')
  myOrders(@CurrentUser() user: AuthUser) {
    return this.trading.myOrders(user.userId);
  }

  /** One of the caller's own orders. */
  @Get('orders/:id')
  order(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.trading.order(user.userId, id);
  }

  /**
   * Places a market order.
   *
   * A verified customer settles instantly from their wallet. An unverified one
   * gets a MANUAL order awaiting a receipt, which they send to the broker
   * manager with `POST /trade/orders/:id/receipt`.
   */
  @Post('orders')
  placeOrder(@CurrentUser() user: AuthUser, @Body() dto: PlaceOrderDto) {
    return this.trading.placeOrder(user.userId, {
      symbol: dto.symbol,
      side: dto.side,
      grams: dto.grams,
      fulfillment: dto.fulfillment,
      deliveryAddress: dto.deliveryAddress,
    });
  }

  /**
   * The customer sends their bank receipt to the broker manager, stating
   * whether they will collect the gold in person or have it delivered. This
   * moves the order into the manager's review queue.
   */
  @Post('orders/:id/receipt')
  submitReceipt(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SubmitReceiptDto,
  ) {
    return this.trading.submitReceipt(user.userId, id, dto);
  }

  // ── Broker manager ────────────────────────────────────────────────────────

  /**
   * The review queue: every MANUAL order in this broker waiting on a receipt
   * check. Scoped to the caller's own organisation inside the service.
   */
  @Roles(...STAFF)
  @Get('review-queue')
  reviewQueue(@CurrentUser() user: AuthUser) {
    return this.trading.reviewQueue(user);
  }

  /**
   * Approves or rejecting a MANUAL order. Approving is what finally credits the
   * customer their gold — the bank transfer has been checked by hand, so the
   * platform can honour it.
   */
  @Roles(...STAFF)
  @Post('orders/:id/review')
  reviewOrder(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReviewOrderDto,
  ) {
    return this.trading.reviewOrder(user, id, {
      approve: dto.approve,
      note: dto.note,
    });
  }

  /**
   * Marks an approved order as handed over — collected in person, or dispatched
   * to the address the customer gave. Separate from approval so the ledger can
   * tell "gold promised" from "gold gone from the vault".
   */
  @Roles(...STAFF)
  @Post('orders/:id/fulfill')
  markFulfilled(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.trading.markFulfilled(user, id);
  }
}
