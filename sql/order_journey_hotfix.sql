-- Customer Order Journey — PHASE 1 Hotfix (ADR-44)
-- نُفِّذ فعلياً على قاعدة الإنتاج gpwwnuuicywsvmmhxngs بعد موافقة المالك (D-08 = A2).
-- كل تغيير اختُبر أولاً داخل معاملة ROLLBACK على بيانات حيّة قبل التنفيذ.
--
-- MIG-001 — إصلاح create_order: متغيّر الكوبون v_coupon (record) كان يُقرأ (v_coupon.id)
-- بلا إسناد سابق في مسار "بلا كوبون" فيفشل بخطأ 55000 (B1). الإصلاح: v_coupon_id uuid
-- صريح يُسنَد فقط داخل كتلة معالجة الكوبون.
-- Rollback: استعادة النسخة السابقة (المعطوبة) عبر CREATE OR REPLACE بنفس التوقيع.

CREATE OR REPLACE FUNCTION public.create_order(p_restaurant_id uuid, p_branch_id uuid, p_table_number text, p_delivery_address text, p_customer_name text, p_customer_phone text, p_type text, p_items jsonb, p_notes text, p_coupon_code text, p_client_total numeric DEFAULT NULL::numeric)
 RETURNS TABLE(id uuid, order_number text, access_token text, subtotal numeric, tax numeric, delivery_fee numeric, total numeric, price_changed boolean, price_changes jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_restaurant record;
  v_branch record;
  v_product record;
  v_item jsonb;
  v_option jsonb;
  v_group jsonb;
  v_items jsonb := '[]'::jsonb;
  v_selected jsonb;
  v_options jsonb;
  v_product_id uuid;
  v_qty integer;
  v_item_price numeric;
  v_options_price numeric;
  v_subtotal_gross numeric := 0;
  v_discount numeric := 0;
  v_discounted_gross numeric := 0;
  v_net numeric := 0;
  v_tax numeric := 0;
  v_delivery_fee numeric := 0;
  v_total numeric := 0;
  v_coupon record;
  v_coupon_id uuid;
  v_access_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_order_id uuid;
  v_order_number text;
  v_price_changes jsonb := '[]'::jsonb;
  v_client_total numeric := coalesce(p_client_total, -1);
  v_delivery_enabled boolean;
  v_takeaway_enabled boolean;
  v_has_selection boolean;
  v_choice jsonb;
begin
  if p_type not in ('dine_in', 'takeaway', 'delivery') then
    raise exception 'invalid order type';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 100 then
    raise exception 'invalid items payload';
  end if;
  if p_customer_phone is null or p_customer_phone !~ '^5[0-9]{8}$' then
    raise exception 'invalid customer phone';
  end if;

  select r.id, r.is_active, r.platform_suspended,
         coalesce(r.delivery_enabled, false) as restaurant_delivery_enabled,
         coalesce(r.delivery_fee, 0) as restaurant_delivery_fee
    into v_restaurant
    from public.restaurants r
   where r.id = p_restaurant_id;
  if not found or not v_restaurant.is_active or v_restaurant.platform_suspended then
    raise exception 'restaurant is unavailable';
  end if;

  select b.id, b.restaurant_id, b.is_active, b.is_paused,
         coalesce(b.delivery_enabled, v_restaurant.restaurant_delivery_enabled) as delivery_enabled,
         coalesce(b.delivery_fee, v_restaurant.restaurant_delivery_fee, 0) as delivery_fee,
         coalesce(b.takeaway_enabled, true) as takeaway_enabled
    into v_branch
    from public.branches b
   where b.id = p_branch_id;
  if not found or v_branch.restaurant_id <> p_restaurant_id or not v_branch.is_active or coalesce(v_branch.is_paused, false) then
    raise exception 'branch is unavailable';
  end if;

  v_delivery_enabled := coalesce(v_branch.delivery_enabled, false);
  v_takeaway_enabled := coalesce(v_branch.takeaway_enabled, true);
  if p_type = 'delivery' and not v_delivery_enabled then
    raise exception 'delivery is unavailable';
  end if;
  if p_type = 'takeaway' and not v_takeaway_enabled then
    raise exception 'takeaway is unavailable';
  end if;
  if p_type = 'dine_in' and nullif(trim(coalesce(p_table_number, '')), '') is null then
    raise exception 'table number is required';
  end if;
  if p_type = 'delivery' and nullif(trim(coalesce(p_delivery_address, '')), '') is null then
    raise exception 'delivery address is required';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := nullif(coalesce(v_item->>'product_id', v_item->>'id'), '')::uuid;
    v_qty := coalesce((v_item->>'quantity')::integer, (v_item->>'qty')::integer, 0);
    if v_product_id is null or v_qty < 1 or v_qty > 99 then
      raise exception 'invalid product or quantity';
    end if;

    select p.id, p.restaurant_id, p.branch_id, p.name, p.name_en, p.emoji, p.image_url,
           p.price, p.options, p.is_available
      into v_product
      from public.products p
     where p.id = v_product_id;
    if not found or v_product.restaurant_id <> p_restaurant_id or v_product.branch_id <> p_branch_id or not v_product.is_available then
      raise exception 'product is unavailable for this branch';
    end if;

    v_options := coalesce(v_product.options, '[]'::jsonb);
    v_selected := coalesce(v_item->'options', v_item->'option_selections');
    if v_selected is null or jsonb_typeof(v_selected) <> 'array' then
      v_selected := '[]'::jsonb;
    end if;
    v_options_price := 0;
    v_selected := '[]'::jsonb;

    -- Validate the client selectors against the current product option definition.
    for v_option in select value from jsonb_array_elements(coalesce(v_item->'options', v_item->'option_selections', '[]'::jsonb))
    loop
      v_has_selection := false;
      for v_group in select value from jsonb_array_elements(v_options)
      loop
        if v_group->>'name' = coalesce(v_option->>'group_name', v_option->>'groupName') then
          for v_choice in select value from jsonb_array_elements(coalesce(v_group->'choices', '[]'::jsonb))
          loop
            if v_choice->>'name' = coalesce(v_option->>'choice_name', v_option->>'choiceName') then
              v_has_selection := true;
              v_options_price := v_options_price + coalesce((v_choice->>'price')::numeric, 0);
              v_selected := v_selected || jsonb_build_array(jsonb_build_object(
                'groupName', v_group->>'name',
                'choiceName', v_choice->>'name',
                'price', coalesce((v_choice->>'price')::numeric, 0)
              ));
              exit;
            end if;
          end loop;
          exit;
        end if;
      end loop;
      if not v_has_selection then
        raise exception 'invalid product option';
      end if;
    end loop;

    -- Every required group must have at least one valid selection.
    for v_group in select value from jsonb_array_elements(v_options)
    loop
      if coalesce((v_group->>'required')::boolean, false) then
        if not exists (
          select 1 from jsonb_array_elements(v_selected) s
           where s->>'groupName' = v_group->>'name'
        ) then
          raise exception 'required product option is missing';
        end if;
      end if;
    end loop;

    v_item_price := coalesce(v_product.price, 0) + v_options_price;
    v_subtotal_gross := v_subtotal_gross + (v_item_price * v_qty);
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', v_product.id,
      'name', v_product.name,
      'name_en', v_product.name_en,
      'emoji', v_product.emoji,
      'image_url', v_product.image_url,
      'price', v_item_price,
      'qty', v_qty,
      'notes', left(coalesce(v_item->>'notes', v_item->>'note', ''), 500),
      'selectedOptions', v_selected
    ));
  end loop;

  if p_coupon_code is not null and nullif(trim(p_coupon_code), '') is not null then
    select c.* into v_coupon
      from public.coupons c
     where c.restaurant_id = p_restaurant_id
       and upper(c.code) = upper(trim(p_coupon_code))
       and c.is_active = true
       and (c.expires_at is null or c.expires_at >= now())
       and (c.branch_id is null or c.branch_id = p_branch_id)
     for update;
    if not found then raise exception 'invalid or expired coupon'; end if;
    v_coupon_id := v_coupon.id;
    if v_subtotal_gross < coalesce(v_coupon.min_order_amount, 0) then
      raise exception 'coupon minimum order not met';
    end if;
    if v_coupon.usage_limit is not null and v_coupon.usage_count >= v_coupon.usage_limit then
      raise exception 'coupon usage limit reached';
    end if;
    if v_coupon.discount_type = 'percent' then
      if v_coupon.discount_value <= 0 or v_coupon.discount_value > 100 then
        raise exception 'invalid coupon discount';
      end if;
      v_discount := round(v_subtotal_gross * v_coupon.discount_value / 100, 2);
    elsif v_coupon.discount_type = 'fixed' then
      v_discount := greatest(0, v_coupon.discount_value);
    else
      raise exception 'invalid coupon type';
    end if;
    if v_coupon.max_discount_amount is not null then
      v_discount := least(v_discount, v_coupon.max_discount_amount);
    end if;
    v_discount := least(v_discount, v_subtotal_gross);
  end if;

  v_discounted_gross := greatest(0, v_subtotal_gross - v_discount);
  v_net := round(v_discounted_gross / 1.15, 2);
  v_tax := round(v_discounted_gross - v_net, 2);
  v_delivery_fee := case when p_type = 'delivery' then greatest(0, coalesce(v_branch.delivery_fee, 0)) else 0 end;
  v_total := round(v_discounted_gross + v_delivery_fee, 2);
  if v_client_total >= 0 and abs(v_client_total - v_total) > 0.01 then
    v_price_changes := jsonb_build_array(jsonb_build_object('client_total', v_client_total, 'server_total', v_total));
    return query select null::uuid, null::text, null::text, v_net, v_tax, v_delivery_fee, v_total, true, v_price_changes;
    return;
  end if;

  if v_coupon_id is not null then
    update public.coupons as coupon_row
       set usage_count = coupon_row.usage_count + 1, updated_at = now()
     where coupon_row.id = v_coupon_id;
  end if;

  insert into public.orders (
    restaurant_id, branch_id, table_number, delivery_address, customer_name, customer_phone,
    type, status, items, subtotal, tax, delivery_fee, total, notes, coupon_code, discount_amount,
    order_access_token
  ) values (
    p_restaurant_id, p_branch_id, nullif(trim(p_table_number), ''),
    nullif(trim(p_delivery_address), ''), nullif(trim(p_customer_name), ''), p_customer_phone,
    p_type, 'pending', v_items, v_net, v_tax, v_delivery_fee, v_total,
    left(coalesce(p_notes, ''), 500), nullif(upper(trim(p_coupon_code)), ''), v_discount,
    v_access_token
  ) returning orders.id, orders.order_number into v_order_id, v_order_number;

  return query select v_order_id, v_order_number, v_access_token, v_net, v_tax,
    v_delivery_fee, v_total, (jsonb_array_length(v_price_changes) > 0), v_price_changes;
