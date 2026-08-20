#!/usr/bin/env node
/**
 * PR-03 Production Validation Harness — MEASURE ONLY
 *
 * لا يعدّل أي كود في التطبيق. يفتح Production Public Menu ويقيس فعلياً:
 * FCP / LCP / CLS / TBT / Long Tasks / First Category / First Product / First Product Image
 * + Network Waterfall + Prefetch-vs-Actual URL matching (جوهر PR-03) + Warm Cache.
 *
 * التشغيل على جهاز/بيئة فيها Network Access:
 *   npm i -D playwright && npx playwright install chromium
 *   node qa/pr-03/measure-production.mjs --url https://simsimmenu.com/menu/simsim --runs 5
 *
 * المخرجات:
 *   qa/pr-03/results/cold-runs.json     (كل Run على حدة + median)
 *   qa/pr-03/results/warm-run.json
 *   qa/pr-03/results/prefetch-audit.json
 *   qa/pr-03/results/scroll-<mode>.json
 */

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(HERE, 'results')

const args = process.argv.slice(2)
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback
}

const URL_TARGET = argOf('url', 'https://simsimmenu.com/menu/simsim')
const RUNS = Number(argOf('runs', '5'))

// ---- بيئة الاختبار المطلوبة في المهمة ----
const VIEWPORT = { width: 390, height: 844 }
const DPR = 3
const CPU_SLOWDOWN = 4
// Slow 4G (نفس أرقام DevTools "Slow 4G")
const SLOW_4G = {
  offline: false,
  downloadThroughput: (1.6 * 1024 * 1024) / 8, // 1.6 Mbps
  uploadThroughput: (750 * 1024) / 8,          // 750 Kbps
  latency: 150,                                 // ms RTT
}

// ---------------------------------------------------------------------------
// يُحقن قبل أي سكربت للصفحة: يلتقط web-vitals الخام + علامات ظهور المحتوى.
// ---------------------------------------------------------------------------
const INIT_SCRIPT = `
window.__perf = {
  fcp: null, lcp: null, lcpEl: null, lcpUrl: null,
  cls: 0, longTasks: [],
  firstCategory: null, firstProduct: null, firstProductImage: null,
  prefetchLinks: [], // كل <link rel=preload as=image> يضيفه PR-03
};

new PerformanceObserver((l) => {
  for (const e of l.getEntries()) {
    if (e.name === 'first-contentful-paint') window.__perf.fcp = e.startTime;
  }
}).observe({ type: 'paint', buffered: true });

new PerformanceObserver((l) => {
  const es = l.getEntries();
  const last = es[es.length - 1];
  if (!last) return;
  window.__perf.lcp = last.startTime;
  window.__perf.lcpUrl = last.url || null;
  window.__perf.lcpEl = last.element
    ? (last.element.tagName + (last.element.className ? '.' + String(last.element.className).slice(0, 60) : ''))
    : null;
}).observe({ type: 'largest-contentful-paint', buffered: true });

new PerformanceObserver((l) => {
  for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value;
}).observe({ type: 'layout-shift', buffered: true });

new PerformanceObserver((l) => {
  for (const e of l.getEntries()) window.__perf.longTasks.push({ start: e.startTime, dur: e.duration });
}).observe({ type: 'longtask', buffered: true });

// PR-03: راقب حقن روابط الـpreload لحظة إضافتها (لقياس Prefetch Start).
const _append = Node.prototype.appendChild;
Node.prototype.appendChild = function (node) {
  try {
    if (node && node.tagName === 'LINK' && node.rel === 'preload' && node.as === 'image') {
      window.__perf.prefetchLinks.push({
        t: performance.now(),
        href: node.href,
        imagesrcset: node.imageSrcset || node.getAttribute('imagesrcset') || null,
        imagesizes: node.imageSizes || node.getAttribute('imagesizes') || null,
        fetchpriority: node.fetchPriority || node.getAttribute('fetchpriority') || null,
      });
    }
  } catch (e) {}
  return _append.call(this, node);
};

// علامات ظهور المحتوى الحقيقي (وليس تخميناً بصرياً).
new MutationObserver(() => {
  const p = window.__perf;
  if (p.firstCategory === null && document.querySelector('[data-cat-tab], [data-category-id]')) {
    p.firstCategory = performance.now();
  }
  if (p.firstProduct === null && document.querySelector('[data-product-id]')) {
    p.firstProduct = performance.now();
  }
  if (p.firstProductImage === null) {
    for (const img of document.querySelectorAll('[data-product-id] img, img')) {
      if (img.complete && img.naturalWidth > 0 && /render\\/image|storage\\/v1/.test(img.currentSrc || img.src)) {
        p.firstProductImage = performance.now();
        break;
      }
    }
  }
}).observe(document.documentElement, { childList: true, subtree: true, attributes: true });
`

