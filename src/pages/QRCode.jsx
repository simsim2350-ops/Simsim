import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'
import AppShell from '../components/AppShell'
import { useBreakpoint } from '../hooks/useBreakpoint'
import QRCode from 'qrcode'
import { fetchBranches } from '../lib/branchesApi'

const QR_COLORS = ['#0B0B0F','#FF6A00','#10B981','#3B82F6','#8B5CF6','#EC4899','#F59E0B','#EF4444']

const STYLES = {
  orange: { cardBg:'linear-gradient(135deg,#FF6A00,#E05D00)', from:'#FF6A00', to:'#E05D00', textColor:'white', logoBg:'rgba(255,255,255,0.2)' },
  dark:   { cardBg:'linear-gradient(135deg,#0B0B0F,#1A1A2E)', from:'#0B0B0F', to:'#1A1A2E', textColor:'white', logoBg:'rgba(255,106,0,0.2)' },
  green:  { cardBg:'linear-gradient(135deg,#10B981,#059669)', from:'#10B981', to:'#059669', textColor:'white', logoBg:'rgba(255,255,255,0.2)' },
  blue:   { cardBg:'linear-gradient(135deg,#3B82F6,#2563EB)', from:'#3B82F6', to:'#2563EB', textColor:'white', logoBg:'rgba(255,255,255,0.2)' },
  purple: { cardBg:'linear-gradient(135deg,#8B5CF6,#7C3AED)', from:'#8B5CF6', to:'#7C3AED', textColor:'white', logoBg:'rgba(255,255,255,0.2)' },
  white:  { cardBg:'#FFFFFF', from:'#FFFFFF', to:'#FFFFFF', textColor:'#0B0B0F', logoBg:'#F0F2F5' },
}

