-- ============================================================================
-- Phase 1 / خطوة 4 — Trigger كسب النقاط عند اكتمال الطلب
-- ----------------------------------------------------------------------------
-- يُدرج حركة `earn` في الدفتر تلقائياً عند تحوّل الطلب إلى 'completed'،
-- ويعكسها (`adjust` سالب) إن غادر الطلب حالة الاكتمال (إلغاء بعد اكتمال).
-- نفس أساس البذر: net = (total − delivery_fee) / 1.15 ، pts = floor(net × earn_rate).
--
-- مبادئ حاسمة (درس ADR-25):
--   • **لا يكسر تدفّق الطلبات أبداً:** كل المنطق داخل معالج استثناء (warning لا error)
--     → أي تعثّر في الولاء لا يُفشل اكتمال/إلغاء الطلب.
--   • **idempotent عبر صافي حركات الطلب** (sum(points) للطلب من مصدر 'order'):
--       - اكتمال: يمنح فقط إن كان الصافي ≤ 0 (يدعم إعادة الاكتمال بعد الإلغاء).
--       - مغادرة الاكتمال: يعكس فقط إن كان الصافي > 0.
--   • **حاجز عكس آمن:** يعكس least(المكتسب، الرصيد الحالي) → لا رصيد سالب، لا فشل إلغاء.
--   • يعمل فقط لو البرنامج مفعّل ورقم جوال العميل موجود.
--
-- ⚠️ يُنفَّذ في Supabase بعد موافقة المالك (يلمس جدول orders بإضافة Trigger فقط —
--    لا تعديل بيانات، لا تغيير مخطط orders).
-- ============================================================================

create or replace function public.loyalty_on_order_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rate      numeric;
  v_enabled   boolean;
  v_net       numeric;
  v_pts       int;
  v_order_net int;
  v_balance   int;
  v_reverse   int;
begin
  begin
    -- البرنامج
    select earn_rate, enabled into v_rate, v_enabled
    from loyalty_programs where restaurant_id = new.restaurant_id;

    if not found or not v_enabled then return null; end if;
    if new.customer_phone is null or new.customer_phone = '' then return null; end if;

    -- صافي ما سُجّل لهذا الطلب في الدفتر (كسب − عكس)
    select coalesce(sum(points), 0) into v_order_net
    from loyalty_transactions where order_id = new.id and source = 'order';

    -- ── الحالة أ: أصبح مكتملاً ──
    if new.status = 'completed'
       and (tg_op = 'INSERT' or coalesce(old.status,'') <> 'completed')
       and v_order_net <= 0 then

      v_net := (new.total - coalesce(new.delivery_fee, 0)) / 1.15;
      v_pts := floor(greatest(v_net, 0) * v_rate);

      if v_pts > 0 then
        perform loyalty_post(new.restaurant_id, new.customer_phone, 'earn', v_pts,
          'كسب من طلب مكتمل', 'order', new.id, new.branch_id);
      end if;
      return null;
    end if;

    -- ── الحالة ب: غادر الاكتمال (إلغاء بعد اكتمال) → عكس مع حاجز ──
    if tg_op = 'UPDATE'
       and coalesce(old.status,'') = 'completed'
       and new.status <> 'completed'
       and v_order_net > 0 then

      select coalesce(current_balance, 0) into v_balance
      from loyalty_accounts
      where restaurant_id = new.restaurant_id and customer_phone = new.customer_phone;

      v_reverse := least(v_order_net, coalesce(v_balance, 0));
      if v_reverse > 0 then
        perform loyalty_post(new.restaurant_id, new.customer_phone, 'adjust', -v_reverse,
          'عكس نقاط طلب أُلغي بعد اكتماله', 'order', new.id, new.branch_id);
      end if;
      return null;
    end if;

    return null;
  exception when others then
    -- لا نكسر عملية الطلب أبداً — نسجّل تحذيراً فقط
    raise warning 'loyalty_on_order_completed error (order %): %', new.id, sqlerrm;
    return null;
  end;
end;
$$;

revoke all on function public.loyalty_on_order_completed() from public, anon, authenticated;

drop trigger if exists trg_loyalty_earn on public.orders;
create trigger trg_loyalty_earn
  after insert or update of status on public.orders
  for each row execute function public.loyalty_on_order_completed();
