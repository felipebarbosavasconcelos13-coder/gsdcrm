import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { toWhatsAppPhone } from '@/lib/phone';
import { sendTextWithEvolution, type EvolutionConfig } from '@/lib/integrations/evolution/client';

const BodySchema = z.object({
  phone: z.string().min(3),
  message: z.string().min(1).max(4000),
});

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());

    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Nao autenticado.' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !profile?.organization_id) {
      return NextResponse.json({ error: 'Perfil sem organizacao.' }, { status: 403 });
    }

    const { data: connection } = await supabase
      .from('organization_whatsapp_connections')
      .select('instance_url, instance_name, api_key, active')
      .eq('organization_id', profile.organization_id)
      .eq('provider', 'evolution')
      .eq('active', true)
      .maybeSingle();

    const phone = toWhatsAppPhone(body.phone);
    if (!phone) {
      return NextResponse.json({ error: 'Telefone invalido para WhatsApp.' }, { status: 400 });
    }

    const dbConfig: EvolutionConfig | null =
      connection?.instance_url && connection?.instance_name && connection?.api_key
        ? {
            baseUrl: String(connection.instance_url).replace(/\/$/, ''),
            instance: String(connection.instance_name),
            apiKey: String(connection.api_key),
          }
        : null;

    const sent = await sendTextWithEvolution({
      config: dbConfig,
      phone,
      message: body.message,
    });

    if (!sent.ok) {
      return NextResponse.json(
        {
          error: sent.error,
          providerStatus: sent.status,
          providerPayload: 'payload' in sent ? sent.payload : null,
        },
        { status: sent.status === 409 ? 409 : 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      provider: 'evolution',
      providerStatus: sent.status,
      providerPayload: sent.payload,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Payload invalido.', details: error.issues.map(issue => issue.message) },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : 'Erro interno.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}