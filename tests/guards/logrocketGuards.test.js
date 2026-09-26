// Static guards لتكامل LogRocket (Phase 1.8E): يمنع عودة sanitizer ثانٍ أو استدعاءات تسرّب أو سطح تشخيص عام.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SRC = path.join(ROOT, 'src')
const FACTORY = 'src/observability/privacy/networkPolicy.js'
const INTEGRATION = 'src/observability/providers/LogRocketErrorReporter.js'

const rel = (file) => path.relative(ROOT, file).split(path.sep).join('/')
const isTest = (file) => /\.test\.[jt]sx?$/.test(file) || rel(file).startsWith('src/test/')

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return /\.[jt]sx?$/.test(entry.name) ? [full] : []
  })
}

// تعليقات تقريبية تُحذف كي لا تُحدث الشروحات إنذارات كاذبة.
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')

const sourceFiles = walk(SRC).filter((f) => !isTest(f)).map((f) => ({ file: rel(f), code: stripComments(fs.readFileSync(f, 'utf8')) }))
const filesMatching = (re) => sourceFiles.filter((f) => re.test(f.code)).map((f) => f.file)

describe('LogRocket — نقطة التكامل الوحيدة', () => {
  it('LogRocket.init موجود في مُنفِّذ واحد فقط', () => {
    expect(filesMatching(/\bLogRocket\s*\.\s*init\s*\(/)).toEqual([INTEGRATION])
  })

  it('حزمة logrocket لا تُستورد إلا من المُنفِّذ', () => {
    expect(filesMatching(/from\s+['"]logrocket['"]|require\(\s*['"]logrocket['"]\s*\)|import\(\s*['"]logrocket['"]\s*\)/)).toEqual([INTEGRATION])
  })

  it('المُنفِّذ يبني الخيارات من المصنع فقط ولا يحوي منطق sanitizer', () => {
    const reporter = sourceFiles.find((f) => f.file === INTEGRATION).code
    expect(reporter).toContain('buildLogRocketOptions(')
    expect(reporter).not.toMatch(/Sanitizer|network\s*:|isEnabled|shouldCaptureIP|shouldDetectExceptions|hiddenAttributes|disablePageTitles/)
  })
})

