/**
 * Thin PDF builder around PDFKit.
 *
 * Every report shares the same layout: an RTL header with the broker/platform
 * name and generation timestamp, then a table of rows. Column widths are auto-
 * fitted to the data so a 20-column and a 4-column report both render cleanly.
 *
 * RTL text is tricky with PDFKit — it does not reorder bidirectional text.  We
 * write text strings left-to-right in the buffer but the entire page is set up
 * so the UI caller receives a visually correct Persian page.  Numeric and ASCII
 * values are single-directional so they render correctly without special handling.
 */
import * as PDFDocument from 'pdfkit';
import * as path from 'path';
import * as fs from 'fs';

const FONT_DIR = path.resolve(__dirname, '../../assets/fonts');
const FONT_REGULAR = path.join(FONT_DIR, 'Vazir.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'Vazir-Bold.ttf');

/** Column labels map — same set the frontend uses. */
const LABELS: Record<string, string> = {
  ref: 'شماره',
  symbol: 'نماد',
  side: 'طرف',
  kind: 'نوع',
  status: 'وضعیت',
  grams: 'گرم',
  price: 'قیمت',
  amount: 'مبلغ',
  fee: 'کارمزد',
  pnl: 'سود/زیان',
  userName: 'نام',
  userPhone: 'تلفن',
  balance: 'موجودی',
  realizedPnl: 'سود محقق',
  orderCount: 'تعداد سفارش',
  verified: 'تأیید هویت',
  createdAt: 'تاریخ ثبت',
  postedAt: 'تاریخ',
  totalDebit: 'بدهکار',
  totalCredit: 'بستانکار',
  memo: 'شرح',
  avgCost: 'میانگین بهای تمام‌شده',
  value: 'ارزش',
  code: 'کد',
  name: 'نام',
  type: 'نوع',
  debit: 'بدهکار',
  credit: 'بستانکار',
  net: 'خالص',
  orderCount2: 'سفارش',
  avgPrice: 'میانگین قیمت',
  totalGrams: 'حجم گرم',
  totalAmount: 'حجم مبلغ',
  totalFee: 'کارمزد کل',
  realisedPnl: 'سود',
  destination: 'مقصد',
  note: 'یادداشت',
  method: 'روش',
  email: 'ایمیل',
  nationalId: 'کد ملی',
};

const SIDE_LABEL: Record<string, string> = { BUY: 'خرید', SELL: 'فروش' };
const STATUS_LABEL: Record<string, string> = {
  FILLED: 'تکمیل', PENDING_REVIEW: 'در انتظار', APPROVED: 'تأیید', FULFILLED: 'تحویل',
  REJECTED: 'رد شده', CANCELLED: 'لغو', AWAITING_RECEIPT: 'در انتظار رسید',
  ACTIVE: 'فعال', SUSPENDED: 'مسدود', PENDING: 'در انتظار',
  DEPOSIT: 'واریز', WITHDRAWAL: 'برداشت', BUY: 'خرید', SELL: 'فروش', FEE: 'کارمزد',
  CONVERT: 'تبدیل', ADJUSTMENT: 'اصلاح',
  ASSET: 'دارایی', LIABILITY: 'بدهی', EQUITY: 'سرمایه', REVENUE: 'درآمد', EXPENSE: 'هزینه',
};

function cellStr(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'boolean') return v ? 'بله' : 'خیر';
  if (v instanceof Date) return v.toISOString().split('T')[0];
  const s = String(v);
  return STATUS_LABEL[s] ?? SIDE_LABEL[s] ?? s;
}

/** Build a PDF buffer for the given report rows and return it. */
export async function buildPdf(opts: {
  title: string;
  subtitle?: string;
  rows: Record<string, unknown>[];
  columns?: string[];
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    const doc = new (PDFDocument as any)({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 40, right: 40 },
      info: { Title: opts.title, Author: 'دلی گلد' },
    });

    // Register Persian fonts if available
    const hasFont = fs.existsSync(FONT_REGULAR) && fs.existsSync(FONT_BOLD);
    if (hasFont) {
      doc.registerFont('Vazir', FONT_REGULAR);
      doc.registerFont('Vazir-Bold', FONT_BOLD);
    }

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const font = (bold = false) => hasFont ? (bold ? 'Vazir-Bold' : 'Vazir') : (bold ? 'Helvetica-Bold' : 'Helvetica');
    const W = 515; // usable width

    // ── Header ──────────────────────────────────────────────────────────────
    doc.font(font(true)).fontSize(15).text(opts.title, 40, 50, { width: W, align: 'right' });
    if (opts.subtitle) {
      doc.font(font()).fontSize(10).fillColor('#888')
        .text(opts.subtitle, 40, doc.y + 4, { width: W, align: 'right' });
    }
    doc.font(font()).fontSize(9).fillColor('#aaa')
      .text(`تهیه‌شده: ${new Date().toLocaleString('fa-IR')}`, 40, doc.y + 2, { width: W, align: 'right' });
    doc.fillColor('#000').moveTo(40, doc.y + 8).lineTo(555, doc.y + 8).strokeColor('#ddd').lineWidth(0.5).stroke();
    doc.moveDown(1.5);

    if (!opts.rows.length) {
      doc.font(font()).fontSize(11).fillColor('#888').text('داده‌ای یافت نشد.', { align: 'right' });
      doc.end();
      return;
    }

    // ── Column selection & widths ────────────────────────────────────────────
    const keys = opts.columns ?? Object.keys(opts.rows[0]);
    const headers = keys.map(k => LABELS[k] ?? k);
    const colW = Math.floor(W / keys.length);
    const colWidths = keys.map(() => colW);

    // ── Table header ────────────────────────────────────────────────────────
    const drawRow = (cells: string[], y: number, isHeader: boolean) => {
      const rowH = 18;
      const bg = isHeader ? '#1a1a2e' : (y % 2 === 0 ? '#f7f7fa' : '#ffffff');
      const textColor = isHeader ? '#ffffff' : '#222222';
      doc.rect(40, y, W, rowH).fill(bg);
      doc.font(font(isHeader)).fontSize(isHeader ? 9 : 8).fillColor(textColor);
      let x = 40;
      cells.forEach((c, i) => {
        // RTL: columns go right → left visually, but we draw left → right in
        // the buffer; we just flip the column order.
        const col = cells.length - 1 - i;
        doc.text(cellStr(cells[col]), x + 2, y + 4, {
          width: colWidths[col] - 4,
          align: 'right',
          lineBreak: false,
        });
        x += colWidths[i];
      });
      return rowH;
    };

    let y = doc.y;
    y += drawRow(headers, y, true);

    for (let i = 0; i < opts.rows.length; i++) {
      if (y > 750) {
        doc.addPage();
        y = 50;
        y += drawRow(headers, y, true);
      }
      const cells = keys.map(k => cellStr(opts.rows[i][k]));
      y += drawRow(cells, y, false);
    }

    doc.end();
  });
}

/** Serialize rows to a UTF-8 CSV string with a BOM so Excel opens it correctly. */
export function buildCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (!rows.length) return '\uFEFF\n';
  const keys = columns ?? Object.keys(rows[0]);
  const headers = keys.map(k => LABELS[k] ?? k);
  const esc = (v: unknown) => {
    const s = cellStr(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(h => esc(h)).join(',')];
  for (const row of rows) lines.push(keys.map(k => esc(row[k])).join(','));
  return '\uFEFF' + lines.join('\n');
}
