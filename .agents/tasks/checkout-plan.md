# Implementation Plan: Intelligent Wallet Balance Checking and Checkout Flow

## Summary
Implement a two-modal checkout flow for buy/sell orders: if wallet balance is sufficient, show a confirmation modal; otherwise, direct to DepositSheet to charge the wallet, then re-show confirmation on return. Keep order details in state throughout the entire flow so the user can retry after depositing.

---

## Design Decisions

### 1. CheckoutModal Component
**Decision**: Create a new `src/components/CheckoutModal.vue` component.
**Rationale**: The existing QuickOrderSheet only handles input and submission. A dedicated checkout confirmation component keeps concerns separate and allows re-use if needed (e.g., other entry points to trading). It displays a read-only summary of symbol, side, grams, price, fee, and total, with Confirm/Cancel buttons.

### 2. Z-Index Layering
**Decision**: CheckoutModal uses `z-index: 75`; DepositSheet stays at 70; QuickOrderSheet at 60.
**Rationale**: Exploration shows the existing stack: LoginSheet (90), TermsModal (80), DepositSheet/AppDrawer (70), QuickOrderSheet/MarketSheet (60). CheckoutModal sits between TermsModal and DepositSheet, ensuring it always appears above QuickOrderSheet but can also layer above DepositSheet when needed (though the intended flow shows them sequentially, not overlapped).

### 3. DepositSheet Pre-fill
**Decision**: Add optional `initialAmount` prop to DepositSheet; watch it and seed amount.value and raw.value on mount and when prop changes.
**Rationale**: Avoids modifying DepositSheet's API beyond adding a single optional prop. The component remains backward-compatible—existing callers without initialAmount see no change.

### 4. Order State Preservation
**Decision**: Store pendingOrder as a ref object `{symbol, side, grams, execPrice, orderFee, netTotal}` in QuickOrderSheet, persisting across wallet charge → recheck → checkout flow.
**Rationale**: User can charge their wallet and immediately proceed to checkout without re-entering. Clears on modal close or after successful order placement.

### 5. Balance Refresh Before Checkout Decision
**Decision**: Call `auth.fetchWallet()` after user submits the order form but before deciding between checkout and deposit modals.
**Rationale**: Ensures the wallet balance is current; in a live multi-tab or multi-device scenario, another tab may have charged or spent since the page loaded. This is defensive but safe—a single extra API call per order placement.

### 6. Deposit Flow Recovery
**Decision**: After `auth.requestDeposit()` succeeds, call `fetchWallet()`, then re-check balance against `pendingOrder.netTotal`.
**Rationale**: The backend has credited the wallet after the deposit request is approved (or queued). Fetching gives the user immediate feedback. If balance is now sufficient, show CheckoutModal. If not, keep DepositSheet open with an error message informing the user the charge is pending approval.

---

## Implementation Steps

- [ ] 1. Create `src/components/CheckoutModal.vue` with order summary display and Confirm/Cancel buttons.
      Props: `open` (Boolean), `symbol` (String), `symbolName` (String), `side` (String: BUY|SELL), `grams` (Number), `execPrice` (Number), `orderFee` (Number), `netTotal` (Number).
      Emits: `confirm`, `cancel`.
      Styling: match existing sheet aesthetic using CSS variables (--card, --border, --up, --down, --accent, --text, --text-muted).
      Z-index: 75.
      Files: `src/components/CheckoutModal.vue`
      Verify: Run `npm run build` and confirm no TypeScript/build errors.

- [ ] 2. Add `initialAmount` prop to `src/components/wallet/DepositSheet.vue`.
      Props: add `initialAmount` (Number, default 0).
      On mount and whenever initialAmount prop changes: if initialAmount > 0, set `amount.value = initialAmount` and `raw.value = toFa(initialAmount)`.
      Files: `src/components/wallet/DepositSheet.vue`
      Verify: Run `npm run build` and confirm no errors. Manual test: pass initialAmount=500000 to DepositSheet and confirm the field is pre-filled with "۵۰۰۰۰۰".

- [ ] 3. Modify `src/views/QuickOrderSheet.vue` to import CheckoutModal and DepositSheet, and add reactive state for the two-modal flow.
      Imports: add `CheckoutModal` from `../components/CheckoutModal.vue` and `DepositSheet` from `../components/wallet/DepositSheet.vue`.
      Add refs: `showCheckout` (Boolean, default false), `showDeposit` (Boolean, default false), `pendingOrder` (Object, initially null), `depositAmount` (Number, initially 0).
      Update the watch that resets the sheet: also set showCheckout and showDeposit to false, and clear pendingOrder.
      Files: `src/views/QuickOrderSheet.vue`
      Verify: Run `npm run build` and confirm no errors.

