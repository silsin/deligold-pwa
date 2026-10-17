# Broker Manager Customer Management — Design

## Overview

This feature lets a BROKER_MANAGER (and BROKER_ADMIN) run their own customer
book: generate shareable invite codes (with a QR) that register new CUSTOMERs
into their broker, manually add customers, see each customer's wallet and
orders, control which symbols each customer may buy/sell, and have deposit
approvals routed to their own organisation's managers. It spans the Prisma
schema, four NestJS modules (one new), the trading order path, the wallets
approval path, and three new/modified PWA screens.

The design deliberately reuses what already works. Manual customer creation,
verify, and block already exist on `POST /users`, `POST /users/:id/verify`,
`POST /users/:id/status`; the new customers screen calls those rather than
duplicating them. The customer wallet/positions/orders read reuses the existing
`TradingService.wallet/positions/myOrders` by exposing a staff-scoped overview
endpoint in the trading module, so positions are marked to the same live board
as the customer's own screen. Per-customer trade permissions live in a small
new `PermissionsModule` (Prisma-only) imported by both the trading module (for
the order check) and the users module (for the staff CRUD), which avoids any
cross-coupling between users and trading. Invites get their own
`InvitesModule`. The only existing behaviour that changes is wallets: the
`pending()` approval list and the approve/reject actions become broker-scoped,
which is the explicit "wallet charge routing" requirement and a safety fix
(managers can no longer see or approve another broker's deposits).

Technology stack is locked to what the project already uses: NestJS 11 +
Prisma 6 + SQLite on the API, Vue 3 (`<script setup>`) + Pinia + Vue Router
(hash history) + Vite on the PWA. The only new dependency is the `qrcode` npm
package on the PWA, for client-side QR rendering.

## Requirements (restated, with assumptions)

1. **Invite system.** A BROKER_MANAGER or BROKER_ADMIN generates a short code
   embeddable in `https://trade.ziva-vpn.online/?invite=ABC123`. A new user
   scanning it is registered as a CUSTOMER linked to that broker (`brokerId`).
   The PWA home detects `?invite=`, pre-fills the register sheet, and the
   server assigns the broker on `POST /auth/register` from an optional
   `inviteCode` field. Codes may have an optional expiry and max-uses.
   *Assumption:* invited customers are created **unverified**, exactly like a
   normal self-registration — the manager then verifies them from the
   customers screen. (See Open decisions.)

2. **Customer management screen.** BROKER_MANAGER/BROKER_ADMIN get a مشتریان
   screen listing their broker's customers, with: manual add (name/phone/
   password), per-customer wallet balance + open positions + order history,
   block/unblock, verify, generate invite + QR, and a list of active invite
   codes with usage stats.

3. **Per-customer trade permissions.** Managers enable/disable buy and sell per
   symbol per customer. Default: all symbols allowed (no row = allowed), so
   existing trading never breaks. The order path checks the permission.

4. **Wallet charge routing.** A customer's deposit approval goes to that
   broker's managers. The existing pending-approvals screen already calls
   `GET /wallet/pending`; that endpoint is extended to scope by broker.

5. **Backward compatibility.** `POST /auth/register` without `inviteCode`
   behaves exactly as today (public self-register as CUSTOMER, `brokerId`
   null). Existing non-invited registrations are untouched.

## Data model — `api/prisma/schema.prisma`

Two new models and the relations to support them. All additions follow the
existing audit pattern (record `createdById`/`updatedById`, `onDelete` rules
matching `verifiedBy`/`createdBy`).

### New: `Invite`

```prisma
/// A shareable code that registers a new CUSTOMER into one broker.
/// Scanned from a QR / link on the PWA; redeemed once per new sign-up.
model Invite {
  id         String    @id @default(uuid())
  /// Short code embedded in the invite URL, e.g. "AB3X9KQ2". Unique.
  code       String    @unique
  brokerId   String
  broker     Broker    @relation(fields: [brokerId], references: [id], onDelete: Cascade)
  /// Who created the invite, for the audit trail. Nullable so deleting the
  /// creator does not cascade-delete the invite history.
  createdById String?
  createdBy   User?    @relation("InviteCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
  /// Optional expiry; null = never expires.
  expiresAt  DateTime?
  /// Optional cap on redemptions; null = unlimited.
  maxUses    Int?
  /// Redemptions so far. Incremented atomically inside the register transaction.
  uses       Int       @default(0)
  /// Soft-disable so a manager can retire a code without losing its history.
  active     Boolean   @default(true)
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  /// The customers who registered through this invite.
  users      User[]    @relation("InviteRedeemedBy")

  @@index([brokerId])
}
```

### New: `CustomerPermission`

