-- تحديث لحظي حقيقي لـ"وقت التجهيز التقديري" في منيو الزبون العام — نفس فئة مشكلة تتبّع حالة الطلب
-- (postgres_changes لا يعمل للزبون العابر لأنه يحتاج صلاحية SELECT مغلقة عمداً — ADR-9).
--
-- restaurant_id ليس سرياً (موجود في رابط المنيو العام نفسه أصلاً)، فالقناة مفتوحة بلا أي قيد خصوصية إضافي.
--
-- ⚠️ تُنفَّذ مرة واحدة في Supabase → SQL Editor، بعد نشر كود الواجهة المطابق

create or replace function public.broadcast_restaurant_orders()
returns trigger
language plpgsql
security definer
as $function$
begin
  perform realtime.broadcast_changes(
    'restaurant-orders:' || coalesce(new.restaurant_id, old.restaurant_id)::text,
    tg_op, tg_op, tg_table_name, tg_table_schema,
    new, old
  );
  return coalesce(new, old);
end;
$function$;

drop trigger if exists trg_broadcast_restaurant_orders on public.orders;
create trigger trg_broadcast_restaurant_orders
after insert or update on public.orders
for each row execute function public.broadcast_restaurant_orders();

-- ملاحظة: RLS مفعّل مسبقاً افتراضياً على realtime.messages من إعداد Supabase نفسه — لا تُفعّله يدوياً
drop policy if exists "restaurant orders broadcast read" on realtime.messages;
create policy "restaurant orders broadcast read"
on realtime.messages
for select
to anon, authenticated
using (realtime.topic() like 'restaurant-orders:%');

notify pgrst, 'reload schema';
