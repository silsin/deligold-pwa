import { Injectable } from '@nestjs/common';
import { FulfillmentMethod, OrderSide, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountsService, ACCOUNTS } from '../accounting/accounts.service';
import { LedgerService } from '../accounting/ledger.service';
import { MarketService } from '../market/market.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PushService } from '../push/push.service';
import { isTradeSymbol, symbolMeta } from '../market/symbols';
import { InsufficientFundsError, TradeError } from '../common/errors';
import { EPSILON, dec, feeFor, grams as roundGrams, money, weightedAvgCost } from '../common/money';

/**
 * Commission charged on every settled trade, as a percentage of the notional.
 * Applied identically to buys and sells so the platform earns a spread on both
 * directions rather than only on the way in.
 */
const TRADE_FEE_PERCENT = 0.5;

/** Bounds on a single order, matching the limits the PWA already enforces. */
const MIN_GRAMS = 0.001;
const MAX_GRAMS = 100_000;

/** Public shape of an order, with Decimals converted to numbers. */
export interface OrderView {
  id: string;
  ref: string;
  symbol: string;
  side: OrderSide;
  kind: string;
  status: OrderStatus;
  grams: number;
  price: number;
  amount: number;
  fee: number;
  pnl: number | null;
  fulfillment: FulfillmentMethod | null;
  deliveryAddress: string | null;
  receiptNote: string | null;
  receiptAt: Date | null;
  reviewNote: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}

export interface PositionView {
  symbol: string;
  name: string;
  unit: string;
  grams: number;
  avgCost: number;
  /** Marked to the live board. */
  marketValue: number;
  cost: number;
  pnl: number;
  pnlPercent: number;
}

export interface WalletView {
  balance: number;
  realizedPnl: number;
  equity: number;
  feePercent: number;
}

/** Convert a Prisma Order row into the shape sent to clients. */
function toOrderView(o: {
  id: string; ref: string; symbol: string; side: OrderSide; kind: string;
  status: OrderStatus; grams: Prisma.Decimal; price: Prisma.Decimal;
  amount: Prisma.Decimal; fee: Prisma.Decimal; pnl: Prisma.Decimal | null;
  fulfillment: FulfillmentMethod | null; deliveryAddress: string | null;
  receiptNote: string | null; receiptAt: Date | null; reviewNote: string | null;
  reviewedAt: Date | null; createdAt: Date;
}): OrderView {
  return {
    id: o.id,
    ref: o.ref,
    symbol: o.symbol,
    side: o.side,
    kind: o.kind,
    status: o.status,
    grams: dec(o.grams),
    price: money(dec(o.price)),
    amount: money(dec(o.amount)),
    fee: money(dec(o.fee)),
    pnl: o.pnl === null ? null : money(dec(o.pnl)),
    fulfillment: o.fulfillment,
    deliveryAddress: o.deliveryAddress,
    receiptNote: o.receiptNote,
    receiptAt: o.receiptAt,
    reviewNote: o.reviewNote,
    reviewedAt: o.reviewedAt,
    createdAt: o.createdAt,
  };
}

const ORDER_INCLUDE = {
  user: { select: { id: true, name: true, phone: true, verifiedAt: true, brokerId: true } },
} as const;

/**
 * A broker id that matches no real organisation.
 *
 * Used to scope a staff query when the actor has no broker of their own: rather
 * than dropping the filter (which would show them everything) we filter on an
 * id that cannot exist, so an unscoped staff account sees an empty list instead
 * of the whole platform's customers.
 */
const NO_BROKER = '__no_broker__';


