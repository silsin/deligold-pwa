import { ref } from 'vue'

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
 */
const open = ref(false)
const mode = ref('login')
const returnTo = ref(null)

/** Raise the sheet. `preferred` is the tab to open on. */
function openLogin(preferred = 'login', backTo = null) {
  mode.value = preferred === 'register' ? 'register' : 'login'
  returnTo.value = backTo
  open.value = true
}

function closeLogin() {
  open.value = false
  returnTo.value = null
}

/** Called after a successful login/register — hands back the pending path. */
function consumeReturnTo() {
  const target = returnTo.value
  returnTo.value = null
  return target
}

export const authGate = { open, mode, returnTo, openLogin, closeLogin, consumeReturnTo }

// Named exports too, so callers can import just what they use.
export { open, mode, returnTo, openLogin, closeLogin, consumeReturnTo }
