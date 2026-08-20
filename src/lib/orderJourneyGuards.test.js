// حرّاس آليون لرحلة طلب الزبون (Customer Order Journey — PHASE 9/TASK-TST-001) — فحص ثابت (Offline)
// لملفات sql/، على نمط adminGate.test.js القائم. الهدف: منع تكرار B1/B2/SEC-001/SEC-002/SEC-003
// (كلها أعطال حدثت لأن قاعدة البيانات الحية انحرفت صامتة عن المستودع — انظر ADR-44، §R-05).
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const sqlDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'sql')

// إزالة تعليقات SQL قبل أي تحليل — تعليق يذكر "realtime.broadcast(" أو "order_access_token" كنص
// توثيقي (كما في هذا الملف نفسه) لا يجب أن يُحرّف نتيجة الحارس لا سلباً ولا إيجاباً.
function stripSqlComments(text) {
  return text.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
}

const sqlFiles = readdirSync(sqlDir)
  .filter((f) => f.endsWith('.sql'))
  .map((name) => ({ name, text: stripSqlComments(readFileSync(join(sqlDir, name), 'utf8')) }))

// يلتقط: اسم الدالة، الترويسة (RETURNS/LANGUAGE/SECURITY... حتى AS $tag$)، والجسم بين علامتي $tag$
const FN_RE = /create\s+or\s+replace\s+function\s+public\.(\w+)\s*\([\s\S]*?\)\s*([\s\S]*?)\bas\s+\$(\w*)\$([\s\S]*?)\$\3\$/gi
const HEADER_COUNT_RE = /create\s+or\s+replace\s+function\s+public\.\w+\s*\(/gi

const functions = [] // { name, header, body, file }
let headerCount = 0
for (const file of sqlFiles) {
  headerCount += (file.text.match(HEADER_COUNT_RE) || []).length
  for (const m of file.text.matchAll(FN_RE)) {
    functions.push({ name: m[1], header: m[2], body: m[4], file: file.name })
  }
}

describe('المُحلِّل يلتقط كل تعريفات الدوال في sql/ بلا فقدان صامت', () => {
  it('عدد الدوال المُلتقَطة = عدد ترويسات create or replace function public.*', () => {
    expect(functions.length).toBe(headerCount)
  })
  it('شبكة أمان: يوجد عدد معقول من الدوال (لو صفر فالمُحلِّل نفسه معطوب)', () => {
    expect(functions.length).toBeGreaterThan(20)
  })
})

// ————————————————————————————————————————————————————————————————————————
// GUARD-SQL-001 — دوال SECURITY DEFINER في رحلة الطلب يجب أن تتحقّق من order_access_token
// أو تكون في قائمة استثناء صريحة مُبرَّرة هنا (يمنع تكرار SEC-003).
// النطاق مقصود: دوال رحلة الطلب المعروفة فقط (هذا التدقيق) — وليس مسحاً لكل sql/ (سيلتقط دوالاً
// من أنظمة أخرى — تقييمات/ولاء/إدارة — لم تُدقَّق هنا ولها معايير خاصة بها).
// ————————————————————————————————————————————————————————————————————————
const ORDER_JOURNEY_FN_NAMES = new Set([
  'create_order',
  'create_order_from_table_qr',
  'cancel_order_by_customer',
  'get_orders_status',
  'get_orders_status_secure',
  'can_read_order_status',
])

const ALLOWLIST_001 = {
  create_order: 'تُنشئ order_access_token جديداً — لا تتحقق من رمز قائم مسبقاً',
  create_order_from_table_qr: 'تفوّض التحقّق بالكامل لِـ create_order التي تستدعيها داخلياً',
  get_orders_status: 'GAP-SEC-003 موثَّق عمداً (sql/order_status_reads.sql) — مسار احتياطي مؤقت '
    + 'لطلبات محفوظة محلياً بلا رمز من قبل PHASE 6؛ تُسحب صلاحية anon عنها في TASK-SEC-003 لاحقاً',
}

// دالة قد تظهر بأكثر من تعريف عبر ملفات متعددة (سجل هجرات تراكمي — كل ملف نسخة زمنية، لا حالة
// نهائية واحدة). نفحص كل تعريف موجود فعلاً؛ الاستثناء (حين موجود) بالاسم لا بالمحتوى فلا يتأثر بالتكرار.
const orderJourneySecurityDefinerFns = functions.filter((f) =>
  ORDER_JOURNEY_FN_NAMES.has(f.name) && /security\s+definer/i.test(f.header),
)

describe('GUARD-SQL-001 — SECURITY DEFINER في رحلة الطلب ⇒ تتحقّق من order_access_token أو مُستثناة صراحة', () => {
  it('كل دوال رحلة الطلب المعروفة عُثر عليها في sql/ (شبكة أمان على المُحلِّل والنطاق)', () => {
    const distinctNames = new Set(orderJourneySecurityDefinerFns.map((f) => f.name))
    expect(distinctNames).toEqual(ORDER_JOURNEY_FN_NAMES)
  })
  it.each(orderJourneySecurityDefinerFns.map((f) => [`${f.name} (${f.file})`, f]))('%s', (_label, fn) => {
    const checksToken = /order_access_token/i.test(fn.body)
    const excused = ALLOWLIST_001[fn.name]
    expect(
      checksToken || Boolean(excused),
      `الدالة ${fn.name} في ${fn.file} لا تتحقّق من order_access_token ولا هي في قائمة الاستثناء — قد تكرر SEC-003!`,
    ).toBe(true)
  })
})

// ————————————————————————————————————————————————————————————————————————
// GUARD-SQL-002 — لا سياسة RLS في sql/ تمنح INSERT/UPDATE/DELETE على orders لـ anon أو PUBLIC
// (يمنع تكرار B3/SEC-001/SEC-002).
// ————————————————————————————————————————————————————————————————————————
const POLICY_RE = /create\s+policy\s+(\w+)\s+on\s+public\.orders\s+(?:as\s+\w+\s+)?for\s+(\w+)\s+to\s+([\w,\s]+?)(?:\s+using|\s+with|\s*;|\s*$)/gi

// سياسات أُنشئت في migration تاريخي ثم أُسقطت لاحقاً فعلياً على الإنتاج — التاريخ محفوظ في sql/
// عمداً (كلا الملفين يوثّق حقيقة ما حدث)، وهنا فقط استثناء صريح مُبرَّر بدل حذف السجل التاريخي.
const SUPERSEDED_POLICIES = {
  orders_insert_public: 'أُنشئت في table_qr_system.sql، أُسقطت لاحقاً في PHASE 1 — sql/order_journey_hotfix.sql (MIG-004/TASK-SEC-002)',
}

describe('GUARD-SQL-002 — لا سياسة كتابة مفتوحة فعّالة لـ anon/PUBLIC على orders في sql/', () => {
  const offenders = []
  for (const file of sqlFiles) {
    for (const m of file.text.matchAll(POLICY_RE)) {
      const name = m[1]
      const cmd = m[2].toUpperCase()
      const roles = m[3].split(',').map((r) => r.trim().toLowerCase())
      const isOpenWrite = ['INSERT', 'UPDATE', 'DELETE', 'ALL'].includes(cmd) && roles.some((r) => r === 'anon' || r === 'public')
      if (isOpenWrite && !SUPERSEDED_POLICIES[name]) {
        offenders.push({ file: file.name, name, cmd, roles })
      }
    }
  }
  it('صفر سياسات مخالفة فعّالة', () => {
    expect(offenders, `سياسات مخالفة: ${JSON.stringify(offenders)}`).toEqual([])
  })
})

// ————————————————————————————————————————————————————————————————————————
// GUARD-SQL-003 — كل استدعاء realtime.* في sql/ لدالة موجودة فعلياً في مخطّط realtime
// (يمنع تكرار B2 — realtime.broadcast غير موجودة).
// ————————————————————————————————————————————————————————————————————————
const ALLOWED_REALTIME_FNS = new Set(['send', 'send_binary', 'broadcast_changes', 'topic'])
const REALTIME_CALL_RE = /realtime\.(\w+)\s*\(/g

const realtimeCalls = []
for (const file of sqlFiles) {
  for (const m of file.text.matchAll(REALTIME_CALL_RE)) {
    realtimeCalls.push({ file: file.name, fn: m[1] })
  }
}

describe('GUARD-SQL-003 — كل استدعاء realtime.* في sql/ ضمن الدوال الموجودة فعلياً', () => {
  it('عُثر على استدعاءات realtime.* لفحصها (شبكة أمان على المُحلِّل)', () => {
    expect(realtimeCalls.length).toBeGreaterThan(0)
  })
  it.each(realtimeCalls.map((c) => [`realtime.${c.fn} (${c.file})`, c]))('%s', (_label, c) => {
    expect(ALLOWED_REALTIME_FNS.has(c.fn), `realtime.${c.fn} في ${c.file} غير موجودة في مخطّط realtime — كررت B2!`).toBe(true)
  })
})

// ————————————————————————————————————————————————————————————————————————
// GUARD-SQL-004 — كل RPC في رحلة الطلب يستدعيها الكود له ملف SQL مقابل (يمنع تكرار B1 وانحراف الـContract).
// النطاق: دوال رحلة الطلب فقط (هذا التدقيق) — قائمة يدوية مُراجَعة، وليست مسحاً تلقائياً لكل الكود.
// ————————————————————————————————————————————————————————————————————————
describe('GUARD-SQL-004 — كل RPC في رحلة الطلب معرَّفة فعلياً في sql/', () => {
  const definedNames = new Set(functions.map((f) => f.name))
  it.each([...ORDER_JOURNEY_FN_NAMES, 'resolve_table_qr'].map((n) => [n]))('%s', (name) => {
    expect(
      definedNames.has(name),
      `لا يوجد "CREATE OR REPLACE FUNCTION public.${name}" في أي ملف sql/ — انحراف بين الكود وقاعدة البيانات (R-05)!`,
    ).toBe(true)
  })
})

// ————————————————————————————————————————————————————————————————————————
// GUARD-STM-001 — أزرار "تقديم الحالة" في Orders.jsx (ثابت STATUS) تطابق مصفوفة الانتقالات
// المفروضة قاعدياً في sql/order_state_machine.sql (PHASE 5 — يمنع انحراف آلة الحالة).
// ————————————————————————————————————————————————————————————————————————
const ordersJsxText = readFileSync(join(sqlDir, '..', 'src', 'pages', 'Orders.jsx'), 'utf8')
const STATUS_BLOCK_RE = /const STATUS = \{([\s\S]*?)\n\}/
const statusBlockMatch = STATUS_BLOCK_RE.exec(ordersJsxText)
const STATUS_ENTRY_RE = /(\w+):\s*\{[^}]*\}/g
const uiForwardTransitions = []
if (statusBlockMatch) {
  for (const m of statusBlockMatch[1].matchAll(STATUS_ENTRY_RE)) {
    const nextMatch = /next:\s*(?:'(\w+)'|null)/.exec(m[0])
    if (nextMatch?.[1]) uiForwardTransitions.push([m[1], nextMatch[1]])
  }
}

const stateMachineFile = sqlFiles.find((f) => f.name === 'order_state_machine.sql')
const TUPLE_RE = /\(\s*'(\w+)'\s*,\s*'(\w+)'\s*\)/g
const smAllowedPairs = new Set()
if (stateMachineFile) {
  for (const m of stateMachineFile.text.matchAll(TUPLE_RE)) {
    smAllowedPairs.add(`${m[1]}->${m[2]}`)
  }
}

describe('GUARD-STM-001 — أزرار "تقديم الحالة" في Orders.jsx تطابق مصفوفة enforce_order_transition', () => {
  it('sql/order_state_machine.sql موجود وثابت STATUS في Orders.jsx مُلتقَط (شبكة أمان على المُحلِّل)', () => {
    expect(stateMachineFile, 'sql/order_state_machine.sql غير موجود — PHASE 5 لم تُنفَّذ بعد؟').toBeTruthy()
    expect(uiForwardTransitions.length, 'لم يُلتقَط أي انتقال من ثابت STATUS في Orders.jsx').toBeGreaterThan(0)
  })
  it.each(uiForwardTransitions.map(([from, to]) => [`${from} -> ${to}`, from, to]))('%s', (_label, from, to) => {
    expect(
      smAllowedPairs.has(`${from}->${to}`),
      `الانتقال ${from}->${to} في ثابت STATUS بـOrders.jsx غير موجود في مصفوفة enforce_order_transition — زرّ "تقديم الحالة" سيُرفَض خادمياً!`,
    ).toBe(true)
  })
})
