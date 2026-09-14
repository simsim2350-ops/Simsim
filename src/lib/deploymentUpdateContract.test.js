import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// عقد "تحديث النشرة" (DEPLOYMENT_UPDATE_ROOT_CAUSE_REPORT.md /
// DEPLOYMENT_UPDATE_FIX_EXECUTION_REPORT.md) — يمنع تكرار نفس الانحراف مستقبلاً بنفس
// أسلوب src/lib/authOnboardingJourney.test.js (فحص نصي لمصدر الملفات، لا رندر).
const app = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8')
const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.js'), 'utf8')
const vercelJson = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'))

describe('deployment update contract', () => {
  it('vercel.json: يُعيد 404 حقيقياً لأي ملف /assets/* غير موجود، لا 200/index.html', () => {
    const routes = vercelJson.routes
    const filesystemIndex = routes.findIndex((r) => r.handle === 'filesystem')
    expect(filesystemIndex).toBeGreaterThan(-1)

    // القاعدة يجب أن تأتي *بعد* {"handle":"filesystem"} — لتُطبَّق فقط على مسارات
    // /assets/ التي لم يجدها الفحص الحقيقي للملفات (أي: غير موجودة فعلاً)، لا كل شيء.
    const assets404Index = routes.findIndex((r, i) => i > filesystemIndex && r.src === '/assets/(.*)' && r.status === 404)
    expect(assets404Index).toBeGreaterThan(-1)

    // ويجب أن تسبق قاعدة catch-all الأخيرة (/(.*) → /index.html) — وإلا فإن الأخيرة
    // ستلتقط الطلب أولاً وتُعيد index.html كما كان يحدث قبل الإصلاح.
    const catchAllIndex = routes.findIndex((r, i) => i > filesystemIndex && r.src === '/(.*)' && r.dest === '/index.html')
    expect(catchAllIndex).toBeGreaterThan(-1)
    expect(assets404Index).toBeLessThan(catchAllIndex)
  })

  it('vercel.json: أصول /assets/* الحقيقية تُخدَّم بـCache-Control immutable طويل المدى', () => {
    const rule = vercelJson.routes.find((r) => r.src === '/assets/(.*)' && r.headers?.['Cache-Control'])
    expect(rule).toBeTruthy()
    expect(rule.headers['Cache-Control']).toBe('public, max-age=31536000, immutable')
    expect(rule.continue).toBe(true)
  })

  it('vercel.json: لا توجد قاعدة تجعل index.html نفسه immutable', () => {
    const indexRules = vercelJson.routes.filter((r) => r.dest === '/index.html' && r.headers?.['Cache-Control'])
    expect(indexRules).toHaveLength(0)
  })

  it('vercel.json: لم تُمس أي قاعدة proxy موجودة (menu-next/marketing/api)', () => {
    const dests = vercelJson.routes.map((r) => r.dest).filter(Boolean)
    expect(dests).toContain('https://simsim-menu-next.vercel.app/menu/$2')
    expect(dests).toContain('https://simsim-menu-next.vercel.app/print/$2')
    expect(dests).toContain('https://simsim-menu-next.vercel.app/api/$1')
    expect(dests).toContain('https://simsim-marketing-ssr-staging.vercel.app/')
  })

  it('App.jsx: إعادة تحميل chunk فاشل محكومة بفحص نوع الخطأ + علَم جلسة يمنع أي حلقة', () => {
    expect(app).toContain('function isChunkLoadError(error)')
    expect(app).toContain('CHUNK_RELOAD_FLAG')
    expect(app).toContain('hasAttemptedChunkReload')
    expect(app).toContain('markChunkReloadAttempted')
    expect(app).toContain('isChunkLoadError(error) && !hasAttemptedChunkReload()')
    // فشل غير متعلق بـchunk يجب أن يستمر إلى throw (لا إعادة تحميل) — يصل RootErrorBoundary.
    expect(app).toContain('throw error')
  })

  it('App.jsx: يفحص نشرة جديدة عند البدء وعند عودة التبويب للظهور (visibilitychange)، بلا polling دوري', () => {
    expect(app).toContain("import { checkForNewDeployment } from './lib/deploymentVersion'")
    expect(app).toContain("document.addEventListener('visibilitychange'")
    expect(app).not.toMatch(/setInterval/)
  })

  it('App.jsx: شريط التحديث لا يُعيد التحميل تلقائياً بلا ضغطة صريحة من المستخدم', () => {
    expect(app).toContain('function UpdateBanner')
    expect(app).toContain('onClick={onReload}')
    expect(app).not.toContain('setTimeout(() => window.location.reload()')
  })

  it('vite.config.js: يُولِّد buildId وقت البناء ويكتب version.json دون خدمة backend جديدة', () => {
    expect(viteConfig).toContain('__SIMSIM_BUILD_ID__')
    expect(viteConfig).toContain("VERCEL_GIT_COMMIT_SHA")
    expect(viteConfig).toContain('version.json')
  })
})
