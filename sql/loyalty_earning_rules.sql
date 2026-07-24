-- ============================================================================
-- Phase 2 / (هـ-1) قواعد الكسب المتقدمة — أعمدة الإعدادات + Trigger الكسب
-- ----------------------------------------------------------------------------
-- حد أدنى للطلب · فروع مشمولة · منتجات مستثناة · مضاعف حملة زمني.
-- القرارات المعتمدة: الحد الأدنى على مجموع الأصناف (بلا توصيل) · المضاعفات
-- تتضاعف معاً (net × earn_rate × مستوى × حملة).
-- كل الافتراضات محايدة (0/null/1) → صفر تغيير حتى يفعّلها المالك.
-- ⚠️ يُنفَّذ في Supabase بعد موافقة المالك.
-- ============================================================================

-- 1) أعمدة الإعدادات على البرنامج
alter table public.loyalty_programs add column if not exists min_order_amount    numeric default 0;
alter table public.loyalty_programs add column if not exists earning_branches    uuid[];   -- null = كل الفروع
alter table public.loyalty_programs add column if not exists excluded_product_ids uuid[];  -- null/فارغ = لا استثناء
alter table public.loyalty_programs add column if not exists campaign_multiplier  numeric default 1;
alter table public.loyalty_programs add column if not exists campaign_starts_at   timestamptz;
alter table public.loyalty_programs add column if not exists campaign_ends_at     timestamptz;

-- 2) إعادة كتابة Trigger الكسب بالقواعد
create or replace function public.loyalty_on_order_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prog record;
  v_mult numeric; v_camp numeric;
  v_items_sub numeric; v_excluded numeric; v_base numeric; v_net numeric;
  v_pts int; v_order_net int;
  v_balance int; v_reverse int;
begin
  begin
    select earn_rate, enabled,
           coalesce(min_order_amount, 0)   as min_order_amount,
           earning_branches, excluded_product_ids,
           coalesce(campaign_multiplier,1) as campaign_multiplier,
           campaign_starts_at, campaign_ends_at
    into prog
    from loyalty_programs where restaurant_id = new.restaurant_id;

    if not found or not prog.enabled then return null; end if;
    if new.customer_phone is null or new.customer_phone = '' then return null; end if;

    select coalesce(sum(points), 0) into v_order_net
    from loyalty_transactions where order_id = new.id and source = 'order';

    -- ── كسب عند الاكتمال ──
    if new.status = 'completed'
       and (tg_op = 'INSERT' or coalesce(old.status,'') <> 'completed')
       and v_order_net <= 0 then

      -- فرع مشمول؟ (null = كل الفروع)
      if prog.earning_branches is not null
         and array_length(prog.earning_branches, 1) is not null
         and not (new.branch_id = any(prog.earning_branches)) then
        null;  -- فرع غير مشمول → لا نقاط
      else
        v_items_sub := new.total - coalesce(new.delivery_fee, 0);   -- مجموع الأصناف (بلا توصيل)

        if v_items_sub >= prog.min_order_amount then
          -- خصم أسعار المنتجات المستثناة
          v_excluded := 0;
          if prog.excluded_product_ids is not null
             and array_length(prog.excluded_product_ids, 1) is not null then
            select coalesce(sum(coalesce((it->>'price')::numeric,0) * coalesce(nullif(it->>'qty','')::numeric,1)), 0)
            into v_excluded
            from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) it
            where (it->>'id') = any(prog.excluded_product_ids::text[]);
          end if;

          v_base := greatest(v_items_sub - coalesce(v_excluded, 0), 0);
          v_net  := v_base / 1.15;

          -- مضاعف المستوى
          select coalesce(t.earn_multiplier, 1) into v_mult
          from loyalty_accounts a
          left join loyalty_tiers t on t.id = a.tier_id
          where a.restaurant_id = new.restaurant_id and a.customer_phone = new.customer_phone;
          v_mult := coalesce(v_mult, 1);

          -- مضاعف الحملة (ضمن النافذة فقط)
          v_camp := 1;
          if prog.campaign_multiplier <> 1
             and prog.campaign_starts_at is not null and prog.campaign_ends_at is not null
             and now() >= prog.campaign_starts_at and now() <= prog.campaign_ends_at then
            v_camp := prog.campaign_multiplier;
          end if;

          v_pts := floor(greatest(v_net, 0) * prog.earn_rate * v_mult * v_camp);
          if v_pts > 0 then
            perform loyalty_post(new.restaurant_id, new.customer_phone, 'earn', v_pts,
              'كسب من طلب مكتمل', 'order', new.id, new.branch_id);
          end if;
        end if;
      end if;

    -- ── عكس عند الإلغاء بعد الاكتمال ──
    elsif tg_op = 'UPDATE'
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
    end if;

    -- مزامنة اسم العميل
    if new.customer_name is not null and btrim(new.customer_name) <> '' then
      update loyalty_accounts
        set customer_name = new.customer_name, updated_at = now()
      where restaurant_id = new.restaurant_id
        and customer_phone = new.customer_phone
        and customer_name is distinct from new.customer_name;
    end if;

    return null;
  exception when others then
    raise warning 'loyalty_on_order_completed error (order %): %', new.id, sqlerrm;
    return null;
  end;
end;
$$;
