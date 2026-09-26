# طبقة Observability

> **الحالة:** مُفعَّل — المزوّد الفعلي: **LogRocket** (`providers/LogRocketErrorReporter.js`).

## المسؤولية (واحدة)
تجريد **التسجيل (Logging)** و**الإبلاغ عن الأخطاء (Error Reporting)** خلف واجهة واحدة
تستهلكها كل الطبقات — دون أن تعرف أيّ مزوّد فعلي.

## المحتوى
- `contracts.js` — `LogLevel` · واجهتا `Logger` و`ErrorReporter` (المصدر الموحّد).
- `NullLogger` / `NullErrorReporter` — المُنفِّذ الافتراضي (لا-أثر).
- `ContextLogger` — مُسجِّل مُثرى بسياق ثابت (Decorator عام).
- `observability` — الوصول الموحّد `{ logger, errorReporter, configure() }`.
- `providers/LogRocketErrorReporter.js` — المُنفِّذ الفعلي الحالي (LogRocket).
- `privacy/networkPolicy.js` — سياسة خصوصية LogRocket بمبدأ Default-Deny: الشبكة مُغلقة افتراضياً (`mode='off'`، `allow=[]`)، وحتى المسموح metadata فقط (بلا body/headers/query)؛ مع `urlSanitizer` وتنظيف نصوص الأخطاء. المصدر الوحيد لخيارات `LogRocket.init` (تحرسه اختبارات `tests/guards`). يشمل قرارات DOM: `inputSanitizer` + `textSanitizer` (مُنطقي عام؛ لا selector مدعوم) + إخفاء `href`/`action` بنيوياً + تعطيل عنوان الصفحة.
- `privacy/exceptionBoundary.js` — حدّ الاستثناءات: الالتقاط التلقائي الخام في LogRocket مُعطَّل (`shouldDetectExceptions=false`)، وهذا الحدّ يلتقط `error`/`unhandledrejection` بمستمعين سلبيين ويمرّر **نسخة منظَّفة مبنيّة من الصفر** فقط (`toSafeError` فوق `scrubErrorText`)، فتبقى المراقبة دون تسريب أسرار.
- `privacy/exceptionMessagePolicy.js` — سياسة رسائل الاستثناءات (**Default-Deny**): رسالة أي استثناء لا تُرسَل إلى LogRocket أبداً. الاستثناء الوحيد: خطأ first-party برمز (`code`) في قائمة السماح `SAFE_ERROR_CODES` (رموز `IntegrationErrorCode` و`SIMSIM_ASYNC_TIMEOUT` فقط) فتُرسَل **رسالة ثابتة** يملكها الملف لا الأصلية؛ وغير ذلك `[REDACTED_EXCEPTION_MESSAGE]`. الاسم من قائمة سماح، والـstack يُعاد بناؤه بنيوياً (دالة/موقع بلا query/hash/سطر/عمود)، والـfingerprint هاش 16 بت لنص مُطبَّع. لا تضف رمزاً للقائمة إلا إن كان ثابتاً بلا بيانات (اختبار يفرض تزامنها مع الرموز المعرَّفة في التطبيق).

## ما يُمنع وضعه هنا
ربط مزوّد فعلي (LogRocket/Datadog/…) مباشرةً في هذه الطبقة · منطق أعمال · UI · أسرار · بيانات شخصية (PII).

## قواعد الاستهلاك
- كل الطبقات تستهلكها عبر `observability.logger` / `observability.errorReporter` **فقط**.
- لا تعتمد Observability على أي طبقة أخرى (لتفادي الدوران) — بل الطبقات تعتمد عليها.
- `integration/logs` يعيد التصدير من هنا (مصدر واحد، بلا تكرار).

## كيف تُغيّر المزوّد لاحقاً
1. أنشئ مُنفِّذاً يحقّق `Logger` و/أو `ErrorReporter` (مثل `LogRocketErrorReporter`).
2. عند الإقلاع: `observability.configure({ errorReporter: new LogRocketErrorReporter() })`.
3. لا حاجة لتعديل أي متصل — الواجهة ثابتة (Open/Closed). المفاتيح السرّية من بيئة الخادم فقط.
