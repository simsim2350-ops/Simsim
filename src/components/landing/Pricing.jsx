import { Link } from 'react-router-dom'
import Icon from './Icons'
import { PLANS } from '../../config/landingContent'

// قسم الأسعار — 3 باقات (المجانية / نمو / الاحترافية).
// الاشتراكات تُدار يدوياً في لوحة الأدمن؛ كل الأزرار تبدأ بإنشاء حساب مجاني.
export default function Pricing() {
  return (
    <section className="ss-section" id="pricing">
      <div className="ss-container">
        <div className="ss-section-head ss-reveal">
          <span className="ss-eyebrow">💳 الأسعار</span>
          <h2>باقة تناسب كل مرحلة من نمو مطعمك</h2>
          <p>ابدأ مجاناً، وارتقِ متى شئت. جميع الباقات تشمل أصنافاً غير محدودة.</p>
        </div>

        <div className="ss-pricing__grid ss-pricing__grid--3">
          {PLANS.map((plan, pi) => {
            const isPaid = plan.featured || plan.highlight
            return (
              <div
                className={`ss-plan ${plan.featured ? 'ss-plan--featured' : ''} ${plan.highlight ? 'ss-plan--pro' : ''} ss-reveal`}
                data-delay={pi}
                key={plan.id}
              >
                {plan.badge && <span className="ss-plan__tag">✨ {plan.badge}</span>}

                <div className="ss-plan__name">{plan.name}</div>
                <div className="ss-plan__desc">{plan.tagline}</div>

                <div className="ss-plan__price">
                  <span className="amt">{plan.price}</span>
                  {plan.priceSuffix && <span className="cur">{plan.priceSuffix}</span>}
                  {plan.per && <span className="per">{plan.per}</span>}
                </div>

                {plan.launch ? (
                  <div className="ss-plan__launch">
                    <span className="ss-plan__launch-amt">{plan.launch.amount} {plan.launch.unit}</span>
                    <span className="ss-plan__launch-note">{plan.launch.note}</span>
                  </div>
                ) : (
                  <div className="ss-plan__launch ss-plan__launch--empty" aria-hidden="true" />
                )}

                <div className="ss-plan__meta">{plan.meta}</div>

                {plan.includes && <div className="ss-plan__includes">{plan.includes}</div>}

                <ul className="ss-plan__feats">
                  {plan.features.map((f) => (
                    <li className="ss-plan__feat" key={f}>
                      <span className="ss-plan__check"><Icon name="check" size={18} /></span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="ss-plan__cta">
                  <Link
                    to="/register"
                    className={`ss-btn ss-btn--block ${isPaid ? 'ss-btn--primary' : 'ss-btn--ghost'}`}
                  >
                    {plan.cta}
                  </Link>
                </div>
              </div>
            )
          })}
        </div>

        <p className="ss-pricing__note">
          جميع الأسعار بالريال السعودي • تبدأ مجاناً بدون بطاقة بنكية • أسعار «عرض الإطلاق» لأول سنة فقط.
        </p>
      </div>
    </section>
  )
}
