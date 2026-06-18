import { NextResponse } from 'next/server';
import { createStaticAdminClient } from '@/lib/supabase/staticAdminClient';
import {
  fetchProfilePictureUrlFromEvolution,
  type EvolutionConfig,
} from '@/lib/integrations/evolution/client';
import {
  getTextFromMessageNode,
  mediaInfoFromMessage,
  normalizeEvolutionEventName,
  boolFromAny,
  pickInstanceName,
  collectRawIdentifierCandidates,
  pickBestPhone,
} from '@/lib/integrations/evolution/webhook-helpers';
import {
  logWebhookEvent,
  resolveOrganizationId,
  persistInboundMessage,
} from '@/lib/integrations/evolution/webhook-persistence';

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (text && /^https?:\/\//i.test(text)) return text;
  }
  return null;
}

function profilePictureUrlFromPayload(raw: any) {
  return firstText(
    raw?.profilePictureUrl,
    raw?.profilePicUrl,
    raw?.picture,
    raw?.data?.profilePictureUrl,
    raw?.data?.profilePicUrl,
    raw?.data?.picture,
    raw?.data?.profilePicture,
    raw?.data?.contact?.profilePictureUrl,
    raw?.data?.contact?.profilePicUrl,
    raw?.data?.contact?.picture,
    raw?.data?.messages?.[0]?.profilePictureUrl,
    raw?.data?.messages?.[0]?.profilePicUrl,
    raw?.data?.messages?.[0]?.picture
  );
}

async function getEvolutionConfigForWebhook(input: {
  admin: ReturnType<typeof createStaticAdminClient>;
  organizationId: string | null;
  connectionId: string;
  instanceName: string;
}): Promise<EvolutionConfig | null> {
  if (!input.organizationId) return null;

  let query = input.admin
    .from('organization_whatsapp_connections')
    .select('instance_url, instance_name, api_key')
    .eq('organization_id', input.organizationId)
    .eq('provider', 'evolution')
    .eq('active', true);

  if (input.connectionId) {
    query = query.eq('id', input.connectionId);
  } else if (input.instanceName) {
    query = query.ilike('instance_name', input.instanceName);
  }

  const { data } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!data?.instance_url || !data?.instance_name || !data?.api_key) return null;

  return {
    baseUrl: String(data.instance_url).replace(/\/$/, ''),
    instance: String(data.instance_name),
    apiKey: String(data.api_key),
  };
}

