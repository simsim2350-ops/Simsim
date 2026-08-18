import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'
import AppShell from '../components/AppShell'
import ConfirmDialog from '../components/ConfirmDialog'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { fetchBranches, createBranch, updateBranch, deleteBranch, cloneMenuToBranch } from '../lib/branchesApi'

function Icon({ type, size=16 }) {
  const paths = {
    branch:'M4 20V4h16v16M8 8h2M14 8h2M8 12h2M14 12h2M8 16h2M14 16h2',
    plus:'M12 5v14M5 12h14', back:'M19 12H5m6-6l-6 6 6 6', info:'M12 8h.01M11 12h1v4h1M12 3a9 9 0 100 18 9 9 0 000-18',
    pin:'M12 21s7-5.2 7-12a7 7 0 10-14 0c0 6.8 7 12 7 12zM12 12a3 3 0 100-6 3 3 0 000 6z',
    phone:'M6.6 3.5l2.3-.5 1.6 4-1.7 1a14 14 0 007 7l1-1.7 4 1.6-.5 2.3a2 2 0 01-2 1.6C10.2 18.8 5.2 13.8 5 6.7a2 2 0 011.6-3.2',
    link:'M10 13a5 5 0 007.1.1l2-2a5 5 0 00-7.1-7.1l-1.1 1.1M14 11a5 5 0 00-7.1-.1l-2 2A5 5 0 0012 20l1.1-1.1',
    more:'M12 5h.01M12 12h.01M12 19h.01', menu:'M4 6h16M4 12h16M4 18h16', edit:'M4 20h4l10-10-4-4L4 16v4zM13 7l4 4', eye:'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zm10 3a3 3 0 100-6 3 3 0 000 6z',
    toggle:'M7 12l3 3 7-7', trash:'M4 7h16M10 11v5m4-5v5M9 7l1-3h4l1 3m-9 0l1 14h10l1-14', copy:'M9 9h10v11H9zM5 5h10v4',
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[type] || paths.branch}/></svg>
}

