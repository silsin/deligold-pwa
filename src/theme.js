/**
 * Theme palettes — mirrored from deli-gold's `src/lib/theme.ts` so the trading
 * PWA looks exactly like the store. The admin's palette choice on the website is
 * the source of truth; this copy keeps the app self-contained (no cross-origin
 * dependency just to pick a colour).
 */

export const THEME_PALETTES = [
  { id: 'light',       name: 'روشن (پیش‌فرض)', bg: '#eceef2', bgSecondary: '#ffffff', surface: '#f5f6f9', card: '#ffffff', border: '#dde1e7', accent: '#12a150', accentLight: '#1ec96b', text: '#14171c', textMuted: '#6b7280' },
  { id: 'gold-dark',  name: 'طلایی کلاسیک', bg: '#0e0e0e', bgSecondary: '#111111', surface: '#161616', card: '#1a1a1a', border: '#2a2a2a', accent: '#d4af37', accentLight: '#f0d060', text: '#ffffff', textMuted: '#888888' },
  { id: 'rose-gold',  name: 'رز گلد',       bg: '#120c0e', bgSecondary: '#1a1215', surface: '#1e1518', card: '#221820', border: '#3d2830', accent: '#e8a598', accentLight: '#f5c4ba', text: '#fff5f3', textMuted: '#a08088' },
  { id: 'midnight',   name: 'نیمه‌شب',      bg: '#0a0e14', bgSecondary: '#0f1419', surface: '#121820', card: '#151c24', border: '#243040', accent: '#5b9fd4', accentLight: '#8ec5f0', text: '#e8f0f8', textMuted: '#7a90a8' },
  { id: 'emerald',    name: 'زمرد',         bg: '#0a100e', bgSecondary: '#0f1612', surface: '#121a15', card: '#152019', border: '#243830', accent: '#4ade80', accentLight: '#86efac', text: '#ecfdf5', textMuted: '#6b9080' },
  { id: 'cream-light', name: 'کرم روشن',    bg: '#f5f0e8', bgSecondary: '#ebe4d8', surface: '#e8e0d4', card: '#ffffff', border: '#d4cbb8', accent: '#b8860b', accentLight: '#d4a017', text: '#1a1510', textMuted: '#6b5d4a' }
]

export const DEFAULT_PALETTE_ID = 'light'
const STORAGE_KEY = 'dg_trade_palette'

/** Palettes whose background is light — drives up/down colour contrast. */
function isLight(id) {
  return id === 'cream-light' || id === 'light'
}

export function getPalette(id) {
  return THEME_PALETTES.find(p => p.id === id) ?? THEME_PALETTES[0]
}

export function loadPaletteId() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && THEME_PALETTES.some(p => p.id === saved)) return saved
  } catch {
    /* private mode — fall through to the default */
  }
  return DEFAULT_PALETTE_ID
}

export function savePaletteId(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* storage unavailable — the choice simply won't persist */
  }
}

/**
 * Write the palette onto the document as CSS custom properties. Every component
 * then styles itself with `var(--accent)` etc., so switching themes needs no
 * re-render of Vue scopes.
 */
export function applyPalette(id) {
  const p = getPalette(id)
  const root = document.documentElement
  const light = isLight(p.id)

  root.style.setProperty('--bg', p.bg)
  root.style.setProperty('--bg-secondary', p.bgSecondary)
  root.style.setProperty('--surface', p.surface)
  root.style.setProperty('--card', p.card)
  root.style.setProperty('--border', p.border)
  root.style.setProperty('--accent', p.accent)
  root.style.setProperty('--accent-light', p.accentLight)
  root.style.setProperty('--text', p.text)
  root.style.setProperty('--text-muted', p.textMuted)

  // Semantic trading colours — readable on both light and dark palettes.
  root.style.setProperty('--up', light ? '#0f8a4c' : '#26a65b')
  root.style.setProperty('--down', light ? '#c62828' : '#ef4444')
  root.style.setProperty('--up-soft', light ? 'rgba(15,138,76,.12)' : 'rgba(38,166,91,.14)')
  root.style.setProperty('--down-soft', light ? 'rgba(198,40,40,.12)' : 'rgba(239,68,68,.14)')

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', p.bg)

  return p
}
