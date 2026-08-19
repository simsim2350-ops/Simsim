# SIMSIM — تطوير خطوة «عرّف بمطعمك» في Onboarding

## النطاق

طُوِّرت خطوة معلومات المطعم في `src/pages/Onboarding.jsx` من دون تغيير قاعدة البيانات، أو أسماء الأعمدة، أو مسارات التطبيق، أو منطق استخدام البيانات لاحقًا. بقي مصدر الحقيقة هو جدول `public.restaurants` وأعمدته القائمة: `description` و`phone` و`address`.

> لا تنتقل الخطوة الآن إلى «نوع النشاط» إلا بعد نجاح تحديث Supabase **ثم** نجاح إعادة تحميل سياق المطعم عبر `fetchRestaurant(user.id)`.

## 1. تطوير الواجهة وتجربة الاستخدام

حافظت التغييرات على هوية SimSim الحالية: الخلفية الداكنة، البرتقالي الأساسي، RTL، الشعار، وهيكل Onboarding. تحسنت خطوة المعلومات لتعرض عنوانًا أوضح ووصفًا مختصرًا يشرح القيمة للمستخدم، مع بطاقة حقول موحدة، وتسميات مرتبطة فعليًا بعناصر الإدخال، ونصوص placeholder ملائمة للسياق.

| العنصر | التطوير المنفذ |
|---|---|
| العنوان والوصف | عنوان `عرّف بمطعمك ✨` ووصف موجز يوضح أن البيانات تظهر للعملاء في المنيو. |
| التقدم | يعرض الآن رقم الخطوة الحقيقي من إجمالي خطوات الرحلة والعنوان الحالي وشريط تقدم محدثًا وفق المرحلة. عدد الخطوات معروض من مصفوفة الخطوات القائمة (`STEPS.length`) حتى لا يكون عنصرًا شكليًا. |
| نبذة قصيرة | `textarea` أكبر، label حقيقي، شارة «اختياري»، وplaceholder موضح. لا يوجد حد أحرف مخترع. |
| رقم التواصل | `type="tel"` و`inputMode="tel"` و`autocomplete="tel"` من دون تحويل قيمة المستخدم. |
| العنوان | سُمّي `عنوان المطعم` مع placeholder أوضح و`autocomplete="street-address"`. |
| الإتاحة | روابط `htmlFor`/`id`، حالة `aria-busy`، رسالة خطأ بـ`role="alert"`، وربط الحقول بالخطأ عبر `aria-describedby`. |
| لوحة المفاتيح والتركيز | تحولت الخطوة إلى `form` يدعم إرسال النموذج عبر لوحة المفاتيح، مع focus ring برتقالي واضح للحقول والأزرار. |
| الاستجابة | بطاقة Onboarding توسعت إلى حد أقصى `640px` مع padding متدرج، بينما تبقى الحقول بعرض كامل داخل هوامش آمنة للشاشات الضيقة. |

## 2. إصلاح `saveInfo`

كان `saveInfo(false)` ينفذ `UPDATE` من دون فحص `error` الراجع من Supabase، ثم يواصل الانتقال في كل الحالات. أصبح المسار الآن كما يلي:

```text
Validate context
  → منع التكرار
  → UPDATE public.restaurants
  → التحقق من error
  → fetchRestaurant(user.id)
  → التحقق من وجود restaurant محدث
  → trackOwnerEvent
  → الانتقال إلى type
```

| الحالة | السلوك الحالي |
|---|---|
| خطأ `UPDATE` من Supabase | يرمي الخطأ، يبقى في الخطوة الحالية، تبقى القيم المكتوبة في state، وتظهر رسالة عربية آمنة قابلة لإعادة المحاولة. |
| فشل `fetchRestaurant` أو إرجاعه مطعمًا فارغًا | لا يعتبر الحفظ مكتملًا ولا ينتقل؛ تظهر الرسالة ذاتها. |
| نقرتان سريعتان على الحفظ | الحارس `infoSaveInFlight` مع `saving` والزر المعطل يمنعان إنشاء طلب حفظ موازٍ. |
| نجاح التحديث والمزامنة | يحدث `setRest(refreshedRestaurant)` ثم الانتقال إلى مرحلة النوع. |
| `تخطّى الآن` | يبقى مسارًا ثانويًا ولا ينفذ أي `UPDATE` للحقول الاختيارية. |

رسالة الخطأ الظاهرة للمستخدم هي:

> «تعذر حفظ معلومات المطعم. حاول مرة أخرى.»

