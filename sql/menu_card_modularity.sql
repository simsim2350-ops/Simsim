-- بطاقة المطعم Modular: مفتاح تفعيل/تعطيل مستقل لكل قسم من لوحة التحكم، بمعزل عن وجود بياناته
-- كل الأعمدة افتراضها true (مفعّل) — صفر انقطاع لأي مطعم قائم لم يغيّر شيئاً
-- ⚠️ تُنفَّذ مرة واحدة في Supabase → SQL Editor

alter table public.restaurants add column if not exists show_description boolean not null default true;
alter table public.restaurants add column if not exists show_social_links boolean not null default true;
alter table public.restaurants add column if not exists show_allergens boolean not null default true;
alter table public.restaurants add column if not exists show_hours boolean not null default true;
alter table public.restaurants add column if not exists show_prep_time boolean not null default true;