@Injectable()
export class TradingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly market: MarketService,
    private readonly accounts: AccountsService,
    private readonly ledger: LedgerService,
    private readonly permissions: PermissionsService,
    private readonly push: PushService,
  ) {}

  // ── Reads ─────────────────────────────────────────────────────────────────

  /**
   * Cash balance plus the live value of every holding, so one call can render
   * the whole wallet screen.
   */
  async wallet(userId: string): Promise<WalletView> {
    const w = await this.ensureWallet(userId);
    const positions = await this.positions(userId);
    const equity = money(dec(w.balance) + positions.reduce((s, p) => s + p.marketValue, 0));
    return {
      balance: money(dec(w.balance)),
      realizedPnl: money(dec(w.realizedPnl)),
      equity,
      feePercent: TRADE_FEE_PERCENT,
    };
  }

  /**
   * Every non-empty holding, marked to the live board.
   *
   * A holding with no quote is still returned (valued at cost) rather than
   * dropped, so a position never silently vanishes from a customer's screen
   * just because its price feed hiccupped.
   */
  async positions(userId: string): Promise<PositionView[]> {
    const w = await this.ensureWallet(userId);
    const rows = await this.prisma.position.findMany({
      where: { walletId: w.id, grams: { gt: 0 } },
      orderBy: { symbol: 'asc' },
    });
    const board = await this.market.board();

    return rows.map(p => {
      const held = dec(p.grams);
      const cost = money(held * dec(p.avgCost));
      const quote = board.quotes[p.symbol];
      const marketValue = money(held * (quote?.price ?? dec(p.avgCost)));
      const pnl = marketValue - cost;
      const meta = symbolMeta(p.symbol);
      return {
        symbol: p.symbol,
        name: meta?.name ?? p.symbol,
        unit: meta?.unit ?? 'گرم',
        grams: roundGrams(held),
        avgCost: money(dec(p.avgCost)),
        marketValue,
        cost,
        pnl,
        pnlPercent: cost > 0 ? Number(((pnl / cost) * 100).toFixed(2)) : 0,
      };
    });
  }

  /** The caller's own orders, newest first. */
  async myOrders(userId: string, limit = 100): Promise<OrderView[]> {
    const rows = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
    });
    return rows.map(toOrderView);
  }

  /** One order, scoped to its owner (or any staff caller). */
  async order(userId: string, orderId: string): Promise<OrderView> {
    const row = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!row) throw new TradeError('سفارش یافت نشد', 404);
    if (row.userId !== userId) throw new TradeError('این سفارش متعلق به شما نیست', 403);
    return toOrderView(row);
  }

  /**
   * Staff overview: a customer's wallet, positions, and recent orders.
   * Reuses the existing position/order marking so the manager sees the same
   * live numbers the customer sees.
   */
  async customerOverview(
    actor: { userId: string; role: string; brokerId: string | null },
    id: string,
  ): Promise<{
    user: { id: string; name: string | null; phone: string | null; role: string; verified: boolean; status: string; createdAt: Date };
    wallet: WalletView;
    positions: PositionView[];
    orders: OrderView[];
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
        brokerId: true,
        verifiedAt: true,
        status: true,
        createdAt: true,
      },
    });

    if (!user) throw new TradeError('کاربر یافت نشد', 404);

    // Check same broker
    if (actor.role !== 'SUPER_ADMIN') {
      if ((user.brokerId ?? null) !== (actor.brokerId ?? null)) {
        throw new TradeError('این کاربر متعلق به سازمان شما نیست', 403);
      }
    }

    // Require customer role
    if (user.role !== 'CUSTOMER') {
      throw new TradeError('این کاربر مشتری نیست', 400);
    }

    const wallet = await this.wallet(id);
    const positions = await this.positions(id);
    const orders = await this.myOrders(id, 20);

    return {
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        verified: user.verifiedAt !== null,
        status: user.status,
        createdAt: user.createdAt,
      },
      wallet,
      positions,
      orders,
    };
  }

  // ── Trading ───────────────────────────────────────────────────────────────

  /**
   * Places a market order.
   *
   * A **verified** customer settles instantly against their cash wallet: the
   * balance is checked, debited, and the gold is credited in one transaction.
   *
   * An **unverified** customer cannot settle from the wallet at all. Their buy
   * becomes a MANUAL order in `AWAITING_RECEIPT`: they bank-transfer outside
   * the app, upload the receipt, and choose pickup or delivery. A broker
   * manager then approves it, and only then does gold move. That split is the
   * point — an unknown buyer must never be able to take real gold on trust.
   */
  async placeOrder(
    userId: string,
    input: { symbol: string; side: OrderSide; grams: number; fulfillment?: FulfillmentMethod; deliveryAddress?: string },
  ): Promise<OrderView> {
    const symbol = (input.symbol ?? '').trim();
    const side: OrderSide = input.side === 'SELL' ? 'SELL' : 'BUY';
    const weight = Number(input.grams);

    if (!isTradeSymbol(symbol)) throw new TradeError('نماد معاملاتی نامعتبر است');
    if (!Number.isFinite(weight) || weight <= 0) throw new TradeError('وزن نامعتبر است');
    if (weight < MIN_GRAMS) throw new TradeError('حداقل وزن معامله ۰٫۰۰۱ گرم است');
    if (weight > MAX_GRAMS) throw new TradeError('حداکثر وزن هر سفارش ۱۰۰٬۰۰۰ گرم است');

    const meta = symbolMeta(symbol);
    if (meta && !meta.divisible && !Number.isInteger(weight)) {
      throw new TradeError('این نماد فقط به صورت عدد صحیح معامله می‌شود');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new TradeError('کاربر یافت نشد', 404);
    if (user.status !== 'ACTIVE') throw new TradeError('حساب شما فعال نیست', 403);

    // Check trade permissions (customer permission check)
    await this.permissions.canTrade(userId, symbol, side);

    const verified = user.verifiedAt !== null;

    // An unverified customer may only BUY, and only through the receipt flow.
    if (!verified) {
      if (side === 'SELL') {
        throw new TradeError(
          'برای فروش باید هویت شما تأیید شده باشد. از بخش پروفایل مدارک خود را ارسال کنید',
        );
      }
      return this.createManualOrder(userId, symbol, weight, input.fulfillment, input.deliveryAddress, user.brokerId, user.role);
    }

    const price = await this.market.fillPrice(symbol, side, user.brokerId, user.role);
    if (!price) throw new TradeError('قیمت این نماد در دسترس نیست', 503);

    return side === 'BUY'
      ? this.settleBuy(userId, symbol, weight, price, user.brokerId)
      : this.settleSell(userId, symbol, weight, price, user.brokerId);
  }

  /**
   * Buys from the cash wallet, inside one transaction so the balance and the
   * position can never disagree.
   */
  private async settleBuy(userId: string, symbol: string, weight: number, price: number, brokerId?: string | null): Promise<OrderView> {
    const amount = money(weight * price);
    const fee = feeFor(amount, TRADE_FEE_PERCENT);
    const need = money(amount + fee);

    const w = await this.ensureWallet(userId);
    if (dec(w.balance) < need) {
      throw new InsufficientFundsError(
        `موجودی کیف پول کافی نیست (نیاز: ${need.toLocaleString('fa-IR')} تومان)`,
      );
    }

    const ref = await this.nextOrderRef();
    const order = await this.prisma.$transaction(async tx => {
      // Re-read inside the transaction: a concurrent trade could have drained
      // the balance between the check above and the write.
      const fresh = await tx.wallet.update({
        where: { id: w.id },
        data: { balance: { decrement: need } },
      });
      if (dec(fresh.balance) < 0) {
        throw new InsufficientFundsError('موجودی کیف پول کافی نیست');
      }

      const pos = await tx.position.findUnique({
        where: { walletId_symbol: { walletId: w.id, symbol } },
      });
      const held = dec(pos?.grams);
      const avg = weightedAvgCost(held, dec(pos?.avgCost), weight, price);
      await tx.position.upsert({
        where: { walletId_symbol: { walletId: w.id, symbol } },
        create: { walletId: w.id, symbol, grams: roundGrams(held + weight), avgCost: avg },
        update: { grams: roundGrams(held + weight), avgCost: avg },
      });

      return tx.order.create({
        data: {
          ref, userId, symbol, side: 'BUY', kind: 'TRADE', status: 'FILLED',
          grams: new Prisma.Decimal(weight.toFixed(6)),
          price: new Prisma.Decimal(String(price)),
          amount: new Prisma.Decimal(String(amount)),
          fee: new Prisma.Decimal(String(fee)),
        },
      });
    });

    await this.postTrade(userId, w.id, order, weight, amount, fee);
    this.push.notify({ type: 'NEW_ORDER', userId, brokerId: brokerId ?? '', ref: order.ref, symbol: order.symbol, grams: weight });
    return toOrderView(order);
  }

  /** Sells from an existing holding, crediting cash net of commission. */
  private async settleSell(userId: string, symbol: string, weight: number, price: number, brokerId?: string | null): Promise<OrderView> {
    const w = await this.ensureWallet(userId);
    const pos = await this.prisma.position.findUnique({
      where: { walletId_symbol: { walletId: w.id, symbol } },
    });
    if (!pos || dec(pos.grams) + EPSILON < weight) {
      throw new TradeError('از این نماد به اندازه سفارش در حساب شما موجودی نیست');
    }

    const amount = money(weight * price);
    const fee = feeFor(amount, TRADE_FEE_PERCENT);
    const credit = money(amount - fee);
    const realized = money((price - dec(pos.avgCost)) * weight) - fee;
    const ref = await this.nextOrderRef();

    const order = await this.prisma.$transaction(async tx => {
      const fresh = await tx.position.findUnique({
        where: { walletId_symbol: { walletId: w.id, symbol } },
      });
      const left = roundGrams(dec(fresh?.grams) - weight);
      if (left < 0) throw new TradeError('موجودی این نماد کافی نیست');

      // Deleting at zero keeps the table free of dust rows that would otherwise
      // clutter the customer's holdings list forever.
      if (left <= EPSILON) {
        await tx.position.delete({ where: { id: pos.id } });
      } else {
        await tx.position.update({ where: { id: pos.id }, data: { grams: left } });
      }

      await tx.wallet.update({
        where: { id: w.id },
        data: { balance: { increment: credit }, realizedPnl: { increment: realized } },
      });

      return tx.order.create({
        data: {
          ref, userId, symbol, side: 'SELL', kind: 'TRADE', status: 'FILLED',
          grams: new Prisma.Decimal(weight.toFixed(6)),
          price: new Prisma.Decimal(String(price)),
          amount: new Prisma.Decimal(String(amount)),
          fee: new Prisma.Decimal(String(fee)),
          pnl: new Prisma.Decimal(String(realized)),
        },
      });
    });

    await this.postTrade(userId, w.id, order, weight, amount, fee);
    this.push.notify({ type: 'NEW_ORDER', userId, brokerId: brokerId ?? '', ref: order.ref, symbol: order.symbol, grams: weight });
    return toOrderView(order);
  }

  // ── Manual (receipt) orders ───────────────────────────────────────────────

  /**
   * Creates a MANUAL buy for an unverified customer.
   *
   * No wallet is touched and no gold moves: the customer pays the platform by
   * bank transfer outside the app, then uploads the receipt. The order waits in
   * `AWAITING_RECEIPT` until they do, then in `PENDING_REVIEW` until a broker
   * manager accepts it. Only an approved MANUAL order may hand over gold.
   *
   * The price is locked at placement time so the amount on the receipt is the
   * amount the order is worth, even if the board moves while they wait.
   */
  private async createManualOrder(
    userId: string,
    symbol: string,
    weight: number,
    fulfillment?: FulfillmentMethod,
    deliveryAddress?: string,
    brokerId?: string | null,
    role?: import('@prisma/client').Role,
  ): Promise<OrderView> {
    const price = await this.market.fillPrice(symbol, 'BUY', brokerId, role);
    if (!price) throw new TradeError('قیمت این نماد در دسترس نیست', 503);

    if (fulfillment === 'DELIVERY' && !deliveryAddress?.trim()) {
      throw new TradeError('برای ارسال پستی، آدرس تحویل الزامی است');
    }

    const amount = money(weight * price);
    const fee = feeFor(amount, TRADE_FEE_PERCENT);
    const ref = await this.nextOrderRef();

    const order = await this.prisma.order.create({
      data: {
        ref, userId, symbol, side: 'BUY', kind: 'MANUAL', status: 'AWAITING_RECEIPT',
        grams: new Prisma.Decimal(weight.toFixed(6)),
        price: new Prisma.Decimal(String(price)),
        amount: new Prisma.Decimal(String(amount)),
        fee: new Prisma.Decimal(String(fee)),
        fulfillment: fulfillment ?? null,
        deliveryAddress: deliveryAddress?.trim() || null,
      },
    });

    this.push.notify({ type: 'NEW_ORDER', userId, brokerId: brokerId ?? '', ref: order.ref, symbol: order.symbol, grams: weight });
    return toOrderView(order);
  }

  /**
   * The customer sends their bank receipt to the broker manager.
   *
   * This is the "button" the customer presses: it attaches the receipt image and
   * moves the order from `AWAITING_RECEIPT` to `PENDING_REVIEW`, which is what
   * puts it in the manager's queue. The customer also states here, if they did
   * not at placement, whether they are collecting in person or waiting for
   * delivery — the manager needs that before approving.
   */
  async submitReceipt(
    userId: string,
    orderId: string,
    input: {
      receiptPath: string;
      receiptNote?: string;
      fulfillment?: FulfillmentMethod;
      deliveryAddress?: string;
    },
  ): Promise<OrderView> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new TradeError('سفارش یافت نشد', 404);
    if (order.userId !== userId) throw new TradeError('این سفارش متعلق به شما نیست', 403);
    if (order.kind !== 'MANUAL') throw new TradeError('این سفارش به رسید نیاز ندارد');
    if (order.status !== 'AWAITING_RECEIPT') {
      throw new TradeError('برای این سفارش رسیدی قابل ارسال نیست');
    }

    const receiptPath = (input.receiptPath ?? '').trim();
    if (!receiptPath) throw new TradeError('فایل رسید بارگذاری نیست');

    // Delivery decided at the last moment is fine, but an address must exist by
    // the time the order reaches the manager — not after they approve it.
    const fulfillment = input.fulfillment ?? order.fulfillment;
    if (!fulfillment) throw new TradeError('نحوه تحویل طلا را انتخاب کنید');

    let deliveryAddress = order.deliveryAddress;
    if (fulfillment === 'DELIVERY') {
      deliveryAddress = (input.deliveryAddress ?? order.deliveryAddress ?? '').trim();
      if (!deliveryAddress) throw new TradeError('برای ارسال پستی، آدرس تحویل الزامی است');
    } else {
      deliveryAddress = null;
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        receiptPath,
        receiptNote: input.receiptNote?.trim() || order.receiptNote,
        receiptAt: new Date(),
        fulfillment,
        deliveryAddress,
        status: 'PENDING_REVIEW',
      },
    });

    // Notify broker managers a receipt is ready for review
    const orderUser = await this.prisma.user.findUnique({ where: { id: userId }, select: { brokerId: true } });
    this.push.notify({ type: 'ORDER_STATUS', userId, brokerId: orderUser?.brokerId ?? '', ref: updated.ref, status: 'PENDING_REVIEW' });

    return toOrderView(updated);
  }

  /**
   * The broker manager's queue: every order awaiting review, in their broker.
   *
   * A manager only ever sees their own organisation's customers — hence the
   * `brokerId` filter on the user — while a SUPER_ADMIN sees everything, which
   * is the same rule the rest of the platform applies.
   */
  async reviewQueue(
    actor: { userId: string; role: string; brokerId: string | null },
  ): Promise<OrderView[]> {
    const rows = await this.prisma.order.findMany({
      where: {
        status: 'PENDING_REVIEW',
        kind: 'MANUAL',
        ...(actor.role === 'SUPER_ADMIN'
          ? {}
          : { user: { brokerId: actor.brokerId ?? NO_BROKER } }),
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toOrderView);
  }

  /**
   * Approves or rejects a MANUAL order.
   *
   * Approving is what finally credits the customer their gold — the payment has
   * been checked against the bank by hand, so the platform can honour it. Only
   * then does the holding appear in their wallet.
   */
  async reviewOrder(
    actor: { userId: string; role: string; brokerId: string | null },
    orderId: string,
    decision: { approve: boolean; note?: string },
  ): Promise<OrderView> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });
    if (!order) throw new TradeError('سفارش یافت نشد', 404);
    if (order.status !== 'PENDING_REVIEW') {
      throw new TradeError('فقط سفارش‌های در انتظار بررسی قابل تأیید هستند');
    }
    this.assertSameBroker(actor, order);

    if (!decision.approve && !decision.note?.trim()) {
      throw new TradeError('برای رد سفارش باید دلیل بنویسید');
    }

    if (!decision.approve) {
      const rejected = await this.prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'REJECTED',
          reviewedById: actor.userId,
          reviewedAt: new Date(),
          reviewNote: decision.note!.trim(),
        },
      });
      this.push.notify({ type: 'ORDER_STATUS', userId: order.userId, brokerId: order.user?.brokerId ?? '', ref: rejected.ref, status: 'REJECTED' });
      return toOrderView(rejected);
    }

    // Approving credits the gold the customer has already paid for. The cash
    // never entered the wallet, because it was paid to the bank by transfer —
    // so the position is created without a matching wallet debit.
    const weight = dec(order.grams);
    const price = dec(order.price);

    const approved = await this.prisma.$transaction(async tx => {
      const w = await tx.wallet.upsert({
        where: { userId: order.userId },
        create: { userId: order.userId },
        update: {},
      });
      const pos = await tx.position.findUnique({
        where: { walletId_symbol: { walletId: w.id, symbol: order.symbol } },
      });
      const held = dec(pos?.grams);
      const avg = weightedAvgCost(held, dec(pos?.avgCost), weight, price);
      await tx.position.upsert({
        where: { walletId_symbol: { walletId: w.id, symbol: order.symbol } },
        create: { walletId: w.id, symbol: order.symbol, grams: roundGrams(held + weight), avgCost: avg },
        update: { grams: roundGrams(held + weight), avgCost: avg },
      });

      return tx.order.update({
        where: { id: orderId },
        data: {
          status: 'APPROVED',
          reviewedById: actor.userId,
          reviewedAt: new Date(),
          reviewNote: decision.note?.trim() ?? order.reviewNote,
        },
      });
    });

    this.push.notify({ type: 'ORDER_STATUS', userId: order.userId, brokerId: order.user?.brokerId ?? '', ref: approved.ref, status: 'APPROVED' });
    return toOrderView(approved);
  }

  /**
   * Marks an approved order as handed over — collected in person, or dispatched.
   *
   * Deliberately a separate step from approval, so the ledger can distinguish
   * "gold promised" from "gold physically gone from the vault".
   */
  async markFulfilled(
    actor: { userId: string; role: string; brokerId: string | null },
    orderId: string,
  ): Promise<OrderView> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });
    if (!order) throw new TradeError('سفارش یافت نشد', 404);
    if (order.status !== 'APPROVED') {
      throw new TradeError('فقط سفارش‌های تأیید شده قابل تحویل هستند');
    }
    this.assertSameBroker(actor, order);

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'FULFILLED' },
    });
    this.push.notify({ type: 'ORDER_STATUS', userId: order.userId, brokerId: order.user?.brokerId ?? '', ref: updated.ref, status: 'FULFILLED' });
    return toOrderView(updated);
  }

  /**
   * Guards a staff action against a customer in another organisation.
   *
   * SUPER_ADMIN crosses every boundary; everyone else is confined to their own
   * broker's customers, which is what keeps two competing brokers from seeing
   * each other's books.
   */
  private assertSameBroker(
    actor: { role: string; brokerId: string | null },
    order: { user?: { brokerId?: string | null } | null },
  ): void {
    if (actor.role === 'SUPER_ADMIN') return;
    if ((order.user?.brokerId ?? null) !== (actor.brokerId ?? null)) {
      throw new TradeError('این سفارش متعلق به مشتری شما نیست', 403);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Loads a user's wallet, creating it if this is their first trade.
   *
   * Registration normally creates one, but a user seeded directly into the
   * database (or restored from a backup) may not have one, and a missing wallet
   * should never surface as a null-reference to the customer.
   */
  private async ensureWallet(userId: string) {
    return this.prisma.wallet.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  /**
   * The next human-facing order reference: `DLY-000123`, `DLY-000124`, …
   *
   * Counts existing rows rather than using a sequence. Adequate for a
   * single-writer platform; a high-concurrency deployment would move this to a
   * database sequence so two simultaneous orders cannot mint the same number.
   */
  private async nextOrderRef(): Promise<string> {
    // Collision-safe: if DLY-000N is already taken (deleted rows or races),
    // increment until we find a free slot.
    let attempt = await this.prisma.order.count();
    while (true) {
      attempt += 1;
      const ref = `DLY-${String(attempt).padStart(6, '0')}`;
      const existing = await this.prisma.order.findUnique({ where: { ref }, select: { ref: true } });
      if (!existing) return ref;
      if (attempt > 999999) throw new TradeError('شماره مرجع سفارش در دسترس نیست', 500);
    }
  }

  /**
   * Posts the double-entry journal for a settled trade.
   *
   * A BUY moves cash out and gold in; a SELL does the reverse. Both legs post
   * through the ledger so the books always reconcile to the wallet balances —
   * the accounting reports are then a query over the ledger, never a
   * re-derivation from application state.
   */
  private async postTrade(
    userId: string,
    walletId: string,
    order: { id: string; symbol: string; side: string },
    weight: number,
    amount: number,
    fee: number,
  ): Promise<void> {
    const goldOwed = await this.accounts.find(ACCOUNTS.CUSTOMER_GOLD_PAYABLE);
    const cashOwed = await this.accounts.find(ACCOUNTS.CUSTOMER_CASH_PAYABLE);
    const revenue = await this.accounts.find(ACCOUNTS.TRADING_REVENUE);

    if (order.side === 'BUY') {
      // Customer's wallet was already debited by (amount + fee) in settleBuy.
      // Journal: reduce cash liability (DR), credit gold liability (CR) + revenue (CR).
      // DR CUSTOMER_CASH_PAYABLE  amount + fee
      // CR CUSTOMER_GOLD_PAYABLE  amount
      // CR TRADING_REVENUE        fee
      await this.ledger.post({
        kind: 'BUY',
        userId,
        walletId,
        memo: `خرید ${order.symbol}`,
        lines: [
          { accountId: cashOwed.id, debit: money(amount + fee), symbol: null },
          { accountId: goldOwed.id, credit: amount, symbol: order.symbol, grams: weight },
          { accountId: revenue.id, credit: fee, symbol: null },
        ],
      });
      return;
    }

    // Customer's gold was already debited and wallet credited by (amount - fee) in settleSell.
    // Journal: reduce gold liability (DR), credit cash liability (CR) + revenue (CR).
    // DR CUSTOMER_GOLD_PAYABLE  amount
    // CR CUSTOMER_CASH_PAYABLE  amount - fee
    // CR TRADING_REVENUE        fee
    const credit = money(amount - fee);
    await this.ledger.post({
      kind: 'SELL',
      userId,
      walletId,
      memo: `فروش ${order.symbol}`,
      lines: [
        { accountId: goldOwed.id, debit: amount, symbol: order.symbol, grams: -weight },
        { accountId: cashOwed.id, credit: credit, symbol: null },
        { accountId: revenue.id, credit: fee, symbol: null },
      ],
    });
  }
}

