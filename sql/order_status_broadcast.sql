-- تحديث لحظي حقيقي لحالة الطلب عند الزبون (Realtime Broadcast) — بديل آمن عن الاشتراك المباشر
-- بجدول orders الذي لا يعمل للزبون العابر (يحتاج صلاحية SELECT مغلقة عمداً — ADR-9).
--
-- الأمان: القناة مبنية على معرّف الطلب (UUID عشوائي غير قابل للتخمين) — نفس مبدأ الثقة المستخدم
-- أصلاً في get_orders_status وإلغاء الزبون لطلبه (معرفة الـ UUID = صلاحية متابعة هذا الطلب تحديداً).
-- لا كشف لأي بيانات عبر تصفّح/تعداد — فقط من يملك رقم الطلب (الزبون نفسه) يقدر يشترك بقناته.
--
-- ⚠️ تُنفَّذ مرة واحدة في Supabase → SQL Editor، بعد نشر كود الواجهة المطابق

-- 1) Trigger يبثّ كل تحديث على الطلب لقناته الخاصة
create or replace function public.broadcast_order_status()
returns trigger
language plpgsql
security definer
as $function$
begin
  perform realtime.broadcast_changes(
    'order-status:' || new.id::text,  -- topic
    tg_op,                              -- event
    tg_op,                              -- operation
    tg_table_name,                      -- table
    tg_table_schema,                    -- schema
    new,
    old
  );
  return new;
end;
$function$;

drop trigger if exists trg_broadcast_order_status on public.orders;
create trigger trg_broadcast_order_status
after update on public.orders
for each row execute function public.broadcast_order_status();

-- 2) تفويض الاستماع: أي طرف (زبون عابر) يقدر يشترك بقناة "order-status:<uuid>" — الأمان في عشوائية الـ UUID نفسه
-- ملاحظة: RLS مفعّل مسبقاً افتراضياً على realtime.messages من إعداد Supabase نفسه (الجدول مصمَّم لهذا
-- الاستخدام تحديداً) — لا تحتاج (ولا تقدر، لأنك لست مالك الجدول) تُفعّله يدوياً؛ إنشاء السياسة وحده يكفي.
drop policy if exists "order status broadcast read" on realtime.messages;
create policy "order status broadcast read"
on realtime.messages
for select
to anon, authenticated
using (
  realtime.topic() like 'order-status:%'
);

notify pgrst, 'reload schema';
