# Desempenho por cenário (Fase 9)

Medição do custo de cena com **1 e 10 avatares** em cada cenário jogável, e do FPS do cliente.
O objetivo é o critério da Fase 9: _desempenho medido com múltiplos avatares em cada cenário_.

## Como medir

Pré-requisitos: banco no ar (`pnpm db:up`) e a pilha local rodando (`pnpm dev`).

```powershell
cd apps/web
node scripts/measure-scenes.mjs --bots 10 --scenes club,home,beach,studio
```

O script (Playwright + Chromium):

1. cria uma conta de teste e entra na balada;
2. para cada cenário, cria uma sala pública, espera a cena carregar e lê o HUD de desenvolvimento
   (`p.stats`: fps, malhas, triângulos, ossos, malhas de avatar) por ~6 s;
3. abre **10 bots** (`apps/realtime/scripts/bot.ts`) naquela sala, espera os avatares carregarem e
   lê o HUD de novo;
4. grava medianas e extremos em `perf-scenes.json`.

O HUD só existe em desenvolvimento (`stats` no `RoomPanel`) e é atualizado uma vez por segundo. Os
triângulos são `scene.getActiveIndices() / 3` e os ossos são `scene.getActiveBones()` — custo de
geometria e de skinning, **independente da GPU**.

## Resultado (2026-10-30)

| Cenário | Avatares | FPS | Malhas ativas | Triângulos | Ossos | Malhas de avatar |
| ------- | -------- | --- | ------------- | ---------- | ----- | ---------------- |
| balada  | 1        | 1   | 68            | 126 039    | 323   | 8                |
| balada  | 10       | 2   | 146           | 647 579    | 3 553 | 68               |
| quarto  | 1        | 1   | 88            | 355 511    | 323   | 8                |
| quarto  | 10       | 2   | 168           | 702 411    | 3 553 | 68               |
| praia   | 1        | 1   | 19            | 58 221     | 323   | 8                |
| praia   | 10       | 4   | 93            | 405 121    | 3 553 | 68               |
| estúdio | 1        | 3   | 31            | 47 142     | 323   | 8                |
| estúdio | 10       | 3   | 107           | 394 042    | 3 553 | 68               |

### Leitura

- **Cada avatar custa ~52 mil triângulos e ~323 ossos** (corpo + cabeça + cílios + cabelo/roupa do
  bot). Dez avatares somam **3 553 ossos** — o skinning é o que mais cresce com a sala cheia.
- **O quarto é o cenário mais pesado**: 355 mil triângulos só de cenário, 3× a balada (126 mil) e
  ~7× a praia/estúdio. É o candidato natural a otimização (merge por material, instâncias).
- **A praia é a mais leve de cenário** (58 mil triângulos, 19 malhas ativas): o recorte + areia/mar
  procedural custa menos que qualquer sala nativa.
- Com 10 avatares os cenários convergem (~400–700 mil triângulos): o custo passa a ser dominado
  pelos corpos.
- **O FPS desta medição não serve como referência de jogabilidade**: o Chromium roda com WebGL por
  software (SwiftShader), então o cliente fica limitado a 1–4 fps em qualquer cena. Ele serve só
  para mostrar que a ordem de grandeza acompanha triângulos/ossos. O FPS real deve ser lido no HUD
  (`?` nada — o painel da sala já mostra fps/tri/ossos) num navegador com GPU.

### Próximos passos sugeridos

- Medir o FPS real em hardware com GPU (o HUD já entrega os números) e registrar a máquina.
- Otimizar o quarto (355 mil triângulos de cenário) antes de usá-lo como sala padrão de muita gente.
- Avaliar LOD de avatar (corpo simplificado acima de ~10 m) — cada avatar é ~52 mil triângulos.
- Definir o **limite de jogadores por cenário** a partir desses números (o critério da Fase 9 pede
  “limite baseado em medição”).
