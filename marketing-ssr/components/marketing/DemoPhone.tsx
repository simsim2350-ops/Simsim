import type { DemoRestaurantPreview } from '@/lib/demo-restaurant'

// عرض ثابت من جهة الخادم (بلا JS عميل) لبيانات حية فعلية لمطعم العرض التجريبي — نسخة SSR من
// هاتف الهبوط بالتطبيق القديم (src/components/landing/PhoneMockup.jsx)، بنفس الفكرة: «للعرض
// فقط»، لا أزرار فعلية ولا إمكانية طلب حقيقي. تستخدم كلاسات ss-phone/ss-menuUI__* المنقولة من
// src/pages/landing.css بالموقع القديم.
export function DemoPhone({ data }: { data: DemoRestaurantPreview }) {
  const hasFeatured = data.products.some((product) => product.featured)
  const tabs = [
    ...(hasFeatured ? [{ id: 'most-ordered', name: 'الأكثر طلبًا 🔥' }] : []),
    ...data.categories,
  ].slice(0, 4)

  return (
    <div className="ss-phone" role="img" aria-label={`معاينة منيو ${data.name} على الجوال`}>
      <div className="ss-phone__notch" />
      <div className="ss-phone__screen">
        <div className="ss-menuUI">
          <div
            className="ss-menuUI__top"
            style={data.coverUrl ? { backgroundImage: `linear-gradient(135deg, rgba(11,11,15,.15), rgba(11,11,15,.5)), url("${data.coverUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
          >
            <div className="ss-menuUI__rest">{data.name}</div>
            <div className="ss-menuUI__meta">
              {data.rating && <><span>⭐ {data.rating.avg.toFixed(1)}</span><span>•</span></>}
              <span>{data.open ? 'مفتوح الآن' : 'مغلق الآن'}</span>
              {data.branchName && <><span>•</span><span>{data.branchName}</span></>}
            </div>
          </div>
          {tabs.length > 0 && (
            <div className="ss-menuUI__tabs">
              {tabs.map((tab, index) => <span key={tab.id} className={`ss-menuUI__tab${index === 0 ? ' is-active' : ''}`}>{tab.name}</span>)}
            </div>
          )}
          <div className="ss-menuUI__list">
            {data.products.map((product) => (
              <div className="ss-menuUI__item" key={product.id}>
                <div className="ss-menuUI__thumb"><span aria-hidden="true">🍽️</span></div>
                <div className="ss-menuUI__info">
                  <div className="ss-menuUI__name">{product.name}</div>
                  {product.featured && <span className="ss-menuUI__badge">الأكثر طلبًا 🔥</span>}
                </div>
                <div className="ss-menuUI__price">{product.price} ﷼</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
