-- ============================================================================
-- Phase 1 / خطوة 7 — تحصين نزاهة التقييمات (submit_review)
-- ----------------------------------------------------------------------------
-- يسدّ ثغرة `reviews_insert_public` (كانت تسمح لأي anon بإدراج أي تقييم بلا تحقّق).
-- البديل: دالة DEFINER تتحقّق خادمياً من الطلب ثم تُدرج، وتشتقّ هوية العميل والفرع
-- من الطلب نفسه (لا من إدخال العميل) — فلا تزوير/إغراق.
--
-- كذلك يضيف أعمدة reply/reply_at/status **خاملة** (nullable) — جاهزة لإدارة
-- الردود والشكاوى في Phase 2، بلا أي سلوك الآن (قرار المالك المعتمد).
--
-- ⚠️ يُنفَّذ في Supabase بعد موافقة المالك.
-- ============================================================================

-- 1) أعمدة خاملة جاهزة لـPhase 2 (رد على التقييم + حالة الشكوى)
alter table public.reviews add column if not exists reply     text;
alter table public.reviews add column if not exists reply_at  timestamptz;
alter table public.reviews add column if not exists status    text;

-- 2) قيد فريد: تقييم واحد لكل طلب (دفاع بالعمق — لا تكرار؛ البيانات الحالية نظيفة)
create unique index if not exists uq_reviews_order_id
  on public.reviews (order_id) where order_id is not null;

-- 3) دالة الإرسال الآمنة: تتحقّق من الطلب وتشتقّ الهوية منه
create or replace function public.submit_review(
  p_order_id uuid,
  p_rating   int,
  p_comment  text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_id    uuid;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'invalid_rating';
  end if;

  -- الطلب موجود ومكتمل (نقرأ هويته خادمياً — لا نثق بإدخال العميل)
  select id, restaurant_id, branch_id, customer_phone, customer_name, status
    into v_order
  from orders where id = p_order_id;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.status <> 'completed' then raise exception 'order_not_completed'; end if;

  -- تقييم واحد لكل طلب
  if exists (select 1 from reviews where order_id = p_order_id) then
    raise exception 'already_reviewed';
  end if;

  insert into reviews (restaurant_id, branch_id, order_id, customer_name, customer_phone, rating, comment)
  values (v_order.restaurant_id, v_order.branch_id, p_order_id,
          v_order.customer_name, v_order.customer_phone,
          p_rating, nullif(btrim(coalesce(p_comment, '')), ''))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_review(uuid, int, text) from public;
grant execute on function public.submit_review(uuid, int, text) to anon, authenticated;

-- 4) إغلاق الثغرة: إزالة سياسة الإدراج العام المفتوحة (كل الإدراج الآن عبر الدالة)
drop policy if exists reviews_insert_public on public.reviews;
