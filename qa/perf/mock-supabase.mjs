// ============================================================================
// Mock Supabase — منصّة قياس أداء منيو SIMSIM (بيئة معملية معزولة)
// ============================================================================
// يحاكي REST + Storage الحقيقيين بنفس الأشكال وأحجام الحمولة وزمن الشبكة
// المُقاس من الإنتاج (ap-southeast-1 من السعودية ≈ 180ms RTT).
// لا يُستخدم في الإنتاج إطلاقاً — أداة قياس فقط (qa/).
import http from 'node:http'
import { randomUUID } from 'node:crypto'

const LATENCY_MS = Number(process.env.MOCK_LATENCY ?? 180) // زمن ذهاب وإياب لكل طلب
const PORT = Number(process.env.MOCK_PORT ?? 5599)

// ===== بيانات مطابقة لإحصاءات الإنتاج: 9 أقسام / 48 صنفاً / كلها بصور =====
const REST_ID = '04ff6967-95b0-4a59-8f29-f454c412e7c8'
const BRANCH_ID = 'd61f2cdf-883c-4f12-8898-7e9b47a7e354'
const CAT_NAMES = ['الشباتي', 'الشاورما', 'البرغر', 'المقبلات', 'المشروبات الساخنة', 'المشروبات الباردة', 'الحلويات', 'السلطات', 'الوجبات العائلية']
const rid = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`

const categories = CAT_NAMES.map((name, i) => ({
  id: rid(100 + i), restaurant_id: REST_ID, branch_id: BRANCH_ID,
  name, name_en: `Category ${i + 1}`, cover_url: null,
  is_visible: true, sort_order: i, created_at: '2026-07-12T04:40:52.988768+00:00',
}))

// وصف بمتوسط 153 بايت — نفس متوسط الإنتاج المقاس
const DESC = 'وجبة طازجة تُحضّر عند الطلب من مكوّنات مختارة بعناية، مع صلصة المطعم الخاصة وخبز يُخبز يومياً في مطبخنا. تُقدّم ساخنة مع البطاطس المقرمشة.'
const products = Array.from({ length: 48 }, (_, i) => ({
  id: rid(200 + i), restaurant_id: REST_ID, branch_id: BRANCH_ID,
  category_id: categories[i % categories.length].id,
  name: `صنف رقم ${i + 1} — وجبة مميزة`, name_en: `Product ${i + 1}`,
  description: DESC, description_en: null,
  price: 18 + (i % 25), compare_price: i % 5 === 0 ? 30 + (i % 10) : null,
  image_url: `http://127.0.0.1:${PORT}/storage/v1/object/public/restaurant-media/${REST_ID}/products/img${i % 12}.jpg`,
  emoji: '🍽️', calories: 300 + i * 7,
  is_available: true, is_featured: i % 12 === 0, is_best_seller: i % 15 === 0,
  options: i % 4 === 0
    ? [{ name: 'الحجم', type: 'single', required: true, choices: [{ name: 'وسط', price: 0 }, { name: 'كبير', price: 5 }] }]
    : [],
  sort_order: i, created_at: '2026-07-12T04:40:52.988768+00:00', updated_at: '2026-08-18T17:08:50.403924+00:00',
}))

const restaurant = {
  id: REST_ID, name: 'سمسم', slug: 'simsim', type: 'restaurant',
  phone: '966551804564', address: 'ينبع شارع جده', currency: 'SAR',
  logo_url: `http://127.0.0.1:${PORT}/storage/v1/object/public/restaurant-media/${REST_ID}/logo/logo.jpg`,
  cover_url: `http://127.0.0.1:${PORT}/storage/v1/object/public/restaurant-media/${REST_ID}/cover/cover.jpg`,
  maps_url: 'https://maps.app.goo.gl/3JBtcWR54xKefafe9', owner_id: randomUUID(),
  allergens: Array.from({ length: 14 }, (_, i) => ({ icon: '🥜', label: `مُسبّب حساسية ${i + 1}`, label_en: `Allergen ${i + 1}` })),
  is_active: true, created_at: '2026-06-11T09:21:41.062255+00:00', updated_at: '2026-08-18T17:08:50.403924+00:00',
  show_hours: true, brand_color: '#8B5CF6', price_color: '#0090ff', description_color: '#000000',
  description: 'مطعم سمسم ... نُقدّم لك أشهى الوجبات والسندويتشات الطازجة، من الشباتي والشاورما إلى المشروبات الساخنة',
  description_en: 'Simsim Restaurant... fresh meals and sandwiches.',
  menu_layout: 'grid', delivery_fee: 15, delivery_enabled: false,
  social_links: { tiktok: 'https://www.tiktok.com/', twitter: 'https://x.com/', snapchat: 'https://www.snapchat.com/web', instagram: 'https://www.instagram.com/', whatsapp_social: 'https://web.whatsapp.com/' },
  opening_hours: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'].map(day => ({ day, from: '00:00', to: '23:59', open: true })),
  show_allergens: true, show_prep_time: true, show_description: true, show_social_links: true,
  onboarding_step: 'done', onboarding_completed: true, platform_suspended: false,
  whatsapp_message: 'مرحباً بك في مطعم سمسم', subscription_plan: 'starter',
  recommendations_count: 6, recommendations_enabled: true,
}

