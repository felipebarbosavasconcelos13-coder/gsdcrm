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
