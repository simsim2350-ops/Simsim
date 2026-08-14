// موك-أب هاتف يعرض منيو سمسم (تمثيل حقيقي للمنتج، لا Screenshot عام).
// يُستخدم في الـHero وفي قسم المعاينة الحية.

const ITEMS = [
  { emoji: '🍔', name: 'برجر سمسم الخاص', desc: 'لحم أنغوس + صوص سري', price: '32', best: true },
  { emoji: '🍟', name: 'بطاطس مقرمشة', desc: 'مع صوص الجبن', price: '14' },
  { emoji: '🥤', name: 'ليمون بالنعناع', desc: 'طازج ومنعش', price: '10' },
  { emoji: '🍰', name: 'تشيز كيك التوت', desc: 'قطعة تكفي شخصين', price: '18' },
]

export default function PhoneMockup() {
  return (
    <div className="ss-phone" role="img" aria-label="معاينة منيو مطعم على الجوال داخل تطبيق سمسم">
      <div className="ss-phone__notch" />
      <div className="ss-phone__screen">
        <div className="ss-menuUI">
          <div className="ss-menuUI__top">
            <div className="ss-menuUI__rest">مطعم الذواقة 🍽️</div>
            <div className="ss-menuUI__meta">
              <span>⭐ 4.9</span><span>•</span><span>مفتوح الآن</span><span>•</span><span>توصيل سريع</span>
            </div>
          </div>
          <div className="ss-menuUI__tabs">
            <span className="ss-menuUI__tab is-active">الأكثر طلباً</span>
            <span className="ss-menuUI__tab">برجر</span>
            <span className="ss-menuUI__tab">مشروبات</span>
            <span className="ss-menuUI__tab">حلويات</span>
          </div>
          <div className="ss-menuUI__list">
            {ITEMS.map((it) => (
              <div className="ss-menuUI__item" key={it.name}>
                <div className="ss-menuUI__thumb">{it.emoji}</div>
                <div className="ss-menuUI__info">
                  <div className="ss-menuUI__name">{it.name}</div>
                  <div className="ss-menuUI__desc">{it.desc}</div>
                  {it.best && <span className="ss-menuUI__badge">🔥 الأكثر طلباً</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                  <span className="ss-menuUI__price">{it.price} ﷼</span>
                  <span className="ss-menuUI__add" aria-hidden="true">+</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
