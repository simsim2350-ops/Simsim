-- ============================================================================
-- هوية المنيو (Menu Branding) — إعداد منصّي مركزي لعبارة «صمم بواسطة سمسم»
-- طُبِّقت كهجرة: menu_branding_phase1
-- ----------------------------------------------------------------------------
-- المرحلة 1: المحتوى + الافتراضي العام (يتحكم به السوبر أدمن فقط). لا قيمة ثابتة
-- في مكوّنات المنيو — كل شيء يأتي من هنا عبر RPC آمن للزبون (anon).
-- المرحلة 2 لاحقاً: السياسة لكل باقة/مطعم عبر PCR (branding_hidden / branding_hideable).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_branding (
  id         int PRIMARY KEY DEFAULT 1,
  enabled    boolean NOT NULL DEFAULT true,                    -- الظهور الافتراضي العام
  text       text    NOT NULL DEFAULT 'صمم بواسطة سمسم',
  url        text,                                             -- الرابط عند الضغط (اختياري)
  placement  text    NOT NULL DEFAULT 'bottom',               -- 'bottom' | 'footer'
  variant    text    NOT NULL DEFAULT 'text',                 -- 'text' | 'text_logo' | 'logo'
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT platform_branding_singleton     CHECK (id = 1),
  CONSTRAINT platform_branding_placement_chk CHECK (placement IN ('bottom','footer')),
  CONSTRAINT platform_branding_variant_chk   CHECK (variant   IN ('text','text_logo','logo'))
);

-- الصف الافتراضي الوحيد
INSERT INTO public.platform_branding (id, enabled, text, url, placement, variant)
VALUES (1, true, 'صمم بواسطة سمسم', 'https://simsimmenu.com', 'bottom', 'text')
ON CONFLICT (id) DO NOTHING;

-- RLS: الجدول للسوبر أدمن فقط (قراءة/كتابة). الزبون (anon) يقرأ عبر RPC آمن أدناه فقط.
ALTER TABLE public.platform_branding ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_branding_admin_all ON public.platform_branding;
CREATE POLICY platform_branding_admin_all ON public.platform_branding
  FOR ALL USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- ----------------------------------------------------------------------------
-- المرحلة 2أ: قدرة PCR للتحكم بظهور هوية سمسم لكل باقة/مطعم (branding_hidden).
-- branding_hidden = true → تُخفى العبارة (White-label للباقات المدفوعة / تخصيص مطعم).
-- تُسجَّل أيضاً في features.manifest.js (وإلا يفشل فحص الانجراف).
-- ----------------------------------------------------------------------------
INSERT INTO public.feature_flags
  (key, name, description, kind, module, parent_key, type, scope, category_id, enabled_global, lifecycle_status, runtime_status, sort_order, icon)
VALUES
  ('branding_hidden', 'إخفاء هوية سمسم',
   'إخفاء عبارة «صمم بواسطة سمسم» من المنيو (ميزة الباقات المدفوعة / White-label)',
   'component', 'branding', 'menu', 'feature', 'restaurant',
   (SELECT category_id FROM public.feature_flags WHERE key = 'menu_recommendations'),
   false, 'active', 'enabled', 80, '🏷️')
ON CONFLICT (key) DO NOTHING;

-- RPC آمن للزبون: يعيد هوية المنيو المحسومة. تُخفى إن كانت branding_hidden مفعّلة للمطعم.
CREATE OR REPLACE FUNCTION public.menu_branding(p_restaurant_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'show',      b.enabled AND (p_restaurant_id IS NULL OR public.has_feature(p_restaurant_id, 'branding_hidden') IS NOT TRUE),
    'text',      b.text,
    'url',       b.url,
    'placement', b.placement,
    'variant',   b.variant
  )
  FROM public.platform_branding b WHERE b.id = 1;
$$;
GRANT EXECUTE ON FUNCTION public.menu_branding(uuid) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- المرحلة 2ب: السماح للمطعم بإخفاء هوية سمسم بنفسه (branding_hideable) + دالة كتابة آمنة.
-- تُسجَّل branding_hideable أيضاً في features.manifest.js.
-- ----------------------------------------------------------------------------
INSERT INTO public.feature_flags
  (key, name, description, kind, module, parent_key, type, scope, category_id, enabled_global, lifecycle_status, runtime_status, sort_order, icon)
VALUES
  ('branding_hideable', 'السماح للمطعم بإخفاء هوية سمسم',
   'يمنح المطعم حق إخفاء «صمم بواسطة سمسم» بنفسه من إعداداته (ميزة الباقات المدفوعة)',
   'component', 'branding', 'menu', 'feature', 'restaurant',
   (SELECT category_id FROM public.feature_flags WHERE key = 'menu_recommendations'),
   false, 'active', 'enabled', 81, '🎛️')
ON CONFLICT (key) DO NOTHING;

-- المطعم (المالك) يخفي/يُظهر هوية سمسم بنفسه — فقط إن سمحت باقته. يكتب Override على مطعمه
-- فقط (لا يمسّ الإعداد المنصّي العام — البند 11: عزل إعدادات المنصّة عن المطعم).
CREATE OR REPLACE FUNCTION public.set_menu_branding_hidden(p_hidden boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_rid uuid;
BEGIN
  SELECT id INTO v_rid FROM restaurants WHERE owner_id = auth.uid() LIMIT 1;
  IF v_rid IS NULL THEN RAISE EXCEPTION 'ليس مالك مطعم'; END IF;
  IF public.has_feature(v_rid, 'branding_hideable') IS NOT TRUE THEN
    RAISE EXCEPTION 'هذه الميزة غير متاحة في باقتك';
  END IF;
  INSERT INTO public.restaurant_feature_overrides (restaurant_id, key, enabled, created_by, updated_by, updated_at)
  VALUES (v_rid, 'branding_hidden', p_hidden, auth.uid(), auth.uid(), now())
  ON CONFLICT (restaurant_id, key) DO UPDATE
    SET enabled = EXCLUDED.enabled, updated_by = auth.uid(), updated_at = now();
  RETURN p_hidden;
END; $$;
GRANT EXECUTE ON FUNCTION public.set_menu_branding_hidden(boolean) TO authenticated;
