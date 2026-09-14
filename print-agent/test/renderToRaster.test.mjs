import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { PNG } from 'pngjs'
import { pngToRaster, renderUrlToRaster } from '../src/renderToRaster.mjs'

// Tests pngToRaster in isolation, with a hand-built PNG — no browser
// involved. The renderUrlToRaster() test below (real headless Chromium,
// but a local static server — no network/Supabase/live print job
// dependency) covers the part that actually launches a browser; see the
// execution report for what could and could not be verified against a
// real /print/[jobId] page in this sandbox.
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

// Regression test for a real Phase 3 hardware-review finding: a rendered
// print_jobs document's own PrintNav ("Back"/"Home") and PrintActions
// (طباعة/تمت الطباعة/فشلت الطباعة buttons + status badge) apply a
// `noPrint` class that print.module.css only hides under `@media print`.
// renderUrlToRaster() screenshots the page for the REAL agent pipeline —
// without emulating "print" media first, that CSS rule never applies, so
// a real thermal receipt would print that browser-only UI chrome too.
// Verified live against a real production /print/[jobId] page before this
// fix (see the execution report for the before/after raster images); this
// test reproduces the same class of bug hermetically, with a local static
// page instead of a live print job, so it needs no network/Supabase
// access and never depends on a specific print_jobs row still existing.
test('renderUrlToRaster emulates print media, so a noPrint-classed element is not rastered', async (t) => {
  let chromium
  try {
    ;({ chromium } = await import('playwright'))
  } catch {
    t.skip('playwright not installed (optionalDependency) — skipping the one test that needs a real headless browser')
    return
  }

  const html = `<!doctype html><html><body style="margin:0">
    <div class="noPrint" style="width:40px;height:40px;background:#000"></div>
    <style>@media print { .noPrint { display:none !important } }</style>
  </body></html>`
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(html)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()

  try {
    const raster = await renderUrlToRaster(`http://127.0.0.1:${port}/`, '58mm')
    const anyBlackPixel = raster.rows.some((row) => row.some((byte) => byte !== 0))
    assert.equal(anyBlackPixel, false, 'the noPrint-classed block must not appear in the rasterized output')
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }

  // Sanity check the test harness itself: WITHOUT emulating print media,
  // the same element on the same page must actually render (proves the
  // assertion above is testing the real fix, not a vacuously-empty page).
  const chromiumBrowser = await chromium.launch()
  const page = await chromiumBrowser.newPage({ viewport: { width: 384, height: 100 } })
  const server2 = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(html)
  })
  await new Promise((resolve) => server2.listen(0, '127.0.0.1', resolve))
  const { port: port2 } = server2.address()
  try {
    await page.goto(`http://127.0.0.1:${port2}/`, { waitUntil: 'networkidle' })
    const pngBuffer = await page.screenshot({ fullPage: true })
    const raster = pngToRaster(pngBuffer, 384)
    const anyBlackPixel = raster.rows.some((row) => row.some((byte) => byte !== 0))
    assert.equal(anyBlackPixel, true, 'without print-media emulation the block should still be visible — otherwise this test proves nothing')
  } finally {
    await page.close()
    await chromiumBrowser.close()
    await new Promise((resolve) => server2.close(resolve))
  }
})
