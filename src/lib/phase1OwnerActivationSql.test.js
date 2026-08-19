import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sql = readFileSync(resolve(process.cwd(), 'sql/phase1_owner_activation_measurement.sql'), 'utf8')

describe('Phase 1 owner activation SQL contract', () => {
  it('يمرر branch_id وdedupe_key إلى track_owner_event ثم emit_event', () => {
    expect(sql).toContain('p_branch_id uuid default null')
    expect(sql).toContain('p_dedupe_key text default null')
    expect(sql).toContain("nullif(left(btrim(coalesce(p_dedupe_key, '')), 240), '')")
    expect(sql).toContain("v_scope, p_event_type, p_restaurant_id, p_branch_id, 'restaurant_owner'")
  })

  it('يرفض restaurant_id لا يملكه المستخدم قبل إدخال الحدث', () => {
    expect(sql).toContain('where r.id = p_restaurant_id and r.owner_id = auth.uid()')
    expect(sql).toContain('if v_scope = \'restaurant\' and p_restaurant_id is null then return; end if;')
  })

  it('يرفض branch_id غير المرتبط بالمطعم المحدد', () => {
    expect(sql).toContain('where b.id = p_branch_id and b.restaurant_id = p_restaurant_id')
  })

  it('يبقي الدوال الحساسة security definer ويحرس Funnel الإداري', () => {
    expect(sql).toMatch(/create function public\.track_owner_event[\s\S]*?security definer/)
    expect(sql).toMatch(/create or replace function public\.admin_owner_activation_funnel[\s\S]*?if not public\.is_platform_admin\(\) then/)
  })

  it('يعيد Funnel جميع أعمدة Phase 1 المطلوبة ويربط registration_started بالجلسة ذاتها', () => {
    for (const column of [
      'registration_started_at',
      'registration_completed_at',
      'restaurant_created_at',
      'first_category_at',
      'first_product_at',
      'minimum_ready_at',
      'first_share_at',
      'activated_at',
      'first_share_event',
    ]) expect(sql).toContain(column)

    expect(sql).toContain('e.session_id = completed.session_id')
  })
})
