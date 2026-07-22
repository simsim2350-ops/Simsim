-- ========== M4.2: قراءة المالك لفواتيره واشتراكه — قيد المراجعة/النشر ==========
-- إضافة سياستَي قراءة فقط مقيّدتين بمالك المطعم (is_restaurant_owner) — بلا مساس بسياسات المشرف.
-- payments و plans تبقيان للمشرف فقط (لقطات plan_label/amount/status على الاشتراك والفاتورة تكفي للعرض).
-- ملاحظة: authenticated/anon لهما مِنح جداول افتراضية من Supabase، لكن RLS يحجب كل ما لا سياسة له —
-- الكتابة المباشرة مستحيلة (لا سياسات INSERT/UPDATE/DELETE)، والقراءة محصورة بالمشرف + المالك فقط.

create policy subs_owner_select on public.subscriptions
  for select using (public.is_restaurant_owner(restaurant_id));

create policy inv_owner_select on public.invoices
  for select using (public.is_restaurant_owner(restaurant_id));
