// حرّاس آليون لـmigration تصليب صلاحيات submit_review — فحص ثابت (Offline) لملف sql/ محدَّد،
// على نفس نمط orderJourneyGuards.test.js/reviewsAccessGuard.test.js القائمَين. الهدف: التأكد
// أن migration إزالة EXECUTE عن PUBLIC لا تلمس أي شيء آخر (signature/body/SECURITY DEFINER/
// search_path/access-token enforcement/business logic) — نطاقها GRANT hygiene فقط.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const sqlDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'sql')
const FILE_NAME = 'phase2_order_integrity_submit_review_execute_hardening.sql'
const filePath = join(sqlDir, FILE_NAME)

function stripSqlComments(text) {
  return text.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
}

let rawText = ''
let text = ''
try {
  rawText = readFileSync(filePath, 'utf8')
  text = stripSqlComments(rawText)
} catch {
  rawText = ''
  text = ''
}

describe('GUARD-SQL-007 — submit_review EXECUTE privilege hardening migration', () => {
  it(`1. migration موجودة: ${FILE_NAME}`, () => {
    expect(rawText.length, `${FILE_NAME} غير موجود في sql/`).toBeGreaterThan(0)
  })

  it('2. تستخدم REVOKE EXECUTE ... FROM PUBLIC', () => {
    expect(text).toMatch(/revoke\s+execute\s+on\s+function\s+[\s\S]*?\bfrom\s+public\b/i)
  })

  it('3. تستهدف submit_review تحديدًا (بتوقيعها الحالي الكامل: uuid, integer, text, text)', () => {
    expect(text).toMatch(/revoke\s+execute\s+on\s+function\s+public\.submit_review\s*\(\s*uuid\s*,\s*integer\s*,\s*text\s*,\s*text\s*\)\s+from\s+public/i)
  })

  it('4. لا تعدّل function signature — لا CREATE/ALTER FUNCTION على submit_review في هذا الملف', () => {
    expect(text).not.toMatch(/create\s+(or\s+replace\s+)?function\s+public\.submit_review/i)
    expect(text).not.toMatch(/alter\s+function\s+public\.submit_review/i)
  })

  it('5. لا تعدّل function body — لا أي CREATE/ALTER FUNCTION إطلاقًا في هذا الملف', () => {
    expect(text).not.toMatch(/create\s+(or\s+replace\s+)?function/i)
    expect(text).not.toMatch(/alter\s+function/i)
  })

  it('6. لا تحذف access-token enforcement — لا يوجد جسم دالة في هذا الملف ليُحذَف منه شيء', () => {
    expect(text).not.toMatch(/p_access_token/i)
  })

  it('7. لا تحذف SECURITY DEFINER — لا يوجد تعريف دالة في هذا الملف إطلاقًا', () => {
    expect(text).not.toMatch(/security\s+definer/i)
    expect(text).not.toMatch(/security\s+invoker/i)
  })

  it('8. لا تغيّر search_path — لا يوجد SET search_path في هذا الملف', () => {
    expect(text).not.toMatch(/set\s+search_path/i)
  })

  it('9. لا تغيّر business logic — الملف بأكمله جملة REVOKE واحدة فقط (بعد إزالة التعليقات)', () => {
    const statements = text.split(';').map((s) => s.trim()).filter(Boolean)
    expect(statements.length, `عبارات SQL فعلية موجودة: ${JSON.stringify(statements)}`).toBe(1)
  })

  it('10. لا SQL هدّام غير متعلق بالمطلوب (DROP TABLE/DROP COLUMN/DELETE/TRUNCATE/UPDATE/INSERT)', () => {
    expect(text).not.toMatch(/drop\s+table/i)
    expect(text).not.toMatch(/drop\s+column/i)
    expect(text).not.toMatch(/\bdelete\s+from\b/i)
    expect(text).not.toMatch(/\btruncate\b/i)
    expect(text).not.toMatch(/\bupdate\s+\w+\s+set\b/i)
    expect(text).not.toMatch(/\binsert\s+into\b/i)
  })

  it('11. لا تُزيل EXECUTE عن anon/authenticated/service_role — الفعل مقصور على PUBLIC فقط', () => {
    // يتحقق أن أي REVOKE في الملف لا يذكر anon/authenticated/service_role ضمن قائمة "from"
    const revokeMatches = [...text.matchAll(/revoke\s+execute\s+on\s+function\s+[^;]*?\bfrom\s+([^;]+);/gi)]
    expect(revokeMatches.length).toBeGreaterThan(0)
    for (const m of revokeMatches) {
      const fromList = m[1].toLowerCase()
      expect(fromList).not.toMatch(/\banon\b/)
      expect(fromList).not.toMatch(/\bauthenticated\b/)
      expect(fromList).not.toMatch(/\bservice_role\b/)
    }
  })
})
