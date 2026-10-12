import { createRouter, createWebHashHistory } from 'vue-router'
import BoardView from '../views/BoardView.vue'
import TradingView from '../views/TradingView.vue'
import MarketsView from '../views/MarketsView.vue'
import PortfolioView from '../views/PortfolioView.vue'
import TradeHistoryView from '../views/TradeHistoryView.vue'
import AccountView from '../views/AccountView.vue'
import WalletView from '../views/WalletView.vue'
import SettingsView from '../views/SettingsView.vue'
import ReviewQueueView from '../views/ReviewQueueView.vue'
import { authGate } from '../utils/authGate'
import { useAuthStore } from '../stores/auth'

/**
 * Live gold/silver trading app. Home is the price board (خرید/فروش quotes),
 * then the per-symbol trading desk, markets list, portfolio, history, account
 * and settings — the exact set the top bar + bottom tab bar navigate to.
 *
 * Hash history keeps the PWA working from any sub-path or static host without
 * server rewrites — important because `dist/` is usually served as plain files.
 *
 * There is no `/login` route: login is a bottom sheet (LoginSheet, driven by
 * utils/authGate), raised from the tab bar, the drawer or this guard.
 */

/** True only for the signed-in account experience. */
const RESTRICTED = ['trade', 'portfolio', 'history', 'account', 'wallet', 'review']

const routes = [
  // Home = the live price board.
  { path: '/', name: 'board', component: BoardView, meta: { title: 'قیمت‌ها' } },
  // Per-symbol trading desk (charts + order form).
  { path: '/trade', name: 'trade', component: TradingView, meta: { title: 'معاملات', requiresAuth: true } },
  // All tradeable symbols.
  { path: '/markets', name: 'markets', component: MarketsView, meta: { title: 'بازار' } },
  // Open positions + P/L.
  { path: '/portfolio', name: 'portfolio', component: PortfolioView, meta: { title: 'سبد من', requiresAuth: true } },
  // Submitted orders and their status.
  { path: '/history', name: 'history', component: TradeHistoryView, meta: { title: 'تاریخچه معاملات', requiresAuth: true } },
  // Account balance / wallet.
  { path: '/account', name: 'account', component: AccountView, meta: { title: 'مانده حساب', requiresAuth: true } },
  // Cash wallet: deposits, withdrawals and gold-to-gold conversion.
  { path: '/wallet', name: 'wallet', component: WalletView, meta: { title: 'کیف پول', requiresAuth: true } },
  { path: '/settings', name: 'settings', component: SettingsView, meta: { title: 'تنظیمات' } },
  { path: '/review', name: 'review', component: ReviewQueueView, meta: { title: 'صف بررسی', requiresAuth: true } },
  // Unknown path → the board, never a blank screen.
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
})

/**
 * Guests are bounced off the account experience and handed to the login sheet,
 * which then returns them to where they were headed.
 */
router.beforeEach(to => {
  const restricted = RESTRICTED.includes(to.name) && to.meta?.requiresAuth
  if (!restricted) return true
  if (useAuthStore().isLoggedIn) return true

  authGate.openLogin('login', to.fullPath)
  return { name: 'board' }
})

router.afterEach(to => {
  document.title = to.meta?.title ? `دلی گلد | ${to.meta.title}` : 'دلی گلد'
})

export default router
