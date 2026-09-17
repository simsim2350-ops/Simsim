// حرّاس آليون لمرحلة Phase 2 من تصليب صلاحيات PostgreSQL — فحص ثابت (Offline)
// لثلاثة ملفات migration محدَّدة، بنفس تقنية orderJourneyGuards.test.js/
// reviewsExecutePrivilegeGuard.test.js القائمَين. الهدف: التأكد أن كل
// migration تسحب EXECUTE عن PUBLIC فقط — من الدوال الثمانية المؤكَّدة في
// SIMSIM_PUBLIC_EXECUTE_REMEDIATION_PRECHECK_REPORT.md — بلا أي أثر جانبي
// (لا GRANT، لا blanket revoke، لا لمس لـanon/authenticated/service_role،
// لا إعادة تعريف لأي دالة).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const sqlDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'sql')

function stripSqlComments(text) {
  return text.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
}

function loadRaw(name) {
  try {
    return readFileSync(join(sqlDir, name), 'utf8')
  } catch {
    return ''
  }
}

// كل migration وأهدافها الدقيقة (اسم + توقيع كامل) — مطابقة حرفيًا لِما في
// SIMSIM_PUBLIC_EXECUTE_REMEDIATION_PRECHECK_REPORT.md
const MIGRATIONS = [
  {
    file: 'phase2_public_execute_hardening_capability.sql',
    label: 'Group A — Capability',
    targets: [
      { name: 'has_feature', signature: 'has_feature(uuid, text)' },
      { name: 'menu_branding', signature: 'menu_branding(uuid)' },
    ],
  },
  {
    file: 'phase2_public_execute_hardening_print_agent.sql',
    label: 'Group B — Print Agent',
    targets: [
      { name: 'claim_next_print_job', signature: 'claim_next_print_job(uuid, uuid, integer, integer)' },
    ],
  },
  {
    file: 'phase2_public_execute_hardening_analytics_cron.sql',
    label: 'Group C — Internal Analytics / Cron',
    targets: [
      { name: '_sub_mrr', signature: '_sub_mrr(numeric, text, text)' },
      { name: 'refresh_analytics_rollups', signature: 'refresh_analytics_rollups()' },
      { name: 'refresh_platform_daily_metrics', signature: 'refresh_platform_daily_metrics()' },
      { name: 'refresh_platform_metrics', signature: 'refresh_platform_metrics()' },
      { name: 'refresh_restaurant_stats', signature: 'refresh_restaurant_stats()' },
    ],
  },
]

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

for (const mig of MIGRATIONS) {
  describe(`GUARD-SQL-PUBLIC-EXECUTE — ${mig.label} (${mig.file})`, () => {
    const raw = loadRaw(mig.file)
    const text = stripSqlComments(raw)

    it('1. migration موجودة', () => {
      expect(raw.length, `${mig.file} غير موجود في sql/`).toBeGreaterThan(0)
    })

    it('2. تحتوي على REVOKE EXECUTE', () => {
      expect(text).toMatch(/revoke\s+execute\s+on\s+function/i)
    })

    it('4. تستخدم FROM PUBLIC في كل عبارة', () => {
      const statements = text.split(';').map((s) => s.trim()).filter(Boolean)
      expect(statements.length).toBeGreaterThan(0)
      for (const s of statements) {
        expect(s, `عبارة بلا "from public": ${s}`).toMatch(/from\s+public\s*$/i)
      }
    })

    it('5. لا تحتوي على GRANT إطلاقًا', () => {
      expect(text).not.toMatch(/\bgrant\b/i)
    })

    it('6. لا تعدّل أي function body — لا CREATE/ALTER FUNCTION في الملف', () => {
      expect(text).not.toMatch(/create\s+(or\s+replace\s+)?function/i)
      expect(text).not.toMatch(/alter\s+function/i)
    })

    it('7. لا يوجد blanket revoke (ALL FUNCTIONS IN SCHEMA)', () => {
      expect(text).not.toMatch(/all\s+functions\s+in\s+schema/i)
      expect(text).not.toMatch(/revoke\s+execute\s+on\s+all\b/i)
    })

    it('8/9/10. لا تُزيل EXECUTE عن anon/authenticated/service_role', () => {
      const revokeMatches = [...text.matchAll(/revoke\s+execute\s+on\s+function\s+[^;]*?\bfrom\s+([^;]+);/gi)]
      expect(revokeMatches.length).toBeGreaterThan(0)
      for (const m of revokeMatches) {
        const fromList = m[1].toLowerCase()
        expect(fromList, `revoke غير مقصود على anon: ${m[0]}`).not.toMatch(/\banon\b/)
        expect(fromList, `revoke غير مقصود على authenticated: ${m[0]}`).not.toMatch(/\bauthenticated\b/)
        expect(fromList, `revoke غير مقصود على service_role: ${m[0]}`).not.toMatch(/\bservice_role\b/)
      }
    })

    it(`3. عدد العبارات = عدد الدوال المستهدَفة بالضبط (${mig.targets.length})`, () => {
      const statements = text.split(';').map((s) => s.trim()).filter(Boolean)
      expect(statements.length).toBe(mig.targets.length)
    })

    for (const target of mig.targets) {
      it(`تستهدف ${target.signature} بالتوقيع الكامل الدقيق`, () => {
        const re = new RegExp(
          `revoke\\s+execute\\s+on\\s+function\\s+public\\.${escapeRe(target.signature)}\\s+from\\s+public`,
          'i',
        )
        expect(text, `لم يُعثَر على عبارة revoke دقيقة لـ${target.signature}`).toMatch(re)
      })
    }
  })
}
