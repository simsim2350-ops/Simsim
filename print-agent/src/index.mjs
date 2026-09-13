import { loadConfig } from './config.mjs'
import { createAgentClient } from './supabaseAgentClient.mjs'
import { createPrinterAdapter } from './printerAdapter.mjs'
import { renderUrlToRaster } from './renderToRaster.mjs'
import { runOneClaimCycle } from './claimAndPrint.mjs'
import { logger } from './logger.mjs'

async function main() {
  const config = loadConfig()
  const client = await createAgentClient(config)
  const printer = createPrinterAdapter(config)

  console.log(JSON.stringify({
    ts: new Date().toISOString(), event: 'agent_started',
    restaurantId: config.restaurantId, branchId: config.branchId, printer: printer.label,
  }))

  let stopping = false
  const stop = () => { stopping = true }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)

  while (!stopping) {
    try {
      await runOneClaimCycle({ client, config, printer, renderFn: renderUrlToRaster })
    } catch (err) {
      // A single cycle's own unexpected error must never kill the whole
      // agent process — log it and keep polling.
      logger.fatal(err)
    }
    await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs))
  }
}

main().catch((err) => {
  logger.fatal(err)
  process.exit(1)
})
