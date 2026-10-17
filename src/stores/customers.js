import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../utils/api.js';

/**
 * Broker manager customer management store.
 * Handles invites, permissions, and customer overviews.
 */
export const useCustomersStore = defineStore('customers', () => {
  // Invites
  const invites = ref([]);
  const invitesLoading = ref(false);
  const invitesError = ref('');

  // Permissions
  const permissions = ref([]);
  const permissionsLoading = ref(false);
  const permissionsError = ref('');

  // Overview
  const overview = ref(null);

  /**
   * Fetch all invites for the actor's broker.
   */
  async function fetchInvites() {
    invitesLoading.value = true;
    invitesError.value = '';
    try {
      const res = await api.get('/invites');
      invites.value = (Array.isArray(res) ? res : []);
    } catch (e) {
      invitesError.value = e.message || 'خطای بارگذاری دعوت‌نامه‌ها';
    } finally {
      invitesLoading.value = false;
    }
  }

  /**
   * Create a new invite code.
   */
  async function createInvite(dto) {
    invitesLoading.value = true;
    invitesError.value = '';
    try {
      const res = await api.post('/invites', dto);
      invites.value.unshift(res);
      return res;
    } catch (e) {
      invitesError.value = e.message || 'خطای ایجاد دعوت‌نامه';
      throw e;
    } finally {
      invitesLoading.value = false;
    }
  }

  /**
   * Update an invite (e.g., disable it).
   */
  async function updateInvite(id, dto) {
    invitesLoading.value = true;
    invitesError.value = '';
    try {
      const res = await api.patch(`/invites/${id}`, dto);
      const idx = invites.value.findIndex(i => i.id === id);
      if (idx >= 0) {
        invites.value[idx] = res;
      }
      return res;
    } catch (e) {
      invitesError.value = e.message || 'خطای به‌روزرسانی دعوت‌نامه';
      throw e;
    } finally {
      invitesLoading.value = false;
    }
  }

  /**
   * Fetch permissions for a customer.
   */
  async function fetchPermissions(userId) {
    permissionsLoading.value = true;
    permissionsError.value = '';
    try {
      const res = await api.get(`/users/${userId}/permissions`);
      permissions.value = (Array.isArray(res) ? res : []);
    } catch (e) {
      permissionsError.value = e.message || 'خطای بارگذاری دسترسی‌ها';
    } finally {
      permissionsLoading.value = false;
    }
  }

  /**
   * Save permissions for a customer.
   */
  async function savePermissions(userId, items) {
    permissionsLoading.value = true;
    permissionsError.value = '';
    try {
      const res = await api.put(`/users/${userId}/permissions`, { items });
      permissions.value = (Array.isArray(res) ? res : []);
      return res;
    } catch (e) {
      permissionsError.value = e.message || 'خطای ذخیره دسترسی‌ها';
      throw e;
    } finally {
      permissionsLoading.value = false;
    }
  }

  /**
   * Fetch customer overview (wallet, positions, orders).
   */
  async function fetchOverview(userId) {
    try {
      const res = await api.get(`/trade/customers/${userId}/overview`);
      overview.value = res;
      return res;
    } catch (e) {
      throw e;
    }
  }

  return {
    invites,
    invitesLoading,
    invitesError,
    fetchInvites,
    createInvite,
    updateInvite,

    permissions,
    permissionsLoading,
    permissionsError,
    fetchPermissions,
    savePermissions,

    overview,
    fetchOverview,
  };
});