const branches = [
  { id: BRANCH_ID, restaurant_id: REST_ID, name: 'الفرع الرئيسي', name_en: 'Main Branch', phone: '966551804564', address: 'ينبع شارع جده', address_en: null, maps_url: '', is_active: true, is_paused: false, is_primary: true, sort_order: 0, delivery_fee: null, delivery_enabled: null, takeaway_enabled: true, menu_clone_status: 'ready', menu_clone_error: null, created_at: '2026-07-12T04:40:52.988768+00:00', updated_at: '2026-08-18T17:08:18.542342+00:00', opening_hours: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'].map(day => ({ day, from: '00:00', to: '23:59', open: true })) },
  { id: rid(2), restaurant_id: REST_ID, name: 'فرع المشهد', name_en: 'Mashhad branch', phone: '0551804564', address: 'المشهد', address_en: 'Mashhad', maps_url: '', is_active: true, is_paused: false, is_primary: false, sort_order: 1, delivery_fee: null, delivery_enabled: null, takeaway_enabled: true, menu_clone_status: 'ready', menu_clone_error: null, created_at: '2026-07-12T04:55:28.687492+00:00', updated_at: '2026-07-12T06:07:10.88081+00:00', opening_hours: [] },
]

// ===== صور JPEG اصطناعية بأحجام الإنتاج (متوسط 89KB، أقصى 186KB) =====
const JPEG_HEAD = Buffer.from('ffd8ffe000104a46494600010100000100010000ffdb004300' + '10'.repeat(64) + 'ffc00011080438043803012200021101031101ffda0008030100021003110000', 'hex')
function fakeJpeg(bytes) {
  const body = Buffer.alloc(Math.max(0, bytes - JPEG_HEAD.length - 2))
  for (let i = 0; i < body.length; i++) body[i] = (i * 37 + (i >> 5)) & 0xff // حشو غير قابل للضغط
  return Buffer.concat([JPEG_HEAD, body, Buffer.from('ffd9', 'hex')])
}
// نفس توزيع أحجام الإنتاج المقاسة من storage.objects
const IMG_SIZES = [190532, 188059, 167875, 161126, 156872, 153245, 142234, 125919, 125014, 62000, 41000, 11500]
const IMAGES = IMG_SIZES.map(fakeJpeg)

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const p = url.pathname

  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'access-control-expose-headers': 'content-range, x-supabase-api-version',
  }
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end() }

  // ===== Storage: صور المنتجات/الشعار/الغلاف =====
  if (p.startsWith('/storage/v1/object/public/')) {
    await sleep(LATENCY_MS)
    const m = p.match(/img(\d+)\.jpg$/)
    const buf = m ? IMAGES[Number(m[1]) % IMAGES.length] : IMAGES[9]
    res.writeHead(200, { 'content-type': 'image/jpeg', 'content-length': buf.length, 'cache-control': 'max-age=3600', ...cors })
    return res.end(buf)
  }

  // ===== Realtime: لا websocket في القياس (العميل يعيد المحاولة بلا حجب) =====
  if (p.startsWith('/realtime/')) { res.writeHead(404, cors); return res.end() }

  // ===== Auth =====
  if (p.startsWith('/auth/v1/')) {
    await sleep(LATENCY_MS)
    res.writeHead(200, { 'content-type': 'application/json', ...cors })
    return res.end(JSON.stringify({}))
  }

  await sleep(LATENCY_MS) // زمن الشبكة لكل طلب REST — هذا ما يجعل الشلال مرئياً

  // PostgREST: .single()/.maybeSingle() تطلب كائناً واحداً عبر ترويسة Accept — نحاكي ذلك
  const wantsObject = String(req.headers.accept || '').includes('pgrst.object')
  const json = (data, status = 200) => {
    const shaped = wantsObject && Array.isArray(data) ? (data[0] ?? null) : data
    const body = JSON.stringify(shaped)
    res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), ...cors })
    res.end(body)
  }

  // ===== RPC =====
  if (p.startsWith('/rest/v1/rpc/')) {
    const fn = p.slice('/rest/v1/rpc/'.length)
    switch (fn) {
      case 'get_active_orders_count': return json(3)
      case 'get_restaurant_rating': return json([{ avg_rating: 4.6, review_count: 27 }])
      case 'menu_capabilities': return json({ online_orders: true, reviews: true, loyalty: true, product_details: true })
      case 'menu_branding': return json({ enabled: true, placement: 'bottom', text: 'صُمم بواسطة سمسم', url: 'https://simsimmenu.com' })
      case 'get_recent_order_items':
        return json(Array.from({ length: 40 }, (_, i) => ({ items: [{ id: products[i % products.length].id, qty: 1 + (i % 3) }] })))
      case 'get_orders_status': return json([])
      case 'get_customer_loyalty': return json([])
      case 'track_event': return json(null)
      case 'resolve_menu_slug': return json('simsim')
      default: return json(null)
    }
  }

  // ===== REST tables =====
  const table = p.startsWith('/rest/v1/') ? p.slice('/rest/v1/'.length) : null
  switch (table) {
    case 'restaurants': return json([restaurant])
    case 'branches': return json(branches)
    case 'categories': return json(categories)
    case 'products': return json(products)
    case 'banners': return json([])
    case 'coupons': return json([])
    case 'loyalty_programs': return json([{ enabled: false }])
    case 'restaurant_tables': return json([])
    case 'product_recommendations': return json([])
    case 'cart_wide_recommendations': return json([])
    default: return json([])
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock-supabase on http://127.0.0.1:${PORT} (latency ${LATENCY_MS}ms/req)`)
})
