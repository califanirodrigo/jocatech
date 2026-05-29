create table if not exists public.jocatech_app_data (
  key text primary key,
  value jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.jocatech_app_data enable row level security;

drop policy if exists "JocaTech public read app data" on public.jocatech_app_data;
create policy "JocaTech public read app data"
on public.jocatech_app_data
for select
to anon
using (key in ('clients', 'orders'));

drop policy if exists "JocaTech public insert app data" on public.jocatech_app_data;
create policy "JocaTech public insert app data"
on public.jocatech_app_data
for insert
to anon
with check (key in ('clients', 'orders'));

drop policy if exists "JocaTech public update app data" on public.jocatech_app_data;
create policy "JocaTech public update app data"
on public.jocatech_app_data
for update
to anon
using (key in ('clients', 'orders'))
with check (key in ('clients', 'orders'));

insert into public.jocatech_app_data (key, value)
values
  ('clients', '[]'::jsonb),
  ('orders', '[]'::jsonb)
on conflict (key) do nothing;
