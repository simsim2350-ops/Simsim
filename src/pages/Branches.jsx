import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

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

export default function Branches() {
  const navigate = useNavigate()
  const { user, restaurant, signOut } = useAuthStore()
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingBranch, setEditingBranch] = useState(null)
  const [form, setForm] = useState({ name:'', address:'', phone:'', maps_url:'', is_active:true })
  const isMobile = window.innerWidth <= 768

  useEffect(() => {
    if (!restaurant) return
    fetchBranches()
  }, [restaurant])

  const fetchBranches = async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('branches')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .order('sort_order')
      if (data) setBranches(data)
    } finally {
      setLoading(false)
    }
  }

  const openAdd = () => {
    setEditingBranch(null)
    setForm({ name:'', address:'', phone:'', maps_url:'', is_active:true })
    setModalOpen(true)
  }

  const openEdit = (branch) => {
    setEditingBranch(branch)
    setForm({
      name: branch.name,
      address: branch.address || '',
      phone: branch.phone || '',
      maps_url: branch.maps_url || '',
      is_active: branch.is_active,
    })
    setModalOpen(true)
  }

  const saveBranch = async () => {
    if (!form.name.trim()) { toast.error('أدخل اسم الفرع'); return }
    try {
      if (editingBranch) {
        const { error } = await supabase.from('branches')
          .update({ name:form.name, address:form.address, phone:form.phone, maps_url:form.maps_url, is_active:form.is_active })
          .eq('id', editingBranch.id)
        if (error) throw error
        toast.success('تم تحديث الفرع ✅')
      } else {
        const { error } = await supabase.from('branches').insert({
          restaurant_id: restaurant.id,
          name: form.name,
          address: form.address,
          phone: form.phone,
          maps_url: form.maps_url,
          is_active: form.is_active,
          sort_order: branches.length,
        })
        if (error) throw error
        toast.success('تم إضافة الفرع 🎉')
      }
      setModalOpen(false)
      fetchBranches()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const deleteBranch = async (branch) => {
    if (!window.confirm(`حذف فرع "${branch.name}"؟ الطلبات المرتبطة به ستفقد ربطها بالفرع لكنها لن تُحذف.`)) return
    const { error } = await supabase.from('branches').delete().eq('id', branch.id)
    if (error) { toast.error(error.message); return }
    toast.success('تم حذف الفرع')
    fetchBranches()
  }

  const toggleActive = async (branch) => {
    await supabase.from('branches').update({ is_active: !branch.is_active }).eq('id', branch.id)
    fetchBranches()
    toast.success(branch.is_active ? 'تم تعطيل الفرع 🚫' : 'تم تفعيل الفرع ✅')
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

  const handleSignOut = async () => { await signOut(); navigate('/login') }

  const NavItem = ({ icon, label, active, onClick }) => (
    <div onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:'10px',
      padding:'10px 14px', borderRadius:'10px', cursor:'pointer',
      background: active ? 'rgba(255,107,53,0.12)' : 'transparent',
      color: active ? '#FF6B35' : 'rgba(255,255,255,0.55)',
      fontSize:'13px', fontWeight:'600', marginBottom:'2px',
      position:'relative', transition:'all 0.2s',
    }}>
      {active && <div style={{ position:'absolute', left:0, top:'50%', transform:'translateY(-50%)', width:'3px', height:'20px', background:'#FF6B35', borderRadius:'0 3px 3px 0' }}/>}
      <span style={{ fontSize:'16px', width:'20px', textAlign:'center' }}>{icon}</span>
      {label}
    </div>
  )

  if (loading) return <Spinner />

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', direction:'rtl', position:'relative' }}>

      {sidebarOpen && <div onClick={() => setSidebarOpen(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:40 }}/>}

      {/* Sidebar */}
      <div style={{ position:'fixed', right:0, top:0, transform: !isMobile ? 'none' : sidebarOpen ? 'translateX(0)' : 'translateX(100%)', transition:'transform 0.3s ease', zIndex:50, height:'100vh' }}>
        <aside style={{ width:'240px', background:'#0F1117', height:'100dvh', display:'flex', flexDirection:'column', borderLeft:'1px solid rgba(255,255,255,0.06)', overflowY:'auto' }}>
          <div style={{ padding:'20px 18px', display:'flex', alignItems:'center', gap:'10px', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ width:'34px', height:'34px', background:'linear-gradient(135deg,#FF6B35,#E85A24)', borderRadius:'9px', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'14px', color:'white' }}>S</div>
            <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'18px', color:'white' }}>SIM<span style={{ color:'#FF6B35' }}>SIM</span></span>
          </div>

          {restaurant && (
            <div style={{ margin:'12px', padding:'10px 12px', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:'11px', display:'flex', alignItems:'center', gap:'10px' }}>
              <div style={{ width:'32px', height:'32px', borderRadius:'8px', background: restaurant.logo_url ? 'transparent' : 'linear-gradient(135deg,#FF6B35,#FF9F6B)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px', overflow:'hidden' }}>{restaurant.logo_url ? <img src={restaurant.logo_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : '🍕'}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'13px', color:'white', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{restaurant.name}</div>
                <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.35)', direction:'ltr' }}>{window.location.host}/menu/{restaurant.slug}</div>
              </div>
            </div>
          )}

          <nav style={{ padding:'8px 12px', flex:1, overflowY:'auto' }}>
            <NavItem icon="📊" label="الرئيسية"   onClick={() => navigate('/dashboard')} />
            <NavItem icon="🛒" label="الطلبات"    onClick={() => navigate('/orders')} />
            <NavItem icon="📋" label="الأقسام"    onClick={() => navigate('/menu')} />
            <NavItem icon="🍽️" label="الأصناف"    onClick={() => navigate('/menu', { state: { tab: 'products' } })} />
            <NavItem icon="👥" label="العملاء"    onClick={() => navigate('/customers')} />
            <NavItem icon="🏢" label="الفروع"     active={true} onClick={() => setSidebarOpen(false)} />
            <NavItem icon="📱" label="QR Code"    onClick={() => navigate('/qr')} />
            <NavItem icon="📈" label="التحليلات" onClick={() => navigate('/analytics')} />
            <NavItem icon="⚙️" label="الإعدادات" onClick={() => navigate('/settings')} />
          </nav>

          <div style={{ padding:'12px', borderTop:'1px solid rgba(255,255,255,0.06)', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', marginBottom:'8px' }}>
              <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:'linear-gradient(135deg,#667eea,#764ba2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', fontWeight:'700', color:'white', flexShrink:0 }}>
                {user?.user_metadata?.full_name?.charAt(0) || 'م'}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:'13px', fontWeight:'700', color:'white', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.user_metadata?.full_name}</div>
                <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.35)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.email}</div>
              </div>
            </div>
            <button onClick={handleSignOut} style={{ width:'100%', padding:'9px', borderRadius:'9px', border:'1px solid rgba(239,68,68,0.3)', background:'rgba(239,68,68,0.08)', color:'#FC8181', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer' }}>
              تسجيل الخروج 🚪
            </button>
          </div>
        </aside>
      </div>

      {/* Main */}
      <main style={{ marginRight: isMobile ? '0' : '240px', flex:1, display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden' }}>

        {/* Topbar */}
        <div style={{ height:'56px', background:'white', borderBottom:'1px solid #E5E7EB', display:'flex', alignItems:'center', padding:'0 16px', gap:'10px', flexShrink:0 }}>
          {isMobile && <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background:'none', border:'none', fontSize:'22px', cursor:'pointer' }}>☰</button>}
          <span style={{ fontSize:'16px', fontWeight:'800' }}>🏢 الفروع</span>
          <div style={{ marginRight:'auto', display:'flex', gap:'8px' }}>
            <button onClick={() => navigate('/dashboard')} style={{ padding:'7px 12px', borderRadius:'9px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Cairo,sans-serif', fontWeight:'600', fontSize:'12px', cursor:'pointer', color:'#374151' }}>
              ← الرئيسية
            </button>
            <button onClick={openAdd} style={{ padding:'7px 14px', borderRadius:'9px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer' }}>
              ＋ فرع جديد
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:'auto', padding:'16px' }}>

          {branches.length === 0 ? (
            <div style={{ textAlign:'center', padding:'60px 16px', color:'#9CA3AF' }}>
              <div style={{ fontSize:'48px', opacity:0.3, marginBottom:'12px' }}>🏢</div>
              <div style={{ fontSize:'16px', fontWeight:'700', color:'#374151', marginBottom:'8px' }}>لا توجد فروع مضافة</div>
              <div style={{ fontSize:'13px', marginBottom:'18px' }}>
                لو عندك موقع فعلي واحد بس، تقدر تتجاهل هذه الصفحة — الفروع اختيارية وتفيد فقط لو عندك أكثر من موقع
              </div>
              <button onClick={openAdd} style={{ padding:'12px 24px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'14px', cursor:'pointer' }}>
                ＋ إضافة أول فرع
              </button>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
              {branches.map(branch => (
                <div key={branch.id} style={{ background:'white', borderRadius:'14px', border:'1.5px solid #E5E7EB', padding:'14px 16px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'10px' }}>
                    <div style={{ width:'40px', height:'40px', borderRadius:'10px', background:'#FFF0EB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', flexShrink:0 }}>🏢</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                        <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'15px' }}>{branch.name}</span>
                        {!branch.is_active && <span style={{ fontSize:'10px', fontWeight:'700', color:'#9CA3AF', background:'#F3F4F6', padding:'2px 7px', borderRadius:'100px' }}>معطّل</span>}
                      </div>
                      {branch.address && <div style={{ fontSize:'12px', color:'#9CA3AF' }}>📍 {branch.address}</div>}
                    </div>
                    <div style={{ display:'flex', gap:'5px', flexShrink:0 }}>
                      <button onClick={() => toggleActive(branch)} style={{ padding:'5px 8px', borderRadius:'8px', border:'1.5px solid #E5E7EB', background: branch.is_active ? '#D1FAE5' : '#F3F4F6', color: branch.is_active ? '#065F46' : '#6B7280', fontSize:'11px', fontWeight:'700', cursor:'pointer' }}>
                        {branch.is_active ? '👁️' : '🚫'}
                      </button>
                      <button onClick={() => openEdit(branch)} style={{ width:'30px', height:'30px', borderRadius:'8px', border:'1.5px solid #E5E7EB', background:'white', cursor:'pointer', fontSize:'13px' }}>✏️</button>
                      <button onClick={() => deleteBranch(branch)} style={{ width:'30px', height:'30px', borderRadius:'8px', border:'1.5px solid #FEE2E2', background:'#FEF2F2', cursor:'pointer', fontSize:'13px' }}>🗑️</button>
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
          )}
        </div>
      </main>

      {/* Branch Modal */}
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
              <label style={labelStyle}>العنوان</label>
              <input style={inputStyle} value={form.address} onChange={e => setForm(f=>({...f,address:e.target.value}))} placeholder="الحي، الشارع..." />
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={labelStyle}>رقم تواصل الفرع (اختياري)</label>
              <input style={{ ...inputStyle, direction:'ltr', textAlign:'left' }} value={form.phone} onChange={e => setForm(f=>({...f,phone:e.target.value}))} placeholder="9665XXXXXXXX" />
            </div>

            <div style={{ marginBottom:'18px' }}>
              <label style={labelStyle}>رابط خرائط جوجل (اختياري)</label>
              <input style={{ ...inputStyle, direction:'ltr', textAlign:'left' }} value={form.maps_url} onChange={e => setForm(f=>({...f,maps_url:e.target.value}))} placeholder="https://maps.google.com/..." />
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

            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => setModalOpen(false)} style={{ flex:1, padding:'13px', borderRadius:'12px', border:'1.5px solid #E5E7EB', background:'white', color:'#374151', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'14px', cursor:'pointer' }}>
                إلغاء
              </button>
              <button onClick={saveBranch} style={{ flex:2, padding:'13px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'14px', cursor:'pointer' }}>
                {editingBranch ? 'حفظ التعديلات' : 'إضافة الفرع'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
