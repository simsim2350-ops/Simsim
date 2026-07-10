import { useEffect, useState } from 'react'
import { fetchActiveCartWideIds } from '../../../lib/recommendationsApi'

// معرّفات أصناف قسم "أكمل وجبتك" العام في السلة — قائمة مستقلة ينسّقها صاحب المطعم بمعزل
// عن قواعد الأصناف الفردية (product_recommendations) وعن "🔥 الأكثر طلباً" (is_featured)
export function useCartWideIds(restaurant) {
  const [ids, setIds] = useState([])

  useEffect(() => {
    if (!restaurant?.id) return
    let cancelled = false
    fetchActiveCartWideIds(restaurant.id)
      .then(list => { if (!cancelled) setIds(list) })
      .catch(() => { if (!cancelled) setIds([]) })
    return () => { cancelled = true }
  }, [restaurant?.id])

  return ids
}
