import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { compressAndUploadImage } from '../lib/uploadImage'
import { useAuthStore } from '../store/authStore'
import AppShell from '../components/AppShell'
import ConfirmDialog from '../components/ConfirmDialog'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { fetchBranches } from '../lib/branchesApi'

function Icon({ type, size = 18 }) {
  const paths = {
    plus: 'M12 5v14M5 12h14',
    search: 'm21 21-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0z',
    more: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm0 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm0-14a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
    eye: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    edit: 'M4 20h4l10-10-4-4L4 16v4zM13 7l4 4',
    trash: 'M4 7h16M10 11v5m4-5v5M9 7l1-3h4l1 3m-9 0 1 14h10l1-14',
    power: 'M12 2v10m5.66-6.34a8 8 0 1 1-11.32 0',
    banner: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5zm4 11 2.5-3 2 2.3 2.5-3.2L18 16M8.5 8.5h.01',
    coupon: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V6zM12 7v10',
    calendar: 'M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
    branch: 'M4 20V4h16v16M8 8h2M14 8h2M8 12h2M14 12h2M8 16h2M14 16h2',
    close: 'm18 6-12 12M6 6l12 12',
    upload: 'M12 16V4m0 0-4 4m4-4 4 4M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4',
    check: 'm5 12 4 4L19 6',
    info: 'M12 8h.01M11 12h1v4h1M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
    back: 'm15 18-6-6 6-6',
    fullscreen: 'M4 4h16v16H4zM4 9h16M9 4v16',
    popup: 'M5 4h14v16H5zM8 8h8M8 12h6M8 16h4',
    top: 'M4 5h16v4H4zM4 13h16M4 17h11',
    inline: 'M4 5h16v4H4zM4 12h16v7H4z',
    floating: 'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zM8 9h8M8 13h5',
    clock: 'M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
    priority: 'M6 4h12M6 10h9M6 16h6',
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[type] || paths.info} /></svg>
}

function Spinner() {
  return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#0B0B0F', color:'white', gap:'16px', fontFamily:'Tajawal,sans-serif' }}>
      <div style={{ width:'44px', height:'44px', border:'3px solid rgba(255,106,0,0.3)', borderTopColor:'#FF6A00', borderRadius:'50%', animation:'marketingSpin 0.8s linear infinite' }} />
      <style>{'@keyframes marketingSpin{to{transform:rotate(360deg)}}'}</style>
      جارٍ التحميل...
    </div>
  )
}

const inputStyle = {
  width:'100%', minHeight:'44px', padding:'10px 12px', border:'1.5px solid #E4E7EC', borderRadius:'10px',
  fontFamily:'Tajawal,sans-serif', fontSize:'13px', color:'#344054', outline:'none', boxSizing:'border-box', background:'white',
}
const labelStyle = { display:'block', fontSize:'12px', fontWeight:'800', marginBottom:'6px', color:'#475467', fontFamily:'Tajawal,sans-serif' }
const sectionLabelStyle = { color:'#98A2B3', fontSize:'11px', fontWeight:'900', letterSpacing:'.02em', marginBottom:'9px', fontFamily:'Tajawal,sans-serif' }

const EMPTY_BANNER = { title:'', subtitle:'', image_url:'', cta_text:'اطلب الآن', starts_at:'', ends_at:'', is_active:true, branch_id:'', display_mode:'top', display_frequency:'every_visit', display_delay_seconds:0, visitor_cooldown_hours:24, display_priority:0 }
const DISPLAY_MODES = [
  { key:'fullscreen', label:'شاشة كاملة عند الدخول', note:'تجربة عرض كاملة مع زر دخول واضح للمنيو', icon:'fullscreen' },
  { key:'popup', label:'نافذة منبثقة', note:'تظهر فوق المنيو ويمكن للعميل إغلاقها فورًا', icon:'popup' },
  { key:'top', label:'أعلى المينيو', note:'شريط عرض في بداية المنيو دون إيقاف التصفح', icon:'top' },
  { key:'inline', label:'بانر داخل المينيو', note:'بطاقة عرض ضمن محتوى الأصناف', icon:'inline' },
  { key:'floating', label:'عرض عائم', note:'زر ترويجي صغير يفتحه العميل عند الحاجة', icon:'floating' },
]
const DISPLAY_FREQUENCIES = [
  { key:'every_visit', label:'عند كل دخول للمينيو', note:'يظهر في كل زيارة جديدة' },
  { key:'once_per_visitor', label:'مرة واحدة لكل زائر', note:'يتذكر المنيو زيارة العميل خلال المدة المحددة' },
  { key:'delayed', label:'بعد عدد محدد من الثواني', note:'يظهر بعد وقت تختاره' },
]
const EMPTY_COUPON = { code:'', discount_type:'percent', discount_value:'', min_order_amount:'', expires_at:'', is_active:true, branch_id:'' }
const STATUS_FILTERS = [
  { key:'all', label:'الكل' },
  { key:'active', label:'فعال' },
  { key:'inactive', label:'غير فعال' },
  { key:'expired', label:'منتهي' },
  { key:'scheduled', label:'مجدول' },
]

const toDatetimeLocal = (iso) => iso ? new Date(iso).toISOString().slice(0, 16) : ''
const fromDatetimeLocal = (val) => val ? new Date(val).toISOString() : null
const formatDate = (value) => value ? new Date(value).toLocaleDateString('ar-SA', { day:'2-digit', month:'2-digit', year:'numeric' }) : null

function getItemStatus(item, type) {
  const now = Date.now()
  const startsAt = type === 'banner' ? item.starts_at : null
  const endsAt = type === 'banner' ? item.ends_at : item.expires_at
  if (endsAt && new Date(endsAt).getTime() < now) return { key:'expired', label:'منتهي', color:'#B42318', bg:'#FEF3F2', border:'#FECDCA' }
  if (!item.is_active) return { key:'inactive', label:'غير فعال', color:'#667085', bg:'#F2F4F7', border:'#EAECF0' }
  if (startsAt && new Date(startsAt).getTime() > now) return { key:'scheduled', label:'مجدول', color:'#B54708', bg:'#FFFAEB', border:'#FEDF89' }
  return { key:'active', label:'فعال', color:'#027A48', bg:'#ECFDF3', border:'#ABEFC6' }
}

function StatusBadge({ status }) {
  return <span style={{ display:'inline-flex', alignItems:'center', gap:'5px', padding:'4px 7px', borderRadius:'999px', border:`1px solid ${status.border}`, background:status.bg, color:status.color, fontSize:'10px', fontWeight:'900', whiteSpace:'nowrap' }}><span style={{ width:'6px', height:'6px', borderRadius:'50%', background:'currentColor' }} />{status.label}</span>
}

