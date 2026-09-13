import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rasterImageCommand, buildDocumentBytes, RASTER_CHUNK_HEIGHT, ESC_INIT, CUT_PAPER } from '../src/escpos.mjs'

test('rasterImageCommand builds a correctly-shaped GS v 0 header', () => {
  const widthBytes = 48 // 384px / 8
  const heightPx = 10
  const data = Buffer.alloc(widthBytes * heightPx, 0xff)
  const cmd = rasterImageCommand(widthBytes, heightPx, data)

  assert.equal(cmd[0], 0x1d)
  assert.equal(cmd[1], 0x76)
  assert.equal(cmd[2], 0x30)
  assert.equal(cmd[3], 0x00)
  assert.equal(cmd[4], widthBytes & 0xff)
  assert.equal(cmd[5], (widthBytes >> 8) & 0xff)
  assert.equal(cmd[6], heightPx & 0xff)
  assert.equal(cmd[7], (heightPx >> 8) & 0xff)
  assert.equal(cmd.length, 8 + data.length)
})

test('buildDocumentBytes starts with ESC_INIT and ends with a cut command', () => {
  const widthBytes = 48
  const heightPx = 5
  const rows = Array.from({ length: heightPx }, () => Buffer.alloc(widthBytes, 0))
  const bytes = buildDocumentBytes({ widthBytes, heightPx, rows })

  assert.ok(bytes.subarray(0, ESC_INIT.length).equals(ESC_INIT))
  assert.ok(bytes.subarray(bytes.length - CUT_PAPER.length).equals(CUT_PAPER))
})

test('buildDocumentBytes chunks a tall image into multiple raster commands, never exceeding RASTER_CHUNK_HEIGHT per chunk', () => {
  const widthBytes = 48
  const heightPx = RASTER_CHUNK_HEIGHT * 2 + 10 // forces 3 chunks
  const rows = Array.from({ length: heightPx }, () => Buffer.alloc(widthBytes, 0))
  const bytes = buildDocumentBytes({ widthBytes, heightPx, rows })

  // Count GS v 0 headers (0x1d 0x76 0x30 0x00) in the output.
  let count = 0
  for (let i = 0; i < bytes.length - 3; i++) {
    if (bytes[i] === 0x1d && bytes[i + 1] === 0x76 && bytes[i + 2] === 0x30 && bytes[i + 3] === 0x00) count++
  }
  assert.equal(count, 3)
})
