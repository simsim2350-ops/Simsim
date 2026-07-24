// بطاقة الولاء البريميوم — قاعدة داكنة محايدة + توهّج وشريط تقدّم بلون هوية المطعم
// تعرض مستوى العضوية (شارة + مؤشّر تقدّم للمستوى التالي) — ADR-38/P2.1ج
export default function LoyaltyCard({ loyalty, brandColor, isEn, t }) {
  const threshold = loyalty.reward_threshold || 0
  const balance = loyalty.balance || 0
  const ready = threshold > 0 && balance >= threshold
  const pct = threshold > 0 ? Math.min(100, Math.round((balance / threshold) * 100)) : 0
  const reward = loyalty.reward_description || t('rewardDefault')

  // المستوى
  const tierName = loyalty.tier_name
  const tierIcon = loyalty.tier_icon
  const nextTier = loyalty.next_tier_name
  const nextMin = loyalty.next_tier_min
  const earnedLife = loyalty.earned || 0
  const toNext = (nextTier && nextMin != null) ? Math.max(0, nextMin - earnedLife) : null

  return (
    <div style={{ borderRadius:'18px', padding:'16px', color:'white', marginBottom:'14px', position:'relative', overflow:'hidden', background:'linear-gradient(135deg, #23252E, #141519)', boxShadow:'0 10px 26px rgba(15,17,23,0.22)' }}>
      {/* توهّج بلون الهوية */}
      <div style={{ position:'absolute', top:'-34px', right:'-24px', width:'130px', height:'130px', borderRadius:'50%', background:`radial-gradient(circle, ${brandColor}88, transparent 70%)`, pointerEvents:'none' }}/>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', position:'relative', gap:'8px' }}>
        <span style={{ fontSize:'12.5px', fontWeight:'800', opacity:0.9 }}>⭐ {t('loyaltyPts')}</span>
        {tierName && (
          <span style={{ display:'inline-flex', alignItems:'center', gap:'4px', padding:'3px 9px', borderRadius:'100px', background:'rgba(255,255,255,0.16)', fontSize:'11px', fontWeight:'800', whiteSpace:'nowrap' }}>
            {tierIcon && <span>{tierIcon}</span>}{tierName}
          </span>
        )}
      </div>

      <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'27px', lineHeight:1, marginTop:'12px', position:'relative' }}>
        {balance}<span style={{ fontSize:'12px', fontWeight:'700', opacity:0.8 }}> {t('ptsUnit')}</span>
      </div>

      {ready ? (
        <div style={{ marginTop:'12px', background:'rgba(255,255,255,0.14)', borderRadius:'12px', padding:'10px 12px', fontSize:'13px', fontWeight:'800', position:'relative' }}>
          🎉 {isEn ? 'Your reward is ready' : 'مكافأتك جاهزة'}: {reward} — {isEn ? 'claim it at the restaurant!' : 'اطلبها عند المطعم!'}
        </div>
      ) : (
        <>
          <div style={{ height:'7px', background:'rgba(255,255,255,0.18)', borderRadius:'100px', overflow:'hidden', margin:'12px 0 8px', position:'relative' }}>
            <div style={{ width:`${pct}%`, height:'100%', background:`linear-gradient(90deg, #F6C560, ${brandColor})`, borderRadius:'100px', transition:'width 0.5s' }}/>
          </div>
          <div style={{ fontSize:'11.5px', opacity:0.9, position:'relative' }}>
            {isEn ? `${Math.max(0, threshold - balance)} pts left to unlock` : `باقي ${Math.max(0, threshold - balance)} نقطة على`}: {reward}
          </div>
        </>
      )}

      {/* مؤشّر تقدّم المستوى (يظهر فقط لو يوجد مستوى تالٍ) */}
      {toNext != null && (
        <div style={{ marginTop:'10px', paddingTop:'10px', borderTop:'1px solid rgba(255,255,255,0.12)', fontSize:'11px', opacity:0.9, display:'flex', alignItems:'center', gap:'6px', position:'relative' }}>
          <span>🏅</span>
          <span>{isEn ? `${toNext} pts to reach ${nextTier}` : `باقي ${toNext} نقطة للترقّي إلى ${nextTier}`}</span>
        </div>
      )}
    </div>
  )
}
