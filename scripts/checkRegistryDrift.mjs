// ============================================================================
// فحص انحراف سجل القدرات (Registry Drift Check) — ADR-40
// ============================================================================
// يقارن نوع/وجود كل قدرة في قاعدة البيانات (feature_flags) بمصدر الحقيقة
// (features.manifest.js). يكشف: مفتاح ناقص في القاعدة / مفتاح يتيم في القاعدة /
// خطأ نوع. يخرج بخطأ (1) عند أي انحراف حقيقي فيفشل CI؛ ويتسامح مع أعطال الشبكة/
// القاعدة (يخرج 0 مع تحذير) حتى لا يكسر البناء لأسباب بنية تحتية.
//
// حارس features.manifest.test.js يفحص الـManifest داخلياً؛ هذا السكربت يكمّله
// بفحص انحراف القاعدة عنه — الثغرة التي سمحت بمرور (menu_cart/numberofbranches).
//
// المصادر (URL + مفتاح anon) علنية بتصميم Supabase (الحماية عبر RLS) ومُثبّتة في
// src/config كـfallback؛ نعيد استخدامها هنا مع أولوية لمتغيّرات البيئة إن وُجدت.
// ============================================================================
// نستخدم fetch مباشرةً لنقطة PostgREST (rpc) بدل @supabase/supabase-js: الأخير
// يُنشئ عميل realtime يتطلّب WebSocket غير المتوفّر في Node 20 (نسخة CI). fetch
// عالمي منذ Node 18، فيعمل بلا اعتماديات ولا WebSocket.
import { CAPABILITIES } from '../src/registry/features.manifest.js'

// نفس القيم العلنية في src/config (غير سرّية) — مع أولوية لمتغيّرات البيئة.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://gpwwnuuicywsvmmhxngs.supabase.co'
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_W-JmAl6PMvXRukikc9KHQQ_GTDvQOS5'

const warn = (m) => console.warn(`⚠️  ${m}`)

// منطق المقارنة النقيّ (بلا شبكة) — قابل للاختبار في vitest.
// expected/actual: Map(key → type). يُرجع القوائم الثلاث للانحراف.
export function computeDrift(expected, actual) {
  const missingInDb = []   // في الـManifest، غائب عن القاعدة
  const typeMismatch = []  // موجود لكن بنوع مختلف
  for (const [key, type] of expected) {
    if (!actual.has(key)) missingInDb.push(key)
    else if (actual.get(key) !== type) typeMismatch.push({ key, manifest: type, db: actual.get(key) })
  }
  const orphanInDb = [...actual.keys()].filter((k) => !expected.has(k)) // في القاعدة، غائب عن الـManifest
  return { missingInDb, typeMismatch, orphanInDb, hasDrift: missingInDb.length + typeMismatch.length + orphanInDb.length > 0 }
}

// مصدر الحقيقة: النوع الافتراضي feature (نفس منطق buildSeedSQL/catalogApi).
export const manifestExpected = () => new Map(CAPABILITIES.map((c) => [c.key, c.type ?? 'feature']))

async function fetchSnapshot() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/registry_drift_snapshot`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  return res.json()
}

async function main() {
  const expected = manifestExpected()

  let data
  try {
    data = await fetchSnapshot()
  } catch (e) {
    // عطل شبكة/قاعدة — لا نكسر CI لأسباب بنية تحتية.
    warn(`تعذّر الوصول لقاعدة البيانات — تخطّي فحص الانحراف (لا يكسر البناء): ${e?.message || e}`)
    return
  }
  if (!Array.isArray(data)) {
    warn('استجابة غير متوقّعة من registry_drift_snapshot — تخطّي الفحص.')
    return
  }

  const { missingInDb, typeMismatch, orphanInDb, hasDrift } = computeDrift(expected, new Map(data.map((r) => [r.key, r.type])))
  if (!hasDrift) {
    console.log(`✅ لا انحراف: ${expected.size} قدرة في الـManifest تطابق قاعدة البيانات (النوع والوجود).`)
    return
  }

  console.error('🔴 انحراف بين قاعدة البيانات والـManifest:')
  if (missingInDb.length) console.error(`❌ مفاتيح في الـManifest وغائبة عن القاعدة (تحتاج مزامنة): ${missingInDb.join(', ')}`)
  if (orphanInDb.length) console.error(`❌ مفاتيح في القاعدة وغائبة عن الـManifest (يتيمة): ${orphanInDb.join(', ')}`)
  for (const m of typeMismatch) console.error(`❌ خطأ نوع «${m.key}»: الـManifest=${m.manifest} · القاعدة=${m.db}`)
  console.error('\nالإصلاح: زامِن من الـManifest (زر «⟳ مزامنة من Manifest») أو صحّح الصف يدوياً، ثم أعد الفحص.')
  process.exitCode = 1
}

// يُشغَّل كسكربت فقط (لا عند الاستيراد في الاختبار).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    // خطأ برمجي غير متوقّع في السكربت نفسه — نكسر CI (ليس عطل بنية تحتية).
    console.error(`❌ فشل السكربت: ${e?.message || e}`)
    process.exitCode = 1
  })
}
