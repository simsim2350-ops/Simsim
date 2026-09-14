'use client'

import { useEffect, useRef, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import type { PrintJobStatus } from '@/lib/print/types'
import styles from '../../app/print/print.module.css'

const STATUS_LABEL: Record<PrintJobStatus, string> = {
  pending: 'قيد الانتظار', printing: 'قيد الطباعة', printed: 'تمت الطباعة', failed: 'فشلت الطباعة', cancelled: 'مُلغاة',
}

// Bounded wait for the sibling job (waitForJobId) to leave pending/printing
// before this tab auto-prints — real DB-state polling, never an arbitrary
// fixed delay meant to *simulate* separation (see claimAndPrint.mjs/
// buildDocumentBytes for the real separator: every print_jobs row already
// ends in its own ESC/POS feed+cut). Capped so a closed/abandoned sibling
// tab can never block this one forever — and set comfortably longer than
// DEFAULT_HANG_TIMEOUT_MS below so this wait always observes the
// sibling's own genuine PRINTED/FAILED resolution instead of guessing
// early while the sibling is still legitimately in flight.
const WAIT_FOR_SIBLING_TIMEOUT_MS = 100_000
const WAIT_FOR_SIBLING_POLL_MS = 1_500

// ROOT CAUSE OF THE "جاري طباعة الطلب..." STUCK BUG (see
// PRINT_FLOW_STUCK_FIX_EXECUTION_REPORT.md): window.print() is NOT the
// same event as print_jobs.status = 'printed'. The old handlePrint() set
// status to 'printing' and called window.print(), then had NO further
// code path to ever move it past 'printing' — the only way forward was a
// staff member manually clicking "✓ تمت الطباعة" on that exact tab before
// leaving it, which the unified-print flow never prompts for. A real
// production job (order #0180) was found stuck exactly this way:
// customer_invoice at 'printing', claimed_at/claimed_by both null
// (proving no Print Agent ever touched it — this is the browser-print
// self-report path, not the automatic ESC/POS path), and kitchen_ticket
// never even started because its own wait-for-sibling loop kept waiting
// for a status that could never arrive.
//
// Fix: this route's own printing is exclusively the browser self-report
// model (no Print Agent runs in a customer's browser) — its lifecycle is
// now made explicit and self-resolving instead of depending on a manual
// click that may never come:
//   PENDING -> PRINTING -> PRINTED   (the 'afterprint' DOM event fires
//                                      when the OS print dialog this
//                                      window.print() opened is
//                                      dismissed — a real, standard,
//                                      well-supported completion signal,
//                                      not an assumption that print()
//                                      returning means success)
//   PENDING -> PRINTING -> FAILED    (if 'afterprint' never fires within
//                                      DEFAULT_HANG_TIMEOUT_MS — e.g. the
//                                      tab was closed before the dialog
//                                      ever appeared — this is hang
//                                      DETECTION, never used to assume
//                                      success)
// The manual "✓ تمت الطباعة"/"✗ فشلت الطباعة" buttons remain as an
// always-available override in both directions; whichever settles first
// (the event, the timeout, or a manual click) wins — React's own effect
// cleanup (tied to the `status` dependency below) cancels whichever
// listener/timer didn't win, with no manual bookkeeping needed.
const DEFAULT_HANG_TIMEOUT_MS = 90_000

// The ONLY interactive/client-side piece of this route — everything else
// (the actual invoice/ticket content) is server-rendered. This is today's
// honest capability: a staff member (or the unified "طباعة الطلب" flow —
// see PrintJobsPanel.jsx) triggers the browser's own print dialog
// (window.print()) against a thermal-formatted document, and then tells
// the system whether it actually printed. This is NOT automatic or silent
// thermal printing — a real Print Agent/hardware set up elsewhere would
// call the exact same set_print_job_status RPC this button calls, just
// from its own process instead of a person's click or this auto-print
// effect; that guard (initialStatus === 'pending' — see below) is also
// what stops this from re-printing a job a real agent already claimed.
export function PrintActions({
  jobId, token, initialStatus, initialError, autoprint, waitForJobId, waitForToken, hangTimeoutMs,
}: {
  jobId: string
  token: string
  initialStatus: PrintJobStatus
  initialError: string | null
  autoprint?: boolean
  waitForJobId?: string
  waitForToken?: string
  // Test-only override (see page.tsx's hangTimeoutMs search param, clamped
  // to never exceed DEFAULT_HANG_TIMEOUT_MS) — lets Playwright exercise
  // the hang-detection path deterministically in milliseconds instead of
  // burning 90 real seconds per test run. Absent in every real usage.
  hangTimeoutMs?: number
}) {
  const [status, setStatus] = useState<PrintJobStatus>(initialStatus)
  const [error, setError] = useState<string | null>(initialError)
  const [busy, setBusy] = useState(false)
  const autoprintFired = useRef(false)
  const effectiveHangTimeoutMs = hangTimeoutMs && hangTimeoutMs > 0 && hangTimeoutMs < DEFAULT_HANG_TIMEOUT_MS
    ? hangTimeoutMs
    : DEFAULT_HANG_TIMEOUT_MS

  const updateStatus = async (next: 'printing' | 'printed' | 'failed', errMsg?: string) => {
    if (busy) return
    setBusy(true)
    const client = supabaseBrowser()
    if (!client) { setBusy(false); return }
    const { data, error: rpcError } = await client.rpc('set_print_job_status', {
      p_print_job_id: jobId, p_token: token, p_status: next, p_error: errMsg ?? null,
    } as never)
    setBusy(false)
    if (rpcError || !data) return
    const row = data as { status: PrintJobStatus; last_error: string | null }
    setStatus(row.status)
    setError(row.last_error)
  }

  const handlePrint = async () => {
    await updateStatus('printing')
    window.print()
  }

  // Unified "طباعة الطلب" support: auto-trigger this document's own print,
  // once, only while it is genuinely still 'pending' (never re-fires on a
  // reload, and never fires at all if some other process — a real Print
  // Agent, or a previous run of this same flow — already moved it past
  // pending). If waitForJobId/waitForToken are set (this is the SECOND
  // document of the pair, e.g. Kitchen Ticket), it first polls the sibling
  // job's real status via the same token-gated get_print_job_document RPC
  // every caller already uses — not a fixed timer — until the sibling
  // reaches a real terminal state or the bounded timeout above is hit.
  // Opening both windows synchronously in one click (avoids popup-blocker
  // issues with a delayed second window.open) while still deciding
  // Kitchen Ticket's fate strictly from the Customer Invoice's OWN real
  // outcome:
  //   sibling PRINTED           -> print this document (the happy path)
  //   sibling FAILED            -> do NOT print — this job is marked
  //                                'failed' too instead, so both the
  //                                Dashboard's aggregate status and this
  //                                tab itself clearly explain why nothing
  //                                printed
  //   sibling never resolved    -> same as FAILED (never resolved =
  //   (timed out waiting)          not a confirmed success, so this must
  //                                never print on an unconfirmed guess)
  // A prior version of this effect treated "sibling left pending/printing"
  // as "safe to proceed" regardless of which terminal state it actually
  // reached — so a FAILED Customer Invoice would still let Kitchen Ticket
  // print. Fixed: only a confirmed PRINTED sibling ever leads to printing.
  useEffect(() => {
    if (!autoprint || autoprintFired.current || initialStatus !== 'pending') return
    autoprintFired.current = true
    let cancelled = false

    async function resolveSiblingOutcome(): Promise<PrintJobStatus | 'timeout'> {
      const client = supabaseBrowser()
      if (!client) return 'timeout'
      const deadline = Date.now() + WAIT_FOR_SIBLING_TIMEOUT_MS
      while (!cancelled && Date.now() < deadline) {
        const { data } = await client.rpc('get_print_job_document', {
          p_print_job_id: waitForJobId, p_token: waitForToken,
        } as never)
        const siblingStatus = (data as { job?: { status?: PrintJobStatus } } | null)?.job?.status
        if (siblingStatus && siblingStatus !== 'pending' && siblingStatus !== 'printing') return siblingStatus
        await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_SIBLING_POLL_MS))
      }
      return 'timeout'
    }

    async function run() {
      if (!waitForJobId || !waitForToken) {
        // No sibling to wait for — this is the first/only document (e.g.
        // Customer Invoice itself), unaffected by any of the above.
        await handlePrint()
        return
      }
      const outcome = await resolveSiblingOutcome()
      if (cancelled) return
      if (outcome === 'printed') { await handlePrint(); return }
      await updateStatus('failed', outcome === 'failed'
        ? 'لم تبدأ طباعة هذا المستند لأن فاتورة العميل فشلت'
        : 'لم تبدأ طباعة هذا المستند لتعذّر تأكيد نجاح فاتورة العميل خلال الوقت المتوقع')
    }

    run()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // THE ACTUAL FIX — see the ROOT CAUSE comment above the constants.
  // Whenever status is 'printing' (however it got there: a fresh
  // handlePrint() call above, OR simply loading a page for a job that was
  // already stuck 'printing' from before this fix), arm a real completion
  // signal instead of leaving the job to depend on a manual click that may
  // never come:
  //   - 'afterprint' fires when the browser's OS print dialog closes
  //     (printed or cancelled — the platform gives no reliable way to
  //     distinguish the two, the same ambiguity the ORIGINAL manual
  //     "✓/✗" buttons existed to resolve by hand; this remains an
  //     inherent limit of the browser-print self-report model, not
  //     something this fix can remove — the manual buttons stay available
  //     to correct it) -> PRINTED.
  //   - a bounded timer, ONLY ever used to detect a hang and declare
  //     FAILED — never to assume success.
  // React's effect cleanup (fires whenever `status` changes, including
  // from a manual button click) automatically cancels whichever of these
  // didn't win — no manual settled-flag bookkeeping needed beyond the one
  // below, which only guards this single effect instance against the
  // event and the timer both firing back-to-back before cleanup runs.
  useEffect(() => {
    if (status !== 'printing') return
    let settled = false
    const onAfterPrint = () => {
      if (settled) return
      settled = true
      updateStatus('printed')
    }
    const hangTimer = setTimeout(() => {
      if (settled) return
      settled = true
      updateStatus('failed', 'لم يتم تأكيد اكتمال الطباعة خلال الوقت المتوقع — يمكن تأكيدها يدوياً أعلاه إن كانت طُبعت فعلاً، أو إعادة المحاولة')
    }, effectiveHangTimeoutMs)
    window.addEventListener('afterprint', onAfterPrint)
    return () => {
      settled = true
      window.removeEventListener('afterprint', onAfterPrint)
      clearTimeout(hangTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  return (
    <div className={`${styles.actions} noPrint`}>
      <div style={{ width: '100%', textAlign: 'center', marginBottom: 4 }}>
        <span className={`${styles.statusBadge} ${styles[`statusBadge--${status}`] || ''}`}>{STATUS_LABEL[status]}</span>
        {error && <div className={styles.errorNote}>{error}</div>}
      </div>
      <button type="button" className={`${styles.actionBtn} ${styles['actionBtn--primary']}`} onClick={handlePrint} disabled={busy || status === 'printing'}>
        🖨️ طباعة
      </button>
      <button type="button" className={styles.actionBtn} onClick={() => updateStatus('printed')} disabled={busy}>
        ✓ تمت الطباعة
      </button>
      <button type="button" className={`${styles.actionBtn} ${styles['actionBtn--danger']}`} onClick={() => updateStatus('failed', 'الطابعة غير متاحة أو تعذّرت الطباعة')} disabled={busy}>
        ✗ فشلت الطباعة
      </button>
    </div>
  )
}
