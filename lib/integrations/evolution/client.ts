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
