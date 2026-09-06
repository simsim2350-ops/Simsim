-- Read-only RPC for the branch-URL (no QR) table-dropdown flow. Exposes
-- ONLY {id, table_number} for a branch's own active tables — never
-- qr_token or any other restaurant_tables column, since restaurant_tables
-- itself is not anon-readable directly. Verifies the branch actually
-- belongs to the restaurant identified by the given slug, so a caller
-- cannot probe another restaurant's tables by mismatching slug/branch_id.
--
-- Applied live via Supabase migration on 2026-09-06. This file documents
-- that already-applied change for the repo, matching the existing
-- sql/table_qr_system.sql convention.
create or replace function public.get_branch_tables_for_menu(
  p_restaurant_slug text,
  p_branch_id uuid
)
returns table(id uuid, table_number text)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query
  select t.id, t.table_number
    from public.restaurant_tables t
    join public.branches b on b.id = t.branch_id
    join public.restaurants r on r.id = b.restaurant_id
   where t.branch_id = p_branch_id
     and r.slug = p_restaurant_slug
     and t.status = 'active'
   order by t.table_number;
end;
$function$;

revoke execute on function public.get_branch_tables_for_menu(text, uuid) from public;
grant execute on function public.get_branch_tables_for_menu(text, uuid) to anon, authenticated;
