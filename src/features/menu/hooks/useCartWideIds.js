import { useEffect, useState } from 'react'
import { fetchActiveCartWideIds } from '../../../lib/recommendationsApi'

// معرّفات أصناف قسم "أكمل وجبتك" العام في السلة — قائمة مستقلة لكل فرع ينسّقها صاحب المطعم بمعزل
// عن قواعد الأصناف الفردية (product_recommendations) وعن حالة «مميز» التي تغذي قائمة «الأكثر طلبًا 🔥».
export function useCartWideIds(restaurant, branch) {
  const [ids, setIds] = useState([])

  useEffect(() => {
    if (!restaurant?.id || !branch?.id) return
    let cancelled = false
    fetchActiveCartWideIds(restaurant.id, branch.id)
      .then(list => { if (!cancelled) setIds(list) })
      .catch(() => { if (!cancelled) setIds([]) })
    return () => { cancelled = true }
  }, [restaurant?.id, branch?.id])

  return ids
}