end;
$function$;

-- MIG-002 — إصلاح broadcast_order_status: كانت تستدعي realtime.broadcast(...) غير الموجودة
-- في هذه النسخة من Supabase (الموجود realtime.send) فيفشل كل UPDATE على orders (B2، خطأ 42883).
-- الإصلاح: realtime.send بترتيب المعاملات الصحيح + coalesce(order_access_token,'') للطلبات
-- القديمة بلا رمز + تغليف الاستدعاء بمعالج استثناء حتى لا يحجب فشل البثّ تحديث الطلب أبداً.
-- Rollback: DROP TRIGGER trg_broadcast_order_status ON public.orders; (فوري، بلا فقد بيانات).

CREATE OR REPLACE FUNCTION public.broadcast_order_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_items jsonb := '[]'::jsonb;
  v_item jsonb;
begin
  if new.items is not null and jsonb_typeof(new.items) = 'array' then
    for v_item in select value from jsonb_array_elements(new.items)
    loop
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'id', v_item->>'id',
        'unavailable', coalesce((v_item->>'unavailable')::boolean, false)
      ));
    end loop;
  end if;

  begin
    perform realtime.send(
      jsonb_build_object(
        'order_id', new.id,
        'status', new.status,
        'cancelled_by', new.cancelled_by,
        'items', v_items,
        'updated_at', new.updated_at
      ),
      tg_op,
      'order-status:' || new.id::text || ':' || coalesce(new.order_access_token, ''),
      true
    );
  exception when others then
    null; -- فشل البثّ لا يجب أن يمنع تحديث الطلب أبداً (RB-002)
  end;

  return new;
