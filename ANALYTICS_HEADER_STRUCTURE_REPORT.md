# SimSim Analytics — Header Structure QA

## النطاق

أعيد تنظيم Header صفحة Analytics فقط دون إضافة عناصر جديدة أو تغيير البيانات أو KPIs أو Charts أو API أو Database أو Business Logic أو وظائف الفلاتر.

## النتيجة

أصبح Header مكوّنًا من منطقتين مترابطتين بصريًا:

| المنطقة | الترتيب |
|---|---|
| Page Header | أيقونة Analytics بجانب «التحليلات»، ثم وصف الصفحة، وزر القائمة في منطقة ثانوية مستقلة على Mobile. |
| Analytics Toolbar | Scope في صف موحّد، ثم Time Range داخل Segmented Control واحد، ثم Actions في مجموعة مستقلة بنفس الارتفاع. |

تم توحيد المحاذاة باستخدام نفس الحاوية الداخلية، وتقليل المسافات بين Header وأول KPI، والحفاظ على Scroll أفقي داخل Segmented Control فقط عند الحاجة على الشاشات الضيقة. لم تتم إضافة Breadcrumbs أو Tabs أو Labels أو Cards أو Filters جديدة.

## الفحوصات

| الفحص | النتيجة |
|---|---|
| `npm run build` | ناجح |
| `npm test -- --run` | ناجح: 9 ملفات و231 اختبارًا |
| `npm run check:registry` | ناجح: 34 قدرة متطابقة |
| `git diff --check` | ناجح |

## الملفات المعدلة

تم تعديل `src/pages/Analytics.jsx` لربط الصفحة بوضع Header المكدس، و`src/components/AppShell.jsx` لإتاحة وضع مكدس اختياري لا يؤثر على بقية الصفحات.

## QA المتبقي

تم التحقق آليًا من JSX والتوافق مع الاختبارات، لكن Visual QA authenticated الفعلي على 360 و375 و390 و414 و430 بكسل يحتاج جلسة مستخدم موثقة ومتصفحًا متصلًا. لذلك لا يُعلن الحكم البصري النهائي `READY FOR RELEASE` قبل إتمام هذا الفحص.
