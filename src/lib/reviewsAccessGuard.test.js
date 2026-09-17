// حرّاس آليون لدالة submit_review (تقديم التقييمات) — فحص ثابت (Offline) لملفات sql/،
// على نمط orderJourneyGuards.test.js القائم (نفس تقنية التحليل النصي المباشر، مستودع منفصل لأن
// دوال التقييمات مستثناة صراحة من نطاق ذلك الملف — انظر تعليقه الخاص بـALLOWLIST_001).
//
// الهدف: منع تكرار الثغرة المكتشفة في SIMSIM_PR415_MENU_NEXT_AND_MIGRATION_VERIFICATION_REPORT.md
// (Finding 1) — كان فحص order_access_token في submit_review اختيارياً
// (`if p_access_token is not null and (...)`), فأي مستدعٍ يُرسل access_token = null كان يتجاوز
// التحقق من الملكية بالكامل. أُصلحت في sql/phase2_order_integrity_submit_review_access_token_enforce.sql.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const sqlDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'sql')

function stripSqlComments(text) {
  return text.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
}

const sqlFiles = readdirSync(sqlDir)
  .filter((f) => f.endsWith('.sql'))
  .map((name) => ({ name, text: stripSqlComments(readFileSync(join(sqlDir, name), 'utf8')) }))

const FN_RE = /create\s+or\s+replace\s+function\s+public\.(\w+)\s*\([\s\S]*?\)\s*([\s\S]*?)\bas\s+\$(\w*)\$([\s\S]*?)\$\3\$/gi

// النسخة الحيّة الفعلية (الأحدث زمنياً) — وليس أي من التعريفات التاريخية الأقدم في submit_review.sql
// أو phase2_order_integrity_submit_review_access_token.sql (كلاهما مُبقيان عمداً كسجل تاريخي دقيق
// لما نُفِّذ فعلاً على production، لا تُعدَّل، ولا يُفترض أن يستوفيا هذا الحارس).
const LIVE_FILE = 'phase2_order_integrity_submit_review_access_token_enforce.sql'

