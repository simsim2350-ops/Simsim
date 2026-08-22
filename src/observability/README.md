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
