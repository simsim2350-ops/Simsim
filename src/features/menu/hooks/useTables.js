import { useEffect, useState } from 'react'
import { fetchActiveTables } from '../../../lib/tablesApi'

// طاولات الفرع المفعّلة فقط — لتعبئة قائمة اختيار رقم الطاولة في الطلب اليدوي داخل المطعم.
export function useTables(restaurant, branch) {
  const [tables, setTables] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!restaurant?.id || !branch?.id) { setTables([]); setLoading(false); return }
    let cancelled = false
    setLoading(true)
    fetchActiveTables(restaurant.id, branch.id)
      .then(data => { if (!cancelled) setTables(data) })
      .catch(() => { if (!cancelled) setTables([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [restaurant?.id, branch?.id])

  return { tables, loading }
}
