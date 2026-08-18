-- SimSim — Staff management v2
-- توسعة نطاق فروع الموظف مع الحفاظ على branch_scope الانتقالي،
-- وتحويل فرض الوصول إلى دالة مركزية خادمية تستخدم في RLS.

begin;

alter table public.restaurant_members
  add column if not exists branch_ids uuid[] not null default '{}'::uuid[];

-- تحويل السجلات السابقة بأمان: all/NULL = كل الفروع، UUID قديم = فرع مختار واحد.
update public.restaurant_members m
set
  branch_ids = case
    when coalesce(m.branch_scope, 'all') = 'all' then '{}'::uuid[]
    when m.branch_scope ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         and exists (
           select 1 from public.branches b
           where b.id = m.branch_scope::uuid and b.restaurant_id = m.restaurant_id
         ) then array[m.branch_scope::uuid]
    else '{}'::uuid[]
  end,
  branch_scope = case
    when coalesce(m.branch_scope, 'all') = 'all' then 'all'
    when m.branch_scope ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         and exists (
           select 1 from public.branches b
           where b.id = m.branch_scope::uuid and b.restaurant_id = m.restaurant_id
         ) then 'selected'
    else 'all'
  end;

alter table public.restaurant_members
  drop constraint if exists restaurant_members_branch_scope_mode_check;

alter table public.restaurant_members
  add constraint restaurant_members_branch_scope_mode_check
  check (branch_scope in ('all', 'selected'));

create or replace function public.validate_member_branch_selection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.branch_scope is null or new.branch_scope = 'all' then
    new.branch_scope := 'all';
    new.branch_ids := '{}'::uuid[];
    return new;
  end if;

  if new.branch_scope <> 'selected' or coalesce(cardinality(new.branch_ids), 0) = 0 then
    raise exception 'Selected branch scope requires one or more restaurant branches';
  end if;

  if exists (
    select 1
    from unnest(new.branch_ids) as selected_branch(id)
    left join public.branches b on b.id = selected_branch.id and b.restaurant_id = new.restaurant_id
    where b.id is null
  ) then
    raise exception 'A selected branch does not belong to this restaurant';
  end if;

  select coalesce(array_agg(distinct id order by id), '{}'::uuid[])
  into new.branch_ids
  from unnest(new.branch_ids) as selected_branch(id);

  return new;
end;
$$;

drop trigger if exists restaurant_members_validate_branch_selection on public.restaurant_members;
create trigger restaurant_members_validate_branch_selection
before insert or update of restaurant_id, branch_scope, branch_ids
on public.restaurant_members
for each row execute function public.validate_member_branch_selection();

create or replace function public.member_has_branch_access(p_restaurant_id uuid, p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_restaurant_owner(p_restaurant_id)
    or exists (
      select 1
      from public.restaurant_members m
      where m.restaurant_id = p_restaurant_id
        and m.user_id = auth.uid()
        and m.is_active = true
        and (
          coalesce(m.branch_scope, 'all') = 'all'
          or p_branch_id = any(coalesce(m.branch_ids, '{}'::uuid[]))
        )
    );
$$;

-- تبقى الدالة القديمة متاحة للتوافق مع المستهلكين الحاليين، وتعيد وضعًا فقط.
create or replace function public.member_branch_scope(p_restaurant_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select branch_scope
  from public.restaurant_members
  where restaurant_id = p_restaurant_id and user_id = auth.uid() and is_active = true
  limit 1;
$$;

drop policy if exists orders_access on public.orders;
create policy orders_access on public.orders
  for all
  using (
    public.has_restaurant_access(restaurant_id)
    and public.member_has_branch_access(restaurant_id, branch_id)
  )
  with check (
    public.has_restaurant_access(restaurant_id)
    and public.member_has_branch_access(restaurant_id, branch_id)
  );

-- صفحات الطاولات وQR تستخدم رمز الطاولة؛ لا يُمنح للموظف إلا داخل الفروع المصرّح بها.
drop policy if exists "Public can read active tables" on public.restaurant_tables;
create policy "Public can read active tables" on public.restaurant_tables
  for select to anon
  using (status = 'active');

create policy "Staff read assigned tables" on public.restaurant_tables
  for select to authenticated
  using (
    public.has_restaurant_access(restaurant_id)
    and public.member_has_branch_access(restaurant_id, branch_id)
  );

revoke all on function public.member_has_branch_access(uuid, uuid) from public;
grant execute on function public.member_has_branch_access(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
