-- SimSim Menu Ready Activation v3 — QR للطاولات وروابط slug التاريخية
-- يبقي verify token كما هو؛ يوسّع فقط قبول slug سابق يخص المطعم نفسه.

begin;

create or replace function public.resolve_table_qr(
  p_qr_token uuid,
  p_restaurant_slug text
)
returns table(
  table_id uuid,
  table_name text,
  restaurant_id uuid,
  branch_id uuid
)
language sql
security definer
set search_path = ''
as $function$
  select
    t.id,
    t.table_number,
    t.restaurant_id,
    t.branch_id
  from public.restaurant_tables t
  join public.restaurants r on r.id = t.restaurant_id
  join public.branches b on b.id = t.branch_id
  where t.qr_token = p_qr_token
    and t.qr_enabled = true
    and t.status = 'active'
    and (
      r.slug = lower(btrim(p_restaurant_slug))
      or exists (
        select 1
        from public.menu_slug_redirects h
        where h.restaurant_id = r.id
          and h.old_slug = lower(btrim(p_restaurant_slug))
      )
    )
    and r.is_active = true
    and coalesce(r.platform_suspended, false) = false
    and b.restaurant_id = t.restaurant_id
    and b.is_active = true
    and coalesce(b.is_paused, false) = false
    and coalesce(b.menu_clone_status, 'ready') = 'ready'
  limit 1;
$function$;

revoke execute on function public.resolve_table_qr(uuid, text) from public;
grant execute on function public.resolve_table_qr(uuid, text) to anon, authenticated;

commit;
