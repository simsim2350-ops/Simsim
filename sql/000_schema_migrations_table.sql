-- ============================================================================
-- Migration Tracking Table — schema_migrations
-- ============================================================================
-- يُسجَّل فيه اسم كل ملف SQL طُبِّق على قاعدة البيانات.
-- الهدف: منع إعادة تطبيق ملفات سبق تنفيذها، وإتاحة فحص حالة المخطط.
--
-- ⚠️ Bootstrap Note: هذا الملف نفسه يجب أن يكون أول إدخال في الجدول بعد إنشائه.
--    بعد تنفيذه: INSERT INTO schema_migrations(filename) VALUES ('000_schema_migrations_table.sql');
--
-- يُنفَّذ مرة واحدة في Supabase SQL Editor (أو عبر Supabase CLI).
-- لا يُعدِّل أي جدول موجود — إضافي بالكامل.
-- ============================================================================

-- الجدول الرئيسي
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    TEXT        PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by  TEXT,
  notes       TEXT
);

COMMENT ON TABLE  public.schema_migrations IS 'Tracks which SQL migration files have been applied to this database. One row per file. Managed manually by the DBA.';
COMMENT ON COLUMN public.schema_migrations.filename   IS 'SQL file name (e.g. order_idempotency.sql) — matches the file name in sql/ directory.';
COMMENT ON COLUMN public.schema_migrations.applied_at IS 'UTC timestamp when the migration was applied.';
COMMENT ON COLUMN public.schema_migrations.applied_by IS 'Optional: identifier of the person or system that applied the migration.';
COMMENT ON COLUMN public.schema_migrations.notes      IS 'Optional: free-text notes about the migration run.';

-- ============================================================================
-- RLS — restricted: platform admins can read; no client writes allowed.
-- ============================================================================
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;

-- Platform admins can read the migration log.
CREATE POLICY "schema_migrations_platform_admin_read"
  ON public.schema_migrations
  FOR SELECT
  TO authenticated
  USING (is_platform_admin());

-- ============================================================================
-- Safe read function — allows the checkMigrationStatus script to read applied
-- migrations via the anon key without exposing the raw table via PostgREST.
-- Mirrors the pattern used by registry_drift_snapshot (ADR-40).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_applied_migrations()
RETURNS TABLE(filename TEXT, applied_at TIMESTAMPTZ)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT filename, applied_at
  FROM   public.schema_migrations
  ORDER  BY applied_at;
$$;

COMMENT ON FUNCTION public.get_applied_migrations() IS 'Returns the list of applied migrations. SECURITY DEFINER — safe for anon access (read-only, no sensitive data).';

GRANT EXECUTE ON FUNCTION public.get_applied_migrations() TO anon, authenticated;
