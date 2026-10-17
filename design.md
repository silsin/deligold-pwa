
## 1. Overview

**دلی گلد** (Deligh Gold) is a Progressive Web App (PWA) for live gold and coin trading built with:
- **Frontend**: Vue 3 + Vite + Pinia
- **Backend**: NestJS (delly-api)
- **Deploy**: PWA with hash-based routing (works from static hosts)

**Route**: `/trade` → `TradingView.vue`

---

## 2. Architecture

```
┌─────────────────────────────────────────┐
│           Public/ (PWA assets)           │
├─────────────────────────────────────────┤
│           src/views/                     │
│   TradingView.vue ← Simplified trade UI  │
│   BoardView.vue   (price board)          │
│   TradeHistoryView.vue                   │
│   PortfolioView.vue                       │
│   ...                                    │
├─────────────────────────────────────────┤
│           src/components/                 │
│   PriceChart.vue ← Large chart component  │
│   MarketSheet.vue  ← Symbol selector      │
│   OrderBook.vue  ← REMOVED                │
│   ...                                    │
├─────────────────────────────────────────┤
│           src/stores/                     │
│   market.js  ← Prices, candles, stats     │
│   auth.js   ← Session, wallet, orders     │
│   portfolio.js (if exists)                │
├─────────────────────────────────────────┤
│           src/router/                     │
│   index.js  ← Vue Router config           │
├─────────────────────────────────────────┤
│           api/ (NestJS backend)           │
│   trading.service.ts  ← Place orders      │
│   wallet.service.ts                         │
│   ledger.service.ts                         │
└─────────────────────────────────────────┘

## 3. Simplified Trading Page (`TradingView.vue`)

### 3.1 Design Goals

**Before**: 8+ sections competing for attention (header stats, range chips, chart, order book, complex order form, positions, recent orders, market sheet)

**After**: 3 sections only — header, chart, order form

### 3.2 Layout Structure

```
┌─────────────────────────────┐
│  ← اقیانوس / نماد           │  // Header
│  قیمت {big} (Δ%)            │
│                             │
│  [Chart - min-height 280px] │  // Chart
│                             │
│  ──────── معامله ────────  │  // Order form
│  [خرید] [فروش]            │  // BUY/SELL toggle
│  ┌─────────────────────┐   │
│  │ مقدار را وارد کنید   │   │  // Amount input
│  └─────────────────────┘   │
│  ┌─────────────────────┐   │
│  │    خرید              │   │  // Big primary button
│  └─────────────────────┘   │
└─────────────────────────────┘
```

```

﻿# دلی گلد — Trade PWA Design Document


### 3.3 Component Tree

```
TradingView.vue
├── header.tv__header
│   ├── button.tv__back (go home)
│   ├── button.tv__pairbtn (open MarketSheet)
│   │   ├── span.tv__pair (symbol name)
│   │   ├── span.tv__div (/تومان)

### 3.4 State Management

| State | Type | Source | Description |
|-------|------|--------|-------------|
| `market` | ref | `useMarketStore` | Prices, symbol, stats, candles |
| `auth` | ref | `useAuthStore` | User session, wallet balance |
| `side` | ref | local | 'BUY' or 'SELL' |
| `amount` | ref | local | Input amount in grams |
| `submitting` | ref | local | Submit loading state |
| `orderError` | ref | local | Error message display |
| `orderSuccess` | ref | local | Success message display |
| `sheetOpen` | ref | local | MarketSheet visibility |

### 3.5 Key Functions

```javascript
// Symbol selection from MarketSheet
async function onSelect(sym) {
  sheetOpen.value = false
  await market.setSymbol(sym)
}