end;
$function$;

-- MIG-003 — إغلاق ثغرة الإلغاء الجماعي المجهول (SEC-001/B3): سياسة orders_cancel_public
-- (FOR UPDATE TO PUBLIC) + منحة UPDATE لدور anon كانتا تسمحان لأي زائر بإلغاء أي طلب pending
-- في المنصّة بطلب HTTP واحد. نُفِّذ بعد نقل useActiveOrders.js إلى cancel_order_by_customer RPC.
-- Rollback: إعادة إنشاء السياسة والمنح — النصّ الكامل موثّق في الوثيقة الأصلية (§2.6/§11.2).

DROP POLICY IF EXISTS orders_cancel_public ON public.orders;
REVOKE INSERT, UPDATE, DELETE ON public.orders FROM anon;

-- MIG-004 — إغلاق ثغرة الإدخال المباشر (SEC-002): سياسة orders_insert_public كانت تسمح
-- بإدخال طلبات مزوَّرة (status/total حرّان) لدور anon. مُتحقَّق أن لا كود في المستودع يستخدمها
-- (الإدخال الوحيد عبر create_order/create_order_from_table_qr، SECURITY DEFINER لا يتأثر بالمنح).
-- Rollback: إعادة إنشاء السياسة (WITH CHECK (table_id IS NULL AND source = 'manual')).

DROP POLICY IF EXISTS orders_insert_public ON public.orders;
