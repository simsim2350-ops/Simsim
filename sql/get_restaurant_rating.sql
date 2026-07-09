-- تقييم المطعم للواجهة العامة (منيو الزبون): متوسط النجوم وعددها فقط
-- نفس نمط ADR-9: دالة آمنة لا تكشف أي بيانات زبائن (أسماء/أرقام/تعليقات)
-- ⚠️ تُنفَّذ مرة واحدة في Supabase → SQL Editor

create or replace function public.get_restaurant_rating(p_restaurant_id uuid)
returns table (avg_rating numeric, review_count bigint)
language sql
security definer
set search_path = public
as $$
  select round(avg(rating)::numeric, 1) as avg_rating,
         count(*)                       as review_count
  from reviews
  where restaurant_id = p_restaurant_id;
$$;

grant execute on function public.get_restaurant_rating(uuid) to anon, authenticated;
