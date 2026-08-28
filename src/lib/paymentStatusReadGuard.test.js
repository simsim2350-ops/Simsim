// حارس آلي لدالة قراءة حالة الدفع الآمنة بالرمز — TASK-PAY-3.6D.4-B (المواصفة المعتمدة في
// TASK_3_6D_4_A). فحص ثابت (Offline) لملف sql/payment_status_reads.sql: يتأكد أن العقد المعتمد
// (الحقول المُعادة، SECURITY DEFINER، التطابق التام، منح anon/authenticated) لا ينحرف صامتاً —
// نفس فلسفة src/lib/adminGate.test.js وsrc/lib/orderJourneyGuards.test.js القائمتين، دون تعديلهما.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const sqlDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'sql')
const FN_NAME = 'get_payment_status_by_idempotency_key'

function stripSqlComments(text) {
  return text.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
}

// يلتقط: الترويسة (RETURNS/LANGUAGE/SECURITY... حتى AS $tag$) والجسم بين علامتي $tag$
const FN_RE = /create\s+or\s+replace\s+function\s+public\.(\w+)\s*\(([\s\S]*?)\)\s*([\s\S]*?)\bas\s+\$(\w*)\$([\s\S]*?)\$\4\$/gi
const GRANT_RE = /grant\s+execute\s+on\s+function\s+public\.(\w+)\s*\(([^)]*)\)\s+to\s+([^;]+);/gi
const REVOKE_RE = /revoke\s+all\s+on\s+function\s+public\.(\w+)\s*\(([^)]*)\)\s+from\s+([^;]+);/gi

const rawFiles = readdirSync(sqlDir)
  .filter((f) => f.endsWith('.sql'))
  .map((name) => ({ name, raw: readFileSync(join(sqlDir, name), 'utf8') }))

const functions = []
const grants = []
const revokes = []
for (const file of rawFiles) {
  const clean = stripSqlComments(file.raw)
  for (const m of clean.matchAll(FN_RE)) {
    functions.push({ name: m[1], params: m[2], header: m[3], tag: m[4], body: m[5], file: file.name })
  }
  for (const m of clean.matchAll(GRANT_RE)) {
    grants.push({ name: m[1], params: m[2], roles: m[3].trim(), file: file.name })
  }
  for (const m of clean.matchAll(REVOKE_RE)) {
    revokes.push({ name: m[1], params: m[2], roles: m[3].trim(), file: file.name })
  }
}

const fn = functions.find((f) => f.name === FN_NAME)
const grant = grants.find((g) => g.name === FN_NAME)
const revoke = revokes.find((r) => r.name === FN_NAME)

// الحقول المسموحة حرفياً (بالاسم فقط) — أي حقل آخر مذكور في القائمة المحظورة يُفشل الاختبار لو ظهر
// في قائمة SELECT الفعلية لجسم الدالة.
const FORBIDDEN_FIELDS = ['\\bid\\b', 'provider_ref', 'restaurant_id', 'invoice_id', 'metadata', '\\braw\\b', 'failure_reason']

describe('GUARD — get_payment_status_by_idempotency_key (TASK-PAY-3.6D.4-B / TASK_3_6D_4_A)', () => {
  it('الدالة مُعرَّفة فعلياً في sql/', () => {
    expect(fn, `لا يوجد "CREATE OR REPLACE FUNCTION public.${FN_NAME}" في أي ملف sql/`).toBeTruthy()
  })

  it('SECURITY DEFINER + STABLE', () => {
    expect(/security\s+definer/i.test(fn.header)).toBe(true)
    expect(/\bstable\b/i.test(fn.header)).toBe(true)
  })

  it('SET search_path TO \'public\'', () => {
    expect(/set\s+search_path\s+to\s+'public'/i.test(fn.header)).toBe(true)
  })

  it('اللغة sql (لا plpgsql) — بلا BEGIN/RAISE ممكنة', () => {
    expect(/language\s+sql\b/i.test(fn.header)).toBe(true)
  })

  it('مُدخَل وحيد: p_idempotency_key text', () => {
    expect(fn.params.trim().toLowerCase()).toBe('p_idempotency_key text')
  })

  it('تُعيد الحقول الأربعة المعتمدة فقط، بالاسم والترتيب: status, amount, currency, updated_at', () => {
    const returnsMatch = /returns\s+table\s*\(([^)]*)\)/i.exec(fn.header)
    expect(returnsMatch, 'لا يوجد RETURNS TABLE(...) في الترويسة').toBeTruthy()
    const fields = returnsMatch[1].split(',').map((s) => s.trim().split(/\s+/)[0].toLowerCase())
    expect(fields).toEqual(['status', 'amount', 'currency', 'updated_at'])
  })

  it.each(FORBIDDEN_FIELDS.map((f) => [f]))('لا تُعيد أو تلمس الحقل المحظور: %s', (pattern) => {
    const re = new RegExp(pattern, 'i')
    expect(re.test(fn.header), `الحقل المحظور "${pattern}" ظهر في ترويسة RETURNS`).toBe(false)
    expect(re.test(fn.body), `الحقل المحظور "${pattern}" ظهر في جسم الدالة`).toBe(false)
  })

  it('مطابقة تساوٍ تام فقط (=) — بلا LIKE/ILIKE/بحث جزئي', () => {
    expect(/idempotency_key\s*=\s*p_idempotency_key/i.test(fn.body)).toBe(true)
    expect(/\blike\b/i.test(fn.body)).toBe(false)
    expect(/\bilike\b/i.test(fn.body)).toBe(false)
  })

  it('بلا أي كتابة (INSERT/UPDATE/DELETE) — قراءة صرفة فقط', () => {
    expect(/\binsert\b|\bupdate\b|\bdelete\b/i.test(fn.body)).toBe(false)
  })

  it('بلا استدعاء لأي دالة أخرى (لا confirmCharge، لا Moyasar، لا RPC متداخلة)', () => {
    expect(/confirm_charge|moyasar|verify_payment/i.test(fn.body)).toBe(false)
  })

  it('GRANT EXECUTE موجود لـanon وauthenticated', () => {
    expect(grant, `لا يوجد GRANT EXECUTE لـ${FN_NAME} في أي ملف sql/`).toBeTruthy()
    expect(grant.roles).toContain('anon')
    expect(grant.roles).toContain('authenticated')
  })

  it('GRANT بنفس توقيع المُدخَل (text)', () => {
    expect(grant.params.trim().toLowerCase()).toBe('text')
  })

  // TASK-PAY-3.6D.4-B.1: PostgreSQL يمنح PUBLIC حق EXECUTE افتراضياً لأي دالة جديدة ما لم يُسحَب
  // صراحةً — هذا الحارس يمنع عودة هذا المنح الضمني صامتاً في أي تعديل مستقبلي على الملف.
  it('REVOKE ALL ... FROM PUBLIC موجود لهذه الدالة تحديداً', () => {
    expect(revoke, `لا يوجد REVOKE ALL ... FROM PUBLIC لـ${FN_NAME} في أي ملف sql/`).toBeTruthy()
    expect(revoke.roles.toLowerCase()).toBe('public')
  })

  it('REVOKE بنفس توقيع المُدخَل (text)', () => {
    expect(revoke.params.trim().toLowerCase()).toBe('text')
  })
})