لا تعرض الواجهة رسالة Supabase الخام أو stack trace. يبقى `console.error` محصورًا في سجل التطوير لأغراض التشخيص.

## 3. سلامة التكامل القائم

لم تتغير أي من قواعد الاستهلاك اللاحق للبيانات:

| البيانات | مصدر الحفظ | الاستخدام المحافظ عليه |
|---|---|---|
| `description` | `public.restaurants.description` | `MenuHeader` عند السماح بـ`show_description`، وSettings. |
| `phone` | `public.restaurants.phone` | رابط `tel:` وWhatsApp من المنيو وSettings. |
| `address` | `public.restaurants.address` | `MenuHeader` وSettings. تحافظ الواجهة على أولوية `branch?.address || restaurant.address`. |

## 4. الملفات المعدلة

| الملف | التغيير |
|---|---|
| `src/pages/Onboarding.jsx` | معالجة خطأ `UPDATE`، تحقق نجاح refresh، حارس منع التكرار، loading/error states، وتحسين واجهة وإتاحة خطوة المعلومات. |
| `src/lib/authOnboardingJourney.test.js` | اختبارات عقد لمسار الحفظ، فشل التحديث، منع التكرار، التخطي، والحالات الإتاحية الأساسية. |

لم يتغير أي schema أو migration أو API contract أو route، ولم تُضف بيانات mock أو تخزين بديل.

## 5. نتائج الاختبارات

| الاختبار المطلوب | النتيجة | دليل التحقق |
|---|---|---|
| TEST 1: حفظ القيم والتحقق منها في Supabase | **NOT VERIFIED — REAL OWNER SESSION REQUIRED** | لا توجد جلسة مالك مصرح بها للمعاينة؛ الكود والـschema يثبتان مسار الحفظ فقط. |
| TEST 2: فشل `UPDATE` لا ينقل المستخدم | **PASS — Contract** | `const { error }` ثم `if (error) throw error`؛ `goStage('type')` يقع بعد نجاح refresh فقط. |
| TEST 3: نقرتان سريعًا | **PASS — Contract** | `saving || infoSaveInFlight.current` مع تعطيل زر الإرسال. |
| TEST 4: التخطي بلا UPDATE | **PASS — Contract** | فرع `skip` يخرج إلى `goStage('type')` قبل أي استدعاء Supabase. |
| TEST 5: ظهور البيانات في Settings بعد الحفظ | **PASS — Integration contract** | Settings تقرأ وتحفظ الأعمدة الثلاثة نفسها من `restaurant`. |
| TEST 6: ظهور البيانات في المنيو العام | **PASS — Integration contract** | `useMenuData` يجلب سجل المطعم، و`MenuHeader` يقرأ الحقول نفسها؛ أولوية عنوان الفرع محفوظة. |
| TEST 7: Visual QA عند 320px و390px | **NOT VERIFIED — REAL OWNER SESSION REQUIRED** | المسار المعاين حمى Onboarding وأعاد إلى Login لغياب جلسة المالك؛ لم يُستخدم تجاوز للمصادقة. |
| TEST 8: Visual QA عند 1024px و1440px | **NOT VERIFIED — REAL OWNER SESSION REQUIRED** | السبب نفسه. |
| اختبارات المشروع | **PASS** | Vitest: `19` ملفًا و`277` اختبارًا ناجحًا. |
| Production build | **PASS** | `npm run build` نجح. |
| سلامة diff | **PASS** | `git diff --check` نجح. |

## 6. المشاكل المتبقية

لا توجد مشكلة برمجية معروفة في نطاق التعديل. يبقى فقط إجراء فحص E2E بصري وحقيقي بجلسة Owner/Test Account مصرح بها للتحقق من الحفظ الفعلي في Supabase ومقاسات العرض المطلوبة. لم يُعلن هذا التحقق كنجاح ولم يُستخدم حساب أو مسار يتجاوز Authentication.

## References

[1]: ../src/pages/Onboarding.jsx "حفظ وتحسين خطوة معلومات المطعم"
[2]: ../src/lib/authOnboardingJourney.test.js "اختبارات عقد Onboarding"
[3]: ../src/store/authStore.js "دالة fetchRestaurant وسياق المطعم"
[4]: ../src/pages/Settings.jsx "قراءة وحفظ بيانات المطعم في الحساب"
[5]: ../src/features/menu/hooks/useMenuData.js "جلب بيانات المطعم للمنيو"
[6]: ../src/features/menu/MenuHeader.jsx "عرض الوصف والهاتف والعنوان"
