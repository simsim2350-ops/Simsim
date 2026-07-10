import { useEffect, useState } from 'react'
import { fetchActiveTables } from '../../../lib/tablesApi'

// طاولات المطعم المفعّلة فقط — لتعبئة قائمة اختيار رقم الطاولة في السلة (طلب داخل المطعم)
export function useTables(restaurant) {
  const [tables, setTables] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!restaurant?.id) { setLoading(false); return }
    let cancelled = false
    fetchActiveTables(restaurant.id)
      .then(data => { if (!cancelled) setTables(data) })
      .catch(() => { if (!cancelled) setTables([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [restaurant?.id])

  return { tables, loading }
}
