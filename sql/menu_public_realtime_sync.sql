-- يجعل بيانات المنيو العامة المنشورة قابلة للتحديث الفوري في العملاء المفتوحين.
-- الأقسام والمنتجات كانت منشورة بالفعل؛ هذا السكربت يضيف الجداول المكملة بصورة idempotent.
DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['restaurants', 'branches', 'banners', 'coupons']
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = target_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', target_table);
    END IF;
  END LOOP;
END
$$;
