#!/usr/bin/env bash
set -euo pipefail

# Verifies that PostgREST's Staging schema cache resolves every Marketing CMS RPC.
# Administrative calls deliberately use the anon key and must return 401 rather than PGRST schema errors.
cd "$(dirname "$0")/../marketing-ssr"
set -a
. ./.env.local
set +a

base="$NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc"
key="$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
results="/tmp/marketing-rpc-cache-results.tsv"
printf 'rpc\tstatus\tpgrst_error\n' > "$results"

check() {
  local rpc="$1"
  local payload="$2"
  local body="/tmp/marketing-rpc-${rpc}.json"
  local status
  status=$(curl -sS -o "$body" -w '%{http_code}' -X POST "$base/$rpc" \
    -H "apikey: $key" \
    -H "authorization: Bearer $key" \
    -H 'content-type: application/json' \
    --data "$payload")
  local pgrst
  pgrst=$(grep -Eo 'PGRST[0-9]+' "$body" | head -1 || true)
  printf '%s\t%s\t%s\n' "$rpc" "$status" "${pgrst:-}" | tee -a "$results"
}

zero='00000000-0000-0000-0000-000000000000'
check admin_create_marketing_page '{"p_slug":"cache-probe","p_title":"Cache probe","p_locale":"ar","p_description":null,"p_seo":{},"p_template":"marketing"}'
check admin_duplicate_marketing_page "{\"p_source_page_id\":\"$zero\",\"p_target_slug\":\"cache-probe-copy\",\"p_locale\":\"ar\"}"
check admin_archive_marketing_page "{\"p_page_id\":\"$zero\"}"
check admin_restore_marketing_page "{\"p_page_id\":\"$zero\"}"
check admin_unpublish_marketing_page "{\"p_page_id\":\"$zero\",\"p_locale\":\"ar\"}"
check admin_delete_marketing_page "{\"p_page_id\":\"$zero\"}"
check marketing_create_draft "{\"p_page_id\":\"$zero\",\"p_locale\":\"ar\"}"
check admin_get_marketing_revision "{\"p_revision_id\":\"$zero\"}"
check admin_list_marketing_revisions "{\"p_page_id\":\"$zero\",\"p_locale\":\"ar\"}"
check admin_save_marketing_draft "{\"p_revision_id\":\"$zero\",\"p_title\":\"Cache probe\",\"p_description\":null,\"p_seo\":{},\"p_sections\":[]}"
check marketing_publish_revision "{\"p_revision_id\":\"$zero\"}"
check marketing_schedule_revision "{\"p_revision_id\":\"$zero\",\"p_scheduled_for\":\"2030-01-01T00:00:00Z\"}"
check marketing_restore_revision "{\"p_revision_id\":\"$zero\"}"
check admin_open_marketing_settings_draft '{"p_locale":"ar"}'
check admin_get_marketing_settings '{"p_locale":"ar"}'
check admin_save_marketing_settings_draft "{\"p_revision_id\":\"$zero\",\"p_data\":{}}"
check admin_publish_marketing_settings_revision "{\"p_revision_id\":\"$zero\"}"
check admin_list_marketing_media '{"p_query":null,"p_limit":60,"p_offset":0}'
check admin_register_marketing_media '{"p_bucket":"marketing-media","p_object_path":"cache/probe.png","p_mime_type":"image/png","p_byte_size":1,"p_alt_text":{},"p_caption":{},"p_metadata":{}}'
check admin_update_marketing_media "{\"p_media_id\":\"$zero\",\"p_alt_text\":{},\"p_caption\":{},\"p_metadata\":{}}"
check admin_delete_marketing_media "{\"p_media_id\":\"$zero\"}"
check marketing_public_page '{"p_slug":"home","p_locale":"ar"}'
check marketing_public_pages '{"p_locale":"ar"}'
check marketing_preview_page '{"p_token":"invalid-cache-probe-token"}'
check marketing_create_preview_token "{\"p_revision_id\":\"$zero\",\"p_ttl_minutes\":30}"

if grep -q 'PGRST' "$results"; then
  echo "PostgREST schema cache failure detected" >&2
  exit 1
fi

echo "All Marketing CMS RPC names resolved by Staging PostgREST schema cache."
