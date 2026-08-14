import Icon from './Icons'
import { FEATURES } from '../../config/landingContent'

export default function Features() {
  return (
    <section className="ss-section ss-problem" id="features">
      <div className="ss-container">
        <div className="ss-section-head ss-reveal">
          <span className="ss-eyebrow">✨ المزايا</span>
          <h2>كل ما يحتاجه مطعمك</h2>
          <p>مزايا مصمّمة خصيصاً لتسهّل إدارة منيوك وتجربة عملائك.</p>
        </div>

        <div className="ss-features__grid">
          {FEATURES.map((f, i) => (
            <div className="ss-feature ss-reveal" data-delay={i % 3} key={f.title}>
              <span className="ss-feature__ic"><Icon name={f.icon} size={24} /></span>
              <h3 className="ss-feature__t">{f.title}</h3>
              <p className="ss-feature__d">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
