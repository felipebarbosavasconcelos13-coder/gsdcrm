import { NextResponse } from 'next/server';
import { toWhatsAppPhone } from '@/lib/phone';
import { createStaticAdminClient } from '@/lib/supabase/staticAdminClient';

function getTextFromMessageNode(message: any): string {
  if (!message || typeof message !== 'object') return '';
  if (typeof message.conversation === 'string') return message.conversation;
  if (typeof message.extendedTextMessage?.text === 'string') return message.extendedTextMessage.text;
  if (typeof message.imageMessage?.caption === 'string') return message.imageMessage.caption;
  if (typeof message.videoMessage?.caption === 'string') return message.videoMessage.caption;
  return '';
}

function normalizeEvolutionEventName(raw: unknown) {
  return String(raw ?? '').trim().toLowerCase().replace(/_/g, '.');
}

function jidToId(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return raw.includes('@') ? raw.split('@')[0] : raw;
}

function collectPhoneCandidates(raw: any, data: any, key: any) {
  const candidates = [
    key?.remoteJid,
    data?.remoteJid,
    key?.participant,
    data?.participant,
    data?.sender,
    data?.sender?.id,
    data?.sender?.phone,
    data?.from,
    data?.fromNumber,
    data?.chatId,
    raw?.sender,
    raw?.sender?.id,
    raw?.from,
    data?.messages?.[0]?.key?.remoteJid,
    data?.messages?.[0]?.key?.participant,
    data?.messages?.[0]?.participant,
  ];

  return candidates
    .map(jidToId)
    .map((v) => toWhatsAppPhone(v))
    .filter((v) => Boolean(v));
}

function pickBestPhone(raw: any, data: any, key: any): string {
  const remoteJidRaw = String(key?.remoteJid ?? data?.remoteJid ?? '').trim();
  const remoteId = toWhatsAppPhone(jidToId(remoteJidRaw));
  const all = collectPhoneCandidates(raw, data, key);

  // Prefer BR number when available (produto atual é focado em BR).
  const br = all.find((p) => p.startsWith('55') && p.length >= 12 && p.length <= 13);
  if (br) return br;

  // If remoteJid is LID and no BR candidate, fallback to another non-LID candidate.
  const isLid = remoteJidRaw.endsWith('@lid');
  if (isLid) {
    const nonLid = all.find((p) => p !== remoteId);
    if (nonLid) return nonLid;
  }

  return remoteId || all[0] || '';
}

function pickInstanceName(raw: any): string {
  return String(
    raw?.instance ??
      raw?.instanceName ??
      raw?.instance_name ??
      raw?.data?.instance ??
      raw?.data?.instanceName ??
      raw?.data?.instance_name ??
      ''
  ).trim();
}

async function resolveOrganizationId(
  admin: ReturnType<typeof createStaticAdminClient>,
  instanceName: string,
  connectionId?: string
) {
  const byConnectionId = String(connectionId || '').trim();
  if (byConnectionId) {
    const byId = await admin
      .from('organization_whatsapp_connections')
      .select('organization_id')
      .eq('id', byConnectionId)
      .eq('provider', 'evolution')
      .maybeSingle();
    if (byId.data?.organization_id) return byId.data.organization_id as string;
  }

  const normalized = instanceName.trim();
  if (!normalized) return null;

  const exact = await admin
    .from('organization_whatsapp_connections')
    .select('organization_id')
    .eq('provider', 'evolution')
    .eq('active', true)
    .eq('instance_name', normalized)
    .maybeSingle();

  if (exact.data?.organization_id) return exact.data.organization_id as string;

  const caseInsensitive = await admin
    .from('organization_whatsapp_connections')
    .select('organization_id')
    .eq('provider', 'evolution')
    .eq('active', true)
    .ilike('instance_name', normalized)
    .maybeSingle();

  if (caseInsensitive.data?.organization_id) return caseInsensitive.data.organization_id as string;

  const byConnectionName = await admin
    .from('organization_whatsapp_connections')
    .select('organization_id')
    .eq('provider', 'evolution')
    .eq('active', true)
    .ilike('connection_name', normalized)
    .maybeSingle();

  if (byConnectionName.data?.organization_id) return byConnectionName.data.organization_id as string;

  const fallbackSingle = await admin
    .from('organization_whatsapp_connections')
    .select('organization_id')
    .eq('provider', 'evolution')
    .eq('active', true)
    .limit(2);

  if ((fallbackSingle.data ?? []).length === 1) {
    return fallbackSingle.data?.[0]?.organization_id ?? null;
  }

  return null;
}

