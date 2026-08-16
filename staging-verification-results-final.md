# تقرير Production Hardening النهائي — SimSim Menu

**بيئة التحقق:** Supabase `simsim-menu-staging`، project ref `rgqsetckcigkgsyobyjg`.

**نطاق التنفيذ:** تم العمل على فرع `fix/menu-production-hardening` وPR #239 فقط. لم تُطبّق أي Migration أو بيانات اختبار على Production، ولم يتم تعديل `main`. تم إيقاف مشروع Staging بعد الاختبارات لتقليل التكلفة؛ الحذف النهائي ما زال يحتاج دخولًا إلى لوحة Supabase.

## 1. الإصلاحات المنفذة

| المشكلة | الإصلاح | الحالة |
|---|---|---|
| `v_coupon.id` عند عدم وجود coupon | إضافة `v_coupon_found` ومنع قراءة record غير مهيأ | تم إصلاحها واختبارها على Staging |
| استهلاك coupon عند price mismatch | إبقاء `FOR UPDATE` وحساب الخصم والسعر ثم مقارنة `client_total`، وتأجيل increment إلى ما بعد guard وقبل insert | تم التحقق على Staging |
| Duplicate order submission | إضافة `orders.idempotency_key`، وunique partial index على `(restaurant_id, idempotency_key)`، وفحص سابق داخل RPC، وإرسال key من checkout | تم التحقق على Staging |
| signature القديمة غير المحمية | إسقاط signature القديمة ذات 11 وسيطًا، والإبقاء على signature الجديدة التي تتطلب idempotency key | تم التحقق من `pg_proc` على Staging |
| `set_updated_at` mutable search_path | إضافة `ALTER FUNCTION public.set_updated_at() SET search_path = public` مع إبقاء trigger behavior كما هو | اختفى تحذير mutable search_path من Advisor |
| صلاحيات PUBLIC الزائدة | `REVOKE ALL FROM PUBLIC` للدوال العامة، ثم grants صريحة للـ`anon` و`authenticated` حسب الحاجة | تم تطبيقها على Staging |

## 2. تصميم idempotency

يستخدم العميل مفتاحًا عشوائيًا جديدًا لكل بصمة طلب، وتعيد المحاولات المتكررة للبصمة نفسها المفتاح نفسه. المفتاح ليس order UUID، ويُخزّن في `orders.idempotency_key` ويُقيّد داخل نطاق المطعم عبر unique index. أما الطلبات الصحيحة المختلفة فتستخدم مفاتيح مختلفة ولا تتصادم.

إذا وصل الطلب نفسه مرتين بالمفتاح نفسه، يعيد `create_order` نفس order بدل إنشاء صف جديد. وإذا وصل طلبان مختلفان بمفتاحين مختلفين، يمكن إنشاء طلبين مستقلين. حماية الواجهة ليست المصدر الوحيد للحماية؛ القيد الفريد والمنطق الذري موجودان في قاعدة البيانات.

## 3. نتائج الاختبارات الفعلية على Staging

| الاختبار | النتيجة | مستوى التحقق | الدليل |
|---|---:|---|---|
| No-coupon order | ناجح | Verified in Staging Database | order أُنشئ طبيعيًا، `price_changed = false`، و`usage_count` بقي دون تغيير. |
| Coupon price mismatch | ناجح | Verified in Staging Database | عاد `price_changed = true` و`id = null`، ولم يتغير `usage_count`. |
| Valid coupon | ناجح | Verified in Staging Database | order أُنشئ، والإجمالي الصحيح بعد الخصم تحقق، و`usage_count` زاد مرة واحدة. |
| Coupon usage limit | ناجح | Verified in Staging Database | الطلب اللاحق رُفض برسالة `coupon usage limit reached`. |
| Concurrent coupon race | ناجح | Verified End-to-End | طلبان متزامنان بمفتاحي idempotency مختلفين: واحد `200` والآخر `400 coupon usage limit reached`. |
| Same-key duplicate submission | ناجح | Verified End-to-End | الاستدعاءان أعادا نفس `order id` و`order_number`؛ لم يُنشأ order ثانٍ. |
| Different idempotency keys | ناجح | Verified End-to-End | مفتاحان مختلفان أنشآ orderين مختلفين كما هو متوقع. |
| Price tampering | ناجح | Verified in Staging Database | إجمالي عميل خاطئ أعاد `price_changed = true` ولم ينشئ order. |
| Branch isolation | ناجح | Verified in Staging Database | منتج تابع لفرع آخر رُفض. |
| Product isolation | ناجح | Verified in Staging Database | تحقق `restaurant_id` و`branch_id` داخل RPC. |
| Product option validation | ناجح | Verified in Staging Database | option غير موجود رُفض. |
| Token authorization | ناجح | Verified End-to-End | token صحيح أعاد الحالة؛ token خاطئ أعاد قائمة فارغة. |
| Secure status reconciliation | ناجح | Verified End-to-End | `get_orders_status_secure` أعاد الصف المطابق للـID والتوكن فقط. |
| Customer cancellation | ناجح | Verified End-to-End | التوكن الصحيح ألغى الطلب المعلق؛ المحاولة الثانية لم تُلغِ شيئًا. |
| Realtime authorization | غير متحقق | Not Verified | Staging لا يحتوي `realtime.messages` أو `realtime.broadcast`. لم يتم إنشاء workaround يدوي. |
| Realtime E2E | غير متحقق | Not Verified | لم يمكن تشغيل Broadcast فعليًا بسبب غياب Realtime runtime. |

