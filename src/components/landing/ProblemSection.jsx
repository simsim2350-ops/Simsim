import Icon from './Icons'
import { PAINS } from '../../config/landingContent'

export default function ProblemSection() {
  return (
    <section className="ss-section ss-problem" id="problem">
      <div className="ss-container">
        <div className="ss-section-head ss-reveal">
          <span className="ss-eyebrow">😮‍💨 المشكلة</span>
          <h2>تعبت من المنيو الورقي؟</h2>
          <p>معظم أصحاب المطاعم يواجهون نفس المتاعب كل يوم.</p>
        </div>

        <div className="ss-problem__grid">
          {PAINS.map((p, i) => (
            <div className="ss-pain ss-reveal" data-delay={i % 3} key={p.text}>
              <span className="ss-pain__ic"><Icon name={p.icon} size={22} /></span>
              <span className="ss-pain__t">{p.text}</span>
            </div>
          ))}
        </div>

        <div className="ss-problem__solve ss-reveal">
          <h3>سمسم يحلّها من مكان واحد.</h3>
          <p>منيو رقمي، رابط، QR، وطلبات — كل شيء بلوحة واحدة بسيطة.</p>
        </div>
      </div>
    </section>
  )
}
