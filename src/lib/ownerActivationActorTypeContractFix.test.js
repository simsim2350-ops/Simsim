import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// يختبر ملف الإصلاح الحي (الأحدث، الفعلي) — وليس sql/phase1_owner_activation_measurement.sql
// التاريخي. هذا هو الملف الذي يعكس السلوك الحقيقي المُطبَّق فعلياً على قاعدة البيانات.
const sql = readFileSync(
  resolve(process.cwd(), 'sql/owner_activation_actor_type_contract_fix.sql'),
  'utf8',
)

// يزيل أسطر التعليقات (-- ...) قبل فحص "غياب القيم القديمة" تحديداً — رأس هذا الملف
// نفسه يذكر 'restaurant_owner'/'prospect' عمداً كتوثيق للمشكلة التي يُصلِحها (توضيح
// مفيد للقارئ)، فلا يصح اعتبار ذلك انتهاكاً؛ المهم هو غيابهما من الكود الفعلي فقط.
const sqlCodeOnly = sql
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')

describe('Owner Activation actor_type contract fix — SQL', () => {
  it('يستخدم القيم المتوافقة مع ADR-42 (owner/anon) بدل القيم القديمة الخاطئة', () => {
    expect(sql).toContain("p_restaurant_id, p_branch_id, 'owner',")
    expect(sql).toContain("'platform', p_event_type, null, null, 'anon',")
  })

  it('لا يعيد إدخال القيمتين الخاطئتين القديمتين في الكود الفعلي (بمعزل عن تعليقات التوثيق)', () => {
    expect(sqlCodeOnly).not.toContain('restaurant_owner')
    expect(sqlCodeOnly).not.toContain("'prospect'")
  })

  it('يحافظ على نفس التوقيع بالضبط (لا DROP، لا تغيير معاملات)', () => {
    expect(sql).not.toMatch(/drop function/i)
    expect(sql).toContain(
      'create or replace function public.track_owner_event(\n  p_event_type text,\n  p_restaurant_id uuid default null,\n  p_branch_id uuid default null,\n  p_session_id text default null,\n  p_props jsonb default \'{}\'::jsonb,\n  p_dedupe_key text default null\n)',
    )
    expect(sql).toContain(
      'create or replace function public.track_registration_event(\n  p_event_type text,\n  p_session_id text,\n  p_props jsonb default \'{}\'::jsonb,\n  p_dedupe_key text default null\n)',
    )
  })

  it('يحافظ على SECURITY DEFINER وsearch_path لكلتا الدالتين', () => {
    const matches = [...sql.matchAll(/create or replace function public\.(track_owner_event|track_registration_event)\(([\s\S]*?)\n\$\$;/g)]
    expect(matches.length).toBe(2)
    for (const m of matches) {
      const body = m[0]
      expect(body).toMatch(/security definer/i)
      expect(body).toContain('set search_path = public')
    }
  })

  it('يحافظ على منطق التحقق من الملكية وdedupe الموجود بلا تغيير', () => {
    expect(sql).toContain('where r.id = p_restaurant_id and r.owner_id = auth.uid()')
    expect(sql).toContain('where b.id = p_branch_id and b.restaurant_id = p_restaurant_id')
    expect(sql).toContain("nullif(left(btrim(coalesce(p_dedupe_key, '')), 240), '')")
    expect(sql).toContain('exception when others then')
  })

  it('يحافظ على grants الحالية بلا صلاحيات جديدة', () => {
    expect(sql).toContain('revoke all on function public.track_owner_event(text, uuid, uuid, text, jsonb, text) from public;')
    expect(sql).toContain('grant execute on function public.track_owner_event(text, uuid, uuid, text, jsonb, text) to authenticated;')
    expect(sql).toContain('revoke all on function public.track_registration_event(text, text, jsonb, text) from public;')
    expect(sql).toContain('grant execute on function public.track_registration_event(text, text, jsonb, text) to anon, authenticated;')
  })
})