One row per (customer, symbol). **Absence of a row means "allowed"** — that is
what keeps existing trading working without a migration seeding rows.

```prisma
/// Per-customer trade permission for one symbol. Absence = allowed (default),
/// so the whole customer base is unrestricted until a manager restricts a
/// symbol. The trading service reads this on every order.
model CustomerPermission {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  symbol    String
  allowBuy  Boolean  @default(true)
  allowSell Boolean  @default(true)
  /// Who last changed this permission, for the audit trail.
  updatedById String?
  updatedBy   User?  @relation("PermissionUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)
  updatedAt DateTime @updatedAt

  /// One permission row per customer per symbol.
  @@unique([userId, symbol])
  @@index([userId])
}
```

### Relations added to `User`

```prisma
  /// The invite this customer redeemed at sign-up, if any.
  redeemedInviteId String?
  redeemedInvite   Invite?  @relation("InviteRedeemedBy", fields: [redeemedInviteId], references: [id], onDelete: SetNull)
  /// Invites this user has created (managers/admins).
  createdInvites   Invite[] @relation("InviteCreatedBy")
  /// Per-symbol trade permissions set on this customer.
  customerPermissions CustomerPermission[]
  /// Permission rows this user has edited (audit).
  permissionUpdates   CustomerPermission[] @relation("PermissionUpdatedBy")
```

### Relations added to `Broker`

```prisma
  /// Invite codes generated for this organisation.
  invites Invite[]
```

After editing, run `npx prisma generate` and `npx prisma db push` in
`api/` (no migration history is used in this project — `db push` syncs the
SQLite file directly, as the existing workflow does).

## API design

All new endpoints follow the existing pattern: controller → service → Prisma,
`@Roles(...STAFF)` where `STAFF = [BROKER_MANAGER, BROKER_ADMIN, SUPER_ADMIN]`,
`TradeError` for domain failures (auto-mapped to the right status by the
existing global filter), `{ success, data }` response unwrapped by the PWA
axios interceptor. `AuthUser` (`{ userId, role, brokerId, name }`) is injected
via `@CurrentUser()`.

### 1. `InvitesModule` (new) — `api/src/invites/`

New module, depends on `PrismaModule` only. Registered in `AppModule.imports`.

**`invites.controller.ts`** — `@Controller('invites')`:

| Method | Route | Guard | Body / Query | Returns |
|---|---|---|---|---|
| `POST` | `/invites` | `@Roles(...STAFF)` | `CreateInviteDto` | `InviteView` |
| `GET` | `/invites` | `@Roles(...STAFF)` | `?brokerId=` (SUPER_ADMIN only) | `InviteView[]` |
| `GET` | `/invites/:code` | `@Public()` | — | `InviteLookupView` |
| `PATCH` | `/invites/:id` | `@Roles(...STAFF)` | `UpdateInviteDto` | `InviteView` |

`@Public()` on the lookup mirrors `GET /market/board` — a signed-out visitor
following an invite link needs to know it is valid before the register sheet
opens.

**`dto/invites.dto.ts`:**

```ts
export class CreateInviteDto {
  @IsOptional() @IsDateString() expiresAt?: string;   // ISO 8601
  @IsOptional() @IsInt() @Min(1) maxUses?: number;
  @IsOptional() @IsString() brokerId?: string;        // SUPER_ADMIN only
}
export class UpdateInviteDto {
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsDateString() expiresAt?: string | null;
}
```

**`invites.service.ts`** — `InvitesService`:

- `generate(actor, dto) → InviteView`
  - Resolve the target broker: if `actor.role === SUPER_ADMIN` use
    `dto.brokerId` (validate the broker exists → `TradeError('سازمان مشخص نیست', 400)`
    if missing/unknown); otherwise force `brokerId = actor.brokerId` and reject
    with `TradeError('سازمان شما مشخص نیست', 400)` if null.
  - Validate `expiresAt` (if given) is in the future →
    `TradeError('تاریخ انقضای دعوت باید در آینده باشد', 400)`.
  - Validate `maxUses >= 1` (DTO does the `@Min(1)`).
  - Generate an 8-char code from a 32-symbol alphabet (no `0/O/1/I` to avoid
    ambiguity) using `node:crypto.randomBytes`. Attempt `invite.create`; on a
    unique-violation (`P2002`) regenerate, up to 5 attempts. After 5 collisions
    throw `TradeError('ایجاد کد دعوت ناموفق بود', 500)` (practically never hit).
  - Persist `{ code, brokerId, createdById: actor.userId, expiresAt, maxUses,
    active: true, uses: 0 }`.
  - `this.logger.log(\`invite ${code} created by ${actor.userId}\`)` at info.