async function persistInboundMessage(input: {
  connectionId?: string;
  instanceName: string;
  phone: string;
  contactName: string;
  message: string;
  externalMessageId: string;
  metadata: unknown;
}) {
  try {
    const admin = createStaticAdminClient();
    const organizationId = await resolveOrganizationId(admin, input.instanceName, input.connectionId);
    if (!organizationId) return;

    const { error } = await admin.from('whatsapp_messages').insert({
      organization_id: organizationId,
      phone: input.phone,
      contact_name: input.contactName,
      direction: 'in',
      message: input.message || 'Mensagem recebida via WhatsApp (sem texto).',
      provider: 'evolution',
      external_message_id: input.externalMessageId,
      metadata: input.metadata ?? {},
    });

    // Duplicado de evento é esperado em retries do provedor.
    if (error) {
      const msg = String(error.message || '').toLowerCase();
      const isDuplicate = msg.includes('duplicate') || msg.includes('unique');
      if (!isDuplicate) {
        // keep best-effort behavior: do not break webhook flow
      }
    }
  } catch {
    // Best effort only: webhook forwarding should continue even if persistence fails.
  }
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token') ?? '';
    const sourceId = url.searchParams.get('sourceId') ?? process.env.EVOLUTION_WEBHOOK_SOURCE_ID ?? '';
    const connectionId = url.searchParams.get('connectionId') ?? '';

    const expectedToken = process.env.EVOLUTION_WEBHOOK_TOKEN ?? '';
    const sourceSecret = process.env.EVOLUTION_WEBHOOK_SOURCE_SECRET ?? '';
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

    if (expectedToken && token !== expectedToken) {
      return NextResponse.json({ error: 'Token invalido.' }, { status: 401 });
    }

    const raw = await req.json();
    const eventName = normalizeEvolutionEventName(raw?.event || raw?.type);
    if (!eventName.includes('messages.upsert')) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'Evento ignorado.' }, { status: 202 });
    }

    const data = raw?.data ?? {};
    const key = data?.key ?? data?.messages?.[0]?.key ?? {};
    const messageNode = data?.message ?? data?.messages?.[0]?.message ?? {};

    const fromMe = Boolean(key?.fromMe ?? data?.fromMe);
    if (fromMe) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'Mensagem enviada por mim.' }, { status: 202 });
    }

    const remoteJid = String(key?.remoteJid ?? data?.remoteJid ?? '');
    if (!remoteJid || remoteJid.endsWith('@g.us')) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'Sem remetente valido.' }, { status: 202 });
    }

    const phoneDigits = pickBestPhone(raw, data, key);
    if (!phoneDigits) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'Telefone invalido no evento.' }, { status: 202 });
    }

    const text = getTextFromMessageNode(messageNode);
    const pushName = String(data?.pushName ?? data?.messages?.[0]?.pushName ?? '').trim();
    const externalEventId = String(key?.id ?? data?.id ?? `${Date.now()}-${phoneDigits}`).trim();

    await persistInboundMessage({
      connectionId,
      instanceName: pickInstanceName(raw),
      phone: `+${phoneDigits}`,
      contactName: pushName || `WhatsApp ${phoneDigits}`,
      message: text,
      externalMessageId: externalEventId,
      metadata: raw,
    });

    const payload = {
      external_event_id: externalEventId,
      contact_name: pushName || `WhatsApp ${phoneDigits}`,
      phone: `+${phoneDigits}`,
      source: 'evolution-whatsapp',
      deal_title: pushName ? `WhatsApp - ${pushName}` : `WhatsApp - ${phoneDigits}`,
      notes: text || 'Mensagem recebida via WhatsApp (sem texto).',
    };

    // Forward para webhook-in é opcional. Se as envs não estiverem definidas,
    // ainda persistimos mensagem inbound e retornamos sucesso.
    if (!sourceId || !sourceSecret || !supabaseUrl) {
      return NextResponse.json({
        ok: true,
        forwarded: false,
        reason: 'Forward para webhook-in desabilitado (sourceId/sourceSecret nao configurados).',
      });
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/webhook-in/${sourceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': sourceSecret,
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    const responseText = await response.text();
    if (!response.ok) {
      return NextResponse.json(
        {
          error: 'Falha ao encaminhar evento para webhook-in.',
          status: response.status,
          details: responseText,
        },
        { status: 502 }
      );
    }

    let parsed: unknown = responseText;
    try {
      parsed = responseText ? JSON.parse(responseText) : null;
    } catch {
      parsed = responseText || null;
    }

    return NextResponse.json({ ok: true, forwarded: true, result: parsed });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno no webhook Evolution.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
