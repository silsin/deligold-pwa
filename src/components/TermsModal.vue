<template>
  <div class="terms" role="dialog" aria-modal="true" aria-label="پیام مدیر سیستم">
    <div class="terms__panel">
      <header class="terms__head">
        <strong>پیام مدیر سیستم</strong>
        <button v-if="!required" type="button" class="terms__x" @click="emit('close')">
          <i class="material-icons">close</i>
        </button>
      </header>

      <div class="terms__body">
        <p class="terms__basmale">هوالرزاق</p>
        <h3 class="terms__title">شرایط و ضوابط انجام معاملات</h3>

        <ol class="terms__list">
          <li>
            کلیه معاملات این مجموعه به‌صورت نقدی انجام می‌شود و خریداران محترم می‌توانند نسبت
            به تسویه هم‌زمان با خرید اقدام نمایند.
          </li>
          <li>
            با توجه به محدودیت‌های شتابی بانکی، واریز و انتقال وجه ممکن است در طول روز با
            تأخیر انجام شود.
          </li>
          <li>لطفاً توجه داشته باشید:</li>
          <li class="terms__sub">
            * تا زمان دریافت کالای موردنظر، امکان واریز وجه به حساب مشتری وجود ندارد.
          </li>
          <li class="terms__sub">
            * خواهشمند است کالای خود را تا حداکثر ساعت ۱۱ صبح تحویل دهید تا در فرایند تسویه و
            واریز وجه مشکلی ایجاد نشود.
          </li>
          <li class="terms__sub">
            * همچنین تا پیش از تکمیل و تأیید درخواست، موجودی قابل برداشت نخواهد بود.
          </li>
          <li>
            در معاملات سکه، لطفاً به خصوصیات بانکی و وزن سکه دقت فرمایید تا از بروز هرگونه
            مشکل جلوگیری شود.
          </li>
          <li>
            با توجه به تغییر ساعات کاری بانک‌ها، لطفاً حداکثر تا ساعت ۱۱:۳۰ صبح، شماره
            حساب/شبای خود را برای دریافت فیش قرارداد ارسال فرمایید. پس از این ساعت، امکان
            دریافت شماره حساب وجود نخواهد داشت.
          </li>
          <li>
            شماره حساب طلای خریداری‌شده تا تسویه شما تا ساعت ۱۱:۳۰ برایتان ارسال می‌شود.
          </li>
        </ol>

        <div class="terms__bank">
          <p><b>جابجایی حساب و فیش:</b> {{ bankInfo }}</p>
          <p><b>حسابداری:</b> {{ accountingInfo }}</p>
        </div>
      </div>

      <button type="button" class="terms__accept" @click="accept">
        <i class="material-icons">check</i> متوجه شدم
      </button>
    </div>
  </div>
</template>

<script setup>
/**
 * First-visit gate + re-openable «شرایط و قوانین» page content.
 * Acceptance is remembered per device in localStorage.
 */
import { termsAccepted } from '../utils/format'

const props = defineProps({
  /** When true the close button is hidden — first visit must accept. */
  required: { type: Boolean, default: false }
})

const emit = defineEmits(['accept', 'close'])

/**
 * TODO: replace with the real account numbers when provided by finance.
 * Kept as constants here so they can be edited without touching the layout.
 */
const bankInfo = 'از طریق پنل کاربری اعلام می‌گردد'
const accountingInfo = 'از طریق پنل کاربری اعلام می‌گردد'

function accept() {
  try {
    localStorage.setItem('dg_terms_accepted', '1')
  } catch {
    /* private mode — still dismiss for this session */
  }
  emit('accept')
  emit('close')
}
</script>

<style scoped>
.terms {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(10, 12, 16, 0.55);
}

.terms__panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 560px;
  max-height: 88vh;
  background: #ffffff;
  color: #14171c;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
}

.terms__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 16px;
  border-bottom: 1px solid #e5e7eb;
  font-size: 15px;
}

.terms__x {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #f1f3f6;
  color: #6b7280;
  font-size: 13px;
}

.terms__body {
  overflow-y: auto;
  padding: 16px 20px;
  font-size: 13.5px;
  line-height: 2;
}

.terms__basmale {
  margin: 0;
  text-align: center;
  font-size: 14px;
}

.terms__title {
  margin: 2px 0 14px;
  text-align: center;
  font-size: 14.5px;
  font-weight: 700;
}

.terms__list {
  margin: 0;
  padding-right: 20px;
}

.terms__list li {
  margin-bottom: 7px;
}

.terms__sub {
  list-style: none;
  margin-right: -18px !important;
  font-weight: 700;
}

.terms__bank {
  margin-top: 16px;
  text-align: center;
  font-size: 12.5px;
  color: #4b5563;
}

.terms__bank p {
  margin: 3px 0;
}

.terms__accept {
  margin: 0;
  padding: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: #1d4ed8;
  color: #ffffff;
  font-size: 15.5px;
  font-weight: 800;
}

.terms__accept:active {
  background: #1e40af;
}
</style>
