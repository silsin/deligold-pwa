<template>
  <div class="chart">
    <div class="chart__body">
      <canvas
        ref="canvas"
        class="chart__canvas"
        @pointermove="onPointerMove"
        @pointerleave="onPointerLeave"
      ></canvas>
      <div v-if="hover" class="chart__tooltip">
        <span class="chart__tooltip-time">{{ faAxisTime(hover.t, range) }}</span>
        <span class="chart__tooltip-val">{{ faMoney(hover.c) }}</span>
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
  mode: { type: String, default: 'candle' }
})

const canvas = ref(null)
const hover = ref(null)
const geometry = ref({ padL: 8, padR: 8, padT: 14, padB: 10, w: 0, h: 0 })
let ctx = null
let raf = null

/** Colours come from the theme's CSS variables, so the chart follows the palette. */
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
    grid: cssVar('--border', '#2a2a2a')
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

/** Series index → X pixel. */
function xFor(i, total) {
  const { padL, padR, w } = geometry.value
  const usable = w - padL - padR
  if (total <= 1) return padL + usable / 2
  return padL + (i / (total - 1)) * usable
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

    // Wick
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(x, yFor(candle.h))
    ctx.lineTo(x, yFor(candle.l))
    ctx.stroke()

    // Body
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

  // Gradient area under the curve.
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

  // The line itself.
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

  // Last price marker.
  const x = xFor(list.length - 1, list.length)
  const y = yFor(last)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, 4, 0, Math.PI * 2)
  ctx.fill()
}

function draw() {
  if (!ctx) return
  const p = palette()
  drawGrid(p)
  if (props.mode === 'line') drawLine(p)
  else drawCandles(p)
}

/** Crosshair read-out: nearest point under the pointer. */
function onPointerMove(event) {
  const list = series.value
  if (!list.length) return
  const rect = canvas.value.getBoundingClientRect()
  const x = event.clientX - rect.left
  const { padL, padR, w } = geometry.value
  const ratio = (x - padL) / (w - padL - padR || 1)
  const index = Math.round(ratio * (list.length - 1))
  const item = list[Math.max(0, Math.min(list.length - 1, index))]
  if (item) hover.value = { t: item.t, c: item.c }
}

function onPointerLeave() {
  hover.value = null
}

watch(
  () => [props.candles, props.ticks, props.mode, props.range],
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

