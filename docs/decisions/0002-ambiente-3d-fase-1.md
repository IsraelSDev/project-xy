# ADR 0002: Primeiro ambiente 3D jogável (Fase 1)

- **Status:** aceita
- **Data:** 2026-10-14

## Contexto

A Fase 1 pede um lounge navegável com avatar, câmera em terceira pessoa, teclado, colisões básicas e
liberação correta de recursos de GPU. Não há assets 3D licenciados. A orientação foi usar um avatar
genérico.

## Decisões

### Avatar genérico procedural

- **Manequim montado com primitivas** (cápsulas, esferas e caixas) e pivôs nas articulações. Não
  baixa arquivo e não depende de licença de terceiros. Todas as malhas têm o prefixo `placeholder-`.
- **Ciclo de caminhada procedural** (`game/animation/walk-cycle.ts`). A fase avança pela distância
  percorrida, não pelo tempo, para o pé não "patinar". A intensidade é suavizada entre parado e
  andando. Será substituído por animações de esqueleto quando houver um modelo licenciado (Fase 4).

### Simulação separada da renderização

- **Movimento e colisão são funções puras** em `game/movement/`, sem Babylon nem React. A Fase 2
  vai precisar da mesma lógica no servidor; nesse momento o código passa para `packages/game-core`.
  Ainda não foi movido porque só existe um consumidor.
- **Colisão própria em 2D** (círculo contra retângulos alinhados aos eixos, no plano do chão), em vez
  do sistema de colisão do Babylon. É determinística e testável, e o servidor pode usá-la.
- **Passo de simulação de no máximo 1/30 s**, com subdivisão de quadros longos. Isso impede
  atravessar paredes quando o FPS cai. Quadros acima de 0,1 s são truncados, então a simulação fica
  mais lenta em vez de dar saltos (por exemplo, com a aba em segundo plano).
- **O layout do lounge é a fonte única** (`game/world/lounge-layout.ts`): a renderização desenha a
  partir dele e a colisão usa as mesmas caixas.

### Câmera e cenário

- **`ArcRotateCamera`** que acompanha o avatar com suavização exponencial (independente do FPS). O
  jogador orbita arrastando o mouse e dá zoom com a roda. O pan foi desativado, e o teclado da câmera
  também, porque as setas movem o avatar. A frente do movimento é calculada pelo ângulo `alpha` da
  câmera, não pela posição dela, que só é atualizada no render.
- **Paredes visíveis só pelo lado de dentro** ("casa de bonecas"): quando a câmera orbita por fora
  da sala, enxerga através da parede em vez de ver a face externa. A colisão continua usando caixas
  sólidas. Não há colisão de câmera; pilares podem cobrir o avatar.
- **`StandardMaterial` com cores sólidas**, uma luz hemisférica, uma direcional com sombra
  (mapa de 1024, PCF) e duas pontuais. Materiais PBR exigiriam um mapa de ambiente (asset), o que
  fica para quando houver pipeline de assets.

### Ciclo de vida

- **`createGame(canvas, onReady)`** é dona da engine. O `dispose()` para o loop, remove os listeners
  de teclado e o `ResizeObserver` e libera a cena e a engine. O componente React só cria e libera; o
  `StrictMode` monta duas vezes em desenvolvimento, o que exercita esse caminho a cada carga.
- **Imports profundos do Babylon** (`@babylonjs/core/...`, módulos com efeitos colaterais) em vez do
  pacote raiz, para o bundle levar só o que é usado.

## Verificação

- 41 testes no app web: movimento, colisão, teclado, ciclo de caminhada, consistência do layout e
  montagem, simulação e `dispose` do mundo com `NullEngine` (Babylon sem GPU).
- No navegador, com WebGL 2 real: a cena renderiza sem erros no console, o avatar anda 1,2 m em
  0,6 s (2 m/s), para no balcão do bar exatamente no raio do corpo, gira na direção do movimento e o
  canvas reflui ao redimensionar.

## Pendências e limitações

- **Bundle:** chunk principal de 1,2 MB (300 KB com gzip). Avaliar code splitting da cena quando
  houver telas antes do mundo (login, seleção de personagem).
- **Teste E2E com Playwright** (abrir a cena e checar o console) depende de baixar o navegador do
  Playwright (cerca de 150 MB).
- **FPS-alvo** ainda não definido; depende dos dispositivos-alvo.
- **Colisão de câmera** e oclusão (pilares entre câmera e avatar).
