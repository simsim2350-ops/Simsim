import type { ReactNode } from 'react'

// إطار المنيو — منقول حرفياً من كتلة <style> و.sm-menu-frame في src/pages/PublicMenu.jsx
// (Hero Design Tokens ADR-43 + نقاط الاستجابة للتابلت/اللابتوب). المصدر الوحيد لأبعاد الهيرو.
export default function MenuFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className="sm-menu-frame"
      dir="rtl"
      lang="ar"
      style={{ minHeight: '100vh', background: '#F8F9FB', direction: 'rtl', textAlign: 'right', fontFamily: 'Tajawal,sans-serif', maxWidth: '480px', margin: '0 auto', position: 'relative' }}
    >
      <style>{`
        html, body { background: #E4E7EE; }
        .sm-menu-frame * { box-sizing: border-box; }
        .sm-menu-frame {
          -webkit-text-size-adjust: 100%;
          text-size-adjust: 100%;
          --hero-image-h: clamp(96px, 26vw, 132px);
          --hero-overlap: calc(var(--hero-image-h) - 52px);
          --hero-radius: 22px;
          --hero-pad-x: 16px;
          --hero-pad-bottom: clamp(3px, 1.2vw, 6px);
          --hero-spacing: clamp(2px, 0.7vw, 5px);
          --hero-logo: clamp(44px, 12.5vw, 52px);
          --hero-social: clamp(26px, 7vw, 28px);
          --hero-stat-pad-y: 3px;
        }
        @media (min-width: 600px) and (max-width: 1023px) {
          .sm-menu-frame { box-shadow: 0 0 0 100vw #E4E7EE, 0 0 60px rgba(15,17,23,0.14); }
        }
        @media (min-width: 1024px) {
          .sm-menu-frame { max-width: 980px !important; box-shadow: 0 0 0 100vw #E4E7EE, 0 0 70px rgba(15,17,23,0.14); }
          .sm-products { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 14px !important; background: transparent !important; padding: 0 16px !important; }
        }
      `}</style>
      {children}
    </div>
  )
}
