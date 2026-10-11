/**
 * One-off generator for the PWA icons.
 *
 * Produces solid dark-gold tiles with a centred gold glyph, using only Node's
 * built-in zlib — no image library needed. Run with `node make-icons.js`; the
 * output is deterministic, so re-running is safe.
 *
 * Replace these with a real brand asset whenever one is available; the manifest
 * references icon-192, icon-512 and a maskable 512 (safe-area padding applied).
 */
const { deflateSync } = await import('node:zlib')
const fs = await import('node:fs')
const path = await import('node:path')
const __dirname = new URL('.', import.meta.url).pathname.slice(1)

const OUT = path.join(__dirname, 'public', 'icons')

const BG = [14, 14, 14, 255]        // #0e0e0e — deli-gold dark
const GOLD = [212, 175, 55, 255]    // #d4af37 — deli-gold accent

/** CRC32 — required by every PNG chunk. */
function crc32(buf) {
  let c, crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/**
 * @param {(x:number,y:number)=>[number,number,number,number]} shade
 *   Returns the RGBA colour for a pixel, so callers can draw shapes.
 */
function writePng(file, size, shade) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  let p = 0
  for (let y = 0; y < size; y++) {
    raw[p++] = 0 // filter type: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = shade(x, y, size)
      raw[p++] = r
      raw[p++] = g
      raw[p++] = b
      raw[p++] = a
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8  // bit depth
  ihdr[9] = 6  // colour type: truecolour + alpha
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
  fs.writeFileSync(file, png)
  console.log(`wrote ${path.relative(__dirname, file)} (${png.length} bytes)`)
}

/**
 * Inside-pixel test for a stylised «د»-like diamond/bar mark: a thick vertical
 * bar with a rounded diamond at its base. Simple, readable at 192px, and it
 * survives the aggressive downscaling an OS applies to app icons.
 */
function glyph(x, y, size) {
  const u = size / 100 // work in a 0-100 coordinate space
  const px = x / u
  const py = y / u

  const inBar = px >= 44 && px <= 56 && py >= 22 && py <= 52
  // Diamond centred at (50, 70) with a 15 unit half-diagonal.
  const dx = Math.abs(px - 50)
  const dy = Math.abs(py - 70)
  const inDiamond = dx / 15 + dy / 12 <= 1

  return inBar || inDiamond ? GOLD : BG
}

/** Maskable icons get their glyph shrunk into the 80% safe area. */
function maskable(x, y, size) {
  const inset = size * 0.1
  return glyph(x - inset, y - inset, size * 0.8)
}

fs.mkdirSync(OUT, { recursive: true })
writePng(path.join(OUT, 'icon-192x192.png'), 192, glyph)
writePng(path.join(OUT, 'icon-512x512.png'), 512, glyph)
writePng(path.join(OUT, 'icon-maskable-512x512.png'), 512, maskable)
// Favicon used by index.html / the installed shortcut.
writePng(path.join(__dirname, 'public', 'favicon.png'), 64, glyph)
console.log('icons done')
