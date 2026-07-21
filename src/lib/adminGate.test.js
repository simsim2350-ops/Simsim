// حارس آلي لبوابة صلاحيات المشرف — أي دالة admin_* بلا بوابة توقف الدمج في CI.
// المرجع: ADR-27 — المشرف يصل للبيانات حصراً عبر دوال SECURITY DEFINER مبوّبة.
// فحص ثابت (Offline) لملفات sql/: يتأكد أن جسم كل دالة admin_* يستدعي
// is_platform_admin() أو platform_admin_can(...) — يكشف نسيان البوابة قبل الدمج.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const sqlDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'sql')

// يلتقط تعريف كل دالة plpgsql مع جسمها بين as $$ ... $$
const FN_RE = /create\s+or\s+replace\s+function\s+public\.(\w+)\s*\([\s\S]*?\bas\s+\$\$([\s\S]*?)\$\$/gi
// عدّاد رؤوس دوال admin_ للتحقق من أن المُحلِّل لم يفوّت أياً منها بصمت
const ADMIN_HEADER_RE = /create\s+or\s+replace\s+function\s+public\.admin_\w+\s*\(/gi
const GATE_RE = /\b(is_platform_admin|platform_admin_can)\s*\(/

const functions = []   // { name, body, file }
let adminHeaderCount = 0

for (const file of readdirSync(sqlDir).filter((f) => f.endsWith('.sql'))) {
  const sql = readFileSync(join(sqlDir, file), 'utf8')
  adminHeaderCount += (sql.match(ADMIN_HEADER_RE) || []).length
  for (const m of sql.matchAll(FN_RE)) {
    functions.push({ name: m[1], body: m[2], file })
  }
}

const adminFns = functions.filter((f) => f.name.startsWith('admin_'))

describe('حارس بوابة المشرف (Admin gate)', () => {
  it('المُحلِّل يلتقط كل دوال admin_* بلا فقدان صامت', () => {
    // يضمن أن regex التعريف لم يفوّت دالة موجودة برأسها (لو فشل، الفحص أدناه بلا معنى)
    expect(adminFns.length).toBe(adminHeaderCount)
    expect(adminFns.length).toBeGreaterThanOrEqual(7) // العدد الحالي المعروف — شبكة أمان
  })

  it.each(adminFns.map((f) => [f.name, f]))(
    'الدالة %s تحرس نفسها ببوابة صلاحية',
    (_name, fn) => {
      expect(
        GATE_RE.test(fn.body),
        `الدالة ${fn.name} في ${fn.file} لا تستدعي is_platform_admin() أو platform_admin_can() — بوابة مفقودة!`,
      ).toBe(true)
    },
  )
})
