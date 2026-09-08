// Smart Image Framing for Product Details — content-aware, not filename/
// product-aware. Detects the real subject's bounding box inside a product
// photo (trimming large uniform-color margins baked into the source file —
// internal white space, or letterbox/black bars) so the display layer can
// scale and center the ACTUAL PRODUCT to fill the available area, instead
// of scaling the raw file's own canvas (which is what left "ماء"'s bottle
// looking small, and "شاورما صاروخ"'s black bars visible).
//
// Pure pixel-content analysis (a lightweight, generic "auto-trim margins"
// algorithm, similar in spirit to ImageMagick's `-trim`) — no product name,
// id, or any other non-visual signal is ever used. Works automatically for
// any future photo a restaurant uploads.
//
// Performance: analysis runs on a small (<=96px) downscaled canvas — a few
// thousand pixel comparisons, sub-millisecond in practice — and only once
// ever per unique image URL for the life of this page (module-level cache,
// keyed by URL, shared by every open of every product using that photo).
// Never re-analyzed on modal close/reopen.

export type ContentBox = { left: number; top: number; right: number; bottom: number }
export type FramingResult = { box: ContentBox; naturalWidth: number; naturalHeight: number }

const FULL_BOX: ContentBox = { left: 0, top: 0, right: 1, bottom: 1 }

const ANALYSIS_SIZE = 96 // downscaled analysis canvas max dimension — plenty for bbox detection
const BG_COLOR_DELTA = 26 // perceptual RGB distance under which a pixel counts as "background"
const EMPTY_ROW_FRACTION = 0.9 // a row/column counts as "margin" once >=90% of it is background-like
const MIN_CONTENT_AREA_FRACTION = 0.1 // detected content smaller than this is distrusted -> fall back to full image
const PADDING_FRACTION = 0.04 // safety margin added around the detected box so the subject is never clipped

const cache = new Map<string, Promise<FramingResult>>()

export function detectContentBox(url: string): Promise<FramingResult> {
  const cached = cache.get(url)
  if (cached) return cached
  const promise = analyze(url).catch(() => ({ box: FULL_BOX, naturalWidth: 0, naturalHeight: 0 }))
  cache.set(url, promise)
  return promise
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = url
  })
}

async function analyze(url: string): Promise<FramingResult> {
  const img = await loadImage(url)
  const w = img.naturalWidth
  const h = img.naturalHeight
  if (!w || !h) return { box: FULL_BOX, naturalWidth: w, naturalHeight: h }

  const scale = ANALYSIS_SIZE / Math.max(w, h)
  const cw = Math.max(1, Math.round(w * scale))
  const ch = Math.max(1, Math.round(h * scale))
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return { box: FULL_BOX, naturalWidth: w, naturalHeight: h }
  ctx.drawImage(img, 0, 0, cw, ch)

  let data: Uint8ClampedArray
  try {
    data = ctx.getImageData(0, 0, cw, ch).data
  } catch {
    // Tainted canvas or any other read failure — safe, unchanged fallback.
    return { box: FULL_BOX, naturalWidth: w, naturalHeight: h }
  }

  const at = (x: number, y: number): readonly [number, number, number] => {
    const i = (y * cw + x) * 4
    return [data[i], data[i + 1], data[i + 2]]
  }

  // Background reference color: median of the outermost pixel ring — robust
  // to a stray bright/dark pixel or two at the very edge.
  const border: (readonly [number, number, number])[] = []
  for (let x = 0; x < cw; x++) { border.push(at(x, 0)); border.push(at(x, ch - 1)) }
  for (let y = 0; y < ch; y++) { border.push(at(0, y)); border.push(at(cw - 1, y)) }
  const median = (nums: number[]) => { const s = [...nums].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }
  const bg: readonly [number, number, number] = [
    median(border.map((p) => p[0])),
    median(border.map((p) => p[1])),
    median(border.map((p) => p[2])),
  ]

  const isBackground = (p: readonly [number, number, number]) => {
    const dr = p[0] - bg[0]
    const dg = p[1] - bg[1]
    const db = p[2] - bg[2]
    return Math.sqrt(dr * dr + dg * dg + db * db) < BG_COLOR_DELTA
  }

  const rowIsMargin = (y: number) => {
    let bgCount = 0
    for (let x = 0; x < cw; x++) if (isBackground(at(x, y))) bgCount++
    return bgCount / cw >= EMPTY_ROW_FRACTION
  }
  const colIsMargin = (x: number) => {
    let bgCount = 0
    for (let y = 0; y < ch; y++) if (isBackground(at(x, y))) bgCount++
    return bgCount / ch >= EMPTY_ROW_FRACTION
  }

  let top = 0
  while (top < ch && rowIsMargin(top)) top++
  let bottom = ch - 1
  while (bottom > top && rowIsMargin(bottom)) bottom--
  let left = 0
  while (left < cw && colIsMargin(left)) left++
  let right = cw - 1
  while (right > left && colIsMargin(right)) right--

  let box: ContentBox = { left: left / cw, top: top / ch, right: (right + 1) / cw, bottom: (bottom + 1) / ch }
  const area = (box.right - box.left) * (box.bottom - box.top)

  if (!(area >= MIN_CONTENT_AREA_FRACTION) || !(box.right > box.left) || !(box.bottom > box.top)) {
    // Detection produced something implausible (e.g. a photo with no clean
    // border to measure a background against) — trust the whole image
    // instead of a bad guess. Same safe behavior as before this change.
    box = FULL_BOX
  } else {
    const padX = (box.right - box.left) * PADDING_FRACTION
    const padY = (box.bottom - box.top) * PADDING_FRACTION
    box = {
      left: Math.max(0, box.left - padX),
      top: Math.max(0, box.top - padY),
      right: Math.min(1, box.right + padX),
      bottom: Math.min(1, box.bottom + padY),
    }
  }

  return { box, naturalWidth: w, naturalHeight: h }
}
