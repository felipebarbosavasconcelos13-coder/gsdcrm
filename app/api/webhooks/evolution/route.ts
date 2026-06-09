import { NextResponse } from 'next/server';
import { toWhatsAppPhone } from '@/lib/phone';
import { createStaticAdminClient } from '@/lib/supabase/staticAdminClient';

function getTextFromMessageNode(message: any): string {
  if (!message || typeof message !== 'object') return '';
  if (typeof message.conversation === 'string') return message.conversation;
  if (typeof message.extendedTextMessage?.text === 'string') return message.extendedTextMessage.text;
  if (typeof message.imageMessage?.caption === 'string') return message.imageMessage.caption;
  if (typeof message.videoMessage?.caption === 'string') return message.videoMessage.caption;
  if (typeof message.documentMessage?.caption === 'string') return message.documentMessage.caption;
  if (typeof message.locationMessage?.name === 'string') return message.locationMessage.name;
  if (typeof message.contactMessage?.displayName === 'string') return message.contactMessage.displayName;
  return '';
}

type WhatsAppMessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'contact'
  | 'location'
  | 'unknown';

type MediaInfo = {
  messageType: WhatsAppMessageType;
  caption?: string | null;
  mediaUrl?: string | null;
  mediaBase64?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mediaSeconds?: number | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
};

function asOptionalText(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || null;
}

function asOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    const text = asOptionalText(value);
    if (text) return text;
  }
  return null;
}

function normalizeBase64(value: unknown, mimeType?: string | null): string | null {
  const text = asOptionalText(value);
  if (!text) return null;
  if (text.startsWith('data:')) return text;
  if (/^https?:\/\//i.test(text)) return null;
  return mimeType ? `data:${mimeType};base64,${text}` : text;
}

function mediaInfoFromMessage(message: any, raw: any, data: any): MediaInfo {
  const image = message?.imageMessage;
  const video = message?.videoMessage;
  const audio = message?.audioMessage;
  const document = message?.documentMessage;
  const sticker = message?.stickerMessage;
  const contact = message?.contactMessage;
  const location = message?.locationMessage;

  const node =
    image || video || audio || document || sticker || contact || location || {};

  const messageType: WhatsAppMessageType =
    image ? 'image'
      : video ? 'video'
        : audio ? 'audio'
          : document ? 'document'
            : sticker ? 'sticker'
              : contact ? 'contact'
                : location ? 'location'
                  : getTextFromMessageNode(message) ? 'text'
                    : 'unknown';

  const mimeType = firstText(node.mimetype, node.mimeType, data?.mimetype, raw?.mimetype);
  const caption = firstText(node.caption, data?.caption, raw?.caption);
  const mediaUrl = firstText(
    node.url,
    node.mediaUrl,
    node.media_url,
    data?.mediaUrl,
    data?.media_url,
    raw?.mediaUrl,
    raw?.media_url
  );
  const mediaBase64 = normalizeBase64(
    firstText(
      node.base64,
      node.mediaBase64,
      node.media_base64,
      data?.base64,
      data?.mediaBase64,
      data?.media_base64,
      raw?.base64,
      raw?.mediaBase64,
      raw?.media_base64,
      node.jpegThumbnail
    ),
    mimeType || (image || sticker ? 'image/jpeg' : null)
  );

  return {
    messageType,
    caption,
    mediaUrl,
    mediaBase64,
    mimeType,
    fileName: firstText(node.fileName, node.file_name, node.title, data?.fileName, raw?.fileName),
    fileSize: asOptionalNumber(node.fileLength ?? node.fileSize ?? data?.fileLength ?? data?.fileSize),
    mediaSeconds: asOptionalNumber(node.seconds ?? node.duration ?? data?.seconds ?? data?.duration),
    mediaWidth: asOptionalNumber(node.width ?? data?.width),
    mediaHeight: asOptionalNumber(node.height ?? data?.height),
  };
}

function normalizeEvolutionEventName(raw: unknown) {
  return String(raw ?? '').trim().toLowerCase().replace(/_/g, '.');
}

function jidToId(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return raw.includes('@') ? raw.split('@')[0] : raw;
}

function boolFromAny(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true' || v === '1' || v === 'yes') return true;
    if (v === 'false' || v === '0' || v === 'no') return false;
  }
  if (typeof value === 'number') return value !== 0;
  return false;
}

