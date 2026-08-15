import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

// خريطة الصفحة → المسار (لتوجيه الموظف لأول صفحة مسموحة)
const PAGE_PATH = {
  orders: '/orders', menu: '/menu', branches: '/branches',
  customers: '/customers', analytics: '/analytics', loyalty: '/loyalty', qr: '/qr',
}

export default function StaffLogin() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { signIn, fetchRestaurant } = useAuthStore()
  const [restaurant, setRestaurant] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('restaurants')
        .select('name, logo_url, brand_color, slug')
        .eq('slug', slug)
        .maybeSingle()
      if (data) setRestaurant(data)
      else setNotFound(true)
    })()
  }, [slug])

  const handleLogin = async (e) => {
    e.preventDefault()
    const u = username.trim().toLowerCase()
    if (!u || !password) { toast.error('أدخل اسم المستخدم وكلمة المرور'); return }
    setLoading(true)
    try {
      const email = `${u}.${slug}@staff.simsim.app`
      await signIn(email, password)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('فشل الدخول')

      // جلب صلاحيات الموظف للتوجيه لأول صفحة مسموحة
      const { data: mem } = await supabase
        .from('restaurant_members')
        .select('allowed_pages, is_active')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!mem || mem.is_active === false) {
        await supabase.auth.signOut()
        toast.error('حسابك موقوف أو غير موجود، تواصل مع صاحب المطعم')
        setLoading(false); return
      }

      await fetchRestaurant(user.id)

      const pages = Array.isArray(mem.allowed_pages) ? mem.allowed_pages : []
      let dest = '/dashboard'
      if (!pages.includes('all')) {
        const first = pages.find(k => PAGE_PATH[k])
        dest = first ? PAGE_PATH[first] : '/orders'
      }
      toast.success('مرحباً بك 👋')
      navigate(dest)
    } catch (err) {
      toast.error('اسم المستخدم أو كلمة المرور غير صحيحة')
      setLoading(false)
    }
  }

  if (notFound) {
    return (
      <div style={s.wrap}>
        <div style={s.card}>
          <div style={{ fontSize:'44px', marginBottom:'10px' }}>🔍</div>
          <h2 style={s.title}>المطعم غير موجود</h2>
          <p style={s.sub}>تأكد من صحة الرابط</p>
        </div>
      </div>
    )
  }

  const brand = restaurant?.brand_color || '#FF6A00'

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={{ ...s.logo, background:`linear-gradient(135deg, ${brand}, ${brand}CC)` }}>
          {restaurant?.logo_url
            ? <img src={restaurant.logo_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'inherit' }} />
            : '🍽️'}
        </div>
        <div style={s.eyebrow}>دخول الموظفين</div>
        <h2 style={s.title}>{restaurant?.name || '...'}</h2>
        <p style={s.sub}>أدخل اسم المستخدم وكلمة المرور</p>

        <form onSubmit={handleLogin} style={{ marginTop:'20px' }}>
          <div style={s.group}>
            <label style={s.label}>اسم المستخدم</label>
            <input value={username} onChange={e => setUsername(e.target.value)} placeholder="username"
              style={{ ...s.input, direction:'ltr', textAlign:'left' }} autoCapitalize="none" autoCorrect="off" />
          </div>
          <div style={s.group}>
            <label style={s.label}>كلمة المرور</label>
            <div style={{ position:'relative' }}>
              <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" style={{ ...s.input, direction:'ltr', textAlign:'left', paddingLeft:'44px' }} />
              <button type="button" onClick={() => setShowPass(!showPass)}
                style={{ position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', fontSize:'17px', cursor:'pointer' }}>
                {showPass ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading}
            style={{ ...s.btn, background:`linear-gradient(135deg, ${brand}, ${brand}CC)`, opacity: loading ? 0.8 : 1 }}>
            {loading ? 'جارٍ الدخول...' : 'دخول ←'}
          </button>
        </form>
      </div>
    </div>
  )
}

const s = {
  wrap: { minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0B0B0F', padding:'20px', direction:'rtl', fontFamily:'Tajawal,sans-serif' },
  card: { background:'white', borderRadius:'22px', padding:'32px 26px', width:'100%', maxWidth:'400px', textAlign:'center', boxShadow:'0 20px 60px rgba(0,0,0,0.4)' },
  logo: { width:'72px', height:'72px', borderRadius:'18px', margin:'0 auto 16px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'34px', overflow:'hidden', boxShadow:'0 8px 24px rgba(0,0,0,0.2)' },
  eyebrow: { fontSize:'12px', fontWeight:'700', color:'#FF6A00', letterSpacing:'1px', marginBottom:'6px' },
  title: { fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'22px', color:'#0B0B0F', marginBottom:'4px' },
  sub: { fontSize:'14px', color:'#6B7280' },
  group: { marginBottom:'16px', textAlign:'right' },
  label: { display:'block', fontSize:'13px', fontWeight:'700', color:'#0B0B0F', marginBottom:'8px' },
  input: { width:'100%', padding:'13px 16px', border:'1.5px solid #E5E7EB', borderRadius:'12px', fontFamily:'Tajawal,sans-serif', fontSize:'15px', background:'#F8F9FB', outline:'none', boxSizing:'border-box' },
  btn: { width:'100%', padding:'15px', borderRadius:'13px', border:'none', color:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'15px', cursor:'pointer', marginTop:'8px' },
}
