-- وسم يدوي مستقل للأصناف «الأكثر طلبًا».
-- لا يعيد استخدام is_featured؛ يبقى is_featured مخصصًا لقسم «مختارات المطعم / مميز».
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_most_ordered boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.products.is_most_ordered IS
  'Manual restaurant-owner flag for products displayed as الأكثر طلبًا; independent from is_featured.';
