// ============================================================================
// قياس أداء فتح منيو SIMSIM — Chromium + محاكاة جوال + خنق شبكة/معالج
// ============================================================================
// يقيس: TTFB / FCP / LCP / CLS / TBT / DCL / Load + معالم المنيو الحقيقية
// (ظهور الهيدر، أول صنف، جاهزية التفاعل) + عدد الطلبات وحجمها مصنّفة.
// الاستخدام: node qa/perf/measure.mjs --label before --profile slow4g --runs 5
import { chromium } from 'playwright-core'
import http from 'node:http'
import fs from 'node:fs'
import zlib from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const DIST = path.join(ROOT, 'dist')

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), [])
)
const LABEL = args.label ?? 'run'
const RUNS = Number(args.runs ?? 5)
const PROFILE = args.profile ?? 'slow4g'
const SLUG = args.slug ?? 'simsim'
const APP_PORT = Number(args.port ?? 5588)

// ملفات شبكة قياسية (Lighthouse/DevTools) — الخنق يُطبَّق عبر CDP
const PROFILES = {
  slow4g:  { down: 780 * 1024 / 8,   up: 330 * 1024 / 8,  latency: 300, cpu: 4, ua: 'mobile' },
  fast4g:  { down: 1.6 * 1024 * 1024 / 8, up: 750 * 1024 / 8, latency: 150, cpu: 4, ua: 'mobile' },
  desktop: { down: 10 * 1024 * 1024 / 8,  up: 5 * 1024 * 1024 / 8, latency: 40, cpu: 1, ua: 'desktop' },
}

// ===== خادم ثابت لملفات dist مع SPA fallback =====
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.png': 'image/png', '.jpg': 'image/jpeg' }
function startStaticServer() {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      const p = new URL(req.url, 'http://x').pathname
      let file = path.join(DIST, p)
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html')
      let buf = fs.readFileSync(file)
      const headers = {
        'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
        'cache-control': 'no-store', // كل قياس = زيارة أولى بلا كاش
      }
      // نضغط النصوص كما يفعل الاستضافة الحقيقية (Vercel) — بدونها تُقاس أحجام غير واقعية
      if (/\.(html|js|css|json|svg)$/.test(file) && /gzip/.test(req.headers['accept-encoding'] || '')) {
        buf = zlib.gzipSync(buf, { level: 9 })
        headers['content-encoding'] = 'gzip'
      }
      headers['content-length'] = buf.length
      res.writeHead(200, headers)
      res.end(buf)
    })
    s.listen(APP_PORT, '127.0.0.1', () => resolve(s))
  })
}

// ===== سكربت يُحقن قبل أي كود صفحة: يسجّل معالم المنيو الحقيقية =====
const MARKS_SCRIPT = `
window.__marks = {};
(function () {
  const mark = (k) => { if (window.__marks[k] == null) window.__marks[k] = performance.now(); };
  const poll = () => {
    if (document.querySelector('.sm-menu-frame')) mark('menuFrame');
    if (document.querySelector('img[src*="/products/"], img[src*="/logo/"]')) mark('firstImageTag');
    const cards = document.querySelectorAll('img[src*="/products/"]');
    if (cards.length > 0) mark('firstProduct');
    if (document.body && document.body.innerText.includes('سمسم')) mark('brandVisible');
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
  // Web Vitals: LCP / CLS / long tasks (TBT)
  window.__lcp = 0; window.__cls = 0; window.__longTasks = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; })
    .observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; })
    .observe({ type: 'layout-shift', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__longTasks.push([e.startTime, e.duration]); })
    .observe({ type: 'longtask', buffered: true }); } catch {}
})();
`

function classify(url) {
  if (url.includes('/rest/v1/') || url.includes('/auth/v1/')) return 'api'
  if (url.includes('/storage/v1/')) return 'image'
  if (url.endsWith('.js') || url.includes('.js?')) return 'js'
  if (url.endsWith('.css')) return 'css'
  if (url.includes('fonts.g')) return 'font'
  if (url.endsWith('.svg')) return 'img-static'
  return 'other'
}

