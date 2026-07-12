-- تحديث get_active_orders_count لدعم فلترة اختيارية بالفرع (كل فرع مطبخه/طاقمه مستقل — ADR-22)
-- p_branch_id اختياري بقيمة افتراضية null: أي استدعاء قديم بدونها يعمل بنفس سلوكه الحالي تماماً (مطعم كله)
-- ⚠️ تُنفَّذ مرة واحدة في Supabase → SQL Editor، بعد نشر كود الواجهة المطابق

create or replace function public.get_active_orders_count(p_restaurant_id uuid, p_branch_id uuid default null)
returns integer
language sql
stable security definer
set search_path to 'public'
as $function$
  select count(*)::int
    from public.orders
    where restaurant_id = p_restaurant_id
      and status in ('pending', 'preparing')
      and (p_branch_id is null or branch_id = p_branch_id);
$function$;

notify pgrst, 'reload schema';
