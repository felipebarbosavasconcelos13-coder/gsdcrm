# Integracao WhatsApp com Evolution API (v2)

Este projeto agora suporta envio de WhatsApp via Evolution API e ingestao de mensagens recebidas.

## 1) Variaveis de ambiente

Configure no ambiente do Next.js:

- `EVOLUTION_API_URL` ex: `https://sua-evolution.com`
- `EVOLUTION_API_KEY` chave da API Evolution
- `EVOLUTION_INSTANCE` nome da instancia conectada

Para webhook de entrada (mensagens recebidas):

- `EVOLUTION_WEBHOOK_TOKEN` token opcional para proteger o endpoint (`?token=`)
- `EVOLUTION_WEBHOOK_SOURCE_ID` id da fonte inbound no CRM (integration_inbound_sources.id)
- `EVOLUTION_WEBHOOK_SOURCE_SECRET` secret da fonte inbound no CRM

## 2) Endpoint interno de envio

- `POST /api/integrations/whatsapp/evolution/send`
- Body JSON:

```json
{
  "phone": "+5511999999999",
  "message": "Oi! Tudo bem?"
}
```

Esse endpoint exige usuario autenticado.

## 3) Endpoint interno de webhook (entrada)

- `POST /api/webhooks/evolution?sourceId=<SOURCE_ID>&token=<TOKEN_OPCIONAL>`

Se `sourceId` nao for enviado, usa `EVOLUTION_WEBHOOK_SOURCE_ID`.

Ele recebe eventos da Evolution, filtra `messages.upsert`, ignora mensagens enviadas por voce (`fromMe`) e encaminha para a Edge Function:

- `POST {NEXT_PUBLIC_SUPABASE_URL}/functions/v1/webhook-in/<source_id>`

com o header `X-Webhook-Secret`.

## 4) Configurar webhook na Evolution

Use a API da Evolution para apontar o webhook da instancia para o endpoint acima.

Exemplo de URL final no webhook:

- `https://seu-app.com/api/webhooks/evolution?sourceId=...&token=...`

Eventos recomendados:

- `MESSAGES_UPSERT`

## 5) Comportamento no UI

No modal de WhatsApp, o CRM tenta enviar via Evolution API.

- Se configurado: envia direto (sem abrir WhatsApp Web).
- Se nao configurado: fallback automatico para `wa.me`.