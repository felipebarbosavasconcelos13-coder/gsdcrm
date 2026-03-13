import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';
import { setEvolutionWebhook, type EvolutionConfig } from '@/lib/integrations/evolution/client';

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

function asBaseUrl(value: string) {
  return value.trim().replace(/\/$/, '');
}

function resolveWebhookBase(req: Request) {
  const explicit =
    process.env.EVOLUTION_WEBHOOK_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    '';

  if (explicit.trim()) return asBaseUrl(explicit);
  return asBaseUrl(new URL(req.url).origin);
}

function buildWebhookUrl(req: Request) {
  const base = resolveWebhookBase(req);
  const url = new URL(`${base}/api/webhooks/evolution`);

  const token = (process.env.EVOLUTION_WEBHOOK_TOKEN || '').trim();
  const sourceId = (process.env.EVOLUTION_WEBHOOK_SOURCE_ID || '').trim();
  if (token) url.searchParams.set('token', token);
  if (sourceId) url.searchParams.set('sourceId', sourceId);

  return url.toString();
}

function canAutoProvisionWebhook() {
  return Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim() &&
      (process.env.EVOLUTION_WEBHOOK_SOURCE_ID || '').trim() &&
      (process.env.EVOLUTION_WEBHOOK_SOURCE_SECRET || '').trim()
  );
}

function toEvolutionConfig(data: {
  instanceUrl?: string | null;
  instanceName?: string | null;
  apiKey?: string | null;
}): EvolutionConfig | null {
  const baseUrl = String(data.instanceUrl || '').trim().replace(/\/$/, '');
  const instance = String(data.instanceName || '').trim();
  const apiKey = String(data.apiKey || '').trim();

  if (!baseUrl || !instance || !apiKey) return null;
  return { baseUrl, instance, apiKey };
}

async function syncEvolutionWebhook(params: {
  req: Request;
  config: EvolutionConfig | null;
  enabled: boolean;
}) {
  if (!params.config) {
    return {
      ok: false,
      skipped: true,
      message: 'Webhook nao sincronizado: preencha URL, instancia e chave da Evolution.',
    } as const;
  }

  if (!canAutoProvisionWebhook()) {
    return {
      ok: false,
      skipped: true,
      message:
        'Webhook nao sincronizado: defina EVOLUTION_WEBHOOK_SOURCE_ID e EVOLUTION_WEBHOOK_SOURCE_SECRET no servidor.',
    } as const;
  }

  const webhookUrl = buildWebhookUrl(params.req);
  const webhook = await setEvolutionWebhook({
    config: params.config,
    url: webhookUrl,
    enabled: params.enabled,
    webhookByEvents: false,
    webhookBase64: false,
    events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'MESSAGES_DELETE', 'CONNECTION_UPDATE'],
  });

  return {
    ok: webhook.ok,
    skipped: false,
    status: webhook.status,
    message: webhook.message,
    webhookUrl,
  } as const;
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

  const { data: existing } = await ctx.supabase
    .from('organization_whatsapp_connections')
    .select('id')
    .eq('organization_id', ctx.organizationId)
    .eq('provider', 'evolution')
    .maybeSingle();

  let saveError: any = null;
  let savedId: string | null = null;

  if (existing?.id) {
    const update = await ctx.supabase
      .from('organization_whatsapp_connections')
      .update(payload)
      .eq('id', existing.id)
      .eq('organization_id', ctx.organizationId)
      .select('id')
      .single();
    saveError = update.error;
    savedId = update.data?.id ?? existing.id;
  } else {
    const insert = await ctx.supabase
      .from('organization_whatsapp_connections')
      .insert(payload)
      .select('id')
      .single();
    saveError = insert.error;
    savedId = insert.data?.id ?? null;
  }

  if (saveError) return json({ error: saveError.message }, 500);

  const webhook = await syncEvolutionWebhook({
    req,
    config: toEvolutionConfig({
      instanceUrl: body.instanceUrl,
      instanceName: body.instanceName,
      apiKey: body.apiKey,
    }),
    enabled: body.active ?? true,
  });

  return json({ ok: true, id: savedId, webhook });
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

  const { data: connection, error: lookupError } = await ctx.supabase
    .from('organization_whatsapp_connections')
    .select('id,instance_url,instance_name,api_key')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .eq('provider', 'evolution')
    .maybeSingle();

  if (lookupError || !connection) return json({ error: 'Conexao nao encontrada.' }, 404);

  const { error } = await ctx.supabase
    .from('organization_whatsapp_connections')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .eq('provider', 'evolution');

  if (error) return json({ error: error.message }, 500);

  const webhook = await syncEvolutionWebhook({
    req,
    config: toEvolutionConfig({
      instanceUrl: connection.instance_url,
      instanceName: connection.instance_name,
      apiKey: connection.api_key,
    }),
    enabled: active,
  });

  return json({ ok: true, webhook });
}

export async function DELETE(req: Request) {
  if (!isAllowedOrigin(req)) return json({ error: 'Forbidden' }, 403);

  const ctx = await getAdminContext();
  if ('error' in ctx) return ctx.error;

  const url = new URL(req.url);
  const id = url.searchParams.get('id') ?? '';
  if (!id) return json({ error: 'Id da conexao e obrigatorio.' }, 400);

  const { data: connection } = await ctx.supabase
    .from('organization_whatsapp_connections')
    .select('id,instance_url,instance_name,api_key')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .eq('provider', 'evolution')
    .maybeSingle();

  if (connection) {
    await syncEvolutionWebhook({
      req,
      config: toEvolutionConfig({
        instanceUrl: connection.instance_url,
        instanceName: connection.instance_name,
        apiKey: connection.api_key,
      }),
      enabled: false,
    });
  }

  const { error } = await ctx.supabase
    .from('organization_whatsapp_connections')
    .delete()
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .eq('provider', 'evolution');

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}
