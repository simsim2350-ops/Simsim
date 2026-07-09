import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

// جلب نقاط ولاء الزبون المعروف (رقمه محفوظ من طلب سابق) — فور فتح المنيو،
// ويُعاد الجلب عند تغيّر الطلبات لتحديث الرصيد (لو البرنامج مفعّل)
export function useLoyalty({ slug, restaurant, orderPlaced, activeOrders, customerPhone }) {
  const [loyalty, setLoyalty] = useState(null) // معلومات نقاط الزبون (لو البرنامج مفعّل)
  const PHONE_STORAGE_KEY = `simsim_phone_${slug}`

  useEffect(() => {
    if (!restaurant) return
    let phone = customerPhone.replace(/[^\d]/g, '')
    if (!phone) { try { phone = localStorage.getItem(PHONE_STORAGE_KEY) || '' } catch { phone = '' } }
    if (!phone) { setLoyalty(null); return }
    supabase.rpc('get_customer_loyalty', { rest_id: restaurant.id, phone })
      .then(({ data }) => {
        const info = data && data[0]
        setLoyalty(info && info.enabled ? info : null)
      })
      .catch(() => setLoyalty(null))
  }, [orderPlaced, restaurant, activeOrders])

  return loyalty
}
