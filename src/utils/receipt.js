import { api } from './api.js'

/**
 * Downloads a PDF receipt for the given order and triggers the browser's
 * save-file dialog.
 *
 * The axios response interceptor in api.js does:
 *   response.data?.data ?? response.data
 * For responseType:'blob', response.data is a Blob object.
 * response.data?.data is undefined (Blobs have no .data property),
 * so the ?? short-circuits to response.data — the Blob itself.
 * No extra unwrapping is needed.
 *
 * @param {string} orderId  - UUID of the order.
 * @param {string} [ref]    - Human-readable ref like "DLY-000123", used for
 *                            the suggested filename. Falls back to the orderId.
 * @returns {Promise<void>}
 */
export async function downloadOrderReceipt(orderId, ref) {
  const blob = await api.get(`/trade/orders/${orderId}/receipt.pdf`, {
    responseType: 'blob',
  })

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = ref ? `receipt-${ref}.pdf` : `receipt-${orderId}.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Release the object URL after a delay so the download can start.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
