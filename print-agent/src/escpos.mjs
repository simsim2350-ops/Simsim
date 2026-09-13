// Minimal ESC/POS command builders — just the commands this agent actually
// uses. No external dependency: these are fixed byte sequences from the
// widely-implemented Epson ESC/POS spec that virtually every thermal
// printer (network or USB) understands.

export const ESC_INIT = Buffer.from([0x1b, 0x40]) // ESC @  — initialize printer
export const CUT_PAPER = Buffer.from([0x1d, 0x56, 0x00]) // GS V 0 — full cut (many printers also accept 0x1b 0x69)
export const FEED_LINES = (n) => Buffer.from([0x1b, 0x64, n]) // ESC d n — feed n lines

// GS v 0 — print raster bit image. This is the command this agent relies
// on for Arabic: rather than trusting the printer's own text mode/code
// pages with Arabic shaping and RTL (unreliable across printer models —
// see the execution report's Arabic/RTL strategy section), the ENTIRE
// document is rendered once as a real image (see renderToRaster.mjs) and
// sent as a single raster block, so what prints is pixel-identical to
// what Phase 1's own browser-rendered /print/[jobId] page already shows —
// no separate Arabic-handling code path to get wrong.
//
// widthBytes: image width in bytes (width in pixels / 8 — must already be
// a multiple of 8; renderToRaster.mjs pads to satisfy this).
// heightPx: image height in pixels.
// data: 1bpp packed raster bytes, MSB-first per the spec, row-major.
export function rasterImageCommand(widthBytes, heightPx, data) {
  const header = Buffer.from([
    0x1d, 0x76, 0x30, 0x00, // GS v 0 0  (mode 0 = normal)
    widthBytes & 0xff, (widthBytes >> 8) & 0xff,
    heightPx & 0xff, (heightPx >> 8) & 0xff,
  ])
  return Buffer.concat([header, data])
}

// A real printer's raster command has practical height limits per call on
// some models/firmware — chunking into fixed-height bands is the standard,
// safe way to print an arbitrarily tall image without relying on any one
// printer's specific buffer limit. 256 lines/chunk is a conservative,
// widely-compatible choice.
export const RASTER_CHUNK_HEIGHT = 256

export function buildDocumentBytes({ widthBytes, heightPx, rows }) {
  // rows: array of Buffer, one per pixel row, each already widthBytes long.
  const chunks = [ESC_INIT]
  for (let y = 0; y < heightPx; y += RASTER_CHUNK_HEIGHT) {
    const chunkHeight = Math.min(RASTER_CHUNK_HEIGHT, heightPx - y)
    const chunkRows = rows.slice(y, y + chunkHeight)
    chunks.push(rasterImageCommand(widthBytes, chunkHeight, Buffer.concat(chunkRows)))
  }
  chunks.push(FEED_LINES(3))
  chunks.push(CUT_PAPER)
  return Buffer.concat(chunks)
}
