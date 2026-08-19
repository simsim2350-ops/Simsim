# SIMSIM — تقرير إصلاح فجوات Phase 1

**النطاق المنفذ:** استكمال طبقة قياس رحلة مالك المطعم فقط. لم تُنفذ Phase 2، ولم يتغير UX أو المنيو العام أو الأسعار أو QR UI أو routing أو slug أو منطق `Menu Minimum Ready` أو Best Sellers.

## A. ما كان ناقصًا

بيّن تدقيق ما بعد التنفيذ أن فرع المراجعة لا يحتوي على تغييرات العميل الخاصة بـPhase 1، رغم وجود migration منفصلة. تم البحث في `main` والفروع البعيدة وسجل Git وstash والـdangling commits عن تنفيذ قابل للاستعادة؛ **لم يُعثر على commit منفصل صالح للاسترجاع**. لكن مساحة العمل النشطة كانت تحتوي تنفيذ العميل غير المدمج، فتمت مراجعته، واستكمال الاختبارات اللازمة، وتثبيت شرط «الأول» في طبقة قابلة للاختبار.

كانت الفجوات المطلوب سدّها هي تمرير `dedupe_key` و`branch_id` إلى RPC، ربط `registration_completed` بالمطعم الحقيقي، وتغطية نقاط القياس خارج Onboarding، مع إثبات ذلك بالاختبارات.

## B. ما تم إصلاحه

| المجال | الإصلاح المنفذ |
|---|---|
| Dedupe | أُضيف `trackOwnerMilestone` فوق `trackOwnerEvent` لتوليد مفتاح ثابت بالشكل `milestone:<event>:restaurant:<restaurant_id>`. لا تستخدم المفاتيح أي random IDs. |
| عقد RPC | يمرر `trackOwnerEvent` الآن: `p_event_type`, `p_restaurant_id`, `p_branch_id`, `p_session_id`, `p_props`, `p_dedupe_key`. |
| التسجيل | يطلق `Register.jsx` و`Login.jsx` حدث `registration_completed` بعد توفر `restaurant.id` فقط، في التسجيل الفوري أو مسار تأكيد البريد ثم الاستئناف. |
| إنشاء المحتوى | تسجل `Menu.jsx` أول قسم وأول صنف فقط، ثم تتحقق من الجاهزية بمصدر الحقيقة القائم `calculateMenuReadiness` دون تغييره. |
| الإتاحة | تسجل صفحة QR الحدث فقط بعد نجاح التنزيل/النسخ/المشاركة؛ وتسجل Dashboard وSettings والفروع نسخ الرابط بعد نجاح العملية. |
| Funnel | توفر migration دالة `admin_owner_activation_funnel` بكل أعمدة Phase 1 المطلوبة، وربط `registration_started` مع `registration_completed` عند تطابق `session_id`. |
| الأمن | تبقى دوال RPC `security definer`، وتتحقق من ملكية المطعم ومن ارتباط الفرع بالمطعم، وتبقى fail-open ولا تمرر بيانات شخصية في `props`. |

## C. الملفات التي تغيرت

| الملف | الدور |
|---|---|
| `src/lib/analytics.js` | تمرير branch وdedupe وإضافة `trackOwnerMilestone`. |
| `src/lib/ownerActivation.js` | تعريف Milestones والتفعيل وdedupe وشرط أول محتوى. |
| `src/lib/analytics.test.js` | اختبار عقد RPC ومفتاح dedupe وربط التسجيل بالمطعم. |
| `src/lib/ownerActivation.test.js` | اختبار التفعيل، ترتيب الإتاحة، مفاتيح dedupe، وشرط أول محتوى. |
| `src/lib/phase1OwnerActivationSql.test.js` | اختبار ثابت لملكية المطعم والفرع، dedupe، أمن Funnel، والأعمدة المطلوبة. |
| `src/pages/Register.jsx`, `src/pages/Login.jsx` | `registration_completed` و`restaurant_created` مع `restaurant_id`. |
| `src/pages/Onboarding.jsx` | milestones محمية بـdedupe لمسار الإعداد الحالي. |
| `src/pages/Menu.jsx` | أول قسم، أول صنف، و`menu_minimum_ready` من لوحة المنيو. |
| `src/pages/QRCode.jsx` | تنزيل QR/الكارت، نسخ الرابط، والمشاركة بعد النجاح. |
| `src/pages/Dashboard.jsx`, `src/pages/Settings.jsx`, `src/pages/Branches.jsx` | `menu_link_copied` عند النسخ الناجح. |
| `sql/phase1_owner_activation_measurement.sql` | توسعة RPCs ودالة Funnel الإدارية. |

## D. الأحداث التسعة ومكان إطلاقها