function Spinner() {
  return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#0B0B0F', color:'white', gap:'16px', fontFamily:'Tajawal,sans-serif' }}>
      <div style={{ width:'44px', height:'44px', border:'3px solid rgba(255,106,0,0.3)', borderTopColor:'#FF6A00', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
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
  const { isMobile, isDesktop } = useBreakpoint()
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  useBodyScrollLock(modalOpen)
  const [editingBranch, setEditingBranch] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [modalTab, setModalTab] = useState('details')
  const [retryingBranchId, setRetryingBranchId] = useState(null)

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
    setModalTab('details')
    setModalOpen(true)
  }

  const openEdit = (branch) => {
    setEditingBranch(branch)
    setModalTab('details')
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
          menu_clone_status: primary ? 'copying' : 'ready',
          menu_clone_error: null,
          sort_order: branches.length,
        })
        // RPC ذرية: لا يصبح الفرع جاهزاً إلا حين تنجح الأقسام والأصناف معاً.
        if (primary) {
          try {
            await cloneMenuToBranch(primary.id, newBranch.id, restaurant.id)
            await updateBranch(newBranch.id, { menu_clone_status:'ready', menu_clone_error:null })
            toast.success('تم إضافة الفرع ونسخ المنيو إليه 🎉')
          } catch (cloneErr) {
            await updateBranch(newBranch.id, { menu_clone_status:'failed', menu_clone_error:(cloneErr?.message || 'clone_failed').slice(0, 240) }).catch(() => {})
            toast.error('أُضيف الفرع لكن نسخة المنيو تحتاج إعادة محاولة قبل نشره.')
          }
        } else {
          toast.success('تم إضافة الفرع ✅')
        }
      }
      setModalOpen(false)
      loadBranches()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const retryBranchMenu = async (branch) => {
    const primary = branches.find(item => item.is_primary)
    if (!primary || primary.id === branch.id) {
      toast.error('لا يوجد فرع رئيسي صالح لنسخ المنيو منه')
      return
    }
    setRetryingBranchId(branch.id)
    try {
      await updateBranch(branch.id, { menu_clone_status:'copying', menu_clone_error:null })
      await cloneMenuToBranch(primary.id, branch.id, restaurant.id, true)
      await updateBranch(branch.id, { menu_clone_status:'ready', menu_clone_error:null })
      toast.success('اكتملت نسخة المنيو وأصبح الفرع جاهزًا ✅')
      await loadBranches()
    } catch (error) {
      await updateBranch(branch.id, { menu_clone_status:'failed', menu_clone_error:(error?.message || 'clone_failed').slice(0, 240) }).catch(() => {})
      toast.error('تعذّرت إعادة النسخ. جرّب مرة أخرى أو راجع المنيو.')
      await loadBranches()
    } finally {
      setRetryingBranchId(null)
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

  const previewBranchMenu = (branch) => window.open(branchMenuURL(branch), '_blank', 'noopener,noreferrer')

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

  const PageTitle = <span style={{ display:'inline-flex', alignItems:'center', gap:'10px', minWidth:0 }}><span style={{ width:isMobile?'42px':'44px', height:isMobile?'42px':'44px', borderRadius:'12px', display:'grid', placeItems:'center', color:'#FF6A00', background:'#FFF0EB', border:'1px solid #FFD4BE', flexShrink:0 }}><Icon type="branch" size={20}/></span><span style={{ display:'flex', flexDirection:'column', gap:'2px', minWidth:0 }}><strong style={{ fontSize:isMobile?'18px':'22px', fontWeight:'900', letterSpacing:'-0.025em', lineHeight:1.15 }}>الفروع</strong><small style={{ fontSize:isMobile?'10px':'11px', color:'#9CA3AF', fontWeight:'600', whiteSpace:'nowrap' }}>إدارة فروع المطعم ومنيوهاتها</small></span></span>

  const BranchCard = ({ branch }) => {
    const cloneStatus = branch.menu_clone_status || 'ready'
    const cloneReady = cloneStatus === 'ready'
    const branchIsLive = branch.is_active && !branch.is_paused && cloneReady
    const isMenuOpen = openMenuId === branch.id
    const runMenuAction = action => { setOpenMenuId(null); action() }
    return <div style={{ position:'relative', background:'white', borderRadius:'15px', border:branch.is_primary?'1px solid #FFD4BE':'1px solid #E7E9ED', boxShadow:'0 2px 10px rgba(17,24,39,0.035)', padding:isMobile?'14px':'16px', display:'flex', flexDirection:'column', minHeight:isDesktop?'246px':'auto' }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:'10px', marginBottom:'14px' }}>
        <span style={{ width:'38px', height:'38px', borderRadius:'11px', display:'grid', placeItems:'center', color:branch.is_primary?'#FF6A00':'#5B6472', background:branch.is_primary?'#FFF0EB':'#F4F6F8', flexShrink:0 }}><Icon type="branch" size={18}/></span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap', marginBottom:'5px' }}><strong style={{ fontSize:'15px', fontWeight:'900', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{branch.name}</strong>{branch.is_primary ? <span style={{ fontSize:'10px', fontWeight:'800', color:'#C2410C', background:'#FFF0EB', border:'1px solid #FFD4BE', padding:'3px 7px', borderRadius:'999px' }}>الفرع الرئيسي</span> : <span style={{ fontSize:'10px', fontWeight:'800', color:'#6B7280', background:'#F4F6F8', padding:'3px 7px', borderRadius:'999px' }}>فرع</span>}</div>
          <span style={{ display:'inline-flex', alignItems:'center', gap:'5px', fontSize:'10px', fontWeight:'800', color:branchIsLive?'#047857':'#9A3412', background:branchIsLive?'#ECFDF5':'#FFF7ED', padding:'3px 7px', borderRadius:'999px' }}><i style={{ width:'6px', height:'6px', borderRadius:'50%', background:branchIsLive?'#10B981':'#F97316' }}/>{cloneStatus === 'copying' ? 'جارٍ نسخ المنيو' : cloneStatus === 'failed' ? 'المنيو يحتاج إصلاحًا' : (branchIsLive ? 'نشط' : (branch.is_paused ? 'متوقف مؤقتًا' : 'متوقف'))}</span>
        </div>
        <button aria-label="إجراءات الفرع" onClick={() => setOpenMenuId(isMenuOpen ? null : branch.id)} style={{ width:'36px', height:'36px', borderRadius:'9px', border:'1px solid #E5E7EB', background:'white', color:'#6B7280', display:'grid', placeItems:'center', cursor:'pointer', flexShrink:0 }}><Icon type="more" size={18}/></button>
      </div>
      <div style={{ display:'grid', gap:'8px', marginBottom:'16px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'7px', color:'#6B7280', fontSize:'12px', minWidth:0 }}><Icon type="pin" size={14}/><span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{branch.address || 'العنوان غير مضاف'}</span></div>
        <div style={{ display:'flex', alignItems:'center', gap:'7px', color:'#6B7280', fontSize:'12px', minWidth:0 }}><Icon type="phone" size={14}/><span dir="ltr">{branch.phone || 'رقم الهاتف غير مضاف'}</span></div>
      </div>
      {cloneStatus === 'failed' && <button onClick={() => retryBranchMenu(branch)} disabled={retryingBranchId === branch.id} style={{ width:'100%', minHeight:'38px', marginBottom:'8px', borderRadius:'10px', border:'1px solid #F59E0B', background:'#FFFBEB', color:'#B45309', fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'12px', cursor:'pointer' }}>{retryingBranchId === branch.id ? 'جارٍ إعادة النسخ...' : 'إعادة محاولة نسخ المنيو'}</button>}
      <div style={{ display:'flex', alignItems:'center', gap:'7px', marginTop:'auto', paddingTop:'12px', borderTop:'1px solid #F1F3F5' }}>
        <button disabled={!cloneReady} onClick={() => cloneReady && previewBranchMenu(branch)} style={{ minHeight:'38px', flex:1, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:'6px', borderRadius:'10px', border:'1px solid #FF6A00', background:cloneReady?'#FF6A00':'#F3F4F6', color:cloneReady?'white':'#9CA3AF', fontFamily:'Tajawal,sans-serif', fontSize:'12px', fontWeight:'900', cursor:cloneReady?'pointer':'not-allowed' }}><Icon type="eye" size={14}/> فتح المنيو</button>
        <button disabled={!cloneReady} onClick={() => cloneReady && copyBranchURL(branch)} style={{ minHeight:'38px', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:'6px', borderRadius:'10px', border:'1px solid #E5E7EB', background:'white', color:cloneReady?'#374151':'#9CA3AF', fontFamily:'Tajawal,sans-serif', fontSize:'12px', fontWeight:'800', cursor:cloneReady?'pointer':'not-allowed', padding:'7px 10px' }}><Icon type="copy" size={14}/> نسخ الرابط</button>
      </div>
      {isMenuOpen && <div style={{ position:'absolute', top:'56px', left:'14px', zIndex:10, minWidth:'178px', padding:'6px', border:'1px solid #E5E7EB', borderRadius:'12px', background:'white', boxShadow:'0 10px 28px rgba(17,24,39,0.14)' }}>
        {[["edit",'تعديل الفرع',() => openEdit(branch)],['eye','معاينة المنيو',() => previewBranchMenu(branch)],['copy','نسخ الرابط',() => copyBranchURL(branch)],['toggle',branch.is_paused?'إلغاء الإغلاق المؤقت':'إغلاق مؤقت',() => togglePaused(branch)], ...(!branch.is_primary ? [['toggle',branch.is_active?'تعطيل الفرع':'تفعيل الفرع',() => toggleActive(branch)],['trash','حذف الفرع',() => setConfirmDelete(branch)]] : [])].map(([icon,label,action], index) => <button key={`${label}-${index}`} onClick={() => runMenuAction(action)} style={{ width:'100%', display:'flex', alignItems:'center', gap:'8px', padding:'9px 10px', border:0, borderRadius:'8px', background:'transparent', color:label === 'حذف الفرع' ? '#B91C1C' : '#374151', fontFamily:'Tajawal,sans-serif', fontWeight:'700', fontSize:'12px', textAlign:'right', cursor:'pointer' }}><Icon type={icon} size={14}/>{label}</button>)}
      </div>}
    </div>
  }

  if (loading) return <Spinner />

  return (
    <AppShell
      active="branches"
      title={PageTitle}
      headerStacked
      actions={<div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'8px', width:'100%' }}>
        <button onClick={() => navigate('/dashboard')} style={{ minHeight:'38px', display:'inline-flex', alignItems:'center', gap:'6px', padding:'7px 11px', borderRadius:'10px', border:'1px solid #E5E7EB', background:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'12px', cursor:'pointer', color:'#374151' }}><Icon type="back" size={14}/> الرئيسية</button>
        <button onClick={openAdd} style={{ minHeight:'38px', display:'inline-flex', alignItems:'center', gap:'6px', padding:'7px 13px', borderRadius:'10px', border:'1px solid #FF6A00', background:'#FF6A00', color:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'12px', cursor:'pointer' }}><Icon type="plus" size={14}/> فرع جديد</button>
      </div>}
    >
        <div style={{ flex:1, overflowY:'auto', padding:isDesktop?'24px':'16px', background:'#F8F9FB' }} onClick={() => openMenuId && setOpenMenuId(null)}>
          <div style={{ maxWidth:'1120px', margin:'0 auto', paddingBottom:isMobile?'8px':'12px' }}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:'9px', padding:'10px 12px', marginBottom:'14px', borderRadius:'12px', background:'#FFF9F4', border:'1px solid #FDE2CD', color:'#9A3412' }}>
              <span style={{ width:'24px', height:'24px', display:'grid', placeItems:'center', borderRadius:'7px', background:'#FFF0E6', flexShrink:0 }}><Icon type="info" size={13}/></span>
              <div><strong style={{ display:'block', fontSize:'11.5px', marginBottom:'2px' }}>نسخ المنيو تلقائيًا</strong><span style={{ fontSize:'10.5px', lineHeight:1.55, color:'#A8551E' }}>عند إضافة فرع جديد يتم نسخ منيو الفرع الرئيسي إليه بالكامل، ثم يصبح قابلًا للتعديل بحرية تامة دون أي تأثير على الفروع الأخرى.</span></div>
            </div>
            {branches.length === 0 ? <div style={{ minHeight:'260px', display:'grid', placeItems:'center', textAlign:'center', background:'white', border:'1px dashed #D8DCE3', borderRadius:'16px', padding:'30px' }}><div><span style={{ width:'48px', height:'48px', display:'grid', placeItems:'center', margin:'0 auto 12px', borderRadius:'14px', background:'#FFF0EB', color:'#FF6A00' }}><Icon type="branch" size={22}/></span><strong style={{ display:'block', fontSize:'15px', marginBottom:'5px' }}>لا توجد فروع بعد</strong><span style={{ display:'block', fontSize:'12px', color:'#6B7280', marginBottom:'14px' }}>أضف أول فرع لبدء إدارة منيوهات فروعك.</span><button onClick={openAdd} style={{ minHeight:'38px', display:'inline-flex', alignItems:'center', gap:'6px', padding:'7px 13px', borderRadius:'10px', border:'1px solid #FF6A00', background:'#FF6A00', color:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'12px', cursor:'pointer' }}><Icon type="plus" size={14}/> إضافة فرع</button></div></div> : <div style={{ display:'grid', gridTemplateColumns:isDesktop?'repeat(auto-fit,minmax(300px,1fr))':'1fr', gap:isMobile?'12px':'14px' }}>{branches.map(branch => <BranchCard key={branch.id} branch={branch} />)}</div>}
          </div>
        </div>

      {modalOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div onClick={() => setModalOpen(false)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)' }}/>
          <div style={{ background:'white', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:'480px', padding:'20px', position:'relative', maxHeight:'85vh', overflowY:'auto' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'10px', marginBottom:'14px' }}><h3 style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'18px', margin:0 }}>{editingBranch ? 'تعديل الفرع' : 'فرع جديد'}</h3><button aria-label="إغلاق" onClick={() => setModalOpen(false)} style={{ width:'34px', height:'34px', border:'1px solid #E5E7EB', borderRadius:'9px', background:'white', color:'#6B7280', display:'grid', placeItems:'center', cursor:'pointer' }}>×</button></div>
            <div style={{ display:'flex', gap:'4px', padding:'4px', marginBottom:'16px', background:'#F5F6F8', borderRadius:'11px' }}><button onClick={() => setModalTab('details')} style={{ flex:1, minHeight:'34px', border:0, borderRadius:'8px', background:modalTab==='details'?'white':'transparent', color:modalTab==='details'?'#FF6A00':'#6B7280', boxShadow:modalTab==='details'?'0 1px 4px rgba(17,24,39,0.08)':'none', fontFamily:'Tajawal,sans-serif', fontSize:'12px', fontWeight:'900', cursor:'pointer' }}>معلومات الفرع</button><button onClick={() => setModalTab('operations')} style={{ flex:1, minHeight:'34px', border:0, borderRadius:'8px', background:modalTab==='operations'?'white':'transparent', color:modalTab==='operations'?'#FF6A00':'#6B7280', boxShadow:modalTab==='operations'?'0 1px 4px rgba(17,24,39,0.08)':'none', fontFamily:'Tajawal,sans-serif', fontSize:'12px', fontWeight:'900', cursor:'pointer' }}>التشغيل والطلبات</button></div>

            {modalTab === 'details' && <>
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

            </>}
            {modalTab === 'operations' && <>
            <div style={{ marginBottom:'18px' }}>
              <label style={labelStyle}>أوقات عمل الفرع</label>
              <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                {form.hours.map((h, i) => (
                  <div key={h.day} style={{ display:'flex', alignItems:'center', gap:'6px', padding:'8px 9px', borderRadius:'11px', border:'1.5px solid #E5E7EB', background: h.open ? 'white' : '#F8F9FB' }}>
                    <label style={{ position:'relative', width:'34px', height:'19px', cursor:'pointer', flexShrink:0 }}>
                      <input type="checkbox" checked={h.open} onChange={e => updateHour(i,'open',e.target.checked)} style={{ opacity:0, width:0, height:0, position:'absolute' }}/>
                      <div style={{ position:'absolute', inset:0, background: h.open ? '#10B981' : '#E5E7EB', borderRadius:'19px', transition:'0.3s' }}>
                        <div style={{ position:'absolute', width:'13px', height:'13px', background:'white', borderRadius:'50%', top:'3px', left: h.open ? '18px' : '3px', transition:'0.3s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
                      </div>
                    </label>
                    <span style={{ fontSize:'12.5px', fontWeight:'700', width:'42px', flexShrink:0, color: h.open ? '#0B0B0F' : '#9CA3AF' }}>{h.day}</span>
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
            </>}

            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => setModalOpen(false)} style={{ flex:1, padding:'13px', borderRadius:'12px', border:'1.5px solid #E5E7EB', background:'white', color:'#374151', fontFamily:'Tajawal,sans-serif', fontWeight:'700', fontSize:'14px', cursor:'pointer' }}>
                إلغاء
              </button>
              <button onClick={saveBranch} disabled={saving} style={{ flex:2, padding:'13px', borderRadius:'12px', border:'none', background: saving ? '#9CA3AF' : 'linear-gradient(135deg,#FF6A00,#E05D00)', color:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'14px', cursor: saving ? 'default' : 'pointer' }}>
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
