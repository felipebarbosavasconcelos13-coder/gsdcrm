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
