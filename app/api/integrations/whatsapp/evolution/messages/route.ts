import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { toWhatsAppPhone } from '@/lib/phone';
import {
  sendAudioWithEvolution,
  sendMediaWithEvolution,
  sendTextWithEvolution,
  type EvolutionConfig,
} from '@/lib/integrations/evolution/client';
import { ensureWhatsAppSchema } from '@/lib/integrations/whatsapp/ensureSchema';

export const runtime = 'nodejs';

const MessageTypeSchema = z.enum(['text', 'image', 'video', 'audio', 'document']);

const PostSchema = z.object({
  phone: z.string().min(3),
  message: z.string().max(4000).optional().default(''),
  contactName: z.string().optional(),
  messageType: MessageTypeSchema.optional().default('text'),
  media: z.string().optional(),
  mimeType: z.string().optional(),
  fileName: z.string().optional(),
  fileSize: z.number().int().nonnegative().optional(),
});

type ChatMessageRow = {
  id: string;
  phone: string;
  contact_name: string | null;
  direction: 'in' | 'out';
  message: string;
  provider: string;
  external_message_id: string | null;
  created_at: string;
  message_type?: string | null;
  caption?: string | null;
  media_url?: string | null;
  media_base64?: string | null;
  mime_type?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  media_seconds?: number | null;
  media_width?: number | null;
  media_height?: number | null;
};

type ChatMessageWithMetadataRow = ChatMessageRow & {
  metadata: unknown;
};

function metadataContainsPhone(metadata: unknown, targetDigits: string): boolean {
  if (!metadata || typeof metadata !== 'object' || !targetDigits) return false;

  let serialized = '';
  try {
    serialized = JSON.stringify(metadata);
  } catch {
    return false;
  }

  if (!serialized) return false;

  const matches = serialized.match(/[+0-9][0-9@()\s.-]{7,}/g) ?? [];
  for (const raw of matches) {
    const jidTrimmed = raw.includes('@') ? raw.split('@')[0] : raw;
    const candidate = toWhatsAppPhone(jidTrimmed);
    const digits = String(candidate || '').replace(/\D/g, '');
    if (digits && digits === targetDigits) return true;
  }

  return false;
}

async function getUserOrgContext() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: NextResponse.json({ error: 'Nao autenticado.' }, { status: 401 }) } as const;
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile?.organization_id) {
    return { error: NextResponse.json({ error: 'Perfil sem organizacao.' }, { status: 403 }) } as const;
  }

  return { supabase, organizationId: profile.organization_id } as const;
}

async function getOrganizationConnection(supabase: any, organizationId: string) {
  const { data: connection } = await supabase
    .from('organization_whatsapp_connections')
    .select('instance_url, instance_name, api_key, active')
    .eq('organization_id', organizationId)
    .eq('provider', 'evolution')
    .eq('active', true)
    .maybeSingle();

  return connection;
}

function externalMessageIdFromPayload(payload: any) {
  return (
    String(
      payload?.key?.id ??
        payload?.data?.key?.id ??
        payload?.message?.key?.id ??
        ''
    ).trim() || null
  );
}

async function sendWhatsAppMessage(input: {
  config: EvolutionConfig | null;
  phoneDigits: string;
  body: z.infer<typeof PostSchema>;
}) {
  const { body, config, phoneDigits } = input;
  if (body.messageType === 'text') {
    return sendTextWithEvolution({
      config,
      phone: phoneDigits,
      message: body.message,
    });
  }

  if (!body.media || !body.mimeType) {
    return {
      ok: false,
      status: 400,
      error: 'Arquivo ou MIME type ausente para envio de midia.',
    } as const;
  }

  if (body.messageType === 'audio') {
    return sendAudioWithEvolution({
      config,
      phone: phoneDigits,
      audio: body.media,
    });
  }

  return sendMediaWithEvolution({
    config,
    phone: phoneDigits,
    mediatype: body.messageType,
    mimetype: body.mimeType,
    media: body.media,
    fileName: body.fileName || `arquivo.${body.mimeType.split('/')[1] || 'bin'}`,
    caption: body.message,
  });
}

