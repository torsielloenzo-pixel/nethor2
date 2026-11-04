-- NETHOR 2 — abonnement calendrier personnel (bêta Enzo).
-- Architecture générique ; activation initiale limitée à Enzo.
create table if not exists public.calendar_subscriptions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.calendar_subscriptions enable row level security;

revoke all on table public.calendar_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on table public.calendar_subscriptions to service_role;

insert into public.calendar_subscriptions(user_id, enabled)
select p.id, true
from public.profiles p
where lower(coalesce(p.email,''))='netto.enzo@stock-fl.local'
on conflict (user_id) do update
set enabled=true, updated_at=now();
