import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api, setToken, getToken } from '../utils/api.js';
import { CAPABILITIES, ROLES, can, isStaffRole, homeRouteFor } from '../utils/roles.js';

/**
 * Session store for the PWA (NestJS delly-api).
 *
 * Token in localStorage. Boot tries `/auth/me`; 401 clears silently.
 * Wallet snapshot: GET /trade/wallet -> {balance,equity,feePercent,positions}.
 * Orders: GET /trade/orders -> {orders}. Profile: /users/me + /users/me/check.
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref(null);
  const token = ref(getToken());
  const wallet = ref(null);
  const positions = ref([]);
  const orders = ref([]);
  const transactions = ref([]);
  const profileCheck = ref(null);
  const equity = ref(0);
  const realizedPnl = ref(0);

  /**
   * Unrealised P/L across open positions. Can be negative — a loss is the whole
   * point of showing it, so this is never clamped at zero.
   */
  const openPnl = computed(() =>
    positions.value.reduce((sum, p) => sum + (Number(p.pnl) || 0), 0)
  );

  /** Realised + unrealised: the number the user actually cares about. */
  const totalPnl = computed(() => openPnl.value + (Number(realizedPnl.value) || 0));

  const feePercent = ref(0.5);
  const loading = ref(false);
  const error = ref('');

  const isLoggedIn = computed(() => Boolean(token.value));
  const isAuthenticated = computed(() => Boolean(token.value));
  const balance = computed(() => Number(wallet.value?.balance ?? 0));
  const isVerified = computed(() => user.value?.verified === true);

  // ── Roles / capabilities (see utils/roles.js) ─────────────────────────────
  const role = computed(() => user.value?.role ?? ROLES.CUSTOMER);
  const isCustomer = computed(() => role.value === ROLES.CUSTOMER);
  const isBrokerManager = computed(() => role.value === ROLES.BROKER_MANAGER);
  const isBrokerAdmin = computed(() => role.value === ROLES.BROKER_ADMIN);
  const isSuperAdmin = computed(() => role.value === ROLES.SUPER_ADMIN);
  const isStaff = computed(() => isStaffRole(role.value));
  const canReviewOrders = computed(() => can(role.value, CAPABILITIES.REVIEW_ORDERS));
  const canViewStores = computed(() => can(role.value, CAPABILITIES.VIEW_STORES));
  const canViewReports = computed(() => can(role.value, CAPABILITIES.VIEW_REPORTS));

  /**
   * Resolve the signed-in user before a role-gated route renders. On a hard
   * refresh the token exists but `user` (and thus the role) is still null, so
   * the router guard awaits this first. A failed profile fetch logs out, which
   * makes `isAuthenticated` false and sends the visitor to /login.
   */
  async function ensureSession() {
    if (!token.value) return false;
    if (user.value) return true;
    return fetchProfile();
  }

  /** Where to land the current role right after sign-in. */
  const homeRoute = computed(() => homeRouteFor(role.value));

  /** A symbol the user currently holds, or null. */
  function positionOf(symbol) {
    return positions.value.find((p) => p.symbol === symbol) ?? null;
  }

  /**
   * `GET /trade/wallet` is FLAT — {balance, realizedPnl, equity, feePercent}.
   * It deliberately carries no positions: holdings come from `/trade/positions`.
   */
  function applyWallet(data) {
    if (!data || typeof data !== 'object') return;
    if (typeof data.balance === 'number') {
      wallet.value = { ...(wallet.value ?? {}), balance: data.balance };
    }
    if (typeof data.realizedPnl === 'number') realizedPnl.value = data.realizedPnl;
    if (typeof data.equity === 'number') equity.value = data.equity;
    if (typeof data.feePercent === 'number') feePercent.value = data.feePercent;
  }

  /** Accepts a bare `PositionView[]` or a `{positions}` wrapper. */
  function applyPositions(data) {
    const list = Array.isArray(data) ? data : data?.positions;
    if (Array.isArray(list)) positions.value = list;
  }

  /**
   * Cash movements from `/wallet/deposits` + `/wallet/withdrawals`, merged into
   * one newest-first ledger. Both endpoints return a bare `CashMoveView[]` and
   * either may fail independently, so a partial list is still shown.
   */
  async function fetchTransactions() {
    if (!token.value) return false;
    const settled = (s) => ['APPROVED', 'PAID', 'COMPLETED', 'SETTLED'].includes(s);

    const results = await Promise.allSettled([
      api.get('/wallet/deposits'),
      api.get('/wallet/withdrawals'),
    ]);

    const list = [];
    for (const [i, r] of results.entries()) {
      if (r.status !== 'fulfilled' || !Array.isArray(r.value)) continue;
      const kind = i === 0 ? 'DEPOSIT' : 'WITHDRAWAL';
      for (const m of r.value) {
        list.push({
          id: m.id,
          kind,
          amount: Number(m.amount) || 0,
          fee: Number(m.fee) || 0,
          status: m.status,
          settled: settled(m.status),
          method: m.method ?? null,
          destination: m.destination ?? null,
          note: m.note ?? '',
          ref: m.ref ?? '',
          createdAt: m.createdAt,
        });
      }
    }

    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    transactions.value = list;
    return true;
  }

  function applyOrders(data) {
    if (Array.isArray(data)) orders.value = data;
    else if (Array.isArray(data?.orders)) orders.value = data.orders;
  }

  async function register(phone, password, name, nationalId) {
    loading.value = true;
    error.value = '';
    try {
      const payload = { phone, password, name };
      if (nationalId) payload.nationalId = nationalId;
      const data = await api.post('/auth/register', payload);
      token.value = data.accessToken;
      setToken(data.accessToken);
      if (data.user) user.value = data.user;
      await Promise.all([fetchProfile(), fetchWalletBundle()]);
      return true;
    } catch (e) {
      error.value = e.message || 'ثبت‌نام ناموفق بود';
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function login(identifier, password) {
    loading.value = true;
    error.value = '';
    try {
      const data = await api.post('/auth/login', { phone: identifier, password });
      token.value = data.accessToken;
      setToken(data.accessToken);
      if (data.user) user.value = data.user;
      await Promise.all([fetchProfile(), fetchWalletBundle()]);
      return true;
    } catch (e) {
      error.value = e.message || 'ورود ناموفق بود';
      return false;
    } finally {
      loading.value = false;
    }
  }

  /** Refresh profile + wallet + orders from the NestJS API. */
  async function fetchAccount() {
    if (!token.value) return false;
    return (await Promise.all([fetchProfile(), fetchWalletBundle()])).every(Boolean);
  }

  /** Own profile + completeness/badge state. */
  async function fetchProfile() {
    if (!token.value) return false;
    try {
      const me = await api.get('/users/me');
      if (me?.id) {
        // Keep the role from the login response if `/users/me` ever omits it.
        const merged = { ...me };
        if (merged.role == null && user.value?.role) merged.role = user.value.role;
        user.value = merged;
      }
      const check = await api.get('/users/me/check');
      profileCheck.value = check;
      if (typeof check?.verified === 'boolean' && user.value) {
        user.value = { ...user.value, verified: check.verified };
      }
      return true;
    } catch (e) {
      // Only a real 401 means the token is dead. A timeout / 500 / offline
      // hiccup must NOT log the user out — keep the token and retry later.
      if (e?.isUnauthorized) {
        logout();
        error.value = e.message || 'نشست منقضی شده است';
      } else {
        error.value = e.message || 'دریافت پروفایل ناموفق بود';
      }
      return false;
    }
  }

  async function updateProfile(payload) {
    loading.value = true;
    error.value = '';
    try {
      const data = await api.patch('/users/me', payload);
      if (data?.id) user.value = data;
      await fetchProfile();
      return { ok: true, user: user.value };
    } catch (e) {
      error.value = e.message || 'به‌روزرسانی پروفایل ناموفق بود';
      return { ok: false, error: error.value };
    } finally {
      loading.value = false;
    }
  }

  /** Load the wallet snapshot (cash + gold holdings) from /trade/wallet. */
  async function fetchWallet() {
    if (!token.value) return false;
    try {
      const data = await api.get('/trade/wallet');
      applyWallet(data);
      return true;
    } catch (e) {
      error.value = e.message || 'دریافت اطلاعات کیف پول ناموفق بود';
      return false;
    }
  }

  /** `GET /trade/positions` → bare `PositionView[]` marked to the live board. */
  async function fetchPositions() {
    if (!token.value) return false;
    try {
      applyPositions(await api.get('/trade/positions'));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Everything the wallet screen needs: cash, holdings, orders and the cash
   * ledger. Ordered so the heavy positions call runs alongside the rest.
   */
  async function fetchWalletBundle() {
    return (await Promise.all([fetchWallet(), fetchPositions(), fetchOrders(), fetchTransactions()])).every(Boolean);
  }

  async function fetchOrders() {
    if (!token.value) return false;
    try {
      const data = await api.get('/trade/orders');
      applyOrders(data);
      return true;
    } catch (e) {
      error.value = e.message || 'دریافت سفارش‌ها ناموفق بود';
      return false;
    }
  }

  // ── Staff: user directory + role grants ──────────────────────────────────
  // Powers the super-admin "کاربران" screen. The API scopes `GET /users` by
  // broker (super-admin sees everyone), and guards every grant — the UI just
  // surfaces the error message when the server says no.
  const directory = ref([]);

  function applyDirectory(data) {
    const list = Array.isArray(data) ? data : data?.users ?? data?.items ?? [];
    if (Array.isArray(list)) directory.value = list;
  }

  async function fetchDirectory(params = {}) {
    if (!token.value) return false;
    loading.value = true;
    error.value = '';
    try {
      const query = new URLSearchParams();
      if (params.search) query.set('search', params.search);
      if (params.role) query.set('role', params.role);
      if (params.limit) query.set('limit', String(params.limit));
      const qs = query.toString();
      applyDirectory(await api.get(qs ? `/users?${qs}` : '/users'));
      return true;
    } catch (e) {
      error.value = e.message || 'دریافت فهرست کاربران ناموفق بود';
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function changeUserRole(userId, role, note = '') {
    if (!token.value) return { ok: false };
    loading.value = true;
    error.value = '';
    try {
      const updated = await api.post(`/users/${userId}/role`, { role, note: note || undefined });
      const idx = directory.value.findIndex(u => u?.id === userId);
      if (idx >= 0 && updated?.id) directory.value[idx] = { ...directory.value[idx], ...updated };
      // A changed user may already be signed in — refresh our own profile so
      // the drawer/role gates update without a manual reload.
      if (user.value?.id === userId) await fetchProfile();
      return { ok: true, user: updated };
    } catch (e) {
      error.value = e.message || 'تغییر نقش ناموفق بود';
      return { ok: false, error: error.value };
    } finally {
      loading.value = false;
    }
  }

  async function createStaffUser(payload) {
    if (!token.value) return { ok: false };
    loading.value = true;
    error.value = '';
    try {
      const created = await api.post('/users', payload);
      if (created?.id) directory.value = [created, ...directory.value];
      return { ok: true, user: created };
    } catch (e) {
      error.value = e.message || 'ایجاد کاربر ناموفق بود';
      return { ok: false, error: error.value };
    } finally {
      loading.value = false;
    }
  }

  // ── Two-step charge flow (request → complete) ────────────────────────────
  // A charge starts as a PENDING request the user can resume later; the money
  // is only actually requested from the API at completion (send receipt, or
  // connect to the bank gateway). Pending requests are tracked locally so they
  // survive a refresh and stay tappable on the wallet screen.
  const PENDING_DEPOSITS_KEY = 'dg_pending_deposits';
  const pendingDeposits = ref(loadPendingDeposits());

  function loadPendingDeposits() {
    try {
      const raw = JSON.parse(localStorage.getItem(PENDING_DEPOSITS_KEY));
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }
  function savePendingDeposits() {
    try { localStorage.setItem(PENDING_DEPOSITS_KEY, JSON.stringify(pendingDeposits.value)); }
    catch { /* storage unavailable — pending list just won't survive a reload */ }
  }

  /** Step 1 — record a charge request as PENDING (does NOT credit the wallet). */
  async function createDeposit({ amount, method, reference = '', note = '' }) {
    error.value = '';
    const record = {
      id: `dep_${Date.now()}`,
      amount: Number(amount) || 0,
      method: method || 'BANK_TRANSFER',
      reference,
      note,
      status: 'PENDING',
      createdAt: Date.now(),
      gateway: null
    };
    pendingDeposits.value.unshift(record);
    savePendingDeposits();
    return { ok: true, deposit: record };
  }

  /** Upload a receipt file and return its stored path (best-effort). */
  async function uploadReceipt(file) {
    try {
      const form = new FormData();
      form.append('file', file);
      const up = await api.post('/uploads', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      return up?.path ?? up?.url ?? up?.filePath ?? up?.file?.path ?? '';
    } catch (e) {
      error.value = e.message || 'بارگذاری رسید ناموفق بود';
      return '';
    }
  }

  /** Step 2 (manual) — attach receipt + tracking, then submit the real charge. */
  async function completeDeposit(id, { reference = '', receiptPath = '', note = '' }) {
    const rec = pendingDeposits.value.find(d => d.id === id);
    loading.value = true;
    error.value = '';
    try {
      const noteParts = [];
      if (note) noteParts.push(note);
      if (rec?.note) noteParts.push(rec.note);
      if (receiptPath) noteParts.push(`رسید: ${receiptPath}`);
      await api.post('/wallet/deposits', {
        amount: rec?.amount ?? 0,
        method: rec?.method ?? 'BANK_TRANSFER',
        reference: reference || rec?.reference || '',
        note: noteParts.join(' · ')
      });
      pendingDeposits.value = pendingDeposits.value.filter(d => d.id !== id);
      savePendingDeposits();
      await fetchWallet();
      return { ok: true };
    } catch (e) {
      error.value = e.message || 'ثبت واریز ناموفق بود';
      return { ok: false, error: error.value };
    } finally {
      loading.value = false;
    }
  }

  /** Step 2 (gateway) — open the bank connection; redirect only if API gives a URL. */
  async function connectDeposit(id) {
    const rec = pendingDeposits.value.find(d => d.id === id);
    const redirectUrl = rec?.gateway?.redirectUrl ?? null;
    if (redirectUrl) {
      window.location.href = redirectUrl;
      return { ok: true, redirect: true };
    }
    // No gateway URL available yet — keep it pending so the user can retry
    // once the backend provides a checkout URL. We never credit here.
    error.value = 'اتصال به درگاه بانکی در حال حاضر فعال نیست';
    return { ok: false, error: error.value };
  }

  /** Drop a pending request the user no longer wants. */
  function cancelDeposit(id) {
    pendingDeposits.value = pendingDeposits.value.filter(d => d.id !== id);
    savePendingDeposits();
  }

  const requestDeposit = async (amount, method = 'BANK_TRANSFER', reference = '', note = '') => {
    loading.value = true;
    error.value = '';
    try {
      const data = await api.post('/wallet/deposits', { amount, method, reference, note });
      await fetchWallet();
      return { ok: true, data };
    } catch (e) {
      error.value = e.message || 'ثبت واریز ناموفق بود';
      return { ok: false, error: error.value };
    } finally {
      loading.value = false;
    }
  };

  const requestWithdrawal = async (amount, destination, note = '') => {
    loading.value = true;
    error.value = '';
    try {
      const data = await api.post('/wallet/withdrawals', { amount, destination, note });
      await fetchWallet();
      return { ok: true, data };
    } catch (e) {
      error.value = e.message || 'ثبت برداشت ناموفق بود';
      return { ok: false, error: error.value };
    } finally {
      loading.value = false;
    }
  };

  const deposit = (amount) => requestDeposit(amount);
  const withdraw = (amount, note = '') => requestWithdrawal(amount, note || 'برداشت وجه');

  async function placeOrder(payload) {
    loading.value = true;
    error.value = '';
    try {
      const data = await api.post('/trade/orders', payload);
      const order = data?.order ?? data;
      if (order?.id) {
        await fetchWalletBundle();
      }
      return { ok: true, order };
    } catch (e) {
      error.value = e.message || 'ثبت سفارش ناموفق بود';
      return { ok: false, error: error.value };
    } finally {
      loading.value = false;
    }
  }

  async function submitReceipt(orderId, payload) {
    loading.value = true;
    error.value = '';
    try {
      const data = await api.post(`/trade/orders/${orderId}/receipt`, payload);
      const order = data?.order ?? data;
      await fetchOrders();
      return { ok: true, order };
    } catch (e) {
      error.value = e.message || 'ارسال رسید ناموفق بود';
      return { ok: false, error: error.value };
    } finally {
      loading.value = false;
    }
  }

  async function fetchMyOrder(orderId) {
    try {
      const data = await api.get(`/trade/orders/${orderId}`);
      return data?.order ?? data;
    } catch (e) {
      error.value = e.message || 'دریافت سفارش ناموفق بود';
      return null;
    }
  }

  async function reviewQueue() {
    loading.value = true;
    error.value = '';
    try {
      const data = await api.get('/trade/review-queue');
      return Array.isArray(data) ? data : (data?.orders ?? []);
    } catch (e) {
      error.value = e.message || 'دریافت صف بررسی ناموفق بود';
      return [];
    } finally {
      loading.value = false;
    }
  }

  async function reviewOrder(orderId, approve, note = '') {
    loading.value = true;
    error.value = '';
    try {
      const data = await api.post(`/trade/orders/${orderId}/review`, { approve, note });
      const order = data?.order ?? data;
      await Promise.all([fetchOrders(), fetchWallet()]);
      return { ok: true, order };
    } catch (e) {
      error.value = e.message || 'ثبت بررسی ناموفق بود';
      return { ok: false, error: error.value };
    } finally {
      loading.value = false;
    }
  }

  async function fulfillOrder(orderId) {
    loading.value = true;
    error.value = '';
    try {
      const data = await api.post(`/trade/orders/${orderId}/fulfill`, {});
      const order = data?.order ?? data;
      await Promise.all([fetchOrders(), fetchWallet()]);
      return { ok: true, order };
    } catch (e) {
      error.value = e.message || 'ثبت تحویل ناموفق بود';
      return { ok: false, error: error.value };
    } finally {
      loading.value = false;
    }
  }

  function logout() {
    user.value = null;
    wallet.value = null;
    positions.value = [];
    orders.value = [];
    transactions.value = [];
    profileCheck.value = null;
    equity.value = 0;
    feePercent.value = 0.5;
    token.value = null;
    setToken(null);
  }

  return {
    user,
    token,
    wallet,
    positions,
    orders,
    transactions,
    profileCheck,
    equity,
    realizedPnl,
    openPnl,
    totalPnl,
    feePercent,
    loading,
    error,
    isLoggedIn,
    isAuthenticated,
    isVerified,
    role,
    isCustomer,
    isBrokerManager,
    isBrokerAdmin,
    isSuperAdmin,
    isStaff,
    canReviewOrders,
    canViewStores,
    canViewReports,
    homeRoute,
    balance,
    positionOf,
    register,
    login,
    fetchAccount,
    fetchProfile,
    ensureSession,
    updateProfile,
    pendingDeposits,
    createDeposit,
    uploadReceipt,
    completeDeposit,
    connectDeposit,
    cancelDeposit,
    requestDeposit,
    fetchWallet,
    fetchPositions,
    fetchTransactions,
    fetchWalletBundle,
    fetchOrders,
    fetchMyOrder,
    requestDeposit,
    requestWithdrawal,
    deposit,
    withdraw,
    placeOrder,
    submitReceipt,
    reviewQueue,
    reviewOrder,
    fulfillOrder,
    directory,
    fetchDirectory,
    changeUserRole,
    createStaffUser,
    logout,
  };
});
