// تطبيع النص العربي: توحيد الهمزات (أ/إ/آ→ا)، التاء المربوطة (ة→ه)، الألف المقصورة (ى→ي)، وإزالة التشكيل/التطويل
export function normalizeArabic(s) {
  return (s || '')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىی]/g, 'ي')
    .trim()
    .toLowerCase()
}

function levenshtein(a, b) {
  const m = a.length, n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    prev = cur
  }
  return prev[n]
}

// درجة مطابقة صنف واحد لاستعلام بحث: مطابقة تامة > بداية الاسم > احتواء جزئي > الوصف > تسامح إملائي بسيط
function scoreProduct(query, product) {
  const q = normalizeArabic(query)
  if (!q) return 0
  const name = normalizeArabic(product.name)
  if (name === q) return 100
  if (name.startsWith(q)) return 85
  if (name.includes(q)) return 65
  const desc = normalizeArabic(product.description || '')
  if (desc.includes(q)) return 50

  const qWords = q.split(' ')
  const nameWords = name.split(' ')
  let bestDist = Infinity
  qWords.forEach(qw => {
    nameWords.forEach(nw => {
      const d = levenshtein(qw, nw)
      if (d < bestDist) bestDist = d
    })
  })
  if (bestDist <= 1 && q.length >= 3) return 45
  if (bestDist <= 2 && q.length >= 5) return 30
  return 0
}

// ترتيب الأصناف حسب جودة المطابقة، ثم المنتجات المميزة/«الأكثر طلبًا»، ثم الأصناف المحبوبة وفق المبيعات الفعلية.
export function rankProducts(query, products, { bestSellerIds } = {}) {
  return products
    .map(p => ({ p, s: scoreProduct(query, p) }))
    .filter(x => x.s > 0)
    .sort((a, b) => {
      if (b.s !== a.s) return b.s - a.s
      const aMostOrdered = !!a.p.is_featured, bMostOrdered = !!b.p.is_featured
      if (aMostOrdered !== bMostOrdered) return aMostOrdered ? -1 : 1
      const aBest = !!bestSellerIds?.has(a.p.id), bBest = !!bestSellerIds?.has(b.p.id)
      if (aBest !== bBest) return aBest ? -1 : 1
      return 0
    })
    .map(x => x.p)
}
