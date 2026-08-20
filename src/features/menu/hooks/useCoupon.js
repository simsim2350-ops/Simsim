import { useState } from 'react'
import { toast } from 'react-hot-toast'
import { supabase } from '../../../lib/supabase'
import { computeCouponDiscount } from '../../../lib/pricing'

// تطبيق كوبون خصم حقيقي على السلة — يُتحقَّق منه مباشرة عند الدفع (وليس من القائمة المعروضة مسبقاً)
// لضمان أحدث حالة (تفعيل/انتهاء) حتى لو تغيّرت بعد تحميل الصفحة.
export function useCoupon({ restaurant, branch, cartTotal }) {
  const [couponInput, setCouponInput] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState(null)
  const [applying, setApplying] = useState(false)

  // TASK-CHK-003: نفس منطق create_order الخادمي حرفياً (تقريب + max_discount_amount) — يمنع
  // اختلاف الرقم المعروض عن الرقم الذي سيُرجعه الخادم فعلياً عند التأكيد.
  const discountAmount = computeCouponDiscount(appliedCoupon, cartTotal)

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
      if (data.branch_id && data.branch_id !== branch?.id) { toast.error('هذا الكوبون غير متاح لهذا الفرع'); return }
      if (data.expires_at && new Date(data.expires_at) < new Date()) { toast.error('انتهت صلاحية هذا الكوبون'); return }
      if (data.min_order_amount > 0 && cartTotal < data.min_order_amount) {
        toast.error(`هذا الكوبون يتطلب طلباً بحد أدنى ${data.min_order_amount} ﷼`)
        return
      }
      if (data.usage_limit != null && data.usage_count >= data.usage_limit) {
        toast.error('هذا الكوبون بلغ الحد الأقصى للاستخدام')
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
