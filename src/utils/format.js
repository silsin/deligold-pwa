/** Persian digit + money/time formatting shared by every view. */

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']

/** Convert every ASCII digit in a string to its Persian counterpart. */
export function toFa(value) {
  return String(value).replace(/\d/g, d => FA_DIGITS[Number(d)])
}

/** Thousands separator without decimals (prices are whole Toman). */
export function faNumber(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return toFa(Math.round(n).toLocaleString('en-US'))
}

/** Money with the unit the symbol trades in. */
export function faMoney(value, unit = 'تومان') {
  return `${faNumber(value)} ${unit}`
}

/** Signed delta, e.g. «−۴۷٬۵۸۱» / «+۵۹۰٬۷۲۰». */
export function faDelta(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n === 0) return toFa(0)
  const sign = n > 0 ? '+' : '−'
  return `${sign}${faNumber(Math.abs(n))}`
}

/** 0.18 → «۰٫۱۸٪» with a Persian decimal separator. */
export function faPercent(value, digits = 2) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return `${toFa(n.toFixed(digits)).replace('.', '٫')}٪`
}

/** Weight in grams, up to 3 decimals, trailing zeros trimmed. */
export function faWeight(grams) {
  const n = Number(grams)
  if (!Number.isFinite(n)) return '—'
  const text = n.toFixed(3).replace(/\.?0+$/, '')
  return toFa(text).replace('.', '٫')
}

/** HH:MM:SS in Persian digits — the "last update" clock. */
export function faTime(ts) {
  const d = ts instanceof Date ? ts : new Date(Number(ts))
  if (Number.isNaN(d.getTime())) return '—'
  const pad = v => String(v).padStart(2, '0')
  return toFa(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`)
}

/** "۲ دقیقه پیش" style relative time. */
export function faAgo(ts) {
  const d = ts instanceof Date ? ts : new Date(ts)
  const seconds = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000))
  if (Number.isNaN(seconds)) return '—'
  if (seconds < 60) return `${toFa(seconds)} ثانیه پیش`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${toFa(minutes)} دقیقه پیش`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${toFa(hours)} ساعت پیش`
  return `${toFa(Math.floor(hours / 24))} روز پیش`
}

/** Bucket start → short axis label (HH:MM for intraday, M/D for days). */
export function faAxisTime(ts, range) {
  const d = new Date(Number(ts))
  if (Number.isNaN(d.getTime())) return ''
  const pad = v => String(v).padStart(2, '0')
  if (range === '7d' || range === '30d') {
    return toFa(`${d.getMonth() + 1}/${d.getDate()}`)
  }
  return toFa(`${pad(d.getHours())}:${pad(d.getMinutes())}`)
}

/** Persian labels for the wholesale order lifecycle. */
const STATUS_LABELS = {
  PENDING: 'در انتظار تأیید',
  CONFIRMED: 'تأیید شد',
  PREPARING: 'در حال آماده‌سازی',
  DELIVERED: 'تحویل شد',
  CANCELLED: 'لغو شد',
  MANUAL: 'ثبت دستی',
  AWAITING_RECEIPT: 'در انتظار رسید',
  APPROVED: 'تأیید شده',
  FULFILLED: 'انجام شده',
  REJECTED: 'رد شده'
}

/** Each status maps to a colour class the views can style. */
const STATUS_KIND = {
  PENDING: 'warn',
  CONFIRMED: 'info',
  PREPARING: 'info',
  DELIVERED: 'ok',
  CANCELLED: 'bad',
  MANUAL: 'warn',
  AWAITING_RECEIPT: 'warn',
  APPROVED: 'info',
  FULFILLED: 'ok',
  REJECTED: 'bad'
}

export function statusLabel(status) {
  return STATUS_LABELS[status] ?? status ?? '—'
}

export function statusKind(status) {
  return STATUS_KIND[status] ?? 'muted'
}

/** Ledger entry kind → Persian, with its sign already baked into the text. */
const LEDGER_KINDS = {
  ORDER: 'خرید نسیه',
  CANCEL: 'برگشت بدهی (لغو)',
  PAYMENT: 'پرداخت',
  DEPOSIT: 'واریز'
}

export function ledgerKindLabel(kind) {
  return LEDGER_KINDS[kind] ?? kind ?? '—'
}

/** Order code shown to the customer: «#۱۲۳۴». */
export function orderCode(code) {
  return `#${toFa(code)}`
}

// ── Wallet statement (گردش حساب) ─────────────────────────────────────────────

/**
 * Wallet transaction kinds → Persian label + Material icon + colour tone.
 * `tone` drives the sign styling: `in`/`out` for cash that moved, `swap` for a
 * gold→gold conversion (no cash), and `fee` for commission (reference only —
 * it is already inside the amounts of the legs around it).
 */
export const TX_KIND = {
  DEPOSIT: { label: 'واریز', icon: 'south_west', tone: 'in' },
  WITHDRAW: { label: 'برداشت', icon: 'north_east', tone: 'out' },
  BUY: { label: 'خرید طلا', icon: 'add_circle', tone: 'out' },
  SELL: { label: 'فروش طلا', icon: 'remove_circle', tone: 'in' },
  CONVERT: { label: 'تبدیل', icon: 'swap_horiz', tone: 'swap' },
  FEE: { label: 'کارمزد', icon: 'percent', tone: 'fee' }
}

/** Persian label for a wallet transaction kind; unknown values pass through. */
export function faTxKind(kind) {
  return TX_KIND[kind]?.label ?? kind ?? '—'
}

export function txKindIcon(kind) {
  return TX_KIND[kind]?.icon ?? 'receipt_long'
}

export function txKindTone(kind) {
  return TX_KIND[kind]?.tone ?? 'muted'
}

/**
 * Signed amount for the statement. `CONVERT` rows always carry a zero cash
 * impact, so show a dash rather than a misleading «۰» with a direction.
 */
export function faTxAmount(tx) {
  const n = Number(tx?.amount)
  if (!Number.isFinite(n) || n === 0) return '—'
  return `${n > 0 ? '+' : '−'}${faNumber(Math.abs(n))}`
}

export function faCompact(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  if (n >= 1_000_000_000) return `${toFa((n / 1_000_000_000).toFixed(2)).replace('.', '٫')} میلیارد`
  if (n >= 1_000_000) return `${toFa((n / 1_000_000).toFixed(1)).replace('.', '٫')}م`
  return faNumber(n)
}

const TERMS_KEY = 'dg_terms_accepted'

/** True once the user accepted the manager terms on this device. */
export function termsAccepted() {
  try {
    return localStorage.getItem(TERMS_KEY) === '1'
  } catch {
    return false
  }
}

/** Standard Gregorian → Jalali conversion (works for current-era dates). */
function toJalaali(gy, gm, gd) {
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
  const div = (a, b) => Math.trunc(a / b)
  let jy = gy <= 1600 ? 0 : 979
  gy -= gy <= 1600 ? 621 : 1600
  const gy2 = gm > 2 ? gy + 1 : gy
  let days =
    365 * gy +
    div(gy2 + 3, 4) -
    div(gy2 + 99, 100) +
    div(gy2 + 399, 400) -
    80 +
    gd +
    gdm[gm - 1]
  jy += 33 * div(days, 12053)
  days %= 12053
  jy += 4 * div(days, 1461)
  days %= 1461
  if (days > 365) {
    jy += div(days - 1, 365)
    days = (days - 1) % 365
  }
  const jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30)
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30)
  return { jy, jm, jd }
}

