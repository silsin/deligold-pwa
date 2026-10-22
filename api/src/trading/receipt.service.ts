import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TradeError } from '../common/errors';
import { dec } from '../common/money';

// ── Jalali ────────────────────────────────────────────────────────────────

function toJalaali(gy: number, gm: number, gd: number) {
  const gdm = [0,31,59,90,120,151,181,212,243,273,304,334];
  const dv = (a: number, b: number) => Math.trunc(a / b);
  let jy = gy <= 1600 ? 0 : 979;
  gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 365*gy + dv(gy2+3,4) - dv(gy2+99,100) + dv(gy2+399,400) - 80 + gd + gdm[gm-1];
  jy += 33 * dv(days, 12053); days %= 12053;
  jy += 4  * dv(days, 1461);  days %= 1461;
  if (days > 365) { jy += dv(days-1, 365); days = (days-1) % 365; }
  const jm = days < 186 ? 1 + dv(days, 31) : 7 + dv(days-186, 30);
  const jd = 1 + (days < 186 ? days % 31 : (days-186) % 30);
  return { jy, jm, jd };
}

const MONTHS_FA = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];

function toFa(s: string | number): string {
  return String(s).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]);
}

function jalaliStr(d: Date): string {
  const { jy, jm, jd } = toJalaali(d.getFullYear(), d.getMonth()+1, d.getDate());
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  return `${toFa(jd)} ${MONTHS_FA[jm-1]} ${toFa(jy)}  —  ${toFa(hh)}:${toFa(mm)}`;
}

function fmtMoney(n: number): string {
  return toFa(Math.round(n).toLocaleString('en-US')) + ' تومان';
}
function fmtGrams(n: number): string {
  const s = Number(n).toFixed(4).replace(/\.?0+$/, '');
  return toFa(s) + ' گرم';
}

// ── Status ────────────────────────────────────────────────────────────────

const STATUS_FA: Record<string, string> = {
  FILLED:           'انجام شده',
  APPROVED:         'تأیید شده',
  REJECTED:         'رد شده',
  FULFILLED:        'تحویل داده شده',
  PENDING_REVIEW:   'در انتظار بررسی',
  AWAITING_RECEIPT: 'در انتظار رسید',
};

const RECEIPT_STATUSES = new Set(['FILLED','APPROVED','REJECTED','FULFILLED','PENDING_REVIEW']);

// ── Service ───────────────────────────────────────────────────────────────

@Injectable()
export class ReceiptService {
  constructor(private readonly prisma: PrismaService) {}

