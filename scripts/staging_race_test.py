import concurrent.futures
import json
import sys
import uuid
import requests

URL = "https://rgqsetckcigkgsyobyjg.supabase.co/rest/v1/rpc/create_order"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJ0eXAiOiJKV1QifQ"  # replaced at runtime

if len(sys.argv) != 2:
    raise SystemExit("usage: staging_race_test.py <anon-key>")
KEY = sys.argv[1]
run_id = uuid.uuid4().hex[:16]
payload = {
    "p_restaurant_id": "06a6b955-4842-4fcb-a0f1-264484a1c323",
    "p_branch_id": "6a9018b7-e254-43ea-aafd-c203c47783b3",
    "p_table_number": "race",
    "p_delivery_address": None,
    "p_customer_name": "Race Test",
    "p_customer_phone": "500000000",
    "p_type": "dine_in",
    "p_items": [{"product_id": "57f16865-e647-4816-804a-ccf27fee0961", "quantity": 1, "options": []}],
    "p_notes": "staging race",
    "p_coupon_code": "RACE_STAGING",
    "p_client_total": 5,
    "p_idempotency_key": "race-order-key-0001",
}
headers = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

def call(index):
    request_payload = dict(payload)
    request_payload['p_idempotency_key'] = f'race-{run_id}-{index:04d}'
    r = requests.post(URL, headers=headers, json=request_payload, timeout=30)
    return {"status": r.status_code, "body": r.json()}

with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    results = list(pool.map(call, [1, 2]))
print(json.dumps(results, separators=(",", ":")))
successes = sum(1 for x in results if x["status"] == 200 and isinstance(x["body"], list) and x["body"] and x["body"][0].get("id"))
rejections = sum(1 for x in results if x["status"] == 400 and 'usage limit' in str(x["body"]).lower())
if successes != 1 or rejections != 1:
    raise SystemExit("expected one successful coupon order and one usage-limit rejection")
