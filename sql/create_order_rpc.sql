-- إصلاح عاجل: الزبون لا يقدر ينشئ طلباً إطلاقاً (new row violates row-level security policy for table "orders")
--
-- السبب الجذري: كود إنشاء الطلب يستخدم .insert().select() — و.select() يجعل Postgres يحاول
-- قراءة الصف المُدخَل (RETURNING)، وهذه القراءة تخضع لسياسة SELECT على orders، وهي مقصودة أن تُغلق
-- أمام الزبون العابر (ADR-9 — منع تصفّح بيانات عملاء آخرين). فيفشل الإدخال كاملاً رغم أنه مسموح فعلياً.
--
-- الحل: دالة آمنة (نفس نمط get_active_orders_count/get_recent_order_items/get_orders_status الموجودة
-- أصلاً) تُدخل الطلب داخلياً بصلاحيات الدالة (SECURITY DEFINER، تتجاوز RLS)، وترجع للزبون فقط
-- رقم الطلب ومعرّفه — بلا أي كشف لبيانات عملاء آخرين. لا تُلغي أي سياسة موجودة.
--
-- ⚠️ تُنفَّذ مرة واحدة في Supabase → SQL Editor

create or replace function public.create_order(
  p_restaurant_id uuid,
  p_branch_id uuid,
  p_table_number text,
  p_delivery_address text,
  p_customer_name text,
  p_customer_phone text,
  p_type text,
  p_items jsonb,
  p_subtotal numeric,
  p_tax numeric,
  p_delivery_fee numeric,
  p_total numeric,
  p_notes text,
  p_coupon_code text,
  p_discount_amount numeric
)
returns table(id uuid, order_number text)
language plpgsql
security definer
set search_path = public
as $function$
begin
  return query
  insert into public.orders (
    restaurant_id, branch_id, table_number, delivery_address, customer_name, customer_phone,
    type, status, items, subtotal, tax, delivery_fee, total, notes, coupon_code, discount_amount
  ) values (
    p_restaurant_id, p_branch_id, p_table_number, p_delivery_address, p_customer_name, p_customer_phone,
    p_type, 'pending', p_items, p_subtotal, p_tax, p_delivery_fee, p_total, p_notes, p_coupon_code, p_discount_amount
  )
  returning orders.id, orders.order_number;
end;
$function$;

grant execute on function public.create_order(
  uuid, uuid, text, text, text, text, text, jsonb, numeric, numeric, numeric, numeric, text, text, numeric
) to anon, authenticated;

notify pgrst, 'reload schema';
