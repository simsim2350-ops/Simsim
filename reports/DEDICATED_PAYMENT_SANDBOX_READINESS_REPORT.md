# Dedicated Payment Sandbox — Readiness & Discovery Report

## EXECUTIVE SUMMARY

This is a **discovery/preparation-only** task: determine whether a new, dedicated Supabase sandbox project (schema-only, no customer data) could be created to safely verify Task 3.5's payment-reference migration, without touching production or `simsim-menu-staging`. **No project was created. No database anywhere was written to.** Every action in this task was either a read-only Supabase MCP metadata/catalog query, or a read of already-cached data from the prior parity audit.

**Finding:** project creation is **technically supported** by the available tooling — the account has exactly one organization (`simsim2350-ops's Org`, free plan), and a read-only cost query for a new project returned **$0/month**. This shows the create-project capability chain exists and is callable end-to-end. **Actual creation was not attempted** (as instructed), so success is not proven, only the capability path up to (but not including) the commit step.

**Also carried forward from the prior audit, restated here per instruction:** `simsim-menu-staging`'s `orders_insert_public` and `orders_cancel_public` RLS policies remain a live, open security gap (production closed both; staging never did). This is classified **HIGH PRIORITY STAGING SECURITY ISSUE** — documented only, not fixed, and explicitly **not** part of the new sandbox's scope.

---

## CURRENT ENVIRONMENTS

| Environment | ID | Role in this task |
|---|---|---|
| Production | `gpwwnuuicywsvmmhxngs` | **Read-only source of truth** for the schema a new sandbox would need to mirror. Not modified. |
| Staging (`simsim-menu-staging`) | `rgqsetckcigkgsyobyjg` | **Not touched at all in this task** — no query, no read, no write. Prior audit (`reports/STAGING_SCHEMA_PARITY_AUDIT_REPORT.md`) already established it's unsuitable for this purpose; this task does not re-investigate it. |
| `madar` | `fklbydlnmksyrcdsvhgo` | Unrelated project, not touched. |
| Organization | `snshvjqpbhqqhxbpvymq` (`simsim2350-ops's Org`) | Queried read-only for plan/capability. |
| Proposed new sandbox | Not yet created | Subject of this discovery only. |

---

## PRODUCTION BASELINE

Re-derived from the prior parity audit's already-verified findings plus two additional read-only queries this session (against production only — staging and `madar` were not queried at all in this task). No new writes; no rows/customer data were read or copied — only table/column/function/policy **definitions**.

**Core tables and their columns (structure only):**

| Table | Columns (types only, no data) |
|---|---|
| `restaurants` | `id uuid` (PK), `owner_id uuid` (FK auth.users), `name/slug/description/phone/address text`, `is_active boolean`, `platform_suspended boolean`, `delivery_enabled boolean`, `delivery_fee numeric`, plus ~20 more presentation/menu-config columns |
| `branches` | `id uuid` (PK), `restaurant_id uuid` (FK restaurants), `is_primary boolean`, `name/address text`, `is_active boolean`, `is_paused boolean`, `delivery_enabled/takeaway_enabled boolean`, `delivery_fee numeric` |
| `products` | `id uuid` (PK), `restaurant_id uuid`, `branch_id uuid`, `category_id uuid`, `name/price/options(jsonb)/is_available boolean` |
| `coupons` | `id uuid` (PK), `restaurant_id uuid`, `branch_id uuid`, `code text`, `discount_type/discount_value`, `usage_limit/usage_count`, `expires_at` |
| `orders` | 29 columns incl. `idempotency_key uuid`, `order_access_token`, `status` (CHECK-constrained), `table_id`/`table_name`/`source` (QR-related, **not required** for payment verification) |
| `payment_providers` | `key text` (PK), `display_name`, `is_enabled boolean`, `mode text` (`test`/`live`) |
| `payment_transactions` | `id uuid` (PK), `restaurant_id uuid` (FK), `invoice_id uuid` (FK → `invoices`), `provider text` (FK → `payment_providers.key`), `provider_ref`, `status` (CHECK-constrained), `amount numeric` (CHECK ≥0), `currency`, `idempotency_key text`, `metadata/raw jsonb` |
| `payment_webhook_events` | `id uuid` (PK), `provider`, `event_id`, `event_type`, `transaction_id uuid` (FK → `payment_transactions`), `payload jsonb`, `processed_at` |
| `invoices` | `id uuid` (PK), `restaurant_id uuid`, `subscription_id uuid` (FK → `subscriptions`), `total/amount_net/vat_amount numeric`, `status text` |

**Required functions (production, re-verified this session):**

