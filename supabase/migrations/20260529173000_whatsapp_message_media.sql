alter table public.whatsapp_messages
  add column if not exists message_type text not null default 'text',
  add column if not exists caption text,
  add column if not exists media_url text,
  add column if not exists media_base64 text,
  add column if not exists mime_type text,
  add column if not exists file_name text,
  add column if not exists file_size bigint,
  add column if not exists media_seconds integer,
  add column if not exists media_width integer,
  add column if not exists media_height integer;

alter table public.whatsapp_messages
  drop constraint if exists whatsapp_messages_message_type_check;

alter table public.whatsapp_messages
  add constraint whatsapp_messages_message_type_check
  check (message_type in ('text', 'image', 'video', 'audio', 'document', 'sticker', 'contact', 'location', 'unknown'));

create index if not exists whatsapp_messages_org_type_created_idx
  on public.whatsapp_messages (organization_id, message_type, created_at desc);
