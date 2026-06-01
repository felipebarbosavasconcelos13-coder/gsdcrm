-- Default tenant on CRM lead/contact inserts.
-- This keeps client-created leads compatible with strict multi-tenant RLS even
-- when a UI/API path forgets to send organization_id explicitly.

create or replace function public.set_current_user_organization_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.organization_id is null then
    new.organization_id := public.current_user_organization_id();
  end if;

  if new.organization_id is null then
    new.organization_id := public.get_singleton_organization_id();
  end if;

  if new.organization_id is null then
    raise exception 'organization_id is required';
  end if;

  return new;
end;
$$;

revoke all on function public.set_current_user_organization_id() from public;
grant execute on function public.set_current_user_organization_id() to authenticated;

drop trigger if exists set_contacts_organization_id on public.contacts;
create trigger set_contacts_organization_id
  before insert on public.contacts
  for each row
  execute function public.set_current_user_organization_id();

drop trigger if exists set_crm_companies_organization_id on public.crm_companies;
create trigger set_crm_companies_organization_id
  before insert on public.crm_companies
  for each row
  execute function public.set_current_user_organization_id();

drop trigger if exists set_leads_organization_id on public.leads;
create trigger set_leads_organization_id
  before insert on public.leads
  for each row
  execute function public.set_current_user_organization_id();