function ActionMenu({ onPreview, onEdit, onToggle, isActive, onDelete, open, onToggleMenu }) {
  return <div style={{ position:'relative', flexShrink:0 }}>
    <button type="button" onClick={onToggleMenu} aria-label="إجراءات العنصر" aria-expanded={open} style={{ width:'40px', height:'40px', display:'grid', placeItems:'center', borderRadius:'10px', border:'1px solid #E4E7EC', background:open ? '#F9FAFB' : 'white', color:'#667085', cursor:'pointer' }}><Icon type="more" size={18} /></button>
    {open && <div role="menu" style={{ position:'absolute', left:0, top:'46px', zIndex:12, minWidth:'170px', padding:'5px', background:'white', border:'1px solid #E4E7EC', borderRadius:'12px', boxShadow:'0 12px 28px rgba(16,24,40,.14)' }}>
      <MenuAction type="eye" label="عرض" onClick={onPreview} />
      <MenuAction type="edit" label="تعديل" onClick={onEdit} />
      <MenuAction type="power" label={isActive ? 'تعطيل' : 'تفعيل'} onClick={onToggle} />
      <MenuAction type="trash" label="حذف" danger onClick={onDelete} />
    </div>}
  </div>
}

function MenuAction({ type, label, onClick, danger = false }) {
  return <button type="button" role="menuitem" onClick={onClick} style={{ width:'100%', minHeight:'38px', display:'flex', alignItems:'center', gap:'8px', padding:'8px', border:'none', borderRadius:'8px', background:'transparent', color:danger ? '#D92D20' : '#344054', fontFamily:'Tajawal,sans-serif', fontSize:'12px', fontWeight:'800', textAlign:'right', cursor:'pointer' }}><Icon type={type} size={15} />{label}</button>
}

function EmptyState({ type, onCreate }) {
  const banner = type === 'banner'
  return <div style={{ background:'white', border:'1px solid #E4E7EC', borderRadius:'16px', padding:'38px 20px', textAlign:'center', boxShadow:'0 3px 10px rgba(16,24,40,.025)' }}>
    <span style={{ width:'52px', height:'52px', display:'grid', placeItems:'center', margin:'0 auto 12px', borderRadius:'15px', color:'#FF6A00', background:'#FFF0EB', border:'1px solid #FFD4BE' }}><Icon type={banner ? 'banner' : 'coupon'} size={24} /></span>
    <div style={{ color:'#101828', fontFamily:'Tajawal,sans-serif', fontSize:'15px', fontWeight:'900', marginBottom:'5px' }}>{banner ? 'لا توجد بانرات حاليًا' : 'لا توجد كوبونات حاليًا'}</div>
    <p style={{ maxWidth:'300px', margin:'0 auto 16px', color:'#667085', fontSize:'12px', lineHeight:1.7 }}>{banner ? 'أنشئ أول بانر لعرض عروض مطعمك داخل المنيو.' : 'أنشئ أول كوبون وابدأ في تقديم عروض لعملائك.'}</p>
    <button type="button" onClick={onCreate} style={{ minHeight:'42px', display:'inline-flex', alignItems:'center', gap:'6px', padding:'9px 12px', border:'none', borderRadius:'10px', background:'#FF6A00', color:'white', fontFamily:'Tajawal,sans-serif', fontSize:'12px', fontWeight:'900', cursor:'pointer' }}><Icon type="plus" size={15} />{banner ? 'إنشاء بانر' : 'إنشاء كوبون'}</button>
  </div>
}

function ToggleField({ label, checked, onChange }) {
  return <label style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px', padding:'11px 12px', border:'1px solid #EAECF0', background:'#FCFCFD', borderRadius:'11px', cursor:'pointer' }}>
    <span style={{ color:'#344054', fontSize:'12px', fontWeight:'900' }}>{label}</span>
    <input type="checkbox" checked={checked} onChange={onChange} style={{ width:'18px', height:'18px', accentColor:'#FF6A00', cursor:'pointer' }} />
  </label>
}

function ModalShell({ title, onClose, children, footer }) {
  return <div style={{ position:'fixed', inset:0, zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center', padding:'0' }}>
    <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(16,24,40,.48)' }} />
    <section role="dialog" aria-modal="true" aria-label={title} onClick={event => event.stopPropagation()} style={{ position:'relative', width:'100%', maxWidth:'540px', maxHeight:'90dvh', display:'flex', flexDirection:'column', background:'white', borderRadius:'22px 22px 0 0', overflow:'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px', padding:'16px 16px 13px', borderBottom:'1px solid #EAECF0' }}>
        <h2 style={{ margin:0, color:'#101828', fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'17px' }}>{title}</h2>
        <button type="button" onClick={onClose} aria-label="إغلاق" style={{ width:'36px', height:'36px', display:'grid', placeItems:'center', borderRadius:'10px', border:'1px solid #E4E7EC', color:'#667085', background:'white', cursor:'pointer' }}><Icon type="close" size={17} /></button>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'15px 16px 18px' }}>{children}</div>
      {footer && <div style={{ padding:'12px 16px calc(12px + env(safe-area-inset-bottom))', borderTop:'1px solid #EAECF0', background:'white' }}>{footer}</div>}
    </section>
  </div>
}

function SectionCaption({ children }) {
  return <div style={sectionLabelStyle}>{children}</div>
}

function DisplayModeBadge({ mode }) {
  const item = DISPLAY_MODES.find(option => option.key === mode) || DISPLAY_MODES[2]
  return <span style={{ display:'inline-flex', alignItems:'center', gap:'4px', padding:'3px 6px', borderRadius:'999px', color:'#B54708', background:'#FFF7ED', border:'1px solid #FED7AA', fontSize:'10px', fontWeight:'900' }}><Icon type={item.icon} size={11} />{item.label}</span>
}

