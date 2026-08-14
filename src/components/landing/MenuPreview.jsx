import { useRef } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icons'
import InteractiveDemo from './demo/InteractiveDemo'
import { PREVIEW_POINTS } from '../../config/landingContent'

// قسم «جرّب بنفسك» — ديمو تفاعلي حقيقي للمنيو داخل الموقع (لا Screenshot).
// CTA «شاهد مثالاً» في الـHero يمرّر إلى هنا (id=menu-preview).
export default function MenuPreview() {
  const demoRef = useRef(null)

  return (
    <section className="ss-section ss-preview" id="menu-preview">
      <div className="ss-container">
        <div className="ss-section-head ss-reveal">
          <span className="ss-eyebrow">👀 جرّب بنفسك</span>
          <h2>جرّب منيو سمسم بنفسك</h2>
          <p>تصفّح المنيو كما يراه عميلك، واكتشف كيف تجعل تجربة الطلب أسهل وأسرع.</p>
        </div>

        <div className="ss-preview__wrap">
          <div className="ss-preview__phone ss-reveal">
            <InteractiveDemo controllerRef={demoRef} />
          </div>

          <div className="ss-preview__points">
            {PREVIEW_POINTS.map((p, i) => (
              <div className="ss-preview__point ss-reveal" data-delay={i} key={p.title}>
                <span className="ss-ic"><Icon name={p.icon} size={20} /></span>
                <div>
                  <h4>{p.title}</h4>
                  <p>{p.desc}</p>
                </div>
              </div>
            ))}
            <div className="ss-preview__cta ss-reveal">
              <Link to="/register" className="ss-btn ss-btn--primary ss-btn--lg">أنشئ منيو مطعمك مجاناً 🚀</Link>
              <button type="button" className="ss-btn ss-btn--onDark ss-btn--lg" onClick={() => demoRef.current?.openFull()}>
                فتح المنيو كامل الشاشة
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
