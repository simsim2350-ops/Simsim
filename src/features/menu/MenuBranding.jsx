// ============================================================================
// MenuBranding — عبارة «هوية المنيو» (صمم بواسطة سمسم) في المنيو العام.
// كل القيَم (الظهور/النص/الرابط/الشكل) تأتي من الإعداد المركزي (prop branding) —
// لا نص ثابت هنا (ADR: مصدر الحقيقة واحد = platform_branding عبر RPC menu_branding).
// ============================================================================

// شعار سمسم المصغّر (نفس علامة "S" المعتمدة في الشل/الأونبوردنغ) — بلا أصول خارجية.
function SimsimMark() {
  return (
    <span style={{
      width: '18px', height: '18px', flexShrink: 0, borderRadius: '5px',
      background: 'linear-gradient(135deg,#FF6B35,#E85A24)', color: 'white',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Cairo,sans-serif', fontWeight: '900', fontSize: '11px', lineHeight: 1,
    }}>S</span>
  )
}

export default function MenuBranding({ branding }) {
  // لا يظهر شيء إن كان مُطفأً أو بلا محتوى صالح
  if (!branding || !branding.show) return null
  const variant = branding.variant || 'text'
  const text = branding.text || ''
  const url = branding.url || ''
  const showText = variant !== 'logo'
  const showLogo = variant === 'logo' || variant === 'text_logo'
  if (showText && !text && !showLogo) return null

  const inner = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#9CA3AF', fontFamily: 'Tajawal,sans-serif', fontSize: '12px', fontWeight: '600', lineHeight: 1.4 }}>
      {showLogo && <SimsimMark />}
      {showText && text && <span>{text}</span>}
    </span>
  )

  return (
    <div dir="rtl" style={{ textAlign: 'center', padding: '20px 16px calc(24px + env(safe-area-inset-bottom, 0px))' }}>
      {url
        ? <a href={url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'inline-flex' }}>{inner}</a>
        : inner}
    </div>
  )
}
