# قياس أداء Public Menu من الهاتف — دليل التشغيل

أداة القياس: `public/perf-lab.html` → تُنشر على `https://simsimmenu.com/perf-lab.html`

## لماذا يجب أن تكون على نفس الدومين

المتصفح يمنع أي صفحة من قراءة أداء صفحة على أصل (origin) مختلف. الأداة تفتح المنيو داخل `iframe`، ولأنها على `simsimmenu.com` نفسه فالإطار **same-origin** ويمكنها قراءة `performance` الخاص بالمنيو. لو رُفعت على أي دومين آخر لن تقرأ شيئاً.

لهذا لا تعمل الأداة من ملف محلي أو من preview deployment ضد منيو الإنتاج.

## ما تم التحقق منه فعلياً

شُغّلت الأداة في Chromium حقيقي ضد صفحة اختبار محلية same-origin، وتأكد عملها:

| القياس | النتيجة |
|---|---|
| LCP داخل iframe | ✅ يعمل (`largest-contentful-paint` تُصدر داخل الإطار) |
| FCP / CLS / Long Tasks | ✅ تعمل عبر `PerformanceObserver` مع `buffered:true` |
| First Category / First Product / First Product Image | ✅ 350ms / 950ms / 1350ms مقابل حقن مُتعمَّد عند 300/900/1150 |
| Image Requests / Bytes | ✅ 6 طلبات، 2220 بايت |
| Prefetch URL Match | ✅ **كلا الفرعين**: `PREFETCH_URL_MISMATCH` عند اختلاف الروابط، و`MATCH` عند تطابقها |
| Scroll phases | ✅ |

## خطوات التشغيل على Android

### تجهيز مرة واحدة — للحصول على Cold Load حقيقي

1. افتح **Chrome**.
2. اضغط زر القائمة (⋮) ← **New Incognito tab** (علامة تبويب متخفية).
   هذا يضمن كاش فارغ. البديل: Settings ← Privacy and security ← Clear browsing data ← Cached images and files.

### الاختبار

1. في التبويب المتخفي، افتح: **`https://simsimmenu.com/perf-lab.html`**
2. اترك حقل الرابط كما هو (`/menu/simsim`).
3. في قائمة «حالة الكاش» اختر **Cold**.
4. اضغط **TEST 1 — Cold Load**. سيفتح المنيو داخل إطار ويقيس ~20 ثانية. **لا تلمس الشاشة ولا تبدّل التطبيق أثناء القياس** (تصغير Chrome يوقف المؤقتات ويفسد الأرقام).
5. بعد ظهور «تم»، اضغط **TEST 2 — Normal Scroll** وانتظر (~30 ثانية، الأداة تمرّر بنفسها).
6. اضغط **TEST 3 — Fast Scroll** وانتظر.
7. اضغط **TEST 4 — Reverse Scroll** وانتظر.
8. غيّر «حالة الكاش» إلى **Warm**، ثم اضغط **TEST 5 — Warm Cache**.
9. اضغط **نسخ JSON**. إن فشل النسخ التلقائي سيظهر النص بالأسفل — اضغط مطوّلاً وانسخه.
10. الصق الناتج في محادثة Claude كما هو، بلا تعديل.

الأداة تحفظ النتائج تلقائياً، فلو أُغلق التبويب بين اختبار وآخر لن تضيع.

## ما لا يستطيع المتصفح قياسه — ولن تختلقه الأداة

هذه تظهر في التقرير حرفياً كـ`NOT AVAILABLE` مع سبب كل واحدة:

| البند | لماذا | كيف تحصل عليه |
|---|---|---|
| **Slow 4G throttling** | لا تملك أي صفحة ويب صلاحية تقييد الشبكة | **PageSpeed Insights** (خيار Mobile يطبّق Slow 4G + CPU throttling)، أو **Chrome DevTools** عبر USB: `chrome://inspect` من حاسوب ← Network ← Slow 4G |
| **Cache Disabled** | لا يمكن تعطيل HTTP cache من JS | وضع التصفح المتخفي أو مسح بيانات الموقع (الخطوة 1) |
| **DPR = 3** | لا يمكن فرض DPR؛ التقرير يسجّل DPR الحقيقي للجهاز | DevTools Device Mode من حاسوب |
| **TBT الحقيقي** | يحتاج TTI الذي لا تكشفه المتصفحات | الأداة تسجّل `tbtApproxMs` = مجموع تجاوز Long Tasks فوق 50ms، **وهو تقريب معلن لا TBT** |
| **Image Bytes على الإنتاج** | صور Supabase من أصل آخر؛ بلا ترويسة `Timing-Allow-Origin` يعود `transferSize` صفراً | DevTools ← Network ← عمود Size |

> نتيجة مهمة: **أرقام هذه الأداة ليست بديلاً عن Slow 4G.** هي قياس على شبكة الجهاز الفعلية، والتقرير يعلن ذلك في `verdict.networkConditions`. لمقارنة مقابل أهداف FCP≤1.8s / LCP≤2.5s بشروطها الأصلية، شغّل **PageSpeed Insights** على نفس الرابط وأرسل النتيجة معها.

## شكل المخرجات

```json
{
  "schema": "simsim-perf-lab/2",
  "url": "...", "timestamp": "...",
  "env": { "devicePixelRatio": 3, "effectiveType": "4g", "cpuCores": 8, "networkThrottled": false },
  "coldLoad": {}, "warmLoad": {},
  "scrollNormal": {}, "scrollFast": {}, "scrollReverse": {},
  "images": {}, "prefetch": {}, "verdict": {},
  "notAvailable": {}
}
```

كل اختبار يحتوي: `fcpMs`, `lcpMs`, `lcpElement`, `cls`, `tbtApproxMs`, `firstCategoryMs`, `firstProductMs`, `firstProductImageMs`, `imageRequests`, `imageBytes`, `duplicateImageRequests`, `prefetchRequests`, `prefetchUrlMatch`, `categoriesReady[]`, `scrollLog[]`.

**الحقل الأهم:** `prefetchUrlMatch` — يجب أن يكون `MATCH` بعد إصلاح PR-03. لو عاد `PREFETCH_URL_MISMATCH` فالإصلاح لم يصل للإنتاج بعد؛ ولو عاد `NO_PREFETCH_FIRED` فالتسخين لم ينطلق أصلاً.

## بعد الإرسال

الصق الـJSON في المحادثة. الشكل ثابت ومعرّف بـ`schema`، لذا يمكن تحليله آلياً ومقارنته بالأهداف وإصدار الحكم النهائي على PR-03 بأرقام حقيقية بدل `NOT AVAILABLE`.
