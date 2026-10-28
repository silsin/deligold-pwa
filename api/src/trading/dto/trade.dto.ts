import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { FulfillmentMethod, OrderSide } from '@prisma/client';

/**
 * Body of `POST /trade/orders`.
 *
 * `price` is deliberately absent: the server reads its own board and fills at
 * that number, so a tampered payload cannot buy gold at a price of its choosing.
 */
export class PlaceOrderDto {
  @IsString()
  @IsNotEmpty({ message: 'نماد معاملاتی الزامی است' })
  symbol!: string;

  @IsEnum(OrderSide, { message: 'نوع سفارش نامعتبر است' })
  side!: OrderSide;

  @Min(0.001, { message: 'حداقل وزن ۰٫۰۰۱ گرم است' })
  grams!: number;

  /**
   * Only meaningful for an unverified customer's MANUAL buy — a verified
   * customer's wallet trade is settled instantly and is never collected or
   * shipped, so the field is ignored for them.
   */
  @IsOptional()
  @IsEnum(FulfillmentMethod, { message: 'نحوه تحویل نامعتبر است' })
  fulfillment?: FulfillmentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  deliveryAddress?: string;

  /**
   * How a BUY is paid. WALLET settles instantly from the cash balance (verified
   * customers only); RECEIPT always creates a MANUAL order awaiting a bank
   * receipt. Omitted, the server picks by verification status.
   */
  @IsOptional()
  @IsIn(['WALLET', 'RECEIPT'], { message: 'روش پرداخت نامعتبر است' })
  payment?: 'WALLET' | 'RECEIPT';
}

/**
 * Body of `POST /trade/orders/:id/receipt`.
 *
 * `receiptPath` is the path the upload endpoint returned — the receipt itself
 * travels through a separate multipart upload, so this call only links an
 * already-stored file to the order. That keeps the authenticated JSON route
 * separate from the file parsing, and means the path is server-generated
 * rather than client-supplied.
 */
export class SubmitReceiptDto {
  @IsString()
  @IsNotEmpty({ message: 'فایل رسید بارگذاری نشده است' })
  receiptPath!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  receiptNote?: string;

  @IsOptional()
  @IsEnum(FulfillmentMethod, { message: 'نحوه تحویل نامعتبر است' })
  fulfillment?: FulfillmentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  deliveryAddress?: string;
}

/** Body of `POST /trade/orders/:id/review`. */
export class ReviewOrderDto {
  @IsBoolean({ message: 'وضعیت تصمیم نامعتبر است' })
  approve!: boolean;

  /** Required when rejecting, so the customer is told why. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
