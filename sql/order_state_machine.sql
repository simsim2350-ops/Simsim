-- Customer Order Journey — PHASE 5 / TASK-STM-002 (ADR-50)
-- نُفِّذ فعلياً على قاعدة الإنتاج gpwwnuuicywsvmmhxngs. اختُبر داخل معاملة ROLLBACK قبل التنفيذ
-- (صفر صفوف مخالفة موجودة قبل إضافة القيد — تحقّق مباشر: 155 صفاً كلها cancelled/completed).
-- المصفوفة تطابق §4.2 من وثيقة "Customer Order Journey — E2E"، بقرار المالك الصريح على §4.4:
-- D-09 = B1 — نافذة 60 ثانية من آخر تحديث فعلي للسماح بخطوة تراجع واحدة للخلف فقط.
-- Rollback: DROP TRIGGER trg_enforce_order_transition (فوري، بلا فقد بيانات) ثم DROP CONSTRAINT
-- orders_status_check (لا حاجة عملياً — لا صفوف مخالفة).

ALTER TABLE public.orders ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (status IN ('pending','preparing','ready','completed','cancelled'));

CREATE OR REPLACE FUNCTION public.enforce_order_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_undo_window interval := interval '60 seconds';
begin
  -- تحديث لا يغيّر status (مثال: toggleItemUnavailable يعدّل items/subtotal/tax/total فقط) — غير مقيَّد هنا
  if new.status = old.status then
    return new;
  end if;

  -- المسموح دائماً: تقدّم دورة الحياة الطبيعي + الإلغاء من أي حالة غير نهائية
  if (old.status, new.status) in (
    ('pending', 'preparing'),
    ('pending', 'cancelled'),
    ('preparing', 'ready'),
    ('preparing', 'cancelled'),
    ('ready', 'completed'),
    ('ready', 'cancelled')
  ) then
    return new;
  end if;

  -- D-09 = B1: تراجع خطوة واحدة للخلف مسموح فقط خلال 60 ثانية من آخر تحديث فعلي على الصف
  if (old.status, new.status) in (
    ('preparing', 'pending'),
    ('ready', 'preparing'),
    ('completed', 'ready')
  ) then
    if now() - old.updated_at <= v_undo_window then
      return new;
    end if;
    raise exception 'invalid_order_transition: undo window expired (% > %)', now() - old.updated_at, v_undo_window;
  end if;

  raise exception 'invalid_order_transition: % -> % is not allowed', old.status, new.status;
end;
$function$;

CREATE TRIGGER trg_enforce_order_transition
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_order_transition();
