import { test } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { NetworkThermalPrinterAdapter, MockPrinterAdapter, createPrinterAdapter } from '../src/printerAdapter.mjs'

test('MockPrinterAdapter captures sent bytes and reports "unknown" status (never a fake "online")', async () => {
  const adapter = new MockPrinterAdapter()
  const payload = Buffer.from('hello printer')
  await adapter.send(payload)
  assert.equal(adapter.sent.length, 1)
  assert.ok(adapter.sent[0].equals(payload))
  assert.equal(await adapter.getStatus(), 'unknown')
})

test('createPrinterAdapter selects MockPrinterAdapter when no printerHost is configured', () => {
  const adapter = createPrinterAdapter({ printerHost: null })
  assert.equal(adapter.label, 'mock')
})

test('createPrinterAdapter selects NetworkThermalPrinterAdapter when printerHost is configured', () => {
  const adapter = createPrinterAdapter({ printerHost: '127.0.0.1', printerPort: 9100 })
  assert.equal(adapter.label, 'network:127.0.0.1:9100')
})

// This test proves NetworkThermalPrinterAdapter's actual TCP socket logic
// works — it spins up a REAL local TCP server and confirms the adapter
// really connects and really transmits the exact bytes given. It does NOT
// and cannot prove a real thermal printer would understand/print those
// bytes correctly — no physical printer or real network printer exists in
// this environment (see the execution report's Hardware Tests section).
test('NetworkThermalPrinterAdapter sends real bytes over a real TCP socket', async () => {
  const received = []
  const server = net.createServer((socket) => {
    socket.on('data', (chunk) => received.push(chunk))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  const adapter = new NetworkThermalPrinterAdapter({ host: '127.0.0.1', port })
  const payload = Buffer.from([0x1b, 0x40, 0x48, 0x49]) // ESC @ "HI"
  await adapter.send(payload)

  // Give the server a tick to flush the 'data' event before asserting.
  await new Promise((resolve) => setTimeout(resolve, 50))
  server.close()

  const all = Buffer.concat(received)
  assert.ok(all.equals(payload))
})

test('NetworkThermalPrinterAdapter.send() rejects when nothing is listening on the target port', async () => {
  const adapter = new NetworkThermalPrinterAdapter({ host: '127.0.0.1', port: 1, connectTimeoutMs: 1000 })
  await assert.rejects(() => adapter.send(Buffer.from('x')))
})

test('NetworkThermalPrinterAdapter.getStatus() reports "offline" when nothing is listening (never a false "online")', async () => {
  const adapter = new NetworkThermalPrinterAdapter({ host: '127.0.0.1', port: 1 })
  const status = await adapter.getStatus()
  assert.equal(status, 'offline')
})
