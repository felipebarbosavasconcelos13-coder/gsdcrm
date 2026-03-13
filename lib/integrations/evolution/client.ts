export type EvolutionConfig = {
  baseUrl: string;
  apiKey: string;
  instance: string;
};

export type EvolutionSendTextInput = {
  config?: EvolutionConfig | null;
  phone: string;
  message: string;
  delay?: number;
};

export type EvolutionConnectionCheckResult = {
  ok: boolean;
  status: number;
  connected: boolean;
  state?: string;
  message: string;
  payload?: unknown;
};

export type EvolutionWebhookUpsertResult = {
  ok: boolean;
  status: number;
  message: string;
  payload?: unknown;
};

export function getEvolutionConfig(): EvolutionConfig | null {
  const baseUrl = process.env.EVOLUTION_API_URL?.trim().replace(/\/$/, '');
  const apiKey = process.env.EVOLUTION_API_KEY?.trim();
  const instance = process.env.EVOLUTION_INSTANCE?.trim();

  if (!baseUrl || !apiKey || !instance) return null;

  return { baseUrl, apiKey, instance };
}

function extractEvolutionError(payload: any, status: number) {
  const candidate =
    payload?.response?.message ??
    payload?.response?.error ??
    payload?.message ??
    payload?.error ??
    payload?.data?.message ??
    payload?.data?.error ??
    '';

  const message = String(candidate || '').trim();
  if (message) return message;

  if (status === 401 || status === 403) return 'Falha de autenticacao na Evolution API (apikey).';
  if (status === 404) return 'Instancia da Evolution nao encontrada.';
  if (status === 422) return 'Numero ou payload invalido para envio de WhatsApp.';

  return 'Falha ao enviar mensagem via Evolution API.';
}

function asStateToken(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function looksConnected(state: string) {
  return state.includes('open') || state.includes('connected');
}

function looksDisconnected(state: string) {
  return state.includes('close') || state.includes('disconnected') || state.includes('offline');
}

function extractStateFromPayload(payload: any, instanceName: string): string {
  const directCandidates = [
    payload?.instance?.state,
    payload?.state,
    payload?.instance?.status,
    payload?.status,
    payload?.connectionStatus,
    payload?.instance?.connectionStatus,
    payload?.response?.instance?.state,
    payload?.response?.state,
  ];

  for (const c of directCandidates) {
    const token = asStateToken(c);
    if (token) return token;
  }

  const list =
    (Array.isArray(payload?.instances) ? payload.instances : null) ||
    (Array.isArray(payload?.response) ? payload.response : null) ||
    (Array.isArray(payload) ? payload : null);

  if (list) {
    const found = list.find((item: any) => {
      const name = String(item?.name ?? item?.instanceName ?? item?.instance ?? '').trim();
      return name && name.toLowerCase() === instanceName.trim().toLowerCase();
    });

    const token = asStateToken(
      found?.state ?? found?.status ?? found?.connectionStatus ?? found?.instance?.state
    );
    if (token) return token;
  }

  return '';
}

async function evolutionFetchJson(url: string, apiKey: string) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      apikey: apiKey,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  return { response, payload };
}

export async function setEvolutionWebhook(input: {
  config?: EvolutionConfig | null;
  url: string;
  enabled: boolean;
  webhookByEvents?: boolean;
  webhookBase64?: boolean;
  events?: string[];
}): Promise<EvolutionWebhookUpsertResult> {
  const resolved = input.config ?? getEvolutionConfig();
  if (!resolved) {
    return {
      ok: false,
      status: 409,
      message: 'Evolution API nao configurada no servidor.',
    };
  }

  const response = await fetch(
    `${resolved.baseUrl.replace(/\/$/, '')}/webhook/set/${encodeURIComponent(resolved.instance)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: resolved.apiKey,
      },
      body: JSON.stringify({
        enabled: input.enabled,
        url: input.url,
        webhookByEvents: input.webhookByEvents ?? false,
        webhookBase64: input.webhookBase64 ?? false,
        events:
          input.events ?? ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'MESSAGES_DELETE', 'CONNECTION_UPDATE'],
      }),
      cache: 'no-store',
    }
  );

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: extractEvolutionError(payload as any, response.status),
      payload,
    };
  }

  return {
    ok: true,
    status: response.status,
    message: 'Webhook configurado com sucesso.',
    payload,
  };
}

export async function checkEvolutionConnection(config?: EvolutionConfig | null): Promise<EvolutionConnectionCheckResult> {
  const resolved = config ?? getEvolutionConfig();
  if (!resolved) {
    return {
      ok: false,
      status: 409,
      connected: false,
      message: 'Evolution API nao configurada no servidor.',
    };
  }

  const base = resolved.baseUrl.replace(/\/$/, '');

  // Endpoint principal da Evolution para estado de instancia.
  const first = await evolutionFetchJson(
    `${base}/instance/connectionState/${encodeURIComponent(resolved.instance)}`,
    resolved.apiKey
  );

  if (first.response.ok) {
    const state = extractStateFromPayload(first.payload as any, resolved.instance);
    if (looksConnected(state)) {
      return { ok: true, status: first.response.status, connected: true, state, message: 'Conectado.', payload: first.payload };
    }
    if (looksDisconnected(state)) {
      return { ok: true, status: first.response.status, connected: false, state, message: 'Instancia desconectada.', payload: first.payload };
    }

    return {
      ok: true,
      status: first.response.status,
      connected: false,
      state,
      message: 'Nao foi possivel confirmar o estado da conexao.',
      payload: first.payload,
    };
  }

  // Fallback para painéis/versões que expõem lista de instâncias.
  const second = await evolutionFetchJson(`${base}/instance/fetchInstances`, resolved.apiKey);
  if (second.response.ok) {
    const state = extractStateFromPayload(second.payload as any, resolved.instance);
    if (looksConnected(state)) {
      return { ok: true, status: second.response.status, connected: true, state, message: 'Conectado.', payload: second.payload };
    }
    if (looksDisconnected(state)) {
      return { ok: true, status: second.response.status, connected: false, state, message: 'Instancia desconectada.', payload: second.payload };
    }

    return {
      ok: true,
      status: second.response.status,
      connected: false,
      state,
      message: 'API respondeu, mas sem estado reconhecido da instancia.',
      payload: second.payload,
    };
  }

  return {
    ok: false,
    status: first.response.status,
    connected: false,
    message: extractEvolutionError(first.payload as any, first.response.status),
    payload: first.payload,
  };
}

export async function sendTextWithEvolution(input: EvolutionSendTextInput) {
  const config = input.config ?? getEvolutionConfig();
  if (!config) {
    return {
      ok: false,
      status: 409,
      error: 'Evolution API nao configurada no servidor.',
    } as const;
  }

  const response = await fetch(`${config.baseUrl}/message/sendText/${encodeURIComponent(config.instance)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.apiKey,
    },
    body: JSON.stringify({
      number: input.phone,
      delay: input.delay ?? 0,
      text: input.message,
    }),
    cache: 'no-store',
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: extractEvolutionError(payload as any, response.status),
      payload,
    } as const;
  }

  return {
    ok: true,
    status: response.status,
    payload,
  } as const;
}
