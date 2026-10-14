# ADR 0003: Pacotes compartilhados e contrato da sala (Fase 2, parte 1)

- **Status:** aceita
- **Data:** 2026-10-14

## Contexto

Na Fase 2 o servidor realtime passa a ser a autoridade sobre o movimento. Ele precisa executar a
mesma simulação que o cliente (movimento, colisão, layout do lounge), e cliente e servidor precisam
concordar sobre o estado da sala e as mensagens. Até a Fase 1, a simulação vivia em `apps/web` e
`packages/contracts` exportava só tipos.

## Decisões

### `packages/game-core`

- Movimento, colisão, geometria e layout do lounge saíram de `apps/web/src/game` para
  `@3dx/game-core`, sem dependência de Babylon ou React. É o primeiro código de runtime usado por
  cliente e servidor, que é a necessidade que a ADR 0001 pedia antes de criar o pacote.
- **`stepMovement` recebe a direção no mundo**, não a intenção relativa à câmera. A função
  normaliza a direção, então quem envia escolhe só para onde andar, nunca a velocidade. A conversão
  câmera → mundo (`worldDirection`) é entrada do cliente e ficou em `apps/web/src/game/movement`.
- **Pontos de entrada:** `SPAWN_POINTS` (spawn e um anel de 8 pontos) e `pickSpawn`, que escolhe o
  primeiro ponto a pelo menos 0,9 m dos jogadores presentes.

### Pacotes só com código-fonte, importados com extensão `.ts`

- `game-core` e `contracts` exportam `./src/index.ts` direto, sem etapa de build. Os imports
  relativos usam extensão `.ts` e `erasableSyntaxOnly`, para o Node 24 executar o código com o
  TypeScript nativo (testado no 24.21, sem aviso experimental). O Vite e o Vitest já entendem
  esse formato.
- Consumidores que emitem JS (API com `nest build`, realtime com `tsc`) usam
  `rewriteRelativeImportExtensions`, e o web usa `allowImportingTsExtensions`.
- Isso resolve a pendência da ADR 0001 sobre build de `contracts` para código de runtime.

### Contrato da sala (`packages/contracts/src/lounge.ts`)

- **Estado:** `LoungeState` com `players: MapSchema<PlayerState>`, indexado pelo `sessionId`.
  `PlayerState` tem nome de exibição, `x`, `z`, `heading` e `connected`. Nada privado: todos na sala
  recebem esses campos. Definido com `schema()` do `@colyseus/schema` 5, sem decorators, para ser
  compartilhado entre o servidor (codifica) e o cliente (decodifica).
- **Mensagens validadas em runtime com zod 4**, que implementa o Standard Schema aceito pelo
  `validate()` do Colyseus 0.18:
  - `MoveMessage`: direção `{ x, z }` com cada eixo em `[-1, 1]` e objeto estrito. Campo extra
    (por exemplo, uma posição) é rejeitado.
  - `LoungeJoinOptions`: exige `protocol === PROTOCOL_VERSION`. Mudança incompatível no contrato
    sobe a versão e o servidor recusa clientes antigos.
- **Ritmo:** `STATE_PATCH_INTERVAL_MS = 50` (20 atualizações por segundo), dentro da faixa de 10 a
  20 da especificação. O servidor usa como intervalo de simulação e de envio de estado, e o cliente
  vai usar para o atraso de interpolação.
- **Comportamento já garantido pelo Colyseus 0.18 (verificado no código-fonte):** payload que falha
  na validação e tipo de mensagem não registrado derrubam a conexão do cliente, e passar de
  `maxMessagesPerSecond` também.

### Custo no bundle do cliente

- zod e `@colyseus/schema` entram no bundle do web quando o cliente usar o contrato (parte 2). O
  `@colyseus/schema` já viria com o SDK do cliente; o zod é o custo extra. Medir no build da parte 2.

## Pendências (parte 2 da Fase 2)

- `LoungeRoom` no realtime: simulação a 20 Hz com `stepMovement`, limite de jogadores, reconexão com
  prazo (`allowReconnection`) e remoção de quem não volta.
- Realtime passando a rodar com TypeScript nativo (`node src/main.ts`), sem `tsc` nem `tsx`.
- Cliente: conexão com reconexão, interpolação dos avatares remotos, lista de jogadores para
  depuração e URL do realtime configurável (`VITE_REALTIME_URL`).
- Hospedagem do realtime: precisa de processo persistente com WebSocket. Não roda em Vercel
  Functions, que encerram conexões pela duração máxima e não compartilham memória entre instâncias.
