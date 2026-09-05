import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { appConfig } from '../config'

// نقطة تحويل المنيو — تحوّل المنيو النهائي (سبتمبر 2026): منيو الزبون القديم
// (PublicMenu) لم يعد جزءاً من مسار الزبون الفعلي. مسار /menu/:slug هنا الآن
// يُحوِّل فوراً (client-side) إلى menu-next، محتفظاً بكل الاستعلامات
// (?branch=/?table=/?lang=...) كما وصلت حرفياً عبر window.location.search —
// بلا تفكيك/إعادة بناء يخاطر بإسقاط معامل غير متوقَّع. أي رابط/QR قديم يشير
// إلى /menu/:slug يستمر بالعمل، فقط ينتهي به المطاف على menu-next بدل
// PublicMenu. راجع SIMSIM_MENU_NEXT_FINAL_CUTOVER_REPORT.md للتفاصيل
// والتراجع الآمن (استبدال هذا العنصر بـ<PublicMenu /> يعيد السلوك السابق فوراً).
export default function MenuRedirect() {
  const { slug } = useParams()

  useEffect(() => {
    const target = `${appConfig.menuNextBaseUrl}/menu/${slug}${window.location.search}`
    window.location.replace(target)
  }, [slug])

  return (
    <div style={styles.page} dir="rtl">
      <style>{`@keyframes menu-redirect-spin{to{transform:rotate(360deg)}}`}</style>
      <div style={styles.panel} role="status" aria-live="polite">
        <div style={styles.spinner} aria-hidden="true" />
        <h1 style={styles.title}>جارٍ تحويلك للمنيو</h1>
        <p style={styles.copy}>لحظات ونكون هناك...</p>
      </div>
    </div>
  )
}

const styles = {
  page: { minHeight:'100vh', display:'grid', placeItems:'center', padding:'24px', background:'linear-gradient(135deg,#0B0B0F,#1A1A2E)', fontFamily:'Tajawal,sans-serif' },
  panel: { width:'100%', maxWidth:'380px', padding:'34px 28px', background:'white', borderRadius:'22px', textAlign:'center', boxShadow:'0 24px 64px rgba(0,0,0,0.28)' },
  spinner: { width:'44px', height:'44px', margin:'0 auto 18px', border:'3px solid #FDE2CD', borderTopColor:'#FF6A00', borderRadius:'50%', animation:'menu-redirect-spin 0.8s linear infinite' },
  title: { margin:'0 0 8px', color:'#111827', fontSize:'19px', fontWeight:'900' },
  copy: { margin:'0', color:'#6B7280', fontSize:'13px', lineHeight:'1.8' },
}
