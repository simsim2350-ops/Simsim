import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import QRCode from 'qrcode'
import { useAuthStore } from '../store/authStore'
import AppShell from '../components/AppShell'
import ConfirmDialog from '../components/ConfirmDialog'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { fetchBranches } from '../lib/branchesApi'
import { fetchAllTables, createTable, updateTable, deleteTable, regenerateTableQr } from '../lib/tablesApi'
import { printReport } from '../lib/exportUtils'

function Icon({ type, size = 16 }) {
  const paths = {
    table: 'M4 9h16M6 9v9m12-9v9M4 18h16M8 5h8v4H8z',
    plus: 'M12 5v14M5 12h14',
    back: 'M19 12H5m6-6l-6 6 6 6',
    search: 'm21 21-4.35-4.35M19 11a8 8 0 11-16 0 8 8 0z',
    up: 'm18 15-6-6-6 6', down: 'm6 9 6 6 6-6',
    edit: 'M4 20h4l10-10-4-4L4 16v4zM13 7l4 4',
    trash: 'M4 7h16M10 11v5m4-5v5M9 7l1-3h4l1 3m-9 0l1 14h10l1-14',
    power: 'M12 2v10m5.66-6.34a8 8 0 11-11.32 0',
    close: 'm18 6-12 12M6 6l12 12',
    calendar: 'M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z',
    refresh: 'M20 11a8 8 0 10-2.34 5.66M20 11V5m0 6h-6',
    qr: 'M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm11 0h2v2h-2v-2zm3 0h2v4h-2v-4zm-3 4h2v2h-2v-2zm3 0h2v2h-2v-2z',
    copy: 'M9 9h10v11H9zM5 5h10v4', download: 'M12 3v12m0 0 4-4m-4 4-4-4M5 21h14',
    print: 'M6 9V3h12v6M6 18H4V10h16v8h-2M7 15h10v6H7v-6z',
    branch: 'M4 20V4h16v16M8 8h2M14 8h2M8 12h2M14 12h2M8 16h2M14 16h2',
    link: 'M10 13a5 5 0 007.1.1l2-2a5 5 0 00-7.1-7.1l-1.1 1.1M14 11a5 5 0 00-7.1-.1l-2 2A5 5 0 0012 20l1.1-1.1',
    info: 'M12 8h.01M11 12h1v4h1M12 3a9 9 0 100 18 9 9 0 000-18',
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[type] || paths.table} /></svg>
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
  width:'100%', minHeight:'46px', padding:'11px 13px', border:'1.5px solid #E1E5EA', borderRadius:'11px',
  fontFamily:'Tajawal,sans-serif', fontSize:'14px', color:'#111827', outline:'none', boxSizing:'border-box', background:'white',
}
const labelStyle = { display:'block', fontSize:'12px', fontWeight:'800', marginBottom:'7px', color:'#374151' }
const fmtDate = (iso) => new Date(iso).toLocaleDateString('ar-SA', { day:'numeric', month:'short', year:'numeric' })
const fmtDateTime = (iso) => new Date(iso).toLocaleString('ar-SA', { day:'numeric', month:'short', hour:'numeric', minute:'2-digit' })
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]))