- `list(actor, query?) → InviteView[]`
  - SUPER_ADMIN: `brokerId` from query if provided, else all. Everyone else:
    own `brokerId` only (`actor.brokerId ?? NO_BROKER`).
  - `include: { broker: { select: { name } }, createdBy: { select: { name } },
    _count: { select: { users: true } } }` so the view can show broker name,
    creator name, and redemption count.
  - Compute `valid` server-side: `active && !expired && (maxUses == null ||
    uses < maxUses)` where `expired = expiresAt != null && expiresAt < now`.

- `lookup(code) → InviteLookupView` (public)
  - `findUnique({ where: { code } })`. Not found → `TradeError('کد دعوت یافت نشد', 404)`.
  - Return `{ code, brokerName, active, expired, exhausted, valid }`.
    `exhausted = maxUses != null && uses >= maxUses`. Broker name is non-secret
    and the code space (32^8 ≈ 1.1e12) is unguessable, so this public lookup is
    safe (same reasoning as the public board).

- `update(actor, id, dto) → InviteView`
  - Load the invite; not found → 404. `assertSameBroker`: SUPER_ADMIN bypass,
    else `(invite.brokerId ?? null) !== (actor.brokerId ?? null)` →
    `TradeError('این دعوت متعلق به سازمان شما نیست', 403)`.
  - Apply `active`/`expiresAt`. `expiresAt` may be set to null (clear expiry).
  - Returns the updated view.

**`InviteView`** (sent to staff): `{ id, code, brokerId, brokerName, createdByName,
expiresAt, maxUses, uses, remaining, active, valid, createdAt }` where
`remaining = maxUses == null ? null : Math.max(0, maxUses - uses)`.

The invite **URL is built on the frontend** from `window.location.origin` +
`/?invite=` + `code` (see Frontend). The API returns only the `code`, so no new
env var is needed and the URL is always correct for whichever host the manager
is on.

### 2. Register with `inviteCode` — `api/src/auth/`

**`dto/auth.dto.ts`** — add to `RegisterDto`:

```ts
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z2-9]{4,16}$/i, { message: 'کد دعوت نامعتبر است' })
  inviteCode?: string;
```

(The regex matches the 32-symbol alphabet the generator uses; case-insensitive
so a typed code works too.)

**`auth.service.ts`** — `register(dto, actor?)`:

The only change is the invite resolution, applied **only on public
self-registration** (`actor` absent). When `actor` is present (staff sign-up
via `/auth/register`, which is unusual — staff use `/users`) `inviteCode` is
ignored and the existing staff path runs unchanged.

When `dto.inviteCode` is present and there is no actor:

1. `const invite = await prisma.invite.findUnique({ where: { code: dto.inviteCode.trim().toUpperCase() } })`.
   Not found → `TradeError('کد دعوت یافت نشد', 404)`.
2. Validate, each with its own message so a real invitee knows why:
   - `!invite.active` → `TradeError('این کد دعوت غیرفعال است', 400)`.
   - `invite.expiresAt && invite.expiresAt < new Date()` →
     `TradeError('کد دعوت منقضی شده است', 400)`.
   - `invite.maxUses != null && invite.uses >= invite.maxUses` →
     `TradeError('ظرفیت این کد دعوت تکمیل شده است', 400)`.
3. Capture `brokerId = invite.brokerId`, `redeemedInviteId = invite.id`.

The existing `$transaction` that creates the user + wallet is extended to also
increment the invite **inside the same transaction**, with an in-transaction
exhaustion re-check to handle two simultaneous registrations racing the last
slot:

```ts
const user = await this.prisma.$transaction(async tx => {
  const created = await tx.user.create({
    data: {
      phone, name: dto.name.trim(), nationalId: dto.nationalId ?? null,
      password: passwordHash, role: Role.CUSTOMER, status: 'ACTIVE',
      brokerId, redeemedInviteId, createdById: null,
    },
  });
  await tx.wallet.create({ data: { userId: created.id } });

  const updated = await tx.invite.update({
    where: { id: invite.id },
    data: { uses: { increment: 1 } },
  });
  if (invite.maxUses != null && updated.uses > invite.maxUses) {
    throw new TradeError('ظرفیت این کد دعوت تکمیل شده است', 400);
  }
  return created;
});
```

Throwing inside the transaction rolls back the user, the wallet, **and** the
`uses` increment, so a failed/overflowed redemption leaves no trace. The
existing "phone already registered" 409 check runs before the transaction as
today. A successful register returns `issue(user)` unchanged; the JWT already
carries `brokerId` (the `issue` helper reads `user.brokerId`), so the new
customer's token is broker-scoped from the first request.

`PublicUser` already exposes `brokerId`, so no change to `toPublicUser`.

### 3. `PermissionsModule` (new) + endpoints on `UsersController`

