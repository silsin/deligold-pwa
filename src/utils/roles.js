/**
 * Role model + access rules for the delly PWA.
 *
 * The NestJS API returns the signed-in user's role on `GET /users/me`
 * (`user.role`). Higher roles inherit every permission of the roles below
 * them, so a route or UI element can be gated by the *lowest* role allowed to
 * open it instead of listing every role that may use it.
 *
 *   CUSTOMER        — the retail trader (default). Board + own wallet/orders.
 *   BROKER_MANAGER  — desk operator. Reviews customer receipts, sees stores.
 *   BROKER_ADMIN    — everything a manager can, plus financial reports.
 *   SUPER_ADMIN     — everything.
 *
 * Unknown/missing roles are treated as CUSTOMER (least privilege) so a new or
 * mis-mapped account can never accidentally unlock staff screens.
 */

export const ROLES = {
  CUSTOMER: 'CUSTOMER',
  BROKER_MANAGER: 'BROKER_MANAGER',
  BROKER_ADMIN: 'BROKER_ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
}

/** Persian label shown in the UI (drawer, badges). */
export const ROLE_LABELS = {
  [ROLES.CUSTOMER]: 'مشتری',
  [ROLES.BROKER_MANAGER]: 'مدیر کارگزاری',
  [ROLES.BROKER_ADMIN]: 'مدیر ارشد کارگزاری',
  [ROLES.SUPER_ADMIN]: 'مدیر سیستم',
}

/** Rank drives inheritance — a higher number can do everything below it. */
export const ROLE_RANK = {
  [ROLES.CUSTOMER]: 0,
  [ROLES.BROKER_MANAGER]: 1,
  [ROLES.BROKER_ADMIN]: 2,
  [ROLES.SUPER_ADMIN]: 3,
}

/** The three staff roles, ordered least → most privileged. */
export const STAFF_ROLES = [
  ROLES.BROKER_MANAGER,
  ROLES.BROKER_ADMIN,
  ROLES.SUPER_ADMIN,
]

/** Admin-and-above roles (may open financial reports). */
export const ADMIN_ROLES = [ROLES.BROKER_ADMIN, ROLES.SUPER_ADMIN]

/** True when the role is any staff role (not a plain customer). */
export function isStaffRole(role) {
  return STAFF_ROLES.includes(role)
}

/** Normalise an unknown/missing role to CUSTOMER (least privilege). */
export function rankOf(role) {
  return ROLE_RANK[role] ?? ROLE_RANK[ROLES.CUSTOMER]
}

/** True when `role` is at least as privileged as `minRole`. */
export function roleAtLeast(role, minRole) {
  return rankOf(role) >= rankOf(minRole)
}

/** Named capabilities → the minimum role required to exercise them. */
export const CAPABILITIES = {
  REVIEW_ORDERS: 'review_orders',
  VIEW_STORES: 'view_stores',
  VIEW_REPORTS: 'view_reports',
}

const CAPABILITY_MIN_ROLE = {
  [CAPABILITIES.REVIEW_ORDERS]: ROLES.BROKER_MANAGER,
  [CAPABILITIES.VIEW_STORES]: ROLES.BROKER_MANAGER,
  [CAPABILITIES.VIEW_REPORTS]: ROLES.BROKER_ADMIN,
}

/** True when `role` may use `capability` (inheritance-aware). */
export function can(role, capability) {
  const min = CAPABILITY_MIN_ROLE[capability]
  return min ? roleAtLeast(role, min) : false
}

/** Where to land a user of `role` right after they sign in. */
export function homeRouteFor(role) {
  return isStaffRole(role) ? '/review' : '/'
}
