import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { TradeError } from '../common/errors';
import { dec } from '../common/money';

// ── Jalali conversion (no external dep) ───────────────────────────────────

function toJalaali(gy: number, gm: number, gd: number) {
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const dv = (a: number, b: number) => Math.trunc(a / b);
  let jy = gy <= 1600 ? 0 : 979;
  gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    365 * gy + dv(gy2 + 3, 4) - dv(gy2 + 99, 100) + dv(gy2 + 399, 400) -
    80 + gd + gdm[gm - 1];
  jy += 33 * dv(days, 12053);
  days %= 12053;
  jy += 4 * dv(days, 1461);
  days %= 1461;
  if (days > 365) { jy += dv(days - 1, 365); days = (days - 1) % 365; }
  const jm = days < 186 ? 1 + dv(days, 31) : 7 + dv(days - 186, 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return { jy, jm, jd };
}

const JALALI_MONTHS = [
  'فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور',
  'مهر','آبان','آذر','دی','بهمن','اسفند',
];

function jalaliDateFull(d: Date): string {
  const { jy, jm, jd } = toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${jd} ${JALALI_MONTHS[jm - 1]} ${jy}  —  ${hh}:${mm}`;
}

// ── Persian digit helpers ─────────────────────────────────────────────────

const FA = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
function toFa(s: string | number): string {
  return String(s).replace(/\d/g, d => FA[+d]);
}
function faMoney(n: number): string {
  return toFa(Math.round(n).toLocaleString('en-US')) + ' تومان';
}
function faGrams(n: number): string {
  return toFa(Number(n).toFixed(4).replace(/\.?0+$/, '')) + ' گرم';
}

// ── Status & side labels ──────────────────────────────────────────────────

const STATUS_FA: Record<string, string> = {
  FILLED:           'انجام شده',
  APPROVED:         'تأیید شده',
  REJECTED:         'رد شده',
  FULFILLED:        'تحویل داده شده',
  PENDING_REVIEW:   'در انتظار بررسی',
  AWAITING_RECEIPT: 'در انتظار رسید',
};

const RECEIPT_STATUSES = new Set([
  'FILLED', 'APPROVED', 'REJECTED', 'FULFILLED', 'PENDING_REVIEW',
]);

// ── Font paths ────────────────────────────────────────────────────────────

const FONT_DIR  = path.join(process.cwd(), 'assets', 'fonts');
const FONT_REG  = path.join(FONT_DIR, 'Vazir.ttf');
// Bold variant from the vazirmatn npm package (copied alongside regular)
const FONT_BOLD = path.join(FONT_DIR, 'Vazir-Bold.ttf');

// Fallback: read Bold directly from node_modules if not yet copied
const FONT_BOLD_NM = path.join(
  process.cwd(), 'node_modules', 'vazirmatn', 'fonts', 'ttf',
  'Vazirmatn-Bold.ttf',
);

// ── Design tokens ─────────────────────────────────────────────────────────

const COLOR = {
  accent:     '#12a150',   // brand green
  accentDark: '#0d7a3c',
  gold:       '#c8972a',   // warm gold highlight
  textDark:   '#14171c',
  textMuted:  '#6b7280',
  border:     '#dde1e7',
  rowEven:    '#f5f6f9',
  rowOdd:     '#ffffff',
  headerBg:   '#0d7a3c',
  headerText: '#ffffff',
  badgeOk:    '#0f8a4c',
  badgeErr:   '#c62828',
  badgeWarn:  '#c98a00',
};

const PAGE_W   = 595;   // A4 pt
const PAGE_H   = 842;
const MARGIN_H = 48;    // left/right margin
const CONTENT_W = PAGE_W - MARGIN_H * 2;

@Injectable()
export class ReceiptService {
  private readonly logger = new Logger(ReceiptService.name);

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
            id: true, name: true, phone: true, brokerId: true,
            broker: { select: { name: true } },
          },
        },
      },
    });

    if (!order) throw new TradeError('سفارش یافت نشد', 404);

    // ── Auth ──────────────────────────────────────────────────────────────
    if (actor.role === 'CUSTOMER' && order.userId !== actor.userId)
      throw new TradeError('این سفارش متعلق به شما نیست', 403);
    if (actor.role === 'BROKER_MANAGER' || actor.role === 'BROKER_ADMIN') {
      if ((order.user?.brokerId ?? null) !== (actor.brokerId ?? null))
        throw new TradeError('این سفارش متعلق به مشتری شما نیست', 403);
    }

    if (!RECEIPT_STATUSES.has(order.status))
      throw new TradeError('رسید برای این وضعیت سفارش در دسترس نیست', 400);

    // ── Fonts ─────────────────────────────────────────────────────────────
    const hasReg  = fs.existsSync(FONT_REG);
    const hasBold = fs.existsSync(FONT_BOLD) || fs.existsSync(FONT_BOLD_NM);
    const boldSrc  = fs.existsSync(FONT_BOLD) ? FONT_BOLD : FONT_BOLD_NM;

    if (!hasReg) {
      this.logger.warn(
        `Vazir.ttf not found at ${FONT_REG} — receipt will fall back to Helvetica.`,
      );
    }

    // ── Build PDF ─────────────────────────────────────────────────────────
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 0,          // we control all margins manually
        info: {
          Title: `رسید سفارش ${order.ref}`,
          Author: order.user?.broker?.name ?? 'دلی گلد',
          Subject: 'رسید معامله طلا',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end',  () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      if (hasReg)  doc.registerFont('Vazir',      FONT_REG);
      if (hasBold) doc.registerFont('Vazir-Bold', boldSrc);

      const fontReg  = hasReg  ? 'Vazir'      : 'Helvetica';
      const fontBold = hasBold ? 'Vazir-Bold' : 'Helvetica-Bold';

      // ── Helpers ──────────────────────────────────────────────────────────

      /** Draw a right-aligned line of text (RTL) */
      const rtl = (
        text: string,
        x: number, y: number,
        opts: { font?: string; size?: number; color?: string; align?: 'left' | 'right' | 'center' | 'justify' } = {},
      ) => {
        doc
          .font(opts.font ?? fontReg)
          .fontSize(opts.size ?? 10)
          .fillColor(opts.color ?? COLOR.textDark)
          .text(text, x, y, {
            width: CONTENT_W,
            align: opts.align ?? 'right',
            features: ['rtla'],
          });
      };

      // Current Y cursor (we manage it manually for precision)
      let y = 0;

      // ────────────────────────────────────────────────────────────────────
      // 1. GREEN HEADER BAND
      // ────────────────────────────────────────────────────────────────────
      doc.rect(0, 0, PAGE_W, 110).fill(COLOR.headerBg);

      // Gold accent bar at very top
      doc.rect(0, 0, PAGE_W, 5).fill(COLOR.gold);

      // Broker / platform name
      doc
        .font(fontBold)
        .fontSize(20)
        .fillColor(COLOR.headerText)
        .text(order.user?.broker?.name ?? 'دلی گلد', MARGIN_H, 22, {
          width: CONTENT_W, align: 'right', features: ['rtla'],
        });

      // Subtitle
      doc
        .font(fontReg)
        .fontSize(11)
        .fillColor('rgba(255,255,255,0.75)')
        .text('رسید رسمی معامله طلا', MARGIN_H, 50, {
          width: CONTENT_W, align: 'right', features: ['rtla'],
        });

      // Ref badge (right side) — white pill
      const refText = order.ref ?? orderId.slice(0, 8);
      doc.roundedRect(MARGIN_H, 70, 160, 26, 5).fill('rgba(255,255,255,0.15)');
      doc
        .font(fontBold)
        .fontSize(12)
        .fillColor(COLOR.headerText)
        .text(refText, MARGIN_H, 76, { width: 160, align: 'center' });

      // Date (left side)
      doc
        .font(fontReg)
        .fontSize(9)
        .fillColor('rgba(255,255,255,0.80)')
        .text(jalaliDateFull(order.createdAt), PAGE_W - MARGIN_H - 200, 78, {
          width: 200, align: 'left',
        });

      y = 126;

      // ────────────────────────────────────────────────────────────────────
      // 2. STATUS BADGE
      // ────────────────────────────────────────────────────────────────────
      const statusText  = STATUS_FA[order.status] ?? order.status;
      const statusColor =
        order.status === 'REJECTED'                  ? COLOR.badgeErr  :
        order.status === 'PENDING_REVIEW' ||
        order.status === 'AWAITING_RECEIPT'          ? COLOR.badgeWarn :
        COLOR.badgeOk;

      doc.roundedRect(MARGIN_H, y, 140, 28, 6).fill(statusColor);
      doc
        .font(fontBold)
        .fontSize(11)
        .fillColor('#ffffff')
        .text(statusText, MARGIN_H, y + 7, { width: 140, align: 'center' });

      y += 48;

      // ────────────────────────────────────────────────────────────────────
      // 3. INFO TABLE helper
      // ────────────────────────────────────────────────────────────────────

      /** Draw one row of a two-column table. Returns new y after the row. */
      const tableRow = (
        label: string,
        value: string,
        rowIndex: number,
        yPos: number,
      ): number => {
        const ROW_H = 30;
        const bg = rowIndex % 2 === 0 ? COLOR.rowEven : COLOR.rowOdd;

        // Background
        doc.rect(MARGIN_H, yPos, CONTENT_W, ROW_H).fill(bg);

        // Subtle left border accent
        doc.rect(MARGIN_H, yPos, 3, ROW_H).fill(COLOR.accent);

        // Label (right-aligned, muted)
        doc
          .font(fontBold)
          .fontSize(9.5)
          .fillColor(COLOR.textMuted)
          .text(label, MARGIN_H + 4, yPos + 9, {
            width: CONTENT_W / 2 - 8,
            align: 'right',
            features: ['rtla'],
          });

        // Value (left-side of same row, bold, dark)
        doc
          .font(fontBold)
          .fontSize(10)
          .fillColor(COLOR.textDark)
          .text(value, MARGIN_H + CONTENT_W / 2, yPos + 8, {
            width: CONTENT_W / 2 - 4,
            align: 'right',
            features: ['rtla'],
          });

        // Bottom border
        doc
          .moveTo(MARGIN_H, yPos + ROW_H)
          .lineTo(MARGIN_H + CONTENT_W, yPos + ROW_H)
          .strokeColor(COLOR.border)
          .lineWidth(0.5)
          .stroke();

        return yPos + ROW_H;
      };

      // ────────────────────────────────────────────────────────────────────
      // 4. SECTION: مشخصات مشتری
      // ────────────────────────────────────────────────────────────────────
      const sectionTitle = (title: string, yPos: number): number => {
        doc
          .font(fontBold)
          .fontSize(10)
          .fillColor(COLOR.accent)
          .text(title, MARGIN_H, yPos, {
            width: CONTENT_W, align: 'right', features: ['rtla'],
          });
        doc
          .moveTo(MARGIN_H, yPos + 16)
          .lineTo(MARGIN_H + CONTENT_W, yPos + 16)
          .strokeColor(COLOR.accent)
          .lineWidth(1)
          .stroke();
        return yPos + 24;
      };

      y = sectionTitle('مشخصات مشتری', y);

      let ri = 0;
      y = tableRow('نام مشتری',   order.user?.name  ?? '—',  ri++, y);
      y = tableRow('شماره تماس',  order.user?.phone ?? '—',  ri++, y);
      y = tableRow('کارگزاری',    order.user?.broker?.name ?? '—', ri++, y);
      y += 18;

      // ────────────────────────────────────────────────────────────────────
      // 5. SECTION: جزئیات معامله
      // ────────────────────────────────────────────────────────────────────
      y = sectionTitle('جزئیات معامله', y);

      const sideText = order.side === 'BUY' ? 'خرید' : 'فروش';
      const amountN  = Number(dec(order.amount));
      const feeN     = Number(dec(order.fee));
      const netN     = order.side === 'BUY' ? amountN + feeN : amountN - feeN;

      ri = 0;
      y = tableRow('نماد معاملاتی', order.symbol,                          ri++, y);
      y = tableRow('نوع معامله',   sideText,                               ri++, y);
      y = tableRow('وزن',          faGrams(Number(dec(order.grams))),       ri++, y);
      y = tableRow('قیمت هر گرم',  faMoney(Number(dec(order.price))),       ri++, y);
      y = tableRow('مبلغ کل',      faMoney(amountN),                        ri++, y);
      y = tableRow('کارمزد',       faMoney(feeN),                           ri++, y);

      // Net amount row — highlighted
      const NET_H = 34;
      doc.rect(MARGIN_H, y, CONTENT_W, NET_H).fill(COLOR.accent);
      doc
        .font(fontBold).fontSize(10).fillColor('#ffffff')
        .text('مبلغ خالص', MARGIN_H + 4, y + 10, {
          width: CONTENT_W / 2 - 8, align: 'right', features: ['rtla'],
        });
      doc
        .font(fontBold).fontSize(12).fillColor('#ffffff')
        .text(faMoney(netN), MARGIN_H + CONTENT_W / 2, y + 9, {
          width: CONTENT_W / 2 - 4, align: 'right', features: ['rtla'],
        });
      y += NET_H + 18;

      // ────────────────────────────────────────────────────────────────────
      // 6. SECTION: وضعیت و یادداشت (only if there's a note)
      // ────────────────────────────────────────────────────────────────────
      if (order.reviewNote) {
        y = sectionTitle('یادداشت بررسی', y);
        // Note box
        doc.rect(MARGIN_H, y, CONTENT_W, 48).fill(COLOR.rowEven);
        doc.rect(MARGIN_H, y, 3, 48).fill(
          order.status === 'REJECTED' ? COLOR.badgeErr : COLOR.accent,
        );
        doc
          .font(fontReg).fontSize(10).fillColor(COLOR.textDark)
          .text(order.reviewNote, MARGIN_H + 10, y + 8, {
            width: CONTENT_W - 14, align: 'right', features: ['rtla'],
          });
        y += 64;
      }

      // ────────────────────────────────────────────────────────────────────
      // 7. FOOTER BAND
      // ────────────────────────────────────────────────────────────────────
      const footerY = PAGE_H - 58;
      doc.rect(0, footerY, PAGE_W, 58).fill('#f5f6f9');
      doc
        .moveTo(0, footerY).lineTo(PAGE_W, footerY)
        .strokeColor(COLOR.border).lineWidth(1).stroke();

      // Gold accent bottom bar
      doc.rect(0, PAGE_H - 5, PAGE_W, 5).fill(COLOR.gold);

      doc
        .font(fontReg).fontSize(8.5).fillColor(COLOR.textMuted)
        .text(
          'این سند به‌صورت خودکار و الکترونیکی صادر شده است و نیازی به مهر و امضا ندارد.',
          MARGIN_H, footerY + 12,
          { width: CONTENT_W, align: 'center', features: ['rtla'] },
        );
      doc
        .font(fontReg).fontSize(8).fillColor(COLOR.textMuted)
        .text(
          `شماره سفارش: ${order.ref ?? '—'}   |   تاریخ صدور: ${jalaliDateFull(new Date())}`,
          MARGIN_H, footerY + 30,
          { width: CONTENT_W, align: 'center' },
        );

      doc.end();
    });
  }
}
