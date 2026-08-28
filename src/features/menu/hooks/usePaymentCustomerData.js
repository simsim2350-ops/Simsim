import { useEffect, useState } from 'react'
import { readPaymentCustomerData } from './paymentCustomerDataHelpers'

// TASK-PAY-3.6D.5-A.1 — قراءة فقط لسجلّ بيانات تنفيذ الطلب المحفوظ مسبقاً (المواصفة المعتمدة:
// TASK_3_6D_5_A_CUSTOMER_DATA_PERSISTENCE_SPEC.md). بنفس فلسفة useResumedPaymentIdempotencyKey
// (3.6D.4) حرفياً — لا تكتب أبداً، لا تُنشئ سجلّاً جديداً بأي حال؛ readPaymentCustomerData نفسها
// (وليست هذه الـHook) هي من تُنظِّف سجلّاً تالفاً/منتهياً إن وُجد، وهذا تنظيف لا توليد بيانات جديدة.
export function usePaymentCustomerData(paymentIdempotencyKey) {
  const [record, setRecord] = useState(null)

  useEffect(() => {
    setRecord(readPaymentCustomerData(paymentIdempotencyKey))
  }, [paymentIdempotencyKey])

  return record
}
