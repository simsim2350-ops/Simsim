export default function MenuReadinessCard({ readiness, compact = false, onResolve }) {
  if (!readiness) return null

  const progress = `${readiness.completionPercent || 0}%`
  const essentialRows = compact ? readiness.essentials.filter(row => !row.complete).slice(0, 2) : readiness.essentials
  const recommendedRows = compact ? readiness.recommended.filter(row => !row.complete).slice(0, 3) : readiness.recommended
  const nextLabel = readiness.nextEssential?.label || 'جاهز للمشاركة'

  return (
    <section aria-label="جاهزية المنيو" style={{ border:'1px solid #F1D7C7', borderRadius:'18px', background:'linear-gradient(135deg,#FFF9F5,#FFFFFF)', padding:compact ? '14px' : '18px', direction:'rtl' }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'12px', marginBottom:'12px' }}>
        <div>
          <div style={{ fontSize:compact ? '14px' : '16px', fontWeight:'900', color:'#111827', fontFamily:'Tajawal,sans-serif' }}>جاهزية المنيو</div>
          <p style={{ margin:'3px 0 0', fontSize:'12px', color:'#6B7280', lineHeight:'1.6' }}>
            {readiness.minimumReady ? 'منيوك يحقق الحد الأدنى القابل للمشاركة.' : `باقي خطوة ليصبح منيوك جاهزًا: ${nextLabel}.`}
          </p>
        </div>
        <span style={{ fontSize:'12px', fontWeight:'900', color:readiness.minimumReady ? '#15803D' : '#C2410C', background:readiness.minimumReady ? '#DCFCE7' : '#FFF0E8', borderRadius:'999px', padding:'5px 9px', whiteSpace:'nowrap' }}>
          {readiness.minimumReady ? 'جاهز للمشاركة' : 'غير جاهز بعد'}
        </span>
      </div>

      <div style={{ height:'7px', background:'#F3E8E1', borderRadius:'999px', overflow:'hidden', marginBottom:'14px' }} aria-label={`اكتمال ${progress}`}>
        <div style={{ height:'100%', width:progress, background:readiness.minimumReady ? 'linear-gradient(90deg,#16A34A,#22C55E)' : 'linear-gradient(90deg,#FF6A00,#F59E0B)', borderRadius:'inherit', transition:'width 180ms ease-out' }} />
      </div>

      <div style={{ display:'grid', gap:'10px' }}>
        <ReadinessGroup title="الأساسيات" rows={essentialRows} tone="essential" />
        {!compact && <ReadinessGroup title="تحسين تجربة العميل" rows={recommendedRows} tone="recommended" />}
        {compact && recommendedRows.length > 0 && <div style={{ fontSize:'11px', color:'#9CA3AF' }}>وتوجد {recommendedRows.length} تحسينات موصى بها لاحقًا.</div>}
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
