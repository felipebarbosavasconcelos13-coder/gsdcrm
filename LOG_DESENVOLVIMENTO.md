# LOG_DESENVOLVIMENTO.md

## 2026-05-29

- Inicio das correcoes solicitadas apos analise profunda do aplicativo.
- Escopo assumido: corrigir lint/scratch, reduzir exposicao de segredos, remover instrumentacao local hardcoded, consolidar cache de deals e fortalecer RLS multi-tenant.
- Validacoes de referencia antes das mudancas: `npm run typecheck` passou, `npm run build` passou, `npm run test:run` passou fora do sandbox com 101 testes aprovados e 5 pulados, `npm run lint` falhou por `scratch/check.js`.
- Corrigido escopo do ESLint para ignorar `scratch/**`, alinhando com `.gitignore` e evitando erro de parsing em artefato binario local.
- APIs de configuracao deixaram de retornar chaves brutas: `/api/settings/ai` agora retorna apenas flags `aiHas*Key`; WhatsApp Evolution retorna `hasApiKey` e preserva a chave existente quando o campo fica vazio em edicao.
- Removidos blocos de instrumentacao local `#region agent log` e chamadas hardcoded para `http://127.0.0.1:7242` em contexts, hooks, realtime, layout protegido e registro de service worker.
- Cache de deals consolidado em `DEALS_VIEW_KEY` para `useDeals`, `useDealsView` e `useDealsByBoard`; filtros agora usam `select`/derivacao local em vez de criar caches filtrados separados.
- Adicionada migration `20260529170000_tighten_core_rls.sql` com helpers `current_user_organization_id`, `is_org_member`, `is_org_admin` e policies multi-tenant para tabelas centrais, notas/arquivos de deals e tabelas de IA sem `organization_id`.
- Validacoes finais executadas com sucesso: `npm run lint`, `npm run typecheck`, `npm run test:run` (101 testes aprovados, 5 pulados) e `npm run build`.
- Ajustado estado local de configuracao de IA para atualizar `aiHas*Key` imediatamente ao salvar ou remover uma chave, sem depender de reload.
- Validacoes repetidas apos ajuste de estado de IA: `npm run lint`, `npm run typecheck`, `npm run test:run` (101 testes aprovados, 5 pulados) e `npm run build` passaram novamente.

## 2026-05-29 - WhatsApp multimidia

- Iniciado escopo para completar o chat WhatsApp com envio/recebimento de texto, audio, imagem, video e documento.
- Mapeamento inicial: envio atual usa apenas `sendTextWithEvolution`; webhook persiste apenas texto/caption em `whatsapp_messages.message`; painel `WhatsAppChatPanel` renderiza somente bolhas de texto.
- Referencia tecnica verificada: Evolution API v2 possui `/message/sendMedia/{instance}` para imagem/video/documento e `/message/sendWhatsAppAudio/{instance}` para audio.
- Adicionada migration `20260529173000_whatsapp_message_media.sql` com colunas multimidia em `whatsapp_messages` e incluida no `ensureWhatsAppSchema`.
- Webhook Evolution passou a detectar `text`, `image`, `video`, `audio`, `document`, `sticker`, `contact`, `location` e persistir caption, mime type, arquivo, dimensoes/duracao, URL e base64 quando disponiveis.
- Configuracao do webhook Evolution agora solicita `webhookBase64: true` para permitir recebimento/renderizacao de midia quando a instancia suportar.
- Cliente Evolution ganhou `sendMediaWithEvolution` para imagem/video/documento e `sendAudioWithEvolution` para audio via endpoints oficiais.
- Rotas `/api/integrations/whatsapp/evolution/messages` e `/send` agora aceitam `messageType`, `media`, `mimeType`, `fileName` e gravam historico multimidia.
- Auto-provisionamento do schema WhatsApp passou a reaplicar migrations quando `whatsapp_messages` existe sem as novas colunas de midia.
- `WhatsAppChatPanel` ganhou anexo de arquivo, preview removivel, envio com legenda opcional e renderizacao de imagem, sticker, video, audio e documentos no historico.
- Fallback de busca de mensagens por metadata agora preserva tambem os campos multimidia recuperados.
- Renderizacao de imagem/sticker no chat ajustada para `next/image` sem otimizacao remota, evitando warning de lint com data URLs.
- Validacoes apos WhatsApp multimidia: `npm run lint`, `npm run typecheck`, `npm run test:run` (101 testes aprovados, 5 pulados) e `npm run build` passaram.
- Corrigido instalador: `runSchemaMigration` agora aplica todos os arquivos `supabase/migrations/*.sql` em ordem, garantindo que novas instalacoes recebam tambem indices, RLS, tabelas WhatsApp e colunas multimidia.
- Validacoes apos ajuste do instalador: `npm run lint`, `npm run typecheck` e `npm run test:run` (101 testes aprovados, 5 pulados) passaram.

## 2026-06-01 - Correcao de criacao de leads

- Investigado relato de lead criado que nao apareceu no CRM.
- Confirmado que o Supabase MCP da sessao estava apontando para outro projeto (`lnrwvkq...`), enquanto o deploy Vercel `gsdcrm` usa `wibiwaxgkpsvdoacxtqm.supabase.co`.
- Consultado banco correto via `SUPABASE_DB_URL` da Vercel: `contacts` e `deals` estavam vazios e nao havia eventos em `webhook_events_in`.
- Diagnostico: criacao manual de lead/contato dependia de trigger inexistente para preencher `organization_id`; com RLS multi-tenant ativo, inserts sem `organization_id` sao bloqueados.
- Corrigido `contactsService.create` e `companiesService.create` para resolver a organizacao do usuario autenticado via `profiles` e enviar `organization_id` no insert.
- Validacoes apos correcao: `npm run lint`, `npm run typecheck`, `npm run test:run` (106 testes aprovados) e `npm run build` passaram.
- Adicionada migration `20260601162000_default_org_on_lead_inserts.sql` para o instalador criar trigger defensivo que preenche `organization_id` em `contacts`, `crm_companies` e `leads`.
- Validacoes apos migration defensiva do instalador: `npm run lint`, `npm run typecheck`, `npm run test:run` (106 testes aprovados) e `npm run build` passaram.

