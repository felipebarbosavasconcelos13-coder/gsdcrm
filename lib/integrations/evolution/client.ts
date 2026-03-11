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
      error: 'Falha ao enviar mensagem via Evolution API.',
      payload,
    } as const;
  }

  return {
    ok: true,
    status: response.status,
    payload,
  } as const;
}