  async generateOrderReceiptHtml(
    orderId: string,
    actor: { userId: string; role: string; brokerId: string | null },
  ): Promise<string> {

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

    if (actor.role === 'CUSTOMER' && order.userId !== actor.userId)
      throw new TradeError('این سفارش متعلق به شما نیست', 403);
    if (actor.role === 'BROKER_MANAGER' || actor.role === 'BROKER_ADMIN') {
      if ((order.user?.brokerId ?? null) !== (actor.brokerId ?? null))
        throw new TradeError('این سفارش متعلق به مشتری شما نیست', 403);
    }

    if (!RECEIPT_STATUSES.has(order.status))
      throw new TradeError('رسید برای این وضعیت سفارش در دسترس نیست', 400);

    const isBuy      = order.side === 'BUY';
    const amountN    = Number(dec(order.amount));
    const feeN       = Number(dec(order.fee));
    const netN       = isBuy ? amountN + feeN : amountN - feeN;
    const statusText = STATUS_FA[order.status] ?? order.status;
    const brokerName = order.user?.broker?.name ?? 'دلی گلد';

    const statusColor =
      order.status === 'REJECTED'                                 ? '#c62828' :
      order.status === 'PENDING_REVIEW' || order.status === 'AWAITING_RECEIPT' ? '#c98a00' :
      '#0f8a4c';

    const rows = (items: [string, string][]) =>
      items.map(([label, value], i) => `
        <tr class="${i % 2 === 0 ? 'even' : 'odd'}">
          <td class="label">${label}</td>
          <td class="value">${value}</td>
        </tr>`).join('');

    return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>رسید سفارش ${order.ref}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;700;900&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Vazirmatn', Tahoma, sans-serif;
    background: #f0f2f5;
    color: #14171c;
    direction: rtl;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .page {
    max-width: 680px;
    margin: 32px auto;
    background: #fff;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 4px 32px rgba(0,0,0,0.12);
  }

  /* ── Header ── */
  .header {
    background: linear-gradient(135deg, #0d7a3c 0%, #12a150 100%);
    padding: 32px 32px 28px;
    position: relative;
    overflow: hidden;
  }
  .header::after {
    content: '';
    position: absolute;
    top: -40px; left: -40px;
    width: 200px; height: 200px;
    border-radius: 50%;
    background: rgba(255,255,255,0.06);
  }
  .header-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 20px;
  }
  .broker-name {
    font-size: 24px;
    font-weight: 900;
    color: #fff;
    line-height: 1.2;
  }
  .receipt-label {
    font-size: 13px;
    color: rgba(255,255,255,0.7);
    margin-top: 4px;
  }
  .ref-badge {
    background: rgba(255,255,255,0.18);
    border: 1px solid rgba(255,255,255,0.3);
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    padding: 6px 16px;
    border-radius: 999px;
    white-space: nowrap;
    backdrop-filter: blur(4px);
  }
  .header-date {
    font-size: 12px;
    color: rgba(255,255,255,0.65);
  }
  .gold-bar {
    height: 4px;
    background: linear-gradient(90deg, #c8972a, #e8b84b, #c8972a);
  }

  /* ── Status pill ── */
  .status-wrap {
    padding: 16px 32px 0;
  }
  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 7px 18px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 700;
    color: #fff;
  }
  .status-pill::before {
    content: '';
    width: 8px; height: 8px;
    border-radius: 50%;
    background: rgba(255,255,255,0.6);
    flex-shrink: 0;
  }

  /* ── Body ── */
  .body { padding: 20px 32px 28px; display: flex; flex-direction: column; gap: 22px; }

  /* ── Section ── */
  .section-title {
    font-size: 12px;
    font-weight: 700;
    color: #12a150;
    letter-spacing: 0.03em;
    padding-bottom: 8px;
    border-bottom: 2px solid #e8f5ef;
    margin-bottom: 0;
  }

  /* ── Table ── */
  table { width: 100%; border-collapse: collapse; }
  tr.even { background: #f8faf9; }
  tr.odd  { background: #fff; }
  td {
    padding: 10px 14px;
    font-size: 13px;
    border-bottom: 1px solid #eef0f3;
  }
  td.label {
    color: #6b7280;
    font-weight: 700;
    width: 42%;
  }
  td.value {
    font-weight: 700;
    color: #14171c;
    text-align: left;
    direction: ltr;
    unicode-bidi: embed;
  }
  tr:last-child td { border-bottom: none; }

  /* ── Net amount highlight ── */
  .net-row {
    background: #12a150 !important;
    border-radius: 8px;
    overflow: hidden;
  }
  .net-row td { border-bottom: none !important; }
  .net-row td.label { color: rgba(255,255,255,0.85) !important; font-size: 13px; }
  .net-row td.value {
    color: #fff !important;
    font-size: 16px !important;
    font-weight: 900 !important;
  }

  /* ── Review note ── */
  .note-box {
    background: #fafafa;
    border-right: 4px solid #12a150;
    border-radius: 8px;
    padding: 13px 16px;
    font-size: 13px;
    color: #374151;
    line-height: 1.8;
  }
  .note-box.is-reject { border-color: #c62828; }

  /* ── Footer ── */
  .footer {
    background: #f5f7fa;
    border-top: 1px solid #e5e7eb;
    padding: 16px 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .footer-text {
    font-size: 11px;
    color: #9ca3af;
    line-height: 1.7;
  }
  .print-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 9px 20px;
    border-radius: 9px;
    background: #12a150;
    color: #fff;
    font-family: 'Vazirmatn', Tahoma, sans-serif;
    font-size: 13px;
    font-weight: 700;
    border: none;
    cursor: pointer;
  }
  .print-btn:hover { background: #0d7a3c; }

  /* ── Print ── */
  @media print {
    body { background: #fff; }
    .page { margin: 0; border-radius: 0; box-shadow: none; max-width: 100%; }
    .print-btn { display: none; }
    .footer { border-top: 1px solid #e5e7eb; }
  }
</style>
</head>
<body>

<div class="page">

  <!-- Gold top bar -->
  <div class="gold-bar"></div>

  <!-- Header -->
  <div class="header">
    <div class="header-top">
      <div>
        <div class="broker-name">${brokerName}</div>
        <div class="receipt-label">رسید رسمی معامله طلا</div>
      </div>
      <div class="ref-badge">${order.ref ?? orderId.slice(0,8)}</div>
    </div>
    <div class="header-date">${jalaliStr(order.createdAt)}</div>
  </div>

  <!-- Status -->
  <div class="status-wrap" style="margin-bottom:4px">
    <div class="status-pill" style="background:${statusColor}">${statusText}</div>
  </div>

  <!-- Body -->
  <div class="body">

    <!-- مشخصات مشتری -->
    <div>
      <div class="section-title">مشخصات مشتری</div>
      <table>
        ${rows([
          ['نام مشتری',    order.user?.name  ?? '—'],
          ['شماره تماس',   order.user?.phone ?? '—'],
          ['کارگزاری',     brokerName],
        ])}
      </table>
    </div>

    <!-- جزئیات معامله -->
    <div>
      <div class="section-title">جزئیات معامله</div>
      <table>
        ${rows([
          ['نماد',         order.symbol],
          ['نوع معامله',   isBuy ? 'خرید' : 'فروش'],
          ['وزن',          fmtGrams(Number(dec(order.grams)))],
          ['قیمت هر گرم',  fmtMoney(Number(dec(order.price)))],
          ['مبلغ معامله',  fmtMoney(amountN)],
          ['کارمزد',       fmtMoney(feeN)],
        ])}
        <tr class="net-row">
          <td class="label">مبلغ خالص پرداختی</td>
          <td class="value">${fmtMoney(netN)}</td>
        </tr>
      </table>
    </div>

    ${order.reviewNote ? `
    <!-- یادداشت -->
    <div>
      <div class="section-title">یادداشت بررسی</div>
      <div class="note-box ${order.status === 'REJECTED' ? 'is-reject' : ''}">${order.reviewNote}</div>
    </div>` : ''}

  </div>

  <!-- Footer -->
  <div class="footer">
    <div class="footer-text">
      این سند به‌صورت خودکار و الکترونیکی صادر شده است.<br>
      شماره سفارش: ${order.ref ?? '—'} &nbsp;|&nbsp; تاریخ صدور: ${jalaliStr(new Date())}
    </div>
    <button class="print-btn" onclick="window.print()">
      🖨 چاپ / ذخیره PDF
    </button>
  </div>

</div>

</body>
</html>`;
  }
}
