import { api } from './api.js'

/**
 * Opens the order receipt in a new browser tab as a styled HTML page.
 * The page has a "چاپ / ذخیره PDF" button that triggers window.print(),
 * which lets the user save as PDF via the browser's native print dialog —
 * with full Persian RTL rendering, Vazirmatn font, and correct shaping.
 *
 * @param {string} orderId
 * @param {string} [ref]   - Human-readable ref, used only for the tab title.
 */
export async function downloadOrderReceipt(orderId, ref) {
  // The endpoint returns HTML (text/html). We fetch it with responseType:'text'
  // to bypass the axios JSON interceptor, then open it in a new tab.
  const html = await api.get(`/trade/orders/${orderId}/receipt.pdf`, {
    responseType: 'text',
    transformResponse: [(data) => data], // prevent axios from JSON-parsing it
  })

  const blob = new Blob([html], { type: 'text/html; charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const tab  = window.open(url, '_blank')

  // Release the object URL once the new tab has loaded it
  if (tab) {
    tab.addEventListener('load', () => URL.revokeObjectURL(url), { once: true })
  } else {
    // Popup blocked — fallback: direct navigation
    setTimeout(() => URL.revokeObjectURL(url), 15_000)
  }
}