## 2026-06-01 - Audio WhatsApp

- Investigado audio recebido sem reproducao no chat: registros recentes em `whatsapp_messages` tinham `message_type=audio`, `mime_type=audio/ogg; codecs=opus`, `media_seconds=3`, mas `media_base64` vazio e `media_url` apontando para arquivo `.enc` da CDN do WhatsApp.
- Cliente Evolution ganhou `getMediaBase64FromEvolution` usando `/chat/getBase64FromMediaMessage/{instance}` para baixar midias em base64 quando o webhook nao entrega `webhookBase64`.
- Rota `/api/integrations/whatsapp/evolution/messages` agora hidrata midias sem base64 ao carregar o historico, salva o base64 retornado e remove `metadata` antes de responder ao frontend.
- `WhatsAppChatPanel` ganhou gravacao de audio via `MediaRecorder`, timer, botao de parar, preview tocavel e envio do audio gravado pelo fluxo multimidia existente.
- Ajustado tipo do timer de gravacao para o retorno numerico de `window.setInterval` no browser.
- Teste real contra Evolution/Supabase confirmou que `/chat/getBase64FromMediaMessage/{instance}` retorna base64 para audio recente (`audio/ogg; codecs=opus`).
- Validacoes apos correcao de audio: `npm run lint`, `npm run typecheck`, `npm run test:run` (106 testes aprovados) e `npm run build` passaram.

## 2026-06-01 - Envio/recepcao de midia WhatsApp

- Investigado erro `Owned media must be a url, base64, or valid file with buffer (status 400)` ao enviar audio/arquivo: o frontend envia `media` como data URL (`data:audio/ogg;base64,...`), mas a Evolution API aceita apenas URL http(s) ou base64 "cru".
- Adicionado helper `toEvolutionMedia` em `lib/integrations/evolution/client.ts` que remove o prefixo `data:<mime>;base64,` antes de enviar; aplicado em `sendMediaWithEvolution` (campo `media`) e `sendAudioWithEvolution` (campo `audio`).
- Corrigida reproducao de midia recebida: `getMediaSrc` no `WhatsAppChatPanel` priorizava `media_url`, que para mensagens recebidas e uma URL `.enc` criptografada da CDN do WhatsApp e nao toca no navegador. Agora prefere `media_base64` e so usa `media_url` quando for http(s) e nao terminar em `.enc`.
- Validacoes apos correcao: `npm run lint`, `npm run typecheck` e `npm run test:run` (106 testes aprovados) passaram.
- Verificada cobertura para novas instalacoes (sem necessidade de codigo novo no instalador):
  - Correcoes de envio/recepcao sao codigo de runtime (`lib/integrations/evolution/client.ts` e `WhatsAppChatPanel.tsx`), distribuidas automaticamente no deploy.
  - Schema de midia ja aplicado pelo instalador: `runSchemaMigration` aplica todos os `supabase/migrations/*.sql` (inclui `20260529173000_whatsapp_message_media.sql`); `ensureWhatsAppSchema` tambem inclui o arquivo de midia como fallback runtime.
  - Recepcao de midia toca por padrao: ao salvar/alternar uma conexao Evolution (`config` POST/PATCH), `syncEvolutionWebhook` registra o webhook com `webhookBase64: true`, fazendo a midia recebida chegar em base64.
- Validacao final completa apos as correcoes de midia: `npm run lint`, `npm run typecheck`, `npm run test:run` (106 testes aprovados) e `npm run build` passaram.

## 2026-06-01 - Correcao de leads do WhatsApp

- Investigado relato de que mensagens recebidas via WhatsApp de novos leads não cadastrados não apareciam no CRM.
- Diagnostico:
  1. A rota de webhook `/api/webhooks/evolution` não encaminhava mensagens para a Edge Function `webhook-in` caso as variáveis de ambiente `EVOLUTION_WEBHOOK_SOURCE_ID` e `EVOLUTION_WEBHOOK_SOURCE_SECRET` não estivessem estaticamente configuradas no Next.js (comportamento padrão local).
  2. No helper `persistInboundMessage`, quando o telefone era desconhecido (`!selectedIsKnown`), a heurística de correlação frouxa sobrescrevia o telefone do lead válido pelo único telefone de mensagens outbound recentes (`veryRecentOut`), mesclando a conversa indevidamente e impedindo a criação do novo lead.
- Corrigida rota `POST` do webhook da Evolution (`app/api/webhooks/evolution/route.ts`):
  - Adicionada resolução dinâmica da fonte inbound (`integration_inbound_sources`) no banco de dados com base na organização ativa conectada, caso os segredos da fonte não estejam definidos no ambiente do Next.js.
  - Ajustada a heurística de fallback no `persistInboundMessage` para que ela seja acionada **apenas** quando o telefone recebido é um ID opaco/LID da Meta (`isLikelyOpaqueWhatsAppId`). Telefones reais e válidos agora mantêm seu número original, permitindo a ingestão correta como novo lead.
- Validacoes de estabilidade executadas e aprovadas com sucesso: `npm run lint` (zero warnings), `npm run typecheck` (sucesso), `npm run test:run` (106 testes aprovados) e `npm run build` (sucesso completo do bundle Next.js).

