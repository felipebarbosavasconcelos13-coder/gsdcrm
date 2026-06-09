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

## 2026-06-09

- Realizada análise técnica profunda da base de código do GenialCRM.
- Criado o arquivo de documentação técnica centralizado `DOCUMENTACAO.md` contendo a visão geral do sistema, estrutura física de pastas, proteção de rotas (Proxy), fluxo do assistente inteligente (Vercel AI SDK v6), integrações de mídia no WhatsApp (Evolution API v2), e políticas de segurança RLS (multi-tenant) e triggers automatizados.
- Atualizado o plano de implementação e rastreamento de tarefas do projeto.
- Validado o status de execução de testes automatizados com sucesso (106 testes aprovados, zero falhas).
- Validada a integridade e saúde das credenciais de teste fornecidas no arquivo `GEMINI.md` para a Vercel e o Supabase via chamadas de API oficiais, confirmando acesso total e validade de ambos os tokens.
- Corrigido o webhook de mensagens do WhatsApp (Evolution API v2) para suportar a busca de contatos com ou sem o nono dígito do Brasil (12 e 13 dígitos), adicionando a função `getBrPhoneVariations` e alterando a busca de contatos para utilizar o operador `in`.
- Implementada a criação resiliente e automática de novos contatos (`contacts`) e negócios (`deals`) no primeiro board/estágio da organização quando o remetente for desconhecido, tornando o salvamento de leads independente de webhooks externos adicionais.
- Criada a suite de testes unitários para a validação do nono dígito em `test/evolutionWebhook.test.ts`.
- Validada a estabilidade com `npm run lint` (sucesso), `npm run typecheck` (sucesso), `npm run test:run` (110 testes aprovados) e `npm run build` (build compilado com sucesso).
- Processadas e otimizadas as novas logos fornecidas (`Logo_para_fundo_claro.png` e `Logo_para_fundo_escuro.png`). Criado o script Python `scratch/remove_background.py` que remove fundos externos sólidos por flood-fill a partir dos cantos, recorta margens vazias sobressalentes e exporta em formato WebP de alta performance (`public/logo_light.webp` e `public/logo_dark.webp`).
- Integradas as novas logos WebP na sidebar do menu principal (`components/Layout.tsx`) e no rail de navegação (`components/navigation/NavigationRail.tsx`), substituindo o marcador genérico "N" por imagens que reagem de forma dinâmica e reativa ao tema do sistema (Claro/Escuro).
- Executada validação de estabilidade completa pós-logos: linter (0 warnings), typecheck (sucesso), suite de testes (110 passados) e build de produção (compilado com sucesso).
- Realizado o push das alterações locais e commits consolidados para o repositório remoto do GitHub (branch 'main') com sucesso.

## 2026-06-09 - Painel de Logs e Correções do Webhook

- Criado arquivo de migration `20260609183000_nullable_webhook_source_id.sql` para tornar a coluna `source_id` nullable na tabela `webhook_events_in`, permitindo que eventos do webhook Evolution sem uma fonte inbound configurada sejam logados.
- Migration aplicada com sucesso no banco de produção via Supabase Management API.
- Corrigida a função `logWebhookEvent` para:
  - Funcionar sem `source_id` (antes retornava silenciosamente, ignorando todos os eventos).
  - Aceitar campos opcionais `createdContactId` e `createdDealId` para rastreamento de criação de leads.
  - Utilizar `upsert` com `onConflict` quando `source_id` está disponível, e `insert` simples quando ausente.
- Refatorado `persistInboundMessage` para logar todos os resultados de criação de contato/deal via `logWebhookEvent`:
  - Erro ao criar contato → `status: 'error'` com detalhes do erro.
  - Erro ao criar deal → `status: 'error'` com IDs do contato criado.
  - Nenhum board ativo → `status: 'error'` com alerta.
  - Sucesso (contato + deal) → `status: 'processed'` com `createdContactId` e `createdDealId`.
- Corrigido o fluxo de criação de leads: diagnosticado que o `logWebhookEvent` não registrava eventos por falta de `source_id`, e que erros de criação de contato eram apenas enviados ao `console.error` (invisíveis no painel). Agora todos os erros são visíveis no painel de logs.
- Criado o painel `WebhookLogPanel.tsx` em `features/settings/components/` com:
  - Cards de resumo (processados, ignorados, mensagens inbound).
  - Timeline de eventos com status, telefone, nome do contato, preview da mensagem e payload expansível.
  - Seção de mensagens recebidas (inbound) da tabela `whatsapp_messages`.
  - Auto-refresh a cada 10 segundos com toggle.
- Adicionada aba principal "Logs de Webhook" em Configurações (`features/settings/SettingsPage.tsx`), acessível via `/settings/logs`.
- Refatoração completa do webhook Evolution (`app/api/webhooks/evolution/route.ts`):
  - Extraídos 1118 linhas monolíticas para 3 módulos especializados:
    - `lib/integrations/evolution/webhook-helpers.ts` (371 linhas): parsing de mensagens WhatsApp, tipos de mídia, extração de telefone, candidatos de identificação, variações de nono dígito e seleção do melhor telefone.
    - `lib/integrations/evolution/webhook-persistence.ts` (308 linhas): `logWebhookEvent`, `resolveOrganizationId` e `persistInboundMessage` com toda a lógica de criação de contatos/deals e log de erros.
    - `app/api/webhooks/evolution/route.ts` (181 linhas): apenas o handler `POST` com validação, resolução de fonte inbound, orquestração e forward para webhook-in.
  - Atualizado o import no teste `evolutionWebhook.test.ts` para apontar para o novo módulo `webhook-helpers.ts`.
- Validado o fluxo completo de criação de leads com sucesso: contato "Relógios Benyar" (`+553182668783`) criado automaticamente como LEAD com deal no board "1. Captação / Leads", estágio "Novos Leads", confirmado via banco de dados e painel de logs.
- Validada a estabilidade com `npm run lint` (zero warnings), `npm run typecheck` (sucesso), testes (todos aprovados) e `npm run build` (compilado com sucesso).




