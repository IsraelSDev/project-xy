# ADR 0004: Sala autoritativa, rede e interpolação (Fase 2, parte 2)

- **Status:** aceita
- **Data:** 2026-10-14

## Contexto

Com o `game-core` e o contrato da sala prontos (ADR 0003), falta o multiplayer em si: a sala no
servidor, a conexão no cliente e a exibição dos outros jogadores. A especificação pede servidor
como autoridade, validação dos comandos, interpolação dos remotos, reconexão e uma lista de
jogadores para depuração, deixando previsão local e reconciliação para depois.

## Decisões

### Servidor (`apps/realtime`)

- **Executado com o TypeScript nativo do Node** (`node src/main.ts`, `node --watch` em dev). Saíram
  o `tsc` de build e o `tsx`. O `tsconfig` usa `erasableSyntaxOnly` e `allowImportingTsExtensions`.
- **`LoungeRoom`:**
  - Simulação a 20 Hz (`STATE_PATCH_INTERVAL_MS`) com `stepMovement` e os obstáculos do layout.
    O servidor guarda a posição em `float64` e replica em `float32`.
  - O cliente só envia a direção (`move`). Velocidade, colisão e rotação são do servidor.
  - `maxClients = 16` (meta de teste da especificação). Com a sala lotada, o `joinOrCreate` abre
    outra instância.
  - Versão do protocolo validada em `onAuth`. A recusa chega ao cliente como erro 400 com mensagem.
  - Limites herdados do Colyseus 0.18 (verificados nos testes de integração): payload inválido
    (inclusive campo extra como `position`), tipo de mensagem desconhecido e mais de
    `maxMessagesPerSecond = 30` derrubam a conexão. O cliente envia no máximo 20 por segundo.
  - **Queda** (`onDrop`): a direção zera, o jogador fica `connected = false` e a vaga fica reservada
    por 20 s (`allowReconnection`). Se o cliente volta, `onReconnect` restaura. Se não, `onLeave`
    remove. Saída voluntária remove na hora.
  - As opções da sala vêm do servidor (`defineRoom(LoungeRoom, options)`). Conferi no código do
    Colyseus que elas sobrescrevem as do cliente no `onCreate`, então o cliente não altera o prazo
    de reconexão.
  - Nome de exibição provisório derivado do `sessionId` (`Visitante XXXX`) até existir perfil (Fase 3).

### Cliente (`apps/web`)

- **Sem previsão local**, como a especificação permite nesta fase. O avatar local também é
  exibido a partir do estado do servidor, pelo mesmo caminho dos remotos. Custo: o comando leva
  até um intervalo de patch mais o atraso de interpolação para aparecer na tela, cerca de 150 ms
  em rede local. Previsão e reconciliação ficam para quando houver medição que justifique.
- **Interpolação por snapshots** (`snapshot-buffer.ts`): cada atualização é carimbada com o horário
  de chegada, e os avatares são exibidos `INTERPOLATION_DELAY_MS = 100` ms no passado (dois
  intervalos), interpolando posição e rotação pelo menor arco. Sem extrapolação. Depois de um tempo
  parado, um snapshot repetido evita que o primeiro passo seja espalhado pelo tempo todo.
- **Animação derivada do movimento exibido:** o ciclo de caminhada usa a distância interpolada.
  Por isso não há campo de "animação" no estado. Estados que não saem do movimento (sentar, gestos)
  entram no contrato com as interações (Fase 5).
- **Envio de direção:** só quando muda (diferença acima de 0,01) e no máximo um por intervalo de
  patch. Valores são limitados a `[-1, 1]` antes do envio, porque o servidor derruba a conexão fora
  disso. Ao esconder a aba (`visibilitychange`), a parada é enviada na hora, porque o loop de
  render deixa de rodar.
- **Conexão** (`lounge-connection.ts`):
  - Quedas curtas usam a reconexão automática do SDK e mantêm a mesma sessão.
  - Quando a sessão acaba, ou o primeiro join falha, o cliente tenta de novo com espera de 1, 2, 4,
    8 e 15 s.
  - Para o jogador, só aparecem mensagens próprias: recusa do servidor (4xx) ou "Servidor de tempo
    real indisponível".
- **Painel da sala:** estado da conexão (região `role="status"`) e lista de jogadores, com o local
  primeiro. O jogo publica para o React só quando a lista ou o estado mudam, não a cada quadro.
- **Avatares:** um manequim por jogador, com cor estável derivada do `sessionId`. O local é cinza,
  e quem está desconectado fica translúcido. Ao sair, malhas, material e sombras do avatar são
  liberados (coberto por teste com `NullEngine`).
- **URL do realtime:** `VITE_REALTIME_URL` ou `/realtime` na mesma origem. O proxy do Vite repassa
  HTTP e WebSocket (`ws: true`).

### Ferramentas

- `apps/realtime/scripts/bot.ts`: um jogador de teste que anda em quadrado, para validar a
  replicação sem abrir outro navegador.

## Medições

- Bundle do web: de 303 kB para 376 kB comprimidos (SDK, `@colyseus/schema` e zod). Separar o
  mundo 3D em chunk próprio ou trocar o zod no cliente por validação mais leve continua em aberto.
- Desempenho com vários avatares e consumo de banda ainda não foram medidos. A especificação pede
  essa medição antes de aumentar o limite da sala.

## Pendências

- Medir frequência, tráfego, latência e CPU com 8 a 16 jogadores.
- Previsão local e reconciliação, se a latência percebida incomodar.
- Identidade autenticada no realtime, chat, bloqueio e denúncia (Fase 3).