- [ ] 4. Modify `QuickOrderSheet.vue` submit() function to check wallet balance and route to either checkout or deposit modal.
      In submit(), after error handling and busy = true:
        a. Clear any prior error/success messages.
        b. Validate as before (logged in, grams > 0, etc.).
        c. Call `await auth.fetchWallet()` to refresh balance.
        d. Calculate the required amount: `netTotal.value` (already computed, contains orderFee for BUY).
        e. If `auth.balance >= netTotal.value`: set `pendingOrder = {symbol: props.symbol, side: props.side, grams: grams.value, execPrice: execPrice.value, orderFee: orderFee.value, netTotal: netTotal.value}`, then `showCheckout = true`.
        f. Else: set `pendingOrder` (same as above), set `depositAmount = Math.ceil(netTotal.value - auth.balance)`, and `showDeposit = true`.
        g. Set `busy = false` at the end (after balance check completes).
      Files: `src/views/QuickOrderSheet.vue`
      Verify: Run `npm run build`. Manual test: place a BUY order with sufficient balance and confirm CheckoutModal opens. Place a BUY order with insufficient balance and confirm DepositSheet opens with pre-filled amount.

- [ ] 5. Add handler `handleDepositSubmit(payload)` to QuickOrderSheet.vue to call auth.requestDeposit and then recheck balance.
      Signature: async function `handleDepositSubmit(payload)` where payload is `{amount, method, reference, note}` from DepositSheet.
      Logic:
        a. Set `busy = true`, clear error.
        b. Call `await auth.requestDeposit(payload.amount, payload.method, payload.reference, payload.note)`.
        c. If not ok, set error and return.
        d. Call `await auth.fetchWallet()`.
        e. Re-check: if `auth.balance >= pendingOrder.netTotal`, set `showDeposit = false` and `showCheckout = true`.
        f. Else: set error to a message like "درخواست واریز ثبت شد اما هنوز تأیید نشده است. پس از تأیید کارشناس، می‌توانید سفارش را ادامه دهید." and keep `showDeposit = true`.
        g. Set `busy = false`.
      Bind in template: `<DepositSheet v-if="showDeposit" :open="showDeposit" :busy="busy" @submit="handleDepositSubmit" @close="handleDepositClose" />`
      Files: `src/views/QuickOrderSheet.vue`
      Verify: Run `npm run build`. Manual test: trigger deposit flow, submit a deposit request, and confirm DepositSheet either closes (if balance is now sufficient) or stays open with the "pending approval" message.

- [ ] 6. Add handler `handleCheckoutConfirm()` to QuickOrderSheet.vue to place the pending order.
      Signature: async function `handleCheckoutConfirm()`.
      Logic:
        a. If not pendingOrder, return.
        b. Set `busy = true`, clear error/success.
        c. Call `await auth.placeOrder({symbol: pendingOrder.symbol, side: pendingOrder.side, grams: pendingOrder.grams})`.
        d. If not ok, set error and return.
        e. Extract order from result.
        f. If order.kind === 'MANUAL' or order.status === 'AWAITING_RECEIPT', show success message: "سفارش {order.ref} ثبت شد — برای بارگذاری رسید به صفحه معاملات بروید".
        g. Else, show success: "{BUY|SELL} {symbolShort} ثبت شد", and clear amount, percent, pendingOrder.
        h. Call `await auth.fetchAccount()`.
        i. Emit 'done' with the order.
        j. Set `busy = false`, `showCheckout = false`.
      Bind in template: `<CheckoutModal v-if="showCheckout" :open="showCheckout" :symbol="pendingOrder?.symbol" :symbolName="symbolName" :side="pendingOrder?.side" :grams="pendingOrder?.grams" :execPrice="pendingOrder?.execPrice" :orderFee="pendingOrder?.orderFee" :netTotal="pendingOrder?.netTotal" @confirm="handleCheckoutConfirm" @cancel="handleCheckoutCancel" />`
      Files: `src/views/QuickOrderSheet.vue`
      Verify: Run `npm run build`. Manual test: complete the checkout flow (sufficient balance → CheckoutModal → Confirm) and verify the order is placed and success message appears.

