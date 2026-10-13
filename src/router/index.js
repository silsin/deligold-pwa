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
import CatalogView from '../views/CatalogView.vue'
import ReportsView from '../views/ReportsView.vue'
import ForbiddenView from '../views/ForbiddenView.vue'
import { useAuthStore } from '../stores/auth'
import { STAFF_ROLES, ADMIN_ROLES } from '../utils/roles'

/**
 * Live gold/silver trading app. Home is the price board (خرید/فروش quotes),
 * then the per-symbol trading desk, markets list, portfolio, history, account
 * and settings — the exact set the top bar + bottom tab bar navigate to.
 *
 * Staff screens (order review, stores, reports) live behind the same router but
 * are guarded by `meta.roles` — see the `beforeEach` below.
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

  // ── Staff screens (role-gated via meta.roles) ──────────────────────────────
  // Order review queue — every staff role.
  { path: '/review', name: 'review', component: ReviewQueueView, meta: { title: 'صف بررسی', requiresAuth: true, roles: STAFF_ROLES } },
  // Wholesale stores + their movements — every staff role.
  { path: '/stores', name: 'stores', component: CatalogView, meta: { title: 'فروشگاه‌ها', requiresAuth: true, roles: STAFF_ROLES } },
  // Financial reports (trial balance, trades) — admins and above.
  { path: '/reports', name: 'reports', component: ReportsView, meta: { title: 'گزارش‌ها', requiresAuth: true, roles: ADMIN_ROLES } },
  // Shown when an authenticated user lacks the role for a route.
  { path: '/forbidden', name: 'forbidden', component: ForbiddenView, meta: { title: 'دسترسی ندارید', requiresAuth: true } },

  // Unknown path → the board, never a blank screen.
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
})

/**
 * Reusable RBAC guard.
 *
 * Route meta:
 *   requiresAuth  → visitor must be signed in (else → /login?redirect=…)
 *   roles         → optional array of roles allowed; a signed-in user without a
 *                   listed role is sent to /forbidden.
 *
 * The session is resolved first (role lives on the profile), so role checks are
 * correct even after a hard refresh that only restored the token.
 */
router.beforeEach(async (to) => {
  const auth = useAuthStore()

  // Resolve the signed-in user/role when a token exists but the profile hasn't
  // been loaded yet (fresh page load / deep link).
  if (auth.token && !auth.user) {
    await auth.ensureSession()
  }

  const needsAuth = to.meta?.requiresAuth
  const roles = to.meta?.roles

  if (needsAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (roles && roles.length && !roles.includes(auth.role)) {
    return auth.isAuthenticated ? { name: 'forbidden' } : { name: 'login', query: { redirect: to.fullPath } }
  }

  return true
})

router.afterEach(to => {
  document.title = to.meta?.title ? `دلی گلد | ${to.meta.title}` : 'دلی گلد'
})

export default router
