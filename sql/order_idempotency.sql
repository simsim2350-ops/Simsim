-- Customer Order Journey — PHASE 4 / TASK-ORD-002 (ADR-47)
-- نُفِّذ فعلياً على قاعدة الإنتاج gpwwnuuicywsvmmhxngs. اختُبر داخل معاملة ROLLBACK قبل التنفيذ.
-- Rollback: DROP COLUMN idempotency_key (يُسقط الفهرس معه تلقائياً) + استعادة الدالتين بالتوقيع
-- السابق (11/7 معاملات بدل 12/8) — المعامل الجديد اختياري بقيمة NULL فلا يكسر أي عميل قديم.

ALTER TABLE public.orders ADD COLUMN idempotency_key uuid;
CREATE UNIQUE INDEX orders_idempotency_key_uidx ON public.orders (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- create_order: إضافة p_idempotency_key uuid DEFAULT NULL في نهاية التوقيع (توافق خلفي كامل)
-- + فحص مبكر يُعيد الطلب القائم بدل إنشاء ثانٍ لو المفتاح مُرسَل وموجود مسبقاً لنفس المطعم.
CREATE OR REPLACE FUNCTION public.create_order(p_restaurant_id uuid, p_branch_id uuid, p_table_number text, p_delivery_address text, p_customer_name text, p_customer_phone text, p_type text, p_items jsonb, p_notes text, p_coupon_code text, p_client_total numeric DEFAULT NULL::numeric, p_idempotency_key uuid DEFAULT NULL::uuid)
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
  v_existing record;
begin
  -- TASK-ORD-002: نفس مفتاح Idempotency لنفس المطعم ⇒ يُعاد الطلب الذي أُنشئ سابقاً بدل إنشاء ثانٍ
  if p_idempotency_key is not null then
    select o.id, o.order_number, o.order_access_token, o.subtotal, o.tax, o.delivery_fee, o.total
      into v_existing
      from public.orders o
     where o.idempotency_key = p_idempotency_key
       and o.restaurant_id = p_restaurant_id
     limit 1;
    if found then
      return query select v_existing.id, v_existing.order_number, v_existing.order_access_token,
        v_existing.subtotal, v_existing.tax, v_existing.delivery_fee, v_existing.total, false, '[]'::jsonb;
      return;
    end if;
  end if;

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
    order_access_token, idempotency_key
  ) values (
    p_restaurant_id, p_branch_id, nullif(trim(p_table_number), ''),
    nullif(trim(p_delivery_address), ''), nullif(trim(p_customer_name), ''), p_customer_phone,
    p_type, 'pending', v_items, v_net, v_tax, v_delivery_fee, v_total,
    left(coalesce(p_notes, ''), 500), nullif(upper(trim(p_coupon_code)), ''), v_discount,
    v_access_token, p_idempotency_key
  ) returning orders.id, orders.order_number into v_order_id, v_order_number;

  return query select v_order_id, v_order_number, v_access_token, v_net, v_tax,
    v_delivery_fee, v_total, (jsonb_array_length(v_price_changes) > 0), v_price_changes;
end;
$function$;

-- create_order_from_table_qr: نفس المعامل، يُمرَّر مباشرة إلى create_order
CREATE OR REPLACE FUNCTION public.create_order_from_table_qr(p_qr_token uuid, p_items jsonb, p_customer_name text, p_customer_phone text, p_notes text, p_coupon_code text, p_client_total numeric DEFAULT NULL::numeric, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, order_number text, access_token text, subtotal numeric, tax numeric, delivery_fee numeric, total numeric, price_changed boolean, price_changes jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_table record;
  v_created record;
begin
  select
    t.id,
    t.table_number,
    t.restaurant_id,
    t.branch_id
  into v_table
  from public.restaurant_tables t
  join public.restaurants r on r.id = t.restaurant_id
  join public.branches b on b.id = t.branch_id
  where t.qr_token = p_qr_token
    and t.qr_enabled = true
    and t.status = 'active'
    and r.is_active = true
    and coalesce(r.platform_suspended, false) = false
    and b.restaurant_id = t.restaurant_id
    and b.is_active = true
    and coalesce(b.is_paused, false) = false
  limit 1;

  if not found then
    raise exception 'table qr is unavailable';
  end if;

  -- محرك الطلب القائم يتحقق خادمياً من المطعم/الفرع/المنتجات والأسعار والكوبون والهاتف.
  select *
  into v_created
  from public.create_order(
    v_table.restaurant_id,
    v_table.branch_id,
    v_table.table_number,
    null,
    p_customer_name,
    p_customer_phone,
    'dine_in',
    p_items,
    p_notes,
    p_coupon_code,
    p_client_total,
    p_idempotency_key
  )
  limit 1;

  -- حالة price_changed لا تنشئ طلباً؛ نعيدها كما هي للواجهة.
  if v_created.id is null then
    return query select
      v_created.id,
      v_created.order_number,
      v_created.access_token,
      v_created.subtotal,
      v_created.tax,
      v_created.delivery_fee,
      v_created.total,
      v_created.price_changed,
      v_created.price_changes;
    return;
  end if;

  update public.orders o
  set
    table_id = v_table.id,
    table_name = v_table.table_number,
    source = 'qr'
  where o.id = v_created.id
    and o.restaurant_id = v_table.restaurant_id
    and o.branch_id = v_table.branch_id;

  update public.restaurant_tables t
  set qr_last_used_at = now()
  where t.id = v_table.id;

  return query select
    v_created.id,
    v_created.order_number,
    v_created.access_token,
    v_created.subtotal,
    v_created.tax,
    v_created.delivery_fee,
    v_created.total,
    v_created.price_changed,
    v_created.price_changes;
end;
$function$;
