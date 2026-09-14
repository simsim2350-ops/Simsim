import 'dotenv/config'
import { NetworkThermalPrinterAdapter } from '../src/printerAdapter.mjs'
import { ESC_INIT, FEED_LINES, CUT_PAPER } from '../src/escpos.mjs'

// Phase 3 hardware-test tooling — a fast, standalone connectivity/output
// smoke test that does NOT touch Supabase, print_jobs, or the claim/render
// pipeline at all. Run this FIRST against a real printer, before running
// the full agent (`npm start`), to confirm the basic
// TCP:9100 -> ESC/POS -> physical paper path works at all. It reuses the
// SAME adapter and ESC/POS primitives the real agent uses (never a
// separate/fake implementation) — this is a real ESC/POS print, not a
// simulation, IF PRINTER_HOST points at a real printer.
//
// Usage: PRINTER_HOST=192.168.1.50 PRINTER_PORT=9100 node scripts/smoke-test-printer.mjs
// (or set them in print-agent/.env — see .env.example)
const host = process.env.PRINTER_HOST
const port = Number(process.env.PRINTER_PORT) || 9100

if (!host) {
  console.error('Missing PRINTER_HOST — set it in .env or the environment (see .env.example). Refusing to guess a printer IP.')
  process.exit(1)
}

const adapter = new NetworkThermalPrinterAdapter({ host, port })

console.log(JSON.stringify({ event: 'connectivity_check', host, port }))
const status = await adapter.getStatus()
console.log(JSON.stringify({ event: 'connectivity_result', status }))
if (status !== 'online') {
  console.error(`Could not open a TCP connection to ${host}:${port} — printer offline, wrong IP/port, or not reachable from this machine's network. Not attempting a print.`)
  process.exit(1)
}

// Plain ASCII text — deliberately NOT the raster/Arabic pipeline (that's
// exercised by the real agent via a real print_jobs row, see the
// HARDWARE_TEST.md runbook's Step 3B). This step only proves the raw
// TCP -> ESC/POS -> paper path itself, with the smallest possible payload.
const line = (s) => Buffer.from(s + '\n', 'ascii')
const bytes = Buffer.concat([
  ESC_INIT,
  line('SIMSIM PRINT AGENT'),
  line('Connectivity smoke test'),
  line(new Date().toISOString()),
  FEED_LINES(3),
  CUT_PAPER,
])

console.log(JSON.stringify({ event: 'sending_test_bytes', length: bytes.length }))
try {
  await adapter.send(bytes)
  console.log(JSON.stringify({ event: 'send_success' }))
  console.log('If the printer is real and reachable, paper should have just printed. This does NOT confirm Arabic/raster rendering — only raw TCP+ESC/POS connectivity. Run the full pipeline next (see HARDWARE_TEST.md).')
} catch (err) {
  console.error(JSON.stringify({ event: 'send_failure', error: String(err?.message || err) }))
  process.exit(1)
}
