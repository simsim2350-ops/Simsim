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
// tab can never block this one forever.
const WAIT_FOR_SIBLING_TIMEOUT_MS = 45_000
const WAIT_FOR_SIBLING_POLL_MS = 1_500

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
  jobId, token, initialStatus, initialError, autoprint, waitForJobId, waitForToken,
}: {
  jobId: string
  token: string
  initialStatus: PrintJobStatus
  initialError: string | null
  autoprint?: boolean
  waitForJobId?: string
  waitForToken?: string
}) {
  const [status, setStatus] = useState<PrintJobStatus>(initialStatus)
  const [error, setError] = useState<string | null>(initialError)
  const [busy, setBusy] = useState(false)
  const autoprintFired = useRef(false)

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
  // leaves pending/printing or the bounded timeout above is hit, THEN
  // prints. This keeps both windows opened synchronously in one click
  // (avoids popup-blocker issues with a delayed second window.open) while
  // still printing Customer Invoice before Kitchen Ticket in the common case.
  useEffect(() => {
    if (!autoprint || autoprintFired.current || initialStatus !== 'pending') return
    autoprintFired.current = true
    let cancelled = false

    async function waitForSibling() {
      if (!waitForJobId || !waitForToken) return
      const client = supabaseBrowser()
      if (!client) return
      const deadline = Date.now() + WAIT_FOR_SIBLING_TIMEOUT_MS
      while (!cancelled && Date.now() < deadline) {
        const { data } = await client.rpc('get_print_job_document', {
          p_print_job_id: waitForJobId, p_token: waitForToken,
        } as never)
        const siblingStatus = (data as { job?: { status?: PrintJobStatus } } | null)?.job?.status
        if (siblingStatus && siblingStatus !== 'pending' && siblingStatus !== 'printing') return
        await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_SIBLING_POLL_MS))
      }
    }

    waitForSibling().then(() => { if (!cancelled) handlePrint() })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className={`${styles.actions} noPrint`}>
      <div style={{ width: '100%', textAlign: 'center', marginBottom: 4 }}>
        <span className={`${styles.statusBadge} ${styles[`statusBadge--${status}`] || ''}`}>{STATUS_LABEL[status]}</span>
        {error && <div className={styles.errorNote}>{error}</div>}
      </div>
      <button type="button" className={`${styles.actionBtn} ${styles['actionBtn--primary']}`} onClick={handlePrint} disabled={busy}>
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
