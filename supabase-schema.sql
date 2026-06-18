create extension if not exists pgcrypto;

create table if not exists public.pa_tasks (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  fixed_key text,
  title text not null,
  area text not null default 'Otro',
  detail text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'active', 'blocked', 'done')),
  assignee text not null default '',
  notes text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create unique index if not exists pa_tasks_work_date_fixed_key_idx
  on public.pa_tasks (work_date, fixed_key)
  where fixed_key is not null;

alter table public.pa_tasks enable row level security;

drop policy if exists "public read pa tasks" on public.pa_tasks;
create policy "public read pa tasks"
  on public.pa_tasks for select
  to anon
  using (true);

drop policy if exists "public insert pa tasks" on public.pa_tasks;
create policy "public insert pa tasks"
  on public.pa_tasks for insert
  to anon
  with check (true);

drop policy if exists "public update pa tasks" on public.pa_tasks;
create policy "public update pa tasks"
  on public.pa_tasks for update
  to anon
  using (true)
  with check (true);

do $$
begin
  alter publication supabase_realtime add table public.pa_tasks;
exception
  when duplicate_object then null;
end $$;
