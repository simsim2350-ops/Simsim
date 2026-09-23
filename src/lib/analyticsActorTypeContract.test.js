import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SQL_DIR = resolve(process.cwd(), 'sql')

// الملفات "الحيّة" فعلياً — أحدث نسخة مُطبَّقة على القاعدة لكل دالة تستدعي emit_event().
// migrations تاريخية سابقة (مثل menu_ready_activation_v1.sql وphase1_owner_activation_measurement.sql)
// تبقى بلا تعديل عمداً (لا إعادة كتابة تاريخ) لكنها **مُستبعَدة عمداً** من هذا الفحص لأن
// محتواها النصي لم يعد يعكس السلوك الحي — أحدث CREATE OR REPLACE يطغى عليها في القاعدة.
// عند إضافة إصلاح مستقبلي جديد لأي من هاتين الدالتين، حدّث هذه القائمة ليبقى الفحص دقيقاً.
const LIVE_ACTOR_TYPE_SOURCES = [
  'analytics_events.sql', // track_event() — النسخة الوحيدة، لم تُستبدَل قط
  'owner_activation_actor_type_contract_fix.sql', // track_owner_event()/track_registration_event() — الأحدث
]

// يزيل أسطر التعليقات (-- ...) — تعليقات التوثيق قد تذكر أسماء دوال/قيماً حرفية
// كمثال نصي، فلا يصح تحليلها كأنها كود فعلي.
function stripSqlComments(src) {
  return src
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n')
}

// يقسّم نص وسائط استدعاء دالة على الفواصل من المستوى الأعلى فقط (يتجاهل الفواصل
// داخل أقواس متداخلة مثل coalesce(a, b) أو داخل نصوص مقتبَسة) — تقسيم بسيط بالفاصلة
// وحدها يُخطئ هنا لأن بعض الوسائط نفسها استدعاءات دوال متداخلة.
function splitTopLevelArgs(argsText) {
  const args = []
  let depth = 0
  let inQuote = false
  let current = ''
  for (const ch of argsText) {
    if (ch === "'" ) inQuote = !inQuote
    if (!inQuote) {
      if (ch === '(') depth++
      if (ch === ')') depth--
    }
    if (ch === ',' && depth === 0 && !inQuote) {
      args.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) args.push(current.trim())
  return args
}

function extractAllowedActorTypes() {
  const src = stripSqlComments(readFileSync(resolve(SQL_DIR, 'analytics_events.sql'), 'utf8'))
  const m = src.match(/actor_type\s+text[^)]*check\s*\(actor_type\s+in\s*\(([^)]+)\)\)/i)
  if (!m) throw new Error('تعذّر استخراج قيد actor_type من analytics_events.sql — راجع الـRegex يدوياً')
  return new Set(m[1].split(',').map(s => s.trim().replace(/'/g, '')))
}

function extractUsedActorTypes() {
  const used = new Map() // actor_type -> [files]
  for (const file of LIVE_ACTOR_TYPE_SOURCES) {
    const src = stripSqlComments(readFileSync(resolve(SQL_DIR, file), 'utf8'))
    // يُحدِّد بداية كل استدعاء فعلي (perform/select [public.]emit_event() — لا مجرد
    // ذِكر الاسم)، ثم يمسح للأمام بتتبّع عمق الأقواس حتى القوس المطابق للإغلاق —
    // أدق من "ابحث عن أول );" الذي قد يقف عند قوس داخلي أو نص غير مرتبط بالمرة.
    const startRe = /(?:perform|select)\s+(?:public\.)?emit_event\(/g
    let sm
    while ((sm = startRe.exec(src))) {
      const openIdx = sm.index + sm[0].length - 1 // موضع القوس الفاتح نفسه
      let depth = 0
      let inQuote = false
      let i = openIdx
      for (; i < src.length; i++) {
        const ch = src[i]
        if (ch === "'") inQuote = !inQuote
        if (!inQuote) {
          if (ch === '(') depth++
          if (ch === ')') { depth--; if (depth === 0) break }
        }
      }
      const argsText = src.slice(openIdx + 1, i)
      const args = splitTopLevelArgs(argsText)
      const fifthArg = args[4]
      const literal = fifthArg?.match(/^'([a-z_]+)'$/)
      if (literal) {
        const list = used.get(literal[1]) || []
        list.push(file)
        used.set(literal[1], list)
      }
    }
  }
  return used
}

describe('Analytics actor_type contract (يمنع تكرار عطل restaurant_owner/prospect)', () => {
  it('constraint analytics_events.actor_type يحتوي القيم الخمس المعتمَدة في ADR-42', () => {
    const allowed = extractAllowedActorTypes()
    expect(allowed).toEqual(new Set(['system', 'owner', 'staff', 'customer', 'anon']))
  })

  it('كل actor_type يُستخدَم فعلياً في الملفات الحيّة يجب أن يكون ضمن قيد analytics_events', () => {
    const allowed = extractAllowedActorTypes()
    const used = extractUsedActorTypes()
    expect(used.size).toBeGreaterThan(0) // تأكيد أن الاستخراج نفسه يعمل ولم يُرجع فارغاً صامتاً

    const violations = [...used.entries()].filter(([value]) => !allowed.has(value))
    if (violations.length > 0) {
      const detail = violations.map(([v, files]) => `'${v}' (في: ${files.join(', ')})`).join(' | ')
      throw new Error(
        `قيم actor_type غير مدعومة من القيد: ${detail}. ` +
        `أضِفها لقيد analytics_events.sql أو صحِّح الاستدعاء قبل الدمج.`,
      )
    }
    expect(violations).toEqual([])
  })

  it('القيمتان الخاطئتان التاريخيتان (restaurant_owner/prospect) غائبتان عن كود الملفات الحيّة (بمعزل عن تعليقات التوثيق)', () => {
    for (const file of LIVE_ACTOR_TYPE_SOURCES) {
      const src = stripSqlComments(readFileSync(resolve(SQL_DIR, file), 'utf8'))
      expect(src).not.toContain('restaurant_owner')
      expect(src).not.toMatch(/'prospect'/)
    }
  })
})
