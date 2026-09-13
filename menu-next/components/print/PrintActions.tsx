'use client'

import { useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import type { PrintJobStatus } from '@/lib/print/types'
import styles from '../../app/print/print.module.css'

const STATUS_LABEL: Record<PrintJobStatus, string> = {
  pending: 'قيد الانتظار', printing: 'قيد الطباعة', printed: 'تمت الطباعة', failed: 'فشلت الطباعة', cancelled: 'مُلغاة',
}

// The ONLY interactive/client-side piece of this route — everything else
// (the actual invoice/ticket content) is server-rendered. This is today's
// honest capability: a staff member manually triggers the browser's own
// print dialog (window.print()) against a thermal-formatted document, and
// then tells the system whether it actually printed. This is NOT automatic
// or silent thermal printing — no Print Agent/hardware exists in this
// environment to make that real claim. A future Print Agent would call the
// same set_print_job_status RPC this button calls, just from its own
// process instead of a person's click.
export function PrintActions({ jobId, token, initialStatus, initialError }: { jobId: string; token: string; initialStatus: PrintJobStatus; initialError: string | null }) {
  const [status, setStatus] = useState<PrintJobStatus>(initialStatus)
  const [error, setError] = useState<string | null>(initialError)
  const [busy, setBusy] = useState(false)

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
