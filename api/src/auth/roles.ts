import { Role } from '@prisma/client';

/**
 * The role hierarchy and what each role may do.
 *
 * Roles are ordered by privilege. A role's grant is the union of its own
 * permissions and everything below it in `RANK`, so BROKER_ADMIN can do anything
 * a BROKER_MANAGER or CUSTOMER can — a manager cannot outrank their admin.
 *
 * - SUPER_ADMIN: the platform owner. Sees every broker, seeds accounts, changes
 *   any user's role.
 * - BROKER_ADMIN: runs one organisation (a Broker). Sees only their own subtree,
 *   creates managers and customers, approves withdrawals.
 * - BROKER_MANAGER: staff inside one broker. Handles customers and stores, but
 *   cannot create other managers or change roles.
 * - CUSTOMER: self-registers in the app and trades.
 */
export const RANK: Record<Role, number> = {
  SUPER_ADMIN: 40,
  BROKER_ADMIN: 30,
  BROKER_MANAGER: 20,
  CUSTOMER: 10,
};

/** True when `actor` outranks `target` — required before changing that user. */
export function outranks(actor: Role, target: Role): boolean {
  return RANK[actor] > RANK[target];
}

/** True when `actor` is at least as privileged as `required`. */
export function atLeast(actor: Role, required: Role): boolean {
  return RANK[actor] >= RANK[required];
}

/**
 * Which roles each may create or promote someone to. A user can never mint a
 * role at or above their own level — that is the rule that stops a BROKER_ADMIN
 * from creating another BROKER_ADMIN, or a rogue SUPER_ADMIN being manufactured.
 */
export function assignableRoles(actor: Role): Role[] {
  const level = RANK[actor];
  return (Object.keys(RANK) as Role[]).filter(r => RANK[r] < level);
}
