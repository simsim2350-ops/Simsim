// ============================================================================
// فحص حالة الـMigrations — checkMigrationStatus
// ============================================================================
// يقارن ملفات SQL في مجلد sql/ (ماعدا sql/archive/) بالملفات المسجَّلة في
// جدول schema_migrations بقاعدة البيانات. يُظهر: ملفات غير مُطبَّقة /
// ملفات مُطبَّقة لكن غير موجودة على الديسك.
//
// يتسامح مع أعطال الشبكة (يخرج 0 مع تحذير) حتى لا يكسر البناء لأسباب
// بنية تحتية — نفس سلوك checkRegistryDrift.mjs.
//
// الاستخدام:
//   node scripts/checkMigrationStatus.mjs
//   VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... node scripts/checkMigrationStatus.mjs
// ============================================================================

import { readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SQL_DIR   = join(__dirname, '..', 'sql')

// نفس القيم العلنية في src/config — مع أولوية لمتغيّرات البيئة.
const SUPABASE_URL      = process.env.VITE_SUPABASE_URL      || 'https://gpwwnuuicywsvmmhxngs.supabase.co'
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_W-JmAl6PMvXRukikc9KHQQ_GTDvQOS5'

const warn  = (m) => console.warn(`⚠️  ${m}`)
const info  = (m) => console.log(m)

// منطق المقارنة النقيّ (بلا شبكة) — قابل للاختبار.
// onDisk: Set<filename>, appliedInDb: Set<filename>
export function computeMigrationGaps(onDisk, appliedInDb) {
  const unapplied  = [...onDisk].filter((f) => !appliedInDb.has(f))
  const orphanInDb = [...appliedInDb].filter((f) => !onDisk.has(f))
  return { unapplied, orphanInDb, hasGaps: unapplied.length + orphanInDb.length > 0 }
}

// يقرأ ملفات .sql من sql/ ماعدا المُؤرشَفة
async function readSqlFilesOnDisk() {
  const entries = await readdir(SQL_DIR, { withFileTypes: true })
  return new Set(
    entries
      .filter((e) => e.isFile() && e.name.endsWith('.sql'))
      .map((e) => e.name)
  )
}

async function fetchAppliedMigrations() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_applied_migrations`, {
    method: 'POST',
    headers: {
      apikey:          SUPABASE_ANON_KEY,
      Authorization:   `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type':  'application/json',
    },
    body: '{}',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  return res.json()
}

async function main() {
  // 1. ملفات على الديسك
  let onDisk
  try {
    onDisk = await readSqlFilesOnDisk()
  } catch (e) {
    console.error(`❌ فشل قراءة مجلد sql/: ${e?.message || e}`)
    process.exitCode = 1
    return
  }

  info(`📁 ملفات SQL على الديسك (sql/): ${onDisk.size}`)

  // 2. الملفات المُطبَّقة في قاعدة البيانات
  let data
  try {
    data = await fetchAppliedMigrations()
  } catch (e) {
    warn(`تعذّر الوصول لقاعدة البيانات — تخطّي فحص الـMigrations (لا يكسر البناء): ${e?.message || e}`)
    info('\nللتشغيل اليدوي: قارن الملفات أعلاه بمحتوى جدول schema_migrations في Supabase.')
    return
  }

  if (!Array.isArray(data)) {
    warn('استجابة غير متوقّعة من get_applied_migrations — تخطّي الفحص.')
    return
  }

  const appliedInDb = new Set(data.map((r) => r.filename))
  info(`🗄️  ملفات مسجَّلة في schema_migrations: ${appliedInDb.size}`)

  const { unapplied, orphanInDb, hasGaps } = computeMigrationGaps(onDisk, appliedInDb)

  if (!hasGaps) {
    info(`✅ جميع ملفات sql/ مسجَّلة كمُطبَّقة في schema_migrations (${onDisk.size} ملف).`)
    return
  }

  if (unapplied.length) {
    console.error(`\n🔴 ملفات غير مسجَّلة في schema_migrations (${unapplied.length} ملف):`)
    for (const f of unapplied.sort()) console.error(`   - ${f}`)
    console.error('\nهذه الملفات قد تكون: غير مُطبَّقة بعد، أو مُطبَّقة قبل إنشاء جدول التتبّع.')
    console.error('الإجراء: طبِّق الملف إن لزم، ثم سجِّله:\n  INSERT INTO schema_migrations(filename) VALUES (\'<filename>\');')
  }

  if (orphanInDb.length) {
    console.warn(`\n⚠️  ملفات في schema_migrations لكن غير موجودة في sql/ (${orphanInDb.length} ملف):`)
    for (const f of orphanInDb.sort()) console.warn(`   - ${f}`)
    console.warn('هذه الملفات قد تكون محذوفة أو مؤرشَفة — راجع sql/archive/ إن كانت مهجورة.')
  }

  // لا نكسر CI بهذا الفحص (كثير من الملفات سبق تطبيقها قبل إنشاء الجدول).
  // يُشغَّل كأداة إعلامية للمطوّر. عدِّل هذا السلوك بعد الـBootstrap الكامل.
  warn('الجدول حديث الإنشاء — قم بتسجيل الملفات المُطبَّقة تاريخياً لإزالة هذا التحذير.')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`❌ فشل السكربت: ${e?.message || e}`)
    process.exitCode = 1
  })
}