// ---------------------------------------------------------------------------
function median(values) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b)
  if (!nums.length) return null
  const mid = Math.floor(nums.length / 2)
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2
}

async function newPage(browser, { throttle = true, clearCache = true } = {}) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DPR,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  })
  await context.addInitScript(INIT_SCRIPT)
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)

  await cdp.send('Network.enable')
  await cdp.send('Page.enable')
  if (clearCache) {
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
    await cdp.send('Network.clearBrowserCache')
  }
  if (throttle) {
    await cdp.send('Network.emulateNetworkConditions', SLOW_4G)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN })
  }

  // Network waterfall خام
  const requests = new Map()
  cdp.on('Network.requestWillBeSent', (e) => {
    requests.set(e.requestId, {
      url: e.request.url,
      type: e.type,
      start: e.timestamp * 1000,
      initiator: e.initiator?.type,
      priority: e.request.initialPriority,
      fromPrefetch: false,
      encodedBytes: 0,
      status: null,
      fromCache: false,
      end: null,
    })
  })
  cdp.on('Network.responseReceived', (e) => {
    const r = requests.get(e.requestId)
    if (!r) return
    r.status = e.response.status
    r.fromCache = Boolean(e.response.fromDiskCache || e.response.fromPrefetchCache)
    r.mimeType = e.response.mimeType
    r.protocol = e.response.protocol
  })
  cdp.on('Network.loadingFinished', (e) => {
    const r = requests.get(e.requestId)
    if (!r) return
    r.encodedBytes = e.encodedDataLength
    r.end = e.timestamp * 1000
  })

  return { context, page, cdp, requests }
}

function summarizeNetwork(requests) {
  const all = [...requests.values()]
  const images = all.filter((r) => r.type === 'Image' || /render\/image|\.(webp|jpg|jpeg|png|avif)/i.test(r.url))
  const supabase = all.filter((r) => /supabase\.co\/rest\/v1|supabase\.co\/auth/i.test(r.url))
  const byUrl = new Map()
  for (const r of all) byUrl.set(r.url, (byUrl.get(r.url) || 0) + 1)
  const duplicates = [...byUrl.entries()].filter(([, n]) => n > 1).map(([url, n]) => ({ url, count: n }))

  return {
    totalRequests: all.length,
    totalBytes: all.reduce((s, r) => s + (r.encodedBytes || 0), 0),
    imageRequests: images.length,
    imageBytes: images.reduce((s, r) => s + (r.encodedBytes || 0), 0),
    webpImages: images.filter((r) => /format=webp/i.test(r.url) || r.mimeType === 'image/webp').length,
    rawJpegImages: images.filter((r) => /storage\/v1\/object\/public/i.test(r.url)).length,
    supabaseRequests: supabase.map((r) => ({ url: r.url.slice(0, 160), start: r.start, status: r.status })),
    duplicates,
    servedFromCache: all.filter((r) => r.fromCache).length,
  }
}

