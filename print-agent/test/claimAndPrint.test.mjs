import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runOneClaimCycle } from '../src/claimAndPrint.mjs'

// A fake Supabase client — claimAndPrint.mjs only ever calls client.rpc(name, params)
// (via supabaseAgentClient.mjs's thin wrappers), so a fake .rpc() is enough to
// exercise the full real control flow with zero network/database/browser
// involvement. Each test controls exactly what each RPC name returns.
function fakeClient({ claimResult = null, docResult = null, statusCalls = [] } = {}) {
  return {
    async rpc(name, params) {
      if (name === 'claim_next_print_job') return { data: claimResult, error: null }
      if (name === 'get_print_job_document') return { data: docResult, error: null }
      if (name === 'set_print_job_status') {
        statusCalls.push(params)
        return { data: { status: params.p_status, last_error: params.p_error }, error: null }
      }
      throw new Error(`unexpected rpc: ${name}`)
    },
  }
}

const CONFIG = { restaurantId: 'r1', branchId: 'b1', staleAfterSeconds: 120, maxAttempts: 5, menuBaseUrl: 'https://example.test' }

const SAMPLE_JOB = { id: 'job-1', order_id: 'order-1', document_type: 'kitchen_ticket', view_token: 'tok-1', status: 'printing', attempt_count: 1 }

function sampleDoc(overrides = {}) {
  return {
    job: { id: 'job-1', documentType: 'kitchen_ticket', status: 'printing' },
    order: { orderNumber: '#0001' },
    restaurant: { name: 'Test Restaurant' },
    branch: {
      name: 'Main',
      printerConfig: {
        customerInvoice: { enabled: true, paperWidth: '80mm', copies: 1 },
        kitchenTicket: { enabled: true, paperWidth: '58mm', copies: 1 },
      },
    },
    ...overrides,
  }
}

class FakePrinter {
  constructor() { this.label = 'fake'; this.sent = [] }
  async send(bytes) { this.sent.push(bytes) }
}

const fakeRaster = { widthBytes: 1, heightPx: 1, rows: [Buffer.from([0])] }
const fakeBuildBytes = () => Buffer.from('ESCPOS-BYTES')

test('no pending job — returns claimed:false, never touches the printer', async () => {
  const printer = new FakePrinter()
  const client = fakeClient({ claimResult: null })
  const result = await runOneClaimCycle({ client, config: CONFIG, printer, renderFn: async () => fakeRaster, buildBytesFn: fakeBuildBytes })
  assert.deepEqual(result, { claimed: false })
  assert.equal(printer.sent.length, 0)
})

test('happy path — claims, renders, sends to printer once, and confirms printed', async () => {
  const printer = new FakePrinter()
  const statusCalls = []
  const client = fakeClient({ claimResult: SAMPLE_JOB, docResult: sampleDoc(), statusCalls })
  const result = await runOneClaimCycle({ client, config: CONFIG, printer, renderFn: async () => fakeRaster, buildBytesFn: fakeBuildBytes })

  assert.equal(result.claimed, true)
  assert.equal(result.printed, true)
  assert.equal(printer.sent.length, 1)
  assert.ok(printer.sent[0].equals(Buffer.from('ESCPOS-BYTES')))
  assert.equal(statusCalls.length, 1)
  assert.equal(statusCalls[0].p_status, 'printed')
  assert.equal(statusCalls[0].p_print_job_id, 'job-1')
})

test('copies > 1 sends to the printer that many times', async () => {
  const printer = new FakePrinter()
  const doc = sampleDoc()
  doc.branch.printerConfig.kitchenTicket.copies = 3
  const client = fakeClient({ claimResult: SAMPLE_JOB, docResult: doc })
  await runOneClaimCycle({ client, config: CONFIG, printer, renderFn: async () => fakeRaster, buildBytesFn: fakeBuildBytes })
  assert.equal(printer.sent.length, 3)
})

test('disabled document type — never touches the printer, marks the job failed with a clear reason', async () => {
  const printer = new FakePrinter()
  const doc = sampleDoc()
  doc.branch.printerConfig.kitchenTicket.enabled = false
  const statusCalls = []
  const client = fakeClient({ claimResult: SAMPLE_JOB, docResult: doc, statusCalls })
  const result = await runOneClaimCycle({ client, config: CONFIG, printer, renderFn: async () => fakeRaster, buildBytesFn: fakeBuildBytes })

  assert.equal(printer.sent.length, 0)
  assert.equal(result.reason, 'disabled')
  assert.equal(statusCalls[0].p_status, 'failed')
  assert.match(statusCalls[0].p_error, /disabled/)
})

test('render failure — never touches the printer, marks the job failed with the render error', async () => {
  const printer = new FakePrinter()
  const statusCalls = []
  const client = fakeClient({ claimResult: SAMPLE_JOB, docResult: sampleDoc(), statusCalls })
  const result = await runOneClaimCycle({
    client, config: CONFIG, printer,
    renderFn: async () => { throw new Error('browser render failed') },
    buildBytesFn: fakeBuildBytes,
  })

  assert.equal(printer.sent.length, 0)
  assert.equal(result.printed, false)
  assert.equal(statusCalls[0].p_status, 'failed')
  assert.match(statusCalls[0].p_error, /browser render failed/)
})

test('printer failure — job marked failed with the printer error, cycle does not throw', async () => {
  const statusCalls = []
  const client = fakeClient({ claimResult: SAMPLE_JOB, docResult: sampleDoc(), statusCalls })
  const failingPrinter = { label: 'failing', send: async () => { throw new Error('printer offline') } }
  const result = await runOneClaimCycle({ client, config: CONFIG, printer: failingPrinter, renderFn: async () => fakeRaster, buildBytesFn: fakeBuildBytes })

  assert.equal(result.printed, false)
  assert.equal(statusCalls[0].p_status, 'failed')
  assert.match(statusCalls[0].p_error, /printer offline/)
})

test('a status-update failure after a print failure does not throw out of the cycle', async () => {
  const client = {
    async rpc(name) {
      if (name === 'claim_next_print_job') return { data: SAMPLE_JOB, error: null }
      if (name === 'get_print_job_document') return { data: sampleDoc(), error: null }
      if (name === 'set_print_job_status') return { data: null, error: { message: 'network down' } }
      throw new Error(`unexpected rpc: ${name}`)
    },
  }
  const failingPrinter = { label: 'failing', send: async () => { throw new Error('printer offline') } }
  const result = await runOneClaimCycle({ client, config: CONFIG, printer: failingPrinter, renderFn: async () => fakeRaster, buildBytesFn: fakeBuildBytes })
  assert.equal(result.printed, false)
  assert.ok(result.error)
})
