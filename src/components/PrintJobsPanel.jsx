import { useEffect, useState } from 'react'
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

function openJob(job) {
  window.open(`${appConfig.menuNextBaseUrl}/print/${job.id}?token=${job.view_token}`, '_blank')
}

export default function PrintJobsPanel({ orderId, orderStatus }) {
  const [open, setOpen] = useState(false)
  const [jobs, setJobs] = useState(null)
  const [loading, setLoading] = useState(false)
  const notYetAvailable = orderStatus === 'pending'

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('print_jobs')
      .select('id, document_type, status, is_reprint, view_token, last_error, created_at')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true })
    setLoading(false)
    if (error) { toast.error('تعذّر تحميل حالة الطباعة'); return }
    setJobs(data || [])
  }

  useEffect(() => { if (open && jobs === null) load() }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (job, action) => {
    const rpc = action === 'retry' ? 'retry_print_job' : 'create_reprint_job'
    const { error } = await supabase.rpc(rpc, { p_print_job_id: job.id })
    if (error) { toast.error(action === 'retry' ? 'تعذّرت إعادة المحاولة' : 'تعذّرت إعادة الطباعة'); return }
    toast.success(action === 'retry' ? 'أُعيدت المحاولة' : 'تم إنشاء طلب إعادة طباعة')
    load()
  }

  if (notYetAvailable) {
    return <span style={{ fontSize: 11, color: '#9CA3AF' }}>🖨️ الفواتير تتوفر بعد القبول</span>
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ fontSize: 12, fontWeight: 700, border: '1.5px solid #E5E7EB', borderRadius: 8, background: 'white', padding: '4px 10px', cursor: 'pointer' }}
      >
        🖨️ الطباعة
      </button>
      {open && (
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
                <button type="button" onClick={() => openJob(job)} style={{ fontSize: 11, border: 'none', background: '#111827', color: 'white', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}>فتح</button>
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
