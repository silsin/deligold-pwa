import { reactive } from 'vue'

/**
 * Global login/register sheet state.
 *
 * Login is a bottom popup sheet, not a page — so any view, drawer item or
 * route guard can raise it without importing a store or wiring props.
 * `openLogin()` is exposed as a Vue global (see main.js), so templates just
 * call `openLogin('login')` / `openLogin('register')`.
 *
 * The `returnTo` path lets a guard remember where the guest was heading so
 * the sheet can land them there after a successful sign-in.
 *
 * `pendingInvite` holds invite details when a visitor arrived via ?invite=
 * and needs to register. The register form pre-fills the broker name.
 *
 * IMPORTANT: this is a `reactive()` object holding *plain values*, not an
 * object of `ref()`. Templates read/write `authGate.mode = 'register'`
 * directly, and only a reactive proxy unwraps and tracks that. Wrapping refs
 * in a plain object (the previous version) leaves `authGate.open` truthy as
 * a Ref object and silently breaks every binding here.
 */
export const authGate = reactive({
  open: false,
  mode: 'login',
  returnTo: null,
  pendingInvite: null,

  /** Raise the sheet. `preferred` is the tab to open on. */
  openLogin(preferred = 'login', backTo = null) {
    this.mode = preferred === 'register' ? 'register' : 'login'
    this.returnTo = backTo
    this.open = true
  },

  closeLogin() {
    this.open = false
    this.returnTo = null
    this.pendingInvite = null
  },

  /** Called after a successful login/register — hands back the pending path. */
  consumeReturnTo() {
    const target = this.returnTo
    this.returnTo = null
    return target
  }
})

// Named exports too, so callers can import just what they use.
// These are wrapper functions on purpose — destructuring a method off a reactive
// proxy drops its `this`, so `openLogin`/`closeLogin` must delegate instead.
export function openLogin(preferred = 'login', backTo = null) {
  return authGate.openLogin(preferred, backTo)
}

export function closeLogin() {
  return authGate.closeLogin()
}

export function consumeReturnTo() {
  return authGate.consumeReturnTo()
}
