import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

const UpsertSchema = z
  .object({
    id: z.string().uuid().optional(),
    connectionName: z.string().min(1).max(120),
    instanceUrl: z.string().trim().optional().or(z.literal('')),
    instanceName: z.string().trim().optional().or(z.literal('')),
    apiKey: z.string().optional(),
    typingEnabled: z.boolean().optional(),
    typingIntervalMinSeconds: z.number().int().min(0).max(120).optional(),
    typingIntervalMaxSeconds: z.number().int().min(0).max(120).optional(),
    listenGroups: z.boolean().optional(),
    listType: z.enum(['buttons', 'numeric']).optional(),
    restoreEnabled: z.boolean().optional(),
    restoreFrom: z.string().optional().or(z.literal('')),
    restoreTo: z.string().optional().or(z.literal('')),
    active: z.boolean().optional(),
  })
  .strict();

const ToggleSchema = z
  .object({
    id: z.string().uuid(),
    active: z.boolean(),
  })
  .strict();

async function getAdminContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: json({ error: 'Unauthorized' }, 401) } as const;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('organization_id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (error || !profile?.organization_id) {
    return { error: json({ error: 'Profile not found' }, 404) } as const;
  }

  if (profile.role !== 'admin') {
    return { error: json({ error: 'Forbidden' }, 403) } as const;
  }

  return { supabase, organizationId: profile.organization_id } as const;
}

function toNullable(value?: string) {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function GET() {
  const ctx = await getAdminContext();
  if ('error' in ctx) return ctx.error;

  const { data, error } = await ctx.supabase
    .from('organization_whatsapp_connections')
    .select('id,connection_name,instance_url,instance_name,api_key,typing_enabled,typing_interval_min_seconds,typing_interval_max_seconds,listen_groups,list_type,restore_enabled,restore_from,restore_to,active,created_at,updated_at')
    .eq('organization_id', ctx.organizationId)
    .eq('provider', 'evolution')
    .order('created_at', { ascending: true });

  if (error) return json({ error: error.message }, 500);

  const connections = (data ?? []).map((row: any) => ({
    id: String(row.id),
    connectionName: String(row.connection_name ?? ''),
    instanceUrl: String(row.instance_url ?? ''),
    instanceName: String(row.instance_name ?? ''),
    apiKey: String(row.api_key ?? ''),
    typingEnabled: Boolean(row.typing_enabled ?? false),
    typingIntervalMinSeconds: Number(row.typing_interval_min_seconds ?? 0),
    typingIntervalMaxSeconds: Number(row.typing_interval_max_seconds ?? 2),
    listenGroups: Boolean(row.listen_groups ?? false),
    listType: (row.list_type === 'numeric' ? 'numeric' : 'buttons') as 'buttons' | 'numeric',
    restoreEnabled: Boolean(row.restore_enabled ?? false),
    restoreFrom: row.restore_from ?? '',
    restoreTo: row.restore_to ?? '',
    active: Boolean(row.active ?? false),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  }));

  return json({ connections });
}

export async function POST(req: Request) {
  if (!isAllowedOrigin(req)) return json({ error: 'Forbidden' }, 403);

  const ctx = await getAdminContext();
  if ('error' in ctx) return ctx.error;

  const raw = await req.json().catch(() => null);
  const parsed = UpsertSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400);
  }

  const body = parsed.data;
  const min = body.typingIntervalMinSeconds ?? 0;
  const max = body.typingIntervalMaxSeconds ?? 2;
  if (max < min) return json({ error: 'Intervalo invalido: max deve ser maior ou igual ao min.' }, 400);

  const payload: Record<string, unknown> = {
    organization_id: ctx.organizationId,
    provider: 'evolution',
    connection_name: body.connectionName,
    instance_url: toNullable(body.instanceUrl),
    instance_name: toNullable(body.instanceName),
    api_key: toNullable(body.apiKey),
    typing_enabled: body.typingEnabled ?? false,
    typing_interval_min_seconds: min,
    typing_interval_max_seconds: max,
    listen_groups: body.listenGroups ?? false,
    list_type: body.listType ?? 'buttons',
    restore_enabled: body.restoreEnabled ?? false,
    restore_from: toNullable(body.restoreFrom),
    restore_to: toNullable(body.restoreTo),
    active: body.active ?? true,
    updated_at: new Date().toISOString(),
  };

  // Schema atual permite apenas 1 conexão por provider/org (unique organization_id,provider).
  const { data: existing } = await ctx.supabase
    .from('organization_whatsapp_connections')
    .select('id')
    .eq('organization_id', ctx.organizationId)
    .eq('provider', 'evolution')
    .maybeSingle();

  let error: any = null;

  if (existing?.id) {
    const update = await ctx.supabase
      .from('organization_whatsapp_connections')
      .update(payload)
      .eq('id', existing.id)
      .eq('organization_id', ctx.organizationId);
    error = update.error;
  } else {
    const insert = await ctx.supabase.from('organization_whatsapp_connections').insert(payload);
    error = insert.error;
  }

  if (error) return json({ error: error.message }, 500);

  return json({ ok: true });
}

export async function PATCH(req: Request) {
  if (!isAllowedOrigin(req)) return json({ error: 'Forbidden' }, 403);

  const ctx = await getAdminContext();
  if ('error' in ctx) return ctx.error;

  const raw = await req.json().catch(() => null);
  const parsed = ToggleSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400);
  }

  const { id, active } = parsed.data;

  const { error } = await ctx.supabase
    .from('organization_whatsapp_connections')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .eq('provider', 'evolution');

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!isAllowedOrigin(req)) return json({ error: 'Forbidden' }, 403);

  const ctx = await getAdminContext();
  if ('error' in ctx) return ctx.error;

  const url = new URL(req.url);
  const id = url.searchParams.get('id') ?? '';
  if (!id) return json({ error: 'Id da conexao e obrigatorio.' }, 400);

  const { error } = await ctx.supabase
    .from('organization_whatsapp_connections')
    .delete()
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .eq('provider', 'evolution');

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}
