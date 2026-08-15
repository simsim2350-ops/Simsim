// هيدر صفحة «طلباتي» — عنوان + زر رجوع + بطاقات KPI (عدد الطلبات · الإجمالي · النقاط)
// ملاحظة: الإجمالي والعدد يعكسان الطلبات الظاهرة على هذا الجهاز (الإنفاق مدى الحياة = مرحلة لاحقة)
export default function OrdersHeader({ brandColor, isEn, t, ordersCount, spend, points, hasLoyalty, onBack }) {
  const kpis = [
    { v: ordersCount, k: t('kpiOrders') },
    { v: `${spend.toFixed(0)} ﷼`, k: t('kpiSpend') },
    ...(hasLoyalty ? [{ v: points, k: t('kpiPoints') }] : []),
  ]
  return (
    <div style={{ background:`linear-gradient(150deg, ${brandColor}, ${brandColor}CC)`, padding:'18px 16px 16px', color:'white', position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', inset:0, background:'radial-gradient(circle at 70% 20%, rgba(255,255,255,0.12), transparent 60%)', pointerEvents:'none' }}/>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', position:'relative' }}>
        <button onClick={onBack} aria-label={isEn ? 'Back' : 'رجوع'} style={{ width:'32px', height:'32px', borderRadius:'50%', border:'none', background:'rgba(255,255,255,0.2)', color:'white', fontSize:'17px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>→</button>
        <h2 style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'18px', margin:0 }}>{t('ordersTitle')}</h2>
        <div style={{ width:'32px' }}/>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:`repeat(${kpis.length},1fr)`, gap:'8px', marginTop:'14px', position:'relative' }}>
        {kpis.map((c, i) => (
          <div key={i} style={{ background:'rgba(255,255,255,0.15)', borderRadius:'13px', padding:'10px 6px', textAlign:'center' }}>
            <div style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'15px', whiteSpace:'nowrap' }}>{c.v}</div>
            <div style={{ fontSize:'9.5px', opacity:0.9, marginTop:'2px' }}>{c.k}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