// Place order
async function submitOrder() {
  // 1. Check auth
  if (!auth.isLoggedIn) { orderError.value = 'برای معامله ابتدا وارد حساب شوید' }
  // 2. Submit to API
  const result = await auth.placeOrder({ symbol, side, grams })
  // 3. Handle response
  if (result.ok) {
    orderSuccess.value = `خرید ${order?.grams} گرم با قیمت ${faMoney(order?.price)} ثبت شد`

### 3.6 Market Store API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `fetchMarket()` | GET /market/board | Fetch prices and symbols |
| `fetchStats()` | (cached) | 24h stats |
| `setSymbol(sym)` | - | Change active symbol |
| `startPolling(interval)` | - | Auto-refresh every N ms |
| `stopPolling()` | - | Stop auto-refresh |

---

## 4. Key Components

### 4.1 PriceChart (`components/PriceChart.vue`)

- **Purpose**: Large interactive price chart
- **Canvas**: HTML5 Canvas with D3-free custom drawing
- **Features**:
  - Candle or line mode (toggleable)
  - Crosshair tooltip on hover
  - Auto-resize on window/dark theme change
  - Shows up/down gradient under the line
- **Props**: `candles`, `ticks`, `range`, `mode`
- **Events**: None (pure display)

### 4.2 MarketSheet (`components/MarketSheet.vue`)

- **Purpose**: Symbol selector bottom sheet
- **Features**:
  - Search/filter by symbol name/short code
  - Shows price, change % for each symbol
  - RTL layout ( Backend / frontend )
  - Scrollable list with keyboard navigation
- **Props**: `symbols`, `prices`, `stats`, `current`, `direction`
- **Events**: `select(sym)`, `close()`

### 4.3 OrderForm (inline in TradingView.vue)

- **Purpose**: Simple buy/sell order entry
- **UX**: 
  - Large tap targets for mobile
  - Number input with decimal support
  - Visual feedback on input

### 4.1 PriceChart (`components/PriceChart.vue`)

- **Purpose**: Large interactive price chart
- **Canvas**: HTML5 Canvas with D3-free custom drawing
- **Features**:
  - Candle or line mode (toggleable)
  - Crosshair tooltip on hover
  - Auto-resize on window/dark theme change
  - Shows up/down gradient under the line
- **Props**: `candles`, `ticks`, `range`, `mode`
- **Events**: None (pure display)

### 4.2 MarketSheet (`components/MarketSheet.vue`)

- **Purpose**: Symbol selector bottom sheet
- **Features**:
  - Search/filter by symbol name/short code
  - Shows price, change % for each symbol
  - RTL layout ( Backend / frontend )
  - Scrollable list with keyboard navigation
- **Props**: `symbols`, `prices`, `stats`, `current`, `direction`
- **Events**: `select(sym)`, `close()`

## 5. Styling System

### 5.1 CSS Variables (theme)

| Variable | Purpose | Example |
|----------|---------|---------|
| `--up` | Positive/price-up color | `#26a65b` |
| `--down` | Negative/price-down color | `#ef4444` |
| `--up-soft` | Price-up background | `rgba(38,166,91,.2)` |
| `--down-soft` | Price-down background | `rgba(239,68,68,.2)` |
| `--accent` | Primary action color | Theme-defined |
| `--card` | Card background | Theme-defined |
| `--surface` | Elevated surface | Theme-defined |
| `--border` | Border color | `#2a2a2a` |
| `--text` | Primary text | Theme-defined |
| `--text-muted` | Secondary text | Theme-defined |

### 5.2 Class Naming Convention

```
.tv → Main container (TradingView)
.tv__header → Header section
.tv__back → Back button
.tv__pairbtn → Symbol selector button
.tv__pair → Symbol name
.tv__price → Current price

## 6. API Integration

### 6.1 Market API

```
GET /market/board
Response:
{
  symbols: [{ symbol: "GOLD18", name: "طلاء" }],
  quotes: {
    "GOLD18": { price: 12345678, buy: 12300000, sell: 12400000 }
  },
  source: "NEST",
  sourceTitle: "نظریه کارتابل",
  updatedAt: 1735689600000,
  stale: false,
  note: ""
}
```

### 6.2 Trading API

```
POST /trade/orders
Request:
{
  symbol: "GOLD18",
  side: "BUY",  // or "SELL"
  grams: 10.5

## 7. Future Considerations

1. **Chart Improvements**: Add actual candle data when backend provides it
2. **History**: Integrate order history into the page (or link to /history)
3. **Positions**: Show open positions inline (if needed)
4. **Settings**: Add trade confirmation options

---

## 8. File Structure (After Redesign)

```
src/
├── views/
│   └── TradingView.vue          ← SIMPLIFIED (400+ lines → 431 lines)
├── components/
│   ├── PriceChart.vue            ← Chart component
│   ├── MarketSheet.vue           ← Symbol selector
│   ├── OrderBook.vue             ← REMOVED
│   └── wallet/
│       ├── ConvertSheet.vue
│       ├── DepositSheet.vue
│       ├── DepositPaySheet.vue
│       └── WithdrawSheet.vue

## 9. Build & Run

```bash
# Frontend
cd delly-pwa
npm install
npm run dev          # Local: http://localhost:9741
npm run build        # Production build
npm run preview      # Preview production build

# Backend (separate terminal)
cd api
npm install
npm run start:dev
```

---

*Document created: 2026-10-17*
*Last updated: 2026-10-17*
*Author: Cline (AI coding agent)*

├── stores/
│   ├── market.js                 ← Prices + candles + stats
│   └── auth.js                   ← Session + wallet + orders
├── utils/
│   ├── format.js                 ← faMoney, faWeight, etc.
│   └── api.js                    ← Axios instance
└── router/
    └── index.js                  ← Vue Router config
```

}
Response:
{
  ok: true,
  order: {
    id: "ORD123456",
    symbol: "GOLD18",
    side: "BUY",
    grams: 10.5,
    price: 12345000,
    fee: 61725,
    status: "FILLED"
  }
}
```

### 6.3 Error Handling

| Error Type | Display |
|------------|---------|
| Not authenticated | "برای معامله ابتدا وارد حساب شوید" |
| Insufficient balance | API error message |
| Invalid symbol/amount | API error message |
| Network error | "ثبت سفارش ناموفق بود" |

.tv__chg → Change indicator
.tv__chartwrap → Chart wrapper
.tv__of → Order form container
.tv__oftab → Tab bar (BUY/SELL)
.tv__oftabbtn → Tab button
.tv__ofamount → Amount input container
.tv__amount → Amount input
.tv__unit → Unit label
.tv__submit → Submit button
.tv__msg → Message
.tv__msg--ok → Success message
.tv__msg--err → Error message
```


### 4.3 OrderForm (inline in TradingView.vue)

- **Purpose**: Simple buy/sell order entry
- **UX**: 
  - Large tap targets for mobile
  - Number input with decimal support
  - Visual feedback on input
  - Success/error messages below button
  - Enter key submits

  - Success/error messages below button
  - Enter key submits

    amount.value = ''
    await auth.fetchAccount()
  } else {
    orderError.value = result.error
  }
  // 4. Clear loading
  submitting.value = false
}
```

│   │   └── span.tv__caret (▼)
│   └── div.tv__pricebox
│       ├── div.tv__price (current price)
│       └── div.tv__chg (Δ + %)
├── section.tv__chartwrap
│   └── PriceChart (chart component)
│       ├── canvas (chart rendering)
│       └── div.tv__empty (loading/empty state)
└── section.tv__of
    ├── div.tv__oftab (BUY/SELL tabs)
    │   ├── button.tv__oftabbtn (خرید)
    │   └── button.tv__oftabbtn (فروش)
    ├── div.tv__ofamount
    │   ├── input.tv__amount (amount input)
    │   └── span.tv__unit (گرم)
    ├── button.tv__submit (buy/sell action)
    └── p.tv__msg (success/error messages)
```
