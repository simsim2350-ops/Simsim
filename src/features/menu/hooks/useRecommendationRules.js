import { useEffect, useState } from 'react'
import { fetchActiveRecommendationsMap } from '../../../lib/recommendationsApi'

// قواعد الاقتراحات المفعّلة لهذا المطعم — تُحمَّل مرة واحدة مع فتح المنيو (Map<source_product_id, recommended_product_id[]>)
export function useRecommendationRules(restaurant) {
  const [map, setMap] = useState(new Map())

  useEffect(() => {
    if (!restaurant?.id) return
    let cancelled = false
    fetchActiveRecommendationsMap(restaurant.id)
      .then(m => { if (!cancelled) setMap(m) })
      .catch(() => { if (!cancelled) setMap(new Map()) })
    return () => { cancelled = true }
  }, [restaurant?.id])

  return map
}
