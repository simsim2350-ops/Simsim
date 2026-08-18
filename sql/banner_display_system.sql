-- نظام طرق عرض البانرات في المنيو العام
-- Migration إضافية متوافقة: لا تعيد إنشاء جدول banners ولا تمس سياسات RLS القائمة.

alter table public.banners
  add column if not exists display_mode text not null default 'top',
  add column if not exists display_frequency text not null default 'every_visit',
  add column if not exists display_delay_seconds integer not null default 0,
  add column if not exists visitor_cooldown_hours integer not null default 24,
  add column if not exists display_priority integer not null default 0;

-- تثبيت نطاقات القيم المدعومة من الواجهة والمنيو العام.
alter table public.banners
  drop constraint if exists banners_display_mode_check,
  drop constraint if exists banners_display_frequency_check,
  drop constraint if exists banners_display_delay_seconds_check,
  drop constraint if exists banners_visitor_cooldown_hours_check;

alter table public.banners
  add constraint banners_display_mode_check
    check (display_mode in ('fullscreen', 'popup', 'top', 'inline', 'floating')),
  add constraint banners_display_frequency_check
    check (display_frequency in ('every_visit', 'once_per_visitor', 'delayed')),
  add constraint banners_display_delay_seconds_check
    check (display_delay_seconds between 0 and 300),
  add constraint banners_visitor_cooldown_hours_check
    check (visitor_cooldown_hours between 1 and 8760);

-- الأولوية الأعلى تظهر أولاً داخل كل طريقة عرض، ثم يحافظ sort_order الحالي على الترتيب الثانوي.
create index if not exists idx_banners_display_priority
  on public.banners (restaurant_id, display_mode, display_priority desc, sort_order asc);
