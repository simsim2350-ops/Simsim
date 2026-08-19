export default function MenuReadinessCard({ readiness, compact = false, onResolve }) {
  if (!readiness) return null

  const essentialRows = readiness.essentials
  const incompleteRecommended = readiness.recommended.filter(row => !row.complete)
  const recommendedRows = compact ? incompleteRecommended.slice(0, 2) : readiness.recommended
  const nextLabel = readiness.nextEssential?.label || 'الأساسيات'
  const essentialsStatus = `${readiness.essentialsDone}/${readiness.essentialsTotal}`

  return (
    <section aria-label="جاهزية المشاركة" style={{ border:'1px solid #F1D7C7', borderRadius:'18px', background:'linear-gradient(135deg,#FFF9F5,#FFFFFF)', padding:compact ? '14px' : '18px', direction:'rtl' }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'12px', marginBottom:'12px' }}>
        <div>
          <div style={{ fontSize:compact ? '14px' : '16px', fontWeight:'900', color:'#111827', fontFamily:'Tajawal,sans-serif' }}>جاهزية المشاركة</div>
          <p style={{ margin:'3px 0 0', fontSize:'12px', color:'#6B7280', lineHeight:'1.6' }}>
            {readiness.minimumReady
              ? 'منيوك جاهز للمشاركة. يمكنك إضافة التحسينات لاحقًا.'
              : `أكمل الأساسيات التالية ليصبح رابط منيوك صالحًا للمشاركة: ${nextLabel}.`}
          </p>
        </div>
        <span style={{ fontSize:'12px', fontWeight:'900', color:readiness.minimumReady ? '#15803D' : '#C2410C', background:readiness.minimumReady ? '#DCFCE7' : '#FFF0E8', borderRadius:'999px', padding:'5px 9px', whiteSpace:'nowrap' }}>
          {readiness.minimumReady ? 'جاهز للمشاركة' : `الأساسيات ${essentialsStatus}`}
        </span>
      </div>

      <div style={{ display:'grid', gap:'12px' }}>
        <ReadinessGroup title="أساسيات جاهزية المشاركة" rows={essentialRows} tone="essential" />
        {recommendedRows.length > 0 && <ReadinessGroup title="تحسينات اختيارية" rows={recommendedRows} tone="recommended" />}
        {compact && incompleteRecommended.length > recommendedRows.length && (
          <div style={{ fontSize:'11px', color:'#9CA3AF' }}>وتوجد تحسينات اختيارية أخرى يمكنك إكمالها لاحقًا.</div>
        )}
      </div>

      {!readiness.minimumReady && onResolve && (
        <button type="button" onClick={onResolve} style={{ width:'100%', minHeight:'44px', marginTop:'14px', border:'none', borderRadius:'12px', background:'#FF6A00', color:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'14px', cursor:'pointer' }}>
          {readiness.nextEssential?.key === 'product' || readiness.nextEssential?.key === 'price' ? 'أضف أول صنف' : 'أكمل الأساسيات'}
        </button>
      )}
    </section>
  )
}

function ReadinessGroup({ title, rows, tone }) {
  if (!rows?.length) return null
  return (
    <div>
      <div style={{ fontSize:'12px', fontWeight:'900', color:tone === 'essential' ? '#374151' : '#6B7280', marginBottom:'6px' }}>{title}</div>
      <div style={{ display:'grid', gap:'5px' }}>
        {rows.map(row => (
          <div key={row.key} style={{ display:'flex', alignItems:'center', gap:'7px', fontSize:'12px', color:row.complete ? '#166534' : '#6B7280' }}>
            <span aria-hidden="true" style={{ width:'18px', height:'18px', display:'inline-flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', background:row.complete ? '#DCFCE7' : '#F3F4F6', color:row.complete ? '#15803D' : '#9CA3AF', fontWeight:'900', flexShrink:0 }}>{row.complete ? '✓' : '○'}</span>
            <span>{row.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
