-- Customer Order Journey — PHASE 4 / TASK-ORD-003 (ADR-47)
-- نُفِّذ فعلياً على قاعدة الإنتاج gpwwnuuicywsvmmhxngs. اختُبر داخل معاملة ROLLBACK قبل التنفيذ
-- (صفر تعارضات موجودة في 155 صفاً قبل إضافة القيد — تحقّق مباشر).
-- Rollback: DROP CONSTRAINT orders_restaurant_id_order_number_key + استعادة الدالة بنسخة COUNT(*)+1.

ALTER TABLE public.orders ADD CONSTRAINT orders_restaurant_id_order_number_key UNIQUE (restaurant_id, order_number);

-- استبدال COUNT(*)+1 (بلا قفل — سباق تزامن وارد، وإعادة استخدام الرقم بعد حذف طلب) بقفل استشاري
-- يسلسل إدخالات نفس المطعم لعمر المعاملة + max(الرقم)+1 بدل COUNT، وإضافة search_path الغائب.
CREATE OR REPLACE FUNCTION public.generate_order_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_next integer;
begin
  perform pg_advisory_xact_lock(hashtext(new.restaurant_id::text)::bigint);

  select coalesce(max(substring(order_number from '\d+')::int), 0) + 1
    into v_next
    from public.orders
   where restaurant_id = new.restaurant_id;

  new.order_number := '#' || lpad(v_next::text, 4, '0');
  return new;
end;
$function$;
