// Generates a 256x256 rounded green square icon without image dependencies.
const { writeFileSync, mkdirSync } = require('node:fs')
const { deflateSync } = require('node:zlib')
const { join } = require('node:path')

const SIZE = 256
const RADIUS = 56

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function insideRounded(x, y) {
  const r = RADIUS
  if (x >= r && x < SIZE - r) return true
  if (y >= r && y < SIZE - r) return true
  const cx = x < r ? r : SIZE - r
  const cy = y < r ? r : SIZE - r
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

const raw = Buffer.alloc(SIZE * (1 + SIZE * 4))
for (let y = 0; y < SIZE; y++) {
  const row = y * (1 + SIZE * 4)
  raw[row] = 0
  for (let x = 0; x < SIZE; x++) {
    const offset = row + 1 + x * 4
    const inside = insideRounded(x, y)
    // accent green #2f6f52 with a lighter dot in the middle
    const dot = (x - SIZE / 2) ** 2 + (y - SIZE / 2) ** 2 < 34 ** 2
    raw[offset] = dot ? 0xf6 : 0x2f
    raw[offset + 1] = dot ? 0xf5 : 0x6f
    raw[offset + 2] = dot ? 0xf2 : 0x52
    raw[offset + 3] = inside ? 0xff : 0x00
  }
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8
ihdr[9] = 6

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

mkdirSync(join(__dirname, '..', 'assets'), { recursive: true })
writeFileSync(join(__dirname, '..', 'assets', 'icon.png'), png)
console.log(`icon written: ${png.length} bytes`)