function toPhoneDigitsStrict(value: unknown): string {
  const raw = jidToId(value);
  if (!raw) return '';
  const normalized = toWhatsAppPhone(raw);
  const digits = String(normalized || '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return '';
  return digits;
}

function toPhoneWithPlus(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.startsWith('+') ? raw : `+${raw}`;
}

export function getBrPhoneVariations(phoneWithPlus: string): string[] {
  const normalized = phoneWithPlus.trim();
  if (!normalized) return [];

  const digits = normalized.replace(/\D/g, '');
  if (!digits.startsWith('55')) {
    return [normalized];
  }

  const variations = [normalized];

  if (digits.length === 13 && digits.charAt(4) === '9') {
    // 55 + DD + 9 + 8 digits -> remove 9
    const withoutNine = '55' + digits.substring(2, 4) + digits.substring(5);
    const formatted = `+${withoutNine}`;
    if (!variations.includes(formatted)) {
      variations.push(formatted);
    }
  } else if (digits.length === 12) {
    // 55 + DD + 8 digits -> insert 9 at index 4
    const withNine = '55' + digits.substring(2, 4) + '9' + digits.substring(4);
    const formatted = `+${withNine}`;
    if (!variations.includes(formatted)) {
      variations.push(formatted);
    }
  }

  return variations;
}

async function logWebhookEvent(input: {
  admin: ReturnType<typeof createStaticAdminClient>;
  organizationId: string | null;
  sourceId: string | null;
  provider: string;
  externalEventId: string | null;
  payload: unknown;
  status: string;
  error: string | null;
  createdContactId?: string | null;
  createdDealId?: string | null;
}) {
  if (!input.organizationId) return;
  const dedupeId = input.externalEventId || `${input.status}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const row: Record<string, unknown> = {
      organization_id: input.organizationId,
      source_id: input.sourceId || null,
      provider: input.provider,
      external_event_id: dedupeId,
      payload: input.payload ?? {},
      status: input.status,
      received_at: new Date().toISOString(),
    };
    if (input.error) row.error = input.error;
    if (input.createdContactId) row.created_contact_id = input.createdContactId;
    if (input.createdDealId) row.created_deal_id = input.createdDealId;

    if (input.sourceId) {
      await input.admin.from('webhook_events_in').upsert(row, {
        onConflict: 'source_id, external_event_id',
        ignoreDuplicates: false,
      });
    } else {
      await input.admin.from('webhook_events_in').insert(row);
    }
  } catch {
    // Log é best-effort; não quebra o fluxo do webhook.
  }
}

function isLikelyOpaqueWhatsAppId(phoneWithPlus: string): boolean {
  const digits = String(phoneWithPlus || '').replace(/\D/g, '');
  if (!digits) return false;
  // IDs LID comuns da Meta (não são telefone real do lead).
  if (digits.startsWith('16') && digits.length >= 14) return true;
  // Telefones válidos normalmente ficam até 15 dígitos E.164; ids muito longos tendem a ser opacos.
  if (digits.length > 15) return true;
  return false;
}

function uniquePhones(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = toPhoneDigitsStrict(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function collectMessageContextCandidates(message: any): string[] {
  if (!message || typeof message !== 'object') return [];

  const values = [
    message?.extendedTextMessage?.contextInfo?.participant,
    message?.imageMessage?.contextInfo?.participant,
    message?.videoMessage?.contextInfo?.participant,
    message?.documentMessage?.contextInfo?.participant,
    message?.audioMessage?.contextInfo?.participant,
    message?.stickerMessage?.contextInfo?.participant,
    message?.contactMessage?.vcard,
  ];

  return uniquePhones(values.map((v) => String(v ?? '')));
}

function collectDeepPhoneCandidates(node: unknown): string[] {
  const queue: Array<{ value: unknown; key: string; depth: number }> = [
    { value: node, key: '', depth: 0 },
  ];
  const visited = new Set<object>();
  const found: string[] = [];
  let traversed = 0;

  while (queue.length > 0 && traversed < 800) {
    traversed += 1;
    const current = queue.shift();
    if (!current) break;

    const { value, key, depth } = current;
    if (value == null) continue;

    if (typeof value === 'string' || typeof value === 'number') {
      const asText = String(value);
      if (asText.length > 220) continue;

      const keyHint = /jid|phone|number|participant|remote|sender|from|to|owner|chat/i.test(key);
      const valueHint = asText.includes('@') || /^\+?\d[\d()\s.-]{8,}$/.test(asText);
      if (!keyHint && !valueHint) continue;

      const candidate = toPhoneDigitsStrict(asText);
      if (candidate) found.push(candidate);
      continue;
    }

    if (typeof value !== 'object') continue;
    if (visited.has(value as object)) continue;
    visited.add(value as object);

    if (depth >= 6) continue;

    if (Array.isArray(value)) {
      value.forEach((entry) => queue.push({ value: entry, key, depth: depth + 1 }));
      continue;
    }

    Object.entries(value).forEach(([entryKey, entryValue]) => {
      queue.push({ value: entryValue, key: entryKey, depth: depth + 1 });
    });
  }

  return uniquePhones(found);
}

function collectRawIdentifierCandidates(node: unknown): string[] {
  const queue: Array<{ value: unknown; depth: number }> = [{ value: node, depth: 0 }];
  const visited = new Set<object>();
  const found = new Set<string>();
  let traversed = 0;

  while (queue.length > 0 && traversed < 1200) {
    traversed += 1;
    const current = queue.shift();
    if (!current) break;

    const { value, depth } = current;
    if (value == null) continue;

    if (typeof value === 'string') {
      if (value.length <= 240) {
        const text = value.trim();
        const hasJid = /@[a-z]/i.test(text);
        const hasLongDigits = /\d{10,}/.test(text);
        if (hasJid || hasLongDigits) {
          found.add(text);
        }
      }
      continue;
    }

    if (typeof value === 'number') {
      const text = String(value);
      if (text.length >= 10 && text.length <= 22) {
        found.add(text);
      }
      continue;
    }

    if (typeof value !== 'object') continue;
    if (visited.has(value as object)) continue;
    visited.add(value as object);
    if (depth >= 6) continue;

    if (Array.isArray(value)) {
      value.forEach((entry) => queue.push({ value: entry, depth: depth + 1 }));
      continue;
    }

    Object.values(value).forEach((entry) => queue.push({ value: entry, depth: depth + 1 }));
  }

  return Array.from(found).slice(0, 120);
}

function collectOwnerPhoneCandidates(raw: any, data: any): string[] {
  return uniquePhones(
    [
      raw?.sender?.phone,
      raw?.sender?.id,
      raw?.sender,
      raw?.owner?.phone,
      raw?.owner?.id,
      raw?.owner,
      raw?.me?.phone,
      raw?.me?.id,
      data?.owner?.phone,
      data?.owner?.id,
      data?.owner,
      data?.me?.phone,
      data?.me?.id,
      data?.instanceOwner,
      data?.instancePhone,
      data?.instanceJid,
    ].map((v) => String(v ?? ''))
  );
}

function collectPhoneCandidates(raw: any, data: any, key: any, fromMe: boolean) {
  const participantFields = [
    key?.participant,
    data?.participant,
    data?.messages?.[0]?.key?.participant,
    data?.messages?.[0]?.participant,
    data?.sender?.phone,
    data?.sender?.id,
    data?.sender,
    data?.from,
    data?.fromNumber,
  ];

  const chatFields = [
    key?.remoteJid,
    data?.remoteJid,
    data?.chatId,
    data?.key?.remoteJid,
    data?.messages?.[0]?.key?.remoteJid,
    raw?.data?.key?.remoteJid,
    raw?.data?.messages?.[0]?.key?.remoteJid,
  ];

  const fallbackFields = [
    raw?.from,
    raw?.sender?.phone,
    raw?.sender?.id,
    raw?.sender,
    raw?.data?.from,
    raw?.data?.sender?.phone,
    raw?.data?.sender?.id,
    raw?.data?.sender,
  ];

  const messageNode =
    data?.message ??
    data?.messages?.[0]?.message ??
    raw?.data?.message ??
    raw?.data?.messages?.[0]?.message ??
    {};
  const contextFields = collectMessageContextCandidates(messageNode);
  const deepFields = collectDeepPhoneCandidates(raw);

  const ordered = fromMe
    ? [...participantFields, ...chatFields, ...contextFields, ...fallbackFields, ...deepFields]
    : [...chatFields, ...participantFields, ...contextFields, ...fallbackFields, ...deepFields];

  return uniquePhones(ordered.map((v) => String(v ?? '')));
}

function pickBestPhone(raw: any, data: any, key: any, fromMe: boolean) {
  const remoteJidRaw = String(key?.remoteJid ?? data?.remoteJid ?? '').trim();
  const remoteId = toPhoneDigitsStrict(remoteJidRaw);
  const all = collectPhoneCandidates(raw, data, key, fromMe);
  const ownerCandidates = collectOwnerPhoneCandidates(raw, data);
  const ownerSet = new Set(ownerCandidates);
  const nonOwnerCandidates = all.filter((candidate) => !ownerSet.has(candidate));
  const candidatesPool = nonOwnerCandidates.length > 0 ? nonOwnerCandidates : all;

  const isLid = remoteJidRaw.endsWith('@lid');
  if (!isLid && remoteId && candidatesPool.includes(remoteId)) {
    return { primary: remoteId, candidates: all, ownerCandidates };
  }

  const participantCandidates = uniquePhones(
    [
      key?.participant,
      data?.participant,
      data?.messages?.[0]?.key?.participant,
      data?.messages?.[0]?.participant,
    ].map((value) => String(value ?? ''))
  );

  const participantPreferred = participantCandidates.find((candidate) =>
    candidatesPool.includes(candidate)
  );
  if (participantPreferred) {
    return { primary: participantPreferred, candidates: all, ownerCandidates };
  }

  if (remoteId && candidatesPool.includes(remoteId)) {
    return { primary: remoteId, candidates: all, ownerCandidates };
  }

  const br = candidatesPool.find((p) => p.startsWith('55') && p.length >= 12 && p.length <= 13);
  if (br) return { primary: br, candidates: all, ownerCandidates };

  return { primary: candidatesPool[0] || remoteId || '', candidates: all, ownerCandidates };
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
  phoneCandidates?: string[];
  ownerPhoneCandidates?: string[];
  rawIdentifiers?: string[];
  contactName: string;
  message: string;
  media: MediaInfo;
  externalMessageId: string;
  metadata: unknown;
}) {
  try {
    const admin = createStaticAdminClient();
    const organizationId = await resolveOrganizationId(admin, input.instanceName, input.connectionId);
    if (!organizationId) return null;

    const baseCandidates = uniquePhones([
      input.phone,
      ...(input.phoneCandidates ?? []),
    ]).map(toPhoneWithPlus);

    const allCandidatesWithPlus: string[] = [];
    for (const phone of baseCandidates) {
      const vars = getBrPhoneVariations(phone);
      for (const v of vars) {
        if (!allCandidatesWithPlus.includes(v)) {
          allCandidatesWithPlus.push(v);
        }
      }
    }

    const ownerCandidatesWithPlus = new Set(
      uniquePhones(input.ownerPhoneCandidates ?? []).map(toPhoneWithPlus)
    );

    const candidatesPool = allCandidatesWithPlus.filter((candidate) => !ownerCandidatesWithPlus.has(candidate));
    const effectiveCandidates = candidatesPool.length > 0 ? candidatesPool : allCandidatesWithPlus;

    let selectedPhone = toPhoneWithPlus(toPhoneDigitsStrict(input.phone));
    if (!selectedPhone && effectiveCandidates.length > 0) {
      selectedPhone = effectiveCandidates[0];
    }

    if (effectiveCandidates.length > 1) {
      const scores = new Map<string, number>();
      for (const candidate of effectiveCandidates) scores.set(candidate, 0);

      if (selectedPhone && scores.has(selectedPhone)) {
        scores.set(selectedPhone, (scores.get(selectedPhone) ?? 0) + 20);
      }

      for (const ownerCandidate of ownerCandidatesWithPlus) {
        if (scores.has(ownerCandidate)) {
          scores.set(ownerCandidate, (scores.get(ownerCandidate) ?? 0) - 350);
        }
      }

      const { data: recentMessages } = await admin
        .from('whatsapp_messages')
        .select('phone,direction,created_at')
        .eq('organization_id', organizationId)
        .in('phone', effectiveCandidates)
        .order('created_at', { ascending: false })
        .limit(50);

      if (Array.isArray(recentMessages)) {
        recentMessages.forEach((row, index) => {
          const phone = String(row.phone || '').trim();
          if (!scores.has(phone)) return;

          const base = row.direction === 'out' ? 1000 : 120;
          const recency = Math.max(1, 50 - index);
          scores.set(phone, (scores.get(phone) ?? 0) + base + recency);
        });
      }

      const { data: contacts } = await admin
        .from('contacts')
        .select('phone')
        .eq('organization_id', organizationId)
        .in('phone', effectiveCandidates)
        .limit(effectiveCandidates.length);

      if (Array.isArray(contacts)) {
        contacts.forEach((row) => {
          const phone = String(row.phone || '').trim();
          if (!scores.has(phone)) return;
          scores.set(phone, (scores.get(phone) ?? 0) + 600);
        });
      }

      let bestPhone = selectedPhone || effectiveCandidates[0];
      let bestScore = scores.get(bestPhone) ?? Number.NEGATIVE_INFINITY;
      for (const [candidate, score] of scores.entries()) {
        if (score > bestScore) {
          bestPhone = candidate;
          bestScore = score;
        }
      }
      selectedPhone = bestPhone;
    }

    if (!selectedPhone) {
      return null;
    }

    const selectedPhoneVariations = getBrPhoneVariations(selectedPhone);

    const { data: selectedContactRows } = await admin
      .from('contacts')
      .select('id, phone')
      .eq('organization_id', organizationId)
      .in('phone', selectedPhoneVariations)
      .limit(1);

    const { data: selectedOutRows } = await admin
      .from('whatsapp_messages')
      .select('id, phone')
      .eq('organization_id', organizationId)
      .eq('direction', 'out')
      .in('phone', selectedPhoneVariations)
      .limit(1);

    let selectedIsKnown = false;
    if (selectedContactRows && selectedContactRows.length > 0) {
      selectedPhone = selectedContactRows[0].phone;
      selectedIsKnown = true;
    } else if (selectedOutRows && selectedOutRows.length > 0) {
      selectedPhone = selectedOutRows[0].phone;
      selectedIsKnown = true;
    }

    if (!selectedIsKnown) {
      // 1. Buscar o primeiro Board da organização
      const { data: boardData } = await admin
        .from('boards')
        .select('id')
        .eq('organization_id', organizationId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      // 2. Buscar a primeira Stage desse board
      let stageId: string | null = null;
      if (boardData?.id) {
        const { data: stageData } = await admin
          .from('board_stages')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('board_id', boardData.id)
          .order('order', { ascending: true })
          .limit(1)
          .maybeSingle();
        stageId = stageData?.id || null;
      }

      // 3. Criar Contato na tabela contacts
      const now = new Date().toISOString();
      const contactName = input.contactName || `WhatsApp ${selectedPhone}`;
      const contactPayload = {
        organization_id: organizationId,
        name: contactName,
        phone: selectedPhone,
        created_at: now,
        updated_at: now,
        status: 'ACTIVE',
        stage: 'LEAD',
      };
      
      const { data: newContact, error: contactError } = await admin
        .from('contacts')
        .insert(contactPayload)
        .select('id')
        .single();

      if (contactError) {
        console.error('Erro ao criar contato automático no webhook:', contactError);
        await logWebhookEvent({
          admin,
          organizationId,
          sourceId: null,
          provider: 'evolution',
          externalEventId: input.externalMessageId,
          payload: { phone: selectedPhone, contactName, error: String(contactError.message || contactError) },
          status: 'error',
          error: `Falha ao criar contato: ${String(contactError.message || contactError)}`,
        });
      } else if (newContact?.id) {
        let createdDealId: string | null = null;
        if (boardData?.id && stageId) {
          const dealPayload = {
            organization_id: organizationId,
            title: contactName,
            board_id: boardData.id,
            stage_id: stageId,
            contact_id: newContact.id,
            value: 0,
            is_won: false,
            is_lost: false,
            created_at: now,
            updated_at: now,
          };
          const { data: newDeal, error: dealError } = await admin.from('deals').insert(dealPayload).select('id').single();
          if (dealError) {
            console.error('Erro ao criar deal automático no webhook:', dealError);
            await logWebhookEvent({
              admin,
              organizationId,
              sourceId: null,
              provider: 'evolution',
              externalEventId: input.externalMessageId,
              payload: { phone: selectedPhone, contactName, contactId: newContact.id, error: String(dealError.message || dealError) },
              status: 'error',
              error: `Contato criado, mas deal falhou: ${String(dealError.message || dealError)}`,
              createdContactId: newContact.id,
            });
          } else if (newDeal?.id) {
            createdDealId = newDeal.id;
          }
        } else if (!boardData?.id) {
          console.error('Nenhum board ativo encontrado para criar deal automatico. Organizacao:', organizationId);
          await logWebhookEvent({
            admin,
            organizationId,
            sourceId: null,
            provider: 'evolution',
            externalEventId: input.externalMessageId,
            payload: { phone: selectedPhone, contactName, contactId: newContact.id },
            status: 'error',
            error: 'Contato criado, mas nenhum board ativo encontrado para criar deal.',
            createdContactId: newContact.id,
          });
        }

        if (createdDealId) {
          await logWebhookEvent({
            admin,
            organizationId,
            sourceId: null,
            provider: 'evolution',
            externalEventId: input.externalMessageId,
            payload: { phone: selectedPhone, contactName },
            status: 'processed',
            error: null,
            createdContactId: newContact.id,
            createdDealId,
          });
        }
      }
    }

    // Fallback APENAS para payloads LID/IDs opacos da Meta:
    // tenta correlacionar com mensagens outbound recentes.
    if (isLikelyOpaqueWhatsAppId(selectedPhone)) {
      const ids = (input.rawIdentifiers ?? []).filter(Boolean);
      const scores = new Map<string, number>();

      const { data: recentOutForCorrelation } = await admin
        .from('whatsapp_messages')
        .select('phone,contact_name,metadata,created_at')
        .eq('organization_id', organizationId)
        .eq('direction', 'out')
        .order('created_at', { ascending: false })
        .limit(120);

      if (Array.isArray(recentOutForCorrelation)) {
        recentOutForCorrelation.forEach((row, index) => {
          const outPhone = String(row.phone || '').trim();
          if (!outPhone) return;
          if (!scores.has(outPhone)) scores.set(outPhone, 0);

          const recencyBoost = Math.max(1, 120 - index);
          scores.set(outPhone, (scores.get(outPhone) ?? 0) + recencyBoost);

          const contactName = String(row.contact_name || '').trim().toLowerCase();
          const inboundName = String(input.contactName || '').trim().toLowerCase();
          if (contactName && inboundName && contactName === inboundName) {
            scores.set(outPhone, (scores.get(outPhone) ?? 0) + 250);
          }

          if (ids.length > 0) {
            let metadataText = '';
            try {
              metadataText = JSON.stringify((row as { metadata?: unknown }).metadata ?? {});
            } catch {
              metadataText = '';
            }
            if (metadataText) {
              for (const identifier of ids) {
                if (identifier.length < 6) continue;
                if (metadataText.includes(identifier)) {
                  scores.set(outPhone, (scores.get(outPhone) ?? 0) + 2000);
                  break;
                }
              }
            }
          }
        });
      }

      const best = Array.from(scores.entries()).sort((a, b) => b[1] - a[1])[0];
      if (best?.[0] && best[1] >= 150) {
        selectedPhone = best[0];
      } else if (isLikelyOpaqueWhatsAppId(selectedPhone)) {
        const { data: veryRecentOut } = await admin
          .from('whatsapp_messages')
          .select('phone,created_at')
          .eq('organization_id', organizationId)
          .eq('direction', 'out')
          .order('created_at', { ascending: false })
          .limit(20);

        const distinctRecentPhones = Array.from(
          new Set((veryRecentOut ?? []).map((row) => String(row.phone || '').trim()).filter(Boolean))
        );
        if (distinctRecentPhones.length === 1) {
          selectedPhone = distinctRecentPhones[0];
        }
      }
    }

    const { error } = await admin.from('whatsapp_messages').insert({
      organization_id: organizationId,
      phone: selectedPhone,
      contact_name: input.contactName,
      direction: 'in',
      message: input.message || 'Mensagem recebida via WhatsApp (sem texto).',
      message_type: input.media.messageType,
      caption: input.media.caption ?? null,
      media_url: input.media.mediaUrl ?? null,
      media_base64: input.media.mediaBase64 ?? null,
      mime_type: input.media.mimeType ?? null,
      file_name: input.media.fileName ?? null,
      file_size: input.media.fileSize ?? null,
      media_seconds: input.media.mediaSeconds ?? null,
      media_width: input.media.mediaWidth ?? null,
      media_height: input.media.mediaHeight ?? null,
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
    return selectedPhone;
  } catch {
    // Best effort only: webhook forwarding should continue even if persistence fails.
    return null;
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

    const payload = {
      external_event_id: externalEventId,
      contact_name: pushName || `WhatsApp ${phoneResolution.primary}`,
      phone: persistedPhone,
      source: 'evolution-whatsapp',
      deal_title: pushName ? `WhatsApp - ${pushName}` : `WhatsApp - ${phoneResolution.primary}`,
      notes: text || media.caption || `Mensagem ${media.messageType} recebida via WhatsApp.`,
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