A small module holding `PermissionsService` (Prisma-only), exported and
imported by both `TradingModule` (for the order check) and `UsersModule` (for
the staff CRUD). This keeps users and trading from depending on each other.

**`api/src/permissions/permissions.service.ts`:**

- `listForUser(actor, userId) → PermissionView[]`
  - Load the user; not found → 404. `assertSameBroker(actor, user)`. Require
    `user.role === CUSTOMER` → else `TradeError('دسترسی معامله فقط برای مشتریان تنظیم می‌شود', 400)`.
  - Fetch all `CustomerPermission` rows for `userId` into a map by symbol.
  - Return one entry per `TRADE_SYMBOLS`: `{ symbol, name, allowBuy, allowSell,
    explicit }` where `explicit = row exists` and the booleans default to
    `true` when no row exists. (`name` from `symbolMeta`.)

- `setForUser(actor, userId, items) → PermissionView[]`
  - Same guards as `listForUser`.
  - Validate each item: `isTradeSymbol(item.symbol)` → else
    `TradeError(\`نماد ${item.symbol} معاملاتی نیست\`, 400)`; `allowBuy`/
    `allowSell` must be booleans.
  - Inside `$transaction`, `upsert` each row by `userId_symbol`
    (`create`/`update` with `allowBuy`, `allowSell`, `updatedById:
    actor.userId`). Removing both restrictions (both true) may either keep an
    explicit row or delete it; **deleting** keeps the table sparse and matches
    "absence = allowed", so when `allowBuy && allowSell` the row is deleted.
  - Return `listForUser(actor, userId)`.

- `canTrade(userId, symbol, side) → void` (called by `TradingService`)
  - `findUnique({ where: { userId_symbol: { userId, symbol } } })`.
  - No row → return (default allow — existing behaviour unchanged).
  - Row present: `allowed = side === 'BUY' ? row.allowBuy : row.allowSell`.
    `!allowed` → `throw new TradeError('معامله این نماد برای شما محدود شده است', 403)`.
  - DB error propagates (trade fails). No extra logging — consistent with the
    other `TradeError`s in `placeOrder`.

**Endpoints** added to `users.controller.ts` (keeps routes under `/users`,
consistent with `:id/verify`, `:id/status`, `:id/role`):

| Method | Route | Guard | Body | Returns |
|---|---|---|---|---|
| `GET` | `/users/:id/permissions` | `@Roles(...STAFF)` | — | `PermissionView[]` |
| `PUT` | `/users/:id/permissions` | `@Roles(...STAFF)` | `{ items: PermissionItem[] }` | `PermissionView[]` |

`PermissionItem = { symbol: string; allowBuy: boolean; allowSell: boolean }`.
`UsersController` injects `PermissionsService`; `UsersModule` imports
`PermissionsModule`.

### 4. Trading permission check — `api/src/trading/`

`TradingModule` imports `PermissionsModule`; `TradingService` gets
`private readonly permissions: PermissionsService` injected.

In `placeOrder`, the check runs **after** the existing symbol/grams validation
and the user load + status check, and **before** the verified/unverified
branch — so it gates both the instant TRADE settle and the MANUAL receipt buy,
and a denied SELL is caught too:

```ts
if (user.status !== 'ACTIVE') throw new TradeError('حساب شما فعال نیست', 403);
await this.permissions.canTrade(userId, symbol, side);   // ← new
const verified = user.verifiedAt !== null;
```

A denial is a recoverable 403: the customer sees the Persian message and can
pick another symbol. No change to `settleBuy`/`settleSell`/`createManualOrder`.
Staff (no permission rows) are unaffected — default allow.

### 5. Customer overview — `api/src/trading/`

A staff endpoint that reuses the existing position/order marking (which already
couples to `MarketService`), so the manager sees the same live numbers the
customer sees. Added to `trading.controller.ts`:

| Method | Route | Guard | Returns |
|---|---|---|---|
| `GET` | `/trade/customers/:id/overview` | `@Roles(...STAFF)` | `{ user, wallet, positions, orders }` |

`TradingService.customerOverview(actor, id)`:
- Load the user with `select: { id, name, phone, role, brokerId, verifiedAt,
  status, createdAt }`. Not found → 404.
- `assertSameBroker(actor, user)` (reuse the existing private helper; SUPER_ADMIN
  bypass). Require `role === CUSTOMER` → else
  `TradeError('این کاربر مشتری نیست', 400)`.
- Return `{ user: toPublicUser-ish (reuse `toPublicUser` from AuthModule, already
  imported via `TradingModule`? — it is not; see note), wallet:
  await this.wallet(id), positions: await this.positions(id), orders: await
  this.myOrders(id, 20) }`.

  `TradingModule` does not import `AuthModule` today. Rather than add that
  import just for `toPublicUser`, the overview returns the already-selected
  customer fields directly as a plain `CustomerSummary` object
  (`{ id, name, phone, role, verified, status, createdAt }`). This avoids a new
  module dependency and keeps the response shape intentional for a staff view.

