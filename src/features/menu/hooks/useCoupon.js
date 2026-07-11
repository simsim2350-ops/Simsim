import { useState } from 'react'
import { toast } from 'react-hot-toast'
import { supabase } from '../../../lib/supabase'

// تطبيق كوبون خصم حقيقي على السلة — يُتحقَّق منه مباشرة عند الدفع (وليس من القائمة المعروضة مسبقاً)
// لضمان أحدث حالة (تفعيل/انتهاء) حتى لو تغيّرت بعد تحميل الصفحة.
export function useCoupon({ restaurant, cartTotal }) {
  const [couponInput, setCouponInput] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState(null)
  const [applying, setApplying] = useState(false)

  const discountAmount = appliedCoupon
    ? Math.min(
        cartTotal,
        appliedCoupon.discount_type === 'percent'
          ? cartTotal * (appliedCoupon.discount_value / 100)
          : appliedCoupon.discount_value
      )
    : 0

  const applyCoupon = async () => {
    const code = couponInput.trim().toUpperCase()
    if (!code) return
    setApplying(true)
    try {
      const { data } = await supabase
        .from('coupons')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .eq('code', code)
        .eq('is_active', true)
        .maybeSingle()

      if (!data) { toast.error('كود الكوبون غير صحيح'); return }
      if (data.expires_at && new Date(data.expires_at) < new Date()) { toast.error('انتهت صلاحية هذا الكوبون'); return }
      if (data.min_order_amount > 0 && cartTotal < data.min_order_amount) {
        toast.error(`هذا الكوبون يتطلب طلباً بحد أدنى ${data.min_order_amount} ﷼`)
        return
      }
      setAppliedCoupon(data)
      toast.success('تم تطبيق الكوبون ✅')
    } finally {
      setApplying(false)
    }
  }

  const removeCoupon = () => { setAppliedCoupon(null); setCouponInput('') }

  return { couponInput, setCouponInput, appliedCoupon, applyCoupon, removeCoupon, applying, discountAmount }
}
