// حارس آلي لبوابة صلاحيات المشرف — أي دالة admin_* بلا بوابة توقف الدمج في CI.
// المرجع: ADR-27/ADR-28 — المشرف يصل للبيانات حصراً عبر دوال SECURITY DEFINER مبوّبة.
// فحص ثابت (Offline) لملفات sql/: يتأكد أن جسم كل دالة admin_* (1) يستدعي
// is_platform_admin() أو platform_admin_can(...)، و(2) أن البوابة هي أول بيان بعد begin
// (لا استعلام قبلها) — يكشف نسيان البوابة أو وضعها بعد قراءة/كتابة قبل الدمج.
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
// البوابة كأول بيان: بعد begin مباشرة (بعد تجاهل التعليقات/الفراغات) يجب أن يبدأ بها
const GATE_FIRST_RE = /^if\s+not\s+public\.(is_platform_admin|platform_admin_can)\s*\(/i

// أول بيان تنفيذي بعد begin (بعد إزالة التعليقات)، أو null لو لا يوجد begin (دالة language sql)
function firstStmtAfterBegin(body) {
  const clean = body.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  const m = /\bbegin\b/i.exec(clean)
  if (!m) return null
  return clean.slice(m.index + m[0].length).replace(/^\s+/, '')
}

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

  // البوابة أول بيان: يطبَّق على دوال plpgsql ذات begin (يُتخطّى ما لا begin له — language sql)
  const gatedFns = adminFns.filter((f) => firstStmtAfterBegin(f.body) !== null)
  it.each(gatedFns.map((f) => [f.name, f]))(
    'الدالة %s تبدأ بالبوابة كأول بيان بعد begin',
    (_name, fn) => {
      const first = firstStmtAfterBegin(fn.body)
      expect(
        GATE_FIRST_RE.test(first),
        `الدالة ${fn.name} في ${fn.file}: البوابة ليست أول بيان بعد begin — أول بيان: «${first.slice(0, 60)}…»`,
      ).toBe(true)
    },
  )
})