async function collect(page) {
  return page.evaluate(() => {
    const p = window.__perf
    const tbt = p.longTasks.reduce((s, t) => s + Math.max(0, t.dur - 50), 0)
    // تحقق TEST 11/12: الصور الفعلية المرسومة
    const imgs = [...document.querySelectorAll('img')].slice(0, 40).map((img) => ({
      currentSrc: img.currentSrc || img.src,
      format: /format=webp/.test(img.currentSrc || img.src) ? 'webp' : 'other',
      hasWidthAttr: img.hasAttribute('width'),
      hasHeightAttr: img.hasAttribute('height'),
      rendered: { w: Math.round(img.getBoundingClientRect().width), h: Math.round(img.getBoundingClientRect().height) },
      natural: { w: img.naturalWidth, h: img.naturalHeight },
      loading: img.loading,
      fetchPriority: img.fetchPriority,
      insidePicture: img.parentElement?.tagName === 'PICTURE',
    }))
    return {
      fcp: p.fcp, lcp: p.lcp, lcpElement: p.lcpEl, lcpUrl: p.lcpUrl,
      cls: p.cls, tbt,
      longTaskCount: p.longTasks.length,
      longestTask: p.longTasks.reduce((m, t) => Math.max(m, t.dur), 0),
      firstCategory: p.firstCategory,
      firstProduct: p.firstProduct,
      firstProductImage: p.firstProductImage,
      prefetchLinks: p.prefetchLinks,
      images: imgs,
    }
  })
}

// TEST 6 — الفحص الحاسم: هل الرابط المُسخَّن هو نفسه الرابط الذي يطلبه <img> فعلاً؟
async function auditPrefetchMatch(page) {
  return page.evaluate(() => {
    const warmed = window.__perf.prefetchLinks
    const warmedUrls = new Set()
    for (const l of warmed) {
      if (l.href) warmedUrls.add(l.href.split('?')[0] + '?' + (l.href.split('?')[1] || ''))
      if (l.imagesrcset) for (const c of l.imagesrcset.split(',')) warmedUrls.add(c.trim().split(' ')[0])
    }
    const actual = [...document.querySelectorAll('img')]
      .map((i) => i.currentSrc)
      .filter((u) => u && /render\/image/.test(u))
    const matched = actual.filter((u) => warmedUrls.has(u))
    return {
      warmedLinkCount: warmed.length,
      warmedUrlCount: warmedUrls.size,
      actualImageUrlCount: actual.length,
      matchedCount: matched.length,
      sampleWarmed: [...warmedUrls].slice(0, 3),
      sampleActual: actual.slice(0, 3),
      // إذا كان 0 → آلية PR-03 لا تنتج cache hit إطلاقاً.
      verdict: warmed.length === 0 ? 'NO_PREFETCH_FIRED' : matched.length === 0 ? 'PREFETCH_URL_MISMATCH' : 'MATCH',
    }
  })
}

