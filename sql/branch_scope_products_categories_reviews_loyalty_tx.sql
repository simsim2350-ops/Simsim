-- SIMSIM_SECURITY_AUDIT_REPORT.md — إصلاح High Finding #2/#3/#4 و Medium Finding #5.
--
-- المشكلة: products_access/categories_access/reviews_access/loyalty_tx_read كانت تتحقّق من
-- has_restaurant_access(restaurant_id) فقط (مستوى المطعم) بلا member_has_branch_access(...)
-- (مستوى الفرع) — رغم أن الأربعة تحمل عمود branch_id وأن restaurant_members.branch_scope/branch_ids
-- مصمَّمان صراحةً لتقييد الموظف بفرع واحد (ADR-22). orders كانت تستخدم النمط الصحيح بالفعل
-- (has_restaurant_access AND member_has_branch_access) — هذا التصحيح يُطبّق نفس النمط الموجود
-- والمعتمد فعلياً في المشروع، بلا اختراع آلية جديدة.
--
-- ملاحظة NULL: products/categories لهما branch_id NOT NULL (لا حاجة لمعالجة NULL). reviews/
-- loyalty_transactions لهما branch_id قابل لـNULL (يعني "عام لكل الفروع" — ADR-22) — لذلك تُعامَل
-- صراحةً كصفّ متاح لأي عضو مطعم بصرف النظر عن نطاق فرعه، بدل أن تُحجَب صامتاً (NULL AND ... = NULL
-- في RLS، وهو ما كان سيحجب هذه الصفوف عن الموظفين المقيَّدين بفرع دون أي مبرر تصميمي).
--
-- لا يمسّ هذا أي سياسة "public read" منفصلة (products_public_read/categories_public_read) —
-- تلك تبقى كما هي بلا أي تغيير؛ المنيو العام يستمر بالعمل تماماً كما كان.
-- Owner/Manager: is_restaurant_owner()، وهي جزء من كلٍّ من has_restaurant_access() و
-- member_has_branch_access() الفعليتين، تبقى تمنحهما وصولاً كاملاً عبر كل الفروع كما هو مصمَّم.

-- products
drop policy if exists "products_access" on public.products;
create policy "products_access" on public.products
  for all
  using (
    public.has_restaurant_access(restaurant_id)
    and public.member_has_branch_access(restaurant_id, branch_id)
  )
  with check (
    public.has_restaurant_access(restaurant_id)
    and public.member_has_branch_access(restaurant_id, branch_id)
  );

-- categories
drop policy if exists "categories_access" on public.categories;
create policy "categories_access" on public.categories
  for all
  using (
    public.has_restaurant_access(restaurant_id)
    and public.member_has_branch_access(restaurant_id, branch_id)
  )
  with check (
    public.has_restaurant_access(restaurant_id)
    and public.member_has_branch_access(restaurant_id, branch_id)
  );

-- reviews (branch_id قابل لـNULL = عام لكل الفروع)
drop policy if exists "reviews_access" on public.reviews;
create policy "reviews_access" on public.reviews
  for all
  using (
    public.has_restaurant_access(restaurant_id)
    and (branch_id is null or public.member_has_branch_access(restaurant_id, branch_id))
  )
  with check (
    public.has_restaurant_access(restaurant_id)
    and (branch_id is null or public.member_has_branch_access(restaurant_id, branch_id))
  );

-- loyalty_transactions (قراءة فقط أصلاً — لا سياسة INSERT/UPDATE/DELETE على مستوى RLS؛
-- الكتابة الوحيدة عبر loyalty_post، دالة DEFINER منفصلة لم تُمسّ هنا). branch_id قابل لـNULL.
drop policy if exists "loyalty_tx_read" on public.loyalty_transactions;
create policy "loyalty_tx_read" on public.loyalty_transactions
  for select
  using (
    public.has_restaurant_access(restaurant_id)
    and (branch_id is null or public.member_has_branch_access(restaurant_id, branch_id))
  );
