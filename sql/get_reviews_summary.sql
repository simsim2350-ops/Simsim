-- ============================================================================
-- Phase 2 / (ج) تطوير التقييمات — get_reviews_summary
-- ----------------------------------------------------------------------------
-- تجميع خادمي (jsonb) لإحصائيات التقييمات: متوسط/عدد/توزيع النجوم/الشكاوى/الحالات
-- + اتجاه الشهر (بتوقيت الرياض). دقيق على كل التقييمات لا الـ50 المحمَّلة.
-- SECURITY INVOKER → تحترم RLS (reviews_access = صاحب المطعم).
--
-- تعريفات معتمدة: الشكوى = تقييم ≤ نجمتين · الحالات: جديد(null/'new')/قيد المعالجة
-- ('in_progress')/محلول('resolved').
-- ⚠️ يُنفَّذ في Supabase بعد موافقة المالك.
-- ============================================================================

create or replace function public.get_reviews_summary(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_avg numeric; v_count int; v_complaints int; v_unreplied int;
  v_new int; v_prog int; v_resolved int;
  v_this numeric; v_last numeric;
  d_this date; d_last date;
begin
  select round(avg(rating)::numeric, 1), count(*),
         count(*) filter (where rating <= 2),
         count(*) filter (where reply is null)
  into v_avg, v_count, v_complaints, v_unreplied
  from reviews where restaurant_id = p_restaurant_id;

  select count(*) filter (where status is null or status = 'new'),
         count(*) filter (where status = 'in_progress'),
         count(*) filter (where status = 'resolved')
  into v_new, v_prog, v_resolved
  from reviews where restaurant_id = p_restaurant_id;

  d_this := date_trunc('month', (now() at time zone 'Asia/Riyadh'))::date;
  d_last := (date_trunc('month', (now() at time zone 'Asia/Riyadh')) - interval '1 month')::date;

  select round(avg(rating)::numeric, 1) into v_this from reviews
  where restaurant_id = p_restaurant_id
    and (created_at at time zone 'Asia/Riyadh')::date >= d_this;

  select round(avg(rating)::numeric, 1) into v_last from reviews
  where restaurant_id = p_restaurant_id
    and (created_at at time zone 'Asia/Riyadh')::date >= d_last
    and (created_at at time zone 'Asia/Riyadh')::date <  d_this;

  return jsonb_build_object(
    'avg_rating',        coalesce(v_avg, 0),
    'total_count',       v_count,
    'complaints_count',  v_complaints,
    'unreplied_count',   v_unreplied,
    'status_new',        v_new,
    'status_in_progress',v_prog,
    'status_resolved',   v_resolved,
    'this_month_avg',    v_this,
    'last_month_avg',    v_last,
    'distribution', (
      select coalesce(jsonb_object_agg(r::text, c), '{}'::jsonb) from (
        select rating as r, count(*) as c
        from reviews where restaurant_id = p_restaurant_id
        group by rating
      ) x
    )
  );
end;
$$;

revoke all on function public.get_reviews_summary(uuid) from public, anon;
grant execute on function public.get_reviews_summary(uuid) to authenticated;
