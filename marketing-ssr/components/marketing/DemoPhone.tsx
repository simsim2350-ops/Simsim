import type { DemoRestaurantPreview } from '@/lib/demo-restaurant'

// عرض ثابت من جهة الخادم (بلا JS عميل، بلا Realtime) لبيانات حية فعلية لمطعم العرض التجريبي —
// نسخة SSR من هاتف الهبوط بالتطبيق القديم (src/components/landing/PhoneMockup.jsx)، بنفس فكرة
// «للعرض فقط»: لا أزرار فعلية، لا إمكانية طلب حقيقي. تستخدم كلاسات hero-card/phone-top/menu-*
// الموجودة أصلاً في app/styles.css ولم تكن مستخدمة من أي مكوّن حتى الآن.
export function DemoPhone({ data }: { data: DemoRestaurantPreview }) {
  const hasFeatured = data.products.some((product) => product.featured)
  const tabs = [
    ...(hasFeatured ? [{ id: 'most-ordered', name: 'الأكثر طلبًا 🔥' }] : []),
    ...data.categories,
  ].slice(0, 4)

  return (
    <div className="hero-card" role="img" aria-label={`معاينة منيو ${data.name} على الجوال`}>
      <div className="phone-top">
        <span>{data.branchName || data.name}</span>
        <span>{data.open ? '🟢 مفتوح الآن' : '🔴 مغلق الآن'}</span>
      </div>
      <div
        className="menu-cover"
        style={data.coverUrl ? { backgroundImage: `linear-gradient(135deg, rgba(11,11,15,.15), rgba(11,11,15,.5)), url("${data.coverUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      />
      <div className="menu-content">
        <strong>{data.name}</strong>
        <small>{data.rating ? `⭐ ${data.rating.avg.toFixed(1)} (${data.rating.count})` : 'منيو تجريبي حي'}</small>
        {tabs.length > 0 && (
          <div className="menu-tabs">
            {tabs.map((tab, index) => <span key={tab.id} className={index === 0 ? 'is-active' : undefined}>{tab.name}</span>)}
          </div>
        )}
        {data.products.map((product) => (
          <div className="menu-row" key={product.id}>
            <span>{product.featured ? `🔥 ${product.name}` : product.name}</span>
            <b>{product.price} ﷼</b>
          </div>
        ))}
      </div>
    </div>
  )
}
