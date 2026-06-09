-- Permite webhook events sem source_id (ex.: webhooks Evolution que nao passam pelo webhook-in).
-- O FK continua valido, mas NULL dispensa a referencia.
alter table public.webhook_events_in alter column source_id drop not null;
