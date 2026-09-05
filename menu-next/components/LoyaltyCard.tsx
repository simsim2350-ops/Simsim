import type { LoyaltyInfo } from '@/lib/loyalty'
import { t } from '@/lib/i18n'
import type { Lang } from '@/lib/types'

// Same business logic/fields as src/features/menu/LoyaltyCard.jsx (balance,
// threshold, reward, tier, expiry) — new visual treatment matching
// menu-next's own card/BEM conventions rather than the old dark-gradient design.
export function LoyaltyCard({ loyalty, brandColor, lang }: { loyalty: LoyaltyInfo; brandColor: string; lang: Lang }) {
  const strings = t(lang)
  const isEn = lang === 'en'
  const threshold = loyalty.reward_threshold || 0
  const balance = loyalty.balance || 0
  const ready = threshold > 0 && balance >= threshold
  const pct = threshold > 0 ? Math.min(100, Math.round((balance / threshold) * 100)) : 0
  const reward = loyalty.reward_description || strings.loyaltyRewardDefault
  const toNext = loyalty.next_tier_name && loyalty.next_tier_min != null ? Math.max(0, loyalty.next_tier_min - (loyalty.earned || 0)) : null

  return (
    <div className="loyalty-card">
      <div className="loyalty-card__top">
        <span className="loyalty-card__label">⭐ {strings.loyaltyPoints}</span>
        {loyalty.tier_name && (
          <span className="loyalty-card__tier">{loyalty.tier_icon} {loyalty.tier_name}</span>
        )}
      </div>
      <div className="loyalty-card__balance">
        {balance}<span>{strings.loyaltyPtsUnit}</span>
      </div>
      {ready ? (
        <div className="loyalty-card__ready" style={{ background: `${brandColor}18`, color: brandColor }}>
          🎉 {strings.loyaltyRewardReady}: {reward}
        </div>
      ) : (
        <>
          <div className="loyalty-card__bar">
            <div className="loyalty-card__bar-fill" style={{ width: `${pct}%`, background: brandColor }} />
          </div>
          <div className="loyalty-card__hint">
            {isEn ? `${Math.max(0, threshold - balance)} pts left to unlock` : `باقي ${Math.max(0, threshold - balance)} نقطة على`}: {reward}
          </div>
        </>
      )}
      {toNext != null && (
        <div className="loyalty-card__next-tier">
          🏅 {isEn ? `${toNext} pts to reach ${loyalty.next_tier_name}` : `باقي ${toNext} نقطة للترقّي إلى ${loyalty.next_tier_name}`}
        </div>
      )}
    </div>
  )
}
