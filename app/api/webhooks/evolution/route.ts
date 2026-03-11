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

function pickInstanceName(raw: any): string {
  return String(
    raw?.instance ??
      raw?.instanceName ??
      raw?.instance_name ??
      raw?.data?.instance ??
      raw?.data?.instanceName ??
      ''
  ).trim();
}

async function persistInboundMessage(input: {
  instanceName: string;
  phone: string;
  contactName: string;
  message: string;
  externalMessageId: string;
  metadata: unknown;
}) {
  if (!input.instanceName) return;

  try {
    const admin = createStaticAdminClient();

    const { data: connection } = await admin
      .from('organization_whatsapp_connections')
      .select('organization_id')
      .eq('provider', 'evolution')
      .eq('instance_name', input.instanceName)
      .eq('active', true)
      .maybeSingle();

    if (!connection?.organization_id) return;

    await admin.from('whatsapp_messages').upsert(
      {
        organization_id: connection.organization_id,
        phone: input.phone,
        contact_name: input.contactName,
        direction: 'in',
        message: input.message || 'Mensagem recebida via WhatsApp (sem texto).',
        provider: 'evolution',
        external_message_id: input.externalMessageId,
        metadata: input.metadata ?? {},
      },
      { onConflict: 'organization_id,external_message_id', ignoreDuplicates: true }
    );
  } catch {
    // Best effort only: webhook forwarding should continue even if persistence fails.
  }
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token') ?? '';
    const sourceId = url.searchParams.get('sourceId') ?? process.env.EVOLUTION_WEBHOOK_SOURCE_ID ?? '';

    const expectedToken = process.env.EVOLUTION_WEBHOOK_TOKEN ?? '';
    const sourceSecret = process.env.EVOLUTION_WEBHOOK_SOURCE_SECRET ?? '';
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

    if (!sourceId || !sourceSecret || !supabaseUrl) {
      return NextResponse.json({ error: 'Webhook Evolution nao configurado no servidor.' }, { status: 500 });
    }

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

    const rawPhone = remoteJid.split('@')[0] ?? '';
    const phoneDigits = toWhatsAppPhone(rawPhone);
    if (!phoneDigits) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'Telefone invalido no evento.' }, { status: 202 });
    }

    const text = getTextFromMessageNode(messageNode);
    const pushName = String(data?.pushName ?? data?.messages?.[0]?.pushName ?? '').trim();
    const externalEventId = String(key?.id ?? data?.id ?? `${Date.now()}-${phoneDigits}`).trim();

    await persistInboundMessage({
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
