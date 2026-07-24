import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { supabase } from '../../../lib/supabase'

// تقييمات الزبون بعد اكتمال الطلب — تصل لصاحب المطعم في لوحة التحكم
export function useReviews({ slug, restaurant, branch, t }) {
  const [reviewedIds, setReviewedIds] = useState([])       // طلبات قُيّمت بالفعل
  const [reviewDraft, setReviewDraft] = useState({})       // { [orderId]: { rating, comment } }
  const [submittingReview, setSubmittingReview] = useState(false)

  const REVIEWS_STORAGE_KEY = `simsim_reviewed_${slug}` // معرّفات الطلبات التي قُيّمت من هذا الجهاز

  // تحميل معرّفات الطلبات التي سبق تقييمها من هذا الجهاز (حتى لا يُقيّم الطلب مرتين)
  useEffect(() => {
    if (!slug) return
    try {
      const saved = JSON.parse(localStorage.getItem(REVIEWS_STORAGE_KEY) || '[]')
      if (Array.isArray(saved)) setReviewedIds(saved)
    } catch { /* تجاهل */ }
  }, [slug])

  const setDraft = (orderId, patch) => {
    setReviewDraft(prev => ({ ...prev, [orderId]: { rating: 0, comment: '', ...prev[orderId], ...patch } }))
  }

  // إرسال تقييم الزبون عبر دالة آمنة (submit_review): تتحقّق خادمياً من الطلب
  // وتشتقّ الاسم/الجوال/الفرع منه — لا نثق بإدخال العميل (سدّ ثغرة الإدراج العام — ADR-37).
  // التوقيع باقٍ كما هو للتوافق؛ customerName/customerPhone لم تعد تُرسَل (تُشتقّ من الطلب).
  const submitReview = async (order, _identity = {}) => {
    const draft = reviewDraft[order.id] || {}
    if (!draft.rating || draft.rating < 1) { toast.error(t('tPickStars')); return }
    setSubmittingReview(true)
    try {
      const { error } = await supabase.rpc('submit_review', {
        p_order_id: order.id,
        p_rating: draft.rating,
        p_comment: (draft.comment || '').trim() || null,
      })
      if (error) throw error
      const updated = [...reviewedIds, order.id]
      setReviewedIds(updated)
      localStorage.setItem(REVIEWS_STORAGE_KEY, JSON.stringify(updated))
      toast.success(t('tRevThanks'))
    } catch (err) {
      toast.error(t('tRevFail'))
    } finally {
      setSubmittingReview(false)
    }
  }

  return { reviewedIds, reviewDraft, setDraft, submitReview, submittingReview }
}