## 4. Security Advisor

بعد migration ظهرت النتائج التالية:

| Advisor | الحالة | التفسير |
|---|---|---|
| Mutable search_path لـ`set_updated_at` | تم الحل | تم تثبيت `search_path = public` واختفى هذا التحذير. |
| `orders` RLS بلا policy | INFO متوقع | الوصول المباشر إلى orders غير مقصود؛ المسارات المسموحة هي RPCs المقيدة بالتوكن. |
| SECURITY DEFINER للدوال العامة | WARN مقصود ومخفف | `create_order` وstatus/cancel APIs تحتاج SECURITY DEFINER لأن الطلبات عامة ويجب ألا تمنح RLS وصولًا مباشرًا للجداول. تم سحب PUBLIC execute ومنح anon/authenticated صراحة فقط، مع `search_path = public` ومراجع مؤهلة. Advisor يواصل الإبلاغ لأنها callable للـanon/authenticated، وهذا متوقع للتدفق العام وليس grantًا عامًا مفتوحًا. |

هذه التحذيرات ليست متروكة بلا معالجة: تم تقليل الصلاحيات إلى الأدوار المطلوبة فقط، لكن لا يمكن إزالة تحذير Advisor بالكامل مع الإبقاء على public ordering وanonymous order tracking في نفس RPC design. يحتاج تحويلها إلى Edge Function أو طبقة خاصة منفصلة إذا كان المطلوب إخفاء كل SECURITY DEFINER من API schema، وهو تغيير معماري خارج نطاق هذه المهمة.

## 5. اختبارات جودة المشروع

| الأمر | النتيجة |
|---|---:|
| `npm test -- --run` | 10 Test Files passed، و234 Tests passed |
| `npm run build` | نجح build الإنتاج |
| `git diff --check` | نجح دون whitespace errors |

## 6. الملفات والتغييرات

تم تحديث `src/features/menu/hooks/useCheckout.js` لإرسال idempotency key دون تغيير واجهة المستخدم. أُضيفت `sql/menu_production_hardening_idempotency.sql` كـmigration جديدة، وأُحدّث `sql/menu_production_hardening_coupon_regression.sql`. كما أُضيفت سكربتات التحقق `scripts/staging_race_test.py` و`scripts/staging_secure_order_test.py`.

تم رفع التغييرات إلى PR #239 على الفرع `fix/menu-production-hardening`. آخر commits تشمل إصلاح no-coupon، حماية idempotency، وسحب EXECUTE من PUBLIC. لم يتم تطبيق migration الجديدة على Production.

## 7. Production read-only verification

تم تحديد Production كمشروع `simsim` ذي ref `gpwwnuuicywsvmmhxngs`، ثم فُحص سجل migrations وschema قراءةً فقط. سجل Production يحتوي migrations hardening سابقة بأسماء `menu_production_hardening`, `menu_production_hardening_fix_token`, `menu_production_hardening_revoke_trigger_execute`, `menu_production_hardening_revoke_public_execute`, `menu_production_hardening_coupon_order_fix`, و`menu_production_hardening_coupon_order_fix_alias`. لذلك لا يمكن القول إن Production خالٍ من كل hardening migrations السابقة.

في المقابل، لا يظهر `menu_production_hardening_idempotency` في سجل Production، كما أن `public.orders` في schema Production لا يحتوي `idempotency_key`. لم تُطبّق أي Migration أو تعديل خلال Final Gate Review. هذه النتيجة تمنع اعتبار Production جاهزًا للإطلاق النهائي لأن حالة Production الحالية لا تطابق migration الجديدة الموثقة في PR، ويجب إجراء reconciliation منفصل ومصرح به قبل أي deployment لاحق.

## 8. Production Gate

> **NO-GO حاليًا.**

السبب المتبقي الحاسم هو أن Realtime authorization وRealtime E2E لم يتم التحقق منهما فعليًا لأن Staging المستقل لا يحتوي Realtime runtime المطلوب. كذلك تبقى تحذيرات SECURITY DEFINER من Advisor بوصفها تحذيرات مقصودة لدوال public ordering/status مع grants صريحة وsearch_path ثابت؛ يجب اعتماد هذا التصميم أمنيًا أو نقل هذه الدوال إلى طبقة API خاصة قبل اعتماد GO نهائي.

في المقابل، تم حل no-coupon bug، وتمت حماية duplicate submission server-side/database-level، وأصبحت اختبارات coupon race وsame-key/different-key ناجحة على Staging.

## 9. حالة Staging

تم إيقاف المشروع بعد الاختبارات لتقليل التكلفة. لم يمكن تنفيذ الحذف النهائي آليًا عبر الاتصال الحالي، ولا توجد أي تغييرات على Production.
