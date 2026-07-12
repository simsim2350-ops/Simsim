-- ربط قائمة اقتراحات السلة العامة (cart_wide_recommendations) بالفرع بدل المطعم كله
-- ⚠️ تُنفَّذ مرة واحدة في Supabase → SQL Editor، بعد نشر كود الواجهة المطابق

alter table public.cart_wide_recommendations add column if not exists branch_id uuid references public.branches(id) on delete cascade;

-- Backfill: كل صف موجود يُنسب لفرع مطعمه الأساسي
update public.cart_wide_recommendations cw set branch_id = b.id
  from public.branches b where b.restaurant_id = cw.restaurant_id and b.is_primary and cw.branch_id is null;

alter table public.cart_wide_recommendations alter column branch_id set not null;

create index if not exists idx_cart_wide_recommendations_branch on public.cart_wide_recommendations(branch_id);

-- القيد الفريد أصبح لكل فرع بدل المطعم كله (كل فرع منتجاته مستقلة بمعرّفات مستقلة أصلاً)
alter table public.cart_wide_recommendations drop constraint if exists cart_wide_recommendations_restaurant_id_product_id_key;
alter table public.cart_wide_recommendations add constraint cart_wide_recommendations_branch_product_key unique (branch_id, product_id);

notify pgrst, 'reload schema';
