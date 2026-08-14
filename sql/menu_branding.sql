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