- [ ] 7. Add handler `handleCheckoutCancel()` and `handleDepositClose()` to QuickOrderSheet.vue to close modals and optionally clear state.
      Signature: 
        - `handleCheckoutCancel()`: set `showCheckout = false`, clear `pendingOrder` (user abandoned checkout).
        - `handleDepositClose()`: set `showDeposit = false`, clear `pendingOrder` (user closed deposit sheet without completing; order is not placed).
      Bind in template: use these on the @cancel and @close emits of CheckoutModal and DepositSheet.
      Files: `src/views/QuickOrderSheet.vue`
      Verify: Manual test: open CheckoutModal, click Cancel, and confirm modal closes and pendingOrder is cleared (next attempt to order starts fresh).

- [ ] 8. Update QuickOrderSheet.vue template to include CheckoutModal and DepositSheet components with correct props and event bindings.
      Add to template (inside the sheet container or as siblings):
        - `<CheckoutModal ... />` with open, symbol, symbolName, side, grams, execPrice, orderFee, netTotal props; @confirm and @cancel binds.
        - `<DepositSheet ... />` with open, busy, initialAmount props; @submit and @close binds.
      Ensure both are positioned correctly (they use fixed positioning, so placement in the template does not matter).
      Files: `src/views/QuickOrderSheet.vue`
      Verify: Run `npm run build`. Manual full flow test: (1) Insufficient balance → DepositSheet opens, deposit submitted, balance refreshed, CheckoutModal opens; (2) sufficient balance → CheckoutModal opens directly; (3) cancel from either modal clears state; (4) confirm order places it and shows success.

- [ ] 9. Manual end-to-end integration test in the browser.
      Test scenario 1 (insufficient balance): 
        - Open QuickOrderSheet for BUY.
        - Enter amount that exceeds wallet balance (plus fee).
        - Click submit → DepositSheet opens with pre-filled deficit amount.
        - Submit deposit → wallet is charged, DepositSheet re-checks balance.
        - If approved instantly in test: CheckoutModal opens showing the order summary.
        - Click Confirm → order is placed, success message shown.
      Test scenario 2 (sufficient balance):
        - Ensure wallet has enough balance.
        - Open QuickOrderSheet for BUY, enter amount, click submit.
        - CheckoutModal opens directly showing summary.
        - Click Confirm → order is placed, success message shown.
      Test scenario 3 (cancel from checkout):
        - Reach CheckoutModal, click Cancel.
        - Modal closes, amount and percent remain cleared, pendingOrder is null.
        - Click submit again and repeat: state is fresh (not stuck on a partial order).
      Files: Manual test in browser at dev server URL (http://localhost:5173 or configured dev server).
      Verify: All three scenarios pass; no console errors; modals layer correctly; success messages display; orders are placed and fetched correctly.

---

## Verification Checklist

- [ ] npm run build completes without TypeScript or build errors.
- [ ] CheckoutModal displays the correct symbol name, side (buy/sell coloring), grams, price, fee, and total.
- [ ] DepositSheet pre-fill works: pass initialAmount=500000 and confirm the field shows "۵۰۰۰۰۰".
- [ ] QuickOrderSheet flow: insufficient balance → DepositSheet; sufficient balance → CheckoutModal.
- [ ] Deposit submission re-checks balance and either advances to CheckoutModal or shows pending-approval message.
- [ ] Checkout confirmation places the order, shows success message, and clears state.
- [ ] Cancel from either modal closes it and clears pendingOrder.
- [ ] Z-index layering is correct: CheckoutModal appears above QuickOrderSheet (60) and DepositSheet (70).
- [ ] All components maintain styling consistency with existing modals/sheets (use of CSS variables, rounded corners, Material Icons, Persian text formatting).

---

## Files to Create or Modify

**Create:**
- `src/components/CheckoutModal.vue`

**Modify:**
- `src/components/wallet/DepositSheet.vue`
- `src/views/QuickOrderSheet.vue`

---

## Notes

- The flow does NOT automatically place the order after deposit; it re-shows the CheckoutModal so the user explicitly confirms. This aligns with the user's request: "after charge it should proceeding, my mean is showing checkout again and ask for confirm".
- Balance refresh is defensive: in a live app, another tab or device may have changed the wallet state since the page loaded.
- Error messages remain visible in both QuickOrderSheet (for deposit rejection/error) and CheckoutModal (inherited from QuickOrderSheet's message display).
- If the user closes DepositSheet without completing the deposit, pendingOrder is cleared and the order flow restarts on the next submit—the wallet is not charged and no order is placed.
