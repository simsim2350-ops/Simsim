# PR-01 — Public Menu Regression Fix Report

**التاريخ:** 2026-08-19  
**النطاق:** إصلاح Regression P0 الذي كان يعرض Header لمطعم سمسم بينما يبقى جسم المنيو بلا أقسام أو أصناف.  
**المرجع:** PR-01 لتحسين أداء Public Menu، دون بدء PR-02 الخاص بتحسين الصور.

## Root Cause

أضاف PR-01 الغلاف المحلي التالي في `useMenuData` كي يجعل الطلبات الاختيارية غير حاجبة:

```js
const safeRequest = (request) => request.catch(...)
```

لكن قيمة `supabase.from(...).select(...).order(...)` هي `PostgrestFilterBuilder` **thenable** وليست كائن `Promise` كاملاً؛ فهي توفر `then()` ولا توفر `catch()`. لذلك كان استدعاء `request.catch(...)` يرمي استثناءً بصورة متزامنة فور تكوين أول طلب حرج للأقسام، قبل أن يبدأ أي طلب إلى `categories` أو `products`. ينتقل التنفيذ بعدها إلى `finally` فتغلق حالة `loading` وتبقى المصفوفتان فارغتين؛ لذلك ظهر Header فقط بلا محتوى.

## Evidence

| الدليل | النتيجة |
|---|---|
| إنتاج `https://simsimmenu.com/menu/simsim` قبل الإصلاح | ظهر Header وبيانات المطعم، بينما غاب جسم المنيو. |
| سجل موارد المتصفح | ظهر طلبا `restaurants` و`branches` فقط، ولم يظهر أي طلب لـ`categories` أو `products`. |
| حالة React | المطعم والفرع وقائمة من فرعين موجودة، و`loading=false`، لكن `categories=[]` و`products=[]`. |
| بيانات Supabase | الفرع الرئيسي نشط وحالته `ready`، وفيه 9 أقسام مرئية و48 صنفًا متاحًا. |
| عقد PostgREST | `PostgrestFilterBuilder` يوفر `then=true` و`catch=false` و`finally=false`. |
| المقارنة مع PR-01 | إدخال `safeRequest(...).catch` في `src/features/menu/hooks/useMenuData.js` هو التغيير المسبب للـRegression. |

> الحالة المثبتة ليست طلبات فاشلة أو معلقة أو ملغاة؛ بل إن الطلبات الحرجة لم تكن تبدأ من المتصفح أصلًا.

## Fix

تم استبدال الغلاف بـ`Promise.resolve(request).catch(...)`. يقوم `Promise.resolve` بامتصاص thenable وتشغيل الطلب عبر `then()`، ثم يوفر Promise حقيقيًا لمعالجة الأخطاء. تبقى طلبات `categories` و`products` متوازية ولا تنتظر التحليلات أو التوصيات أو الولاء أو العروض.

أضيفت أيضًا حالة خطأ ظاهرة داخل جسم المنيو مع زر **إعادة المحاولة**. إذا فشل طلب محتوى حرج مستقبلًا فلن يتحول إلى منيو فارغ صامت، ولن تستخدم الواجهة إعادة تحميل قسرية أو بيانات ثابتة.

## Files Changed

| الملف | التغيير |
|---|---|
| `src/lib/safeSupabaseRequest.js` | تغليف thenable في Promise حقيقي قابل للاختبار بلا تهيئة Realtime. |
| `src/features/menu/hooks/useMenuData.js` | استخدام الغلاف المصحح، كشف فشل المحتوى الحرج، وإتاحة `reloadMenu`. |
| `src/pages/PublicMenu.jsx` | عرض حالة خطأ للمحتوى الحرج مع إعادة محاولة آمنة. |
| `src/features/menu/hooks/useMenuData.test.js` | اختبار تنفيذي لـthenable بلا `catch` واختبار تمرير الخطأ الحقيقي. |
| `qa/pr-01/PR-01-public-menu-regression-fix-report.md` | هذا التقرير. |

## Final Loading Architecture

| المرحلة | المحتوى | السلوك |
|---|---|---|
| Critical wave 1 | المطعم ثم الفرع | الفرع يعتمد على `restaurant_id`، لذلك يأتي بعده فقط. |
| Critical wave 2 | الأقسام والأصناف | يبدآن تلقائيًا وبالتوازي فور معرفة الفرع؛ لا توجد علاقة بـscroll أو `IntersectionObserver` أو تفاعل المستخدم. |
| Secondary | التقييم، عدد الطلبات، capabilities، branding، الولاء، البنرات، الكوبونات، التوصيات | تبدأ كطلبات مستقلة غير حاجبة ولا تمنع عرض الأقسام أو الأصناف. |
| Deferred UI data | الطاولات وتوصيات السلة | تبقى مشروطة بفتح السلة أو تفاصيل الصنف كما في PR-01. |

## Validation

| الفحص | النتيجة |
|---|---|
| Vitest | **294/294 PASS** عبر 22 ملف اختبار. |
| Production build | **PASS**. |
| `git diff --check` | **PASS**. |
| `npm run lint` | لا يوجد script باسم `lint` في المشروع؛ لم يُعامل ذلك كفشل في الكود. |
| Public Menu Preview | **PASS** — ظهر Header ثم 9 أقسام و48 صنفًا فعليًا من Supabase تلقائيًا. |
| قياس Preview المحلي | FCP = 132ms؛ بدأ طلبا `categories` و`products` معًا عند 960ms، وانتهيا عند 1113ms و1097ms على التوالي. |

لا يوجد baseline Lighthouse موثق قبل PR-01 في هذه الجلسة، لذلك لا يدّعي التقرير تحسنًا أو تراجعًا رقميًا في LCP أو TBT أو CLS. القياس المعروض يثبت فقط أن مسار المحتوى الحرج عاد للعمل بالتوازي في النسخة المبنية.

## Remaining Issues

الإنتاج ما زال يعرض الـRegression إلى أن يُدمج الإصلاح ويُنشَر. لا توجد تغييرات في Supabase schema أو RLS أو بيانات المطعم أو `products.price` أو أي منطق طلبات/عربة.