export async function GET(req: Request) {
  try {
    const ctx = await getUserOrgContext();
    if ('error' in ctx) return ctx.error;

    const schemaReady = await ensureWhatsAppSchema();
    if (!schemaReady.ok && !schemaReady.skipped) {
      return NextResponse.json({ error: schemaReady.message || 'Falha ao preparar tabelas do WhatsApp.' }, { status: 500 });
    }

    const url = new URL(req.url);
    const rawPhone = url.searchParams.get('phone') ?? '';
    const phoneDigits = toWhatsAppPhone(rawPhone);
    if (!phoneDigits) {
      return NextResponse.json({ error: 'Telefone invalido.' }, { status: 400 });
    }
    const normalizedPhone = `+${phoneDigits}`;

    const connection = await getOrganizationConnection(ctx.supabase, ctx.organizationId);
    const isConfigured = Boolean(
      connection?.instance_url && connection?.instance_name && connection?.api_key
    );

    const { data, error } = await ctx.supabase
      .from('whatsapp_messages')
      .select('id,phone,contact_name,direction,message,provider,external_message_id,created_at,message_type,caption,media_url,media_base64,mime_type,file_name,file_size,media_seconds,media_width,media_height')
      .eq('organization_id', ctx.organizationId)
      .eq('phone', normalizedPhone)
      .order('created_at', { ascending: true })
      .limit(300);

    if (error) {
      return NextResponse.json({ error: 'Falha ao buscar mensagens.' }, { status: 500 });
    }

    const exactMessages: ChatMessageRow[] = Array.isArray(data) ? (data as ChatMessageRow[]) : [];
    const hasInboundForPhone = exactMessages.some((message) => message.direction === 'in');
    let mergedMessages = exactMessages;

    if (!hasInboundForPhone) {
      const phoneDigits = normalizedPhone.replace('+', '');
      const { data: fallbackInbound } = await ctx.supabase
        .from('whatsapp_messages')
        .select('id,phone,contact_name,direction,message,provider,external_message_id,created_at,message_type,caption,media_url,media_base64,mime_type,file_name,file_size,media_seconds,media_width,media_height,metadata')
        .eq('organization_id', ctx.organizationId)
        .eq('direction', 'in')
        .neq('phone', normalizedPhone)
        .order('created_at', { ascending: false })
        .limit(120);

      const recoveredInbound = ((fallbackInbound ?? []) as ChatMessageWithMetadataRow[])
        .filter((row) => metadataContainsPhone(row.metadata, phoneDigits))
        .map(({ metadata: _metadata, ...row }) => ({
          ...row,
          phone: normalizedPhone,
        }));

      const byId = new Map<string, ChatMessageRow>();
      [...exactMessages, ...recoveredInbound].forEach((row) => {
        byId.set(String(row.id), row);
      });
      mergedMessages = Array.from(byId.values()).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    }

    return NextResponse.json({
      ok: true,
      configured: isConfigured,
      phone: normalizedPhone,
      messages: mergedMessages,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getUserOrgContext();
    if ('error' in ctx) return ctx.error;

    const schemaReady = await ensureWhatsAppSchema();
    if (!schemaReady.ok && !schemaReady.skipped) {
      return NextResponse.json({ error: schemaReady.message || 'Falha ao preparar tabelas do WhatsApp.' }, { status: 500 });
    }

    const body = PostSchema.parse(await req.json());
    if (body.messageType === 'text' && !body.message.trim()) {
      return NextResponse.json({ error: 'Mensagem de texto vazia.' }, { status: 400 });
    }
    const phoneDigits = toWhatsAppPhone(body.phone);
    if (!phoneDigits) {
      return NextResponse.json({ error: 'Telefone invalido para WhatsApp.' }, { status: 400 });
    }
    const normalizedPhone = `+${phoneDigits}`;

    const connection = await getOrganizationConnection(ctx.supabase, ctx.organizationId);
    const dbConfig: EvolutionConfig | null =
      connection?.instance_url && connection?.instance_name && connection?.api_key
        ? {
            baseUrl: String(connection.instance_url).replace(/\/$/, ''),
            instance: String(connection.instance_name),
            apiKey: String(connection.api_key),
          }
        : null;

    const sent = await sendWhatsAppMessage({ config: dbConfig, phoneDigits, body });

    if (!sent.ok) {
      const details = `${sent.error} (status ${sent.status})`;
      return NextResponse.json(
        {
          error: details,
          providerStatus: sent.status,
          providerPayload: 'payload' in sent ? sent.payload : null,
        },
        { status: sent.status === 409 ? 409 : 502 }
      );
    }

    const providerPayload = sent.payload as any;
    const externalMessageId = externalMessageIdFromPayload(providerPayload);

    const { error: insertError } = await ctx.supabase.from('whatsapp_messages').insert({
      organization_id: ctx.organizationId,
      phone: normalizedPhone,
      contact_name: body.contactName?.trim() || null,
      direction: 'out',
      message: body.message || (body.fileName ? `Arquivo enviado: ${body.fileName}` : `Mensagem ${body.messageType} enviada.`),
      message_type: body.messageType,
      caption: body.message || null,
      media_base64: body.media && !/^https?:\/\//i.test(body.media) ? body.media : null,
      media_url: body.media && /^https?:\/\//i.test(body.media) ? body.media : null,
      mime_type: body.mimeType ?? null,
      file_name: body.fileName ?? null,
      file_size: body.fileSize ?? null,
      provider: 'evolution',
      external_message_id: externalMessageId,
      metadata: providerPayload ?? {},
    });

    if (insertError) {
      return NextResponse.json(
        { error: 'Mensagem enviada, mas falhou ao salvar historico.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
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