function BannerDisplayPreview({ form }) {
  const option = DISPLAY_MODES.find(item => item.key === form.display_mode) || DISPLAY_MODES[2]
  const image = form.image_url
  const title = form.title || 'عنوان العرض'
  const subtitle = form.subtitle || 'وصف مختصر للعرض'
  const cta = form.cta_text || 'اطلب الآن'
  const visual = <><div style={{ minWidth:0, flex:1 }}><div style={{ fontSize:'12px', fontWeight:'900', color:'#101828', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{title}</div><div style={{ marginTop:'2px', fontSize:'10px', color:'#667085', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{subtitle}</div></div>{image && <img src={image} alt="معاينة صورة البانر" style={{ width:'56px', height:'40px', borderRadius:'8px', objectFit:'cover', flexShrink:0 }} />}</>
  const frameStyle = { minHeight:'116px', position:'relative', overflow:'hidden', display:'flex', alignItems:'center', background:'#F8F9FB', border:'1px solid #EAECF0', borderRadius:'13px', padding:'10px' }
  return <div style={{ marginTop:'11px', padding:'10px', border:'1px solid #FDE2CD', background:'#FFFCFA', borderRadius:'12px' }}>
    <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'8px', color:'#C2410C', fontSize:'11px', fontWeight:'900' }}><Icon type="eye" size={14} />معاينة: {option.label}</div>
    {form.display_mode === 'fullscreen' && <div style={{ ...frameStyle, justifyContent:'center', textAlign:'center', color:'white', background:'linear-gradient(150deg,#1D2939,#0B0B0F)' }}><div style={{ width:'100%', maxWidth:'190px' }}>{image && <img src={image} alt="" style={{ width:'54px', height:'40px', borderRadius:'8px', objectFit:'cover', margin:'0 auto 6px' }} />}<div style={{ fontSize:'13px', fontWeight:'900' }}>{title}</div><div style={{ marginTop:'3px', fontSize:'10px', opacity:.76 }}>{subtitle}</div><div style={{ display:'grid', gap:'5px', marginTop:'9px' }}><span style={{ padding:'6px', borderRadius:'7px', background:'#FF6A00', fontSize:'10px', fontWeight:'900' }}>{cta}</span><span style={{ padding:'5px', borderRadius:'7px', border:'1px solid rgba(255,255,255,.3)', fontSize:'10px', fontWeight:'800' }}>الدخول إلى المينيو</span></div></div></div>}
    {form.display_mode === 'popup' && <div style={{ ...frameStyle, justifyContent:'center', background:'#F2F4F7' }}><div style={{ width:'83%', padding:'9px', borderRadius:'10px', background:'white', boxShadow:'0 6px 14px rgba(16,24,40,.14)' }}><div style={{ display:'flex', gap:'8px', alignItems:'center' }}>{visual}<span style={{ color:'#667085', fontSize:'12px' }}>×</span></div><div style={{ marginTop:'7px', padding:'5px', textAlign:'center', borderRadius:'6px', background:'#FF6A00', color:'white', fontSize:'10px', fontWeight:'900' }}>{cta}</div></div></div>}
    {form.display_mode === 'top' && <div style={{ ...frameStyle, alignItems:'flex-start', padding:'0', background:'#F8F9FB' }}><div style={{ width:'100%', display:'flex', alignItems:'center', gap:'8px', padding:'9px', background:'#FFF0EB', borderBottom:'1px solid #FFD4BE' }}><span style={{ width:'24px', height:'24px', display:'grid', placeItems:'center', borderRadius:'7px', background:'#FF6A00', color:'white' }}><Icon type="banner" size={13} /></span>{visual}</div><div style={{ position:'absolute', right:'10px', left:'10px', bottom:'10px', height:'35px', borderRadius:'7px', background:'white', border:'1px solid #EAECF0' }} /></div>}
    {form.display_mode === 'inline' && <div style={{ ...frameStyle, flexDirection:'column', alignItems:'stretch', justifyContent:'flex-end', gap:'8px', background:'#F8F9FB' }}><div style={{ height:'26px', borderRadius:'6px', background:'white', border:'1px solid #EAECF0' }} /><div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'9px', background:'white', border:'1px solid #FDE2CD', borderRadius:'9px' }}>{visual}</div></div>}
    {form.display_mode === 'floating' && <div style={{ ...frameStyle, background:'#F8F9FB' }}><div style={{ width:'100%', height:'34px', borderRadius:'7px', background:'white', border:'1px solid #EAECF0' }} /><div style={{ position:'absolute', left:'10px', bottom:'10px', display:'flex', alignItems:'center', gap:'5px', padding:'7px 9px', borderRadius:'999px', background:'#FF6A00', color:'white', boxShadow:'0 4px 10px rgba(255,106,0,.3)', fontSize:'10px', fontWeight:'900' }}><Icon type="banner" size={13} />{title}</div></div>}
  </div>
}