| الحدث | مكان الإطلاق الفعلي | قاعدة التكرار |
|---|---|---|
| `registration_started` | `Register.jsx` قبل `signUp` | مرة لكل session عبر key ثابت. |
| `registration_completed` | `Register.jsx` بعد الاستئناف الفوري، و`Login.jsx` بعد تأكيد البريد والاستئناف | مرة لكل مطعم. |
| `restaurant_created` | Register/Login، مع fallback في Onboarding | مرة لكل مطعم. |
| `category_created` | قوالب Onboarding أو أول قسم من `Menu.jsx` | مرة لكل مطعم. |
| `first_product_created` | قوالب Onboarding أو أول صنف من `Menu.jsx` | مرة لكل مطعم. |
| `menu_minimum_ready` | Onboarding أو `Menu.jsx` بعد حساب الجاهزية القائم | مرة لكل مطعم. |
| `menu_link_copied` | Onboarding، Dashboard، Settings، QRCode، Branches | مرة لكل مطعم. |
| `menu_shared` | Onboarding وQRCode بعد فتح مشاركة WhatsApp | مرة لكل مطعم. |
| `qr_downloaded` | Onboarding وQRCode بعد إنشاء ملف التنزيل بنجاح | مرة لكل مطعم. |

## E. كيف تم ضمان dedupe

كل milestone للمطعم يولد مفتاحًا مستقراً مبنيًا على اسم الحدث ومعرف المطعم، ولا يتبدل مع refresh أو retry أو navigation أو React re-render. يمر المفتاح إلى `track_owner_event`، الذي يمرره إلى `emit_event`. تستخدم طبقة التخزين القيد الفريد القائم على `analytics_events.dedupe_key` مع `on conflict do nothing`، ولذلك يكون الحارس النهائي في قاعدة البيانات لا في ذاكرة المتصفح فقط.

`registration_started` يملك مفتاحًا مستقرًا لكل `session_id`، لأن هذا الحدث يسبق وجود المطعم والمستخدم المؤكد.

## F. كيف تم ضمان registration → restaurant_id

تُخزن نية المطعم في metadata عند التسجيل، ثم يعيد `resume_pending_restaurant` المطعم بشكل idempotent بعد وجود الجلسة. لا يرسل العميل `registration_completed` حتى يحصل على `restaurant.id`: بعد `resumePendingRestaurant()` في `Register.jsx` أو بعد تسجيل الدخول وتأكّد الاستئناف في `Login.jsx`. لذلك تستطيع دالة Funnel الاحتفاظ بـ`registration_completed_at` وربط `registration_started_at` عندما تبقى `session_id` نفسها متاحة.

## G. نتائج الاختبارات

| الفحص | النتيجة |
|---|---|
| Vitest | **258 / 258 PASS** ضمن 14 ملفات اختبار. |
| Dedupe key ثابت | PASS — اختبار مفتاح ثابت للميلستونات. |
| التفعيل قبل/بعد الجاهزية | PASS — لا تفعيل قبل `menu_minimum_ready`، وتفعيل عند copy/share/QR اللاحق. |
| أول قسم/أول صنف | PASS — helper يثبت أن العدد صفر فقط هو شرط milestone الأول. |
| registration_completed مع restaurant_id | PASS — اختبار عقد RPC صريح. |
| Owner/branch validation | PASS — اختبار SQL ثابت لعقد migration. |
| أعمدة Funnel | PASS — اختبار وجود الأعمدة التسعة وربط session. |

## H. نتيجة build

نجح `npm run build` بالكامل بعد التغييرات. كما نجح `git diff --check` بلا أخطاء مسافات أو رقع غير سليمة.

## I. ما يزال NOT VERIFIED

لا توجد بيانات أحداث مالك حقيقية منشأة في هذه المهمة؛ لذلك لا يمكن إثبات end-to-end أن صفًا واحدًا فقط وصل إلى `analytics_events` من دون تشغيل رحلة مالك موثقة على النسخة المنشورة. كما لا توجد بعد أرقام Funnel أو Time-to-Value حقيقية، ولا يجب اختلاقها أو backfill لها.

يوصى بعد النشر بتنفيذ Smoke Test واحد: تسجيل مالك جديد → إنشاء قسم وصنف → تحقق الجاهزية → نسخ رابط أو تنزيل QR، ثم التأكد من صف واحد فقط لكل milestone ومن ظهور صف Funnel بالمطعم الجديد.

## J. هل أصبحت Phase 1 جاهزة للنشر؟

**نعم، جاهزة للنشر من منظور الكود والبناء والاختبارات.** التغييرات محصورة في Phase 1، وعقد RPC والمigration متوافقان مع المقصود، ولا توجد تغييرات واجهة أو منطق محظورة. يظل اعتماد قرارات المنتج على البيانات مشروطًا بإتمام Smoke Test بعد نشر الفرونت وجمع أحداث حقيقية، وليس شرطًا لتسليم الكود.