### 6. Wallet deposit routing — `api/src/wallets/`

Two changes, both backward-compatible in shape (the response still wraps
`{ deposits, withdrawals }`):

**`pending(actor)` scoping.** Change `WalletsService.pending()` to
`pending(actor: { role: Role; brokerId: string | null })`:

```ts
const scope = actor.role === Role.SUPER_ADMIN
  ? {}
  : { wallet: { user: { brokerId: actor.brokerId ?? NO_BROKER } } };
const [deposits, withdrawals] = await Promise.all([
  this.prisma.deposit.findMany({ where: { status: 'PENDING', ...scope },
    include: { wallet: { include: { user: { select: { id: true, name: true, phone: true } } } } },
    orderBy: { createdAt: 'asc' }, take: 200 }),
  this.prisma.withdrawal.findMany({ where: { status: 'PENDING', ...scope },
    include: { wallet: { include: { user: { select: { id: true, name: true, phone: true } } } } },
    orderBy: { createdAt: 'asc' }, take: 200 }),
]);
```

`CashMoveView` gains an optional `customer?: { id: string; name: string | null;
phone: string | null }` populated only from `pending()` (the customer-facing
`myDeposits`/`myWithdrawals` leave it `null` — no leak, since the caller is the
customer). The `depositView`/`withdrawalView` helpers take the optional
customer. `WalletsController.pending(@CurrentUser() user)` passes the actor.

**Same-broker guards on approve/reject.** Today any staff can approve any
deposit. Extend the four methods to take the full `actor: AuthUser` and assert
the move belongs to the actor's broker:

- `approveDeposit(actor, id)`: load deposit with `include: { wallet: { include:
  { user: { select: { brokerId: true } } } } }`; `assertSameBroker(actor,
  deposit.wallet.user)` → `TradeError('این واریز متعلق به مشتری سازمان شما نیست', 403)`.
  Then existing logic.
- `rejectDeposit(actor, id, note)`, `approveWithdrawal(actor, id)`,
  `rejectWithdrawal(actor, id, note)`: same guard. The controller changes from
  passing `user.userId` / no user to passing the full `user`. The store's
  `decideCash` calls the same paths, so no frontend change is needed for the
  routing itself (the existing ManagerDeskView cash tab now only shows the
  manager's own broker's moves).

This is the "wallet charge routing to the broker's managers" requirement, and a
privilege fix: a manager can no longer approve a rival broker's deposit.

## Frontend design

Style matches the existing staff screens (`UsersView.vue`, `ManagerDeskView.vue`):
`<script setup>`, scoped CSS using `var(--…)` tokens, `material-icons`, Persian
RTL, `faMoney`/`toFa` from `utils/format.js`.

### `?invite=` detection on the home page

Because the router uses `createWebHashHistory`, the `?invite=` query lives on
the document URL, not the hash, so `useRoute().query` does not see it. Detection
runs in `App.vue` `onMounted` (before the existing session restore), via a small
helper `src/utils/invite.js`:

```js
export function readInviteCode() {
  try {
    const code = new URLSearchParams(window.location.search).get('invite');
    if (code) window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    return code ? code.toUpperCase() : null;
  } catch { return null; }
}
```

`App.vue` onMounted: `const code = readInviteCode()`. If `code` and the user is
**not** logged in:

1. `const info = await api.get(\`/invites/${code}\`)` (public lookup) inside a
   try/catch — on failure show `auth.error` and stop (do not open the sheet for
   a dead code).
2. `authGate.pendingInvite = { code, brokerName: info.brokerName }`;
   `authGate.openLogin('register')`.

If the user **is** already logged in, the invite is ignored (it is for new
users) — optionally a transient note "برای استفاده از دعوت‌نامه ابتدا خارج
شوید" (nice-to-have, not required). After use, `authGate.pendingInvite` is
cleared.

`authGate` (`utils/authGate.js`) gains `pendingInvite: null`.

### `LoginSheet.vue` — invite pre-fill

When `authGate.pendingInvite` is set and the sheet opens, the register form
shows a read-only badge "دعوت‌نامه: کارگزاری <brokerName>" and stores the code.
`auth.register` is extended to accept an optional 5th arg `inviteCode`, which it
posts as `inviteCode` in the `/auth/register` body. The existing 4-arg calls
(the tab-bar / drawer CTA paths) pass nothing and behave exactly as today. On
success, `authGate.pendingInvite` is cleared.

### `src/stores/customers.js` (new)

