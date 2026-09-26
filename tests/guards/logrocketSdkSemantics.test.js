// SDK-semantics pin (Phase 1.8E). يُثبّت سلوك logrocket@12.1.1 الذي بُني عليه تصميم Default-Deny.
// لو تغيّر الـSDK (ترقية/تعديل) فشل هذا الاختبار => إعادة مراجعة إلزامية قبل أي تفعيل. لا تخمين.
// المرجع: SIMSIM_LOGROCKET_PHASE_1_8E_DESIGN_REPORT.md §4 (S1–S12).
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const readJson = (rel) => JSON.parse(read(rel))
// نُسوّي المسافات/الأسطر كي لا يكسر التنسيق الاختبار.
const sdk = read('node_modules/logrocket/dist/build.umd.js').replace(/\s+/g, ' ')
const types = read('node_modules/logrocket/dist/types.d.ts').replace(/\s+/g, ' ')

describe('إصدار الـSDK مُثبَّت تماماً', () => {
  it('logrocket المُثبَّت في node_modules هو 12.1.1', () => {
    expect(readJson('node_modules/logrocket/package.json').version).toBe('12.1.1')
  })
  it('package.json يثبّت logrocket بلا نطاق (لا ^ ولا ~)', () => {
    expect(readJson('package.json').dependencies.logrocket).toBe('12.1.1')
  })
  it('package-lock.json متّسق مع التثبيت', () => {
    const lock = readJson('package-lock.json')
    expect(lock.packages[''].dependencies.logrocket).toBe('12.1.1')
    expect(lock.packages['node_modules/logrocket'].version).toBe('12.1.1')
  })
})

describe('S1–S4: تفعيل الشبكة وإسقاط الطلب (request)', () => {
  it('S1) isEnabled=false يُرجع null في الطلب والاستجابة', () => {
    const occurrences = sdk.match(/if \(!isEnabled\) \{ return null; \}/g) || []
    expect(occurrences.length).toBeGreaterThanOrEqual(2)
  })

  it('S2) بلا sanitizer الافتراضي هو identity (fail-open) — لذلك نحن نمرّر sanitizer دائماً', () => {
    expect(sdk).toMatch(/requestSanitizer = f => f \} = arguments/)
    expect(sdk).toMatch(/responseSanitizer = f => f \} = arguments/)
  })

  it('S3) رمي requestSanitizer يُلتقط ثم يُعامَل كـnull (إسقاط الطلب)', () => {
    expect(sdk).toMatch(/sanitized = requestSanitizer\(_objectSpread\(_objectSpread\(\{\}, request\), \{\}, \{ reqId \}\)\); \} catch \(err\) \{ console\.error\(err\); \} if \(sanitized\) \{/)
  })

  it('S4) نتيجة falsy من requestSanitizer تُسقط الطلب وتُعلّم reqId كمتجاهَل (فيُسقَط ردّه)', () => {
    expect(sdk).toMatch(/\} ignoredNetwork\[reqId\] = true; return null; \}\);/)
  })

  it('S3/S4) الردّ المقترن بطلب مُسقَط لا يُسجَّل، ولا تُقرأ استجابته أصلاً', () => {
    expect(sdk).toMatch(/\} else if \(ignoredNetwork\[reqId\]\) \{ delete ignoredNetwork\[reqId\]; return null; \}/)
    expect(sdk).toContain("Don't even try to read ignored requests")
  })
})

describe('S5–S8: شكل السجل المُسجَّل', () => {
  it('S5) الطلب المُسجَّل يُبنى من الكائن المُرجَع، لكن method/reqId من الأصل (غير قابلين للتنظيف)', () => {
    expect(sdk).toMatch(/reqId, \/\/ default url, \/\/ sanitized headers: /)
    expect(sdk).toMatch(/body: truncate\(sanitized\.body\), \/\/ sanitized method, \/\/ default referrer: sanitized\.referrer \|\| undefined,/)
  })

  it('S5) قيم الـheaders تُحوَّل إلى نصوص (null تصبح "null")', () => {
    const occurrences = sdk.match(/return "".concat\(headerValue\);/g) || []
    expect(occurrences.length).toBeGreaterThanOrEqual(2)
  })

  it('S6) رمي responseSanitizer يُلتقط ويقع على السجل المحجوب', () => {
    expect(sdk).toMatch(/catch \(err\) \{ console\.error\(err\); \/\/ fall through to redacted log \}/)
  })

  it('S7) نتيجة falsy من responseSanitizer تنتج سجلاً محجوباً: status فقط بلا headers/body', () => {
    expect(sdk).toMatch(/return \{ reqId, \/\/ default responseType, status, \/\/ default headers: \{\}, \/\/ redacted body: null, \/\/ redacted method \/\/ default \};/)
  })

  it('S8) استجابة مُرجَعة كائناً تُسجَّل من status/headers/body المُرجَعة', () => {
    expect(sdk).toMatch(/status: sanitized\.status, \/\/ sanitized headers: /)
  })
})

