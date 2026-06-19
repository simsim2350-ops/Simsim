import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'
import QRCode from 'qrcode'

const QR_COLORS = ['#0F1117','#FF6B35','#10B981','#3B82F6','#8B5CF6','#EC4899','#F59E0B','#EF4444']

const STYLES = {
  orange: { cardBg:'linear-gradient(135deg,#FF6B35,#E85A24)', textColor:'white', logoBg:'rgba(255,255,255,0.2)' },
  dark:   { cardBg:'linear-gradient(135deg,#0F1117,#1A1A2E)', textColor:'white', logoBg:'rgba(255,107,53,0.2)' },
  green:  { cardBg:'linear-gradient(135deg,#10B981,#059669)', textColor:'white', logoBg:'rgba(255,255,255,0.2)' },
  blue:   { cardBg:'linear-gradient(135deg,#3B82F6,#2563EB)', textColor:'white', logoBg:'rgba(255,255,255,0.2)' },
  purple: { cardBg:'linear-gradient(135deg,#8B5CF6,#7C3AED)', textColor:'white', logoBg:'rgba(255,255,255,0.2)' },
  white:  { cardBg:'#FFFFFF', textColor:'#0F1117', logoBg:'#F0F2F5' },
}

export default function QRCodePage() {
  const navigate = useNavigate()
  const { user, restaurant, signOut } = useAuthStore()
  const canvasRef = useRef(null)
  const [qrColor, setQrColor] = useState('#0F1117')
  const [qrSize, setQrSize] = useState(200)
  const [cardStyle, setCardStyle] = useState('orange')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isMobile = window.innerWidth <= 768

  const menuURL = restaurant
    ? `${window.location.origin}/menu/${restaurant.slug}`
    : ''

  useEffect(() => {
    if (restaurant) generateQR()
  }, [restaurant, qrColor, qrSize])

  const generateQR = async () => {
    const canvas = canvasRef.current
    if (!canvas || !menuURL) return
    try {
      await QRCode.toCanvas(canvas, menuURL, {
        width: qrSize,
        margin: 2,
        color: {
          dark: qrColor,
          light: '#FFFFFF',
        },
        errorCorrectionLevel: 'H',
      })
    } catch (err) {
      console.error('QR Error:', err)
    }
  }

  const downloadQR = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.download = `qr-${restaurant?.slug || 'menu'}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
    toast.success('تم تحميل QR Code ✅')
  }

  const copyURL = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(menuURL)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = menuURL
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(textarea)
        if (!ok) throw new Error('execCommand failed')
      }
      toast.success('تم نسخ الرابط! 📋')
    } catch (err) {
      console.error('Copy failed:', err)
      toast.error('تعذّر نسخ الرابط، انسخه يدوياً من الحقل')
    }
  }

  const shareWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(`تفضل منيونا الرقمي 👇\n${menuURL}`)}`, '_blank')
  }

  const handleSignOut = async () => { await signOut(); navigate('/login') }

  const NavItem = ({ icon, label, active, onClick }) => (
    <div onClick={onClick} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 14px', borderRadius:'10px', cursor:'pointer', background: active ? 'rgba(255,107,53,0.12)' : 'transparent', color: active ? '#FF6B35' : 'rgba(255,255,255,0.55)', fontSize:'13px', fontWeight:'600', marginBottom:'2px', position:'relative', transition:'all 0.2s' }}>
      {active && <div style={{ position:'absolute', left:0, top:'50%', transform:'translateY(-50%)', width:'3px', height:'20px', background:'#FF6B35', borderRadius:'0 3px 3px 0' }}/>}
      <span style={{ fontSize:'16px', width:'20px', textAlign:'center' }}>{icon}</span>
      {label}
    </div>
  )

  const style = STYLES[cardStyle] || STYLES.orange

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
              <div style={{ width:'32px', height:'32px', borderRadius:'8px', background:'linear-gradient(135deg,#FF6B35,#FF9F6B)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px' }}>🍕</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'13px', color:'white', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{restaurant.name}</div>
                <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.35)', direction:'ltr' }}>{menuURL.replace('https://','')}</div>
              </div>
            </div>
          )}

          <nav style={{ padding:'8px 12px', flex:1, overflowY:'auto' }}>
            <NavItem icon="📊" label="الرئيسية"   onClick={() => navigate('/dashboard')} />
            <NavItem icon="🛒" label="الطلبات"    onClick={() => navigate('/orders')} />
            <NavItem icon="📋" label="الأقسام"    onClick={() => navigate('/menu')} />
            <NavItem icon="🍽️" label="الأصناف"    onClick={() => navigate('/menu')} />
            <NavItem icon="👥" label="العملاء"    onClick={() => toast('قريباً! 🔧')} />
            <NavItem icon="📱" label="QR Code"    active={true} onClick={() => setSidebarOpen(false)} />
            <NavItem icon="📈" label="التحليلات" onClick={() => navigate("/analytics")} />
            <NavItem icon="⚙️" label="الإعدادات" onClick={() => navigate('/settings')} />
          </nav>

          <div style={{ padding:'12px', borderTop:'1px solid rgba(255,255,255,0.06)' }}>
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
          <span style={{ fontSize:'16px', fontWeight:'800' }}>📱 QR Code</span>
          <div style={{ marginRight:'auto', display:'flex', gap:'8px' }}>
            <button onClick={() => navigate('/dashboard')} style={{ padding:'7px 12px', borderRadius:'9px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Cairo,sans-serif', fontWeight:'600', fontSize:'12px', cursor:'pointer', color:'#374151' }}>
              ← الرئيسية
            </button>
            <button onClick={downloadQR} style={{ padding:'7px 14px', borderRadius:'9px', border:'none', background:'linear-gradient(135deg,#FF6B35,#E85A24)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer' }}>
              ⬇️ تحميل
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:'auto', padding:'16px' }}>
          <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:'16px', maxWidth:'900px', margin:'0 auto' }}>

            {/* Left: QR Preview */}
            <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>

              <div style={{ background:'white', borderRadius:'18px', border:'1px solid #E5E7EB', overflow:'hidden', boxShadow:'0 4px 20px rgba(0,0,0,0.08)' }}>
                <div style={{ padding:'14px 18px', borderBottom:'1px solid #E5E7EB', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <span style={{ fontSize:'14px', fontWeight:'800' }}>معاينة QR Code</span>
                  <span style={{ fontSize:'12px', color:'#9CA3AF' }}>قابل للمسح ✅</span>
                </div>

                {/* Card */}
                <div style={{ padding:'24px', display:'flex', justifyContent:'center' }}>
                  <div style={{ width:'260px', borderRadius:'20px', overflow:'hidden', boxShadow:'0 8px 32px rgba(0,0,0,0.15)' }}>

                    {/* Header */}
                    <div style={{ background: style.cardBg, padding:'20px 20px 14px', display:'flex', flexDirection:'column', alignItems:'center', gap:'10px' }}>
                      <div style={{ width:'52px', height:'52px', borderRadius:'14px', background: style.logoBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'26px' }}>🍕</div>
                      <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'17px', color: style.textColor, textAlign:'center' }}>
                        {restaurant?.name || 'مطعمك'}
                      </div>
                      <div style={{ fontSize:'11px', color: style.textColor, opacity:0.7, textAlign:'center' }}>
                        امسح للاطلاع على المنيو وتقديم طلبك
                      </div>
                    </div>

                    {/* QR */}
                    <div style={{ background:'white', padding:'16px', display:'flex', flexDirection:'column', alignItems:'center', gap:'10px' }}>
                      <canvas ref={canvasRef} style={{ borderRadius:'8px', display:'block' }} />
                      <div style={{ fontSize:'11px', color:'#9CA3AF', fontWeight:'700' }}>
                        📷 امسح للطلب
                      </div>
                    </div>

                    {/* URL */}
                    <div style={{ background:'#F8F9FB', padding:'10px', textAlign:'center' }}>
                      <div style={{ fontSize:'10px', color:'#9CA3AF', direction:'ltr', fontWeight:'600', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {menuURL.replace('https://','')}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', padding:'0 16px 16px' }}>
                  <button onClick={downloadQR} style={{ padding:'12px', borderRadius:'12px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'13px', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:'5px', color:'#374151' }}>
                    <span style={{ fontSize:'22px' }}>🖼️</span>
                    تحميل PNG
                  </button>
                  <button onClick={() => window.print()} style={{ padding:'12px', borderRadius:'12px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'13px', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:'5px', color:'#374151' }}>
                    <span style={{ fontSize:'22px' }}>🖨️</span>
                    طباعة
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', padding:'16px' }}>
                <div style={{ fontSize:'14px', fontWeight:'800', marginBottom:'14px' }}>📊 إحصائيات</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px' }}>
                  {[
                    { val:'124', label:'مسح هذا الشهر', color:'#FF6B35' },
                    { val:'89',  label:'زيارة فريدة',   color:'#3B82F6' },
                    { val:'68%', label:'معدل الطلب',     color:'#10B981' },
                  ].map(s => (
                    <div key={s.label} style={{ background:'#F8F9FB', borderRadius:'12px', padding:'12px', textAlign:'center' }}>
                      <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'20px', color:s.color, marginBottom:'4px' }}>{s.val}</div>
                      <div style={{ fontSize:'10px', color:'#9CA3AF', fontWeight:'600' }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Settings */}
            <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>

              {/* Style */}
              <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', overflow:'hidden' }}>
                <div style={{ padding:'14px 18px', borderBottom:'1px solid #E5E7EB', fontSize:'14px', fontWeight:'800' }}>🎨 ستايل الكارت</div>
                <div style={{ padding:'14px 16px', display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px' }}>
                  {Object.entries(STYLES).map(([key, s]) => (
                    <div key={key} onClick={() => setCardStyle(key)} style={{ borderRadius:'12px', overflow:'hidden', cursor:'pointer', border:`2.5px solid ${cardStyle===key?'#FF6B35':'#E5E7EB'}`, boxShadow:cardStyle===key?'0 0 0 3px rgba(255,107,53,0.15)':'none', transition:'all 0.2s', aspectRatio:'3/4' }}>
                      <div style={{ height:'100%', background:s.cardBg, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'6px', padding:'8px' }}>
                        <div style={{ width:'28px', height:'28px', borderRadius:'8px', background:s.logoBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px' }}>🍕</div>
                        <div style={{ width:'32px', height:'32px', background:'white', borderRadius:'6px' }}/>
                        <div style={{ fontSize:'9px', color:s.textColor, fontWeight:'700', opacity:0.8, textAlign:'center' }}>
                          {key==='orange'?'برتقالي':key==='dark'?'داكن':key==='green'?'أخضر':key==='blue'?'أزرق':key==='purple'?'بنفسجي':'أبيض'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* QR Color */}
              <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', overflow:'hidden' }}>
                <div style={{ padding:'14px 18px', borderBottom:'1px solid #E5E7EB', fontSize:'14px', fontWeight:'800' }}>🎯 لون QR</div>
                <div style={{ padding:'14px 16px', display:'flex', gap:'10px', flexWrap:'wrap' }}>
                  {QR_COLORS.map(c => (
                    <div key={c} onClick={() => setQrColor(c)} style={{ width:'36px', height:'36px', borderRadius:'50%', background:c, cursor:'pointer', border:`3px solid ${qrColor===c?'#0F1117':'transparent'}`, boxShadow:qrColor===c?'0 0 0 2px white inset':'none', transition:'all 0.2s', transform:qrColor===c?'scale(1.1)':'scale(1)' }}/>
                  ))}
                </div>
              </div>

              {/* Size */}
              <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', overflow:'hidden' }}>
                <div style={{ padding:'14px 18px', borderBottom:'1px solid #E5E7EB', fontSize:'14px', fontWeight:'800' }}>📐 الحجم</div>
                <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:'12px' }}>
                  <input type="range" min="140" max="260" value={qrSize} onChange={e => setQrSize(parseInt(e.target.value))} style={{ flex:1, accentColor:'#FF6B35' }}/>
                  <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'14px', color:'#FF6B35', minWidth:'50px', textAlign:'center' }}>{qrSize}px</span>
                </div>
              </div>

              {/* Share */}
              <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', overflow:'hidden' }}>
                <div style={{ padding:'14px 18px', borderBottom:'1px solid #E5E7EB', fontSize:'14px', fontWeight:'800' }}>📤 مشاركة</div>
                <div style={{ padding:'14px 16px' }}>
                  <div style={{ display:'flex', gap:'8px', marginBottom:'12px' }}>
                    <input readOnly value={menuURL} style={{ flex:1, padding:'10px 12px', border:'1.5px solid #E5E7EB', borderRadius:'10px', fontFamily:'Tajawal,sans-serif', fontSize:'12px', color:'#9CA3AF', background:'#F8F9FB', outline:'none', direction:'ltr', textAlign:'left' }}/>
                    <button onClick={copyURL} style={{ padding:'10px 14px', borderRadius:'10px', border:'none', background:'#FF6B35', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer' }}>نسخ</button>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                    {[
                      { icon:'💬', label:'واتساب',    action: shareWhatsApp },
                      { icon:'📋', label:'نسخ الرابط', action: copyURL },
                      { icon:'📧', label:'إيميل',      action: () => window.open(`mailto:?subject=منيو ${restaurant?.name}&body=${menuURL}`) },
                      { icon:'🌐', label:'فتح المنيو', action: () => window.open(menuURL, '_blank') },
                    ].map(s => (
                      <button key={s.label} onClick={s.action} style={{ padding:'11px 12px', borderRadius:'11px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer', display:'flex', alignItems:'center', gap:'8px', color:'#374151' }}>
                        <span style={{ fontSize:'18px' }}>{s.icon}</span>{s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </main>
    </div>
  )
      }