async function scrollTest(browser, mode) {
  const { context, page, requests } = await newPage(browser)
  await page.goto(URL_TARGET, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForTimeout(8000) // انتظار استقرار المحتوى الأساسي

  const timeline = []
  const stepPause = mode === 'fast' ? 150 : 2500
  const steps = mode === 'reverse' ? 10 : 6

  for (let i = 0; i < steps; i++) {
    const y = mode === 'reverse' && i >= 5 ? -1200 : 1200
    await page.mouse.wheel(0, y)
    await page.waitForTimeout(stepPause)
    timeline.push({
      step: i,
      t: Date.now(),
      state: await page.evaluate(() => ({
        now: performance.now(),
        scrollY: window.scrollY,
        prefetchCount: window.__perf.prefetchLinks.length,
        blankImages: [...document.querySelectorAll('img')].filter((img) => {
          const r = img.getBoundingClientRect()
          return r.top < innerHeight && r.bottom > 0 && (!img.complete || img.naturalWidth === 0)
        }).length,
        cls: window.__perf.cls,
      })),
    })
  }

  const result = {
    mode,
    timeline,
    prefetchAudit: await auditPrefetchMatch(page),
    network: summarizeNetwork(requests),
    perf: await collect(page),
  }
  await context.close()
  return result
}

// ---------------------------------------------------------------------------
async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const browser = await chromium.launch({ args: ['--no-sandbox'] })
  console.log(`TARGET: ${URL_TARGET}\nRUNS: ${RUNS} | ${VIEWPORT.width}x${VIEWPORT.height} DPR${DPR} | CPU x${CPU_SLOWDOWN} | Slow 4G | cache disabled\n`)

  // ---- TEST 1-5, 11-14: Cold Load × RUNS ----
  const coldRuns = []
  for (let i = 1; i <= RUNS; i++) {
    const { context, page, requests } = await newPage(browser)
    const t0 = Date.now()
    await page.goto(URL_TARGET, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForTimeout(15000) // نافذة كافية لاكتمال LCP والصور على Slow 4G
    const perf = await collect(page)
    const run = {
      run: i,
      wallClockMs: Date.now() - t0,
      ...perf,
      network: summarizeNetwork(requests),
      prefetchAudit: await auditPrefetchMatch(page),
    }
    coldRuns.push(run)
    console.log(
      `run ${i}: FCP=${perf.fcp?.toFixed(0)} LCP=${perf.lcp?.toFixed(0)} (${perf.lcpElement}) ` +
      `CLS=${perf.cls?.toFixed(4)} TBT=${perf.tbt?.toFixed(0)} ` +
      `firstProduct=${perf.firstProduct?.toFixed(0)} firstImg=${perf.firstProductImage?.toFixed(0)} ` +
      `prefetch=${run.prefetchAudit.verdict}`
    )
    await context.close()
  }

  const summary = {
    fcpMedian: median(coldRuns.map((r) => r.fcp)),
    lcpMedian: median(coldRuns.map((r) => r.lcp)),
    clsMedian: median(coldRuns.map((r) => r.cls)),
    tbtMedian: median(coldRuns.map((r) => r.tbt)),
    firstCategoryMedian: median(coldRuns.map((r) => r.firstCategory)),
    firstProductMedian: median(coldRuns.map((r) => r.firstProduct)),
    firstProductImageMedian: median(coldRuns.map((r) => r.firstProductImage)),
    imageRequestsMedian: median(coldRuns.map((r) => r.network.imageRequests)),
    imageBytesMedian: median(coldRuns.map((r) => r.network.imageBytes)),
    totalBytesMedian: median(coldRuns.map((r) => r.network.totalBytes)),
  }
  writeFileSync(resolve(OUT_DIR, 'cold-runs.json'), JSON.stringify({ config: { URL_TARGET, VIEWPORT, DPR, CPU_SLOWDOWN, RUNS }, summary, runs: coldRuns }, null, 2))
  console.log('\nCOLD MEDIAN:', JSON.stringify(summary, null, 2))

  // ---- TEST 7/8/9: Scroll behaviours ----
  for (const mode of ['normal', 'fast', 'reverse']) {
    const res = await scrollTest(browser, mode)
    writeFileSync(resolve(OUT_DIR, `scroll-${mode}.json`), JSON.stringify(res, null, 2))
    console.log(`scroll ${mode}: prefetch=${res.prefetchAudit.verdict} imgReq=${res.network.imageRequests} dup=${res.network.duplicates.length} cls=${res.perf.cls.toFixed(4)}`)
  }

  // ---- TEST 10: Warm cache ----
  {
    const { context, page, requests } = await newPage(browser, { clearCache: false })
    await page.goto(URL_TARGET, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForTimeout(10000)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(10000)
    const warm = { ...(await collect(page)), network: summarizeNetwork(requests) }
    writeFileSync(resolve(OUT_DIR, 'warm-run.json'), JSON.stringify(warm, null, 2))
    console.log(`warm: LCP=${warm.lcp?.toFixed(0)} cached=${warm.network.servedFromCache}/${warm.network.totalRequests}`)
    await context.close()
  }

  await browser.close()
  console.log(`\nDONE → ${OUT_DIR}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
