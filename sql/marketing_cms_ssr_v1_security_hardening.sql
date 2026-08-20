begin;

revoke all on function public.marketing_set_updated_at() from public, anon, authenticated;
revoke all on function public.marketing_write_audit() from public, anon, authenticated;

commit;
