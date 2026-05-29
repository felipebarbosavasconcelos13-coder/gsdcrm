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
