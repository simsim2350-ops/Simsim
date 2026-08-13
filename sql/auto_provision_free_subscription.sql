-- ============================================================================
-- منح الباقة المجانية تلقائياً لكل مطعم جديد (Auto-provision free subscription)
-- طُبِّقت كهجرة: auto_provision_free_subscription
-- ----------------------------------------------------------------------------
-- السبب: منيو القدرات (PCR) يشتق باقة المطعم من جدول subscriptions
-- (القيمة = override ← اشتراك الباقة ← enabled_global). وبما أن enabled_global=false
-- لكل القدرات، فالمطعم بلا اشتراك تُقفل عليه كل الصفحات (حتى «الرئيسية»).
-- كان التسجيل الذاتي لا يُنشئ اشتراكاً → كل مطعم جديد مقفل بالكامل.
-- الحل: تريغر يمنح الباقة المجانية (أرخص باقة فعّالة، سعر 0) عند إنشاء المطعم،
-- + backfill لأي مطعم قائم بلا اشتراك فعّال. idempotent وSECURITY DEFINER (يتجاوز RLS).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.provision_free_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id uuid;
  v_plan_name text;
  v_cycle text;
BEGIN
  -- لا نكرّر إن كان للمطعم اشتراك فعّال أصلاً (idempotent)
  IF EXISTS (SELECT 1 FROM subscriptions s WHERE s.restaurant_id = NEW.id AND s.status IN ('active','trialing','past_due')) THEN
    RETURN NEW;
  END IF;
  -- الباقة المجانية = أرخص باقة فعّالة (سعر 0)
  SELECT id, name, billing_cycle INTO v_plan_id, v_plan_name, v_cycle
  FROM plans WHERE is_active = true AND price = 0
  ORDER BY sort_order, price LIMIT 1;
  IF v_plan_id IS NULL THEN
    RETURN NEW; -- لا باقة مجانية مُعرّفة → لا نفعل شيئاً (غير كاسر)
  END IF;
  INSERT INTO subscriptions (restaurant_id, plan_id, plan_label, amount, billing_cycle, status)
  VALUES (NEW.id, v_plan_id, v_plan_name, 0, COALESCE(v_cycle, 'yearly'), 'active');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_provision_free_subscription ON public.restaurants;
CREATE TRIGGER trg_provision_free_subscription
AFTER INSERT ON public.restaurants
FOR EACH ROW EXECUTE FUNCTION public.provision_free_subscription();

-- Backfill: أي مطعم قائم بلا اشتراك فعّال يحصل على الباقة المجانية
INSERT INTO public.subscriptions (restaurant_id, plan_id, plan_label, amount, billing_cycle, status)
SELECT r.id, p.id, p.name, 0, COALESCE(p.billing_cycle, 'yearly'), 'active'
FROM public.restaurants r
CROSS JOIN LATERAL (
  SELECT id, name, billing_cycle FROM public.plans WHERE is_active = true AND price = 0 ORDER BY sort_order, price LIMIT 1
) p
WHERE NOT EXISTS (
  SELECT 1 FROM public.subscriptions s WHERE s.restaurant_id = r.id AND s.status IN ('active','trialing','past_due')
);
