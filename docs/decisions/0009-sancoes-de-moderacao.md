# ADR 0009: Sanções de moderação

- **Status:** aceita
- **Data:** 2026-10-14

## Contexto

A especificação (seção 8) pede "bloqueio, denúncia, silenciamento e sanções". Até a Fase 6 a
moderação só resolvia ou descartava denúncias; quem era denunciado não sofria consequência. O
realtime não acessa o banco (ADR 0005): tudo o que ele sabe de uma pessoa vem do ticket assinado
pela API.

## Decisões

### Modelo

- Duas sanções: **silenciar** (sem chat, sempre com prazo) e **suspender** (sem login, sem API e sem
  salas; com prazo ou permanente). Prazo máximo de um ano.
- Tabela `Sanction`, ligada à denúncia que a motivou, a quem aplicou e a quem recebeu. Em vigor:
  sem `revokedAt` e com `endsAt` nulo ou futuro. Como as denúncias (`onDelete: Restrict`), o
  histórico não some com a conta. A exclusão de conta (pendente) vai **anonimizar** a pessoa e
  manter denúncias e sanções.
- A sanção é aplicada **ao resolver uma denúncia**, na mesma transação da revisão (`POST
/admin/reports/:id/review` com `sanction`). Não há sanção sem denúncia: toda sanção tem motivo
  registrado.
- `GET /admin/sanctions` lista as que estão em vigor; `POST /admin/sanctions/:id/revoke` encerra
  antes do prazo.
- **Auditoria:** `ModerationAction` ganhou `sanctionId`. Ações `sanction.mute`, `sanction.suspend` e
  `sanction.revoke`, além do `report.resolved` de sempre.
- A equipe (MODERATOR, ADMIN) **não** sanciona a equipe nem a si mesma; papéis só mudam pela linha de
  comando. A recusa desfaz a revisão inteira (a denúncia continua aberta).

### Como a sanção chega a cada lugar

- **API:** suspensão apaga as sessões da pessoa. `SessionService.resolve` também confere a
  suspensão a cada requisição, o que cobre um login concorrente com a suspensão. O login recusa com
  403 e o prazo, **depois** de conferir a senha (quem não é dono da conta não descobre a suspensão).
- **Ticket:** ganhou `mutedUntil` (epoch ms ou `null`). O realtime recusa o chat de quem está
  silenciado e informa até quando.
- **Quem já está numa sala:** o cliente renova o ticket a cada 20 s
  (`TICKET_REFRESH_INTERVAL_MS`). O realtime tira da sala quem deixa o ticket vencer, com 30 s de
  folga. Assim:
  - silenciamento passa a valer em até ~20 s;
  - suspensão: o cliente honesto recebe 401 na renovação e volta para a tela de login (em até
    ~20 s); um cliente modificado que pare de renovar sai em até 90 s (60 s de ticket mais 30 s de
    folga).
- A saída por ticket vencido usa `CloseCode.CONSENTED`. Com outro código o Colyseus trata como
  queda e reserva a vaga para reconexão, e a reconexão **não** passa pelo ticket.
- `PROTOCOL_VERSION = 5`: clientes antigos não renovam o ticket e seriam tirados da sala depois de
  90 s.

### Alternativa descartada

Canal direto da API para o realtime (rota interna "expulsar usuário", com segredo compartilhado).
Daria efeito imediato, mas cria um segredo e uma superfície nova, e só funciona com um processo de
realtime. O lease de ticket reusa o que já existia e vale também para sessão expirada ou logout em
outra aba. Se 90 s for pouco para algum caso (ex.: ameaça em andamento), o canal direto entra
depois.

## Consequências

- Cada pessoa conectada pede 3 tickets por minuto. O limite da rota é 30 por minuto **por IP**, e o
  limite global é 120 por minuto por IP. Hoje são no máximo 10 pessoas atrás do mesmo IP (NAT,
  rede corporativa). Antes de abrir ao público, o rate limit das rotas autenticadas precisa contar
  **por usuário**, não por IP. _Resolvido na [ADR 0011](0011-rate-limit-compartilhado.md)._
- O bot de teste (`scripts/bot.ts`) renova os tickets das suas sessões respeitando esse limite.
- A aba em segundo plano pode ter timers limitados pelo navegador. A folga de 30 s cobre um timer
  por minuto; abaixo disso a pessoa sai da sala e volta ao reabrir a aba.

## Pendências

- ~~Rate limit por usuário nas rotas autenticadas.~~ Feito (ADR 0011).
- ~~Sanções sem denúncia (ex.: flagrante visto pela própria moderação) e silenciar ou suspender
  diretamente da lista de jogadores.~~ Feito em 2026-10-15: botão **Moderar** na lista de jogadores
  (só moderação), `POST /admin/sanctions` com motivo obrigatório (3 a 500 caracteres) registrado na
  sanção e na auditoria; `Sanction.reportId` passou a aceitar nulo (migração `sancao_direta`). As
  mesmas regras da sanção por denúncia valem (equipe não sanciona equipe; conta excluída não
  existe), numa função única (`applySanction`).
- Avisar quem recebeu a sanção (motivo e prazo) dentro do produto, e um canal de contestação.
- Expulsar na hora, se 90 s se mostrarem insuficientes.
