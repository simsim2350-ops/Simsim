import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { compressAndUploadImage } from '../lib/uploadImage'
import { useAuthStore } from '../store/authStore'

const EMOJIS = ['🍽️','🍔','🍕','🌮','🥙','🥗','🍜','🥩','🍗','☕','🧃','🥤','🍰','🧁','🍟','🌯','🎯','⭐','🔥','🍣']

// شارة مستوى السعرات: 🟢 منخفض (<300) / 🟡 متوسط (300-600) / 🔴 مرتفع (600+)
function getCalorieBadge(calories) {
  if (calories == null) return null
  if (calories < 300) return '🟢'
  if (calories <= 600) return '🟡'
  return '🔴'
}

const inputStyle = {
  width:'100%', padding:'11px 13px',
  border:'1.5px solid #E5E7EB', borderRadius:'11px',
  fontFamily:'Tajawal,sans-serif', fontSize:'14px',
  color:'#0F1117', background:'#F8F9FB',
  outline:'none', textAlign:'right', direction:'rtl',
  marginTop:'4px', boxSizing:'border-box',
}

function Spinner() {
  return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0F1117', color:'white', flexDirection:'column', gap:'16px', fontFamily:'Cairo,sans-serif' }}>
      <div style={{ width:'44px', height:'44px', border:'3px solid rgba(255,107,53,0.3)', borderTopColor:'#FF6B35', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      جارٍ التحميل...
    </div>
  )
}

export default function Menu() {
  const navigate = useNavigate()
  const { user, restaurant, signOut } = useAuthStore()
  const [tab, setTab] = useState('categories')
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isMobile = window.innerWidth <= 768

  // Modals
  const [catModal, setCatModal] = useState(false)
  const [prodModal, setProdModal] = useState(false)
  const [editingCat, setEditingCat] = useState(null)
  const [editingProd, setEditingProd] = useState(null)

  // Forms
  const [catForm, setCatForm] = useState({ name:'', emoji:'🍽️', cover_url:'', is_visible:true })
  const [prodForm, setProdForm] = useState({ name:'', description:'', price:'', compare_price:'', category_id:'', emoji:'🍽️', image_url:'', calories:'', is_available:true, is_featured:false, options:[] })
  const [uploadingCatImage, setUploadingCatImage] = useState(false)
  const [uploadingProdImage, setUploadingProdImage] = useState(false)

  useEffect(() => {
    if (!restaurant) return
    fetchAll()
  }, [restaurant])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [{ data: cats }, { data: prods }] = await Promise.all([
        supabase.from('categories').select('*').eq('restaurant_id', restaurant.id).order('sort_order'),
        supabase.from('products').select('*, categories(name)').eq('restaurant_id', restaurant.id).order('sort_order'),
      ])
      if (cats) setCategories(cats)
      if (prods) setProducts(prods)
    } finally {
      setLoading(false)
    }
  }

  // ===== CATEGORIES =====
  const openAddCat = () => {
    setEditingCat(null)
    setCatForm({ name:'', emoji:'🍽️', cover_url:'', is_visible:true })
    setCatModal(true)
  }

  const openEditCat = (cat) => {
    setEditingCat(cat)
    setCatForm({ name:cat.name, emoji:cat.emoji, cover_url:cat.cover_url || '', is_visible:cat.is_visible })
    setCatModal(true)
  }

  const saveCat = async () => {
    if (!catForm.name.trim()) { toast.error('أدخل اسم القسم'); return }
    try {
      if (editingCat) {
        const { error } = await supabase.from('categories')
          .update({ name:catForm.name, emoji:catForm.emoji, cover_url:catForm.cover_url, is_visible:catForm.is_visible })
          .eq('id', editingCat.id)
        if (error) throw error
        toast.success('تم تحديث القسم ✅')
      } else {
        const { error } = await supabase.from('categories').insert({
          restaurant_id: restaurant.id,
          name: catForm.name,
          emoji: catForm.emoji,
          cover_url: catForm.cover_url,
          is_visible: catForm.is_visible,
          sort_order: categories.length,
        })
        if (error) throw error
        toast.success('تم إضافة القسم 🎉')
      }
      setCatModal(false)
      fetchAll()
    } catch (err) {
      toast.error(err.message)
    }
  }

  // رفع صورة غلاف القسم — تُضغط وتُرفع فوراً عند الاختيار
  const handleCatImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingCatImage(true)
    try {
      const url = await compressAndUploadImage(file, restaurant.id, 'categories')
      setCatForm(f => ({ ...f, cover_url: url }))
      toast.success('تم رفع الصورة ✅')
    } catch (err) {
      toast.error(err.message || 'فشل رفع الصورة')
    } finally {
      setUploadingCatImage(false)
      e.target.value = ''
    }
  }

  const deleteCat = async (id) => {
    if (!window.confirm('هل تريد حذف هذا القسم؟')) return
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('تم الحذف')
    fetchAll()
  }

  const toggleCatVisibility = async (cat) => {
    await supabase.from('categories').update({ is_visible: !cat.is_visible }).eq('id', cat.id)
    fetchAll()
    toast.success(cat.is_visible ? 'تم الإخفاء 🚫' : 'تم الإظهار ✅')
  }

  // ===== PRODUCTS =====
  const openAddProd = () => {
    setEditingProd(null)
    setProdForm({ name:'', description:'', price:'', compare_price:'', category_id: categories[0]?.id || '', emoji:'🍽️', image_url:'', calories:'', is_available:true, is_featured:false, options:[] })
    setProdModal(true)
  }

  const openEditProd = (prod) => {
    setEditingProd(prod)
    setProdForm({
      name: prod.name,
      description: prod.description || '',
      price: prod.price,
      compare_price: prod.compare_price || '',
      category_id: prod.category_id || '',
      emoji: prod.emoji || '🍽️',
      image_url: prod.image_url || '',
      calories: prod.calories || '',
      is_available: prod.is_available,
      is_featured: prod.is_featured,
      options: Array.isArray(prod.options) ? prod.options : [],
    })
    setProdModal(true)
  }

  // رفع صورة الصنف — تُضغط وتُرفع فوراً عند الاختيار
  const handleProdImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingProdImage(true)
    try {
      const url = await compressAndUploadImage(file, restaurant.id, 'products')
      setProdForm(f => ({ ...f, image_url: url }))
      toast.success('تم رفع الصورة ✅')
    } catch (err) {
      toast.error(err.message || 'فشل رفع الصورة')
    } finally {
      setUploadingProdImage(false)
      e.target.value = ''
    }
  }

  const saveProd = async () => {
    if (!prodForm.name.trim()) { toast.error('أدخل اسم الصنف'); return }
    if (!prodForm.price) { toast.error('أدخل السعر'); return }

    // تنظيف مجموعات الخيارات: إزالة المجموعات/الخيارات بدون اسم
    const cleanOptions = (prodForm.options || [])
      .map(group => ({
        name: (group.name || '').trim(),
        type: group.type === 'multiple' ? 'multiple' : 'single',
        required: !!group.required,
        choices: (group.choices || [])
          .map(c => ({ name: (c.name || '').trim(), price: parseFloat(c.price) || 0 }))
          .filter(c => c.name),
      }))
      .filter(group => group.name && group.choices.length > 0)

    try {
      const data = {
        restaurant_id: restaurant.id,
        name: prodForm.name,
        description: prodForm.description,
        price: parseFloat(prodForm.price),
        compare_price: prodForm.compare_price ? parseFloat(prodForm.compare_price) : null,
        category_id: prodForm.category_id || null,
        emoji: prodForm.emoji,
        image_url: prodForm.image_url,
        calories: prodForm.calories ? parseInt(prodForm.calories) : null,
        is_available: prodForm.is_available,
        is_featured: prodForm.is_featured,
        options: cleanOptions,
        sort_order: editingProd ? editingProd.sort_order : products.length,
      }
      if (editingProd) {
        const { error } = await supabase.from('products').update(data).eq('id', editingProd.id)
        if (error) throw error
        toast.success('تم تحديث الصنف ✅')
      } else {
        const { error } = await supabase.from('products').insert(data)
        if (error) throw error
        toast.success('تم إضافة الصنف 🎉')
      }
      setProdModal(false)
      fetchAll()
    } catch (err) {
      toast.error(err.message)
    }
  }

  // ===== OPTIONS GROUPS (إدارة مجموعات الإضافات/الحجم) =====
  const addOptionGroup = () => {
    setProdForm(f => ({
      ...f,
      options: [...(f.options || []), { name:'', type:'single', required:false, choices:[{ name:'', price:'' }] }],
    }))
  }

  const removeOptionGroup = (groupIdx) => {
    setProdForm(f => ({ ...f, options: f.options.filter((_, i) => i !== groupIdx) }))
  }

  const updateOptionGroup = (groupIdx, field, value) => {
    setProdForm(f => ({
      ...f,
      options: f.options.map((g, i) => i === groupIdx ? { ...g, [field]: value } : g),
    }))
  }

  const addChoice = (groupIdx) => {
    setProdForm(f => ({
      ...f,
      options: f.options.map((g, i) => i === groupIdx ? { ...g, choices: [...g.choices, { name:'', price:'' }] } : g),
    }))
  }

  const removeChoice = (groupIdx, choiceIdx) => {
    setProdForm(f => ({
      ...f,
      options: f.options.map((g, i) => i === groupIdx ? { ...g, choices: g.choices.filter((_, ci) => ci !== choiceIdx) } : g),
    }))
  }

  const updateChoice = (groupIdx, choiceIdx, field, value) => {
    setProdForm(f => ({
      ...f,
      options: f.options.map((g, i) => i === groupIdx
        ? { ...g, choices: g.choices.map((c, ci) => ci === choiceIdx ? { ...c, [field]: value } : c) }
        : g),
    }))
  }

  const deleteProd = async (id) => {
    if (!window.confirm('هل تريد حذف هذا الصنف؟')) return
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('تم الحذف')
    fetchAll()
  }

  const toggleProdAvailability = async (prod) => {
    await supabase.from('products').update({ is_available: !prod.is_available }).eq('id', prod.id)
    fetchAll()
    toast.success(prod.is_available ? 'تم الإخفاء 🚫' : 'تم الإظهار ✅')
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  // ===== NAV ITEM =====
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

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:40 }}/>
      )}

      {/* Sidebar */}
      <div style={{
        position:'fixed', right:0, top:0,
        transform: !isMobile ? 'none' : sidebarOpen ? 'translateX(0)' : 'translateX(100%)',
        transition:'transform 0.3s ease',
        zIndex:50, height:'100vh',
      }}>
        <aside style={{ width:'240px', background:'#0F1117', height:'100dvh', display:'flex', flexDirection:'column', borderLeft:'1px solid rgba(255,255,255,0.06)', overflowY:'auto' }}>

          {/* Logo */}
          <div style={{ padding:'20px 18px', display:'flex', alignItems:'center', gap:'10px', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ width:'34px', height:'34px', background:'linear-gradient(135deg,#FF6B35,#E85A24)', borderRadius:'9px', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'14px', color:'white' }}>S</div>
            <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'18px', color:'white' }}>SIM<span style={{ color:'#FF6B35' }}>SIM</span></span>
          </div>

          {/* Restaurant */}
          {restaurant && (
            <div style={{ margin:'12px', padding:'10px 12px', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:'11px', display:'flex', alignItems:'center', gap:'10px' }}>
              <div style={{ width:'32px', height:'32px', borderRadius:'8px', background: restaurant.logo_url ? 'transparent' : 'linear-gradient(135deg,#FF6B35,#FF9F6B)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px', overflow:'hidden' }}>{restaurant.logo_url ? <img src={restaurant.logo_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : '🍕'}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'13px', color:'white', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{restaurant.name}</div>
                <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.35)', direction:'ltr' }}>{window.location.host}/menu/{restaurant.slug}</div>
              </div>
            </div>
          )}

          {/* Nav */}
          <nav style={{ padding:'8px 12px', flex:1, overflowY:'auto' }}>
            <NavItem icon="📊" label="الرئيسية" onClick={() => navigate('/dashboard')} />
            <NavItem icon="🛒" label="الطلبات" onClick={() => navigate('/orders')} />
            <NavItem icon="📋" label="الأقسام" active={tab==='categories'} onClick={() => { setTab('categories'); setSidebarOpen(false) }} />
            <NavItem icon="🍽️" label="الأصناف" active={tab==='products'} onClick={() => { setTab('products'); setSidebarOpen(false) }} />
            <NavItem icon="👥" label="العملاء" onClick={() => navigate('/customers')} />
            <NavItem icon="📱" label="QR Code" onClick={() => navigate('/qr')} />
            <NavItem icon="📈" label="التحليلات" onClick={() => navigate('/analytics')} />
            <NavItem icon="⚙️" label="الإعدادات" onClick={() => navigate('/settings')} />
          </nav>

          {/* User */}
          <div style={{ padding:'12px', borderTop:'1px solid rgba(255,255,255,0.06)', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', marginBottom:'8px' }}>
              <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:'linear-gradient(135deg,#667eea,#764ba2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', fontWeight:'700', color:'white', fontFamily:'Cairo,sans-serif', flexShrink:0 }}>
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
          {isMobile && (
            <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background:'none', border:'none', fontSize:'22px', cursor:'pointer', padding:'4px' }}>☰</button>
          )}
          <span style={{ fontSize:'16px', fontWeight:'800', color:'#0F1117' }}>إدارة المنيو</span>
          <div style={{ marginRight:'auto', display:'flex', gap:'8px' }}>
            <button onClick={() => navigate('/dashboard')} style={{ padding:'7px 12px', borderRadius:'9px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Cairo,sans-serif', fontWeight:'600', fontSize:'12px', cursor:'pointer', color:'#374151' }}>
              ← الرئيسية
            </button>
            <button
              onClick={() => tab === 'categories' ? openAddCat() : openAddProd()}
              style={{ padding:'7px 14px', borderRadius:'9px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer' }}
            >
              ＋ {tab === 'categories' ? 'قسم' : 'صنف'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ background:'white', borderBottom:'1px solid #E5E7EB', display:'flex', padding:'0 16px', flexShrink:0, overflowX:'auto', scrollbarWidth:'none' }}>
          {[
            { key:'categories', label:`📋 الأقسام (${categories.length})` },
            { key:'products', label:`🍽️ الأصناف (${products.length})` },
          ].map(t => (
            <div key={t.key} onClick={() => setTab(t.key)} style={{
              padding:'13px 16px', fontSize:'14px', fontWeight:'700',
              color: tab === t.key ? '#FF6B35' : '#6B7280',
              borderBottom: tab === t.key ? '2.5px solid #FF6B35' : '2.5px solid transparent',
              cursor:'pointer', transition:'all 0.2s', whiteSpace:'nowrap',
            }}>
              {t.label}
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:'auto', padding:'16px' }}>

          {/* CATEGORIES */}
          {tab === 'categories' && (
            <div>
              {categories.length === 0 ? (
                <div style={{ textAlign:'center', padding:'60px 16px', color:'#9CA3AF' }}>
                  <div style={{ fontSize:'48px', opacity:0.3, marginBottom:'12px' }}>📋</div>
                  <div style={{ fontSize:'16px', fontWeight:'700', color:'#374151', marginBottom:'8px' }}>لا توجد أقسام بعد</div>
                  <div style={{ fontSize:'13px', marginBottom:'20px' }}>أضف أقسام لتنظيم منيوك</div>
                  <button onClick={openAddCat} style={{ padding:'12px 24px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'14px', cursor:'pointer' }}>
                    ＋ إضافة أول قسم
                  </button>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                  {categories.map(cat => (
                    <div key={cat.id} style={{ background:'white', borderRadius:'14px', border:'1.5px solid #E5E7EB', padding:'14px 16px', display:'flex', alignItems:'center', gap:'12px' }}>
                      <div style={{ width:'44px', height:'44px', borderRadius:'12px', background:'#FFF0EB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'22px', flexShrink:0, overflow:'hidden' }}>
                        {cat.cover_url
                          ? <img src={cat.cover_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                          : cat.emoji}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'15px', marginBottom:'3px' }}>{cat.name}</div>
                        <div style={{ fontSize:'12px', color:'#9CA3AF' }}>
                          {products.filter(p => p.category_id === cat.id).length} صنف
                        </div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:'6px', flexShrink:0 }}>
                        <button onClick={() => toggleCatVisibility(cat)} style={{ padding:'5px 8px', borderRadius:'8px', border:'1.5px solid #E5E7EB', background: cat.is_visible ? '#D1FAE5' : '#F3F4F6', color: cat.is_visible ? '#065F46' : '#6B7280', fontSize:'11px', fontWeight:'700', cursor:'pointer', whiteSpace:'nowrap' }}>
                          {cat.is_visible ? '👁️' : '🚫'}
                        </button>
                        <button onClick={() => openEditCat(cat)} style={{ width:'32px', height:'32px', borderRadius:'8px', border:'1.5px solid #E5E7EB', background:'white', cursor:'pointer', fontSize:'14px' }}>✏️</button>
                        <button onClick={() => deleteCat(cat.id)} style={{ width:'32px', height:'32px', borderRadius:'8px', border:'1.5px solid #FEE2E2', background:'#FEF2F2', cursor:'pointer', fontSize:'14px' }}>🗑️</button>
                      </div>
                    </div>
                  ))}
                  <button onClick={openAddCat} style={{ padding:'14px', borderRadius:'14px', border:'2px dashed #E5E7EB', background:'transparent', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'14px', color:'#9CA3AF', cursor:'pointer' }}>
                    ＋ إضافة قسم جديد
                  </button>
                </div>
              )}
            </div>
          )}

          {/* PRODUCTS */}
          {tab === 'products' && (
            <div>
              {products.length === 0 ? (
                <div style={{ textAlign:'center', padding:'60px 16px', color:'#9CA3AF' }}>
                  <div style={{ fontSize:'48px', opacity:0.3, marginBottom:'12px' }}>🍽️</div>
                  <div style={{ fontSize:'16px', fontWeight:'700', color:'#374151', marginBottom:'8px' }}>لا توجد أصناف بعد</div>
                  <div style={{ fontSize:'13px', marginBottom:'20px' }}>أضف أصنافاً لتملأ منيوك</div>
                  <button onClick={openAddProd} style={{ padding:'12px 24px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'14px', cursor:'pointer' }}>
                    ＋ إضافة أول صنف
                  </button>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                  {products.map(prod => (
                    <div key={prod.id} style={{ background:'white', borderRadius:'14px', border:'1.5px solid #E5E7EB', padding:'14px 16px', display:'flex', alignItems:'center', gap:'12px' }}>
                      <div style={{ width:'52px', height:'52px', borderRadius:'12px', background:'#F8F9FB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'26px', flexShrink:0, border:'1px solid #E5E7EB', overflow:'hidden' }}>
                        {prod.image_url
                          ? <img src={prod.image_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                          : prod.emoji}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'14px', marginBottom:'3px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{prod.name}</div>
                        {prod.description && <div style={{ fontSize:'12px', color:'#9CA3AF', marginBottom:'4px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{prod.description}</div>}
                        <div style={{ display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap' }}>
                          <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'14px', color:'#FF6B35' }}>{prod.price} ﷼</span>
                          {prod.compare_price && <span style={{ fontSize:'12px', color:'#9CA3AF', textDecoration:'line-through' }}>{prod.compare_price} ﷼</span>}
                          {prod.categories && <span style={{ fontSize:'11px', color:'#9CA3AF', background:'#F3F4F6', padding:'2px 7px', borderRadius:'100px' }}>{prod.categories.name}</span>}
                          {prod.calories && <span style={{ fontSize:'11px', color:'#9CA3AF' }}>{getCalorieBadge(prod.calories)} {prod.calories} كالوري</span>}
                          {prod.is_featured && <span style={{ fontSize:'10px', color:'#92400E', background:'#FEF3C7', padding:'2px 6px', borderRadius:'100px' }}>⭐</span>}
                        </div>
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:'6px', alignItems:'flex-end', flexShrink:0 }}>
                        <button onClick={() => toggleProdAvailability(prod)} style={{ padding:'4px 8px', borderRadius:'7px', border:'1.5px solid #E5E7EB', background: prod.is_available ? '#D1FAE5' : '#F3F4F6', color: prod.is_available ? '#065F46' : '#6B7280', fontSize:'10px', fontWeight:'700', cursor:'pointer', whiteSpace:'nowrap' }}>
                          {prod.is_available ? '✅ متاح' : '🚫 مخفي'}
                        </button>
                        <div style={{ display:'flex', gap:'5px' }}>
                          <button onClick={() => openEditProd(prod)} style={{ width:'30px', height:'30px', borderRadius:'8px', border:'1.5px solid #E5E7EB', background:'white', cursor:'pointer', fontSize:'13px' }}>✏️</button>
                          <button onClick={() => deleteProd(prod.id)} style={{ width:'30px', height:'30px', borderRadius:'8px', border:'1.5px solid #FEE2E2', background:'#FEF2F2', cursor:'pointer', fontSize:'13px' }}>🗑️</button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <button onClick={openAddProd} style={{ padding:'14px', borderRadius:'14px', border:'2px dashed #E5E7EB', background:'transparent', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'14px', color:'#9CA3AF', cursor:'pointer' }}>
                    ＋ إضافة صنف جديد
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ===== CATEGORY MODAL ===== */}
      {catModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={() => setCatModal(false)}>
          <div style={{ background:'white', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:'480px', padding:'20px 20px 36px' }} onClick={e => e.stopPropagation()}>
            <div style={{ width:'40px', height:'4px', background:'#E5E7EB', borderRadius:'2px', margin:'0 auto 20px' }}/>
            <h3 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'18px', marginBottom:'18px', textAlign:'center' }}>
              {editingCat ? 'تعديل القسم' : '📋 إضافة قسم جديد'}
            </h3>

            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'8px' }}>صورة غلاف القسم (اختياري)</label>
              <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                <div style={{ width:'64px', height:'64px', borderRadius:'12px', background:'#F8F9FB', border:'1.5px solid #E5E7EB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'26px', overflow:'hidden', flexShrink:0 }}>
                  {catForm.cover_url
                    ? <img src={catForm.cover_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                    : catForm.emoji}
                </div>
                <label style={{ display:'inline-flex', alignItems:'center', gap:'6px', padding:'9px 14px', borderRadius:'10px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer', color:'#374151' }}>
                  {uploadingCatImage ? 'جارٍ الرفع...' : '📷 رفع صورة'}
                  <input type="file" accept="image/*" onChange={handleCatImageUpload} disabled={uploadingCatImage} style={{ display:'none' }} />
                </label>
                {catForm.cover_url && (
                  <button onClick={() => setCatForm(f => ({ ...f, cover_url: '' }))} style={{ padding:'9px 12px', borderRadius:'10px', border:'1.5px solid #FEE2E2', background:'#FEF2F2', color:'#EF4444', fontSize:'12px', fontWeight:'700', cursor:'pointer' }}>حذف</button>
                )}
              </div>
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'8px' }}>أيقونة القسم (تظهر إن لم توجد صورة)</label>
              <div style={{ display:'flex', gap:'7px', flexWrap:'wrap' }}>
                {EMOJIS.map(e => (
                  <div key={e} onClick={() => setCatForm(f=>({...f,emoji:e}))} style={{ width:'36px', height:'36px', borderRadius:'9px', border:`2px solid ${catForm.emoji===e?'#FF6B35':'#E5E7EB'}`, background: catForm.emoji===e?'#FFF0EB':'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', cursor:'pointer', transition:'all 0.15s' }}>
                    {e}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'4px' }}>اسم القسم *</label>
              <input style={inputStyle} placeholder="مثال: البرغر، المشروبات..." value={catForm.name} onChange={e => setCatForm(f=>({...f,name:e.target.value}))} autoFocus />
            </div>

            <label style={{ display:'flex', alignItems:'center', gap:'10px', cursor:'pointer', marginBottom:'20px' }}>
              <input type="checkbox" checked={catForm.is_visible} onChange={e => setCatForm(f=>({...f,is_visible:e.target.checked}))} style={{ width:'18px', height:'18px', accentColor:'#FF6B35' }}/>
              <span style={{ fontSize:'14px', fontWeight:'600' }}>إظهار القسم في المنيو</span>
            </label>

            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => setCatModal(false)} style={{ flex:1, padding:'13px', borderRadius:'12px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Cairo,sans-serif', fontWeight:'600', fontSize:'14px', cursor:'pointer', color:'#6B7280' }}>إلغاء</button>
              <button onClick={saveCat} style={{ flex:2, padding:'13px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'14px', cursor:'pointer' }}>
                💾 {editingCat ? 'تحديث القسم' : 'إضافة القسم'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== PRODUCT MODAL ===== */}
      {prodModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={() => setProdModal(false)}>
          <div style={{ background:'white', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:'480px', maxHeight:'92vh', overflowY:'auto', padding:'20px 20px 36px' }} onClick={e => e.stopPropagation()}>
            <div style={{ width:'40px', height:'4px', background:'#E5E7EB', borderRadius:'2px', margin:'0 auto 20px' }}/>
            <h3 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'18px', marginBottom:'18px', textAlign:'center' }}>
              {editingProd ? 'تعديل الصنف' : '🍽️ إضافة صنف جديد'}
            </h3>

            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'8px' }}>صورة الصنف (اختياري)</label>
              <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                <div style={{ width:'64px', height:'64px', borderRadius:'12px', background:'#F8F9FB', border:'1.5px solid #E5E7EB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'26px', overflow:'hidden', flexShrink:0 }}>
                  {prodForm.image_url
                    ? <img src={prodForm.image_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                    : prodForm.emoji}
                </div>
                <label style={{ display:'inline-flex', alignItems:'center', gap:'6px', padding:'9px 14px', borderRadius:'10px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer', color:'#374151' }}>
                  {uploadingProdImage ? 'جارٍ الرفع...' : '📷 رفع صورة'}
                  <input type="file" accept="image/*" onChange={handleProdImageUpload} disabled={uploadingProdImage} style={{ display:'none' }} />
                </label>
                {prodForm.image_url && (
                  <button onClick={() => setProdForm(f => ({ ...f, image_url: '' }))} style={{ padding:'9px 12px', borderRadius:'10px', border:'1.5px solid #FEE2E2', background:'#FEF2F2', color:'#EF4444', fontSize:'12px', fontWeight:'700', cursor:'pointer' }}>حذف</button>
                )}
              </div>
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'8px' }}>أيقونة الصنف (تظهر إن لم توجد صورة)</label>
              <div style={{ display:'flex', gap:'7px', flexWrap:'wrap' }}>
                {EMOJIS.map(e => (
                  <div key={e} onClick={() => setProdForm(f=>({...f,emoji:e}))} style={{ width:'36px', height:'36px', borderRadius:'9px', border:`2px solid ${prodForm.emoji===e?'#FF6B35':'#E5E7EB'}`, background: prodForm.emoji===e?'#FFF0EB':'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', cursor:'pointer', transition:'all 0.15s' }}>
                    {e}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'4px' }}>اسم الصنف *</label>
              <input style={inputStyle} placeholder="مثال: برغر كلاسيك" value={prodForm.name} onChange={e => setProdForm(f=>({...f,name:e.target.value}))} autoFocus />
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'4px' }}>الوصف</label>
              <textarea style={{ ...inputStyle, minHeight:'72px', resize:'vertical' }} placeholder="وصف شهي يجذب العملاء..." value={prodForm.description} onChange={e => setProdForm(f=>({...f,description:e.target.value}))} />
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'14px' }}>
              <div>
                <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'4px' }}>السعر (ريال) *</label>
                <input style={{ ...inputStyle, direction:'ltr', textAlign:'left' }} type="number" min="0" step="0.5" placeholder="0.00" value={prodForm.price} onChange={e => setProdForm(f=>({...f,price:e.target.value}))} />
              </div>
              <div>
                <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'4px' }}>سعر المقارنة</label>
                <input style={{ ...inputStyle, direction:'ltr', textAlign:'left' }} type="number" min="0" step="0.5" placeholder="0.00" value={prodForm.compare_price} onChange={e => setProdForm(f=>({...f,compare_price:e.target.value}))} />
              </div>
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'4px' }}>🔥 السعرات الحرارية (اختياري)</label>
              <input style={{ ...inputStyle, direction:'ltr', textAlign:'left' }} type="number" min="0" step="1" placeholder="مثال: 450" value={prodForm.calories} onChange={e => setProdForm(f=>({...f,calories:e.target.value}))} />
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'4px' }}>القسم</label>
              <select style={{ ...inputStyle, cursor:'pointer' }} value={prodForm.category_id} onChange={e => setProdForm(f=>({...f,category_id:e.target.value}))}>
                <option value="">بدون قسم</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.emoji} {cat.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display:'flex', gap:'20px', marginBottom:'20px' }}>
              <label style={{ display:'flex', alignItems:'center', gap:'8px', cursor:'pointer' }}>
                <input type="checkbox" checked={prodForm.is_available} onChange={e => setProdForm(f=>({...f,is_available:e.target.checked}))} style={{ width:'17px', height:'17px', accentColor:'#FF6B35' }}/>
                <span style={{ fontSize:'13px', fontWeight:'600' }}>✅ متاح للطلب</span>
              </label>
              <label style={{ display:'flex', alignItems:'center', gap:'8px', cursor:'pointer' }}>
                <input type="checkbox" checked={prodForm.is_featured} onChange={e => setProdForm(f=>({...f,is_featured:e.target.checked}))} style={{ width:'17px', height:'17px', accentColor:'#FF6B35' }}/>
                <span style={{ fontSize:'13px', fontWeight:'600' }}>⭐ مميز</span>
              </label>
            </div>

            {/* ===== خيارات الصنف (الحجم / الإضافات) ===== */}
            <div style={{ marginBottom:'20px', border:'1.5px solid #E5E7EB', borderRadius:'14px', overflow:'hidden' }}>
              <div style={{ padding:'12px 14px', background:'#F8F9FB', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontSize:'13px', fontWeight:'800' }}>🧩 خيارات الصنف (الحجم، الإضافات...)</span>
                <button type="button" onClick={addOptionGroup} style={{ padding:'5px 10px', borderRadius:'8px', border:'1.5px solid #FF6B35', background:'white', color:'#FF6B35', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'11px', cursor:'pointer' }}>
                  ＋ مجموعة
                </button>
              </div>

              {(prodForm.options || []).length === 0 ? (
                <div style={{ padding:'16px', textAlign:'center', fontSize:'12px', color:'#9CA3AF' }}>
                  لا توجد خيارات — مفيدة لو الصنف له أحجام أو إضافات (مثل: الحجم، الإضافات)
                </div>
              ) : (
                <div style={{ padding:'12px', display:'flex', flexDirection:'column', gap:'12px' }}>
                  {prodForm.options.map((group, gi) => (
                    <div key={gi} style={{ border:'1.5px solid #E5E7EB', borderRadius:'12px', padding:'10px', background:'white' }}>
                      <div style={{ display:'flex', gap:'8px', marginBottom:'8px', alignItems:'center' }}>
                        <input
                          placeholder="اسم المجموعة (مثال: الحجم)"
                          value={group.name}
                          onChange={e => updateOptionGroup(gi, 'name', e.target.value)}
                          style={{ flex:1, padding:'8px 10px', border:'1.5px solid #E5E7EB', borderRadius:'9px', fontFamily:'Tajawal,sans-serif', fontSize:'13px', outline:'none', textAlign:'right' }}
                        />
                        <button type="button" onClick={() => removeOptionGroup(gi)} style={{ width:'30px', height:'30px', flexShrink:0, borderRadius:'8px', border:'1.5px solid #FEE2E2', background:'#FEF2F2', cursor:'pointer', fontSize:'13px' }}>🗑️</button>
                      </div>

                      <div style={{ display:'flex', gap:'14px', marginBottom:'10px', flexWrap:'wrap' }}>
                        <label style={{ display:'flex', alignItems:'center', gap:'6px', cursor:'pointer', fontSize:'12px' }}>
                          <input
                            type="radio"
                            name={`group-type-${gi}`}
                            checked={group.type !== 'multiple'}
                            onChange={() => updateOptionGroup(gi, 'type', 'single')}
                            style={{ accentColor:'#FF6B35' }}
                          />
                          اختيار واحد
                        </label>
                        <label style={{ display:'flex', alignItems:'center', gap:'6px', cursor:'pointer', fontSize:'12px' }}>
                          <input
                            type="radio"
                            name={`group-type-${gi}`}
                            checked={group.type === 'multiple'}
                            onChange={() => updateOptionGroup(gi, 'type', 'multiple')}
                            style={{ accentColor:'#FF6B35' }}
                          />
                          اختيار متعدد
                        </label>
                        <label style={{ display:'flex', alignItems:'center', gap:'6px', cursor:'pointer', fontSize:'12px' }}>
                          <input
                            type="checkbox"
                            checked={!!group.required}
                            onChange={e => updateOptionGroup(gi, 'required', e.target.checked)}
                            style={{ accentColor:'#FF6B35' }}
                          />
                          إجباري
                        </label>
                      </div>

                      <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                        {group.choices.map((choice, ci) => (
                          <div key={ci} style={{ display:'flex', gap:'6px', alignItems:'center' }}>
                            <input
                              placeholder="اسم الخيار"
                              value={choice.name}
                              onChange={e => updateChoice(gi, ci, 'name', e.target.value)}
                              style={{ flex:2, padding:'7px 9px', border:'1.5px solid #E5E7EB', borderRadius:'8px', fontFamily:'Tajawal,sans-serif', fontSize:'12px', outline:'none', textAlign:'right' }}
                            />
                            <input
                              type="number"
                              step="0.5"
                              placeholder="+0"
                              value={choice.price}
                              onChange={e => updateChoice(gi, ci, 'price', e.target.value)}
                              style={{ flex:1, padding:'7px 9px', border:'1.5px solid #E5E7EB', borderRadius:'8px', fontFamily:'Tajawal,sans-serif', fontSize:'12px', outline:'none', direction:'ltr', textAlign:'left' }}
                            />
                            <button type="button" onClick={() => removeChoice(gi, ci)} style={{ width:'26px', height:'26px', flexShrink:0, borderRadius:'7px', border:'1.5px solid #FEE2E2', background:'#FEF2F2', cursor:'pointer', fontSize:'11px' }}>✕</button>
                          </div>
                        ))}
                        <button type="button" onClick={() => addChoice(gi)} style={{ marginTop:'4px', padding:'6px', borderRadius:'8px', border:'1.5px dashed #E5E7EB', background:'transparent', color:'#9CA3AF', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'11px', cursor:'pointer' }}>
                          ＋ إضافة خيار
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => setProdModal(false)} style={{ flex:1, padding:'13px', borderRadius:'12px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Cairo,sans-serif', fontWeight:'600', fontSize:'14px', cursor:'pointer', color:'#6B7280' }}>إلغاء</button>
              <button onClick={saveProd} style={{ flex:2, padding:'13px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'14px', cursor:'pointer' }}>
                💾 {editingProd ? 'تحديث الصنف' : 'إضافة الصنف'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
