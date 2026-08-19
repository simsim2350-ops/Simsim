# SIMSIM — تتبع حقول معلومات المطعم في Onboarding

**النطاق:** الحقول الثلاثة في خطوة «عرّف بمطعمك»: **نبذة قصيرة** و**رقم التواصل** و**العنوان**.  
**المنهج:** مراجعة كود الواجهة ومخطط قاعدة Supabase فقط. لم يُجرَ أي تعديل كود أو بيانات أو إعدادات.

> **الخلاصة:** الحقول الثلاثة ليست واجهة شكلية. عند الضغط على «التالي»، يحاول `saveInfo(false)` تحديث سجل المطعم في جدول `public.restaurants` مباشرة. الأعمدة الثلاثة موجودة فعليًا في المخطط وقابلة للتحديث. تُقرأ القيم لاحقًا في المنيو العام وفي صفحة إعدادات المطعم.

## ملخص النتيجة

| الحقل في Onboarding | هل توجد عملية حفظ؟ | الجدول | العمود | دالة الحفظ | الاستخدام اللاحق |
|---|---|---|---|---|---|
| نبذة قصيرة | **نعم، عند «التالي»** | `public.restaurants` | `description` | `Onboarding.jsx → saveInfo(false)` | تظهر في رأس المنيو عند تفعيل `show_description`، وتظهر في إعدادات المطعم للتحرير. |
| رقم التواصل | **نعم، عند «التالي»** | `public.restaurants` | `phone` | `Onboarding.jsx → saveInfo(false)` | يظهر زر اتصال في رأس المنيو، ويُستخدم لفتح WhatsApp بشأن طلب، ويظهر في إعدادات المطعم للتحرير. |
| العنوان | **نعم، عند «التالي»** | `public.restaurants` | `address` | `Onboarding.jsx → saveInfo(false)` | يظهر في رأس المنيو، إلا إذا توفر عنوان للفرع؛ فعنوان الفرع له أولوية. ويظهر في إعدادات المطعم للتحرير. |

## 1. مسار الإدخال في Onboarding

في `src/pages/Onboarding.jsx` تُنشأ حالة واحدة للحقول الثلاثة:

```js
const [info, setInfo] = useState({ description:'', phone:'', address:'' })
```

ترتبط الحقول بالحالة مباشرة. حقل **نبذة قصيرة** يكتب إلى `info.description`، وحقل **رقم التواصل** إلى `info.phone`، وحقل **العنوان** إلى `info.address`. زر «التالي» يستدعي `saveInfo(false)`، وليس مجرد انتقال بين مراحل الواجهة. [1]

| الحقل | عنصر الإدخال | setter | الدليل |
|---|---|---|---|
| نبذة قصيرة | `textarea` | `setInfo(f => ({ ...f, description: e.target.value }))` | `Onboarding.jsx`، السطران 551–552. [1] |
| رقم التواصل | `input type="tel"` | `setInfo(f => ({ ...f, phone: e.target.value }))` | `Onboarding.jsx`، السطران 555–556. [1] |
| العنوان | `input` | `setInfo(f => ({ ...f, address: e.target.value }))` | `Onboarding.jsx`، السطران 559–560. [1] |

## 2. مسار الحفظ إلى Supabase

عند النقر على «التالي»، ينفذ `saveInfo(false)`. الدالة تستدعي عميل Supabase مباشرة وتنفذ `UPDATE` على جدول `restaurants` مقيدًا بـ `rest.id`:

```js
await supabase.from('restaurants').update({
  description: info.description.trim() || null,
  phone: info.phone.trim() || null,
  address: info.address.trim() || null,
}).eq('id', rest.id)
```

بعد طلب التحديث، تحدّث الصفحة الحالة المحلية ثم تستدعي `fetchRestaurant(user.id)` لإعادة تحميل سياق المطعم. بعد ذلك تنتقل إلى مرحلة النوع. إذن الحفظ المقصود يقع **قبل** الانتقال إلى المرحلة التالية. [1]

| الحقل | العملية الفعلية | ملاحظة سلوك القيمة الفارغة |
|---|---|---|
| نبذة قصيرة | `description: info.description.trim() \|\| null` | النص الفارغ يحفظ `null`، فيمسح قيمة سابقة بدل الاحتفاظ بها. |
| رقم التواصل | `phone: info.phone.trim() \|\| null` | النص الفارغ يحفظ `null`. |
| العنوان | `address: info.address.trim() \|\| null` | النص الفارغ يحفظ `null`. |

مخطط Supabase الفعلي يثبت أن `public.restaurants` يملك الأعمدة `description` و`phone` و`address`، وجميعها `text` و`nullable` و`updatable`. [2]

### قيد دقة مهم

