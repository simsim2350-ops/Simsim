-- ============================================================================
-- قدرة «تفاصيل المنتج» لمنيو الزبون (menu_product_details) — ADR-40
-- ============================================================================
-- feature ابن menu. عند التعطيل: الضغط على المنتج في المنيو لا يفتح نافذة التفاصيل
-- (منيو عرض بلا تفاصيل). الافتراضي مفعّل (enabled_global=true) — غير كاسر.
-- تُقرأ في الواجهة عبر توسعة menu_capabilities أدناه (fail-open في useMenuData).
-- ============================================================================

-- (1) تسجيل القدرة في feature_flags (نفس فئة أشقّائها في المنيو)
insert into public.feature_flags (key, name, description, category_id, module, parent_key,
  kind, type, scope, lifecycle_status, runtime_status, sort_order, enabled_global, tags, required_permissions)
select 'menu_product_details', 'تفاصيل المنتج',
  'فتح نافذة تفاصيل المنتج عند الضغط عليه (عند التعطيل: الضغط لا يفتح شيئاً)',
  (select category_id from public.feature_flags where key='menu_cart'),
  'menu', 'menu', 'component', 'feature', 'restaurant', 'active', 'enabled', 35, true, '{}', '{}'
on conflict (key) do nothing;

-- (2) توسعة دالة قدرات منيو الزبون لتُرجع product_details
create or replace function public.menu_capabilities(p_restaurant_id uuid)
returns jsonb language sql stable security definer set search_path to 'public'
as $$
  select jsonb_build_object(
    'online_orders',   public.has_feature(p_restaurant_id, 'menu_checkout'),
    'reviews',         public.has_feature(p_restaurant_id, 'menu_reviews'),
    'loyalty',         public.has_feature(p_restaurant_id, 'loyalty'),
    'product_details', public.has_feature(p_restaurant_id, 'menu_product_details')
  );
$$;
