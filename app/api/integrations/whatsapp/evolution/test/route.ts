import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';
import { checkEvolutionConnection, type EvolutionConfig } from '@/lib/integrations/evolution/client';
import { ensureWhatsAppSchema } from '@/lib/integrations/whatsapp/ensureSchema';

export const runtime = 'nodejs';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

const TestSchema = z
  .object({
    id: z.string().uuid(),
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

export async function POST(req: Request) {
  if (!isAllowedOrigin(req)) return json({ error: 'Forbidden' }, 403);

  const ctx = await getAdminContext();
  if ('error' in ctx) return ctx.error;

  const schemaReady = await ensureWhatsAppSchema();
  if (!schemaReady.ok && !schemaReady.skipped) {
    return json({ error: schemaReady.message || 'Falha ao preparar tabelas do WhatsApp.' }, 500);
  }

  const raw = await req.json().catch(() => null);
  const parsed = TestSchema.safeParse(raw);
  if (!parsed.success) return json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400);

  const { data: connection, error } = await ctx.supabase
    .from('organization_whatsapp_connections')
    .select('id,instance_url,instance_name,api_key')
    .eq('id', parsed.data.id)
    .eq('organization_id', ctx.organizationId)
    .eq('provider', 'evolution')
    .maybeSingle();

  if (error || !connection) return json({ error: 'Conexao nao encontrada.' }, 404);

  const cfg: EvolutionConfig | null =
    connection.instance_url && connection.instance_name && connection.api_key
      ? {
          baseUrl: String(connection.instance_url),
          instance: String(connection.instance_name),
          apiKey: String(connection.api_key),
        }
      : null;

  const result = await checkEvolutionConnection(cfg);

  return json({
    ok: result.ok,
    connected: result.connected,
    state: result.state ?? null,
    message: result.message,
    status: result.status,
  });
}
