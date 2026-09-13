import { buildDocumentBytes } from './escpos.mjs'
import { claimNextPrintJob, getPrintJobDocument, setPrintJobStatus } from './supabaseAgentClient.mjs'
import { logger } from './logger.mjs'

const DOC_CONFIG_KEY = { customer_invoice: 'customerInvoice', kitchen_ticket: 'kitchenTicket' }

// The whole cycle is dependency-injected (client/printer/renderFn) so it
// can be unit-tested with a MockPrinterAdapter and a fake renderFn — no
// real Supabase, browser, or printer needed to verify this function's own
// control flow (claim -> fetch -> render -> send -> confirm, and every
// failure branch). Real wiring (real Supabase client, real
// NetworkThermalPrinterAdapter/MockPrinterAdapter, real renderUrlToRaster)
// only happens in index.mjs.
//
// Never creates/modifies an order, payment, loyalty, or inventory record —
// this function only ever calls the 3 print_jobs-scoped functions above
// plus the injected printer adapter's own send().
export async function runOneClaimCycle({ client, config, printer, renderFn, buildBytesFn = buildDocumentBytes }) {
  logger.claimAttempt()
  const job = await claimNextPrintJob(client, config)
  if (!job) {
    logger.claimEmpty()
    return { claimed: false }
  }
  logger.jobClaimed(job)

  const startedAt = Date.now()
  try {
    const doc = await getPrintJobDocument(client, job.id, job.view_token)
    const configKey = DOC_CONFIG_KEY[job.document_type]
    const docConfig = doc.branch.printerConfig[configKey]

    if (docConfig && docConfig.enabled === false) {
      const message = `printing is disabled for ${job.document_type} in this branch's printer settings`
      await setPrintJobStatus(client, job.id, job.view_token, 'failed', message)
      logger.printFailure(job, new Error(message))
      return { claimed: true, printed: false, reason: 'disabled' }
    }

    const paperWidth = (docConfig && docConfig.paperWidth) || '80mm'
    const copies = Math.max(1, Math.min(5, (docConfig && docConfig.copies) || 1))
    const url = `${config.menuBaseUrl}/print/${job.id}?token=${job.view_token}`

    logger.printStart(job, printer.label)
    const raster = await renderFn(url, paperWidth)
    const bytes = buildBytesFn(raster)

    for (let i = 0; i < copies; i++) {
      await printer.send(bytes)
    }

    await setPrintJobStatus(client, job.id, job.view_token, 'printed')
    logger.printSuccess(job, Date.now() - startedAt)
    return { claimed: true, printed: true }
  } catch (err) {
    logger.printFailure(job, err)
    try {
      await setPrintJobStatus(client, job.id, job.view_token, 'failed', String(err?.message || err).slice(0, 500))
    } catch (statusErr) {
      // The print itself already failed; failing to even record that
      // failure must not crash the agent's polling loop — the job simply
      // stays 'printing' and is picked up by the stale-reclaim path in
      // claim_next_print_job on a later poll.
      logger.statusUpdateFailure(job, statusErr)
    }
    return { claimed: true, printed: false, error: err }
  }
}
