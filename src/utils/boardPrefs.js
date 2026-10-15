/**
 * Home board preferences — customer only.
 *
 * Default: a single featured symbol (2 buttons: buy + sell).
 * The customer can enable more symbols from Settings; the board then
 * shows one row (buy+sell) per enabled symbol.
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
 * Null = default (featured only). Array = explicit enabled symbols.
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