describe('لا مسار خام يتجاوز المُنظِّف', () => {
  const reporter = () => sourceFiles.find((f) => f.file === INTEGRATION).code
  const count = (re, text) => (text.match(re) || []).length

  it('كل LogRocket.captureException في المُنفِّذ يُمرَّر له نتيجة toSafeError(...) حصراً (المتغيّر safe)', () => {
    const calls = count(/\bLogRocket\s*\.\s*captureException\s*\(/g, reporter())
    const safeCalls = count(/\bLogRocket\s*\.\s*captureException\s*\(\s*safe\s*[,)]/g, reporter())
    const assignments = count(/\bconst\s+safe\s*=\s*toSafeError\s*\(/g, reporter())
    expect(calls).toBeGreaterThan(0)
    expect(safeCalls).toBe(calls)
    expect(assignments).toBe(1)
  })

  it('Phase 1.8G: المُنفِّذ لا يقرأ رسالة/stack الخطأ الخام ولا يحوّل أي شيء إلى نص', () => {
    expect(reporter()).not.toMatch(/\.\s*message\b|\.\s*stack\b|JSON\s*\.\s*stringify|\bString\s*\(|\.toString\s*\(/)
  })

  it('Phase 1.8G: سياسة الرسائل لا تستورد LogRocket ولا تسلسل/تحوّل لنص أي قيمة مُلتقَطة (السلوك نفسه تحرسه اختبارات السياسة)', () => {
    const policy = sourceFiles.find((f) => f.file === 'src/observability/privacy/exceptionMessagePolicy.js').code
    expect(policy).not.toMatch(/\bLogRocket\b|from\s+['"]logrocket['"]/)
    expect(policy).not.toMatch(/JSON\s*\.\s*stringify|\bString\s*\(|\.toString\s*\(\s*\)|\bObject\s*\.\s*(entries|values|assign)\s*\(/)
  })

  it('Phase 1.8G: captureMessage (نص حرّ) لا يستدعيه أي كود تطبيق خارج طبقة observability (المسار خامل)', () => {
    expect(filesMatching(/\berrorReporter\s*\.\s*captureMessage\s*\(/).filter((f) => !f.startsWith('src/observability/'))).toEqual([])
  })

  it('كل LogRocket.captureMessage يُمرَّر له scrubErrorText(...) حصراً', () => {
    const calls = count(/\bLogRocket\s*\.\s*captureMessage\s*\(/g, reporter())
    const safeCalls = count(/\bLogRocket\s*\.\s*captureMessage\s*\(\s*scrubErrorText\s*\(/g, reporter())
    expect(calls).toBeGreaterThan(0)
    expect(safeCalls).toBe(calls)
  })

  it('مستمعو error/unhandledrejection العامّون (وwindow.onerror) لا يوجدون إلا في حدّ الاستثناءات', () => {
    const listeners = /addEventListener\s*\(\s*['"](?:error|unhandledrejection)['"]|\bwindow\s*\.\s*on(?:error|unhandledrejection)\s*=|\bonunhandledrejection\s*=/
    expect(filesMatching(listeners)).toEqual(['src/observability/privacy/exceptionBoundary.js'])
  })

  it('الحدّ يستدعي report فقط (لا LogRocket مباشرة) ولا يمنع سلوك الأحداث', () => {
    const boundary = sourceFiles.find((f) => f.file === 'src/observability/privacy/exceptionBoundary.js').code
    expect(boundary).not.toMatch(/\bLogRocket\b|from\s+['"]logrocket['"]/)
    expect(boundary).not.toMatch(/preventDefault|stopPropagation|stopImmediatePropagation/)
  })
})

describe('DOM وخصوصية العنوان', () => {
  it('عنوان الصفحة يُكتب من ملفات مُراجَعة فقط (النصوص ثابتة)', () => {
    const writers = filesMatching(/\bdocument\s*\.\s*title\s*=/).sort()
    expect(writers).toEqual(['src/pages/Legal.jsx', 'src/pages/NotFound.jsx'])
  })

  it('لا استثناءات من مُنظِّف النص (data-public) بلا مراجعة صريحة', () => {
    expect(filesMatching(/data-public/)).toEqual([])
  })
})

describe('الوضع الإنتاجي يبقى مغلقاً', () => {
  it('PRODUCTION_POLICY = off/[] والشبكة مُغلقة في الخيارات الافتراضية', async () => {
    const { PRODUCTION_POLICY, buildLogRocketOptions } = await import('../../src/observability/privacy/networkPolicy.js')
    expect(PRODUCTION_POLICY.mode).toBe('off')
    expect(PRODUCTION_POLICY.allow).toEqual([])
    const options = buildLogRocketOptions()
    expect(options.network.isEnabled).toBe(false)
    expect(options.shouldDetectExceptions).toBe(false)
    expect(options.console.isEnabled).toBe(false)
    expect(options.shouldCaptureIP).toBe(false)
    expect(options.dom.disablePageTitles).toBe(true)
  })
})

describe('لا تنفيذ ثانٍ للـsanitizers', () => {
  it('أسماء خيارات الخصوصية تظهر في المصنع فقط', () => {
    const names = /\b(requestSanitizer|responseSanitizer|urlSanitizer|textSanitizer|inputSanitizer|imageSanitizer|shouldCaptureIP|shouldSendData|shouldDetectExceptions|hiddenAttributes|disablePageTitles)\b/
    expect(filesMatching(names)).toEqual([FACTORY])
  })

  it('إعداد network: { … } لا يُكتب إلا في المصنع', () => {
    expect(filesMatching(/\bnetwork\s*:\s*\{/)).toEqual([FACTORY])
  })
})

describe('استدعاءات LogRocket الممنوعة', () => {
  it('لا LogRocket.identify ولا identify() عموماً', () => {
    expect(filesMatching(/\bidentify\s*\(/)).toEqual([])
  })

  it('لا LogRocket.track/log/info/warn/error/debug/startNewSession/reduxMiddleware', () => {
    expect(filesMatching(/\bLogRocket\s*\.\s*(track|log|info|warn|error|debug|startNewSession|reduxMiddleware)\s*\(/)).toEqual([])
  })

  it('captureException/captureMessage تُستدعى فقط من المُنفِّذ', () => {
    expect(filesMatching(/\bLogRocket\s*\.\s*(captureException|captureMessage)\s*\(/)).toEqual([INTEGRATION])
  })
})

describe('لا سطح تشخيص عام لـLogRocket', () => {
  it('صفحة LogRocketDiag محذوفة ولا مسار /logrocket-diag', () => {
    expect(fs.existsSync(path.join(SRC, 'pages/LogRocketDiag.jsx'))).toBe(false)
    expect(filesMatching(/logrocket-diag|LogRocketDiag/i)).toEqual([])
    expect(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')).not.toMatch(/logrocket-diag/i)
  })

  it('لا كود يخاطب endpoint الإدخال أو يقرأ داخليات المُسجِّل', () => {
    expect(filesMatching(/logr-in\.com|lr-ingest\.io|_lr_surl_cb|__SDKCONFIG__|_LRLogger/)).toEqual([])
  })
})
