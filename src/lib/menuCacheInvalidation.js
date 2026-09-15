import { appConfig } from '../config'

// إبطال كاش المنيو في menu-next (Performance Optimization Phase 2 —
// SIMSIM_MENU_PERFORMANCE_AUDIT_REPORT.md §10/§14، وتقرير التنفيذ المرافق).
//
// menu-next الآن يخزّن بيانات المطعم/الفروع/الأقسام/الأصناف/العلامة
// التجارية/البانرات/الكوبونات مؤقتاً (unstable_cache، TTL احتياطي 5 دقائق) —
// أي حفظ من Dashboard يجب أن يستدعي هذه الدالة بعده مباشرة كي يرى الزبون
// التعديل فوراً بدل انتظار الـTTL.
//
// Fire-and-forget بالكامل: لا await في نقاط الاستدعاء، ولا throw هنا مطلقاً.
// فشل هذا الاستدعاء (شبكة، REVALIDATE_SECRET غير مضبوط بعد) لا يجوز أن يوقف
// أو يُفسد حفظ Dashboard أبداً — أسوأ نتيجة لفشله هي أن التعديل يظهر خلال 5
// دقائق بدل أن يظهر فوراً، لا أكثر.
export function invalidateMenuCache({ restaurantId, slug, branchId } = {}) {
  if (!restaurantId) return
  if (!appConfig.revalidateSecret) return // غير مُهيّأ في هذه البيئة — الاعتماد على TTL الاحتياطي فقط
  fetch(`${appConfig.menuNextDirectBaseUrl}/api/revalidate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-revalidate-secret': appConfig.revalidateSecret },
    body: JSON.stringify({ restaurantId, slug, branchId }),
  }).catch((err) => {
    console.error('[menuCacheInvalidation] فشل استدعاء إبطال الكاش (سيتحدث تلقائياً خلال 5 دقائق):', err)
  })
}
