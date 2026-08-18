-- إزالة وسم «الأكثر طلبًا» المستقل.
-- تعتمد القائمة المعاد تسميتها على products.is_featured فقط.

ALTER TABLE public.products
  DROP COLUMN IF EXISTS is_most_ordered;
