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
import CatalogView from '../views/CatalogView.vue'
import ReportsView from '../views/ReportsView.vue'
import UsersView from '../views/UsersView.vue'
import ManagerDeskView from '../views/ManagerDeskView.vue'
import ForbiddenView from '../views/ForbiddenView.vue'
import { STAFF_ROLES, ADMIN_ROLES, ROLES } from '../utils/roles'

import StoreView from '../views/StoreView.vue'
const CustomersView = () => import('../views/CustomersView.vue')
const JoinView = () => import('../views/JoinView.vue')
const StoreSetupView = () => import('../views/StoreSetupView.vue')
const PricingRulesView = () => import('../views/PricingRulesView.vue')
const NotificationsView = () => import('../views/NotificationsView.vue')
const SourcesView = () => import('../views/SourcesView.vue')
const TradesView = () => import('../views/TradesView.vue')
const TickHistoryView = () => import('../views/TickHistoryView.vue')

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
 *
 * There is no `/login` route: login is a bottom sheet (LoginSheet, driven by
 * utils/authGate), raised from the tab bar, the drawer or this guard.
 */

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
  // Join a broker by scanning its invite QR or typing the code — guests too.
  { path: '/join', name: 'join', component: JoinView, meta: { title: 'پیوستن به کارگزاری' } },
  // Staff review queue — every staff role.
  { path: '/review', name: 'review', component: ReviewQueueView, meta: { title: 'صف بررسی', requiresAuth: true, roles: STAFF_ROLES } },
  // Broker-manager desk: customers + cash approvals — every staff role.
  { path: '/desk', name: 'desk', component: ManagerDeskView, meta: { title: 'میز کارگزاری', requiresAuth: true, roles: STAFF_ROLES } },
  // Customer invites (QR / link) + customer management — every staff role.
  { path: '/customers', name: 'customers', component: CustomersView, meta: { title: 'مشتریان', requiresAuth: true, roles: STAFF_ROLES } },
  // Wholesale stores + their movements — every staff role.
  { path: '/stores', name: 'stores', component: CatalogView, meta: { title: 'فروشگاه‌ها', requiresAuth: true, roles: STAFF_ROLES } },
  // Financial reports — all staff roles (broker manager, broker admin, super admin).
  { path: '/reports', name: 'reports', component: ReportsView, meta: { title: 'گزارش‌ها', requiresAuth: true, roles: STAFF_ROLES } },
  // User directory + role grants — super-admin only (managers/admins can't
  // mint roles at or above their own, so they get no UI for it).
  { path: '/users', name: 'users', component: UsersView, meta: { title: 'کاربران', requiresAuth: true, roles: [ROLES.SUPER_ADMIN] } },
  // Super-admin price source management + live price-tick chart.
  { path: '/sources', name: 'sources', component: SourcesView, meta: { title: 'منابع قیمت', requiresAuth: true, roles: [ROLES.SUPER_ADMIN] } },
  // Super-admin cross-platform trade explorer.
  { path: '/trades', name: 'trades', component: TradesView, meta: { title: 'معاملات سامانه', requiresAuth: true, roles: [ROLES.SUPER_ADMIN] } },
  // Super-admin tick history explorer.
  { path: '/tick-history', name: 'tick-history', component: TickHistoryView, meta: { title: 'تاریخچه تیک‌ها', requiresAuth: true, roles: [ROLES.SUPER_ADMIN] } },
  // Shown when an authenticated user lacks the role for a route.
  { path: '/forbidden', name: 'forbidden', component: ForbiddenView, meta: { title: 'دسترسی ندارید', requiresAuth: true } },
  // Customer store view — no auth required.
  { path: '/store', name: 'store', component: StoreView, meta: { title: 'فروشگاه' } },
  // Broker manager store setup.
  { path: '/store-setup', name: 'store-setup', component: StoreSetupView, meta: { title: 'تنظیمات فروشگاه', requiresAuth: true, roles: STAFF_ROLES } },
  // Broker manager per-symbol pricing rules (margin on the live raw price).
  { path: '/pricing-rules', name: 'pricing-rules', component: PricingRulesView, meta: { title: 'قوانین قیمت‌گذاری', requiresAuth: true, roles: STAFF_ROLES } },
  // Notification inbox — all logged-in users.
  { path: '/notifications', name: 'notifications', component: NotificationsView, meta: { title: 'پیام‌ها', requiresAuth: true } },
  // Unknown path → the board, never a blank screen.
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
})

/**
 * Session + RBAC guard.
 *
 * Two layers, on top of main's bottom-sheet login:
 *   1. Resolve the signed-in user/role when a token exists but the profile
 *      hasn't loaded yet (fresh page load / deep link) — the role lives on the
 *      profile, so this must happen before any role check.
 *   2. Role gate (`meta.roles`): a signed-in user without a listed role is sent
 *      to /forbidden.
 *
 * Guests on restricted routes are still handed to the login bottom sheet
 * (authGate), which returns them to where they were headed.
 */
router.beforeEach(async to => {
  const auth = useAuthStore()

  // Resolve role before checking it.
  if (auth.token && !auth.user) {
    await auth.ensureSession()
  }

  const roles = to.meta?.roles

  // Role gate — authenticated but wrong role.
  if (roles && roles.length && auth.isLoggedIn && !roles.includes(auth.role)) {
    return { name: 'forbidden' }
  }

  // Guests are bounced off the account experience and handed to the login sheet,
  // which then returns them to where they were headed. Gated on the route's own
  // meta (requiresAuth, or any roles) instead of a hand-kept list, so a new
  // protected route can't be accidentally left open to guests.
  const needsAuth = to.meta?.requiresAuth || (roles && roles.length)
  if (needsAuth && !auth.isLoggedIn) {
    authGate.openLogin('login', to.fullPath)
    return { name: 'board' }
  }

  return true
})


router.afterEach(to => {
  document.title = to.meta?.title ? `دلی گلد | ${to.meta.title}` : 'دلی گلد'
})

export default router
