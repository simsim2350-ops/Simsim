import net from 'node:net'

// PrinterAdapter interface (documented, not enforced by a class hierarchy —
// this is plain JS, matching the rest of this repo's convention):
//   async send(bytes: Buffer): Promise<void>   — throws on failure
//   async getStatus(): Promise<'online'|'offline'|'unknown'>
//   label: string                              — for logging only
//
// Only two adapters are implemented in Phase 2, per the task's own
// instruction not to build adapters that aren't needed yet:
//   - NetworkThermalPrinterAdapter: real ESC/POS over a raw TCP socket
//     (port 9100 is the de facto standard "raw"/"RAW9100" mode almost
//     every network-capable thermal printer — Epson, Star, generic
//     clones — supports). Chosen over USB because it needs zero native
//     Node bindings (works identically on Windows/Mac/Linux with nothing
//     but Node's built-in `net` module), which is what makes it the
//     "most reliable connection type that can actually be implemented and
//     tested in this project/environment" per the task's own framing.
//   - MockPrinterAdapter: captures what would have been sent instead of
//     opening a real socket — this is the ONLY adapter this session could
//     actually exercise end-to-end, since no physical printer or real
//     network printer exists in this environment. Never claim otherwise.
//
// A USBThermalPrinterAdapter is NOT implemented — it would need either a
// native Node addon (`usb`/`node-hid`, real compiled bindings per OS) or
// OS-specific device-file paths (Windows share names vs. /dev/usb/lp0 on
// Linux vs. macOS's own IOKit path), none of which can be written OR
// tested responsibly without the real hardware and target OS in hand. The
// interface above is deliberately hardware-agnostic so one can be added
// later without touching claimAndPrint.mjs at all.

export class NetworkThermalPrinterAdapter {
  constructor({ host, port = 9100, connectTimeoutMs = 5000 }) {
    this.host = host
    this.port = port
    this.connectTimeoutMs = connectTimeoutMs
    this.label = `network:${host}:${port}`
  }

  send(bytes) {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket()
      let settled = false
      const finish = (err) => {
        if (settled) return
        settled = true
        socket.destroy()
        if (err) reject(err)
        else resolve()
      }
      socket.setTimeout(this.connectTimeoutMs)
      socket.once('timeout', () => finish(new Error(`printer connection timed out (${this.host}:${this.port})`)))
      socket.once('error', (err) => finish(err))
      socket.connect(this.port, this.host, () => {
        socket.write(bytes, (err) => {
          if (err) return finish(err)
          finish(null)
        })
      })
    })
  }

  // A raw ESC/POS socket protocol has no standard "are you there" query
  // most cheap/clone printers answer — the honest, non-overclaiming signal
  // available here is "did a TCP connection to the configured host/port
  // succeed." That proves the network path is reachable, not that paper
  // is loaded or the print head is healthy — hence 'unknown' rather than
  // a confident 'online' when the probe itself isn't run (see
  // claimAndPrint.mjs, which does not call this on every job — only worth
  // it for the Settings UI's "test connection" affordance).
  getStatus() {
    return new Promise((resolve) => {
      const socket = new net.Socket()
      const done = (status) => { socket.destroy(); resolve(status) }
      socket.setTimeout(2000)
      socket.once('timeout', () => done('offline'))
      socket.once('error', () => done('offline'))
      socket.connect(this.port, this.host, () => done('online'))
    })
  }
}

export class MockPrinterAdapter {
  constructor({ onSend } = {}) {
    this.label = 'mock'
    this.sent = []
    this.onSend = onSend || null
  }

  async send(bytes) {
    this.sent.push(bytes)
    if (this.onSend) await this.onSend(bytes)
  }

  async getStatus() {
    return 'unknown'
  }
}

export function createPrinterAdapter(config) {
  if (!config.printerHost) return new MockPrinterAdapter()
  return new NetworkThermalPrinterAdapter({ host: config.printerHost, port: config.printerPort })
}
