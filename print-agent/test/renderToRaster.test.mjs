import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PNG } from 'pngjs'
import { pngToRaster } from '../src/renderToRaster.mjs'

// Tests pngToRaster in isolation, with a hand-built PNG — no browser
// involved. renderUrlToRaster() (the part that actually launches a
// headless browser to screenshot a real /print/[jobId] page) is NOT
// exercised here; see the execution report for why that path could not be
// verified live in this sandbox.
function makePng(width, height, isBlack) {
  const png = new PNG({ width, height })
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2
      const black = isBlack(x, y)
      png.data[idx] = black ? 0 : 255
      png.data[idx + 1] = black ? 0 : 255
      png.data[idx + 2] = black ? 0 : 255
      png.data[idx + 3] = 255
    }
  }
  return PNG.sync.write(png)
}

test('an all-white image rasters to all-zero bits', () => {
  const buf = makePng(16, 2, () => false)
  const raster = pngToRaster(buf, 16)
  assert.equal(raster.widthBytes, 2)
  assert.equal(raster.heightPx, 2)
  for (const row of raster.rows) {
    assert.ok(row.every((byte) => byte === 0))
  }
})

test('an all-black image rasters to all-one bits', () => {
  const buf = makePng(16, 2, () => true)
  const raster = pngToRaster(buf, 16)
  for (const row of raster.rows) {
    assert.ok(row.every((byte) => byte === 0xff))
  }
})

test('a single black pixel sets exactly the right bit, MSB-first', () => {
  // Pixel x=0 of a 16px-wide row is bit 7 (MSB) of byte 0.
  const buf = makePng(16, 1, (x, y) => x === 0 && y === 0)
  const raster = pngToRaster(buf, 16)
  assert.equal(raster.rows[0][0], 0b10000000)
  assert.equal(raster.rows[0][1], 0)
})
