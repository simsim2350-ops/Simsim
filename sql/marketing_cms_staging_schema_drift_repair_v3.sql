-- Marketing CMS — Staging schema drift repair v3
-- Scope: Staging only. Fixes the PostgreSQL regex bound in the Media registration
-- RPC that prevented valid paths from being registered after Storage upload.
-- Does not touch production objects or production data.

begin;

create or replace function public.admin_register_marketing_media(
  p_bucket text,
  p_object_path text,
  p_mime_type text,
  p_byte_size bigint,
  p_alt_text jsonb default '{}'::jsonb,
  p_caption jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_media public.marketing_media;
begin
  if not public.is_platform_admin() then
    raise exception 'platform admin required';
  end if;

  if p_bucket <> 'marketing-media' then
    raise exception 'unsupported media bucket';
  end if;

  -- PostgreSQL permits regex repetition bounds only through 255. Keep the
  -- 500-character policy as a normal length check and regex-check characters.
  if char_length(p_object_path) > 500
     or p_object_path !~ '^[a-z0-9][a-z0-9._/-]*$'
     or p_object_path like '%..%' then
    raise exception 'invalid object path';
  end if;

  if p_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml') then
    raise exception 'unsupported image type';
  end if;

  if p_byte_size is null or p_byte_size < 1 or p_byte_size > 10485760 then
    raise exception 'image size must be between 1 byte and 10 MB';
  end if;

  if jsonb_typeof(p_alt_text) <> 'object'
     or jsonb_typeof(p_caption) <> 'object'
     or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'media metadata fields must be objects';
  end if;

  insert into public.marketing_media (
    bucket, object_path, mime_type, byte_size, alt_text, caption, metadata, created_by, updated_by
  ) values (
    p_bucket, p_object_path, p_mime_type, p_byte_size, p_alt_text, p_caption, p_metadata, auth.uid(), auth.uid()
  )
  returning * into v_media;

  perform public.marketing_audit_event(
    'marketing.media_registered',
    'marketing_media',
    v_media.id,
    jsonb_build_object('bucket', p_bucket, 'object_path', p_object_path, 'mime_type', p_mime_type, 'byte_size', p_byte_size)
  );

  return jsonb_build_object(
    'id', v_media.id,
    'bucket', v_media.bucket,
    'objectPath', v_media.object_path,
    'mimeType', v_media.mime_type,
    'byteSize', v_media.byte_size,
    'width', v_media.width,
    'height', v_media.height,
    'altText', v_media.alt_text,
    'caption', v_media.caption,
    'metadata', v_media.metadata,
    'createdAt', v_media.created_at,
    'updatedAt', v_media.updated_at
  );
end;
$$;

notify pgrst, 'reload schema';

commit;
