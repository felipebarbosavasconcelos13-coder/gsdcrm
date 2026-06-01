# PLANO_DE_IMPLEMENTACAO.md

## Objetivo

Aplicar as correcoes identificadas na analise profunda do GenialCRM mantendo rastreabilidade de cada bloco de mudanca.

## Checklist

- [x] Corrigir falha de lint causada por artefatos em `scratch/`.
- [x] Evitar retorno de chaves brutas de IA e WhatsApp nas APIs de configuracao.
- [x] Remover chamadas de debug para `127.0.0.1:7242`.
- [x] Consolidar operacoes de deals no cache canonico `DEALS_VIEW_KEY`.
- [x] Adicionar migration corretiva para policies RLS filtradas por `organization_id`.
- [x] Rodar `npm run lint`, `npm run typecheck`, `npm run test:run` e `npm run build`.

## Notas Tecnicas

- Preferir mudancas pequenas e verificaveis.
- Para RLS, adicionar uma migration nova em vez de editar somente o schema historico.
- Para secrets, retornar apenas indicadores `hasKey` e permitir escrita/substituicao via payload.

## Extensao WhatsApp Multimidia

- [x] Estender `whatsapp_messages` para armazenar tipo de mensagem, mime type, nome de arquivo, URL/base64 de mídia e legenda.
- [x] Extrair metadados de imagem, video, audio, documento, sticker e contato no webhook Evolution.
- [x] Adicionar envio de midia via Evolution API (`sendMedia` e audio) mantendo envio de texto.
- [x] Atualizar `/api/integrations/whatsapp/evolution/messages` para aceitar e retornar mensagens multimidia.
- [x] Atualizar `WhatsAppChatPanel` com upload/anexo, preview e renderizacao de audio, imagem, video e documento.
- [x] Validar com lint, typecheck, testes e build.
- [x] Ajustar instalador para aplicar todas as migrations, incluindo WhatsApp multimidia, em novas instalacoes.

## Correcao Criacao de Leads

- [x] Verificar banco Supabase usado pelo deploy `gsdcrm`.
- [x] Confirmar que o Supabase MCP da sessao apontava para outro projeto, nao para o CRM.
- [x] Diagnosticar bloqueio de criacao: `contacts` exige `organization_id` por RLS e o insert manual nao enviava esse campo.
- [x] Ajustar criacao de contatos/leads e empresas para enviar `organization_id` do usuario autenticado.
- [x] Validar lint, typecheck, testes e build.
- [x] Adicionar migration do instalador para preencher `organization_id` automaticamente em inserts de contatos, empresas e leads.

## Correcao Audio WhatsApp

- [x] Diagnosticar audio recebido com player `0:00`: historico tinha apenas URL `.enc` criptografada da CDN do WhatsApp, sem base64 tocavel.
- [x] Adicionar busca de base64 via Evolution API quando uma midia do historico estiver sem `media_base64`.
- [x] Adicionar botao de gravacao de audio no chat com preview e envio como mensagem de audio.
- [x] Validar lint, typecheck, testes e build.
