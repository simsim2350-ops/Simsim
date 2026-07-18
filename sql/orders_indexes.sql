-- فهرس مركّب لتسريع استعلامات التقارير (restaurant_id + مدى created_at) — M0
-- تستفيد منه دوال M1 (get_customers_summary/get_analytics_summary/get_dashboard_summary)
-- وكل استعلام يفلتر بالمطعم ضمن نافذة زمنية. نُفِّذ في Supabase ✅
-- ملاحظة: على الجداول الكبيرة يُفضّل CREATE INDEX CONCURRENTLY (خارج معاملة) لتفادي القفل.
create index if not exists idx_orders_restaurant_created
  on public.orders (restaurant_id, created_at desc);
