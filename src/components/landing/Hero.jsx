import { Link } from 'react-router-dom'
import PhoneMockup from './PhoneMockup'
import Icon from './Icons'

// رمز QR تمثيلي خفيف (نمط SVG) — يعبّر عن ميزة الـQR بلا صورة ثقيلة.
function QrGlyph() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="8" fill="#0F1117" />
      <g fill="#fff">
        <rect x="10" y="10" width="16" height="16" rx="2" fill="none" stroke="#fff" strokeWidth="3" />
        <rect x="15" y="15" width="6" height="6" />
        <rect x="38" y="10" width="16" height="16" rx="2" fill="none" stroke="#fff" strokeWidth="3" />
        <rect x="43" y="15" width="6" height="6" />
        <rect x="10" y="38" width="16" height="16" rx="2" fill="none" stroke="#fff" strokeWidth="3" />
        <rect x="15" y="43" width="6" height="6" />
        <rect x="34" y="34" width="5" height="5" /><rect x="43" y="34" width="5" height="5" />
        <rect x="52" y="34" width="4" height="5" /><rect x="34" y="43" width="5" height="5" />
        <rect x="43" y="43" width="5" height="5" /><rect x="49" y="49" width="7" height="7" />
        <rect x="34" y="52" width="5" height="4" />
      </g>
    </svg>
  )
}

export default function Hero() {
  return (
    <section className="ss-hero" id="hero">
      <div className="ss-container ss-hero__grid">
        <div className="ss-hero__copy ss-reveal">
          <span className="ss-eyebrow ss-hero__badge">🚀 منصّة منيو المطاعم</span>
          <h1>منيو مطعمك الاحترافي <span className="ss-grad-text">يبدأ من هنا</span></h1>
          <p className="ss-hero__sub">
            سمسم ليس مجرد منيو — أنشئ منيوك الإلكتروني في دقائق، استقبل الطلبات،
            وابنِ ولاء عملائك. كل ذلك من مكان واحد وبرابط وQR&nbsp;Code.
          </p>

          <div className="ss-hero__cta">
            <Link to="/register" className="ss-btn ss-btn--primary ss-btn--lg">أنشئ منيو مطعمك مجاناً</Link>
            <a href="#menu-preview" className="ss-btn ss-btn--ghost ss-btn--lg">جرّب المنيو التفاعلي</a>
          </div>

          <div className="ss-hero__trust">
            <Icon name="check" size={18} />
            <span>مجاني للبدء</span>
            <span className="ss-hero__dot" />
            <span>بدون بطاقة بنكية</span>
          </div>
        </div>

        <div className="ss-hero__visual ss-reveal" data-delay="1">
          <div className="ss-phone__glow" />
          <div className="ss-float ss-float--slow">
            <PhoneMockup />
          </div>

          <div className="ss-hero__qr ss-float" aria-hidden="true">
            <QrGlyph />
            <span>امسح واطلب</span>
          </div>
          <div className="ss-hero__pill-float ss-float ss-float--slow" aria-hidden="true">
            <span className="ss-ic">🔔</span>
            <span>طلب جديد وصل!</span>
          </div>
        </div>
      </div>
    </section>
  )
}