export default function Marketing() {
  const navigate = useNavigate()
  const { restaurant } = useAuthStore()
  const [activeTab, setActiveTab] = useState('banners')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [banners, setBanners] = useState([])
  const [coupons, setCoupons] = useState([])
  const [branches, setBranches] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [openMenu, setOpenMenu] = useState(null)

  const [bannerModalOpen, setBannerModalOpen] = useState(false)
  const [couponModalOpen, setCouponModalOpen] = useState(false)
  const [previewBanner, setPreviewBanner] = useState(null)
  const [previewCoupon, setPreviewCoupon] = useState(null)
  const [editingBanner, setEditingBanner] = useState(null)
  const [editingCoupon, setEditingCoupon] = useState(null)
  const [bannerForm, setBannerForm] = useState(EMPTY_BANNER)
  const [couponForm, setCouponForm] = useState(EMPTY_COUPON)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [confirmDeleteBanner, setConfirmDeleteBanner] = useState(null)
  const [confirmDeleteCoupon, setConfirmDeleteCoupon] = useState(null)

  useBodyScrollLock(bannerModalOpen || couponModalOpen || !!previewBanner || !!previewCoupon)

  useEffect(() => {
    if (!restaurant?.id) return
    fetchAll()
  }, [restaurant?.id])

  const fetchAll = async () => {
    if (!restaurant?.id) return
    setLoading(true)
    try {
      const [{ data: b, error: bannerError }, { data: c, error: couponError }, branchList] = await Promise.all([
        supabase.from('banners').select('*').eq('restaurant_id', restaurant.id).order('display_priority', { ascending:false }).order('sort_order'),
        supabase.from('coupons').select('*').eq('restaurant_id', restaurant.id).order('created_at', { ascending:false }),
        fetchBranches(restaurant.id),
      ])
      if (bannerError) throw bannerError
      if (couponError) throw couponError
      setBanners(b || [])
      setCoupons(c || [])
      setBranches(branchList || [])
    } catch (error) {
      toast.error(error.message || 'تعذر تحميل العروض والكوبونات')
    } finally {
      setLoading(false)
    }
  }

  const branchName = (branchId) => branches.find(branch => branch.id === branchId)?.name
  const currentItems = activeTab === 'banners' ? banners : coupons
  const visibleItems = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    const type = activeTab === 'banners' ? 'banner' : 'coupon'
    return currentItems.filter(item => {
      const status = getItemStatus(item, type)
      const text = activeTab === 'banners' ? `${item.title || ''} ${item.subtitle || ''}` : item.code || ''
      return (!keyword || text.toLowerCase().includes(keyword)) && (statusFilter === 'all' || status.key === statusFilter)
    })
  }, [activeTab, currentItems, search, statusFilter])

  const openAddBanner = () => { setEditingBanner(null); setBannerForm(EMPTY_BANNER); setBannerModalOpen(true) }
  const openEditBanner = (banner) => {
    setEditingBanner(banner)
    setBannerForm({
      title:banner.title || '', subtitle:banner.subtitle || '', image_url:banner.image_url || '', cta_text:banner.cta_text || 'اطلب الآن',
      starts_at:toDatetimeLocal(banner.starts_at), ends_at:toDatetimeLocal(banner.ends_at), is_active:banner.is_active, branch_id:banner.branch_id || '',
      display_mode:banner.display_mode || 'top', display_frequency:banner.display_frequency || 'every_visit',
      display_delay_seconds:Number.isFinite(Number(banner.display_delay_seconds)) ? Number(banner.display_delay_seconds) : 0,
      visitor_cooldown_hours:Number.isFinite(Number(banner.visitor_cooldown_hours)) ? Number(banner.visitor_cooldown_hours) : 24,
      display_priority:Number.isFinite(Number(banner.display_priority)) ? Number(banner.display_priority) : 0,
    })
    setOpenMenu(null)
    setBannerModalOpen(true)
  }

  const handleBannerImageUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    try {
      const url = await compressAndUploadImage(file, restaurant.id, 'banners')
      setBannerForm(form => ({ ...form, image_url:url }))
      toast.success('تم رفع الصورة بنجاح')
    } catch (error) {
      toast.error(error.message || 'فشل رفع الصورة')
    } finally {
      setUploadingImage(false)
      event.target.value = ''
    }
  }

  const saveBanner = async () => {
    if (!bannerForm.title.trim()) { toast.error('أدخل عنوان البانر'); return }
    if (bannerForm.starts_at && bannerForm.ends_at && new Date(bannerForm.ends_at) < new Date(bannerForm.starts_at)) { toast.error('تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية'); return }
    const payload = {
      title:bannerForm.title.trim(), subtitle:bannerForm.subtitle.trim() || null, image_url:bannerForm.image_url || null,
      cta_text:bannerForm.cta_text.trim() || 'اطلب الآن', starts_at:fromDatetimeLocal(bannerForm.starts_at), ends_at:fromDatetimeLocal(bannerForm.ends_at),
      is_active:bannerForm.is_active, branch_id:bannerForm.branch_id || null,
      display_mode:DISPLAY_MODES.some(option => option.key === bannerForm.display_mode) ? bannerForm.display_mode : 'top',
      display_frequency:DISPLAY_FREQUENCIES.some(option => option.key === bannerForm.display_frequency) ? bannerForm.display_frequency : 'every_visit',
      display_delay_seconds:Math.min(300, Math.max(0, Number(bannerForm.display_delay_seconds) || 0)),
      visitor_cooldown_hours:Math.min(8760, Math.max(1, Number(bannerForm.visitor_cooldown_hours) || 24)),
      display_priority:Math.max(0, Number(bannerForm.display_priority) || 0),
    }
    setSaving(true)
    try {
      if (editingBanner) {
        const { error } = await supabase.from('banners').update(payload).eq('id', editingBanner.id)
        if (error) throw error
        toast.success('تم تحديث البانر')
      } else {
        const { error } = await supabase.from('banners').insert({ ...payload, restaurant_id:restaurant.id, sort_order:banners.length })
        if (error) throw error
        toast.success('تم إضافة البانر')
      }
      setBannerModalOpen(false)
      await fetchAll()
    } catch (error) {
      toast.error(error.message || 'تعذر حفظ البانر')
    } finally {
      setSaving(false)
    }
  }

  const deleteBanner = async (banner) => {
    if (!banner) return
    const { error } = await supabase.from('banners').delete().eq('id', banner.id)
    if (error) { toast.error(error.message); return }
    toast.success('تم حذف البانر')
    await fetchAll()
  }

  const toggleBannerActive = async (banner) => {
    const { error } = await supabase.from('banners').update({ is_active:!banner.is_active }).eq('id', banner.id)
    if (error) { toast.error(error.message); return }
    toast.success(banner.is_active ? 'تم تعطيل البانر' : 'تم تفعيل البانر')
    setOpenMenu(null)
    await fetchAll()
  }

  const openAddCoupon = () => { setEditingCoupon(null); setCouponForm(EMPTY_COUPON); setCouponModalOpen(true) }
  const openEditCoupon = (coupon) => {
    setEditingCoupon(coupon)
    setCouponForm({
      code:coupon.code || '', discount_type:coupon.discount_type || 'percent', discount_value:String(coupon.discount_value || ''),
      min_order_amount:coupon.min_order_amount ? String(coupon.min_order_amount) : '', expires_at:coupon.expires_at ? coupon.expires_at.slice(0, 10) : '',
      is_active:coupon.is_active, branch_id:coupon.branch_id || '',
    })
    setOpenMenu(null)
    setCouponModalOpen(true)
  }

  const saveCoupon = async () => {
    const code = couponForm.code.trim().toUpperCase()
    const value = parseFloat(couponForm.discount_value)
    if (!code) { toast.error('أدخل كود الكوبون'); return }
    if (!value || value <= 0) { toast.error('أدخل قيمة خصم صحيحة'); return }
    if (couponForm.discount_type === 'percent' && value > 100) { toast.error('نسبة الخصم لا يمكن أن تتجاوز 100%'); return }
    const payload = {
      code, discount_type:couponForm.discount_type, discount_value:value, min_order_amount:parseFloat(couponForm.min_order_amount) || 0,
      expires_at:couponForm.expires_at ? new Date(`${couponForm.expires_at}T23:59:59`).toISOString() : null,
      is_active:couponForm.is_active, branch_id:couponForm.branch_id || null,
    }
    setSaving(true)
    try {
      if (editingCoupon) {
        const { error } = await supabase.from('coupons').update(payload).eq('id', editingCoupon.id)
        if (error) throw error
        toast.success('تم تحديث الكوبون')
      } else {
        const { error } = await supabase.from('coupons').insert({ ...payload, restaurant_id:restaurant.id })
        if (error) throw error
        toast.success('تم إضافة الكوبون')
      }
      setCouponModalOpen(false)
      await fetchAll()
    } catch (error) {
      toast.error(error.code === '23505' ? 'هذا الكود مستخدم من قبل' : (error.message || 'تعذر حفظ الكوبون'))
    } finally {
      setSaving(false)
    }
  }

  const deleteCoupon = async (coupon) => {
    if (!coupon) return
    const { error } = await supabase.from('coupons').delete().eq('id', coupon.id)
    if (error) { toast.error(error.message); return }
    toast.success('تم حذف الكوبون')
    await fetchAll()
  }

  const toggleCouponActive = async (coupon) => {
    const { error } = await supabase.from('coupons').update({ is_active:!coupon.is_active }).eq('id', coupon.id)
    if (error) { toast.error(error.message); return }
    toast.success(coupon.is_active ? 'تم تعطيل الكوبون' : 'تم تفعيل الكوبون')
    setOpenMenu(null)
    await fetchAll()
  }

  if (!restaurant || loading) return <Spinner />

  const isBanners = activeTab === 'banners'
  const primaryAction = isBanners ? openAddBanner : openAddCoupon
  const primaryLabel = isBanners ? 'بانر جديد' : 'كوبون جديد'

  return (
    <AppShell
      active="marketing"
      title="العروض والكوبونات 📣"
      headerStacked
      actions={<button type="button" onClick={() => navigate('/dashboard')} style={{ minHeight:'40px', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:'5px', padding:'8px 11px', borderRadius:'10px', border:'1px solid #E4E7EC', background:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'12px', cursor:'pointer', color:'#475467' }}><Icon type="back" size={15} />الرئيسية</button>}
    >
      <style>{`
        .marketing-tabs { display:flex; gap:4px; overflow-x:auto; scrollbar-width:none; }
        .marketing-tabs::-webkit-scrollbar { display:none; }
        .marketing-form-two { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .marketing-banner-card, .marketing-coupon-card { min-width:0; }
        @media (max-width:520px) {
          .marketing-page-wrap { padding:12px !important; }
          .marketing-tabs { margin:0 -12px; padding:0 12px; }
          .marketing-form-two { grid-template-columns:1fr; gap:10px; }
        }
      `}</style>

      <div className="marketing-page-wrap" style={{ padding:'14px 16px 28px', maxWidth:'860px', margin:'0 auto' }}>
        <div className="marketing-tabs" role="tablist" aria-label="أقسام العروض" style={{ marginBottom:'12px', borderBottom:'1px solid #EAECF0' }}>
          {[{ key:'banners', label:'باقات العروض', icon:'banner' }, { key:'coupons', label:'الكوبونات', icon:'coupon' }].map(tab => {
            const selected = activeTab === tab.key
            return <button key={tab.key} type="button" role="tab" aria-selected={selected} onClick={() => { setActiveTab(tab.key); setSearch(''); setStatusFilter('all'); setOpenMenu(null) }} style={{ minHeight:'42px', display:'inline-flex', alignItems:'center', gap:'6px', padding:'8px 11px', border:'none', borderBottom:`2px solid ${selected ? '#FF6A00' : 'transparent'}`, background:'transparent', color:selected ? '#FF6A00' : '#667085', fontFamily:'Tajawal,sans-serif', fontSize:'13px', fontWeight:'900', cursor:'pointer', whiteSpace:'nowrap' }}><Icon type={tab.icon} size={16} />{tab.label}</button>
          })}
        </div>

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'10px', flexWrap:'wrap', marginBottom:'12px' }}>
          <div style={{ color:'#667085', fontSize:'12px', fontWeight:'700' }}>{isBanners ? 'نظّم البانرات الظاهرة في المنيو' : 'أنشئ كوبونات وحافظ على عروضك منظمة'}</div>
          <button type="button" onClick={primaryAction} style={{ minHeight:'40px', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:'6px', padding:'9px 12px', borderRadius:'10px', border:'none', background:'#FF6A00', color:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'12px', cursor:'pointer', boxShadow:'0 5px 12px rgba(255,106,0,.18)', whiteSpace:'nowrap' }}><Icon type="plus" size={15} />{primaryLabel}</button>
        </div>

        <section style={{ background:'white', border:'1px solid #EAECF0', borderRadius:'14px', padding:'10px', marginBottom:'12px', boxShadow:'0 2px 7px rgba(16,24,40,.02)' }}>
          <div style={{ position:'relative', marginBottom:'9px' }}>
            <span style={{ position:'absolute', right:'11px', top:'50%', transform:'translateY(-50%)', color:'#98A2B3', pointerEvents:'none' }}><Icon type="search" size={16} /></span>
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder={isBanners ? 'ابحث عن بانر...' : 'ابحث باسم أو كود الكوبون...'} style={{ ...inputStyle, minHeight:'40px', paddingRight:'37px', background:'#FCFCFD' }} />
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'6px', overflowX:'auto', paddingBottom:'1px', scrollbarWidth:'none' }}>
            {STATUS_FILTERS.map(filter => {
              const selected = statusFilter === filter.key
              return <button key={filter.key} type="button" onClick={() => setStatusFilter(filter.key)} style={{ flexShrink:0, minHeight:'32px', padding:'6px 9px', borderRadius:'999px', border:`1px solid ${selected ? '#FFD4BE' : '#E4E7EC'}`, background:selected ? '#FFF0EB' : 'white', color:selected ? '#C2410C' : '#667085', fontFamily:'Tajawal,sans-serif', fontSize:'11px', fontWeight:'900', cursor:'pointer' }}>{filter.label}</button>
            })}
          </div>
        </section>

        {visibleItems.length === 0 ? (
          currentItems.length === 0 ? <EmptyState type={isBanners ? 'banner' : 'coupon'} onCreate={primaryAction} /> : <div style={{ background:'white', border:'1px solid #EAECF0', borderRadius:'15px', padding:'28px 18px', textAlign:'center' }}><div style={{ color:'#475467', fontWeight:'900', fontSize:'14px' }}>لا توجد نتائج مطابقة</div><button type="button" onClick={() => { setSearch(''); setStatusFilter('all') }} style={{ marginTop:'10px', minHeight:'36px', padding:'7px 10px', border:'1px solid #E4E7EC', borderRadius:'9px', background:'white', color:'#475467', fontFamily:'Tajawal,sans-serif', fontSize:'12px', fontWeight:'800', cursor:'pointer' }}>إزالة الفلاتر</button></div>
        ) : isBanners ? (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:'11px' }}>
            {visibleItems.map(banner => {
              const status = getItemStatus(banner, 'banner')
              const menuKey = `banner-${banner.id}`
              return <article key={banner.id} className="marketing-banner-card" style={{ position:'relative', minWidth:0, background:'white', border:'1px solid #E4E7EC', borderRadius:'16px', padding:'11px', boxShadow:'0 3px 10px rgba(16,24,40,.025)' }}>
                <div style={{ display:'flex', gap:'10px', alignItems:'flex-start' }}>
                  <div style={{ width:'78px', height:'62px', borderRadius:'11px', overflow:'hidden', background:'#FFF7ED', border:'1px solid #FDE7D5', flexShrink:0, display:'grid', placeItems:'center', color:'#F97316' }}>
                    {banner.image_url ? <img src={banner.image_url} alt={`صورة بانر ${banner.title}`} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <Icon type="banner" size={22} />}
                  </div>
                  <div style={{ minWidth:0, flex:1 }}>
                    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'8px' }}>
                      <div style={{ minWidth:0 }}>
                        <h3 style={{ margin:0, color:'#101828', fontFamily:'Tajawal,sans-serif', fontSize:'14px', fontWeight:'900', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{banner.title}</h3>
                        {banner.subtitle && <p style={{ margin:'3px 0 0', color:'#667085', fontSize:'12px', lineHeight:1.45, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{banner.subtitle}</p>}
                      </div>
                      <ActionMenu open={openMenu === menuKey} onToggleMenu={() => setOpenMenu(openMenu === menuKey ? null : menuKey)} onPreview={() => { setPreviewBanner(banner); setOpenMenu(null) }} onEdit={() => openEditBanner(banner)} onToggle={() => toggleBannerActive(banner)} isActive={banner.is_active} onDelete={() => { setConfirmDeleteBanner(banner); setOpenMenu(null) }} />
                    </div>
                    <div style={{ display:'flex', alignItems:'center', flexWrap:'wrap', gap:'6px', marginTop:'7px' }}>
                      <StatusBadge status={status} />
                      <DisplayModeBadge mode={banner.display_mode} />
                      {Number(banner.display_priority || 0) > 0 && <span style={{ display:'inline-flex', alignItems:'center', gap:'4px', color:'#475467', background:'#F2F4F7', border:'1px solid #EAECF0', padding:'3px 6px', borderRadius:'999px', fontSize:'10px', fontWeight:'800' }}><Icon type="priority" size={11} />أولوية {banner.display_priority}</span>}
                      {banner.branch_id && <span style={{ display:'inline-flex', alignItems:'center', gap:'4px', color:'#B54708', background:'#FFFAEB', border:'1px solid #FEDF89', padding:'3px 6px', borderRadius:'999px', fontSize:'10px', fontWeight:'800' }}><Icon type="branch" size={11} />{branchName(banner.branch_id) || 'فرع محدد'}</span>}
                    </div>
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:'5px', marginTop:'10px', paddingTop:'9px', borderTop:'1px solid #F2F4F7', color:'#667085', fontSize:'10.5px', fontWeight:'700' }}><Icon type="calendar" size={13} /><span>{formatDate(banner.starts_at) || 'يبدأ فورًا'} → {formatDate(banner.ends_at) || 'مستمر'}</span></div>
              </article>
            })}
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:'11px' }}>
            {visibleItems.map(coupon => {
              const status = getItemStatus(coupon, 'coupon')
              const menuKey = `coupon-${coupon.id}`
              const discount = coupon.discount_type === 'percent' ? `${coupon.discount_value}%` : `${coupon.discount_value} ﷼`
              return <article key={coupon.id} className="marketing-coupon-card" style={{ position:'relative', minWidth:0, background:'white', border:'1px solid #E4E7EC', borderRadius:'16px', padding:'12px', boxShadow:'0 3px 10px rgba(16,24,40,.025)' }}>
                <div style={{ display:'flex', gap:'10px', alignItems:'flex-start' }}>
                  <div style={{ width:'56px', height:'56px', borderRadius:'14px', background:'#FFF0EB', border:'1px solid #FFD4BE', display:'grid', placeItems:'center', color:'#D94801', fontSize:'15px', fontWeight:'900', direction:'ltr', flexShrink:0 }}>{discount}</div>
                  <div style={{ minWidth:0, flex:1 }}>
                    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'8px' }}>
                      <div style={{ minWidth:0 }}>
                        <div style={{ color:'#101828', fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize:'15px', lineHeight:1.2, fontWeight:'900', direction:'ltr', textAlign:'right', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{coupon.code}</div>
                        <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', alignItems:'center', marginTop:'6px' }}><StatusBadge status={status} />{coupon.branch_id && <span style={{ display:'inline-flex', alignItems:'center', gap:'4px', color:'#B54708', background:'#FFFAEB', border:'1px solid #FEDF89', padding:'3px 6px', borderRadius:'999px', fontSize:'10px', fontWeight:'800' }}><Icon type="branch" size={11} />{branchName(coupon.branch_id) || 'فرع محدد'}</span>}</div>
                      </div>
                      <ActionMenu open={openMenu === menuKey} onToggleMenu={() => setOpenMenu(openMenu === menuKey ? null : menuKey)} onPreview={() => { setPreviewCoupon(coupon); setOpenMenu(null) }} onEdit={() => openEditCoupon(coupon)} onToggle={() => toggleCouponActive(coupon)} isActive={coupon.is_active} onDelete={() => { setConfirmDeleteCoupon(coupon); setOpenMenu(null) }} />
                    </div>
                    <div style={{ marginTop:'8px', color:'#667085', fontSize:'11px', lineHeight:1.55 }}>
                      <div>{coupon.min_order_amount > 0 ? `للطلبات فوق ${coupon.min_order_amount} ﷼` : 'بدون حد أدنى للطلب'}</div>
                      <div style={{ marginTop:'2px' }}>{coupon.expires_at ? `ينتهي في ${formatDate(coupon.expires_at)}` : 'بلا تاريخ انتهاء'}</div>
                    </div>
                  </div>
                </div>
              </article>
            })}
          </div>
        )}
      </div>

      {bannerModalOpen && <ModalShell title={editingBanner ? 'تعديل البانر' : 'بانر جديد'} onClose={() => setBannerModalOpen(false)} footer={<div style={{ display:'flex', gap:'9px' }}><button type="button" onClick={() => setBannerModalOpen(false)} style={{ flex:1, minHeight:'44px', borderRadius:'11px', border:'1px solid #E4E7EC', background:'white', color:'#475467', fontFamily:'Tajawal,sans-serif', fontSize:'13px', fontWeight:'900', cursor:'pointer' }}>إلغاء</button><button type="button" disabled={saving} onClick={saveBanner} style={{ flex:1.45, minHeight:'44px', borderRadius:'11px', border:'none', background:'#FF6A00', color:'white', fontFamily:'Tajawal,sans-serif', fontSize:'13px', fontWeight:'900', cursor:saving ? 'default' : 'pointer', opacity:saving ? .7 : 1 }}>{saving ? 'جارٍ الحفظ...' : (editingBanner ? 'حفظ التعديلات' : 'إضافة البانر')}</button></div>}>
        <SectionCaption>المحتوى</SectionCaption>
        <div style={{ display:'grid', gap:'11px', marginBottom:'16px' }}>
          <div><label style={labelStyle}>العنوان *</label><input style={inputStyle} value={bannerForm.title} onChange={event => setBannerForm(form => ({ ...form, title:event.target.value }))} placeholder="مثل: بوكس غزالة" /></div>
          <div><label style={labelStyle}>وصف مختصر</label><input style={inputStyle} value={bannerForm.subtitle} onChange={event => setBannerForm(form => ({ ...form, subtitle:event.target.value }))} placeholder="وصف قصير للعرض" /></div>
          <div><label style={labelStyle}>صورة البانر</label><div style={{ minHeight:'92px', display:'flex', alignItems:'center', gap:'10px', padding:'9px', border:'1px dashed #D0D5DD', borderRadius:'11px', background:'#FCFCFD' }}><div style={{ width:'92px', height:'70px', flexShrink:0, display:'grid', placeItems:'center', overflow:'hidden', borderRadius:'9px', background:'#FFF7ED', color:'#F97316' }}>{bannerForm.image_url ? <img src={bannerForm.image_url} alt="معاينة البانر" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <Icon type="banner" size={25} />}</div><label style={{ minWidth:0, color:'#475467', fontSize:'12px', fontWeight:'800', cursor:'pointer' }}><span style={{ display:'inline-flex', alignItems:'center', gap:'5px', color:'#C2410C' }}><Icon type="upload" size={15} />{uploadingImage ? 'جارٍ رفع الصورة...' : 'رفع صورة أو استبدالها'}</span><input type="file" accept="image/*" onChange={handleBannerImageUpload} disabled={uploadingImage} style={{ display:'block', width:'100%', marginTop:'5px', fontSize:'11px' }} /></label></div></div>
          <div><label style={labelStyle}>نص الزر</label><input style={inputStyle} value={bannerForm.cta_text} onChange={event => setBannerForm(form => ({ ...form, cta_text:event.target.value }))} placeholder="اطلب الآن" /></div>
        </div>
        <SectionCaption>طريقة عرض البانر</SectionCaption>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0, 1fr))', gap:'8px', marginBottom:'12px' }}>
          {DISPLAY_MODES.map(option => {
            const selected = bannerForm.display_mode === option.key
            return <button key={option.key} type="button" aria-pressed={selected} onClick={() => setBannerForm(form => ({ ...form, display_mode:option.key }))} style={{ minHeight:'78px', display:'flex', alignItems:'flex-start', gap:'7px', padding:'9px', textAlign:'right', borderRadius:'11px', border:`1.5px solid ${selected ? '#FF6A00' : '#E4E7EC'}`, background:selected ? '#FFF7ED' : 'white', color:selected ? '#C2410C' : '#344054', cursor:'pointer', fontFamily:'Tajawal,sans-serif' }}><span style={{ width:'26px', height:'26px', display:'grid', placeItems:'center', flexShrink:0, borderRadius:'8px', background:selected ? '#FF6A00' : '#F2F4F7', color:selected ? 'white' : '#667085' }}><Icon type={option.icon} size={14} /></span><span style={{ minWidth:0 }}><span style={{ display:'block', fontSize:'11px', fontWeight:'900', lineHeight:1.35 }}>{option.label}</span><span style={{ display:'block', marginTop:'3px', color:selected ? '#B54708' : '#98A2B3', fontSize:'9.5px', lineHeight:1.4 }}>{option.note}</span></span></button>
          })}
        </div>
        <SectionCaption>متى يظهر البانر؟</SectionCaption>
        <div style={{ display:'grid', gap:'7px', marginBottom:'12px' }}>
          {DISPLAY_FREQUENCIES.map(option => {
            const selected = bannerForm.display_frequency === option.key
            return <button key={option.key} type="button" aria-pressed={selected} onClick={() => setBannerForm(form => ({ ...form, display_frequency:option.key }))} style={{ minHeight:'48px', display:'flex', alignItems:'center', gap:'8px', padding:'8px 10px', textAlign:'right', borderRadius:'10px', border:`1.5px solid ${selected ? '#FF6A00' : '#E4E7EC'}`, background:selected ? '#FFF7ED' : 'white', color:'#344054', cursor:'pointer', fontFamily:'Tajawal,sans-serif' }}><span style={{ width:'19px', height:'19px', display:'grid', placeItems:'center', flexShrink:0, borderRadius:'50%', border:`5px solid ${selected ? '#FF6A00' : '#D0D5DD'}`, boxSizing:'border-box' }} /><span style={{ minWidth:0, flex:1 }}><span style={{ display:'block', fontSize:'11px', fontWeight:'900', color:selected ? '#C2410C' : '#344054' }}>{option.label}</span><span style={{ display:'block', marginTop:'2px', color:'#98A2B3', fontSize:'9.5px' }}>{option.note}</span></span></button>
          })}
        </div>
        {bannerForm.display_frequency === 'once_per_visitor' && <div style={{ marginBottom:'12px' }}><label style={labelStyle}>مدة عدم التكرار للزائر (بالساعات)</label><input type="number" min="1" max="8760" style={inputStyle} value={bannerForm.visitor_cooldown_hours} onChange={event => setBannerForm(form => ({ ...form, visitor_cooldown_hours:event.target.value }))} /><div style={{ marginTop:'5px', color:'#667085', fontSize:'10.5px', lineHeight:1.5 }}>لن يظهر هذا البانر للزائر نفسه مجددًا خلال هذه المدة.</div></div>}
        {bannerForm.display_frequency === 'delayed' && <div style={{ marginBottom:'12px' }}><label style={labelStyle}>وقت الظهور بعد فتح المنيو (بالثواني)</label><input type="number" min="0" max="300" style={inputStyle} value={bannerForm.display_delay_seconds} onChange={event => setBannerForm(form => ({ ...form, display_delay_seconds:event.target.value }))} /><div style={{ marginTop:'5px', color:'#667085', fontSize:'10.5px', lineHeight:1.5 }}>استخدم 0 للظهور فورًا بعد تحميل المنيو.</div></div>}
        <div style={{ marginBottom:'16px' }}><label style={labelStyle}>أولوية العرض</label><div style={{ display:'flex', alignItems:'center', gap:'8px' }}><span style={{ width:'36px', height:'36px', display:'grid', placeItems:'center', flexShrink:0, borderRadius:'10px', color:'#B54708', background:'#FFF7ED', border:'1px solid #FED7AA' }}><Icon type="priority" size={16} /></span><input type="number" min="0" step="1" style={inputStyle} value={bannerForm.display_priority} onChange={event => setBannerForm(form => ({ ...form, display_priority:event.target.value }))} /><span style={{ color:'#667085', fontSize:'10.5px', lineHeight:1.4 }}>القيمة الأعلى تظهر أولًا عند وجود أكثر من بانر بنفس الطريقة.</span></div></div>
        <BannerDisplayPreview form={bannerForm} />
        <div style={{ height:'16px' }} />
        <SectionCaption>الجدولة</SectionCaption>
        <div className="marketing-form-two" style={{ marginBottom:'16px' }}><div><label style={labelStyle}>يبدأ</label><input type="datetime-local" style={inputStyle} value={bannerForm.starts_at} onChange={event => setBannerForm(form => ({ ...form, starts_at:event.target.value }))} /></div><div><label style={labelStyle}>ينتهي</label><input type="datetime-local" style={inputStyle} value={bannerForm.ends_at} onChange={event => setBannerForm(form => ({ ...form, ends_at:event.target.value }))} /></div></div>
        {branches.length > 0 && <><SectionCaption>النطاق</SectionCaption><div style={{ marginBottom:'16px' }}><label style={labelStyle}>الفرع</label><select style={{ ...inputStyle, cursor:'pointer' }} value={bannerForm.branch_id} onChange={event => setBannerForm(form => ({ ...form, branch_id:event.target.value }))}><option value="">كل الفروع</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div></>}
        <SectionCaption>الحالة</SectionCaption><ToggleField label="تفعيل البانر" checked={bannerForm.is_active} onChange={event => setBannerForm(form => ({ ...form, is_active:event.target.checked }))} />
      </ModalShell>}

      {couponModalOpen && <ModalShell title={editingCoupon ? 'تعديل الكوبون' : 'كوبون جديد'} onClose={() => setCouponModalOpen(false)} footer={<div style={{ display:'flex', gap:'9px' }}><button type="button" onClick={() => setCouponModalOpen(false)} style={{ flex:1, minHeight:'44px', borderRadius:'11px', border:'1px solid #E4E7EC', background:'white', color:'#475467', fontFamily:'Tajawal,sans-serif', fontSize:'13px', fontWeight:'900', cursor:'pointer' }}>إلغاء</button><button type="button" disabled={saving} onClick={saveCoupon} style={{ flex:1.45, minHeight:'44px', borderRadius:'11px', border:'none', background:'#FF6A00', color:'white', fontFamily:'Tajawal,sans-serif', fontSize:'13px', fontWeight:'900', cursor:saving ? 'default' : 'pointer', opacity:saving ? .7 : 1 }}>{saving ? 'جارٍ الحفظ...' : (editingCoupon ? 'حفظ التعديلات' : 'إضافة الكوبون')}</button></div>}>
        <SectionCaption>معلومات الكوبون</SectionCaption>
        <div style={{ display:'grid', gap:'11px', marginBottom:'16px' }}>
          <div><label style={labelStyle}>الكود *</label><input style={{ ...inputStyle, direction:'ltr', textAlign:'left', textTransform:'uppercase', fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight:'800' }} value={couponForm.code} onChange={event => setCouponForm(form => ({ ...form, code:event.target.value.toUpperCase() }))} placeholder="WELCOME15" /></div>
          <div className="marketing-form-two"><div><label style={labelStyle}>نوع الخصم *</label><select style={{ ...inputStyle, cursor:'pointer' }} value={couponForm.discount_type} onChange={event => setCouponForm(form => ({ ...form, discount_type:event.target.value }))}><option value="percent">نسبة مئوية</option><option value="fixed">مبلغ ثابت</option></select></div><div><label style={labelStyle}>القيمة *</label><input type="number" min="0" style={inputStyle} value={couponForm.discount_value} onChange={event => setCouponForm(form => ({ ...form, discount_value:event.target.value }))} placeholder={couponForm.discount_type === 'percent' ? '10' : '20'} /></div></div>
          <div><label style={labelStyle}>الحد الأدنى للطلب</label><input type="number" min="0" style={inputStyle} value={couponForm.min_order_amount} onChange={event => setCouponForm(form => ({ ...form, min_order_amount:event.target.value }))} placeholder="50" /></div>
        </div>
        {branches.length > 0 && <><SectionCaption>النطاق</SectionCaption><div style={{ marginBottom:'16px' }}><label style={labelStyle}>الفرع</label><select style={{ ...inputStyle, cursor:'pointer' }} value={couponForm.branch_id} onChange={event => setCouponForm(form => ({ ...form, branch_id:event.target.value }))}><option value="">كل الفروع</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div></>}
        <SectionCaption>المدة</SectionCaption><div style={{ marginBottom:'16px' }}><label style={labelStyle}>تاريخ الانتهاء</label><input type="date" style={inputStyle} value={couponForm.expires_at} onChange={event => setCouponForm(form => ({ ...form, expires_at:event.target.value }))} /></div>
        <SectionCaption>الحالة</SectionCaption><ToggleField label="تفعيل الكوبون" checked={couponForm.is_active} onChange={event => setCouponForm(form => ({ ...form, is_active:event.target.checked }))} />
      </ModalShell>}

      {previewBanner && <ModalShell title="عرض البانر" onClose={() => setPreviewBanner(null)} footer={<button type="button" onClick={() => setPreviewBanner(null)} style={{ width:'100%', minHeight:'44px', border:'none', borderRadius:'11px', background:'#FF6A00', color:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'900', cursor:'pointer' }}>تم</button>}>
        <div style={{ overflow:'hidden', borderRadius:'14px', background:'#FFF7ED', border:'1px solid #FDE7D5', marginBottom:'14px', aspectRatio:'16 / 7', display:'grid', placeItems:'center', color:'#F97316' }}>{previewBanner.image_url ? <img src={previewBanner.image_url} alt={`معاينة ${previewBanner.title}`} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <Icon type="banner" size={34} />}</div>
        <div style={{ color:'#101828', fontFamily:'Tajawal,sans-serif', fontSize:'17px', fontWeight:'900' }}>{previewBanner.title}</div>
        {previewBanner.subtitle && <p style={{ margin:'5px 0 12px', color:'#667085', fontSize:'13px', lineHeight:1.6 }}>{previewBanner.subtitle}</p>}
        <div style={{ display:'flex', alignItems:'center', flexWrap:'wrap', gap:'6px' }}><StatusBadge status={getItemStatus(previewBanner, 'banner')} /><DisplayModeBadge mode={previewBanner.display_mode} /></div>
        <BannerDisplayPreview form={{ ...EMPTY_BANNER, ...previewBanner }} />
      </ModalShell>}

      {previewCoupon && <ModalShell title="عرض الكوبون" onClose={() => setPreviewCoupon(null)} footer={<button type="button" onClick={() => setPreviewCoupon(null)} style={{ width:'100%', minHeight:'44px', border:'none', borderRadius:'11px', background:'#FF6A00', color:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'900', cursor:'pointer' }}>تم</button>}>
        <div style={{ display:'flex', alignItems:'center', gap:'11px', padding:'12px', background:'#FFF7ED', border:'1px solid #FDE7D5', borderRadius:'13px', marginBottom:'14px' }}><span style={{ width:'46px', height:'46px', display:'grid', placeItems:'center', borderRadius:'12px', color:'#D94801', background:'#FFF0EB', fontWeight:'900', direction:'ltr' }}>{previewCoupon.discount_type === 'percent' ? `${previewCoupon.discount_value}%` : `${previewCoupon.discount_value} ﷼`}</span><div><div style={{ fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize:'17px', fontWeight:'900', direction:'ltr' }}>{previewCoupon.code}</div><div style={{ color:'#667085', fontSize:'12px', marginTop:'3px' }}>{previewCoupon.min_order_amount > 0 ? `للطلبات فوق ${previewCoupon.min_order_amount} ﷼` : 'بدون حد أدنى للطلب'}</div></div></div>
        <StatusBadge status={getItemStatus(previewCoupon, 'coupon')} />
      </ModalShell>}

      <ConfirmDialog open={!!confirmDeleteBanner} title="حذف البانر" body={confirmDeleteBanner ? `حذف بانر "${confirmDeleteBanner.title}"؟` : ''} confirmLabel="حذف" onCancel={() => setConfirmDeleteBanner(null)} onConfirm={() => { const banner = confirmDeleteBanner; setConfirmDeleteBanner(null); deleteBanner(banner) }} />
      <ConfirmDialog open={!!confirmDeleteCoupon} title="حذف الكوبون" body={confirmDeleteCoupon ? `حذف كوبون "${confirmDeleteCoupon.code}"؟` : ''} confirmLabel="حذف" onCancel={() => setConfirmDeleteCoupon(null)} onConfirm={() => { const coupon = confirmDeleteCoupon; setConfirmDeleteCoupon(null); deleteCoupon(coupon) }} />
    </AppShell>
  )
}