async function runOnce(browser, cfg) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },          // iPhone 14 / أندرويد متوسط
    deviceScaleFactor: 3,
    isMobile: cfg.ua === 'mobile',
    hasTouch: cfg.ua === 'mobile',
    userAgent: cfg.ua === 'mobile'
      ? 'Mozilla/5.0 (Linux; Android 12; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36'
      : undefined,
  })
  await ctx.addInitScript(MARKS_SCRIPT)

  // ===== محاكاة Google Fonts محلياً =====
  // fonts.googleapis.com محجوب في بيئة القياس هذه؛ لو تُركت الطلبات تفشل لصار FCP
  // رهينةَ مهلة DNS لا رهينةَ كود التطبيق. نُحاكيها بأحجام وزمن واقعيين (أصل ثالث،
  // نفس عدد الجولات: css ← woff2) حتى تبقى تكلفة سلسلة الخطوط مُقاسة بصدق.
  await ctx.route('**://fonts.googleapis.com/**', async (route) => {
    const fams = [
      ['Cairo', [300, 400, 500, 600, 700, 800, 900]],
      ['Poppins', [400, 500, 600, 700, 800]],
      ['Tajawal', [300, 400, 500, 700, 800, 900]],
    ]
    let css = ''
    for (const [fam, weights] of fams) {
      for (const w of weights) {
        for (const [sub, range] of [['arabic', 'U+0600-06FF,U+0750-077F,U+FE70-FEFF'], ['latin', 'U+0000-00FF,U+0131,U+2000-206F']]) {
          css += `@font-face{font-family:'${fam}';font-style:normal;font-weight:${w};font-display:swap;`
            + `src:url(https://fonts.gstatic.com/s/${fam.toLowerCase()}/v1/${fam}-${w}-${sub}.woff2) format('woff2');`
            + `unicode-range:${range};}\n`
        }
      }
    }
    await new Promise(r => setTimeout(r, 30)) // زمن معالجة الأصل الثالث
    await route.fulfill({ status: 200, contentType: 'text/css', body: css })
  })
  await ctx.route('**://fonts.gstatic.com/**', async (route) => {
    await new Promise(r => setTimeout(r, 30))
    await route.fulfill({ status: 200, contentType: 'font/woff2', body: Buffer.alloc(22 * 1024, 1) }) // حجم subset واقعي
  })

  const reqs = []
  ctx.on('response', async (r) => {
    let size = 0
    try { size = Number((await r.allHeaders())['content-length'] ?? 0) } catch {}
    reqs.push({ url: r.url(), status: r.status(), kind: classify(r.url()), size })
  })

  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, downloadThroughput: cfg.down, uploadThroughput: cfg.up, latency: cfg.latency,
  })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cfg.cpu })

  const t0 = Date.now()
  await page.goto(`http://127.0.0.1:${APP_PORT}/menu/${SLUG}`, { waitUntil: 'load', timeout: 120000 })
  // ننتظر ظهور أول صنف فعلياً (المنيو صار مفيداً) بحد أقصى معقول
  await page.waitForFunction('window.__marks.firstProduct != null', null, { timeout: 90000 }).catch(() => {})
  await page.waitForTimeout(3000) // نترك مجالاً لاستقرار LCP/CLS وبقية الطلبات

  const m = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] ?? {}
    const paints = Object.fromEntries(performance.getEntriesByType('paint').map(p => [p.name, p.startTime]))
    // TBT: مجموع ما يتجاوز 50ms من المهام الطويلة حتى LCP
    const tbt = window.__longTasks.reduce((s, [, d]) => s + Math.max(0, d - 50), 0)
    return {
      ttfb: nav.responseStart ?? 0,
      fcp: paints['first-contentful-paint'] ?? 0,
      lcp: window.__lcp ?? 0,
      cls: window.__cls ?? 0,
      tbt,
      dcl: nav.domContentLoadedEventEnd ?? 0,
      load: nav.loadEventEnd ?? 0,
      marks: window.__marks,
      // شلال الشبكة: بداية/نهاية كل طلب — لإسناد الزمن لكل مرحلة بالأدلة لا بالتخمين
      timeline: performance.getEntriesByType('resource')
        .filter(r => /\/rest\/v1\/|\/assets\/.*\.(js|css)$|fonts\.(googleapis|gstatic)/.test(r.name))
        .map(r => ({
          n: r.name.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, ''),
          s: Math.round(r.startTime), e: Math.round(r.responseEnd),
        }))
        .sort((a, b) => a.s - b.s),
    }
  })
  const wall = Date.now() - t0
  await ctx.close()

  const by = (k) => reqs.filter(r => r.kind === k)
  return {
    ...m,
    wall,
    requests: reqs.length,
    apiRequests: by('api').length,
    imageRequests: by('image').length,
    jsRequests: by('js').length,
    jsBytes: by('js').reduce((s, r) => s + r.size, 0),
    cssBytes: by('css').reduce((s, r) => s + r.size, 0),
    imageBytes: by('image').reduce((s, r) => s + r.size, 0),
    apiUrls: by('api').map(r => r.url.replace(/^https?:\/\/[^/]+/, '')),
  }
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }

;(async () => {
  const cfg = PROFILES[PROFILE]
  if (!cfg) throw new Error(`profile غير معروف: ${PROFILE}`)
  const staticServer = await startStaticServer()
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })

  const runs = []
  for (let i = 0; i < RUNS; i++) {
    process.stderr.write(`  run ${i + 1}/${RUNS}...\r`)
    runs.push(await runOnce(browser, cfg))
  }
  await browser.close()
  staticServer.close()

  const num = ['ttfb', 'fcp', 'lcp', 'cls', 'tbt', 'dcl', 'load', 'wall', 'requests', 'apiRequests', 'imageRequests', 'jsRequests', 'jsBytes', 'cssBytes', 'imageBytes']
  const out = { label: LABEL, profile: PROFILE, runs: RUNS, slug: SLUG }
  for (const k of num) out[k] = Math.round(median(runs.map(r => r[k])) * (k === 'cls' ? 1000 : 1)) / (k === 'cls' ? 1000 : 1)
  out.marks = {}
  for (const k of ['menuFrame', 'brandVisible', 'firstProduct']) {
    const vals = runs.map(r => r.marks?.[k]).filter(v => v != null)
    out.marks[k] = vals.length ? Math.round(median(vals)) : null
  }
  out.apiSequence = runs[0].apiUrls
  out.timeline = runs[0].timeline

  const dir = path.join(__dirname, 'results')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${LABEL}-${PROFILE}.json`), JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
})()
