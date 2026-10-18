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
- **Sem animação por ora.** Os GLB do 3DX entram **só com a pose de repouso** (o pipeline exporta
  em rest; o clipe de teste embutido da Fase B foi removido dos arquivos). O rig do 3DX não declara
  `clips` e a `applyMotion` é um no-op fora da família GoE — o avatar fica na pose do modelo. As
  animações nativas são a Fase E.
- **Aparência provisória.** No 3DX a `applyAppearance` só aplica a **cor de pele chapada**
  (`skinTone`); atlas de pele, olhos, morphs e decalques ficam para a Fase F. Isto é a decisão de
  "material provisório" já registrada na Fase B.
- **Vestiário.** O seletor de modelo passa a oferecer os dois modelos 3DX; o palco pula biblioteca
  de clipes e poses do GoE fora da família.

## Limites conhecidos

- **Sem catálogo de roupas/cabelo/acessórios** para o 3DX (Fases C e D). O avatar 3DX nasce e fica
  sem peças.
- **Sem animação** (Fase E): o avatar 3DX fica parado na pose de repouso e desliza ao se mover.
- **Sem morphs e sem texturas de pele/olhos** (Fase F). Forma e cor de pele são fixas + tom chapado.
- **Sem manifesto** de assets ainda (`id/path/sha256/origem/licença`, item G5) nem revisão de
  licença para produção (risco 5 do plano).
- Serve para **provar os modelos no jogo**; não é a integração final do 3DX (Fase G).

## Alternativas consideradas

- **Substituir o GoE pelo 3DX.** Descartada: joga fora catálogo, poses, clipes, morphs e decalques
  do GoE antes de o 3DX ter equivalente (Fases C–F).
- **Deixar só no viewer (`viewer3dx.html`).** Descartada: o pedido é testar os modelos **na
  aplicação**; o viewer já existe e não exercita o rig com o resto do jogo.
