// الحالة الفارغة لصفحة «طلباتي» — تشجّع الزبون على أول طلب
export default function EmptyOrders({ brandColor, t, onBack }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:'46px 30px 40px' }}>
      <div style={{ fontSize:'64px', marginBottom:'14px' }}>🧾</div>
      <h3 style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'18px', margin:'0 0 8px', color:'#0B0B0F' }}>{t('emptyTitle')}</h3>
      <p style={{ fontSize:'13px', color:'#9CA3AF', lineHeight:'1.8', margin:'0 0 22px', maxWidth:'260px' }}>{t('emptySub')}</p>
      <button
        onClick={onBack}
        style={{ padding:'14px 28px', borderRadius:'14px', border:'none', background:`linear-gradient(135deg, ${brandColor}, ${brandColor}CC)`, color:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'14px', cursor:'pointer', boxShadow:`0 8px 20px ${brandColor}44` }}
      >
        {t('browseMenu')}
      </button>
    </div>
  )
}
