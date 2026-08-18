-- SimSim Menu Ready Activation v2 — حالة نسخ المنيو للفروع
-- تغيير إضافي متوافق: الفروع القائمة جاهزة، والفروع الجديدة لا تصبح Ready قبل نجاح النسخ الذري.

begin;

alter table public.branches
  add column if not exists menu_clone_status text not null default 'ready',
  add column if not exists menu_clone_error text;

alter table public.branches
  drop constraint if exists branches_menu_clone_status_check;

alter table public.branches
  add constraint branches_menu_clone_status_check
  check (menu_clone_status in ('ready', 'copying', 'failed'));

update public.branches
set menu_clone_status = 'ready', menu_clone_error = null
where menu_clone_status is null;

create index if not exists branches_restaurant_clone_status_idx
  on public.branches (restaurant_id, menu_clone_status, sort_order);

commit;