export default function Tables() {
  const navigate = useNavigate()
  const { restaurant } = useAuthStore()
  const { isMobile, isDesktop } = useBreakpoint()
  const [branches, setBranches] = useState([])
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [tables, setTables] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTable, setEditingTable] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [confirmQrAction, setConfirmQrAction] = useState(null)
  const [tableNumber, setTableNumber] = useState('')
  const [saving, setSaving] = useState(false)
  const [qrTable, setQrTable] = useState(null)
  const [qrUpdating, setQrUpdating] = useState(false)
  const canvasRef = useRef(null)
  useBodyScrollLock(modalOpen || !!qrTable)

  const selectedBranch = branches.find(branch => branch.id === selectedBranchId) || null

  useEffect(() => {
    if (!restaurant?.id) return
    let cancelled = false
    setLoading(true)
    fetchBranches(restaurant.id)
      .then(list => {
        if (cancelled) return
        setBranches(list)
        setSelectedBranchId(current => current || list.find(branch => branch.is_primary)?.id || list[0]?.id || '')
      })
      .catch(err => {
        if (!cancelled) {
          toast.error(err.message || 'تعذّر تحميل الفروع')
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [restaurant?.id])

  useEffect(() => {
    if (!restaurant?.id || !selectedBranchId) return
    loadTables()
  }, [restaurant?.id, selectedBranchId])

  useEffect(() => {
    if (!qrTable?.qr_token || !canvasRef.current || !restaurant?.slug) return
    QRCode.toCanvas(canvasRef.current, tableQrUrl(qrTable), {
      width: isMobile ? 220 : 250,
      margin: 2,
      color: { dark:'#0B0B0F', light:'#FFFFFF' },
      errorCorrectionLevel:'H',
    }).catch(err => console.error('Table QR Error:', err))
  }, [qrTable?.id, qrTable?.qr_token, restaurant?.slug, isMobile])

  const loadTables = async () => {
    setLoading(true)
    try {
      setTables(await fetchAllTables(restaurant.id, selectedBranchId))
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  const tableQrUrl = (table) => `${window.location.origin}/menu/${restaurant.slug}?branch=${encodeURIComponent(table.branch_id)}&table=${encodeURIComponent(table.qr_token)}`

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tables
    return tables.filter(tb => tb.table_number.toLowerCase().includes(q))
  }, [tables, search])

  const isDuplicate = (value, excludeId) =>
    tables.some(tb => tb.id !== excludeId && tb.table_number.trim().toLowerCase() === value.trim().toLowerCase())

  const openAdd = () => { setEditingTable(null); setTableNumber(''); setModalOpen(true) }
  const openEdit = (tb) => { setEditingTable(tb); setTableNumber(tb.table_number); setModalOpen(true) }

  const save = async () => {
    const value = tableNumber.trim()
    if (!value) { toast.error('أدخل رقم أو اسم الطاولة'); return }
    if (isDuplicate(value, editingTable?.id)) { toast.error('رقم الطاولة هذا مستخدم بالفعل في هذا الفرع'); return }

    setSaving(true)
    try {
      if (editingTable) {
        await updateTable(editingTable.id, { table_number: value })
        toast.success('تم تحديث الطاولة ✅')
      } else {
        await createTable(restaurant.id, { table_number: value, branch_id: selectedBranchId, sort_order: tables.length })
        toast.success('تمت إضافة الطاولة مع QR فريد 🎉')
      }
      setModalOpen(false)
      await loadTables()
    } catch (err) {
      toast.error(err.code === '23505' ? 'رقم الطاولة هذا مستخدم بالفعل في هذا الفرع' : err.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (tb) => {
    try {
      await deleteTable(tb.id)
      toast.success('تم حذف الطاولة')
      loadTables()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const toggleStatus = async (tb) => {
    try {
      await updateTable(tb.id, { status: tb.status === 'active' ? 'inactive' : 'active' })
      loadTables()
      toast.success(tb.status === 'active' ? 'تم تعطيل الطاولة 🚫' : 'تم تفعيل الطاولة ✅')
    } catch (err) {
      toast.error(err.message)
    }
  }

  const toggleQr = async (tb) => {
    setQrUpdating(true)
    try {
      const updated = await updateTable(tb.id, { qr_enabled: !tb.qr_enabled })
      setQrTable(current => current?.id === tb.id ? updated : current)
      await loadTables()
      toast.success(tb.qr_enabled ? 'تم تعطيل QR الطاولة' : 'تم تفعيل QR الطاولة ✅')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setQrUpdating(false)
    }
  }

  const regenerateQr = async () => {
    if (!confirmQrAction) return
    setQrUpdating(true)
    try {
      const token = await regenerateTableQr(confirmQrAction.id)
      setQrTable(current => current?.id === confirmQrAction.id ? { ...current, qr_token: token } : current)
      await loadTables()
      toast.success('تم إنشاء QR جديد وإبطال الرمز السابق ✅')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setQrUpdating(false)
      setConfirmQrAction(null)
    }
  }

  // تبديل ترتيب طاولتين متجاورتين في الفرع الحالي — نفس الترتيب يظهر للعميل في قائمة السلة.
  const move = async (tb, direction) => {
    const ordered = [...tables].sort((a, b) => a.sort_order - b.sort_order)
    const idx = ordered.findIndex(t => t.id === tb.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= ordered.length) return
    const other = ordered[swapIdx]
    try {
      await Promise.all([
        updateTable(tb.id, { sort_order: other.sort_order }),
        updateTable(other.id, { sort_order: tb.sort_order }),
      ])
      loadTables()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const copyQrUrl = async (table) => {
    const url = tableQrUrl(table)
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
        const copied = document.execCommand('copy')
        document.body.removeChild(textarea)
        if (!copied) throw new Error('copy failed')
      }
      toast.success('تم نسخ رابط الطاولة 📋')
    } catch {
      toast.error('تعذّر نسخ الرابط، انسخه يدويًا من الحقل')
    }
  }

  const downloadQr = () => {
    const canvas = canvasRef.current
    if (!canvas || !qrTable) return
    const link = document.createElement('a')
    link.download = `table-qr-${qrTable.table_number}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
    toast.success('تم تحميل QR الطاولة ✅')
  }

  const printQr = () => {
    const canvas = canvasRef.current
    if (!canvas || !qrTable || !canvas.width || !canvas.height) {
      toast.error('انتظر حتى يكتمل إنشاء QR ثم حاول الطباعة مجددًا')
      return
    }

    const url = tableQrUrl(qrTable)
    const branchName = selectedBranch?.name || 'الفرع'
    const qrImage = canvas.toDataURL('image/png')

    // لا نستخدم window.open: بعض متصفحات الهاتف تفتح about:blank ولا تسمح بتحميل محتوى النافذة.
    // iframe يفتح واجهة الطباعة الأصلية في السياق الحالي، بما يدعم الطباعة أو الحفظ كـ PDF بلا تبويب أبيض.
    printReport({
      title: `QR — ${qrTable.table_number}`,
      subtitle: `${restaurant?.name || 'مطعمك'} · ${branchName}`,
      sections: [{
        html: `<style>@page{size:auto;margin:12mm}.table-qr-print{max-width:360px;margin:0 auto;border:1.5px solid #F1D2BF;border-radius:24px;overflow:hidden;text-align:center}.table-qr-print__top{background:linear-gradient(135deg,#FF6A00,#E05D00);padding:26px 20px 22px;color:#fff}.table-qr-print__brand{font-size:22px;font-weight:900;line-height:1.25}.table-qr-print__branch{margin-top:5px;font-size:12px;opacity:.82}.table-qr-print__body{padding:24px 22px 22px}.table-qr-print__label{display:inline-block;padding:5px 10px;border-radius:999px;background:#FFF0EB;color:#C2410C;font-size:11px;font-weight:800;margin-bottom:9px}.table-qr-print__table{font-size:28px;font-weight:900;margin-bottom:5px}.table-qr-print__copy{color:#6B7280;font-size:13px;line-height:1.6;margin:0 auto 18px;max-width:240px}.table-qr-print__image{width:238px;height:238px;display:block;margin:0 auto 18px}.table-qr-print__url{direction:ltr;word-break:break-all;color:#9CA3AF;font-size:8px;line-height:1.45;border-top:1px solid #F0F2F4;padding-top:12px}.table-qr-print__foot{margin-top:14px;color:#9CA3AF;font-size:10px}</style><main class="table-qr-print"><section class="table-qr-print__top"><div class="table-qr-print__brand">${escapeHtml(restaurant?.name || 'مطعمك')}</div><div class="table-qr-print__branch">${escapeHtml(branchName)}</div></section><section class="table-qr-print__body"><div class="table-qr-print__label">QR الطاولة</div><div class="table-qr-print__table">${escapeHtml(qrTable.table_number)}</div><p class="table-qr-print__copy">امسح الكود لفتح المنيو والطلب من هذه الطاولة</p><img class="table-qr-print__image" src="${qrImage}" alt="QR للطاولة"><div class="table-qr-print__url">${escapeHtml(url)}</div><div class="table-qr-print__foot">SimSim — طلبك يصل للطاولة مباشرة</div></section></main>`,
      }],
    })
  }

  const PageTitle = (
    <span style={{ display:'inline-flex', alignItems:'center', gap:'10px', minWidth:0 }}>
      <span style={{ width:isMobile?'42px':'44px', height:isMobile?'42px':'44px', borderRadius:'12px', display:'grid', placeItems:'center', color:'#FF6A00', background:'#FFF0EB', border:'1px solid #FFD4BE', flexShrink:0 }}><Icon type="table" size={20}/></span>
      <span style={{ display:'flex', flexDirection:'column', gap:'2px', minWidth:0 }}>
        <strong style={{ fontSize:isMobile?'18px':'22px', fontWeight:'900', letterSpacing:'-0.025em', lineHeight:1.15 }}>إدارة الطاولات</strong>
        <small style={{ fontSize:isMobile?'10px':'11px', color:'#9CA3AF', fontWeight:'600', whiteSpace:'nowrap' }}>نظّم طاولات مطعمك وروابط QR الخاصة بها</small>
      </span>
    </span>
  )

  const ActionButton = ({ children, onClick, label, danger=false, primary=false, disabled=false, style={} }) => (
    <button aria-label={label} title={label} onClick={onClick} disabled={disabled} style={{ minHeight:'38px', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:'6px', padding:'7px 10px', borderRadius:'10px', border:primary ? '1px solid #FF6A00' : danger ? '1px solid #FECACA' : '1px solid #E1E5EA', background:primary ? '#FF6A00' : danger ? '#FEF2F2' : 'white', color:primary ? 'white' : danger ? '#B91C1C' : '#374151', fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'11.5px', cursor:disabled ? 'default' : 'pointer', opacity:disabled ? 0.45 : 1, ...style }}>{children}</button>
  )

  const TableCard = ({ tb, index }) => {
    const active = tb.status === 'active'
    const atFirst = index === 0
    const atLast = index === filtered.length - 1
    const qrLive = active && tb.qr_enabled
    return (
      <article style={{ background:'white', border:'1px solid #E7E9ED', borderRadius:'15px', boxShadow:'0 2px 10px rgba(17,24,39,0.035)', padding:isMobile?'14px':'16px', display:'flex', flexDirection:'column', minHeight:isDesktop?'270px':'auto', overflow:'hidden' }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:'10px', marginBottom:'13px' }}>
          <span style={{ width:'40px', height:'40px', display:'grid', placeItems:'center', borderRadius:'11px', color:active?'#FF6A00':'#697386', background:active?'#FFF0EB':'#F4F6F8', border:active?'1px solid #FFE0CC':'1px solid #E9EDF1', flexShrink:0 }}><Icon type="table" size={19}/></span>
          <div style={{ flex:1, minWidth:0, paddingTop:'1px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap', marginBottom:'5px' }}>
              <strong dir="auto" style={{ display:'block', maxWidth:'100%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'#111827', fontSize:'15px', fontWeight:'900', letterSpacing:'-0.01em' }}>{tb.table_number}</strong>
              <span style={{ display:'inline-flex', alignItems:'center', gap:'5px', padding:'3px 7px', borderRadius:'999px', color:active?'#047857':'#6B7280', background:active?'#ECFDF5':'#F3F4F6', border:active?'1px solid #D1FAE5':'1px solid #E5E7EB', fontSize:'10px', fontWeight:'800', whiteSpace:'nowrap' }}><i style={{ width:'6px', height:'6px', borderRadius:'50%', background:active?'#10B981':'#9CA3AF' }}/>{active ? 'نشطة' : 'معطّلة'}</span>
            </div>
            <span style={{ fontSize:'10.5px', fontWeight:'700', color:'#9CA3AF' }}>طاولة داخل {selectedBranch?.name || 'الفرع'}</span>
          </div>
          <div aria-label="ترتيب الطاولة" style={{ display:'flex', alignItems:'center', gap:'2px', padding:'3px', border:'1px solid #E8EBEF', borderRadius:'9px', background:'#FAFBFC', flexShrink:0 }}>
            <button aria-label="تحريك الطاولة للأعلى" title="تحريك للأعلى" onClick={() => move(tb, 'up')} disabled={atFirst} style={{ width:'27px', height:'27px', display:'grid', placeItems:'center', border:0, borderRadius:'6px', background:'transparent', color:atFirst?'#D6DAE0':'#6B7280', cursor:atFirst?'default':'pointer', padding:0 }}><Icon type="up" size={15}/></button>
            <button aria-label="تحريك الطاولة للأسفل" title="تحريك للأسفل" onClick={() => move(tb, 'down')} disabled={atLast} style={{ width:'27px', height:'27px', display:'grid', placeItems:'center', border:0, borderRadius:'6px', background:'transparent', color:atLast?'#D6DAE0':'#6B7280', cursor:atLast?'default':'pointer', padding:0 }}><Icon type="down" size={15}/></button>
          </div>
        </div>

        <div style={{ display:'grid', gap:'7px', padding:'10px 11px', marginBottom:'13px', borderRadius:'11px', background:'#FAFBFC', border:'1px solid #F0F2F4' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'7px', minWidth:0, color:qrLive?'#047857':'#6B7280', fontSize:'10.5px', fontWeight:'700' }}><span style={{ width:'22px', height:'22px', display:'grid', placeItems:'center', borderRadius:'7px', background:qrLive?'#ECFDF5':'white', color:qrLive?'#059669':'#9CA3AF', flexShrink:0 }}><Icon type="qr" size={12}/></span><span>{qrLive ? 'QR نشط وجاهز للمسح' : tb.qr_enabled ? 'QR ينتظر تفعيل الطاولة' : 'QR معطّل'}</span></div>
          <div style={{ display:'flex', alignItems:'center', gap:'7px', minWidth:0, color:'#6B7280', fontSize:'10.5px', fontWeight:'600' }}><span style={{ width:'22px', height:'22px', display:'grid', placeItems:'center', borderRadius:'7px', background:'white', color:'#9CA3AF', flexShrink:0 }}><Icon type={tb.qr_last_used_at ? 'refresh' : 'calendar'} size={12}/></span><span>{tb.qr_last_used_at ? `آخر استخدام ${fmtDateTime(tb.qr_last_used_at)}` : `أُنشئت ${fmtDate(tb.created_at)}`}</span></div>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:'7px', marginTop:'auto', paddingTop:'12px', borderTop:'1px solid #F0F2F4' }}>
          <ActionButton label="QR الطاولة" onClick={() => setQrTable(tb)} primary style={{ flex:1 }}><Icon type="qr" size={14}/>QR الطاولة</ActionButton>
          <ActionButton label={active ? 'تعطيل الطاولة' : 'تفعيل الطاولة'} onClick={() => toggleStatus(tb)} style={{ width:'38px', padding:0, color:active?'#047857':'#475569', background:active?'#ECFDF5':'#F8FAFC', border:active?'1px solid #D1FAE5':'1px solid #E2E8F0' }}><Icon type="power" size={14}/></ActionButton>
          <ActionButton label="تعديل الطاولة" onClick={() => openEdit(tb)} style={{ width:'38px', padding:0 }}><Icon type="edit" size={15}/></ActionButton>
          <ActionButton label="حذف الطاولة" onClick={() => setConfirmDelete(tb)} danger style={{ width:'38px', padding:0 }}><Icon type="trash" size={15}/></ActionButton>
        </div>
      </article>
    )
  }

  if (loading) return <Spinner />

  return (
    <AppShell
      active="tables"
      title={PageTitle}
      headerStacked
      actions={<div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'8px', width:'100%' }}>
        <button onClick={() => navigate('/dashboard')} style={{ minHeight:'38px', display:'inline-flex', alignItems:'center', gap:'6px', padding:'7px 11px', borderRadius:'10px', border:'1px solid #E1E5EA', background:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'12px', cursor:'pointer', color:'#374151' }}><Icon type="back" size={14}/> الرئيسية</button>
        <button onClick={openAdd} style={{ minHeight:'38px', display:'inline-flex', alignItems:'center', gap:'6px', padding:'7px 13px', borderRadius:'10px', border:'1px solid #FF6A00', background:'#FF6A00', color:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'12px', cursor:'pointer' }}><Icon type="plus" size={14}/> طاولة جديدة</button>
      </div>}
    >
      <div style={{ flex:1, overflowY:'auto', padding:isDesktop?'24px':'16px', background:'#F8F9FB' }}>
        <div style={{ maxWidth:'1120px', margin:'0 auto', paddingBottom:isMobile?'8px':'12px' }}>
          {branches.length > 1 && (
            <div style={{ display:'flex', alignItems:'center', gap:'8px', maxWidth:isDesktop?'420px':'none', marginBottom:'12px' }}>
              <span style={{ width:'36px', height:'36px', display:'grid', placeItems:'center', borderRadius:'10px', background:'#FFF0EB', color:'#FF6A00', border:'1px solid #FFDCC9', flexShrink:0 }}><Icon type="branch" size={16}/></span>
              <select aria-label="اختيار الفرع" value={selectedBranchId} onChange={e => setSelectedBranchId(e.target.value)} style={{ minWidth:0, flex:1, minHeight:'40px', padding:'8px 11px', border:'1.5px solid #E1E5EA', borderRadius:'10px', background:'white', color:'#374151', fontFamily:'Tajawal,sans-serif', fontSize:'12px', fontWeight:'800', outline:'none', cursor:'pointer' }}>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.is_primary ? 'الرئيسي — ' : ''}{branch.name}</option>)}</select>
            </div>
          )}

          {tables.length === 0 ? (
            <section style={{ minHeight:'280px', display:'grid', placeItems:'center', textAlign:'center', background:'white', border:'1px dashed #D8DCE3', borderRadius:'16px', padding:'30px 22px' }}>
              <div style={{ maxWidth:'390px' }}>
                <span style={{ width:'50px', height:'50px', display:'grid', placeItems:'center', margin:'0 auto 13px', borderRadius:'14px', background:'#FFF0EB', color:'#FF6A00', border:'1px solid #FFDCC9' }}><Icon type="table" size={23}/></span>
                <strong style={{ display:'block', fontSize:'16px', color:'#111827', marginBottom:'6px' }}>لا توجد طاولات مضافة</strong>
                <span style={{ display:'block', fontSize:'12px', lineHeight:1.7, color:'#6B7280', marginBottom:'16px' }}>أضف طاولة ليُنشأ لها QR فريد يستطيع العميل من خلاله فتح المنيو والطلب مباشرةً.</span>
                <button onClick={openAdd} style={{ minHeight:'40px', display:'inline-flex', alignItems:'center', gap:'6px', padding:'8px 14px', borderRadius:'10px', border:'1px solid #FF6A00', background:'#FF6A00', color:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'12px', cursor:'pointer' }}><Icon type="plus" size={14}/> إضافة أول طاولة</button>
              </div>
            </section>
          ) : (
            <>
              <div style={{ position:'relative', width:'100%', maxWidth:isDesktop?'420px':'none', marginBottom:'16px' }}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث عن طاولة..." aria-label="بحث عن طاولة" style={{ width:'100%', minHeight:'42px', padding:'10px 41px 10px 13px', border:'1.5px solid #E1E5EA', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'12.5px', outline:'none', textAlign:'right', color:'#111827', background:'white', boxSizing:'border-box', boxShadow:'0 1px 2px rgba(17,24,39,0.02)' }} />
                <span style={{ position:'absolute', right:'13px', top:'50%', transform:'translateY(-50%)', display:'grid', placeItems:'center', color:'#9CA3AF' }}><Icon type="search" size={15}/></span>
              </div>
              {filtered.length > 0 ? <section aria-label="قائمة الطاولات" style={{ display:'grid', gridTemplateColumns:isDesktop?'repeat(auto-fit,minmax(300px,1fr))':'1fr', gap:isMobile?'12px':'14px' }}>{filtered.map((tb, index) => <TableCard key={tb.id} tb={tb} index={index} />)}</section> : <section style={{ minHeight:'180px', display:'grid', placeItems:'center', textAlign:'center', background:'white', border:'1px dashed #D8DCE3', borderRadius:'15px', padding:'26px' }}><div><span style={{ display:'block', fontSize:'13px', fontWeight:'800', color:'#374151', marginBottom:'5px' }}>لا توجد نتائج مطابقة لبحثك</span><span style={{ display:'block', color:'#9CA3AF', fontSize:'11.5px' }}>جرّب رقمًا أو اسمًا مختلفًا للطاولة.</span></div></section>}
            </>
          )}
        </div>
      </div>

      {modalOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div onClick={() => setModalOpen(false)} style={{ position:'absolute', inset:0, background:'rgba(15,23,42,0.48)' }}/>
          <section role="dialog" aria-modal="true" aria-labelledby="table-editor-title" style={{ background:'white', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:'480px', padding:'14px 20px 20px', position:'relative', maxHeight:'85vh', overflowY:'auto', boxShadow:'0 -10px 34px rgba(15,23,42,0.16)' }}>
            <span style={{ display:'block', width:'38px', height:'4px', background:'#E5E7EB', borderRadius:'999px', margin:'0 auto 16px' }}/>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'10px', marginBottom:'18px' }}><div style={{ display:'flex', alignItems:'center', gap:'9px' }}><span style={{ width:'34px', height:'34px', display:'grid', placeItems:'center', color:'#FF6A00', background:'#FFF0EB', borderRadius:'10px' }}><Icon type="table" size={16}/></span><h3 id="table-editor-title" style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'18px', margin:0 }}>{editingTable ? 'تعديل الطاولة' : 'طاولة جديدة'}</h3></div><button aria-label="إغلاق" title="إغلاق" onClick={() => setModalOpen(false)} style={{ width:'34px', height:'34px', border:'1px solid #E1E5EA', borderRadius:'9px', background:'white', color:'#6B7280', display:'grid', placeItems:'center', cursor:'pointer', padding:0 }}><Icon type="close" size={16}/></button></div>
            <div style={{ marginBottom:'20px' }}><label style={labelStyle}>رقم أو اسم الطاولة <span style={{ color:'#DC2626' }}>*</span></label><input autoFocus style={inputStyle} value={tableNumber} onChange={e => setTableNumber(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()} placeholder="مثال: 12 أو VIP-1" /><span style={{ display:'block', marginTop:'6px', color:'#9CA3AF', fontSize:'10.5px', lineHeight:1.5 }}>{editingTable ? 'يبقى QR ثابتًا حتى عند تغيير اسم الطاولة.' : 'سيُنشأ QR فريد وآمن لهذه الطاولة تلقائيًا.'}</span></div>
            <div style={{ display:'flex', gap:'10px' }}><button onClick={() => setModalOpen(false)} style={{ flex:1, minHeight:'44px', padding:'11px', borderRadius:'11px', border:'1.5px solid #E1E5EA', background:'white', color:'#374151', fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'13px', cursor:'pointer' }}>إلغاء</button><button onClick={save} disabled={saving} style={{ flex:2, minHeight:'44px', padding:'11px', borderRadius:'11px', border:'1px solid #FF6A00', background:saving ? '#F3A26A' : '#FF6A00', color:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'13px', cursor:saving ? 'default' : 'pointer', opacity:saving ? 0.8 : 1 }}>{saving ? 'جارٍ الحفظ...' : editingTable ? 'حفظ التعديلات' : 'إضافة الطاولة'}</button></div>
          </section>
        </div>
      )}

      {qrTable && (
        <div style={{ position:'fixed', inset:0, zIndex:110, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div onClick={() => setQrTable(null)} style={{ position:'absolute', inset:0, background:'rgba(15,23,42,0.5)' }}/>
          <section role="dialog" aria-modal="true" aria-labelledby="table-qr-title" style={{ background:'white', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:'480px', padding:'14px 20px 22px', position:'relative', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 -10px 34px rgba(15,23,42,0.18)' }}>
            <span style={{ display:'block', width:'38px', height:'4px', background:'#E5E7EB', borderRadius:'999px', margin:'0 auto 16px' }}/>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'10px', marginBottom:'14px' }}><div style={{ minWidth:0 }}><h3 id="table-qr-title" style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'17px', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>QR — {qrTable.table_number}</h3><span style={{ display:'block', color:'#9CA3AF', fontSize:'10.5px', fontWeight:'700', marginTop:'2px' }}>امسح الكود لفتح المنيو والطلب من هذه الطاولة</span></div><button aria-label="إغلاق" onClick={() => setQrTable(null)} style={{ width:'34px', height:'34px', display:'grid', placeItems:'center', border:'1px solid #E1E5EA', borderRadius:'9px', background:'white', color:'#6B7280', cursor:'pointer', padding:0, flexShrink:0 }}><Icon type="close" size={16}/></button></div>
            <div style={{ display:'grid', placeItems:'center', padding:'16px', marginBottom:'14px', background:'#FAFBFC', border:'1px solid #F0F2F4', borderRadius:'16px' }}><canvas ref={canvasRef} style={{ display:'block', width:isMobile?'220px':'250px', height:isMobile?'220px':'250px', background:'white', borderRadius:'10px' }} /></div>
            <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px 11px', marginBottom:'12px', background:qrTable.qr_enabled ? '#ECFDF5' : '#F3F4F6', border:`1px solid ${qrTable.qr_enabled ? '#D1FAE5' : '#E5E7EB'}`, borderRadius:'11px' }}><span style={{ width:'8px', height:'8px', borderRadius:'50%', background:qrTable.qr_enabled ? '#10B981' : '#9CA3AF', flexShrink:0 }}/><strong style={{ flex:1, color:qrTable.qr_enabled ? '#047857' : '#6B7280', fontSize:'11.5px' }}>QR {qrTable.qr_enabled ? 'نشط' : 'معطّل'}</strong>{qrTable.qr_last_used_at && <span style={{ color:'#6B7280', fontSize:'10px' }}>آخر استخدام {fmtDateTime(qrTable.qr_last_used_at)}</span>}</div>
            <div style={{ marginBottom:'14px' }}><label style={{ ...labelStyle, color:'#6B7280' }}>رابط الطاولة</label><div style={{ display:'flex', gap:'7px' }}><input readOnly value={tableQrUrl(qrTable)} style={{ ...inputStyle, minWidth:0, flex:1, minHeight:'40px', padding:'8px 10px', background:'#F8F9FB', color:'#6B7280', fontSize:'10px', direction:'ltr', textAlign:'left' }}/><ActionButton label="نسخ رابط الطاولة" onClick={() => copyQrUrl(qrTable)} style={{ minHeight:'40px', width:'40px', padding:0 }}><Icon type="copy" size={15}/></ActionButton></div></div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'10px' }}><ActionButton label="تحميل QR" onClick={downloadQr} style={{ minHeight:'42px' }}><Icon type="download" size={15}/>تحميل QR</ActionButton><ActionButton label="طباعة QR" onClick={printQr} style={{ minHeight:'42px' }}><Icon type="print" size={15}/>طباعة QR</ActionButton></div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}><ActionButton label={qrTable.qr_enabled ? 'تعطيل QR' : 'تفعيل QR'} onClick={() => toggleQr(qrTable)} disabled={qrUpdating} style={{ minHeight:'42px', color:qrTable.qr_enabled?'#B45309':'#047857', background:qrTable.qr_enabled?'#FFFBEB':'#ECFDF5', border:qrTable.qr_enabled?'1px solid #FDE68A':'1px solid #D1FAE5' }}><Icon type="power" size={15}/>{qrTable.qr_enabled ? 'تعطيل QR' : 'تفعيل QR'}</ActionButton><ActionButton label="إعادة إنشاء QR" onClick={() => setConfirmQrAction(qrTable)} disabled={qrUpdating} danger style={{ minHeight:'42px' }}><Icon type="refresh" size={15}/>إعادة إنشاء</ActionButton></div>
          </section>
        </div>
      )}

      <ConfirmDialog open={!!confirmDelete} title="حذف الطاولة" body={confirmDelete ? `حذف الطاولة "${confirmDelete.table_number}"؟` : ''} confirmLabel="حذف" onCancel={() => setConfirmDelete(null)} onConfirm={() => { remove(confirmDelete); setConfirmDelete(null) }} />
      <ConfirmDialog open={!!confirmQrAction} icon="▦" title="إعادة إنشاء QR؟" body={confirmQrAction ? `سيبطل QR القديم للطاولة "${confirmQrAction.table_number}" فورًا، وسيعمل الرابط الجديد فقط.` : ''} confirmLabel="إعادة الإنشاء" danger={false} onCancel={() => setConfirmQrAction(null)} onConfirm={regenerateQr} />
    </AppShell>
  )
}