describe('S10: تطبيع أسماء الـheaders', () => {
  it('كائن Headers يُمرَّر عبر forEach (أسماء lowercase)، والكائن العادي يُترك كما هو', () => {
    expect(sdk).toMatch(/if \(headers == null \|\| typeof headers\.forEach !== 'function'\) \{ return headers; \}/)
    expect(sdk).toMatch(/headers\.forEach\(\(value, key\) => \{ if \(result\[key\]\) \{/)
  })
})

describe('S13 (Phase 1.8F): الالتقاط التلقائي للاستثناءات — محلّي داخل الحزمة ومتحقَّق منه', () => {
  it('shouldDetectExceptions افتراضياً true، ولا يُثبَّت registerExceptions إلا إن كان true', () => {
    expect(sdk).toMatch(/shouldDetectExceptions = true \} = opts; if \(shouldDetectExceptions\) \{ this\._installed\.push\(\(0, _exceptions\.registerExceptions\)\(this\)\); \}/)
  })

  it('مسار unhandledrejection في الـSDK يمرّر reason الخام (Error كما هو، وغيره كـmessage) — سبب تعطيله', () => {
    expect(sdk).toMatch(/const rejectionHandler = evt => \{.*if \(evt\.reason instanceof Error\) \{ Capture\.captureException\(logger, evt\.reason, null, null, 'UNHANDLED_REJECTION'\); \}/)
    expect(sdk).toContain("message: evt.reason || 'Unhandled Promise rejection'")
  })

  it('الـSDK يستخدم مستمع unhandledrejection ومسار Raven للأخطاء غير الملتقطة (كلاهما ضمن التثبيت المشروط)', () => {
    expect(sdk).toContain("window.addEventListener('unhandledrejection', rejectionHandler)")
    expect(sdk).toMatch(/const raven = new _raven\.default\(\{ captureException\(errorReport\) \{ Capture\.captureException\(logger, null, null, errorReport\); \} \}\);/)
  })

  it('captureException الصريح لا يعتمد على الخيار (يبقى يعمل عند shouldDetectExceptions=false)', () => {
    expect(sdk).toMatch(/captureException\(exception\) \{ let options = arguments\.length > 1 && arguments\[1\] !== undefined \? arguments\[1\] : \{\}; _exceptions\.Capture\.captureException\(this, exception, options\); \}/)
  })
})

describe('S14 (Phase 1.8F): خيارات DOM — أنواعها فقط؛ سلوكها في المُسجِّل البعيد (يُتحقَّق منه في staging)', () => {
  it('التعريفات تدعم الخيارات التي نستخدمها', () => {
    expect(types).toContain('textSanitizer?: boolean | string;')
    expect(types).toContain('inputSanitizer?: boolean | string;')
    expect(types).toContain('hiddenAttributes?: string[];')
    expect(types).toContain('disablePageTitles?: boolean;')
    expect(types).toContain('shouldDetectExceptions?: boolean;')
  })

  it('لا تُنفَّذ داخل الحزمة => لا يمكن إثباتها محلياً (سبب وجود canary staging)', () => {
    for (const name of ['hiddenAttributes', 'disablePageTitles', 'textSanitizer', 'inputSanitizer']) expect(sdk).not.toContain(name)
  })
})

describe('S12: ما لا يُنفَّذ داخل الحزمة (المُسجِّل البعيد) — نتحقق أن الافتراض ما زال صحيحاً', () => {
  it('الحزمة تُحمِّل المُسجِّل من CDN بعيد (غير مُثبَّت الإصدار)', () => {
    expect(sdk).toContain('/logger-1.min.js')
  })

  it('urlSanitizer وshouldCaptureIP لا يُنفَّذان داخل الحزمة => سلوكهما غير قابل للتحقق محلياً', () => {
    expect(sdk).not.toContain('urlSanitizer')
    expect(sdk).not.toContain('shouldCaptureIP')
  })

  it('التعريفات (types) تدعم الخيارات التي نعتمد عليها', () => {
    expect(types).toContain('requestSanitizer?(request: IRequest): null | Nullable<IRequest>;')
    expect(types).toContain('responseSanitizer?(response: IResponse): null | Nullable<IResponse>;')
    expect(types).toContain('urlSanitizer?(url: string): null | string;')
    expect(types).toContain('shouldCaptureIP?: boolean;')
    expect(types).toContain('shouldAggregateConsoleErrors?: boolean;')
    expect(types).toMatch(/inputSanitizer\?: boolean \| string;/)
    expect(types).toMatch(/network\?: \{ isEnabled\?: boolean;/)
  })
})
