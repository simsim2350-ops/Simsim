import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import AppShell from '../components/AppShell'
import { supabase } from '../lib/supabase'

// صفحة اشتراك المطعم وفواتيره (قراءة فقط) — M4.2.
// تقرأ صفوف المطعم عبر RLS (سياسات المالك)، والإدارة تبقى لدى المشرف.
const ORANGE = '#FF6B35', BORDER = '#E5E7EB', MUTED = '#6B7280', TEXT = '#111827'
const num = (v) => Number(v) || 0
const fmt = (v) => num(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = (v) => v ? new Date(v).toLocaleDateString('ar-SA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const CYCLE = { monthly: 'شهري', yearly: 'سنوي' }
const SUB_STATUS = { trialing: 'تجريبي', active: 'نشط', past_due: 'متأخّر', canceled: 'ملغى' }
const SUB_COLOR = { trialing: '#6B7280', active: '#059669', past_due: '#D97706', canceled: '#6B7280' }
const INV_STATUS = { draft: 'مسودّة', open: 'مستحقّة', paid: 'مدفوعة', void: 'ملغاة' }
const INV_COLOR = { draft: '#6B7280', open: '#D97706', paid: '#059669', void: '#9CA3AF' }

function Badge({ text, color }) {
  return <span style={{ fontSize: '11px', fontWeight: '800', color, background: `${color}18`, borderRadius: '100px', padding: '3px 10px' }}>{text}</span>
}

export default function Billing() {
  const { restaurant } = useAuthStore()
  const [sub, setSub] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!restaurant?.id) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const [s, i] = await Promise.all([
          supabase.from('subscriptions').select('*').eq('restaurant_id', restaurant.id).maybeSingle(),
          supabase.from('invoices').select('*').eq('restaurant_id', restaurant.id).order('issued_at', { ascending: false }),
        ])
        if (s.error) throw s.error
        if (i.error) throw i.error
        if (!cancelled) { setSub(s.data); setInvoices(i.data || []) }
      } catch (e) {
        if (!cancelled) setError(e?.message || 'تعذّر التحميل')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [restaurant?.id])

  const card = { background: 'white', border: `1px solid ${BORDER}`, borderRadius: '16px', padding: '18px', marginBottom: '14px' }

  return (
    <AppShell active="billing" title="💳 الاشتراك والفوترة">
      <div style={{ padding: '20px', maxWidth: '760px', margin: '0 auto' }}>
        {loading ? (
          <div style={{ color: MUTED, textAlign: 'center', padding: '48px', fontSize: '14px' }}>جارٍ التحميل…</div>
        ) : error ? (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', padding: '16px', color: '#B91C1C', fontSize: '13px' }}>⚠️ {error}</div>
        ) : (
          <>
            {/* بطاقة الاشتراك */}
            <div style={card}>
              <div style={{ fontSize: '14px', fontWeight: '800', color: TEXT, fontFamily: 'Cairo,sans-serif', marginBottom: '14px' }}>اشتراكك الحالي</div>
              {!sub ? (
                <div style={{ color: MUTED, fontSize: '13.5px' }}>لا يوجد اشتراك مُسجَّل بعد. تواصل مع فريق سِمسِم لتفعيل باقتك.</div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '180px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                      <span style={{ fontFamily: 'Cairo,sans-serif', fontWeight: '900', fontSize: '18px', color: TEXT }}>{sub.plan_label || 'باقة'}</span>
                      <Badge text={SUB_STATUS[sub.status] || sub.status} color={SUB_COLOR[sub.status] || MUTED} />
                    </div>
                    <div style={{ fontSize: '12.5px', color: MUTED }}>
                      دورة {CYCLE[sub.billing_cycle] || sub.billing_cycle}
                      {(sub.current_period_start || sub.current_period_end) && ` · الفترة ${fmtDate(sub.current_period_start)} — ${fmtDate(sub.current_period_end)}`}
                    </div>
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontFamily: 'Cairo,sans-serif', fontWeight: '900', fontSize: '22px', color: ORANGE }}>{fmt(sub.amount)} <span style={{ fontSize: '13px', color: MUTED }}>﷼</span></div>
                    <div style={{ fontSize: '11px', color: MUTED }}>شامل ض.ق.م</div>
                  </div>
                </div>
              )}
            </div>

            {/* الفواتير */}
            <div style={card}>
              <div style={{ fontSize: '14px', fontWeight: '800', color: TEXT, fontFamily: 'Cairo,sans-serif', marginBottom: '14px' }}>الفواتير</div>
              {invoices.length === 0 ? (
                <div style={{ color: MUTED, fontSize: '13.5px' }}>لا توجد فواتير بعد.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {invoices.map((i) => (
                    <div key={i.id} style={{ border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '13px 14px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: '160px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '3px' }}>
                          <span style={{ fontFamily: 'Cairo,sans-serif', fontWeight: '800', fontSize: '13.5px', color: TEXT }}>فاتورة #{i.invoice_number}</span>
                          <Badge text={INV_STATUS[i.status]} color={INV_COLOR[i.status]} />
                        </div>
                        <div style={{ fontSize: '11.5px', color: MUTED }}>
                          صافي {fmt(i.amount_net)} + ضريبة {fmt(i.vat_amount)} · أُصدرت {fmtDate(i.issued_at)}
                          {i.status === 'open' && i.due_at ? ` · تستحقّ ${fmtDate(i.due_at)}` : ''}
                          {i.status === 'paid' && i.paid_at ? ` · دُفعت ${fmtDate(i.paid_at)}` : ''}
                        </div>
                      </div>
                      <div style={{ fontFamily: 'Cairo,sans-serif', fontWeight: '900', fontSize: '16px', color: TEXT }}>{fmt(i.total)} <span style={{ fontSize: '11px', color: MUTED }}>﷼</span></div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ fontSize: '11.5px', color: MUTED, textAlign: 'center', padding: '4px 0' }}>
              لتغيير باقتك أو الاستفسار عن فاتورة، تواصل مع فريق سِمسِم.
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
