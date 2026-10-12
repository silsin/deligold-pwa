import { createRouter, createWebHashHistory } from 'vue-router'
import BoardView from '../views/BoardView.vue'
import TradingView from '../views/TradingView.vue'
import MarketsView from '../views/MarketsView.vue'
import PortfolioView from '../views/PortfolioView.vue'
import TradeHistoryView from '../views/TradeHistoryView.vue'
import AccountView from '../views/AccountView.vue'
import WalletView from '../views/WalletView.vue'
import SettingsView from '../views/SettingsView.vue'
import LoginView from '../views/LoginView.vue'
import ReviewQueueView from '../views/ReviewQueueView.vue'

/**
 * Live gold/silver trading app. Home is the price board (خرید/فروش quotes),
 * then the per-symbol trading desk, markets list, portfolio, history, account
 * and settings — the exact set the top bar + bottom tab bar navigate to.
 *
 * Hash history keeps the PWA working from any sub-path or static host without
 * server rewrites — important because `dist/` is usually served as plain files.
 */
const routes = [
  // Home = the live price board.
  { path: '/', name: 'board', component: BoardView, meta: { title: 'قیمت‌ها' } },
  // Per-symbol trading desk (charts + order form).
  { path: '/trade', name: 'trade', component: TradingView, meta: { title: 'معاملات' } },
  // All tradeable symbols.
  { path: '/markets', name: 'markets', component: MarketsView, meta: { title: 'بازار' } },
  // Open positions + P/L.
  { path: '/portfolio', name: 'portfolio', component: PortfolioView, meta: { title: 'سبد من' } },
  // Submitted orders and their status.
  { path: '/history', name: 'history', component: TradeHistoryView, meta: { title: 'تاریخچه معاملات' } },
  // Account balance / wallet.
  { path: '/account', name: 'account', component: AccountView, meta: { title: 'مانده حساب' } },
  // Cash wallet: deposits, withdrawals and gold-to-gold conversion.
  { path: '/wallet', name: 'wallet', component: WalletView, meta: { title: 'کیف پول' } },
  { path: '/settings', name: 'settings', component: SettingsView, meta: { title: 'تنظیمات' } },
  { path: '/login', name: 'login', component: LoginView, meta: { title: 'ورود' } },
  { path: '/review', name: 'review', component: ReviewQueueView, meta: { title: 'صف بررسی' } },
  // Unknown path → the board, never a blank screen.
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
})

router.afterEach(to => {
  document.title = to.meta?.title ? `دلی گلد | ${to.meta.title}` : 'دلی گلد'
})

export default router
