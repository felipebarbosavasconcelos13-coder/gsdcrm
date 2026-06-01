# Plano de Implementação - Correção de Ingestão de Mensagens do WhatsApp de Novos Leads

## Objetivo
Corrigir o problema no CRM onde mensagens recebidas via WhatsApp de novos leads (números não cadastrados e sem histórico de saída) não aparecem no sistema.

---

## Análise do Problema
O fluxo de recebimento de mensagens do WhatsApp ocorre no webhook da Evolution API localizado em `app/api/webhooks/evolution/route.ts`. Ao receber uma mensagem, o webhook realiza dois passos principais:
1. **Persistência da mensagem** (`persistInboundMessage`): Salva a mensagem no histórico (`whatsapp_messages`).
2. **Encaminhamento para o lead ingester** (`webhook-in`): Faz uma chamada HTTP POST para a Supabase Edge Function `webhook-in`, que é responsável por criar o contato em `contacts` e o negócio em `deals` (exibindo-o no Kanban).

### Bugs Identificados:
1. **Falta de Resolução Dinâmica da Fonte Inbound**: Se as variáveis de ambiente `EVOLUTION_WEBHOOK_SOURCE_ID` e `EVOLUTION_WEBHOOK_SOURCE_SECRET` não estiverem configuradas no Next.js (o que ocorre frequentemente), o webhook desiste de encaminhar para a função `webhook-in`.
   - *Solução*: Se as variáveis estiverem ausentes, buscaremos uma fonte ativa diretamente no banco de dados (`integration_inbound_sources`) usando o `organization_id` resolvido.
2. **Sobrescrita Indevida de Números de Novos Leads**: No bloco de correlação de `persistInboundMessage`, se o número é desconhecido (`!selectedIsKnown`), o código tenta associá-lo a mensagens de saída recentes. Se houver apenas uma conversa recente ativa de saída nos últimos 20 registros, o número do novo lead é **sobrescrito** pelo número desse outro cliente.
   - *Solução*: Restringir a sobrescrita "frouxa" (baseada no último histórico de saída) apenas para quando o identificador recebido for de fato um ID opaco/LID da Meta (`isLikelyOpaqueWhatsAppId(selectedPhone) === true`). Se for um número de telefone válido, mantemos o número original do lead para que um novo contato seja criado.

---

## Proposta de Alterações

### `app/api/webhooks/evolution/route.ts`

- **Ajuste na Correlação de Telefone (`persistInboundMessage`)**:
  - Alterar o bloco de fallback para que a pesquisa de `veryRecentOut` seja executada **apenas** se `isLikelyOpaqueWhatsAppId(selectedPhone)` for verdadeiro.
  
- **Resolução Automática da Fonte Inbound (`POST`)**:
  - Obter o `organizationId` na rota `POST` utilizando `resolveOrganizationId` com o `instanceName` e `connectionId`.
  - Se `sourceId` ou `sourceSecret` estiverem ausentes nas variáveis de ambiente ou parâmetros da URL, fazer uma consulta em `integration_inbound_sources` por uma fonte ativa da organização (`active = true`) e usar seus dados.

---

## Plano de Verificação

### Testes Manuais
1. Validar que o comportamento do webhook continua ignorando mensagens enviadas por si mesmo (`fromMe`).
2. Simular o recebimento de uma mensagem de um novo número de telefone válido:
   - Garantir que o número do lead **não** seja sobrescrito pelo histórico de outras conversas.
   - Verificar que a fonte de entrada inbound é resolvida a partir do banco de dados.
   - Confirmar o encaminhamento correto para `webhook-in`.
3. Rodar testes de verificação do codebase:
   - `npm run lint`
   - `npm run typecheck`
