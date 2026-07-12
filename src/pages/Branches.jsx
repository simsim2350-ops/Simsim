import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'
import AppShell from '../components/AppShell'
import ConfirmDialog from '../components/ConfirmDialog'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { fetchBranches, createBranch, updateBranch, deleteBranch, cloneMenuToBranch } from '../lib/branchesApi'

function Spinner() {
  return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#0F1117', color:'white', gap:'16px', fontFamily:'Cairo,sans-serif' }}>
      <div style={{ width:'44px', height:'44px', border:'3px solid rgba(255,107,53,0.3)', borderTopColor:'#FF6B35', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      جارٍ التحميل...
    </div>
  )
}

const inputStyle = {
  width:'100%', padding:'11px 13px',
  border:'1.5px solid #E5E7EB', borderRadius:'11px',
  fontFamily:'Tajawal,sans-serif', fontSize:'14px',
  outline:'none', boxSizing:'border-box',
}
const labelStyle = { display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px', color:'#374151' }

const DAY_LABELS = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت']
const defaultHours = () => DAY_LABELS.map((day, i) => ({ day, open: i !== 6, from: i === 5 ? '12:00' : '09:00', to: i === 5 ? '24:00' : '23:00' }))
const toEditorHours = (oh) => (Array.isArray(oh) && oh.length === 7)
  ? oh.map((h, i) => ({ day: DAY_LABELS[i], open: !!h.open, from: h.from || '09:00', to: h.to || '23:00' }))
  : defaultHours()

const EMPTY_FORM = {
  name:'', name_en:'', address:'', address_en:'', phone:'', maps_url:'', is_active:true, hours: defaultHours(),
  deliveryOverride:false, delivery_enabled:false, delivery_fee:'', takeaway_enabled:true,
}

export default function Branches() {
  const navigate = useNavigate()
  const { restaurant } = useAuthStore()
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  useBodyScrollLock(modalOpen)
  const [editingBranch, setEditingBranch] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => {
    if (!restaurant) return
    loadBranches()
  }, [restaurant])

  const loadBranches = async () => {
    setLoading(true)
    try {
      const list = await fetchBranches(restaurant.id)
      setBranches(list)
    } finally {
      setLoading(false)
    }
  }

  const openAdd = () => {
    setEditingBranch(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  const openEdit = (branch) => {
    setEditingBranch(branch)
    setForm({
      name: branch.name,
      name_en: branch.name_en || '',
      address: branch.address || '',
      address_en: branch.address_en || '',
      phone: branch.phone || '',
      maps_url: branch.maps_url || '',
      is_active: branch.is_active,
      hours: toEditorHours(branch.opening_hours),
      deliveryOverride: branch.delivery_enabled != null,
      delivery_enabled: branch.delivery_enabled ?? false,
      delivery_fee: branch.delivery_fee != null ? String(branch.delivery_fee) : '',
      takeaway_enabled: branch.takeaway_enabled ?? true,
    })
    setModalOpen(true)
  }

  const updateHour = (i, field, val) => {
    setForm(f => ({ ...f, hours: f.hours.map((h, idx) => idx === i ? { ...h, [field]: val } : h) }))
  }

  const saveBranch = async () => {
    if (!form.name.trim()) { toast.error('أدخل اسم الفرع'); return }
    const deliveryFields = form.deliveryOverride
      ? { delivery_enabled: form.delivery_enabled, delivery_fee: Number(form.delivery_fee) || 0 }
      : { delivery_enabled: null, delivery_fee: null }
    setSaving(true)
    try {
      if (editingBranch) {
        await updateBranch(editingBranch.id, {
          name: form.name, name_en: form.name_en || null,
          address: form.address, address_en: form.address_en || null,
          phone: form.phone, maps_url: form.maps_url, is_active: form.is_active,
          opening_hours: form.hours,
          ...deliveryFields, takeaway_enabled: form.takeaway_enabled,
        })
        toast.success('تم تحديث الفرع ✅')
      } else {
        const primary = branches.find(b => b.is_primary)
        const newBranch = await createBranch(restaurant.id, {
          name: form.name, name_en: form.name_en || null,
          address: form.address, address_en: form.address_en || null,
          phone: form.phone, maps_url: form.maps_url, is_active: form.is_active,
          opening_hours: form.hours,
          ...deliveryFields, takeaway_enabled: form.takeaway_enabled,
          sort_order: branches.length,
        })
        // نسخ منيو الفرع الأساسي بالكامل — نسخة مستقلة قابلة للتعديل بحرية من الآن
        if (primary) {
          try {
            await cloneMenuToBranch(primary.id, newBranch.id, restaurant.id)
          } catch (cloneErr) {
            toast.error('تم إضافة الفرع، لكن تعذّر نسخ المنيو إليه — راجع المنيو يدوياً')
            console.error('Clone menu error:', cloneErr)
          }
        }
        toast.success('تم إضافة الفرع ونسخ المنيو إليه 🎉')
      }
      setModalOpen(false)
      loadBranches()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const removeBranch = async (branch) => {
    try {
      await deleteBranch(branch.id)
      toast.success('تم حذف الفرع')
      loadBranches()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const toggleActive = async (branch) => {
    await updateBranch(branch.id, { is_active: !branch.is_active })
    loadBranches()
    toast.success(branch.is_active ? 'تم تعطيل الفرع 🚫' : 'تم تفعيل الفرع ✅')
  }

  const togglePaused = async (branch) => {
    await updateBranch(branch.id, { is_paused: !branch.is_paused })
    loadBranches()
    toast.success(branch.is_paused ? 'تم إلغاء الإغلاق المؤقت ✅' : 'تم إغلاق الفرع مؤقتاً 🚫')
  }

  const branchMenuURL = (branch) => restaurant
    ? `${window.location.origin}/menu/${restaurant.slug}?branch=${branch.id}`
    : ''

  const copyBranchURL = async (branch) => {
    const url = branchMenuURL(branch)
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = url
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      toast.success('تم نسخ رابط الفرع 📋')
    } catch {
      toast.error('تعذّر النسخ، انسخه يدوياً')
    }
  }

  if (loading) return <Spinner />

  return (
    <AppShell
      active="branches"
      title="🏢 الفروع"
      actions={<>
        <button onClick={() => navigate('/dashboard')} style={{ padding:'7px 12px', borderRadius:'9px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Cairo,sans-serif', fontWeight:'600', fontSize:'12px', cursor:'pointer', color:'#374151' }}>← الرئيسية</button>
        <button onClick={openAdd} style={{ padding:'7px 14px', borderRadius:'9px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer' }}>＋ فرع جديد</button>
      </>}
    >
        <div style={{ flex:1, overflowY:'auto', padding:'16px' }}>
          <div style={{ maxWidth:'700px', margin:'0 auto' }}>

            <div style={{ background:'#FFF7ED', border:'1px solid #FED7AA', borderRadius:'12px', padding:'12px 14px', marginBottom:'14px', fontSize:'12.5px', color:'#9A3412' }}>
              💡 عند إضافة فرع جديد، يُنسَخ منيو الفرع الرئيسي إليه تلقائياً بالكامل، ثم يصبح قابلاً للتعديل بحرية تامة بلا أي تأثير على الفروع الأخرى.
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
              {branches.map(branch => (
                <div key={branch.id} style={{ background:'white', borderRadius:'14px', border: branch.is_primary ? '1.5px solid #FED7AA' : '1.5px solid #E5E7EB', padding:'14px 16px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'10px' }}>
                    <div style={{ width:'40px', height:'40px', borderRadius:'10px', background: branch.is_primary ? '#FFF0EB' : '#F8F9FB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', flexShrink:0 }}>
                      {branch.is_primary ? '🏠' : '🏢'}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap' }}>
                        <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'15px' }}>{branch.name}</span>
                        {branch.is_primary && <span style={{ fontSize:'10px', fontWeight:'700', color:'#C2410C', background:'#FFEDD5', padding:'2px 7px', borderRadius:'100px' }}>الفرع الرئيسي</span>}
                        {!branch.is_active && <span style={{ fontSize:'10px', fontWeight:'700', color:'#9CA3AF', background:'#F3F4F6', padding:'2px 7px', borderRadius:'100px' }}>معطّل</span>}
                        {branch.is_paused && <span style={{ fontSize:'10px', fontWeight:'700', color:'#92400E', background:'#FEF3C7', padding:'2px 7px', borderRadius:'100px' }}>مغلق مؤقتاً</span>}
                      </div>
                      {branch.address && <div style={{ fontSize:'12px', color:'#9CA3AF' }}>📍 {branch.address}</div>}
                    </div>
                    <div style={{ display:'flex', gap:'5px', flexShrink:0 }}>
                      {!branch.is_primary && (
                        <button onClick={() => toggleActive(branch)} style={{ padding:'5px 8px', borderRadius:'8px', border:'1.5px solid #E5E7EB', background: branch.is_active ? '#D1FAE5' : '#F3F4F6', color: branch.is_active ? '#065F46' : '#6B7280', fontSize:'11px', fontWeight:'700', cursor:'pointer' }}>
                          {branch.is_active ? '👁️' : '🚫'}
                        </button>
                      )}
                      <button onClick={() => togglePaused(branch)} style={{ padding:'5px 8px', borderRadius:'8px', border:'1.5px solid #E5E7EB', background: branch.is_paused ? '#FEF3C7' : '#F3F4F6', color: branch.is_paused ? '#92400E' : '#6B7280', fontSize:'11px', fontWeight:'700', cursor:'pointer' }} title="إغلاق مؤقت فوري">
                        {branch.is_paused ? '▶️' : '⏸️'}
                      </button>
                      <button onClick={() => openEdit(branch)} style={{ width:'30px', height:'30px', borderRadius:'8px', border:'1.5px solid #E5E7EB', background:'white', cursor:'pointer', fontSize:'13px' }}>✏️</button>
                      {!branch.is_primary && (
                        <button onClick={() => setConfirmDelete(branch)} style={{ width:'30px', height:'30px', borderRadius:'8px', border:'1.5px solid #FEE2E2', background:'#FEF2F2', cursor:'pointer', fontSize:'13px' }}>🗑️</button>
                      )}
                    </div>
                  </div>

                  {branch.phone && <div style={{ fontSize:'12px', color:'#9CA3AF', marginBottom:'10px' }}>📱 {branch.phone}</div>}

                  <div style={{ display:'flex', gap:'8px', alignItems:'center', background:'#F8F9FB', borderRadius:'10px', padding:'8px 10px' }}>
                    <span style={{ fontSize:'11px', color:'#9CA3AF', direction:'ltr', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{branchMenuURL(branch).replace('https://','')}</span>
                    <button onClick={() => copyBranchURL(branch)} style={{ padding:'5px 10px', borderRadius:'7px', border:'none', background:'#FF6B35', color:'white', fontSize:'11px', fontWeight:'700', cursor:'pointer', flexShrink:0 }}>نسخ الرابط</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      {modalOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div onClick={() => setModalOpen(false)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)' }}/>
          <div style={{ background:'white', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:'480px', padding:'20px', position:'relative', maxHeight:'85vh', overflowY:'auto' }}>
            <h3 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'18px', marginBottom:'16px' }}>
              {editingBranch ? 'تعديل الفرع' : 'فرع جديد'}
            </h3>

            <div style={{ marginBottom:'14px' }}>
              <label style={labelStyle}>اسم الفرع *</label>
              <input style={inputStyle} value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} placeholder="مثال: فرع الرياض - النزهة" />
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={{ ...labelStyle, color:'#6B7280' }}>🇬🇧 اسم الفرع (إنجليزي) — اختياري</label>
              <input style={{ ...inputStyle, direction:'ltr', textAlign:'left' }} value={form.name_en} onChange={e => setForm(f=>({...f,name_en:e.target.value}))} placeholder="e.g. Riyadh - Al Nuzha Branch" />
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={labelStyle}>العنوان</label>
              <input style={inputStyle} value={form.address} onChange={e => setForm(f=>({...f,address:e.target.value}))} placeholder="الحي، الشارع..." />
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={{ ...labelStyle, color:'#6B7280' }}>🇬🇧 العنوان (إنجليزي) — اختياري</label>
              <input style={{ ...inputStyle, direction:'ltr', textAlign:'left' }} value={form.address_en} onChange={e => setForm(f=>({...f,address_en:e.target.value}))} placeholder="District, street..." />
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={labelStyle}>رقم تواصل الفرع (اختياري)</label>
              <input style={{ ...inputStyle, direction:'ltr', textAlign:'left' }} value={form.phone} onChange={e => setForm(f=>({...f,phone:e.target.value}))} placeholder="9665XXXXXXXX" />
            </div>

            <div style={{ marginBottom:'18px' }}>
              <label style={labelStyle}>رابط خرائط جوجل (اختياري)</label>
              <input style={{ ...inputStyle, direction:'ltr', textAlign:'left' }} value={form.maps_url} onChange={e => setForm(f=>({...f,maps_url:e.target.value}))} placeholder="https://maps.google.com/..." />
            </div>

            <div style={{ marginBottom:'18px' }}>
              <label style={labelStyle}>🕐 أوقات عمل الفرع</label>
              <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                {form.hours.map((h, i) => (
                  <div key={h.day} style={{ display:'flex', alignItems:'center', gap:'6px', padding:'8px 9px', borderRadius:'11px', border:'1.5px solid #E5E7EB', background: h.open ? 'white' : '#F8F9FB' }}>
                    <label style={{ position:'relative', width:'34px', height:'19px', cursor:'pointer', flexShrink:0 }}>
                      <input type="checkbox" checked={h.open} onChange={e => updateHour(i,'open',e.target.checked)} style={{ opacity:0, width:0, height:0, position:'absolute' }}/>
                      <div style={{ position:'absolute', inset:0, background: h.open ? '#10B981' : '#E5E7EB', borderRadius:'19px', transition:'0.3s' }}>
                        <div style={{ position:'absolute', width:'13px', height:'13px', background:'white', borderRadius:'50%', top:'3px', left: h.open ? '18px' : '3px', transition:'0.3s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
                      </div>
                    </label>
                    <span style={{ fontSize:'12.5px', fontWeight:'700', width:'42px', flexShrink:0, color: h.open ? '#0F1117' : '#9CA3AF' }}>{h.day}</span>
                    {h.open ? (
                      <div style={{ display:'flex', alignItems:'center', gap:'4px', flex:1, justifyContent:'flex-end', direction:'ltr', minWidth:0 }}>
                        <input type="time" value={h.from} onChange={e => updateHour(i,'from',e.target.value)} style={{ padding:'5px 4px', border:'1.5px solid #E5E7EB', borderRadius:'8px', fontFamily:'Tajawal,sans-serif', fontSize:'11.5px', outline:'none', width:'78px', minWidth:0 }}/>
                        <span style={{ color:'#9CA3AF', fontSize:'11px', flexShrink:0 }}>—</span>
                        <input type="time" value={h.to} onChange={e => updateHour(i,'to',e.target.value)} style={{ padding:'5px 4px', border:'1.5px solid #E5E7EB', borderRadius:'8px', fontFamily:'Tajawal,sans-serif', fontSize:'11.5px', outline:'none', width:'78px', minWidth:0 }}/>
                      </div>
                    ) : (
                      <span style={{ fontSize:'13px', color:'#9CA3AF', flex:1 }}>مغلق</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom:'18px', padding:'12px 14px', background:'#F8F9FB', borderRadius:'11px' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: form.deliveryOverride ? '12px' : 0 }}>
                <span style={{ fontSize:'13px', fontWeight:'700' }}>🛵 تخصيص إعداد التوصيل لهذا الفرع</span>
                <label style={{ position:'relative', width:'46px', height:'25px', cursor:'pointer', flexShrink:0 }}>
                  <input type="checkbox" checked={form.deliveryOverride} onChange={e => setForm(f=>({...f,deliveryOverride:e.target.checked}))} style={{ opacity:0, width:0, height:0, position:'absolute' }}/>
                  <div style={{ position:'absolute', inset:0, background: form.deliveryOverride ? '#10B981' : '#E5E7EB', borderRadius:'26px', transition:'0.3s' }}>
                    <div style={{ position:'absolute', width:'19px', height:'19px', background:'white', borderRadius:'50%', top:'3px', left: form.deliveryOverride ? '24px' : '3px', transition:'0.3s', boxShadow:'0 1px 4px rgba(0,0,0,0.2)' }}/>
                  </div>
                </label>
              </div>
              {!form.deliveryOverride && (
                <div style={{ fontSize:'11.5px', color:'#9CA3AF' }}>يرث هذا الفرع إعداد التوصيل من إعدادات المطعم العامة.</div>
              )}
              {form.deliveryOverride && (
                <>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' }}>
                    <span style={{ fontSize:'13px' }}>تفعيل التوصيل لهذا الفرع</span>
                    <label style={{ position:'relative', width:'40px', height:'22px', cursor:'pointer', flexShrink:0 }}>
                      <input type="checkbox" checked={form.delivery_enabled} onChange={e => setForm(f=>({...f,delivery_enabled:e.target.checked}))} style={{ opacity:0, width:0, height:0, position:'absolute' }}/>
                      <div style={{ position:'absolute', inset:0, background: form.delivery_enabled ? '#10B981' : '#E5E7EB', borderRadius:'22px', transition:'0.3s' }}>
                        <div style={{ position:'absolute', width:'16px', height:'16px', background:'white', borderRadius:'50%', top:'3px', left: form.delivery_enabled ? '21px' : '3px', transition:'0.3s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
                      </div>
                    </label>
                  </div>
                  {form.delivery_enabled && (
                    <div>
                      <label style={{ ...labelStyle, color:'#6B7280' }}>رسوم التوصيل (﷼)</label>
                      <input type="number" min="0" step="0.5" style={inputStyle} value={form.delivery_fee} onChange={e => setForm(f=>({...f,delivery_fee:e.target.value}))} placeholder="0" />
                    </div>
                  )}
                </>
              )}
            </div>

            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'18px', padding:'12px 14px', background:'#F8F9FB', borderRadius:'11px' }}>
              <span style={{ fontSize:'13px', fontWeight:'700' }}>🥡 السماح بطلبات الاستلام لهذا الفرع</span>
              <label style={{ position:'relative', width:'46px', height:'25px', cursor:'pointer', flexShrink:0 }}>
                <input type="checkbox" checked={form.takeaway_enabled} onChange={e => setForm(f=>({...f,takeaway_enabled:e.target.checked}))} style={{ opacity:0, width:0, height:0, position:'absolute' }}/>
                <div style={{ position:'absolute', inset:0, background: form.takeaway_enabled ? '#10B981' : '#E5E7EB', borderRadius:'26px', transition:'0.3s' }}>
                  <div style={{ position:'absolute', width:'19px', height:'19px', background:'white', borderRadius:'50%', top:'3px', left: form.takeaway_enabled ? '24px' : '3px', transition:'0.3s', boxShadow:'0 1px 4px rgba(0,0,0,0.2)' }}/>
                </div>
              </label>
            </div>

            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'20px', padding:'12px 14px', background:'#F8F9FB', borderRadius:'11px' }}>
              <span style={{ fontSize:'13px', fontWeight:'700' }}>تفعيل الفرع</span>
              <label style={{ position:'relative', width:'46px', height:'25px', cursor:'pointer', flexShrink:0 }}>
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f=>({...f,is_active:e.target.checked}))} style={{ opacity:0, width:0, height:0, position:'absolute' }}/>
                <div style={{ position:'absolute', inset:0, background: form.is_active ? '#10B981' : '#E5E7EB', borderRadius:'26px', transition:'0.3s' }}>
                  <div style={{ position:'absolute', width:'19px', height:'19px', background:'white', borderRadius:'50%', top:'3px', left: form.is_active ? '24px' : '3px', transition:'0.3s', boxShadow:'0 1px 4px rgba(0,0,0,0.2)' }}/>
                </div>
              </label>
            </div>

            {!editingBranch && (
              <div style={{ fontSize:'11.5px', color:'#9CA3AF', marginTop:'-10px', marginBottom:'16px' }}>
                سيُنسخ منيو الفرع الرئيسي بالكامل لهذا الفرع الجديد فور الإضافة.
              </div>
            )}

            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => setModalOpen(false)} style={{ flex:1, padding:'13px', borderRadius:'12px', border:'1.5px solid #E5E7EB', background:'white', color:'#374151', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'14px', cursor:'pointer' }}>
                إلغاء
              </button>
              <button onClick={saveBranch} disabled={saving} style={{ flex:2, padding:'13px', borderRadius:'12px', border:'none', background: saving ? '#9CA3AF' : 'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'14px', cursor: saving ? 'default' : 'pointer' }}>
                {saving ? 'جارٍ الحفظ...' : (editingBranch ? 'حفظ التعديلات' : 'إضافة الفرع ونسخ المنيو')}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="حذف الفرع"
        body={confirmDelete ? `حذف فرع "${confirmDelete.name}"؟ سيُحذف منيو هذا الفرع بالكامل معه، والطلبات المرتبطة به ستفقد ربطها بالفرع لكنها لن تُحذف.` : ''}
        confirmLabel="حذف"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => { removeBranch(confirmDelete); setConfirmDelete(null) }}
      />
    </AppShell>
  )
}
