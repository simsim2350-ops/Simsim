# Staff architecture findings

## Live data model

`public.restaurant_members` uses `restaurant_id`, `user_id`, `username`, `role`, `allowed_pages`, `branch_scope`, and `is_active`. The live role constraint permits `manager`, `cashier`, and `staff`. It currently has three rows. `branch_scope` is a single text value, not a multi-branch relation.

## Existing enforcement

The `members_owner_manage` RLS policy requires `is_restaurant_owner(restaurant_id)` for all owner management of employee memberships. A separate `members_self_read` policy allows a staff user to read only their own membership. The `orders_access` policy combines restaurant access with an owner check or one scalar `member_branch_scope(restaurant_id)` value; it accepts `all`, a matching branch ID text, or a legacy null scope.

## Capability model

The client role presets and capability metadata are UI-level. `ROLE_PRESETS` currently gives manager broad non-owner pages, cashier orders only, and staff no default pages. Page visibility is checked by `canAccess`, while the registry keeps `staff`, `settings`, `billing`, `dashboard`, and selected other pages owner-only.

## Reporting and branch scope

`get_analytics_summary`, `get_advanced_analytics`, `get_customers_summary`, and `get_customers_insights` are `SECURITY INVOKER` functions, so their underlying `orders` reads are subject to RLS. The reporting functions accept a single optional branch ID; passing no branch lets RLS determine the rows available. The advanced analytics function emits a branch-performance list from `branches`, so branch scope must be considered when rendering or extending reports.

## Activity availability

There is no existing restaurant-staff activity log source in the inspected code or schema. The only audit surface found is platform-admin audit data. The staff UI must display an unavailable state for last activity instead of fabricating an event. A staff last-login field also is not present on `restaurant_members`; any true login timestamp would require new trusted server-side capture or an explicit authenticated view over the auth source.