Keeps `auth.js` from bloating further (it already owns directory/verify/status).
Uses the same `api` client and `setToken` patterns as `auth.js`. State/actions:

- `invites` ref, `invitesLoading`, `invitesError`
- `fetchInvites()` → `GET /invites`
- `createInvite({ expiresAt?, maxUses? })` → `POST /invites`; prepends to list
- `updateInvite(id, { active })` → `PATCH /invites/:id`; updates list
- `permissions` ref (per loaded customer), `permissionsLoading`
- `fetchPermissions(userId)` → `GET /users/:id/permissions`
- `savePermissions(userId, items)` → `PUT /users/:id/permissions`
- `overview` ref, `fetchOverview(userId)` → `GET /trade/customers/:id/overview`

It reuses `auth.fetchDirectory({ role: 'CUSTOMER', ... })`, `auth.createStaffUser`,
`auth.setCustomerVerified`, `auth.setCustomerStatus` for the customer list and
verify/block/add actions (those already exist and are broker-scoped server-side).

### `src/views/CustomersView.vue` (new) — مشتریان

Two tabs, matching `ManagerDeskView.vue`'s tab pattern:

**مشتریان tab**
- Search/filter form (name/phone, verified) → `auth.fetchDirectory({ search,
  verified, role: 'CUSTOMER', limit: 100 })`. Lists `auth.directory` filtered to
  `role === CUSTOMER` (same computed as `ManagerDeskView`).
- Each card: name, phone, verified badge, a "جزئیات و دسترسی‌ها" button →
  `router.push(\`/customers/${u.id}\`)`, plus the existing verify / block /
  unblock buttons (reuse `auth.setCustomerVerified` / `auth.setCustomerStatus`).
- A "افزودن مشتری" `<details>` form (phone, name, password — all required)
  calling `auth.createStaffUser({ phone, name, password, role: 'CUSTOMER' })`.
  Reuses the exact pattern from `UsersView.vue`'s create form.

**دعوت مشتری tab**
- A "تولید کد دعوت" form: optional expiry (`<input type="date">` → ISO
  `expiresAt`), optional max-uses (`<input type="number" min="1">`). On submit,
  `customers.createInvite(...)` then renders the new code's QR.
- List of `customers.invites`: each row shows the code, usage
  (`uses`/`maxUses` or "نامحدود"), `valid` badge (معتبر / منقضی / تکمیل‌شده /
  غیرفعال), a QR canvas, a "دانلود" button (canvas → PNG), and a
  "غیرفعال‌سازی" button → `customers.updateInvite(id, { active: false })`.
- QR is rendered with the `qrcode` package (see below) from
  `${window.location.origin}/?invite=${code}`.

### `src/views/CustomerDetailView.vue` (new) — جزئیات مشتری

Route `/customers/:id`. Loads `customers.fetchOverview(id)` and
`customers.fetchPermissions(id)`.

- **Overview section**: wallet balance (`faMoney`), open positions
  (`PositionView[]` — symbol, grams, market value, P/L), recent orders
  (`OrderView[]` last 20, status badges via `faStatus`).
- **Permissions section**: for each symbol a row with two toggle switches
  (خرید / فروش). Local reactive state seeded from `permissions`; a "ذخیره
  دسترسی‌ها" button calls `customers.savePermissions(id, items)` with the full
  list. Toggling both on for a symbol maps to "allowed" (the API deletes the
  row). Shows a small note "خاموش = ممنوع، روشن = مجاز؛ نبود محدودیت = مجاز".

### Router — `src/router/index.js`

Add (lazy `import` to keep the bundle split):

```js
const CustomersView = () => import('../views/CustomersView.vue')
const CustomerDetailView = () => import('../views/CustomerDetailView.vue')
// …
{ path: '/customers', name: 'customers', component: CustomersView,
  meta: { title: 'مشتریان', requiresAuth: true, roles: STAFF_ROLES } },
{ path: '/customers/:id', name: 'customer-detail', component: CustomerDetailView,
  meta: { title: 'جزئیات مشتری', requiresAuth: true, roles: STAFF_ROLES } },
```

### AppDrawer — `src/components/AppDrawer.vue`

In the `auth.isStaff` مدیریت group, add a link before "میز کارگزاری":

```html
<button type="button" class="drawer__item" @click="go('/customers')">
  <i class="material-icons">groups</i> مشتریان
</button>
```

`/desk` (میز کارگزاری) stays as the cash-approval desk. Its existing customers
tab remains a quick verify/block surface; the new `/customers` is the primary,
richer customer-management screen. No removal, to avoid reworking
`ManagerDeskView`.

### `qrcode` dependency

Add to the **root** `package.json` `dependencies` (the PWA, not the API):

```json
"qrcode": "^1.5.4"
```

