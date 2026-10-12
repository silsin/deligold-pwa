// Exercises the REAL akbari.ts against the exact rows from the upstream feed.
// Run: node mkt.test.cjs   (compiles akbari.ts itself, so it works from a clean clone)
const { build } = require('esbuild')
const assert = require('assert')
const fs = require('fs')
const path = require('path')

const GEN = path.join(__dirname, 'mkt.gen.cjs')

;(async () => {
  try {
    await build({
      entryPoints: [path.join(__dirname, 'src/market/akbari.ts')],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      outfile: GEN,
      external: ['undici'],
      logLevel: 'error',
    })

    const { SYMBOL_TO_UPSTREAM_ID, akbariTwoSided, akbariConfig, akbariConfigured } = require(GEN)


// Verbatim rows from https://akbarigold.ir/server/api/prices/list.php
const ROWS = [
  { id: 1, name: 'نقد شنبه', type: 1, ayar: 0, price: 1133600000, priceBuy: 0, priceSell: 0, profit: 600000, min: 0, max: 2000, dailyAmount: 20000, isActive: 1, allowBuy: 1, allowSell: 1, lastUpdateTime: '2026-10-07 12:25:44' },
  { id: 8, name: 'تمام قدیم', type: 2, ayar: 0, price: 2565000000, priceBuy: 0, priceSell: 0, profit: 50000, min: 1, max: 50, dailyAmount: 100, isActive: 0, allowBuy: 0, allowSell: 0, lastUpdateTime: '2026-10-07 12:24:25' },
  { id: 7, name: 'نقد یکشنبه', type: 1, ayar: 0, price: 1133400000, priceBuy: 0, priceSell: 0, profit: 550000, min: 1, max: 2000, dailyAmount: 5000, isActive: 1, allowBuy: 1, allowSell: 1, lastUpdateTime: '2026-10-07 12:25:44' },
  { id: 501, name: 'طلا مفرقه سالم', type: 1, ayar: 750, price: 1129600000, priceBuy: 4100000, priceSell: -4100000, priceDiff: 50000, profit: -1000000, min: 0, max: 2000, dailyAmount: 20000, isActive: 1, allowBuy: 1, allowSell: 0, lastUpdateTime: '2026-10-07 12:25:44' },
  { id: 6, name: 'ربع ۴۰۳', type: 2, ayar: 0, price: 746000000, priceBuy: 0, priceSell: 0, profit: 50000, min: 1, max: 10, dailyAmount: 100, isActive: 0, allowBuy: 0, allowSell: 0, lastUpdateTime: '2026-10-07 12:25:49' },
  { id: 5, name: 'ربع سکه', type: 2, ayar: 0, price: 753000000, priceBuy: 0, priceSell: 0, profit: 50000, min: 1, max: 10, dailyAmount: 100, isActive: 0, allowBuy: 0, allowSell: 0, lastUpdateTime: '2026-10-07 12:25:49' },
  { id: 4, name: 'نیم سکه', type: 2, ayar: 0, price: 1404000000, priceBuy: 0, priceSell: 0, profit: 50000, min: 1, max: 10, dailyAmount: 100, isActive: 1, allowBuy: 1, allowSell: 1, lastUpdateTime: '2026-10-07 12:25:49' },
]

const byId = new Map(ROWS.map(r => [r.id, r]))

console.log('symbol -> upstream id mapping:')
console.log('  ' + JSON.stringify(SYMBOL_TO_UPSTREAM_ID))

// Duplicate upstream ids must resolve to the FIRST one, deterministically.
assert.strictEqual(SYMBOL_TO_UPSTREAM_ID.COIN_QUARTER, 6, 'COIN_QUARTER should map to id 6 (first wins over id 5)')
console.log('\n[ok] duplicate id 5 and id 6 -> COIN_QUARTER resolves to 6 (first match wins)')

// Explicit offsets win over profit.
const g18 = akbariTwoSided(byId.get(501))
assert.ok(g18, 'GOLD18 row must produce a quote')
assert.strictEqual(g18.price, 1129600000)
assert.strictEqual(g18.buy, 1129600000 + 4100000, 'allowBuy=1 -> price + priceBuy')
assert.strictEqual(g18.sell, null, 'allowSell=0 -> no sell quote at all')
console.log('[ok] GOLD18 (id 501, ayar 750): buy uses the explicit priceBuy offset; sell is null because allowSell=0')
console.log('     price=' + g18.price + ' buy=' + g18.buy + ' sell=' + g18.sell)

// Symmetric profit margin when both offsets are 0.
const g24 = akbariTwoSided(byId.get(1))
assert.strictEqual(g24.price, 1133600000)
assert.strictEqual(g24.buy, 1133600000 + 600000, 'customer PAYS mid + profit')
assert.strictEqual(g24.sell, 1133600000 - 600000, 'customer RECEIVES mid - profit')
assert.ok(g24.buy > g24.sell, 'the shop must always buy low and sell high')
console.log('[ok] GOLD24 (id 1): profit 600000 -> buy=' + g24.buy + ' sell=' + g24.sell + ' (spread preserved)')

// Inactive rows are dropped entirely, never quoted.
for (const id of [8, 6, 5]) {
  assert.strictEqual(akbariTwoSided(byId.get(id)), null, 'inactive id ' + id + ' must yield null')
}
console.log('[ok] inactive rows (تمام قدیم id 8, ربع ۴۰۳ id 6, ربع سکه id 5) -> null, not quoted')

// Active coins still quote.
const half = akbariTwoSided(byId.get(4))
assert.strictEqual(half.price, 1404000000)
assert.strictEqual(half.buy, 1404000000 + 50000, 'customer PAYS mid + profit')
assert.strictEqual(half.sell, 1404000000 - 50000, 'customer RECEIVES mid - profit')
assert.ok(half.buy > half.sell, 'spread preserved')
console.log('[ok] COIN_HALF (id 4, نیم سکه): price=' + half.price + ' buy=' + half.buy + ' sell=' + half.sell)

// Config gate.
assert.strictEqual(akbariConfigured(akbariConfig({ MARKET_UID: '', MARKET_TOKEN: '' })), false)
assert.strictEqual(akbariConfigured(akbariConfig({ MARKET_UID: '34', MARKET_TOKEN: 'x' })), true)
assert.strictEqual(akbariConfig({}).url, 'https://akbarigold.ir/server/api/prices/list.php')
console.log('[ok] credentials gate: blank -> disabled, present -> enabled; URL defaults to the akbarigold endpoint')

console.log('\nALL ASSERTIONS PASSED')
  } finally {
    fs.rmSync(GEN, { force: true })
  }
})().catch(e => {
  console.error(e)
  process.exit(1)
})

