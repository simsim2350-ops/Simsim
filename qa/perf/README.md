# منصّة قياس أداء منيو SIMSIM

أداة قياس معملية معزولة. **لا تمسّ كود الإنتاج ولا تُشحن معه** — موجودة في `qa/` فقط.

## لماذا بيئة معملية؟
منيو الإنتاج يعتمد على Supabase في `ap-southeast-1` (سنغافورة). القياس من جهاز
المطوّر السريع يُخفي المشكلة تماماً (انظر عمود desktop). هذه المنصّة تُعيد إنتاج
رحلة فتح المنيو بنفس عدد الطلبات وترتيبها وأحجام حمولتها المُقاسة من الإنتاج،
مع خنق شبكة ومعالج مطابق لجوال متوسط.

## المكوّنات
- `mock-supabase.mjs` — يحاكي REST + Storage: نفس الأشكال، 9 أقسام/48 صنفاً،
  أحجام صور مطابقة لتوزيع `storage.objects` الحقيقي (متوسط 89KB، أقصى 186KB).
- `measure.mjs` — Chromium + محاكاة جوال (390×844، DPR 3، خنق معالج ×4)
  + خنق شبكة عبر CDP، ويقيس Web Vitals + معالم المنيو الحقيقية + شلال الشبكة.

## التشغيل
```bash
VITE_SUPABASE_URL=http://127.0.0.1:5599 VITE_SUPABASE_ANON_KEY=test npm run build
node qa/perf/mock-supabase.mjs &            # MOCK_LATENCY=30 افتراضياً
node qa/perf/measure.mjs --label before --profile slow4g --runs 5
```

الملفات الشبكية: `slow4g` (780kbps/300ms) · `fast4g` (1.6Mbps/150ms) · `desktop` (10Mbps/40ms).
النتائج تُحفظ في `qa/perf/results/<label>-<profile>.json` (الوسيط median لعدد التشغيلات).

## ملاحظات على الدقّة
- `fonts.googleapis.com` محجوب في بيئة القياس، فيُحاكى محلياً بزمن 30ms.
  الواقع أبطأ (DNS+TCP+TLS لأصل ثالث) — أي أن تكلفة سلسلة الخطوط **أقل من الحقيقة هنا**.
- الملفات النصية تُضغط gzip كما تفعل الاستضافة الحقيقية.
- كل قياس زيارة أولى بلا كاش (`cache-control: no-store`).
