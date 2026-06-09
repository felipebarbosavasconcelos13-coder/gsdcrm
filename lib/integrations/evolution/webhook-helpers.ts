import { toWhatsAppPhone } from '@/lib/phone';

export function getTextFromMessageNode(message: any): string {
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

export type WhatsAppMessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'contact'
  | 'location'
  | 'unknown';

export type MediaInfo = {
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

export function mediaInfoFromMessage(message: any, raw: any, data: any): MediaInfo {
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

export function normalizeEvolutionEventName(raw: unknown) {
  return String(raw ?? '').trim().toLowerCase().replace(/_/g, '.');
}

export function boolFromAny(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true' || v === '1' || v === 'yes') return true;
    if (v === 'false' || v === '0' || v === 'no') return false;
  }
  if (typeof value === 'number') return value !== 0;
  return false;
}

export function pickInstanceName(raw: any): string {
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

export function jidToId(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return raw.includes('@') ? raw.split('@')[0] : raw;
}

export function toPhoneDigitsStrict(value: unknown): string {
  const raw = jidToId(value);
  if (!raw) return '';
  const normalized = toWhatsAppPhone(raw);
  const digits = String(normalized || '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return '';
  return digits;
}

export function toPhoneWithPlus(value: string): string {
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
    const withoutNine = '55' + digits.substring(2, 4) + digits.substring(5);
    const formatted = `+${withoutNine}`;
    if (!variations.includes(formatted)) {
      variations.push(formatted);
    }
  } else if (digits.length === 12) {
    const withNine = '55' + digits.substring(2, 4) + '9' + digits.substring(4);
    const formatted = `+${withNine}`;
    if (!variations.includes(formatted)) {
      variations.push(formatted);
    }
  }

  return variations;
}

export function isLikelyOpaqueWhatsAppId(phoneWithPlus: string): boolean {
  const digits = String(phoneWithPlus || '').replace(/\D/g, '');
  if (!digits) return false;
  if (digits.startsWith('16') && digits.length >= 14) return true;
  if (digits.length > 15) return true;
  return false;
}

export function uniquePhones(values: string[]): string[] {
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

export function collectRawIdentifierCandidates(node: unknown): string[] {
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

export function pickBestPhone(raw: any, data: any, key: any, fromMe: boolean) {
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
