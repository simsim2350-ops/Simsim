import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'
import AppShell from '../components/AppShell'
import { fetchAllTables, createTable, updateTable, deleteTable } from '../lib/tablesApi'
import ConfirmDialog from '../components/ConfirmDialog'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'

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

const fmtDate = (iso) => new Date(iso).toLocaleDateString('ar-SA', { day:'numeric', month:'short', year:'numeric' })

export default function Tables() {
  const navigate = useNavigate()
  const { restaurant } = useAuthStore()
  const [tables, setTables] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  useBodyScrollLock(modalOpen)
  const [editingTable, setEditingTable] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [tableNumber, setTableNumber] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!restaurant) return
    load()
  }, [restaurant])

  const load = async () => {
    setLoading(true)
    try {
      setTables(await fetchAllTables(restaurant.id))
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

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
    if (isDuplicate(value, editingTable?.id)) { toast.error('رقم الطاولة هذا مستخدم بالفعل'); return }

    setSaving(true)
    try {
      if (editingTable) {
        await updateTable(editingTable.id, { table_number: value })
        toast.success('تم تحديث الطاولة ✅')
      } else {
        await createTable(restaurant.id, { table_number: value, sort_order: tables.length })
        toast.success('تمت إضافة الطاولة 🎉')
      }
      setModalOpen(false)
      await load()
    } catch (err) {
      // 23505 = انتهاك قيد التفرّد على مستوى القاعدة (شبكة أمان إضافية بعد التحقق أعلاه)
      toast.error(err.code === '23505' ? 'رقم الطاولة هذا مستخدم بالفعل' : err.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (tb) => {
    try {
      await deleteTable(tb.id)
      toast.success('تم حذف الطاولة')
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const toggleStatus = async (tb) => {
    try {
      await updateTable(tb.id, { status: tb.status === 'active' ? 'inactive' : 'active' })
      load()
      toast.success(tb.status === 'active' ? 'تم تعطيل الطاولة 🚫' : 'تم تفعيل الطاولة ✅')
    } catch (err) {
      toast.error(err.message)
    }
  }

  // تبديل ترتيب طاولتين متجاورتين (بحسب sort_order) — نفس الترتيب يظهر للعميل في قائمة السلة
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
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  if (loading) return <Spinner />

  return (
    <AppShell
      active="tables"
      title="🪑 إدارة الطاولات"
      actions={<>
        <button onClick={() => navigate('/dashboard')} style={{ padding:'7px 12px', borderRadius:'9px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Cairo,sans-serif', fontWeight:'600', fontSize:'12px', cursor:'pointer', color:'#374151' }}>← الرئيسية</button>
        <button onClick={openAdd} style={{ padding:'7px 14px', borderRadius:'9px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer' }}>＋ طاولة جديدة</button>
      </>}
    >
      <div style={{ flex:1, overflowY:'auto', padding:'16px' }}>

        {tables.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px 16px', color:'#9CA3AF' }}>
            <div style={{ fontSize:'48px', opacity:0.3, marginBottom:'12px' }}>🪑</div>
            <div style={{ fontSize:'16px', fontWeight:'700', color:'#374151', marginBottom:'8px' }}>لا توجد طاولات مضافة</div>
            <div style={{ fontSize:'13px', marginBottom:'18px' }}>
              أضف طاولاتك ليختار العميل رقم طاولته من قائمة عند الطلب داخل المطعم — بدون كتابة يدوية
            </div>
            <button onClick={openAdd} style={{ padding:'12px 24px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'14px', cursor:'pointer' }}>
              ＋ إضافة أول طاولة
            </button>
          </div>
        ) : (
          <>
            <div style={{ position:'relative', marginBottom:'14px' }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="بحث عن طاولة..."
                style={{ width:'100%', padding:'10px 14px 10px 36px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'13px', outline:'none', textAlign:'right', boxSizing:'border-box' }}
              />
              <span style={{ position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)', fontSize:'14px', color:'#9CA3AF' }}>🔍</span>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
              {filtered.map((tb, i) => (
                <div key={tb.id} style={{ background:'white', borderRadius:'14px', border:'1.5px solid #E5E7EB', padding:'14px 16px', display:'flex', alignItems:'center', gap:'10px' }}>
                  <div style={{ display:'flex', flexDirection:'column', gap:'2px', flexShrink:0 }}>
                    <button onClick={() => move(tb, 'up')} disabled={i === 0} style={{ width:'22px', height:'18px', border:'none', background:'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? '#E5E7EB' : '#6B7280', fontSize:'11px' }}>▲</button>
                    <button onClick={() => move(tb, 'down')} disabled={i === filtered.length - 1} style={{ width:'22px', height:'18px', border:'none', background:'none', cursor: i === filtered.length - 1 ? 'default' : 'pointer', color: i === filtered.length - 1 ? '#E5E7EB' : '#6B7280', fontSize:'11px' }}>▼</button>
                  </div>

                  <div style={{ width:'40px', height:'40px', borderRadius:'10px', background:'#FFF0EB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', flexShrink:0 }}>🪑</div>

                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                      <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'15px' }}>{tb.table_number}</span>
                      {tb.status !== 'active' && <span style={{ fontSize:'10px', fontWeight:'700', color:'#9CA3AF', background:'#F3F4F6', padding:'2px 7px', borderRadius:'100px' }}>معطّلة</span>}
                    </div>
                    <div style={{ fontSize:'11px', color:'#9CA3AF', marginTop:'2px' }}>
                      أُنشئت {fmtDate(tb.created_at)}{tb.updated_at !== tb.created_at && ` · آخر تعديل ${fmtDate(tb.updated_at)}`}
                    </div>
                  </div>

                  <div style={{ display:'flex', gap:'5px', flexShrink:0 }}>
                    <button onClick={() => toggleStatus(tb)} style={{ padding:'5px 8px', borderRadius:'8px', border:'1.5px solid #E5E7EB', background: tb.status === 'active' ? '#D1FAE5' : '#F3F4F6', color: tb.status === 'active' ? '#065F46' : '#6B7280', fontSize:'11px', fontWeight:'700', cursor:'pointer' }}>
                      {tb.status === 'active' ? '👁️' : '🚫'}
                    </button>
                    <button onClick={() => openEdit(tb)} style={{ width:'30px', height:'30px', borderRadius:'8px', border:'1.5px solid #E5E7EB', background:'white', cursor:'pointer', fontSize:'13px' }}>✏️</button>
                    <button onClick={() => setConfirmDelete(tb)} style={{ width:'30px', height:'30px', borderRadius:'8px', border:'1.5px solid #FEE2E2', background:'#FEF2F2', cursor:'pointer', fontSize:'13px' }}>🗑️</button>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <div style={{ textAlign:'center', padding:'30px', color:'#9CA3AF', fontSize:'13px' }}>لا توجد نتائج مطابقة لبحثك</div>
              )}
            </div>
          </>
        )}
      </div>

      {modalOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div onClick={() => setModalOpen(false)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)' }}/>
          <div style={{ background:'white', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:'480px', padding:'20px', position:'relative', maxHeight:'85vh', overflowY:'auto' }}>
            <h3 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'18px', marginBottom:'16px' }}>
              {editingTable ? 'تعديل الطاولة' : 'طاولة جديدة'}
            </h3>

            <div style={{ marginBottom:'20px' }}>
              <label style={labelStyle}>رقم أو اسم الطاولة *</label>
              <input
                autoFocus
                style={inputStyle}
                value={tableNumber}
                onChange={e => setTableNumber(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && save()}
                placeholder="مثال: 12 أو VIP-1"
              />
            </div>

            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => setModalOpen(false)} style={{ flex:1, padding:'13px', borderRadius:'12px', border:'1.5px solid #E5E7EB', background:'white', color:'#374151', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'14px', cursor:'pointer' }}>
                إلغاء
              </button>
              <button onClick={save} disabled={saving} style={{ flex:2, padding:'13px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'14px', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? '...' : editingTable ? 'حفظ التعديلات' : 'إضافة الطاولة'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="حذف الطاولة"
        body={confirmDelete ? `حذف الطاولة "${confirmDelete.table_number}"؟` : ''}
        confirmLabel="حذف"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => { remove(confirmDelete); setConfirmDelete(null) }}
      />
    </AppShell>
  )
}
