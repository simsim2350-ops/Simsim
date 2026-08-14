import { Link } from 'react-router-dom'
import PhoneMockup from './PhoneMockup'
import Icon from './Icons'
import { PREVIEW_POINTS } from '../../config/landingContent'

// قسم المعاينة الحية — يشعر الزائر أنه يرى المنتج الحقيقي داخل الموقع.
// CTA «شاهد مثالاً» في الـHero يمرّر إلى هنا (id=menu-preview).
export default function MenuPreview() {
  return (
    <section className="ss-section ss-preview" id="menu-preview">
      <div className="ss-container">
        <div className="ss-section-head ss-reveal">
          <span className="ss-eyebrow">👀 معاينة حيّة</span>
          <h2>شاهد كيف يرى عميلك المنيو</h2>
          <p>هذه هي التجربة الحقيقية التي يحصل عليها عملاؤك على جوالهم.</p>
        </div>

        <div className="ss-preview__wrap">
          <div className="ss-preview__phone ss-reveal">
            <div className="ss-float ss-float--slow"><PhoneMockup /></div>
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
              <Link to="/register" className="ss-btn ss-btn--primary ss-btn--lg">أنشئ منيوك مثله مجاناً</Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
