import { useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { appConfig } from '../config'

// Order → Customer Invoice + Kitchen Ticket → Thermal Printing (Phase 1).
// Reads/writes only the new print_jobs table (RLS-scoped exactly like
// orders — see sql/print_jobs_phase1.sql), never orders itself: this panel
// never changes order status, totals, or any existing order field. Jobs
// only exist once staff has accepted the order (pending -> preparing), so
// before that this renders a small "not yet available" hint instead of an
// empty/broken list.
const STATUS_LABEL = { pending: 'قيد الانتظار', printing: 'قيد الطباعة', printed: 'تمت الطباعة', failed: 'فشلت', cancelled: 'مُلغاة' }
const STATUS_COLOR = { pending: '#92400E', printing: '#1E40AF', printed: '#065F46', failed: '#991B1B', cancelled: '#6B7280' }
const DOC_LABEL = { customer_invoice: '🧾 فاتورة العميل', kitchen_ticket: '👨‍🍳 تذكرة المطبخ' }

// Unified-print polling: real DB-state polling (never a fake progress bar).
// Bound set comfortably above PrintActions.tsx's own worst case (its
// WAIT_FOR_SIBLING_TIMEOUT_MS 100s + its own DEFAULT_HANG_TIMEOUT_MS 90s,
// so a stalled Kitchen Ticket wait plus a stalled Customer Invoice print
// both still resolve for real before this gives up) plus margin for
// network latency — this stays a "give up watching" bound, not the thing
// that decides success (see pollUntilDone's own force-fail branch below
// for what actually happens if a job is still stuck when this elapses).
const POLL_TIMEOUT_MS = 210_000
const POLL_INTERVAL_MS = 2_000

// PHASE 2.5 — returnUrl/returnLabel let the print view's own "Back" go to
// this exact order (?order=<id> — Orders.jsx reflects the open detail
// modal in the URL for exactly this reason) instead of relying on browser
// history, which a fresh window.open() tab never has anything useful in.
// autoprint/waitFor (unified print) — see PrintActions.tsx for what these
// do on the receiving end.
function openPrintTab(job, orderId, { autoprint, waitFor } = {}) {
  const params = new URLSearchParams({
    token: job.view_token,
    returnUrl: `/orders?order=${orderId}`,
    returnLabel: 'رجوع لتفاصيل الطلب',
  })
  if (autoprint) params.set('autoprint', '1')
  if (waitFor) {
    params.set('waitForJobId', waitFor.id)
    params.set('waitForToken', waitFor.view_token)
  }
  window.open(`${appConfig.menuNextBaseUrl}/print/${job.id}?${params.toString()}`, '_blank')
}

// Exported (alongside deriveOverallStatus below) purely so the unified
// print action's state machine can be unit-tested without rendering the
// component or mocking supabase/window.open — see PrintJobsPanel.test.js.
export function latestOfType(jobs, type) {
  for (let i = jobs.length - 1; i >= 0; i--) {
    if (jobs[i].document_type === type) return jobs[i]
  }
  return null
}

// A job that never reached a terminal state (printed/failed/cancelled)
// within the outer poll's bound is what the Dashboard-side hang-detection
// backstop force-fails — extracted as a pure predicate so this decision
// is unit-tested independently of the actual RPC call.
export function isStuckJob(job) {
  return !!job && (job.status === 'printing' || job.status === 'pending')
}

// Aggregates the two independent per-document statuses into the ONE status
// the unified button shows — never invents a third document type or
// merges their content, purely a UI-level rollup of the exact same
// print_jobs rows the "تفاصيل" list below also shows.
export function deriveOverallStatus(invoiceJob, ticketJob) {
  if (!invoiceJob || !ticketJob) return 'unavailable'
  if (invoiceJob.status === 'printed' && ticketJob.status === 'printed') return 'success'
  if (invoiceJob.status === 'failed' || ticketJob.status === 'failed') return 'failed'
  if (invoiceJob.status === 'printing' || ticketJob.status === 'printing') return 'printing'
  return 'idle'
}

export default function PrintJobsPanel({ orderId, orderStatus }) {
  const [showDetails, setShowDetails] = useState(false)
  const [jobs, setJobs] = useState(null)
  const [loading, setLoading] = useState(false)
  const [acting, setActing] = useState(false)
  const pollTimerRef = useRef(null)
  const notYetAvailable = orderStatus === 'pending'

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('print_jobs')
      .select('id, document_type, status, is_reprint, view_token, last_error, created_at')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true })
    setLoading(false)
    if (error) { toast.error('تعذّر تحميل حالة الطباعة'); return null }
    setJobs(data || [])
    return data || []
  }

  useEffect(() => { if (!notYetAvailable) load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(pollTimerRef.current), [])

  const act = async (job, action) => {
    const rpc = action === 'retry' ? 'retry_print_job' : 'create_reprint_job'
    const { error } = await supabase.rpc(rpc, { p_print_job_id: job.id })
    if (error) { toast.error(action === 'retry' ? 'تعذّرت إعادة المحاولة' : 'تعذّرت إعادة الطباعة'); return }
    toast.success(action === 'retry' ? 'أُعيدت المحاولة' : 'تم إنشاء طلب إعادة طباعة')
    load()
  }

  // Outer hang-detection backstop. PrintActions.tsx's own hang-timeout
  // (see ROOT CAUSE comment there) resolves a job that's actively being
  // watched by a print tab — but if that tab was closed before its own
  // timer could ever fire (the JS in a closed tab simply stops running,
  // so nothing inside it can save it), print_jobs.status would otherwise
  // sit at 'printing' forever with nothing left to move it. This is the
  // ONLY layer that can still catch that specific case, since it runs
  // from the Dashboard tab, not the (possibly closed) print tab. On
  // timeout it force-writes 'failed' directly via the SAME token-gated
  // set_print_job_status RPC PrintActions.tsx itself calls (the job's
  // view_token is already loaded in `jobs` — no new access path). This
  // is hang DETECTION only: it is never used to assume/declare success.
  const forceFailIfStillStuck = async (job) => {
    if (!isStuckJob(job)) return
    await supabase.rpc('set_print_job_status', {
      p_print_job_id: job.id, p_token: job.view_token, p_status: 'failed',
      p_error: 'انتهت المهلة دون تأكيد اكتمال الطباعة (رُصد من لوحة الطلبات)',
    })
  }

  const pollUntilDone = () => {
    const startedAt = Date.now()
    const tick = async () => {
      const list = await load()
      const invoiceJob = latestOfType(list || [], 'customer_invoice')
      const ticketJob = latestOfType(list || [], 'kitchen_ticket')
      const st = deriveOverallStatus(invoiceJob, ticketJob)
      if (st === 'success') { toast.success('تم طباعة الطلب'); setActing(false); return }
      if (st === 'failed') { setActing(false); return }
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        await Promise.all([forceFailIfStillStuck(invoiceJob), forceFailIfStillStuck(ticketJob)])
        await load()
        setActing(false)
        return
      }
      pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS)
    }
    tick()
  }

  // ONE press → both documents. Customer Invoice always goes first (the
  // Kitchen Ticket tab waits on it via waitForJobId — see
  // PrintActions.tsx); separation between the two physical receipts is
  // the existing per-job ESC/POS feed+cut (buildDocumentBytes), never a
  // browser setTimeout here. Re-running this (e.g. via the retry button
  // below) only ever (re)acts on the job(s) not yet 'printed' — a job
  // that already succeeded is never reopened/reprinted, so a failed
  // Kitchen Ticket can be retried without ever duplicating the Customer
  // Invoice.
  const handleUnifiedPrint = async () => {
    if (acting) return
    setActing(true)
    const list = jobs === null ? await load() : jobs
    if (!list) { setActing(false); return }

    let invoiceJob = latestOfType(list, 'customer_invoice')
    let ticketJob = latestOfType(list, 'kitchen_ticket')
    if (!invoiceJob || !ticketJob) {
      toast.error('مستندات الطباعة غير متوفرة بعد لهذا الطلب')
      setActing(false)
      return
    }

    if (invoiceJob.status === 'failed') {
      const { error } = await supabase.rpc('retry_print_job', { p_print_job_id: invoiceJob.id })
      if (!error) invoiceJob = { ...invoiceJob, status: 'pending' }
    }
    if (ticketJob.status === 'failed') {
      const { error } = await supabase.rpc('retry_print_job', { p_print_job_id: ticketJob.id })
      if (!error) ticketJob = { ...ticketJob, status: 'pending' }
    }

    if (invoiceJob.status !== 'printed') openPrintTab(invoiceJob, orderId, { autoprint: true })
    if (ticketJob.status !== 'printed') {
      openPrintTab(ticketJob, orderId, { autoprint: true, waitFor: invoiceJob.status !== 'printed' ? invoiceJob : null })
    }

    pollUntilDone()
  }

  if (notYetAvailable) {
    return <span style={{ fontSize: 11, color: '#9CA3AF' }}>🖨️ الفواتير تتوفر بعد القبول</span>
  }

  const invoiceJob = jobs ? latestOfType(jobs, 'customer_invoice') : null
  const ticketJob = jobs ? latestOfType(jobs, 'kitchen_ticket') : null
  const overall = acting ? 'printing' : deriveOverallStatus(invoiceJob, ticketJob)

  const primaryLabel = {
    unavailable: '🖨️ طباعة الطلب',
    idle: '🖨️ طباعة الطلب',
    printing: 'جاري طباعة الطلب…',
    success: '✓ تم طباعة الطلب',
    failed: 'تعذرت طباعة الطلب',
  }[overall]

  const primaryStyle = {
    fontSize: 12, fontWeight: 800, borderRadius: 8, padding: '6px 12px', cursor: overall === 'printing' ? 'default' : 'pointer',
    border: '1.5px solid transparent',
    background: overall === 'success' ? '#065F46' : overall === 'failed' ? '#991B1B' : '#111827',
    color: 'white',
    opacity: overall === 'printing' ? 0.75 : 1,
  }

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>
      <button type="button" onClick={handleUnifiedPrint} disabled={overall === 'printing'} style={primaryStyle}>
        {primaryLabel}
      </button>
      {overall === 'failed' && (
        <button
          type="button"
          onClick={handleUnifiedPrint}
          style={{ fontSize: 11, fontWeight: 700, border: '1px solid #E5E7EB', background: 'white', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}
        >
          إعادة المحاولة
        </button>
      )}

      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        style={{ fontSize: 11, color: '#6B7280', border: 'none', background: 'none', cursor: 'pointer', textDecoration: 'underline' }}
      >
        تفاصيل
      </button>

      {showDetails && (
        <div style={{ position: 'absolute', zIndex: 40, top: '100%', insetInlineStart: 0, marginTop: 4, background: 'white', border: '1px solid #E5E7EB', borderRadius: 10, boxShadow: '0 8px 24px rgba(16,24,40,0.12)', padding: 10, minWidth: 240 }}>
          {loading && <div style={{ fontSize: 12, color: '#6B7280' }}>...تحميل</div>}
          {!loading && jobs?.length === 0 && <div style={{ fontSize: 12, color: '#6B7280' }}>لا توجد مستندات طباعة</div>}
          {!loading && jobs?.map((job) => (
            <div key={job.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderBottom: '1px solid #F3F4F6' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{DOC_LABEL[job.document_type]}{job.is_reprint ? ' (إعادة طباعة)' : ''}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLOR[job.status] }}>{STATUS_LABEL[job.status]}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={() => openPrintTab(job, orderId)} style={{ fontSize: 11, border: 'none', background: '#111827', color: 'white', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}>فتح</button>
                {job.status === 'failed' && !job.is_reprint && (
                  <button type="button" onClick={() => act(job, 'retry')} style={{ fontSize: 11, border: '1px solid #E5E7EB', background: 'white', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}>إعادة المحاولة</button>
                )}
                {job.status === 'printed' && (
                  <button type="button" onClick={() => act(job, 'reprint')} style={{ fontSize: 11, border: '1px solid #E5E7EB', background: 'white', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}>إعادة طباعة</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
