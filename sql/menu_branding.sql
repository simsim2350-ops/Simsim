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

-- RPC آمن للزبون: يعيد هوية المنيو المحسومة (المرحلة 1 = العام؛ p_restaurant_id محجوز للمرحلة 2)
CREATE OR REPLACE FUNCTION public.menu_branding(p_restaurant_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'show',      b.enabled,
    'text',      b.text,
    'url',       b.url,
    'placement', b.placement,
    'variant',   b.variant
  )
  FROM public.platform_branding b WHERE b.id = 1;
$$;
GRANT EXECUTE ON FUNCTION public.menu_branding(uuid) TO anon, authenticated;
