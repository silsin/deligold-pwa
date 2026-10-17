/**
 * Home board preferences — customer only.
 *
 * Default: every symbol is enabled — one row (buy+sell) per symbol.
 * The customer can switch symbols off from Settings; the board then shows
 * only the enabled ones (the featured symbol if they switch everything off).
 */

const FEATURED_KEY = 'dg_board_featured'
const VISIBLE_KEY = 'dg_board_visible'

export function loadFeatured(fallback = 'GOLD18') {
  try {
    return localStorage.getItem(FEATURED_KEY) || fallback
  } catch {
    return fallback
  }
}

export function saveFeatured(symbol) {
  try {
    localStorage.setItem(FEATURED_KEY, symbol)
  } catch {
    /* storage unavailable — preference simply won't persist */
  }
}

/**
 * Null = default (all symbols). Array = explicit enabled symbols; an empty
 * array means the customer switched everything off (featured only).
 */
export function loadVisible() {
  try {
    const raw = localStorage.getItem(VISIBLE_KEY)
    if (!raw) return null
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : null
  } catch {
    return null
  }
}

export function saveVisible(symbols) {
  try {
    if (!symbols) localStorage.removeItem(VISIBLE_KEY)
    else localStorage.setItem(VISIBLE_KEY, JSON.stringify(symbols))
  } catch {
    /* ignore */
  }
}
