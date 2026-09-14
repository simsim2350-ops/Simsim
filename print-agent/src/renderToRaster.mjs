import { PNG } from 'pngjs'

// Standard raster widths for the two paper sizes this whole architecture
// supports (Phase 1's own printer_config.paperWidth values) — 8 dots/mm at
// ~203dpi is the widely-documented thermal-printer convention: 58mm -> 384
// dots, 80mm -> 576 dots. Both are already multiples of 8, so no padding
// is needed before packing into ESC/POS raster bytes.
export const RASTER_WIDTH_PX = { '58mm': 384, '80mm': 576 }

// Arabic/RTL strategy (see the execution report for the full rationale):
// rather than trusting a printer's own text mode + code pages to shape and
// lay out Arabic correctly (unreliable across printer models/firmware —
// this is explicitly why the task calls this out as a special concern),
// this renders the ENTIRE document as a screenshot of the SAME
// server-rendered HTML page Phase 1 already built and verified
// (menu-next's /print/[jobId] route — real browser text layout, real
// fonts, already proven correct for Arabic/RTL in Phase 1's own HTTP
// checks) and prints that as one continuous raster image. Whatever is
// visually correct in a browser is, by construction, what prints —
// there is no separate Arabic-handling code path to get wrong here.
//
// `playwright` is an optionalDependency (see package.json) precisely so
// the rest of this agent (config, printer adapters, ESC/POS encoding,
// claim logic) can be installed/tested without ever downloading a
// browser — this function is the only place that needs it, and only at
// the moment it's actually called.
export async function renderUrlToRaster(url, paperWidth) {
  const width = RASTER_WIDTH_PX[paperWidth] || RASTER_WIDTH_PX['80mm']
  let chromium
  try {
    ;({ chromium } = await import('playwright'))
  } catch (err) {
    throw new Error(`playwright is not installed — run "npm install" in print-agent/ with network access to download it (renderUrlToRaster requires it): ${err.message}`)
  }

  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width, height: 100 } })
    // Without this, page.screenshot() below uses the default "screen"
    // media type, so the /print/[jobId] page's own @media print rules
    // (which hide PrintNav's "Back"/"Home" and PrintActions' buttons/
    // status badge via the .noPrint class) never apply — a real thermal
    // receipt would then print that browser-only UI chrome too. Emulating
    // "print" here makes this agent rasterize exactly what a real print
    // dialog would send, matching what window.print()'s own output shows.
    await page.emulateMedia({ media: 'print' })
    await page.goto(url, { waitUntil: 'networkidle' })
    const pngBuffer = await page.screenshot({ fullPage: true })
    return pngToRaster(pngBuffer, width)
  } finally {
    await browser.close()
  }
}

// Exported separately from renderUrlToRaster so it can be unit-tested with
// a plain, hand-built PNG buffer — no browser needed for this part.
export function pngToRaster(pngBuffer, expectedWidthPx) {
  const png = PNG.sync.read(pngBuffer)
  const width = expectedWidthPx || png.width
  const height = png.height
  const widthBytes = width / 8
  const rows = []

  for (let y = 0; y < height; y++) {
    const rowBytes = Buffer.alloc(widthBytes, 0)
    for (let x = 0; x < width; x++) {
      const srcX = Math.min(x, png.width - 1)
      const idx = (png.width * y + srcX) << 2
      const r = png.data[idx], g = png.data[idx + 1], b = png.data[idx + 2]
      const luminance = (r * 299 + g * 587 + b * 114) / 1000
      const isBlack = luminance < 200 // slightly permissive threshold — favors readable text over speckle noise
      if (isBlack) {
        const byteIndex = x >> 3
        const bitIndex = 7 - (x & 7) // MSB-first, per the ESC/POS raster spec
        rowBytes[byteIndex] |= (1 << bitIndex)
      }
    }
    rows.push(rowBytes)
  }

  return { widthBytes, heightPx: height, rows }
}
