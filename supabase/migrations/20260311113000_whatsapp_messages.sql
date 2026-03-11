create extension if not exists pgcrypto;

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  phone text not null,
  contact_name text,
  direction text not null check (direction in ('in','out')),
  message text not null,
  provider text not null default 'evolution',
  external_message_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_messages_org_phone_created_idx
  on public.whatsapp_messages (organization_id, phone, created_at desc);

create unique index if not exists whatsapp_messages_org_external_unique
  on public.whatsapp_messages (organization_id, external_message_id)
  where external_message_id is not null;

alter table public.whatsapp_messages enable row level security;

drop policy if exists "Members can view whatsapp messages" on public.whatsapp_messages;
create policy "Members can view whatsapp messages"
  on public.whatsapp_messages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and organization_id = whatsapp_messages.organization_id
    )
  );

drop policy if exists "Members can insert whatsapp messages" on public.whatsapp_messages;
create policy "Members can insert whatsapp messages"
  on public.whatsapp_messages
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and organization_id = whatsapp_messages.organization_id
    )
  );

drop policy if exists "Admins can manage whatsapp messages" on public.whatsapp_messages;
create policy "Admins can manage whatsapp messages"
  on public.whatsapp_messages
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role = 'admin'
        and organization_id = whatsapp_messages.organization_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role = 'admin'
        and organization_id = whatsapp_messages.organization_id
    )
  );