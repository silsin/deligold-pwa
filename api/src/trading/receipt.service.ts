import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { TradeError } from '../common/errors';
import { dec } from '../common/money';

// ── Inline Jalali helpers (no external dep) ───────────────────────────────

function toJalaali(gy: number, gm: number, gd: number) {
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const div = (a: number, b: number) => Math.trunc(a / b);
  let jy = gy <= 1600 ? 0 : 979;
  gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    365 * gy +
    div(gy2 + 3, 4) -
    div(gy2 + 99, 100) +
    div(gy2 + 399, 400) -
    80 +
    gd +
    gdm[gm - 1];
  jy += 33 * div(days, 12053);
  days %= 12053;
  jy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) {
    jy += div(days - 1, 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return { jy, jm, jd };
}

function jalaliDate(d: Date): string {
  const { jy, jm, jd } = toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
}

// ── Status labels ─────────────────────────────────────────────────────────

const STATUS_FA: Record<string, string> = {
  APPROVED: 'تأیید شده',
  REJECTED: 'رد شده',
  FULFILLED: 'انجام شده / تحویل داده شده',
};

/** Only orders in these statuses may produce a receipt. */
const RECEIPT_STATUSES = new Set(['APPROVED', 'REJECTED', 'FULFILLED']);

// ── Font path (resolved at runtime so it works in dev + prod) ─────────────
// Note: if Vazirmatn is not present at this path the service silently falls
// back to Helvetica with Latin-script field labels — the receipt is still
// fully usable, just not in Persian script.
const FONT_PATH = path.join(process.cwd(), 'assets', 'fonts', 'Vazir.ttf');

@Injectable()
export class ReceiptService {
  constructor(private readonly prisma: PrismaService) {}

  async generateOrderReceipt(
    orderId: string,
    actor: { userId: string; role: string; brokerId: string | null },
  ): Promise<Buffer> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            brokerId: true,
            broker: { select: { name: true } },
          },
        },
      },
    });

    if (!order) throw new TradeError('سفارش یافت نشد', 404);

    // ── Authorization ─────────────────────────────────────────────────────
    if (actor.role === 'CUSTOMER' && order.userId !== actor.userId) {
      throw new TradeError('این سفارش متعلق به شما نیست', 403);
    }
    if (actor.role === 'BROKER_MANAGER' || actor.role === 'BROKER_ADMIN') {
      if ((order.user?.brokerId ?? null) !== (actor.brokerId ?? null)) {
        throw new TradeError('این سفارش متعلق به مشتری شما نیست', 403);
      }
    }
    // SUPER_ADMIN: no scope check.

    // ── Status guard ──────────────────────────────────────────────────────
    if (!RECEIPT_STATUSES.has(order.status)) {
      throw new TradeError(
        'رسید فقط برای سفارش‌های تأیید‌شده، رد‌شده یا تحویل‌داده‌شده در دسترس است',
        400,
      );
    }

    // ── Font availability ─────────────────────────────────────────────────
    const useVazir = fs.existsSync(FONT_PATH);

    // ── Build PDF ─────────────────────────────────────────────────────────
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      if (useVazir) {
        doc.registerFont('Vazir', FONT_PATH);
        doc.font('Vazir');
      }

      // Label set — Persian when Vazir is available, Latin fallback otherwise.
      const L = useVazir
        ? {
            platform: 'دلی گلد',
            receiptTitle: 'رسید معامله',
            ref: 'شماره سفارش',
            date: 'تاریخ',
            customer: 'مشتری',
            phone: 'تلفن',
            broker: 'کارگزاری',
            symbol: 'نماد',
            side: 'نوع معامله',
            grams: 'وزن (گرم)',
            price: 'قیمت (تومان/گرم)',
            amount: 'مبلغ کل (تومان)',
            fee: 'کارمزد (تومان)',
            status: 'وضعیت',
            reviewNote: 'یادداشت',
            footer: 'این سند به صورت خودکار صادر شده است',
            buy: 'خرید',
            sell: 'فروش',
          }
        : {
            platform: 'Delly Gold',
            receiptTitle: 'Trade Receipt',
            ref: 'Order Ref',
            date: 'Date',
            customer: 'Customer',
            phone: 'Phone',
            broker: 'Broker',
            symbol: 'Symbol',
            side: 'Side',
            grams: 'Grams',
            price: 'Price (T/g)',
            amount: 'Amount (T)',
            fee: 'Fee (T)',
            status: 'Status',
            reviewNote: 'Note',
            footer: 'This document was automatically generated.',
            buy: 'BUY',
            sell: 'SELL',
          };

      const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

      // Header
      doc.fontSize(22).text(L.platform, { align: 'center' });
      doc.fontSize(13).text(L.receiptTitle, { align: 'center' });
      doc.moveDown(1.2);

      // Divider
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.8);

      const row = (label: string, value: string) => {
        doc.fontSize(11).text(`${label}: ${value}`, { lineGap: 4 });
      };

      // Order meta
      row(L.ref, order.ref);
      row(L.date, jalaliDate(order.createdAt));
      row(L.customer, order.user?.name ?? '—');
      row(L.phone, order.user?.phone ?? '—');
      row(L.broker, order.user?.broker?.name ?? '—');
      doc.moveDown(0.8);

      // Order details
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.8);

      row(L.symbol, order.symbol);
      row(L.side, order.side === 'BUY' ? L.buy : L.sell);
      row(L.grams, Number(dec(order.grams)).toFixed(6));
      row(L.price, fmt(Number(dec(order.price))));
      row(L.amount, fmt(Number(dec(order.amount))));
      row(L.fee, fmt(Number(dec(order.fee))));
      doc.moveDown(0.8);

      // Status
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.8);

      const statusText = useVazir ? (STATUS_FA[order.status] ?? order.status) : order.status;
      row(L.status, statusText);

      if (order.reviewNote) {
        row(L.reviewNote, order.reviewNote);
      }

      // Footer
      doc.moveDown(2);
      doc.fontSize(9).fillColor('gray').text(L.footer, { align: 'center' });

      doc.end();
    });
  }
}
