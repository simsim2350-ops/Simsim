import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { appConfig } from '../config'
import { useAuthStore } from '../store/authStore'
import AppShell from '../components/AppShell'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { fetchBranches } from '../lib/branchesApi'

// عميل ثانوي لإنشاء حسابات الموظفين دون التأثير على جلسة صاحب المطعم.
// الإعدادات من طبقة config الموحّدة (نفس قيم العميل الرئيسي، بلا قراءة import.meta.env هنا).
const signupClient = createClient(
  appConfig.supabaseUrl,
  appConfig.supabaseAnonKey,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

// الصفحات القابلة للتخصيص للموظف (الإعدادات وإدارة الموظفين محصورة بصاحب المطعم)
const PAGES = [
  { key:'orders',    label:'الطلبات',   icon:'📋' },
  { key:'menu',      label:'المنيو',    icon:'🍽️' },
  { key:'customers', label:'العملاء',   icon:'👥' },
  { key:'analytics', label:'التحليلات', icon:'📊' },
  { key:'loyalty',   label:'الولاء',    icon:'⭐' },
  { key:'qr',        label:'QR',        icon:'🔳' },
]

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

const emptyForm = { username:'', password:'', allowed_pages:[], branch_scope:'all', all_pages:false }

export default function Staff() {
  const navigate = useNavigate()
  const { restaurant } = useAuthStore()
  const [members, setMembers] = useState([])
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  useBodyScrollLock(modalOpen)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)

  useEffect(() => {
    if (!restaurant) return
    fetchAll()
  }, [restaurant])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [{ data: mem }, br] = await Promise.all([
        supabase.from('restaurant_members').select('*').eq('restaurant_id', restaurant.id).order('created_at', { ascending: false }),
        fetchBranches(restaurant.id),
      ])
      setMembers(mem || [])
      setBranches(br || [])
    } finally {
      setLoading(false)
    }
  }

  const openAdd = () => { setEditing(null); setForm(emptyForm); setModalOpen(true) }
  const openEdit = (m) => {
    setEditing(m)
    setForm({
      username: m.username,
      password: '',
      allowed_pages: Array.isArray(m.allowed_pages) ? m.allowed_pages.filter(p => p !== 'all') : [],
      branch_scope: m.branch_scope || 'all',
      all_pages: Array.isArray(m.allowed_pages) && m.allowed_pages.includes('all'),
    })
    setModalOpen(true)
  }

  const togglePage = (key) => {
    setForm(f => ({
      ...f,
      allowed_pages: f.allowed_pages.includes(key)
        ? f.allowed_pages.filter(p => p !== key)
        : [...f.allowed_pages, key],
    }))
  }

  const buildEmail = (username) => `${username.toLowerCase()}.${restaurant.slug}@staff.simsim.app`

  const handleSave = async () => {
    const username = form.username.trim().toLowerCase()
    // تحقّق من اسم المستخدم (يبدأ بحرف إنجليزي، ثم حروف/أرقام/_ . -)
    if (!/^[a-z][a-z0-9._-]{2,}$/.test(username)) {
      toast.error('اسم المستخدم يبدأ بحرف إنجليزي (3 أحرف على الأقل، بدون مسافات)')
      return
    }
    const pages = form.all_pages ? ['all'] : form.allowed_pages
    if (pages.length === 0) { toast.error('اختر صفحة واحدة على الأقل'); return }

    setSaving(true)
    try {
      if (editing) {
        // تعديل الصلاحيات فقط (اسم المستخدم وكلمة المرور لا يُعدّلان هنا)
        const { error } = await supabase.from('restaurant_members').update({
          allowed_pages: pages,
          branch_scope: form.branch_scope || 'all',
        }).eq('id', editing.id)
        if (error) throw error
        toast.success('تم تحديث صلاحيات الموظف')
      } else {
        // إنشاء موظف جديد
        if (form.password.length < 6) { toast.error('كلمة المرور 6 أحرف على الأقل'); setSaving(false); return }
        const email = buildEmail(username)
        // 1) إنشاء حساب المصادقة عبر العميل الثانوي (لا يؤثر على جلسة صاحب المطعم)
        const { data: signData, error: signErr } = await signupClient.auth.signUp({ email, password: form.password })
        if (signErr) {
          if (String(signErr.message).toLowerCase().includes('already')) {
            toast.error('اسم المستخدم مستخدم مسبقاً، اختر غيره')
          } else {
            toast.error(signErr.message || 'تعذّر إنشاء الحساب')
          }
          setSaving(false); return
        }
        const newUserId = signData?.user?.id
        if (!newUserId) { toast.error('تعذّر إنشاء الحساب'); setSaving(false); return }
        await signupClient.auth.signOut()

        // 2) ربط الموظف بالمطعم وصلاحياته
        const { error: memErr } = await supabase.from('restaurant_members').insert({
          restaurant_id: restaurant.id,
          user_id: newUserId,
          username,
          allowed_pages: pages,
          branch_scope: form.branch_scope || 'all',
          is_active: true,
        })
        if (memErr) throw memErr
        toast.success('تم إنشاء الموظف 🎉')
      }
      setModalOpen(false)
      fetchAll()
    } catch (err) {
      toast.error(err.message || 'حدث خطأ')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (m) => {
    await supabase.from('restaurant_members').update({ is_active: !m.is_active }).eq('id', m.id)
    fetchAll()
  }

  const removeMember = async (m) => {
    if (!confirm(`حذف الموظف "${m.username}" نهائياً؟`)) return
    try {
      const { data, error } = await supabase.functions.invoke('delete-staff', {
        body: { member_id: m.id },
      })
      if (error) {
        // احتياط: لو الدالة غير منشورة، احذف العضوية مباشرة على الأقل
        const { data: del, error: delErr } = await supabase.from('restaurant_members').delete().eq('id', m.id).select()
        if (delErr || !del || del.length === 0) {
          toast.error('تعذّر الحذف — تأكد من نشر دالة delete-staff')
          return
        }
        toast.success('تم حذف الموظف (الحساب قد يبقى)')
        fetchAll()
        return
      }
      if (data?.warning) toast.success('تم الحذف (بقي حساب الدخول)')
      else toast.success('تم حذف الموظف نهائياً')
      fetchAll()
    } catch (err) {
      toast.error(err.message || 'حدث خطأ')
    }
  }

  const branchLabel = (scope) => {
    if (!scope || scope === 'all') return 'كل الفروع'
    const b = branches.find(x => x.id === scope)
    return b ? `${b.is_primary ? '🏠' : '🏢'} ${b.name}` : '🏢 فرع'
  }

  const pagesSummary = (m) => {
    if (Array.isArray(m.allowed_pages) && m.allowed_pages.includes('all')) return 'كل الصفحات'
    if (!Array.isArray(m.allowed_pages) || m.allowed_pages.length === 0) return '—'
    return m.allowed_pages.map(k => PAGES.find(p => p.key === k)?.label || k).join('، ')
  }

  const copyLoginLink = () => {
    const link = `${window.location.origin}/staff-login/${restaurant.slug}`
    navigator.clipboard?.writeText(link).then(
      () => toast.success('تم نسخ رابط دخول الموظفين 📋'),
      () => toast.error('تعذّر النسخ')
    )
  }

  if (!restaurant || loading) return <Spinner />

  return (
    <AppShell title="الموظفون" active="staff"
      actions={<button onClick={openAdd} style={{ padding:'10px 16px', borderRadius:'11px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'14px', cursor:'pointer' }}>+ إضافة موظف</button>}
    >
      <div style={{ maxWidth:'760px' }}>
        <div style={{ background:'#0F1117', borderRadius:'14px', padding:'14px 16px', marginBottom:'14px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'10px', flexWrap:'wrap' }}>
          <div style={{ color:'white' }}>
            <div style={{ fontWeight:'800', fontSize:'14px', fontFamily:'Cairo,sans-serif' }}>🔗 رابط دخول الموظفين</div>
            <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.6)', direction:'ltr', textAlign:'left', marginTop:'2px' }}>/staff-login/{restaurant.slug}</div>
          </div>
          <button onClick={copyLoginLink} style={{ padding:'9px 16px', borderRadius:'10px', border:'none', background:'#FF6B35', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'13px', cursor:'pointer' }}>نسخ الرابط</button>
        </div>

        {members.length === 0 ? (
          <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', padding:'40px 20px', textAlign:'center', color:'#9CA3AF' }}>
            <div style={{ fontSize:'40px', marginBottom:'10px' }}>👥</div>
            <div style={{ fontWeight:'700', marginBottom:'4px', color:'#374151' }}>لا يوجد موظفون بعد</div>
            <div style={{ fontSize:'13px' }}>أضف موظفاً وحدّد الصفحات والفرع المسموح له</div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
            {members.map(m => (
              <div key={m.id} style={{ background:'white', borderRadius:'14px', border:'1px solid #E5E7EB', padding:'14px 16px' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'10px', flexWrap:'wrap' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                    <div style={{ width:'40px', height:'40px', borderRadius:'10px', background:'#F8F9FB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px' }}>👤</div>
                    <div>
                      <div style={{ fontWeight:'800', fontSize:'15px', fontFamily:'Cairo,sans-serif' }}>{m.username}</div>
                      <div style={{ fontSize:'12px', color:'#6B7280' }}>
                        {pagesSummary(m)} · {branchLabel(m.branch_scope)}
                      </div>
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                    <button onClick={() => toggleActive(m)} style={{ padding:'6px 10px', borderRadius:'8px', border:'1px solid #E5E7EB', background: m.is_active ? '#ECFDF5' : '#FEF2F2', color: m.is_active ? '#059669' : '#DC2626', fontSize:'12px', fontWeight:'700', cursor:'pointer' }}>
                      {m.is_active ? 'مفعّل' : 'موقوف'}
                    </button>
                    <button onClick={() => openEdit(m)} style={{ padding:'6px 10px', borderRadius:'8px', border:'1px solid #E5E7EB', background:'white', fontSize:'12px', fontWeight:'700', cursor:'pointer' }}>تعديل</button>
                    <button onClick={() => removeMember(m)} style={{ padding:'6px 10px', borderRadius:'8px', border:'1px solid #FECACA', background:'white', color:'#DC2626', fontSize:'12px', fontWeight:'700', cursor:'pointer' }}>حذف</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <div onClick={() => setModalOpen(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, padding:'16px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'white', borderRadius:'18px', padding:'22px', width:'100%', maxWidth:'440px', maxHeight:'88vh', overflowY:'auto', direction:'rtl' }}>
            <h2 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'18px', marginBottom:'16px' }}>
              {editing ? `تعديل: ${editing.username}` : 'إضافة موظف'}
            </h2>

            {!editing && (
              <>
                <div style={{ marginBottom:'14px' }}>
                  <label style={labelStyle}>اسم المستخدم (إنجليزي) *</label>
                  <input style={{ ...inputStyle, direction:'ltr', textAlign:'left' }} value={form.username} onChange={e => setForm(f=>({...f,username:e.target.value}))} placeholder="e.g. ahmad_muruj" />
                </div>
                <div style={{ marginBottom:'14px' }}>
                  <label style={labelStyle}>كلمة المرور *</label>
                  <input type="text" style={{ ...inputStyle, direction:'ltr', textAlign:'left' }} value={form.password} onChange={e => setForm(f=>({...f,password:e.target.value}))} placeholder="6 أحرف على الأقل" />
                </div>
              </>
            )}

            <div style={{ marginBottom:'14px' }}>
              <label style={labelStyle}>الصفحات المسموحة *</label>
              <label style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px 12px', background:'#FFF7ED', borderRadius:'10px', marginBottom:'8px', cursor:'pointer', border:'1.5px solid #FED7AA' }}>
                <input type="checkbox" checked={form.all_pages} onChange={e => setForm(f=>({...f,all_pages:e.target.checked}))} />
                <span style={{ fontSize:'13px', fontWeight:'800', color:'#C2410C' }}>✅ كل الصفحات (صلاحية كاملة)</span>
              </label>
              {!form.all_pages && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                  {PAGES.map(p => (
                    <label key={p.key} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px 12px', background: form.allowed_pages.includes(p.key) ? '#EFF6FF' : '#F8F9FB', borderRadius:'10px', cursor:'pointer', border:`1.5px solid ${form.allowed_pages.includes(p.key) ? '#BFDBFE' : '#E5E7EB'}` }}>
                      <input type="checkbox" checked={form.allowed_pages.includes(p.key)} onChange={() => togglePage(p.key)} />
                      <span style={{ fontSize:'13px', fontWeight:'700' }}>{p.icon} {p.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginBottom:'18px' }}>
              <label style={labelStyle}>الفرع</label>
              <select style={inputStyle} value={form.branch_scope} onChange={e => setForm(f=>({...f,branch_scope:e.target.value}))}>
                <option value="all">كل الفروع</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.is_primary ? '🏠' : '🏢'} {b.name}</option>)}
              </select>
              <div style={{ fontSize:'11px', color:'#9CA3AF', marginTop:'4px' }}>لو اخترت فرعاً، الموظف يرى طلبات هذا الفرع فقط.</div>
            </div>

            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => setModalOpen(false)} style={{ flex:1, padding:'12px', borderRadius:'11px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', cursor:'pointer' }}>إلغاء</button>
              <button onClick={handleSave} disabled={saving} style={{ flex:2, padding:'12px', borderRadius:'11px', border:'none', background: saving ? '#9CA3AF' : 'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', cursor: saving ? 'default' : 'pointer' }}>
                {saving ? 'جارٍ الحفظ...' : (editing ? 'حفظ التعديلات' : 'إنشاء الموظف')}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