Usage in `CustomersView.vue`:

```js
import QRCode from 'qrcode'
// render into a <canvas ref="qr">
await QRCode.toCanvas(qrCanvas.value, `${window.location.origin}/?invite=${code}`, { width: 220 })
```

`vite build` uses esbuild (no type-check), so the JS-only PWA needs no
`@types/qrcode`. **Decision: client-side QR.** Rationale: the PWA is offline-
capable, the manager is already on the host the invite points at, and the URL
is just `location.origin` + the code — no server round-trip or new env var. A
server-side endpoint would add a dependency and a network call for no benefit
here.

## Error handling

| Operation | Failure | Recoverable? | Caller receives | Logged |
|---|---|---|---|---|
| `POST /invites` | missing/unknown broker (non-SUPER_ADMIN with null brokerId) | yes | 400 `سازمان شما مشخص نیست` | no |
| `POST /invites` | SUPER_ADMIN with unknown `brokerId` | yes | 400 `سازمان مشخص نیست` | no |
| `POST /invites` | `expiresAt` in the past | yes | 400 `تاریخ انقضای دعوت باید در آینده باشد` | no |
| `POST /invites` | 5× code collision | no | 500 `ایجاد کد دعوت ناموفق بود` | error thrown (Nest default) |
| `GET /invites/:code` | not found | yes | 404 `کد دعوت یافت نشد` | no |
| `PATCH /invites/:id` | not same broker | yes | 403 `این دعوت متعلق به سازمان شما نیست` | no |
| `POST /auth/register` (invite) | code not found | yes | 404 `کد دعوت یافت نشد` | no |
| `POST /auth/register` (invite) | inactive / expired / exhausted | yes | 400 with specific message | no |
| `POST /auth/register` (invite) | race over `maxUses` | yes (tx rolled back) | 400 `ظرفیت این کد دعوت تکمیل شده است` | no |
| `POST /auth/register` (invite) | phone already registered | yes | 409 (existing, vague) | no |
| `PUT /users/:id/permissions` | unknown symbol | yes | 400 `نماد X معاملاتی نیست` | no |
| `GET/PUT /users/:id/permissions` | target not in actor's broker | yes | 403 `این کاربر متعلق به سازمان شما نیست` | no |
| `GET/PUT /users/:id/permissions` | target not a CUSTOMER | yes | 400 `دسترسی معامله فقط برای مشتریان تنظیم می‌شود` | no |
| `placeOrder` | permission denied | yes | 403 `معامله این نماد برای شما محدود شده است` | no |
| `GET /trade/customers/:id/overview` | not same broker / not a customer | yes | 403 / 400 | no |
| `GET /wallet/pending` | (scoped) | n/a | only own broker's moves | no |
| `POST /wallet/deposits/:id/approve` etc. | move not in actor's broker | yes | 403 `این واریز متعلق به مشتری سازمان شما نیست` | no |

Invariant ownership: the **server** owns every broker-scope check
(`assertSameBroker` in each service) and the invite validation/exhaustion
re-check inside the transaction. The frontend never trusts its own role/broker
for security — it only uses it for UI gating. `canTrade`'s "absence = allowed"
default is enforced by the permissions service read, not by a migration.

## Testability

- **Unit (API, jest):** `InvitesService` with a mocked `PrismaService` — code
  generation + collision retry, expiry/maxUses validation, `list` broker
  scoping, `lookup` 404, `update` same-broker guard. `PermissionsService` —
  `listForUser` merging defaults vs explicit rows, `setForUser` upsert +
  delete-on-both-true, `canTrade` default-allow vs explicit-deny. `AuthService`
  register-with-invite — valid invite sets `brokerId`+`redeemedInviteId` and
  increments `uses`; exhausted invite throws and creates no user (assert no
  `user.create` / `wallet.create` calls); `inviteCode` ignored when `actor`
  present. `WalletsService.pending` — manager sees only own broker; SUPER_ADMIN
  sees all; approveDeposit rejects cross-broker.
- **Integration (API, supertest as already set up):** `placeOrder` with a deny
  row → 403 and no ledger entry; without a row → fills as today. The
  `maxUses` race is best asserted by a transaction-level test (two concurrent
  registers on a `maxUses: 1` invite → exactly one succeeds, `uses === 1`).
- **Frontend:** no test runner is configured (the PWA builds with Vite/esbuild,
  no vitest). Verification is `npm run build` plus manual smoke of the invite
  flow (scan → sheet prefilled → register → customer appears under the
  broker). If a future step wants coverage, Vitest is the natural addition;
  not added here to avoid scope creep.

## Open decisions

1. **QR generation: client-side via `qrcode`.** Chosen over a server endpoint
   (see `qrcode` dependency section).
