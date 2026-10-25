<template>
  <div class="chart">
    <div class="chart__body">
      <canvas
        ref="canvas"
        class="chart__canvas"
        :class="{ 'is-drawing': drawMode !== 'none' }"
        @pointermove="onPointerMove"
        @pointerdown="onPointerDown"
        @pointerleave="onPointerLeave"
      ></canvas>
      <div v-if="hover && drawMode === 'none'" class="chart__tooltip">
        <span class="chart__tooltip-time">{{ faAxisTime(hover.t, range) }}</span>
        <span class="chart__tooltip-val">{{ faMoney(hover.c) }}</span>
      </div>
      <div v-if="drawMode !== 'none'" class="chart__draw-hint">
        {{ drawHint }}
      </div>
    </div>
    <div class="chart__yaxis">
      <span v-for="(label, i) in yTicks" :key="'y' + i">{{ faCompact(label) }}</span>
    </div>
    <div class="chart__xaxis">
      <span v-for="(label, i) in xTicks" :key="'x' + i">{{ label }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { faCompact, faMoney, faAxisTime } from '../utils/format'

const props = defineProps({
  candles: { type: Array, default: () => [] },
  ticks: { type: Array, default: () => [] },
  range: { type: String, default: '24h' },
  /** 'candle' | 'line' */
  mode: { type: String, default: 'candle' },
  /** Drawing mode: 'none' | 'trendline' | 'hline' | 'projection' */
  drawMode: { type: String, default: 'none' },
  /** Persisted drawings: [{ id, kind, points: [{x,y}], color, label }] */
  annotations: { type: Array, default: () => [] },
})

const emit = defineEmits(['annotate'])

const canvas = ref(null)
const hover = ref(null)
/** In-progress trendline: first clicked point, or null when none. */
const firstPoint = ref(null)
/** Live preview of the shape being drawn (rendered until committed). */
const draft = ref(null)
const geometry = ref({ padL: 8, padR: 8, padT: 14, padB: 10, w: 0, h: 0 })
let ctx = null
let raf = null

function cssVar(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function palette() {
  return {
    up: cssVar('--up', '#26a65b'),
    down: cssVar('--down', '#ef4444'),
    upSoft: cssVar('--up-soft', 'rgba(38,166,91,.2)'),
    downSoft: cssVar('--down-soft', 'rgba(239,68,68,.2)'),
    grid: cssVar('--border', '#2a2a2a'),
    accent: cssVar('--accent', '#d4af37'),
  }
}

/** Unified series shape so both modes share the same maths. */
const series = computed(() =>
  props.candles.length
    ? props.candles
    : props.ticks.map(t => ({ t: t.at, o: t.price, h: t.price, l: t.price, c: t.price }))
)

const bounds = computed(() => {
  const list = series.value
  if (!list.length) return { min: 0, max: 0 }
  const min = Math.min(...list.map(c => c.l))
  const max = Math.max(...list.map(c => c.h))
  return { min, max }
})

const drawHint = computed(() => {
  if (props.drawMode === 'trendline')
    return firstPoint.value ? 'نقطه دوم را بزنید' : 'نقطه اول خط را بزنید'
  if (props.drawMode === 'hline') return 'برای رسم خط افقی بزنید'
  if (props.drawMode === 'projection') return 'برای حدس قیمت بزنید'
  return ''
})

const yTicks = computed(() => {
  const { min, max } = bounds.value
  if (!max) return []
  return Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4)
})

const xTicks = computed(() => {
  const list = series.value
  if (!list.length) return []
  const count = 4
  const step = Math.max(1, Math.floor(list.length / count))
  const out = []
  for (let i = 0; i < list.length; i += step) out.push(faAxisTime(list[i].t, props.range))
  return out
})

function resize() {
  const c = canvas.value
  if (!c) return
  const dpr = window.devicePixelRatio || 1
  const rect = c.parentElement.getBoundingClientRect()
  const w = Math.max(160, rect.width)
  const h = Math.max(160, rect.height || 260)
  c.width = Math.round(w * dpr)
  c.height = Math.round(h * dpr)
  c.style.width = `${w}px`
  c.style.height = `${h}px`
  geometry.value = { padL: 10, padR: 10, padT: 14, padB: 10, w, h }
  ctx = c.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  draw()
}

/** Price → Y pixel (higher price sits closer to the top). */
function yFor(price) {
  const { min, max } = bounds.value
  const { padT, padB, h } = geometry.value
  if (max === min) return h / 2
  const usable = h - padT - padB
  return padT + ((max - price) / (max - min)) * usable
}

/** Y pixel → price (inverse of yFor, for drawing). */
function priceForY(y) {
  const { min, max } = bounds.value
  const { padT, padB, h } = geometry.value
  if (max === min) return (min + max) / 2
  const usable = h - padT - padB
  return max - ((y - padT) / usable) * (max - min)
}

/** Series index → X pixel. */
function xFor(i, total) {
  const { padL, padR, w } = geometry.value
  const usable = w - padL - padR
  if (total <= 1) return padL + usable / 2
  return padL + (i / (total - 1)) * usable
}

/** Time (epoch ms) → X pixel, interpolated over the series time range. */
function xForTime(t) {
  const list = series.value
  const { padL, padR, w } = geometry.value
  const usable = w - padL - padR
  if (list.length < 2) return padL + usable / 2
  const tMin = list[0].t
  const tMax = list[list.length - 1].t
  if (tMax === tMin) return padL + usable / 2
  const ratio = (t - tMin) / (tMax - tMin)
  return padL + ratio * usable
}

/** X pixel → time (epoch ms). */
function timeForX(x) {
  const list = series.value
  const { padL, padR, w } = geometry.value
  const usable = w - padL - padR
  if (list.length < 2) return list[0]?.t ?? Date.now()
  const tMin = list[0].t
  const tMax = list[list.length - 1].t
  const ratio = (x - padL) / (usable || 1)
  return Math.round(tMin + ratio * (tMax - tMin))
}

function drawGrid(p) {
  const { padL, padR, w, padT, h, padB } = geometry.value
  ctx.clearRect(0, 0, w, h)
  ctx.strokeStyle = p.grid
  ctx.lineWidth = 1
  ctx.globalAlpha = 0.55
  for (let i = 0; i <= 4; i++) {
    const y = padT + ((h - padT - padB) * i) / 4
    ctx.beginPath()
    ctx.moveTo(padL, Math.round(y) + 0.5)
    ctx.lineTo(w - padR, Math.round(y) + 0.5)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

function drawCandles(p) {
  const list = series.value
  const { w, padL, padR } = geometry.value
  const slot = list.length > 1 ? (w - padL - padR) / (list.length - 1) : 0
  const bodyW = Math.max(2, Math.min(16, slot * 0.6))

  list.forEach((candle, i) => {
    const x = xFor(i, list.length)
    const rising = candle.c >= candle.o
    const color = rising ? p.up : p.down

    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(x, yFor(candle.h))
    ctx.lineTo(x, yFor(candle.l))
    ctx.stroke()

    const yOpen = yFor(candle.o)
    const yClose = yFor(candle.c)
    const top = Math.min(yOpen, yClose)
    const height = Math.max(1.5, Math.abs(yClose - yOpen))
    ctx.fillStyle = color
    ctx.globalAlpha = 0.92
    ctx.fillRect(x - bodyW / 2, top, bodyW, height)
    ctx.globalAlpha = 1
  })
}

function drawLine(p) {
  const list = series.value
  if (!list.length) return
  const first = list[0].c
  const last = list[list.length - 1].c
  const rising = last >= first
  const color = rising ? p.up : p.down
  const { h, padB } = geometry.value

  ctx.beginPath()
  list.forEach((point, i) => {
    const x = xFor(i, list.length)
    const y = yFor(point.c)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.lineTo(xFor(list.length - 1, list.length), h - padB)
  ctx.lineTo(xFor(0, list.length), h - padB)
  ctx.closePath()
  ctx.fillStyle = rising ? p.upSoft : p.downSoft
  ctx.fill()

  ctx.beginPath()
  list.forEach((point, i) => {
    const x = xFor(i, list.length)
    const y = yFor(point.c)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.lineJoin = 'round'
  ctx.stroke()

  const x = xFor(list.length - 1, list.length)
  const y = yFor(last)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, 4, 0, Math.PI * 2)
  ctx.fill()
}

/** A horizontal price level (solid) or a price-guess projection (dashed). */
function drawHLine(ann, p) {
  if (!ann.points?.length) return
  const { padL, padR, w } = geometry.value
  const y = yFor(ann.points[0].y)
  const isGuess = ann.kind === 'projection'
  ctx.strokeStyle = ann.color || (isGuess ? '#f0a020' : p.accent)
  ctx.lineWidth = 1.6
  ctx.setLineDash(isGuess ? [6, 4] : [])
  ctx.beginPath()
  ctx.moveTo(padL, y)
  ctx.lineTo(w - padR, y)
  ctx.stroke()
  ctx.setLineDash([])

  const label = ann.label || `${isGuess ? 'حدس' : 'سطح'}: ${faMoney(ann.points[0].y)}`
  ctx.font = '11px Vazirmatn, sans-serif'
  ctx.fillStyle = ann.color || (isGuess ? '#f0a020' : p.accent)
  ctx.textAlign = 'right'
  ctx.fillText(label, w - padR - 4, y - 5)
  ctx.textAlign = 'left'
}

/** A trend line between two price/time points. */
function drawTrendLine(ann, p) {
  if (!ann.points || ann.points.length < 2) return
  const x1 = xForTime(ann.points[0].x)
  const y1 = yFor(ann.points[0].y)
  const x2 = xForTime(ann.points[1].x)
  const y2 = yFor(ann.points[1].y)
  ctx.strokeStyle = ann.color || p.accent
  ctx.lineWidth = 1.8
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}

function drawAnnotations(p) {
  for (const ann of props.annotations) {
    if (ann.kind === 'trendline') drawTrendLine(ann, p)
    else drawHLine(ann, p)
  }
  if (draft.value) {
    const tmp = { kind: props.drawMode, points: draft.value }
    if (props.drawMode === 'trendline') drawTrendLine(tmp, p)
    else drawHLine(tmp, p)
  }
}

function draw() {
  if (!ctx) return
  const p = palette()
  drawGrid(p)
  if (props.mode === 'line') drawLine(p)
  else drawCandles(p)
  drawAnnotations(p)
}

function pointerToPriceTime(event) {
  const rect = canvas.value.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  return { px: x, py: y, t: timeForX(x), price: priceForY(y) }
}

function onPointerDown(event) {
  if (props.drawMode === 'none') return
  const { px, py, t, price } = pointerToPriceTime(event)
  const point = { x: t, y: Math.round(price) }

  if (props.drawMode === 'trendline') {
    if (!firstPoint.value) {
      firstPoint.value = point
      draft.value = [point, point]
    } else {
      draft.value = [firstPoint.value, point]
      emit('annotate', { kind: 'trendline', points: [firstPoint.value, point] })
      firstPoint.value = null
      draft.value = null
    }
    return
  }

  // hline / projection — single click places the level.
  const kind = props.drawMode === 'projection' ? 'projection' : 'hline'
  emit('annotate', { kind, points: [point] })
}

function onPointerMove(event) {
  if (props.drawMode !== 'none') {
    if (props.drawMode === 'trendline' && firstPoint.value) {
      const { t, price } = pointerToPriceTime(event)
      draft.value = [firstPoint.value, { x: t, y: Math.round(price) }]
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(draw)
    }
    return
  }
  // Crosshair read-out (no drawing).
  const list = series.value
  if (!list.length) return
  const { px } = pointerToPriceTime(event)
  const { padL, padR, w } = geometry.value
  const ratio = (px - padL) / (w - padL - padR || 1)
  const index = Math.round(ratio * (list.length - 1))
  const item = list[Math.max(0, Math.min(list.length - 1, index))]
  if (item) hover.value = { t: item.t, c: item.c }
}

function onPointerLeave() {
  hover.value = null
}

watch(
  () => [props.candles, props.ticks, props.mode, props.range, props.annotations, props.drawMode, draft.value],
  () => {
    if (raf) cancelAnimationFrame(raf)
    raf = requestAnimationFrame(draw)
  }
)

onMounted(async () => {
  await nextTick()
  resize()
  window.addEventListener('resize', resize)
  window.addEventListener('dg-theme', resize)
})

onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
  window.removeEventListener('resize', resize)
  window.removeEventListener('dg-theme', resize)
})
</script>

<style scoped>
.chart {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

.chart__body {
  position: relative;
  flex: 1;
  min-height: 240px;
}

.chart__canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
}

.chart__canvas.is-drawing {
  cursor: crosshair;
}

.chart__tooltip {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 7px 11px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface);
  pointer-events: none;
}

.chart__tooltip-time {
  font-size: 10.5px;
  color: var(--text-muted);
}

.chart__tooltip-val {
  font-size: 13px;
  font-weight: 800;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}

.chart__draw-hint {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 5px 10px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  border: 1px solid var(--accent);
  color: var(--accent);
  font-size: 11px;
  font-weight: 800;
  pointer-events: none;
}

.chart__yaxis {
  display: none;
}

.chart__xaxis {
  display: flex;
  justify-content: space-between;
  padding: 6px 12px 2px;
  font-size: 10px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
</style>
