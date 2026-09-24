-- ============================================================================
-- Rollback for phase6_migration6_campaigns_page_authorization_fix.sql
-- ----------------------------------------------------------------------------
-- Restores the EXACT original loyalty_campaigns_access policy from
-- sql/loyalty_campaigns.sql (tenant-level check only — pre-fix state).
--
-- ⚠️ Restores the MEDIUM finding documented in
-- SIMSIM_PRODUCTION_SECURITY_SIGN_OFF.md (§4 / §18 Finding #1) and re-verified
-- in SIMSIM_LOYALTY_CAMPAIGNS_AUTHORIZATION_REMEDIATION_REPORT.md: any active
-- restaurant member would once again be able to read/write campaigns
-- regardless of their allowed_pages grant. Use only for verified rollback
-- testing or an explicit owner-directed revert — never as a routine operation.
-- ============================================================================

drop policy if exists "loyalty_campaigns_access" on public.loyalty_campaigns;

create policy "loyalty_campaigns_access" on public.loyalty_campaigns
  for all using (has_restaurant_access(restaurant_id))
  with check (has_restaurant_access(restaurant_id));
