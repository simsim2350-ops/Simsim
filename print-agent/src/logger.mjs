// Structured logging only — job id, order id, document type, printer,
// timing, attempt number, success/failure. Never a token, credential, or
// customer PII (name/phone/address) — those never appear in any log line
// this module writes, even indirectly (callers pass only the fields below).
function line(level, event, fields) {
  const entry = { ts: new Date().toISOString(), level, event, ...fields }
  const out = JSON.stringify(entry)
  if (level === 'error') console.error(out)
  else console.log(out)
}

export const logger = {
  claimAttempt: () => line('info', 'claim_attempt', {}),
  claimEmpty: () => line('info', 'claim_empty', {}),
  jobClaimed: (job) => line('info', 'job_claimed', { jobId: job.id, orderId: job.order_id, documentType: job.document_type, attempt: job.attempt_count }),
  printStart: (job, printerLabel) => line('info', 'print_start', { jobId: job.id, documentType: job.document_type, printer: printerLabel }),
  printSuccess: (job, durationMs) => line('info', 'print_success', { jobId: job.id, documentType: job.document_type, durationMs }),
  printFailure: (job, error) => line('error', 'print_failure', { jobId: job.id, documentType: job.document_type, error: String(error?.message || error) }),
  statusUpdateFailure: (job, error) => line('error', 'status_update_failure', { jobId: job.id, error: String(error?.message || error) }),
  fatal: (error) => line('error', 'fatal', { error: String(error?.message || error) }),
}
