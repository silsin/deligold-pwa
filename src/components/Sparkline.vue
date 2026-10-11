<template>
  <svg
    class="spark"
    :viewBox="`0 0 ${width} ${height}`"
    :width="width"
    :height="height"
    preserveAspectRatio="none"
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      <!-- Soft fill under the line so the trend reads at a glance. -->
      <linearGradient :id="gradId" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" :stop-color="stroke" stop-opacity="0.28" />
        <stop offset="100%" :stop-color="stroke" stop-opacity="0" />
      </linearGradient>
    </defs>

    <path v-if="areaPath" :d="areaPath" :fill="`url(#${gradId})`" />
    <path
      v-if="linePath"
      :d="linePath"
      :stroke="stroke"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      fill="none"
      vector-effect="non-scaling-stroke"
    />
    <!-- Last-point dot: "where the price is right now". -->
    <circle v-if="lastPoint" :cx="lastPoint.x" :cy="lastPoint.y" r="2.4" :fill="stroke" />
  </svg>
</template>

<script setup>
import { computed } from 'vue'

/**
 * Tiny trend line. Pure SVG so it costs nothing to render one per board row.
 * Values are normalised into the box, so only shape matters — not magnitude.
 */
const props = defineProps({
  values: { type: Array, default: () => [] },
  width: { type: Number, default: 72 },
  height: { type: Number, default: 26 },
  /** Force a direction; defaults to first-vs-last value. */
  up: { type: Boolean, default: null }
})

// Stable per-instance gradient id (two sparklines must not share one def).
const gradId = computed(() => `spark-${Math.random().toString(36).slice(2, 9)}`)

const stroke = computed(() => {
  if (props.up !== null) return props.up ? 'var(--up)' : 'var(--down)'
  const list = props.values
  if (list.length < 2) return 'var(--text-muted)'
  return list[list.length - 1] >= list[0] ? 'var(--up)' : 'var(--down)'
})

/** { points, linePath, areaPath, lastPoint } or empty strings when flat. */
const geometry = computed(() => {
  const list = props.values.filter(v => Number.isFinite(v))
  const pad = 3
  if (list.length < 2) return { linePath: '', areaPath: '', lastPoint: null }

  const min = Math.min(...list)
  const max = Math.max(...list)
  const span = max - min || 1

  const innerW = props.width - pad * 2
  const innerH = props.height - pad * 2
  const step = innerW / (list.length - 1)

  const points = list.map((v, i) => ({
    // RTL charts read right-to-left, so the oldest point sits on the right.
    x: props.width - pad - i * step,
    y: pad + innerH - ((v - min) / span) * innerH
  }))

  const linePath = points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
  const base = props.height
  const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(2)},${base} L${points[0].x.toFixed(2)},${base} Z`

  return { linePath, areaPath, lastPoint: points[0] }
})

const linePath = computed(() => geometry.value.linePath)
const areaPath = computed(() => geometry.value.areaPath)
const lastPoint = computed(() => geometry.value.lastPoint)
</script>

<style scoped>
.spark {
  display: block;
  overflow: visible;
}
</style>
