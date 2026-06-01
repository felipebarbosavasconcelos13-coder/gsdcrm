# Plano de Implementação - Correção Definitiva de Correlação de Novos Leads do WhatsApp

## Objetivo
Corrigir o bug crítico onde mensagens recebidas de novos leads reais são indevidamente associadas ao número de telefone do próprio usuário/empresa (ou outros números já existentes no histórico) devido a um erro de acumulação na pontuação de recência de mensagens outbound.

---

## Diagnóstico do Bug
No arquivo `app/api/webhooks/evolution/route.ts`, na função `persistInboundMessage`, temos a seguinte condição:
```typescript
if (isLikelyOpaqueWhatsAppId(selectedPhone) || !selectedIsKnown) {
```
Como novos leads são desconhecidos pelo CRM (`selectedIsKnown` é `false`), o webhook sempre entrava nessa condição.
Dentro do bloco de correlação, para cada mensagem outbound no histórico, a pontuação do telefone correspondente era incrementada por um fator de recência (`recencyBoost` de até 120 pontos por mensagem). 
Se o CRM possuísse várias mensagens recentes enviadas para um número (ex: o número do próprio usuário `+5531994775113`), esse número acumulava uma pontuação gigante (ex: >500 pontos), ultrapassando facilmente o limite de 150 pontos exigido para a sobrescrita:
```typescript
if (best?.[0] && best[1] >= 150) {
  selectedPhone = best[0];
}
```
Isso fazia com que **qualquer novo lead real** tivesse seu telefone sobrescrito pelo telefone do usuário! Consequentemente, o CRM atualizava o nome do usuário existente para o nome do lead (ex: "Bia Souza", "Vera"), mas mantinha o número do usuário no contato, e o novo lead nunca era de fato criado.

---

## Solução Proposta
Restringir o bloco de fallback de correlação **exclusivamente** para quando o número for um identificador opaco/LID da Meta (`isLikelyOpaqueWhatsAppId(selectedPhone) === true`).

Se o número recebido for um número de telefone válido e real (ex: `+5531988887777`), o CRM **nunca** deve tentar correlacioná-lo ou alterá-lo. O número do lead deve ser mantido como o original do remetente, garantindo a criação correta de um novo contato e negócio.

### Alteração em `app/api/webhooks/evolution/route.ts`:
```typescript
// Alterar a condição de entrada do bloco de correlação:
if (isLikelyOpaqueWhatsAppId(selectedPhone)) {
```

---

## Plano de Verificação

### Testes Automatizados
- Rodar a suíte completa de testes (`npm run test:run`) para garantir que os testes de regressão não foram afetados.
- Rodar o lint (`npm run lint`) e o typecheck (`npm run typecheck`).
- Rodar o build (`npm run build`).

### Teste Manual
- Simular o recebimento de mensagens de novos números reais de leads e verificar se eles são criados de forma independente e com o telefone correto no CRM.
