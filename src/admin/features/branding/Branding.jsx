import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import AdminShell from '../../AdminShell'
import MenuBranding from '../../../features/menu/MenuBranding'
import { getPlatformBranding, savePlatformBranding } from '../../../lib/brandingApi'

// ============================================================================
// 🎨 هوية المنيو (Menu Branding) — تحكّم منصّي مركزي بعبارة «صمم بواسطة سمسم».
// المصدر الوحيد: جدول platform_branding (RLS: سوبر أدمن فقط). مع Preview حيّ.
// ============================================================================
const CARD = '#12141C', BORDER = 'rgba(255,255,255,0.08)', MUTED = '#9CA3AF', ACCENT = '#7C3AED', GREEN = '#22C55E'
const inputStyle = { background: '#0B0D12', border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '10px 12px', color: 'white', fontFamily: 'Tajawal,sans-serif', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box' }
const PLACEMENTS = [{ v: 'bottom', l: 'أسفل المنيو' }, { v: 'footer', l: 'التذييل (Footer)' }]
const VARIANTS = [{ v: 'text', l: 'نص فقط' }, { v: 'text_logo', l: 'نص + شعار' }, { v: 'logo', l: 'شعار فقط' }]

function Field({ label, hint, children }) {
  return (
    <label style={{ display: 'block', marginBottom: '14px' }}>
      <span style={{ display: 'block', fontSize: '12px', color: MUTED, fontWeight: '700', marginBottom: '6px' }}>{label}</span>
      {children}
      {hint && <span style={{ display: 'block', fontSize: '11px', color: '#6B7280', marginTop: '5px' }}>{hint}</span>}
    </label>
  )
}

export default function Branding() {
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    getPlatformBranding()
      .then(setForm)
      .catch((e) => setErr(e.message || String(e)))
      .finally(() => setLoading(false))
  }, [])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function save() {
    setSaving(true)
    try {
      const payload = {
        enabled: !!form.enabled,
        text: (form.text || '').trim(),
        url: (form.url || '').trim() || null,
        placement: form.placement,
        variant: form.variant,
      }
      if (payload.variant !== 'logo' && !payload.text) { toast.error('النص مطلوب (إلا لو اخترت «شعار فقط»)'); setSaving(false); return }
      const saved = await savePlatformBranding(payload)
      setForm(saved)
      toast.success('حُفظت هوية المنيو ✅')
    } catch (e) { toast.error(e.message || 'تعذّر الحفظ') } finally { setSaving(false) }
  }

  return (
    <AdminShell active="branding" title="🎨 هوية المنيو">
      {loading ? (
        <div style={{ color: MUTED, textAlign: 'center', padding: '48px', fontSize: '13px' }}>جارٍ التحميل…</div>
      ) : err ? (
        <div style={{ background: '#3B1113', border: '1px solid #7F1D1D', borderRadius: '12px', padding: '16px', color: '#FCA5A5', fontSize: '13px' }}>⚠️ {err}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '16px', alignItems: 'start' }}>
          {/* الإعدادات */}
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '14px', padding: '18px' }}>
            <div style={{ fontSize: '11px', color: MUTED, lineHeight: 1.7, marginBottom: '14px' }}>
              يتحكّم هذا الإعداد بعبارة «صمم بواسطة سمسم» في كل المنيوهات. (السياسة لكل باقة/مطعم تأتي لاحقاً.)
            </div>

            <div onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '12px 14px', border: `1px solid ${BORDER}`, borderRadius: '12px', cursor: 'pointer', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '13.5px', color: 'white', fontWeight: '700' }}>إظهار «صمم بواسطة سمسم»</div>
                <div style={{ fontSize: '11px', color: MUTED, marginTop: '2px' }}>{form.enabled ? 'ظاهرة في المنيو' : 'مخفية تماماً'}</div>
              </div>
              <span style={{ width: '46px', height: '26px', borderRadius: '100px', background: form.enabled ? GREEN : '#374151', position: 'relative', transition: 'background .15s', flexShrink: 0 }}>
                <span style={{ position: 'absolute', top: '3px', left: form.enabled ? '3px' : '23px', width: '20px', height: '20px', borderRadius: '50%', background: 'white', transition: 'left .15s' }} />
              </span>
            </div>

            <Field label="النص"><input value={form.text || ''} onChange={set('text')} style={inputStyle} placeholder="صمم بواسطة سمسم" /></Field>
            <Field label="الرابط (يفتح عند الضغط)" hint="اتركه فارغاً لعبارة بلا رابط."><input value={form.url || ''} onChange={set('url')} style={{ ...inputStyle, direction: 'ltr', textAlign: 'left' }} placeholder="https://simsimmenu.com" /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <Field label="المكان"><select value={form.placement} onChange={set('placement')} style={inputStyle}>{PLACEMENTS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}</select></Field>
              <Field label="الشكل"><select value={form.variant} onChange={set('variant')} style={inputStyle}>{VARIANTS.map((v) => <option key={v.v} value={v.v}>{v.l}</option>)}</select></Field>
            </div>

            <button onClick={save} disabled={saving} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontFamily: 'Cairo,sans-serif', fontWeight: '800', fontSize: '13px', color: 'white', background: ACCENT, opacity: saving ? 0.7 : 1, marginTop: '4px' }}>
              {saving ? 'جارٍ الحفظ…' : '💾 حفظ'}
            </button>
          </div>

          {/* المعاينة الحيّة */}
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '14px', padding: '18px' }}>
            <div style={{ fontSize: '12.5px', color: 'white', fontWeight: '800', marginBottom: '4px', fontFamily: 'Cairo,sans-serif' }}>👁️ معاينة</div>
            <div style={{ fontSize: '11px', color: MUTED, marginBottom: '12px' }}>هكذا ستظهر أسفل منيو الزبون{form.enabled ? '' : ' (مخفية حالياً — المعاينة توضح الشكل فقط)'}.</div>
            <div style={{ background: 'white', borderRadius: '14px', overflow: 'hidden', border: `1px solid ${BORDER}` }}>
              <div style={{ height: '10px', background: 'linear-gradient(135deg,#FF6B35,#E85A24)' }} />
              <div style={{ padding: '6px 0' }}>
                {/* نعرض دائماً بالمعاينة (show:true) ليرى المشرف الشكل حتى لو الإظهار مُطفأ */}
                <MenuBranding branding={{ show: true, text: form.text, url: form.url, variant: form.variant, placement: form.placement }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  )
}