describe('GUARD-SQL-005 — submit_review (النسخة الحيّة) تُلزم access_token ولا تقبل تجاوزه بـNULL', () => {
  const liveFile = sqlFiles.find((f) => f.name === LIVE_FILE)

  it(`الملف الحيّ ${LIVE_FILE} موجود (شبكة أمان على المُحلِّل والنطاق)`, () => {
    expect(liveFile, `${LIVE_FILE} غير موجود في sql/ — هل أُعيدت تسمية الإصلاح؟`).toBeTruthy()
  })

  const submitReviewDefs = liveFile
    ? [...liveFile.text.matchAll(FN_RE)].filter((m) => m[1] === 'submit_review')
    : []

  it('توجد بالضبط نسخة واحدة من submit_review في الملف الحيّ', () => {
    expect(submitReviewDefs.length).toBe(1)
  })

  const body = submitReviewDefs[0]?.[4] ?? ''

  it('SECURITY DEFINER محفوظة (بدون هذا، منطق الوصول للجدول يتغيّر بالكامل)', () => {
    expect(submitReviewDefs[0]?.[2] ?? '').toMatch(/security\s+definer/i)
  })

  it('الثغرة القديمة (فحص التوكن مشروط بوجوده) غير موجودة في الجسم الحيّ', () => {
    // النمط القديم بالضبط: `if p_access_token is not null and (`
    expect(body).not.toMatch(/if\s+p_access_token\s+is\s+not\s+null\s+and/i)
  })

  it('توكن NULL يُرفَض صراحةً قبل أي فحص آخر متعلق بالتوكن', () => {
    // يقبل أي صياغة تربط "p_access_token is null" بـraise exception خلال مسافة معقولة
    expect(body).toMatch(/p_access_token\s+is\s+null[\s\S]{0,120}raise\s+exception/i)
  })

  it('توكن فارغ/بياض فقط (empty/whitespace) يُرفَض أيضاً — ليس NULL فقط', () => {
    // btrim(p_access_token) = '' (أو ما يعادلها) ضمن نفس كتلة الرفض
    expect(body).toMatch(/btrim\s*\(\s*p_access_token\s*\)\s*=\s*''/i)
  })

  it('توكن خاطئ (لا يطابق order_access_token المخزَّن) لا يزال يُرفَض — نفس الحماية القديمة محفوظة', () => {
    expect(body).toMatch(/v_order\.order_access_token\s+is\s+null\s+or\s+v_order\.order_access_token\s*<>\s*p_access_token/i)
  })

  it('كل حالات الرفض الثلاث (null/فارغ/خاطئ) تستخدم نفس رسالة order_access_denied — لا تسريب لسبب الرفض', () => {
    const denials = [...body.matchAll(/raise\s+exception\s+'([\w_]+)'/gi)].map((m) => m[1])
    const accessDenialCount = denials.filter((d) => d === 'order_access_denied').length
    expect(accessDenialCount, `رسائل الرفض الموجودة فعلياً: ${JSON.stringify(denials)}`).toBe(2)
  })

  it('طلب غير موجود لا يزال يُرفَض (order_not_found) — سلوك غير متأثر بهذا الإصلاح', () => {
    expect(body).toMatch(/if\s+not\s+found\s+then\s+raise\s+exception\s+'order_not_found'/i)
  })

  it('طلب غير مكتمل لا يزال يُرفَض (order_not_completed) — سلوك غير متأثر بهذا الإصلاح', () => {
    expect(body).toMatch(/v_order\.status\s*<>\s*'completed'[\s\S]{0,40}raise\s+exception\s+'order_not_completed'/i)
  })

  it('طلب سبق تقييمه لا يزال يُرفَض (already_reviewed) — سلوك غير متأثر بهذا الإصلاح', () => {
    expect(body).toMatch(/raise\s+exception\s+'already_reviewed'/i)
  })

  it('فحص التوكن يسبق فحص الحالة/التكرار (لا يُكشَف أي شيء عن الطلب قبل إثبات الملكية)', () => {
    const tokenCheckIdx = body.search(/p_access_token\s+is\s+null/i)
    const statusCheckIdx = body.search(/v_order\.status\s*<>\s*'completed'/i)
    const dupCheckIdx = body.search(/already_reviewed/i)
    expect(tokenCheckIdx).toBeGreaterThan(-1)
    expect(tokenCheckIdx).toBeLessThan(statusCheckIdx)
    expect(tokenCheckIdx).toBeLessThan(dupCheckIdx)
  })

  it('SET search_path محفوظة (دفاع في العمق لدالة DEFINER — لم يمسّها هذا الإصلاح)', () => {
    expect(submitReviewDefs[0]?.[2] ?? '').toMatch(/set\s+search_path\s+to\s+'public'/i)
  })

  it('فحص rating (1-5) لا يزال موجودًا وغير متأثر — سلوك غير متعلق بالتفويض', () => {
    expect(body).toMatch(/p_rating\s+is\s+null\s+or\s+p_rating\s*<\s*1\s+or\s+p_rating\s*>\s*5[\s\S]{0,40}raise\s+exception\s+'invalid_rating'/i)
  })

  it('معالجة التعليق (trim + تحويل الفارغ إلى NULL) محفوظة حرفيًا — لم يتغيّر', () => {
    expect(body).toMatch(/nullif\s*\(\s*btrim\s*\(\s*coalesce\s*\(\s*p_comment\s*,\s*''\s*\)\s*\)\s*,\s*''\s*\)/i)
  })

  it('لا اعتماد على Supabase Auth (auth.uid()/auth.jwt) — يبقى العميل مجهولًا، التفويض عبر التوكن فقط', () => {
    expect(body).not.toMatch(/auth\.(uid|jwt|role)\s*\(/i)
  })

  it('لا عبارات GRANT/REVOKE في ملف الإصلاح — الصلاحيات (anon/authenticated) لم تُمَس هنا', () => {
    expect(liveFile.text).not.toMatch(/\b(grant|revoke)\b/i)
  })
})

// ————————————————————————————————————————————————————————————————————————
// GUARD-SQL-006 — الحماية من التقييم المكرر تبقى مزدوجة (application-level check
// + قيد فريد على مستوى القاعدة) — لا يجوز أن يزيل هذا الإصلاح أياً منهما.
// ————————————————————————————————————————————————————————————————————————
describe('GUARD-SQL-006 — حماية uq_reviews_order_id (defense-in-depth) لا تزال موجودة في sql/', () => {
  const hasUniqueIndex = sqlFiles.some((f) =>
    /create\s+unique\s+index\s+if\s+not\s+exists\s+uq_reviews_order_id\s+on\s+public\.reviews\s*\(order_id\)/i.test(f.text),
  )
  it('uq_reviews_order_id معرَّف في sql/ (قيد فريد على مستوى القاعدة، مستقل عن منطق submit_review)', () => {
    expect(hasUniqueIndex).toBe(true)
  })
})
