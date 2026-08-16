import json, sys, requests
BASE='https://rgqsetckcigkgsyobyjg.supabase.co/rest/v1/rpc/'
KEY=sys.argv[1]
h={'apikey':KEY,'Authorization':f'Bearer {KEY}','Content-Type':'application/json'}
base={
'p_restaurant_id':'06a6b955-4842-4fcb-a0f1-264484a1c323','p_branch_id':'6a9018b7-e254-43ea-aafd-c203c47783b3','p_table_number':'secure','p_delivery_address':None,'p_customer_name':'Secure Test','p_customer_phone':'500000001','p_type':'dine_in','p_items':[{'product_id':'57f16865-e647-4816-804a-ccf27fee0961','quantity':1,'options':[]}],'p_notes':'secure test','p_coupon_code':None,'p_client_total':6,'p_idempotency_key':'secure-order-key-0001'
}
def post(name,p):
 r=requests.post(BASE+name,headers=h,json=p,timeout=30); return r.status_code,r.json()
s1,order1=post('create_order',base)
s2,order2=post('create_order',base)
base_different=dict(base)
base_different['p_idempotency_key']='secure-order-key-0002'
s3,order3=post('create_order',base_different)
row=order1[0] if s1==200 and order1 else {}
req={'p_orders':[{'id':row.get('id'),'access_token':row.get('access_token')}]}
wrong={'p_orders':[{'id':row.get('id'),'access_token':'wrong'}]}
ss,secure=post('get_orders_status_secure',req)
sw,wrong_body=post('get_orders_status_secure',wrong)
ct,can_read=post('can_read_order_status',{'p_topic':f"order-status:{row.get('id')}:{row.get('access_token')}"})
cf,can_read_wrong=post('can_read_order_status',{'p_topic':f"order-status:{row.get('id')}:wrong"})
sc,cancel=post('cancel_order_by_customer',{'p_order_id':row.get('id'),'p_access_token':row.get('access_token')})
sc2,cancel_again=post('cancel_order_by_customer',{'p_order_id':row.get('id'),'p_access_token':row.get('access_token')})
print(json.dumps({'first_create':(s1,order1),'duplicate_create':(s2,order2),'different_key_create':(s3,order3),'secure_status':(ss,secure),'wrong_token_status':(sw,wrong_body),'can_read_correct':(ct,can_read),'can_read_wrong':(cf,can_read_wrong),'cancel':(sc,cancel),'cancel_again':(sc2,cancel_again)},separators=(',',':')))
if s1 != 200 or not row.get('id') or s2 != 200 or order2 != order1 or s3 != 200 or order3 == order1 or ss != 200 or len(secure) != 1 or wrong_body != [] or can_read is not True or can_read_wrong is not False or sc != 200 or not cancel or sc2 != 200 or cancel_again != []:
 raise SystemExit('secure order flow assertion failed')