2. **Invited customers are created unverified.** Matches existing
   self-registration so the receipt flow and badge logic are unchanged; the
   manager verifies them from the customers screen. Alternative: auto-verify on
   invite (the manager is effectively vouching). Not chosen — it would skip the
   receipt-flow safety check for an unknown walk-in who grabbed a printed QR.
3. **Manual customer creation reuses `POST /users` (role CUSTOMER)** rather than
   a new endpoint; the wallet is created lazily by `ensureWallet` on first
   overview/trade, so `balance` shows `0` immediately. No change to
   `UsersService.create`.
4. **Customer overview lives in TradingModule** (`GET /trade/customers/:id/
   overview`) to reuse the existing position/order marking and `MarketService`
   coupling, rather than adding `MarketModule` to `UsersModule`.
5. **`PermissionsModule` is shared** (imported by both `TradingModule` and
   `UsersModule`) so users and trading never depend on each other.
6. **Wallet `pending`/approve/reject become broker-scoped.** This is a
   behaviour change (managers previously saw all pending moves) and is the
   explicit routing requirement; it is also a privilege fix. Flagged here so the
   review is aware.
7. **Invite codes are 8 chars from a 32-symbol alphabet** (no `0/O/1/I`),
   collision-retried. Unguessable for the public-lookup threat model; not a
   secret token protecting data, only a routing code.
8. **`?invite=` is read from `window.location.search`** (not `useRoute().query`)
   because the app uses hash history; the query is stripped from the URL after
   capture so a refresh does not re-trigger.
9. **`inviteCode` only honoured on public self-registration** (`actor` absent);
   ignored on staff sign-ups via `/auth/register` (staff use `/users`).
10. **Audit:** `createdById`/`updatedById` are recorded on the rows; no
    separate `AuditLog` writes, matching the existing `setVerified`/`setStatus`/
    board-override pattern (only role grants get their own `RoleChange` table).

## File-by-file change list

**API — new**
- `api/src/invites/invites.module.ts`, `invites.controller.ts`, `invites.service.ts`, `dto/invites.dto.ts`
- `api/src/permissions/permissions.module.ts`, `permissions.service.ts`

**API — modified**
- `api/prisma/schema.prisma` — add `Invite`, `CustomerPermission`, User + Broker relations
- `api/src/app.module.ts` — import `InvitesModule`, `PermissionsModule`
- `api/src/auth/dto/auth.dto.ts` — add optional `inviteCode` to `RegisterDto`
- `api/src/auth/auth.service.ts` — invite resolution + atomic `uses` increment in `register`
- `api/src/users/users.module.ts` — import `PermissionsModule`
- `api/src/users/users.controller.ts` — add `GET/PUT /users/:id/permissions`
- `api/src/trading/trading.module.ts` — import `PermissionsModule`
- `api/src/trading/trading.service.ts` — `canTrade` call in `placeOrder`; new `customerOverview(actor, id)`
- `api/src/trading/trading.controller.ts` — `GET /trade/customers/:id/overview`
- `api/src/wallets/wallets.service.ts` — `pending(actor)` scoping + `CashMoveView.customer`; same-broker guards on the four approve/reject methods
- `api/src/wallets/wallets.controller.ts` — pass `@CurrentUser()` actor to `pending`/approve/reject

**PWA — new**
- `src/utils/invite.js` — `readInviteCode()`
- `src/stores/customers.js`
- `src/views/CustomersView.vue`, `src/views/CustomerDetailView.vue`

**PWA — modified**
- `package.json` — add `qrcode` dependency
- `src/App.vue` — `?invite=` detection + open register sheet in `onMounted`
- `src/utils/authGate.js` — add `pendingInvite` field
- `src/components/LoginSheet.vue` — invite badge + pass `inviteCode` to `auth.register`
- `src/stores/auth.js` — `register(phone, password, name, nationalId, inviteCode?)` optional 5th arg
- `src/router/index.js` — `/customers` and `/customers/:id` routes
- `src/components/AppDrawer.vue` — "مشتریان" link in the مدیریت group

## Verification (must pass before done)

1. `npx tsc --noEmit` in `d:\delly-pwa\api` — API compiles with the new modules/DTOs/relations.
2. `npx prisma generate` in `d:\delly-pwa\api` — schema (with `Invite` + `CustomerPermission`) is valid; then `npx prisma db push` to sync.
3. `npm run build` from `d:\delly-pwa` — PWA builds (incl. the `qrcode` import).
4. Backward compat: `POST /auth/register` with no `inviteCode` still creates a CUSTOMER with `brokerId` null and returns a token; existing logins unchanged.

---
*No design review has been run yet — this is the first iteration. On review,
fix every finding in `design-review.json` and resubmit.*
