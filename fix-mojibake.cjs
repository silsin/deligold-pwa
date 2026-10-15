// One-shot repair of Windows-1252 mojibake in TradingView.vue (lines are fixed
// by index so we never have to match the corrupted bytes). Safe: preserves BOM,
// line endings and each line's original indentation.
const fs = require('fs');
const path = 'D:/delly-pwa/src/views/TradingView.vue';

let s = fs.readFileSync(path, 'utf8');
let bom = '';
if (s.charCodeAt(0) === 0xfeff) { bom = '\uFEFF'; s = s.slice(1); }
const nl = s.includes('\r\n') ? '\r\n' : '\n';
const lines = s.split(nl);

// index (0-based) -> corrected line content (indent re-applied automatically)
const Z = '\u200C'; // ZWNJ
const EM = '\u2014'; // em dash
const EL = '\u2026'; // ellipsis
const fixes = {
  3:  `<button type="button" class="tv__back" aria-label="بازگشت به قیمت${Z}ها" @click="$router.push('/')">`,
  8:  `<span class="tv__div">/تومان</span>`,
  9:  `<span class="tv__caret">\u25BC</span>`,
  24: `در حال دریافت نمودار${EL}`,
  27: `تاریخچه${Z}ای برای این نماد ثبت نشده ${EM} با اولین داده${Z}ها نمودار ساخته می${Z}شود.`,
  32: `<div class="tv__oftab" role="tablist" aria-label="نوع معامله">`,
  41: `خرید`,
  51: `فروش`,
  62: `placeholder="مقدار را وارد کنید"`,
  67: `<span class="tv__unit">گرم</span>`,
  78: `خرید`,
  82: `فروش`,
  137:`orderError.value = 'برای معامله ابتدا وارد حساب شوید'`,
  148:`orderError.value = result.error || 'ثبت سفارش ناموفق بود'`,
  154:"? `خرید ${order?.grams ?? amount.value} گرم با قیمت ${faMoney(order?.price ?? '" + EM + "')} ثبت شد`",
  155:": `فروش ${order?.grams ?? amount.value} گرم با قیمت ${faMoney(order?.price ?? '" + EM + "')} ثبت شد`",
  157:"orderSuccess.value += ` (کارمزد ${faMoney(order.fee ?? 0)})`",
  162:"orderError.value = e.message || 'ثبت سفارش ناموفق بود'",
};

for (const [k, v] of Object.entries(fixes)) {
  const i = +k;
  const indent = (lines[i].match(/^[ \t]*/) || [''])[0];
  lines[i] = indent + v;
}

fs.writeFileSync(path, bom + lines.join(nl), 'utf8');
console.log('fixed', Object.keys(fixes).length, 'lines');
