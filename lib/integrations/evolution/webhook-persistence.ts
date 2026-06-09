import { createStaticAdminClient } from '@/lib/supabase/staticAdminClient';
import {
  type MediaInfo,
  uniquePhones,
  toPhoneWithPlus,
  toPhoneDigitsStrict,
  getBrPhoneVariations,
  isLikelyOpaqueWhatsAppId,
} from './webhook-helpers';

export async function logWebhookEvent(input: {
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

export async function resolveOrganizationId(
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

export async function persistInboundMessage(input: {
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

    if (!selectedPhone) return null;

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
      const { data: boardData } = await admin
        .from('boards')
        .select('id')
        .eq('organization_id', organizationId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

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

    if (error) {
      const msg = String(error.message || '').toLowerCase();
      const isDuplicate = msg.includes('duplicate') || msg.includes('unique');
      if (!isDuplicate) {
        // keep best-effort behavior: do not break webhook flow
      }
    }
    return selectedPhone;
  } catch {
    return null;
  }
}