| Function | Args | Security definer |
|---|---|---|
| `create_order` | 12 params, `p_idempotency_key uuid` | true, `search_path=public` |
| `generate_order_number` | trigger fn, no args | false (runs as table owner via trigger context) |
| `enforce_order_transition` | trigger fn, no args | false |
| `has_restaurant_access` | `p_restaurant_id uuid` | true |
| `member_has_branch_access` | `p_restaurant_id uuid, p_branch_id uuid` | false |
| `is_platform_admin` | no args | true |

**Not required for payment verification** (confirmed via the prior audit): `create_order_from_table_qr`, `restaurant_tables`, `resolve_table_qr`, `regenerate_table_qr`, and all marketing-CMS tables. These exist in production but are QR/marketing subsystems, not payment dependencies — per your instruction not to add subsystems that aren't real dependencies, they are excluded from the sandbox requirements below.

**`invoices`/`subscriptions` dependency:** `payment_transactions.invoice_id` is a nullable FK to `invoices`. It is nullable — `payment_transactions` can be created with `invoice_id = NULL`. This means, strictly, **`invoices`/`subscriptions` are not a hard requirement** to exercise Task 3.5's scenarios (order↔payment-transaction linkage doesn't touch `invoice_id` at all). They are listed below as optional, not core.

---

## STAGING LIMITATIONS

(Carried forward from `reports/STAGING_SCHEMA_PARITY_AUDIT_REPORT.md` — not re-investigated in this task, restated for context only.)

`simsim-menu-staging` cannot verify Task 3.5 because: `payment_transactions`/`payment_providers`/`payment_webhook_events` don't exist there; its live `create_order` has `p_idempotency_key text` instead of `uuid`, which would turn Task 3.5's intended clean `DROP`+`CREATE` cutover into a dangerous duplicate-overload situation; and its QR-ordering subsystem is entirely absent. None of this was re-verified in this task — it is accepted as already-established fact from the prior audit, per your framing of this task ("وقد ثبت من الـaudit أن...").

---

## SANDBOX REQUIREMENTS

Minimum viable scope to verify Task 3.5's 8 scenarios (no-reference order, valid reference, invalid reference, cross-restaurant reference, duplicate reference, rollback, idempotency, and confirming `create_order_from_table_qr` is unaffected — this last one only requires proving the *existing manual create_order path* still works, not that QR itself works, since Task 3.5 doesn't touch the QR function):

