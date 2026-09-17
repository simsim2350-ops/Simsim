-- Phase 1 Security Hardening — confirmed risk fix
--
-- Problem (CONFIRMED): the restaurant-media storage bucket had no
-- file_size_limit and no allowed_mime_types (both null) — write access was
-- correctly restricted to the owning restaurant's own folder via RLS
-- (restaurant_media_owner_insert/update/delete, checking
-- storage.foldername(name)[1] against restaurants owned by auth.uid()),
-- but ANY file type/size could be uploaded by that owner directly via the
-- Supabase SDK/HTTP API — the size/type restriction that exists today
-- lives ONLY in the client (src/lib/uploadImage.js: file.type.startsWith
-- ('image/'), 5MB cap, always re-encoded to image/jpeg before upload — the
-- sole writer to this bucket in the whole codebase, verified by grep).
-- Trusting a client-side check for this is exactly the STEP 7 anti-pattern
-- this audit was asked to hunt for, applied to storage.
--
-- Fix: bucket-level enforcement matching EXACTLY what the sole legitimate
-- writer already always does. No legitimate current upload becomes
-- rejected by this change.

update storage.buckets
   set file_size_limit = 5242880,        -- 5MB, matches uploadImage.js's own MAX_FILE_SIZE_MB pre-compression check
       allowed_mime_types = array['image/jpeg']  -- uploadImage.js always re-encodes to image/jpeg before upload; no other writer exists
 where id = 'restaurant-media';
