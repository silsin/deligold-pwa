import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api, setToken, getToken } from '../utils/api.js';

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
  const totalPnl = computed(() => Math.max(0, equity.value - balance.value));
  const feePercent = ref(0.5);
  const loading = ref(false);
  const error = ref('');

  const isLoggedIn = computed(() => Boolean(token.value));
  const isAuthenticated = computed(() => Boolean(token.value));
  const balance = computed(() => Number(wallet.value?.balance ?? 0));
  const isVerified = computed(() => user.value?.verified === true);
  const isStaff = computed(() => ['BROKER_MANAGER', 'BROKER_ADMIN', 'SUPER_ADMIN'].includes(user.value?.role));

  /** A symbol the user currently holds, or null. */
  function positionOf(symbol) {
    return positions.value.find((p) => p.symbol === symbol) ?? null;
  }

  /** Merge flat NestJS payloads without ever blanking good local state. */
  function applyWallet(data) {
    if (!data || typeof data !== 'object') return;
    if (data.wallet) wallet.value = data.wallet;
    else if (typeof data.balance === 'number') {
      wallet.value = { ...(wallet.value ?? {}), balance: data.balance };
    }
    if (Array.isArray(data.positions)) positions.value = data.positions;
    if (typeof data.equity === 'number') equity.value = data.equity;
    if (typeof data.feePercent === 'number') feePercent.value = data.feePercent;
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
      await Promise.all([fetchProfile(), fetchWallet(), fetchOrders()]);
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
      await Promise.all([fetchProfile(), fetchWallet(), fetchOrders()]);
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
    return (await Promise.all([fetchProfile(), fetchWallet(), fetchOrders()])).every(Boolean);
  }

  /** Own profile + completeness/badge state. */
  async function fetchProfile() {
    if (!token.value) return false;
    try {
      const me = await api.get('/users/me');
      if (me?.id) user.value = me;
      const check = await api.get('/users/me/check');
      profileCheck.value = check;
      if (typeof check?.verified === 'boolean' && user.value) {
        user.value = { ...user.value, verified: check.verified };
      }
      return true;
    } catch (e) {
      logout();
      error.value = e.message || 'نشست منقضی شده است';
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

  async function fetchPositions() {
    if (!token.value) return false;
    try {
      const data = await api.get('/trade/positions');
      if (Array.isArray(data?.positions)) positions.value = data.positions;
      return true;
    } catch {
      return false;
    }
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
        await Promise.all([fetchWallet(), fetchOrders()]);
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
    totalPnl,
    feePercent,
    loading,
    error,
    isLoggedIn,
    isAuthenticated,
    isVerified,
    isStaff,
    balance,
    positionOf,
    register,
    login,
    fetchAccount,
    fetchProfile,
    updateProfile,
    fetchWallet,
    fetchPositions,
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
    logout,
  };
});
