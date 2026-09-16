-- Phase 1 Security Hardening — defense-in-depth
--
-- Supabase's own security advisor (function_search_path_mutable, WARN)
-- flagged these 3 functions for having no SET search_path, the standard
-- best-practice pin for SECURITY DEFINER / trigger functions that avoids
-- any theoretical schema-shadowing risk. Practical exploitability here is
-- low (handle_new_user already schema-qualifies its one write as
-- public.profiles; the other two touch no schema-ambiguous objects at all
-- — just NEW.updated_at = now()), but pinning is zero-risk and closes the
-- advisory. Bodies are otherwise byte-for-byte unchanged.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;
