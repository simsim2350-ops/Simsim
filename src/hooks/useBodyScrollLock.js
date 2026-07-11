import { useEffect } from 'react'

// عدّاد مشترك بين كل استدعاءات الخطّاف في الصفحة كلها — يسمح بتراكب أكثر من نافذة/قائمة
// منزلقة مفتوحة معاً (مثال: نافذة تأكيد فوق قائمة تفاصيل) بلا أن يُعيد إغلاق إحداها
// تمرير الصفحة الخلفية بينما الأخرى ما زالت مفتوحة.
let lockCount = 0

// يمنع تمرير الصفحة الخلفية بينما أي نافذة/قائمة منزلقة (Modal/Bottom Sheet) مفتوحة فوقها.
// استخدمه في أي مكوّن يعرض نافذة عائمة: إمّا بقيمة منطقية (لمكوّن دائم التركيب يُظهر
// النافذة شرطياً بداخله)، أو بلا وسيط (لمكوّن يُركَّب فقط طالما النافذة مفتوحة).
export function useBodyScrollLock(isLocked = true) {
  useEffect(() => {
    if (!isLocked) return
    lockCount += 1
    document.body.style.overflow = 'hidden'
    return () => {
      lockCount = Math.max(0, lockCount - 1)
      if (lockCount === 0) document.body.style.overflow = ''
    }
  }, [isLocked])
}

export default useBodyScrollLock