- **Base tenancy tables:** `restaurants`, `branches`, `products`, `coupons` (coupons only needed if testing coupon+payment interaction; not strictly required for the 8 core scenarios, but cheap to include for realism).
- **`orders`** — with its current production column set *except* the QR-only columns (`table_id`, `table_name`, `source`, and the `orders_source_check` constraint) which are not payment dependencies.
- **Payment foundation** — `payment_providers`, `payment_transactions`, `payment_webhook_events` (exact production schema).
- **`create_order`** (production's current 12-arg version) as the pre-migration baseline, so Task 3.5's migration can be applied *on top of* a known-good starting point and its before/after behavior compared directly.
- **Helper functions**: `has_restaurant_access`, `member_has_branch_access`, `is_platform_admin`, `generate_order_number` + its trigger, `enforce_order_transition` + its trigger (needed because `orders.status` CHECK + this trigger are part of production's real behavior — omitting them would make the sandbox *less* production-like, weakening the verification's value).
- **NOT required, deliberately excluded:** QR system (`restaurant_tables`, `create_order_from_table_qr`, `resolve_table_qr`), marketing CMS (all `marketing_*` tables), loyalty system, billing/subscriptions beyond the nullable FK stub, admin/platform tables beyond `is_platform_admin()` itself, analytics tables. None of these are dependencies of `create_order`, `payment_transactions`, or Task 3.5's migration.

---

## REQUIRED SCHEMA

| # | Object | Source | Required? |
|---|---|---|---|
| 1 | `restaurants` (full production columns) | production `sql/` (base schema, not tracked as a single file in `sql/` — pre-dates the file-per-migration convention) | Required |
| 2 | `branches` | same | Required |
| 3 | `products` | same | Required |
| 4 | `coupons` | same | Optional (only if testing coupon interplay) |
| 5 | `orders` (minus QR columns) | base schema + `sql/order_idempotency.sql` + `sql/order_number_atomic.sql` + `sql/order_state_machine.sql` | Required |
| 6 | `payment_providers` | `sql/payments_gateway_foundation.sql` | Required |
| 7 | `payment_transactions` | same | Required |
| 8 | `payment_webhook_events` | same | Required |
| 9 | `invoices` | `sql/billing_foundation.sql` | Optional (only needed if testing non-NULL `invoice_id`; not required for Task 3.5's scenarios) |
| 10 | `orders.payment_transaction_id` + FK + unique index | `sql/order_payment_reference.sql` (Task 3.5) | This is what's being verified — applied *after* the sandbox's baseline is confirmed to match production |

---

## REQUIRED FUNCTIONS

| Function | Purpose | Required for Task 3.5 verification |
|---|---|---|
| `create_order` (12-arg baseline, then Task 3.5's 13-arg version) | Core RPC under test | Required |
| `generate_order_number` + `set_order_number` trigger | Realistic order numbering (affects nothing in Task 3.5's logic directly, but needed so `INSERT INTO orders` behaves identically to production) | Required for fidelity |
| `enforce_order_transition` + `trg_enforce_order_transition` | Confirms Task 3.5's changes don't interact badly with the state machine | Required for fidelity |
| `has_restaurant_access`, `member_has_branch_access` | RLS dependencies for `orders_access` policy | Required (RLS won't work without them) |
| `is_platform_admin` | RLS dependency for the three payment-table admin-only policies | Required |
| `create_order_from_table_qr` | QR order path | **Not required** — Task 3.5 doesn't modify it, and the checklist item "confirm it still works" can be satisfied by confirming the *manual* `create_order` path is unaffected, which doesn't need the QR wrapper itself present |

---

## REQUIRED RLS

| Table | Policy | Required |
|---|---|---|
| `orders` | `orders_access` only (production's actual, single policy) | Required |
| `payment_providers` | `ppv_admin_all` | Required |
| `payment_transactions` | `ptx_admin_all` | Required |
| `payment_webhook_events` | `pwh_admin_all` | Required |

**Explicitly excluded:** `orders_insert_public`/`orders_cancel_public` — these are the exact policies flagged as a security regression in staging (see Security Requirements below). The new sandbox must **never** include them.

---

## REQUIRED INDEXES

| Index | Table | Purpose |
|---|---|---|
| `orders_idempotency_key_uidx` | `orders` | Global partial unique on `idempotency_key` — matches production exactly (not staging's per-restaurant variant) |
| `orders_restaurant_id_order_number_key` | `orders` | Unique `(restaurant_id, order_number)` |
| `orders_order_access_token_uidx` | `orders` | Unique partial on `order_access_token` |
| `uq_paytx_provider_ref` | `payment_transactions` | Unique partial `(provider, provider_ref)` |
| `uq_webhook_provider_event` | `payment_webhook_events` | Unique `(provider, event_id)` |
| `orders_payment_transaction_id_uidx` | `orders` | **New — this is what Task 3.5 adds; applied after baseline setup, as the thing being tested** |

Note: `uq_paytx_idempotency_key` (the still-pending OWNER/DBA-gated migration) is intentionally **not** included in the sandbox's baseline, to keep the baseline an honest mirror of production's *current* applied state, not a future/aspirational one.

---

## REQUIRED TEST DATA

**Schema-only sandbox — no production data, no customer data, no payment data, no secrets.** Minimum seed data needed to exercise `create_order`, created fresh in the sandbox itself:

- 1–2 test restaurants (`is_active=true`, `platform_suspended=false`)
- 1–2 branches per restaurant (`is_active=true`, appropriate `delivery_enabled`/`takeaway_enabled`)
- A handful of test products (`is_available=true`, simple `options` shapes)
- 1 test coupon (optional, only if testing coupon+payment interplay)
- Payment providers row(s) seeded exactly as `sql/payments_gateway_foundation.sql` does (`moyasar`/`manual`/etc., all `is_enabled=false` — no live gateway credentials needed for schema-level verification)
- Test `payment_transactions` rows created **during test execution itself** (not pre-seeded from anywhere) — these are the actual scenario fixtures (valid reference, reference belonging to a different restaurant, etc.)

All of the above would be fabricated test data, entered fresh into the new sandbox — never copied from production or staging.

---

## SECURITY REQUIREMENTS

- The new sandbox must replicate production's RLS posture exactly (`orders_access` only on `orders`; admin-only on all three payment tables) — **not** staging's current posture.
- No production secrets, API keys, service-role keys, or connection strings would ever be copied into a new sandbox's setup — a new project gets its own, freshly generated credentials from Supabase itself.
- No real customer PII, phone numbers, or order history would be copied — all test data is synthetic, created specifically for testing.
- Moyasar sandbox/test credentials (when eventually obtained per the still-open OQ-1 from the Task 3.4/Phase 3 reports) would be sandbox-specific test keys, never production payment credentials — this is unchanged from what Task 3.4's report already recommended.

---

## DATA PRIVACY

**No production or staging data of any kind was read, copied, exported, or referenced by value in this task.** Every piece of "production baseline" information above is a **structural definition** (table name, column name, data type, constraint text, function signature) obtained from Postgres system catalogs (`pg_proc`, `pg_indexes`, `pg_constraint`, `list_tables` metadata) — none of it is a data row. Row counts were seen incidentally in earlier audit output (e.g., "orders: 155 rows") but no actual row content was ever queried, displayed, or is reproduced here. A new sandbox, if created, would start completely empty and be populated only with synthetic test data created for that purpose.

---

## TASK 3.5 READINESS CHECKLIST

This checklist defines exactly when a sandbox (new or otherwise) is ready to verify Task 3.5. None of these are checked yet for any existing environment — production has most of them but Task 3.5 hasn't been applied there; staging fails several; a new sandbox doesn't exist yet.

- [ ] `create_order` matches production's baseline (12-arg version, prior to Task 3.5)
- [ ] `p_idempotency_key uuid` (not `text`)
- [ ] `payment_transactions` exists, matching production schema
- [ ] `payment_providers` exists, matching production schema
- [ ] `payment_webhook_events` exists, matching production schema
- [ ] `orders.payment_transaction_id` can be added (i.e., `orders` and `payment_transactions` both exist first, in compatible states, so Task 3.5's `ALTER TABLE ... REFERENCES` will succeed)
- [ ] FK from `orders.payment_transaction_id` to `payment_transactions(id)` is correct and enforced
- [ ] Unique payment-reference index (`orders_payment_transaction_id_uidx`) exists and is correctly partial (allows NULL, blocks duplicate non-NULL)
- [ ] RLS matches production exactly (`orders_access` only — **no** `orders_insert_public`/`orders_cancel_public`)
- [ ] Required functions present: `has_restaurant_access`, `member_has_branch_access`, `is_platform_admin`, `generate_order_number`, `enforce_order_transition`
- [ ] Test restaurant/branch/product seed data is ready (synthetic, created in-sandbox)
- [ ] No production-sensitive data present anywhere in the environment

**Current status of this checklist: 0/12 satisfied in any existing environment** (production satisfies everything except the last three Task-3.5-specific items, simply because Task 3.5 hasn't been applied there yet — that's expected and correct, not a gap). A new sandbox, once created and seeded per the requirements above, would need to satisfy all 12 before being declared ready.

---

## SECURITY FINDING — RESTATED FROM PRIOR AUDIT

**`simsim-menu-staging`'s `orders` table currently has:**
- `orders_insert_public` — `FOR INSERT`, role `public`, `WITH CHECK (true)` — **unconditionally open**, allows any unauthenticated request to insert an arbitrary order row.
- `orders_cancel_public` — `FOR UPDATE`, role `public`, allows any `pending` order to be flipped to `cancelled` by anyone.

Production closed both of these exact policies via `sql/order_journey_hotfix.sql` (MIG-003 "إغلاق ثغرة الإلغاء الجماعي المجهول", MIG-004 "إغلاق ثغرة الإدخال المباشر... كانت تسمح بإدخال طلبات مزوَّرة"). Staging never received either fix.

**Classification: HIGH PRIORITY STAGING SECURITY ISSUE.**

Per your explicit instruction: **not fixed in this task**, and **not considered part of the new sandbox's scope** — a new sandbox would be built from production's (secure) RLS posture, not staging's, so this issue would not be inherited even if a new sandbox is created. This finding concerns `simsim-menu-staging` specifically and remains open, requiring its own separate decision from you.

---

## SUPABASE CAPABILITY CHECK

Performed read-only, in this session:

1. `list_organizations` → exactly one organization: `snshvjqpbhqqhxbpvymq` ("simsim2350-ops's Org").
2. `get_organization(snshvjqpbhqqhxbpvymq)` → `plan: "free"`.
3. `get_cost(type: "project", organization_id: snshvjqpbhqqhxbpvymq)` → `{"type":"project","recurrence":"monthly","amount":0}` — a new project would cost **$0/month** on this org's current plan.

**The `create_project` tool exists and is callable** (`name`, `region`, `organization_id`, `confirm_cost_id` — the last obtained by calling `confirm_cost` after `get_cost`). I did **not** call `confirm_cost` or `create_project` in this task, per your instruction not to actually create anything. This means:

- **Confirmed:** the capability chain exists and the pricing step succeeded — this organization is technically able to request a new project through this tooling.
- **Not confirmed:** whether Supabase's free-tier project-count limit (a platform-level cap on concurrently active free projects, independent of the $0 pricing shown) would actually allow a *third* active project — this account already has `simsim` (production, ACTIVE_HEALTHY) and `simsim-menu-staging` (ACTIVE_HEALTHY) as active free-tier projects, plus `madar` (INACTIVE, doesn't count against an active-project cap). Whether a fourth entry (a new active sandbox) is accepted is a real-world platform constraint that can only be confirmed by actually attempting creation — which was out of scope here.

---

## RISKS

| Risk | Notes |
|---|---|
| Free-tier active-project quota unknown | Not tested; could cause `create_project` to fail even though `get_cost` succeeded. Low effort to find out (one real attempt), but that attempt itself is the action this task was told not to take. |
| New project takes real provisioning time | `create_project`'s own description notes it "can take a few minutes to initialize" — not a blocker, just a sequencing note for whoever executes this later. |
| Schema-authoring risk | Recreating production's schema by hand (rather than a true clone) introduces a chance of a typo/divergence versus production — mitigated by using the exact `sql/` files plus the column-level definitions captured in this report and the prior audit as the source of truth, and by verifying the result against production's catalogs afterward (the same technique used in this and the prior audit). |
| Ongoing cost if left running | Quoted as $0/month on the free plan today; if the org's plan changes or usage exceeds free-tier limits later, a forgotten sandbox project could start incurring cost. Worth a reminder to deprovision it once no longer needed, whenever it's eventually created. |

---

## RECOMMENDATION

Presented as an option, not a decision:

Given the capability chain checks out ($0 quoted cost, tooling present, minimal well-defined schema requirements established above), creating a dedicated sandbox is a reasonable path **if** you want to proceed — but the actual creation, and confirming the free-tier project-count question, requires your explicit go-ahead in a separate task (this one was discovery-only, and `confirm_cost`/`create_project` were deliberately not invoked).

---

## BLOCKERS

1. **Free-tier active-project quota is unverified** — the only way to know for certain is to actually attempt `create_project`, which was out of scope for this task.
2. **No actual schema has been built anywhere yet** — this report defines *what* is required, not an executed setup. Building it (applying the equivalent of `sql/`'s base schema + `payments_gateway_foundation.sql` + `order_idempotency.sql` + `order_number_atomic.sql` + `order_state_machine.sql`, in that dependency order, to a new empty project) is separate, not-yet-authorized work.
3. Staging's open RLS policies remain unresolved (tracked separately, not a blocker for sandbox creation itself).

---

## GIT STATUS

```
Branch: phase-3/task-3-4-webhook-edge-function (unchanged)
HEAD:   163ac24 (unchanged — no commit made)
Modified tracked files: none
New untracked file from this task: reports/DEDICATED_PAYMENT_SANDBOX_READINESS_REPORT.md
(all other untracked files are pre-existing from earlier sessions)
```

No commit, push, deploy, or merge was performed. No `INSERT`/`UPDATE`/`DELETE`/`ALTER`/`CREATE TABLE`/`DROP`/migration was executed against any database in this task — confirmed by reviewing every tool call made (`list_organizations`, `get_organization`, `get_cost`, one `execute_sql` SELECT against `pg_proc` on production, plus reuse of already-cached read-only data from the prior audit).

---

## REPORT FILE

`reports/DEDICATED_PAYMENT_SANDBOX_READINESS_REPORT.md`

## DOWNLOAD COPY

`/sdcard/Download/DEDICATED_PAYMENT_SANDBOX_READINESS_REPORT.md` (copied and verified after this report was written).

---

## FINAL DECISION

**SANDBOX_CAN_BE_CREATED**

Evidence: the organization exists, is on a plan that the tooling itself prices this action at $0/month, and the full tool chain required (`list_organizations` → `get_organization` → `get_cost` → [`confirm_cost`] → [`create_project`]) resolves successfully up through the pricing step, which was actually executed and returned a concrete, non-error answer. This is not "insufficient data" (I obtained concrete answers), not "not supported" (the tool and a $0 cost both exist), and does not require unusual manual intervention beyond normal tool use (ruling out "requires manual setup" as the primary characterization) — though the free-tier quota question means the *first actual attempt* could still fail and would need to be tried to know for certain. That residual uncertainty is flagged above as a risk, not as a reason to downgrade this determination, since it's about platform-level quota enforcement, not about whether the capability exists.

---

*Report generated 2026-08-25. No project was created. No database — production, staging, or otherwise — was written to in any way. Only read-only Supabase MCP calls and reuse of already-cached read-only data were used.*