const FA_DAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه']

/** «۱۴۰۴/۷/۱۶ پنجشنبه» — Jalali date + weekday in Persian digits. */
export function faJalaliDate(ts) {
  const d = ts instanceof Date ? ts : new Date(Number(ts))
  if (Number.isNaN(d.getTime())) return ''
  const { jy, jm, jd } = toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate())
  return `${toFa(`${jy}/${jm}/${jd}`)} ${FA_DAYS[d.getDay()]}`
}

/** «۱۴۰۴/۷/۱۶ پنجشنبه ۱۳:۵۱:۰۵» — full board timestamp. */
export function faJalaliDateTime(ts) {
  const date = faJalaliDate(ts)
  if (!date) return ''
  return `${date} ${faTime(ts)}`
}

// ── Wholesale ordering ──────────────────────────────────────────────────────

export const ORDER_STATUS = {
  PENDING: { label: 'در انتظار تأیید', tone: 'pending', icon: 'schedule' },
  CONFIRMED: { label: 'تأیید شده', tone: 'confirmed', icon: 'check_circle' },
  PREPARING: { label: 'در حال آماده‌سازی', tone: 'preparing', icon: 'inventory_2' },
  DELIVERED: { label: 'تحویل شده', tone: 'delivered', icon: 'local_shipping' },
  CANCELLED: { label: 'لغو شده', tone: 'cancelled', icon: 'cancel' },
  MANUAL: { label: 'ثبت دستی', tone: 'pending', icon: 'edit_note' },
  AWAITING_RECEIPT: { label: 'در انتظار رسید', tone: 'pending', icon: 'receipt_long' },
  APPROVED: { label: 'تأیید شده', tone: 'confirmed', icon: 'check_circle' },
  FULFILLED: { label: 'انجام شده', tone: 'delivered', icon: 'local_shipping' },
  REJECTED: { label: 'رد شده', tone: 'cancelled', icon: 'cancel' }
}

/** Persian label for an order status; unknown values fall back to the raw text. */
export function faStatus(status) {
  return ORDER_STATUS[status]?.label ?? status ?? '—'
}

export function statusTone(status) {
  return ORDER_STATUS[status]?.tone ?? 'pending'
}

export function statusIcon(status) {
  return ORDER_STATUS[status]?.icon ?? 'help'
}

/** The visible progress of an order, 0..1, for the status rail. */
export function statusStep(status) {
  const order = ['MANUAL', 'AWAITING_RECEIPT', 'APPROVED', 'FULFILLED']
  const i = order.indexOf(status)
  return i < 0 ? 0 : (i + 1) / order.length
}

export const LEDGER_KIND = {
  ORDER: { label: 'بدهی سفارش', icon: 'add_shopping_cart' },
  PAYMENT: { label: 'پرداخت', icon: 'payments' },
  ADJUST: { label: 'اصلاح حساب', icon: 'tune' }
}

export function faLedgerKind(kind) {
  return LEDGER_KIND[kind]?.label ?? kind ?? '—'
}

export function ledgerKindIcon(kind) {
  return LEDGER_KIND[kind]?.icon ?? 'receipt_long'
}

/** `ORDER-1042` style human-readable order reference. */
export function faOrderCode(code) {
  return `سفارش ${toFa(code ?? 0)}`
}


