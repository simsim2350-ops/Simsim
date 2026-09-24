-- ============================================================================
-- Phase 6 — Migration 6: loyalty_campaigns Page Authorization Fix
-- ----------------------------------------------------------------------------
-- Closes the MEDIUM finding documented in SIMSIM_PRODUCTION_SECURITY_SIGN_OFF.md
-- (§4 / §18 Finding #1): loyalty_campaigns_access checked ONLY
-- has_restaurant_access(restaurant_id) — tenant-level isolation — with no
-- page-level authorization. Any ACTIVE restaurant member could read/write
-- campaigns regardless of their own allowed_pages grant, unlike every sibling
-- policy in this project (customers_access, products_access, categories_access)
-- which already pairs the tenant check with a page/branch check.
--
-- Correct page_key — established from converging live evidence, not assumed:
--   1. src/lib/loyaltyApi.js's own file header: "طبقة الوصول لبيانات الولاء
--      والتقييمات — كل استعلامات صفحة الولاء في مكان واحد". saveCampaign/
--      deleteCampaign/fetchCampaignsImpact (the loyalty_campaigns CRUD) live
--      in this exact file, under the "الحملات الموسمية (ADR-39/P3.3)" section.
--   2. src/pages/Loyalty.jsx is the ONLY importer of those three functions —
--      routed at /loyalty in src/App.jsx, guarded by <RequirePage page="loyalty">.
--   3. src/registry/features.manifest.js defines page key 'loyalty' with NO
--      required_permissions (not owner-only) — distinct from the unrelated,
--      owner-only 'marketing' page (banners/coupons, a different feature).
--   4. The sibling RPC get_campaigns_impact(uuid) — same domain, same table —
--      ALREADY uses member_has_page_access(p_restaurant_id, 'loyalty') live in
--      Production (confirmed via pg_get_functiondef before writing this
--      migration), proving 'loyalty' is the established, already-in-use
--      page_key for this exact feature today.
--
-- No branch semantics exist for loyalty_campaigns (no branch_id column — see
-- sql/loyalty_campaigns.sql's own schema) — no branch check is added here.
--
-- Pattern followed: identical DROP POLICY / CREATE POLICY structure already
-- used in commit d543637 (products_access/categories_access hardening) — no
-- new mechanism invented.
--
-- No grant change needed: member_has_page_access is already SECURITY DEFINER
-- and already EXECUTE-granted to anon + authenticated in Production (required
-- for any RLS policy to evaluate it at all) — and it already evaluates false
-- for an anon caller (auth.uid() is null), so anon remains blocked exactly as
-- before. has_restaurant_access, member_has_page_access, and every other
-- table/RPC/Edge Function are untouched.
--
-- Verified on Staging (rgqsetckcigkgsyobyjg) prior to this repository commit —
-- see SIMSIM_LOYALTY_CAMPAIGNS_AUTHORIZATION_REMEDIATION_REPORT.md for the
-- full test matrix (28/28 checks, 7 personas). NOT YET applied to Production.
-- ============================================================================

drop policy if exists "loyalty_campaigns_access" on public.loyalty_campaigns;

create policy "loyalty_campaigns_access" on public.loyalty_campaigns
  for all
  using (
    public.has_restaurant_access(restaurant_id)
    and public.member_has_page_access(restaurant_id, 'loyalty')
  )
  with check (
    public.has_restaurant_access(restaurant_id)
    and public.member_has_page_access(restaurant_id, 'loyalty')
  );