export default function QRCodePage() {
  const navigate = useNavigate()
  const { user, restaurant } = useAuthStore()
  const canvasRef = useRef(null)
  const [qrColor, setQrColor] = useState('#0B0B0F')
  const [qrSize, setQrSize] = useState(200)
  const [cardStyle, setCardStyle] = useState('orange')
  const [branches, setBranches] = useState([])
  const [selectedBranch, setSelectedBranch] = useState('') // '' = الفرع الرئيسي
  const { isMobile } = useBreakpoint()

  useEffect(() => {
    if (!restaurant) return
    fetchBranches(restaurant.id).then(setBranches).catch(() => {})
  }, [restaurant])

  const menuURL = restaurant
    ? `${window.location.origin}/menu/${restaurant.slug}${selectedBranch ? `?branch=${selectedBranch}` : ''}`
    : ''

  useEffect(() => {
    if (restaurant) generateQR()
  }, [restaurant, qrColor, qrSize, selectedBranch])

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
    link.download = `qr-${restaurant?.slug || 'menu'}${selectedBranch ? `-${selectedBranch}` : ''}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
    toast.success('تم تحميل QR Code ✅')
  }

  // تحميل الكارت كامل (الخلفية + الاسم + QR + الرابط) كصورة واحدة — بديل عن الطباعة
  const downloadCardImage = async () => {
    const qrCanvas = canvasRef.current
    if (!qrCanvas || !restaurant) return

    const W = 600, H = 760
    const out = document.createElement('canvas')
    out.width = W
    out.height = H
    const ctx = out.getContext('2d')
    const s = STYLES[cardStyle] || STYLES.orange

    // الخلفية المتدرجة العليا
    const grad = ctx.createLinearGradient(0, 0, W, 280)
    grad.addColorStop(0, s.from)
    grad.addColorStop(1, s.to)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, 280)

    // أيقونة دائرية شفافة كخلفية للشعار
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.beginPath()
    ctx.arc(W/2, 106, 56, 0, Math.PI * 2)
    ctx.fill()

    // الشعار الحقيقي لو موجود، وإلا إيموجي افتراضي
    if (restaurant.logo_url) {
      try {
        const logoImg = await new Promise((resolve, reject) => {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => resolve(img)
          img.onerror = reject
          img.src = restaurant.logo_url
        })
        // قص الشعار في دائرة بنفس حجم الأيقونة
        ctx.save()
        ctx.beginPath()
        ctx.arc(W/2, 106, 50, 0, Math.PI * 2)
        ctx.clip()
        ctx.drawImage(logoImg, W/2 - 50, 106 - 50, 100, 100)
        ctx.restore()
      } catch {
        ctx.font = '64px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('🍕', W/2, 110)
      }
    } else {
      ctx.font = '64px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('🍕', W/2, 110)
    }

    // اسم المطعم
    ctx.fillStyle = s.textColor === 'white' ? '#FFFFFF' : '#0B0B0F'
    ctx.font = '700 34px Tajawal, Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.direction = 'rtl'
    ctx.fillText(restaurant.name || 'مطعمك', W/2, 210)

    // الوصف
    ctx.globalAlpha = 0.85
    ctx.font = '400 18px Tajawal, Arial, sans-serif'
    ctx.fillText('امسح للاطلاع على المنيو وتقديم طلبك', W/2, 250)
    ctx.globalAlpha = 1

    // خلفية بيضاء للجزء السفلي
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 280, W, H - 280)

    // رسم QR نفسه في المنتصف
    const qrSizeOut = 340
    ctx.drawImage(qrCanvas, (W - qrSizeOut)/2, 320, qrSizeOut, qrSizeOut)

    // نص "امسح للطلب"
    ctx.fillStyle = '#9CA3AF'
    ctx.font = '700 16px Tajawal, Arial, sans-serif'
    ctx.fillText('📷 امسح للطلب', W/2, 320 + qrSizeOut + 30)

    // الرابط
    ctx.fillStyle = '#6B7280'
    ctx.font = '600 15px Tajawal, Arial, sans-serif'
    ctx.direction = 'ltr'
    ctx.fillText(menuURL.replace('https://',''), W/2, 320 + qrSizeOut + 60)

    const link = document.createElement('a')
    link.download = `menu-card-${restaurant.slug}-${cardStyle}-${Date.now()}.png`
    try {
      link.href = out.toDataURL('image/png')
      link.click()
      toast.success('تم تحميل الكارت ✅')
    } catch (err) {
      console.error('Card export failed:', err)
      toast.error('تعذّر تحميل الكارت بسبب الشعار، جرّب بدون شعار مخصص')
    }
  }

  const copyURL = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(menuURL)
      } else {
        // Fallback for browsers/contexts without Clipboard API support
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

  const style = STYLES[cardStyle] || STYLES.orange

  return (
    <AppShell
      active="qr"
      title="📱 QR Code"
      actions={<>
        <button onClick={() => navigate('/dashboard')} style={{ padding:'7px 12px', borderRadius:'9px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Cairo,sans-serif', fontWeight:'600', fontSize:'12px', cursor:'pointer', color:'#374151' }}>← الرئيسية</button>
        <button onClick={downloadQR} style={{ padding:'7px 14px', borderRadius:'9px', border:'none', background:'linear-gradient(135deg,#FF6A00,#E05D00)', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer' }}>⬇️ تحميل</button>
      </>}
    >

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
                      <div style={{ width:'52px', height:'52px', borderRadius:'14px', background: restaurant?.logo_url ? 'transparent' : style.logoBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'26px', overflow:'hidden' }}>
                        {restaurant?.logo_url ? <img src={restaurant.logo_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : '🍕'}
                      </div>
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
                  <button onClick={downloadCardImage} style={{ padding:'12px', borderRadius:'12px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'13px', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:'5px', color:'#374151' }}>
                    <span style={{ fontSize:'22px' }}>🎴</span>
                    تحميل الكارت
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Settings */}
            <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>

              {/* اختيار الفرع — كل فرع له رابط/QR مستقل */}
              {branches.length > 1 && (
                <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', overflow:'hidden' }}>
                  <div style={{ padding:'14px 18px', borderBottom:'1px solid #E5E7EB', fontSize:'14px', fontWeight:'800' }}>🏢 الفرع</div>
                  <div style={{ padding:'14px 16px' }}>
                    <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)} style={{ width:'100%', padding:'11px 13px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', fontWeight:'700', color:'#0B0B0F', background:'white', cursor:'pointer', outline:'none' }}>
                      {branches.map(b => <option key={b.id} value={b.is_primary ? '' : b.id}>{b.is_primary ? '🏠' : '🏢'} {b.name}</option>)}
                    </select>
                    <div style={{ fontSize:'11px', color:'#9CA3AF', marginTop:'6px' }}>لكل فرع رابط وQR مستقلان.</div>
                  </div>
                </div>
              )}

              {/* Style */}
              <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', overflow:'hidden' }}>
                <div style={{ padding:'14px 18px', borderBottom:'1px solid #E5E7EB', fontSize:'14px', fontWeight:'800' }}>🎨 ستايل الكارت</div>
                <div style={{ padding:'14px 16px', display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px' }}>
                  {Object.entries(STYLES).map(([key, s]) => (
                    <div key={key} onClick={() => setCardStyle(key)} style={{ borderRadius:'12px', overflow:'hidden', cursor:'pointer', border:`2.5px solid ${cardStyle===key?'#FF6A00':'#E5E7EB'}`, boxShadow:cardStyle===key?'0 0 0 3px rgba(255,106,0,0.15)':'none', transition:'all 0.2s', aspectRatio:'3/4' }}>
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
                    <div key={c} onClick={() => setQrColor(c)} style={{ width:'36px', height:'36px', borderRadius:'50%', background:c, cursor:'pointer', border:`3px solid ${qrColor===c?'#0B0B0F':'transparent'}`, boxShadow:qrColor===c?'0 0 0 2px white inset':'none', transition:'all 0.2s', transform:qrColor===c?'scale(1.1)':'scale(1)' }}/>
                  ))}
                </div>
              </div>

              {/* Size */}
              <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', overflow:'hidden' }}>
                <div style={{ padding:'14px 18px', borderBottom:'1px solid #E5E7EB', fontSize:'14px', fontWeight:'800' }}>📐 الحجم</div>
                <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:'12px' }}>
                  <input type="range" min="140" max="260" value={qrSize} onChange={e => setQrSize(parseInt(e.target.value))} style={{ flex:1, accentColor:'#FF6A00' }}/>
                  <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'14px', color:'#FF6A00', minWidth:'50px', textAlign:'center' }}>{qrSize}px</span>
                </div>
              </div>

              {/* Share */}
              <div style={{ background:'white', borderRadius:'16px', border:'1px solid #E5E7EB', overflow:'hidden' }}>
                <div style={{ padding:'14px 18px', borderBottom:'1px solid #E5E7EB', fontSize:'14px', fontWeight:'800' }}>📤 مشاركة</div>
                <div style={{ padding:'14px 16px' }}>
                  <div style={{ display:'flex', gap:'8px', marginBottom:'12px' }}>
                    <input readOnly value={menuURL} style={{ flex:1, padding:'10px 12px', border:'1.5px solid #E5E7EB', borderRadius:'10px', fontFamily:'Tajawal,sans-serif', fontSize:'12px', color:'#9CA3AF', background:'#F8F9FB', outline:'none', direction:'ltr', textAlign:'left' }}/>
                    <button onClick={copyURL} style={{ padding:'10px 14px', borderRadius:'10px', border:'none', background:'#FF6A00', color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer' }}>نسخ</button>
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
    </AppShell>
  )
}
