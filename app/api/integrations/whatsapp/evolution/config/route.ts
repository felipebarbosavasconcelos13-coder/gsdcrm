import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

const UpdateSchema = z
  .object({
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

export async function GET() {
  const ctx = await getAdminContext();
  if ('error' in ctx) return ctx.error;

  const { data, error } = await ctx.supabase
    .from('organization_whatsapp_connections')
    .select('connection_name,instance_url,instance_name,api_key,typing_enabled,typing_interval_min_seconds,typing_interval_max_seconds,listen_groups,list_type,restore_enabled,restore_from,restore_to')
    .eq('organization_id', ctx.organizationId)
    .eq('provider', 'evolution')
    .maybeSingle();

  if (error) return json({ error: error.message }, 500);

  return json({
    connectionName: data?.connection_name ?? '',
    instanceUrl: data?.instance_url ?? '',
    instanceName: data?.instance_name ?? '',
    apiKey: data?.api_key ?? '',
    typingEnabled: Boolean(data?.typing_enabled ?? false),
    typingIntervalMinSeconds: Number(data?.typing_interval_min_seconds ?? 0),
    typingIntervalMaxSeconds: Number(data?.typing_interval_max_seconds ?? 2),
    listenGroups: Boolean(data?.listen_groups ?? false),
    listType: (data?.list_type ?? 'buttons') as 'buttons' | 'numeric',
    restoreEnabled: Boolean(data?.restore_enabled ?? false),
    restoreFrom: data?.restore_from ?? '',
    restoreTo: data?.restore_to ?? '',
  });
}

export async function POST(req: Request) {
  if (!isAllowedOrigin(req)) {
    return json({ error: 'Forbidden' }, 403);
  }

  const ctx = await getAdminContext();
  if ('error' in ctx) return ctx.error;

  const raw = await req.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400);
  }

  const body = parsed.data;

  const toNullable = (value?: string) => {
    if (value === undefined) return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  };

  const min = body.typingIntervalMinSeconds ?? 0;
  const max = body.typingIntervalMaxSeconds ?? 2;
  if (max < min) {
    return json({ error: 'Intervalo invalido: max deve ser maior ou igual ao min.' }, 400);
  }

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
    active: true,
    updated_at: new Date().toISOString(),
  };

  const { error } = await ctx.supabase
    .from('organization_whatsapp_connections')
    .upsert(payload, { onConflict: 'organization_id,provider' });

  if (error) return json({ error: error.message }, 500);

  return json({ ok: true });
}