async function fetchContactProfilePictureUrl(input: {
  raw: any;
  admin: ReturnType<typeof createStaticAdminClient>;
  organizationId: string | null;
  connectionId: string;
  instanceName: string;
  phoneDigits: string;
}) {
  const fromPayload = profilePictureUrlFromPayload(input.raw);
  if (fromPayload) return fromPayload;

  const config = await getEvolutionConfigForWebhook(input);
  if (!config) return null;

  const result = await fetchProfilePictureUrlFromEvolution({
    config,
    number: input.phoneDigits,
  });

  return result.profilePictureUrl || null;
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

    const instanceName = pickInstanceName(raw);
    const admin = createStaticAdminClient();
    const organizationId = await resolveOrganizationId(admin, instanceName, connectionId);

    let resolvedSourceId = sourceId;
    let resolvedSourceSecret = sourceSecret;
    if ((!resolvedSourceId || !resolvedSourceSecret) && organizationId) {
      const { data: inboundSource } = await admin
        .from('integration_inbound_sources')
        .select('id, secret')
        .eq('organization_id', organizationId)
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (inboundSource) {
        resolvedSourceId = inboundSource.id;
        resolvedSourceSecret = inboundSource.secret;
      }
    }

    const externalEventSuffix = raw?.data?.key?.id || raw?.data?.messages?.[0]?.key?.id || '';

    if (!eventName.includes('messages.upsert')) {
      await logWebhookEvent({
        admin,
        organizationId,
        sourceId: resolvedSourceId,
        provider: 'evolution',
        externalEventId: externalEventSuffix ? `skip-${externalEventSuffix}` : null,
        payload: raw,
        status: 'skipped',
        error: `Evento ignorado: ${eventName || 'desconhecido'}`,
      });
      return NextResponse.json({ ok: true, skipped: true, reason: 'Evento ignorado.' }, { status: 202 });
    }

    const data = raw?.data ?? {};
    const key = data?.key ?? data?.messages?.[0]?.key ?? {};
    const messageNode = data?.message ?? data?.messages?.[0]?.message ?? {};

    const fromMe = boolFromAny(
      key?.fromMe ??
        data?.fromMe ??
        data?.messages?.[0]?.key?.fromMe ??
        raw?.data?.messages?.[0]?.key?.fromMe
    );
    if (fromMe) {
      await logWebhookEvent({
        admin,
        organizationId,
        sourceId: resolvedSourceId,
        provider: 'evolution',
        externalEventId: key?.id ? `skip-out-${key.id}` : null,
        payload: raw,
        status: 'skipped',
        error: 'Mensagem enviada por mim (fromMe=true).',
      });
      return NextResponse.json({ ok: true, skipped: true, reason: 'Mensagem enviada por mim.' }, { status: 202 });
    }

    const remoteJid = String(key?.remoteJid ?? data?.remoteJid ?? '');
    if (!remoteJid || remoteJid.endsWith('@g.us')) {
      await logWebhookEvent({
        admin,
        organizationId,
        sourceId: resolvedSourceId,
        provider: 'evolution',
        externalEventId: key?.id ? `skip-jid-${key.id}` : null,
        payload: raw,
        status: 'skipped',
        error: remoteJid.endsWith('@g.us') ? 'Mensagem de grupo ignorada.' : 'Sem remetente valido (remoteJid ausente).',
      });
      return NextResponse.json({ ok: true, skipped: true, reason: 'Sem remetente valido.' }, { status: 202 });
    }

    const phoneResolution = pickBestPhone(raw, data, key, fromMe);
    if (!phoneResolution.primary) {
      await logWebhookEvent({
        admin,
        organizationId,
        sourceId: resolvedSourceId,
        provider: 'evolution',
        externalEventId: key?.id ? `skip-phone-${key.id}` : null,
        payload: raw,
        status: 'skipped',
        error: `Telefone invalido no evento (remoteJid: ${remoteJid}).`,
      });
      return NextResponse.json({ ok: true, skipped: true, reason: 'Telefone invalido no evento.' }, { status: 202 });
    }

    const rawIdentifiers = collectRawIdentifierCandidates(raw);
    const text = getTextFromMessageNode(messageNode);
    const media = mediaInfoFromMessage(messageNode, raw, data);
    const pushName = String(data?.pushName ?? data?.messages?.[0]?.pushName ?? '').trim();
    const externalEventId = String(key?.id ?? data?.id ?? `${Date.now()}-${phoneResolution.primary}`).trim();
    const profilePictureUrl = await fetchContactProfilePictureUrl({
      raw,
      admin,
      organizationId,
      connectionId,
      instanceName,
      phoneDigits: phoneResolution.primary,
    });

    const persistedPhone =
      (await persistInboundMessage({
        connectionId,
        instanceName,
        phone: `+${phoneResolution.primary}`,
        phoneCandidates: phoneResolution.candidates,
        ownerPhoneCandidates: phoneResolution.ownerCandidates,
        rawIdentifiers,
        contactName: pushName || `WhatsApp ${phoneResolution.primary}`,
        message: text || media.caption || '',
        media,
        externalMessageId: externalEventId,
        profilePictureUrl,
        metadata: raw,
      })) ?? `+${phoneResolution.primary}`;

    await logWebhookEvent({
      admin,
      organizationId,
      sourceId: resolvedSourceId,
      provider: 'evolution',
      externalEventId,
      payload: raw,
      status: persistedPhone ? 'processed' : 'received',
      error: null,
    });

    const forwardPayload = {
      external_event_id: externalEventId,
      contact_name: pushName || `WhatsApp ${phoneResolution.primary}`,
      phone: persistedPhone,
      source: 'evolution-whatsapp',
      deal_title: pushName ? `WhatsApp - ${pushName}` : `WhatsApp - ${phoneResolution.primary}`,
      notes: text || media.caption || `Mensagem ${media.messageType} recebida via WhatsApp.`,
      avatar: profilePictureUrl,
      profile_picture_url: profilePictureUrl,
    };

    if (!resolvedSourceId || !resolvedSourceSecret || !supabaseUrl) {
      return NextResponse.json({
        ok: true,
        forwarded: false,
        reason: 'Forward para webhook-in desabilitado (sourceId/sourceSecret nao configurados).',
      });
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/webhook-in/${resolvedSourceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': resolvedSourceSecret,
      },
      body: JSON.stringify(forwardPayload),
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
