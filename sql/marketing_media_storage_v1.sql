begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marketing-media', 'marketing-media', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists marketing_media_public_read on storage.objects;
create policy marketing_media_public_read on storage.objects
for select to anon, authenticated
using (bucket_id = 'marketing-media');

drop policy if exists marketing_media_admin_insert on storage.objects;
create policy marketing_media_admin_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'marketing-media' and public.is_platform_admin());

drop policy if exists marketing_media_admin_update on storage.objects;
create policy marketing_media_admin_update on storage.objects
for update to authenticated
using (bucket_id = 'marketing-media' and public.is_platform_admin())
with check (bucket_id = 'marketing-media' and public.is_platform_admin());

drop policy if exists marketing_media_admin_delete on storage.objects;
create policy marketing_media_admin_delete on storage.objects
for delete to authenticated
using (bucket_id = 'marketing-media' and public.is_platform_admin());

commit;
