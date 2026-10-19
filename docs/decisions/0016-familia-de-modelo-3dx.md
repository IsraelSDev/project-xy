# ADR 0016: Família de modelo 3DX (paralela ao GoE)

- **Status:** aceita
- **Data:** 2026-10-18

## Contexto

O plano de migração dos assets nativos (`docs/roadmap/migracao-3dxchat.md`) concluiu a **Fase A**
(pipeline em `tools/3dx/`) e a **Fase B** (personagens masculino e feminino em rest e com um clipe
de teste, validados por `verify_glb.py` e visíveis no `viewer3dx.html`). Para testar os modelos
**dentro da aplicação** (vestiário e mundo) era preciso responder à pergunta aberta de G1: o 3DX
**substitui** o GoE, é uma **família paralela** ou fica **experimental**?

O avatar já tem um conceito de "modelo base" (`AvatarConfig.model`, ADR 0006) com rig, peças e
catálogo próprios. Toda a maquinaria atual — catálogo de peças, poses exportadas, biblioteca de
clipes, atlas de pele/olhos, shape keys (morphs) e decalques — é **específica do GoE** (nomes de
ossos `*.x`, `SKIN_URL` por gênero, `MORPHS` etc.).

## Decisões

- **Família paralela, não substituição.** Entram dois modelos novos no catálogo fechado
  (`AVATAR_MODELS`): `3dx-male` ("Masculino 3DX") e `3dx-female` ("Feminino 3DX"). O GoE continua
  intacto; o 3DX é uma família a mais, escolhível no vestiário.
- **A fronteira é o `isGoeModel`.** Um helper no contrato (`packages/contracts/src/avatar.ts`) diz se
  o modelo é do GoE. Toda a maquinaria exclusiva do GoE passa a ser **portada por ele**:
  - peças da biblioteca (`attachAvatarParts`) — o 3DX não tem catálogo de peças ainda;
  - poses estáticas (`ensurePosePresets`) e clipes do GoE (`ensureClips`) — no mundo e no vestiário;
  - atlas de pele/olhos, morphs e decalques em `applyAppearance`.
- **Avatar padrão sem peças do GoE.** `defaultAvatarFor` agora **esvazia** (`'none'`) todo slot sem
  peça grátis compatível. Antes ele herdava as peças do `DEFAULT_AVATAR` (todas do GoE), o que faria
  a API recusar o avatar 3DX ao salvar (`partFitsModel`, ADR 0006). Para o GoE o resultado é o
  mesmo de antes.
- **Rig por gênero, juntas por índice.** `avatar-model.ts` ganha o mapa de juntas do 3DX
  (`JOINTS_3DX_MALE`/`JOINTS_3DX_FEMALE`). O `export_glb.py` nomeia cada osso pelo índice na lista
  `bones` do JSON (`b0..bN`), e os índices **mudam por gênero** — o mapa é por gênero, chaveado pelo
  osso do quadril para o `pickRig`.
- **Idle e walk nativos, sem pose procedural.** Os corpos 3DX publicados levam os clipes
  `stay_pose_1` e `walk` (`resources.assets`, `--anim-root man|woman`) como grupos `idle` e `walk`.
  O `RIGS['3dx-*']` declara `clips: { idle: 'idle', walk: 'walk' }` e a `applyMotion` toca esses
  clipes fora da família GoE, ajustando a velocidade do walk ao deslocamento. Não há pose
  procedural/presets calibrados; poses e demais clipes são o restante da Fase E.
- **Aparência provisória.** No 3DX a `applyAppearance` só aplica a **cor de pele chapada**
  (`skinTone`); atlas de pele, olhos, morphs e decalques ficam para a Fase F. Isto é a decisão de
  "material provisório" já registrada na Fase B.
- **Vestiário.** O seletor de modelo passa a oferecer os dois modelos 3DX; o palco pula biblioteca
  de clipes e poses do GoE fora da família.

## Limites conhecidos

- **Cabelo e acessórios** do 3DX ainda não têm catálogo (Fase D); o primeiro conjunto de roupas da
  Fase C já está integrado.
- **Só idle e walk nativos** por enquanto (E0/E0b); sentar e clipes de dança/pose continuam na Fase E.
  O walk é in-place e o `speedRatio` acompanha a velocidade do avatar.
- **Sem morphs e sem texturas de pele/olhos** (Fase F). Forma e cor de pele são fixas + tom chapado.
- **Sem manifesto** de assets ainda (`id/path/sha256/origem/licença`, item G5) nem revisão de
  licença para produção (risco 5 do plano).
- Serve para **provar os modelos no jogo**; não é a integração final do 3DX (Fase G).

## Atualização — Fase C (2026-10-19)

O primeiro conjunto nativo de roupas entrou no jogo: o slot `underwear` foi criado no contrato e há
três peças por gênero (`top`, `bottom`, `underwear`), retargetadas para o esqueleto do corpo e
liberadas em `FREE_PART_IDS` para nascerem equipadas. A fronteira `isGoeModel` deixou de significar
"sem peças": o catálogo ganhou o campo `file` (`assets/3dx/clothes/...`) e o `attachAvatarParts`
passa a **compartilhar o esqueleto do corpo** quando a ordem dos ossos coincide
(`sameBoneLayout`), então as peças acompanham idle/walk nativos. A anatomia masculina que viaja no
`character_male.glb` é ocultada quando há calça ou roupa íntima, e a roupa íntima não é desenhada
sob a calça. Cabelo, acessórios e o restante do catálogo continuam fora desta família (Fases D e
seguintes). O idle (`stay_pose_1`) entrou como E0; os demais clipes continuam na Fase E.

## Atualização — walk nativo (2026-10-19)

O `walk` de `resources.assets` entrou como segunda action nos dois corpos (37 quadros @ 30 fps,
in-place). `motionClip` escolhe `walk` quando o avatar se desloca e `idle` quando para;
`applyMotion` reinicia do rest pose ao trocar de clipe e ajusta o `speedRatio` do walk à velocidade
exibida (o clipe é autorado para ~1,17 m/s; o jogo anda a 2 m/s, com fator de cadência 0,75). As peças da Fase C herdam o
movimento pelo esqueleto compartilhado, sem retarget adicional.

## Alternativas consideradas

- **Substituir o GoE pelo 3DX.** Descartada: joga fora catálogo, poses, clipes, morphs e decalques
  do GoE antes de o 3DX ter equivalente (Fases C–F).
- **Deixar só no viewer (`viewer3dx.html`).** Descartada: o pedido é testar os modelos **na
  aplicação**; o viewer já existe e não exercita o rig com o resto do jogo.
