-- Customer Order Journey — توثيق تحكّم (Governance) لا تنفيذ جديد (ADR-49/TASK-TST-001)
-- الدوال الأربع أدناه كانت منشورة وتعمل على الإنتاج قبل هذا الفرع بلا ملف sql/ مقابل — انحراف
-- موثَّق أصلاً في التدقيق الأصلي (§2.4، §R-05: "انحرافات إضافية غير مكتشفة بين الإنتاج والمستودع").
-- هذا الملف يوثّقها حرفياً (CREATE OR REPLACE بنفس التعريف الحي تماماً — صفر تغيير منطقي) حتى تُغطّى
-- بحارس GUARD-SQL-004 (كل دالة يستدعيها الكود عبر rpc() لها ملف مقابل في sql/) ولا تنجرف مستقبلاً بصمت.

-- get_orders_status_secure — القراءة الآمنة بالرمز (TASK-ORD-004). منشورة منذ التدقيق الأصلي،
-- والواجهة أصبحت تستعملها فعلياً في PHASE 6 (useActiveOrders.js).
CREATE OR REPLACE FUNCTION public.get_orders_status_secure(p_orders jsonb)
 RETURNS TABLE(id uuid, order_number text, status text, cancelled_by text, items jsonb, total numeric, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select o.id, o.order_number, o.status, o.cancelled_by, o.items, o.total, o.updated_at
    from public.orders o
    join jsonb_to_recordset(coalesce(p_orders, '[]'::jsonb)) as req(id uuid, access_token text)
      on req.id = o.id and req.access_token = o.order_access_token
$function$;

-- cancel_order_by_customer — إلغاء الزبون بالرمز، بديل RLS المفتوحة المحذوفة في PHASE 1 (TASK-TRK-003).
CREATE OR REPLACE FUNCTION public.cancel_order_by_customer(p_order_id uuid, p_access_token text)
 RETURNS TABLE(id uuid, status text, cancelled_by text, cancelled_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.orders
     set status = 'cancelled', cancelled_by = 'customer', cancelled_at = now(), updated_at = now()
   where id = p_order_id
     and order_access_token = p_access_token
     and status = 'pending'
  returning orders.id, orders.status, orders.cancelled_by, orders.cancelled_at
$function$;

-- can_read_order_status — تتحقّق منها سياسة "order status broadcast read" على realtime.messages
-- (topic بصيغة order-status:<id>:<token>) قبل السماح بالاشتراك اللحظي.
CREATE OR REPLACE FUNCTION public.can_read_order_status(p_topic text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
      from public.orders o
     where o.id::text = split_part(p_topic, ':', 2)
       and o.order_access_token = split_part(p_topic, ':', 3)
  )
$function$;

-- get_orders_status — GAP-SEC-003 موثَّق: بلا إثبات ملكية (أي id صحيح يُرجع بياناته). **لا تُستخدم
-- لأي طلب جديد** — الواجهة تستعملها فقط كمسار احتياطي مؤقت للطلبات المحفوظة محلياً قبل PHASE 6 (بلا
-- order_access_token) حتى تنتهي مهلة الـ12 ساعة الخاصة بها. تُسحب صلاحية anon عنها في TASK-SEC-003
-- (PHASE 7) بعد التأكد من انتقال كل العملاء — **لا تُسحب الآن**.
CREATE OR REPLACE FUNCTION public.get_orders_status(order_ids uuid[])
 RETURNS TABLE(id uuid, status text, cancelled_by text, items jsonb, total numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
            SELECT id, status, cancelled_by, items, total
              FROM public.orders
                WHERE id = ANY(order_ids)
                $function$;
