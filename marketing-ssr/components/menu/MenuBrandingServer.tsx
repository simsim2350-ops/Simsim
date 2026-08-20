import type { MenuBranding } from '@/lib/menu-types'

// هوية المنيو «صمم بواسطة سمسم» — منقولة من src/features/menu/MenuBranding.jsx.
// كل القيَم من الإعداد المركزي (RPC menu_branding)؛ لا نص ثابت. لا يظهر شيء إن كانت مُطفأة.
export default function MenuBrandingServer({ branding }: { branding: MenuBranding | null }) {
  if (!branding || !branding.show) return null
  const variant = branding.variant || 'text'
  const text = branding.text || ''
  const url = branding.url || ''
  const showText = variant !== 'logo'
  const showLogo = variant === 'logo' || variant === 'text_logo'
  if (showText && !text && !showLogo) return null

  const inner = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#9CA3AF', fontFamily: 'Tajawal,sans-serif', fontSize: '12px', fontWeight: 600, lineHeight: 1.4 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {showLogo && <img src="/simsim-s.svg" alt="SIMSIM" style={{ height: '16px', width: 'auto', flexShrink: 0, display: 'block' }} />}
      {showText && text && <span>{text}</span>}
    </span>
  )

  return (
    <div dir="rtl" style={{ textAlign: 'center', padding: '20px 16px calc(24px + env(safe-area-inset-bottom, 0px))' }}>
      {url ? <a href={url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'inline-flex' }}>{inner}</a> : inner}
    </div>
  )
}