الكود **يرسل** طلب `UPDATE` حقيقيًا؛ لذلك ليست الحقول شكلية. لكنه لا يفحص `error` الذي يعيده `supabase.from(...).update(...)` داخل `saveInfo`. أي أن فشلًا يعاد في كائن النتيجة، لا كرمي Promise، قد يجعل الواجهة تتابع رغم عدم إظهار رسالة فشل. هذا لا يلغي وجود الحفظ، لكنه يمنع الجزم من الكود وحده بأن كل طلب تحديث نجح في كل حالة تشغيلية. [1]

زر «تخطّي الآن» يستدعي `saveInfo(true)`؛ هذا المسار **لا ينفذ UPDATE** للحقول الثلاثة، بل يسجل حدثًا تحليليًا وينتقل إلى المرحلة التالية. [1]

## 3. الاستخدام في المنيو العام

المنيو العام يجلب سجل المطعم كاملاً من `public.restaurants` عبر `useMenuData(slug, branchId)` باستخدام:

```js
supabase.from('restaurants').select('*').eq('slug', slug).eq('is_active', true).single()
```

ثم يمرر كائن `restaurant` نفسه إلى `MenuHeader`. لا توجد نسخة ثابتة أو mock لهذه الحقول في هذا المسار. [3] [4]

| الحقل | الاستخدام في المنيو | القاعدة الفعلية |
|---|---|---|
| `description` | يُعرض في رأس المنيو تحت هوية المطعم. | يعرض فقط إذا كان `restaurant.show_description` ليس `false` وكانت القيمة غير فارغة. يدعم `description_en` للغة الإنجليزية عبر `tx(restaurant, 'description')`. [4] |
| `phone` | يظهر كرابط `tel:` في رأس المنيو. | يظهر زر الاتصال فقط عند وجود `restaurant.phone`. [4] |
| `phone` | يُستخدم للتواصل عبر WhatsApp بشأن طلب موجود. | `openWhatsAppAboutOrder` ينظف الرقم ويستدعي `https://wa.me/<phone>`. إن لم يوجد الرقم، يعرض خطأ تواصل. [5] |
| `address` | يظهر كعنصر موقع في رأس المنيو. | القيمة المعروضة هي `branch?.address || restaurant.address`؛ لذا عنوان الفرع، إن وُجد، يتقدم على عنوان المطعم العام. [4] |

## 4. الاستخدام في حساب المطعم

صفحة `src/pages/Settings.jsx` تقرأ القيم الثلاث من كائن `restaurant` إلى `restForm` عند تحميل الإعدادات. يستطيع المالك تعديلها من تبويب «المطعم»، ثم تحفظها الدالة `saveRestaurant()` إلى **نفس** جدول `public.restaurants` و**نفس** الأعمدة. [6]

| الحقل | القراءة في الإعدادات | الحفظ اللاحق |
|---|---|---|
| `description` | `restaurant.description || ''` | `description: restForm.description` |
| `phone` | `restaurant.phone || ''` | `phone: restForm.phone` |
| `address` | `restaurant.address || ''` | `address: restForm.address` |

## النتيجة النهائية

| السؤال | الإجابة المدعومة بالكود |
|---|---|
| هل الحقول مجرد واجهة؟ | **لا.** زر «التالي» ينفذ `UPDATE` حقيقيًا إلى Supabase. |
| أين تحفظ؟ | في سجل المطعم ضمن `public.restaurants`. |
| هل تظهر في المنيو؟ | **نعم.** الوصف والهاتف والعنوان تستخدم في `MenuHeader`، مع أولوية عنوان الفرع على عنوان المطعم. |
| هل تستخدم في حساب المطعم؟ | **نعم.** صفحة الإعدادات تقرأها وتسمح بتعديلها ثم تعيد حفظها في الأعمدة نفسها. |
| هل التخطي يحفظها؟ | **لا.** «تخطّي الآن» لا ينفذ طلب تحديث للحقول. |

## References

[1]: ../src/pages/Onboarding.jsx "حالة info، عناصر الإدخال، saveInfo، وزري التالي/التخطي"
[2]: ../../.mcp/tool-results/2026-08-19_17-02-16.479558100_supabase_list_tables_b9818058.json "Supabase schema: public.restaurants"
[3]: ../src/features/menu/hooks/useMenuData.js "جلب سجل المطعم من Supabase وتمريره للمنيو"
[4]: ../src/features/menu/MenuHeader.jsx "عرض الوصف والهاتف والعنوان في رأس المنيو"
[5]: ../src/features/menu/whatsapp.js "استخدام رقم المطعم في WhatsApp"
[6]: ../src/pages/Settings.jsx "قراءة وحفظ حقول معلومات المطعم في الإعدادات"
