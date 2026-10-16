# ADR 0006: Avatares personalizáveis (Fase 4)

- **Status:** aceita
- **Data:** 2026-10-14

## Contexto

A Fase 4 pede um formato canônico de avatar, uma convenção de esqueleto, a escolha de uma base,
opções de cabelo, roupas e acessórios, a configuração salva no backend, animações compatíveis,
otimização e desempenho medido com vários avatares. Não há modelo licenciado com rig: **por decisão
do responsável pelo produto, a fase segue com o manequim provisório** (primitivas geradas por
código), estruturado para ser trocado por um modelo de verdade depois.

## Decisões

### Formato canônico (`packages/contracts/src/avatar.ts`)

- `AvatarConfig` só referencia **itens de um catálogo fechado**:
  - `body`, `skin`, `hair`, `hairColor`, `top`, `topColor`, `bottom`, `bottomColor` e `accessory`;
  - nunca URL, caminho de arquivo ou cor livre;
  - objeto estrito, então campo extra é recusado.

  Isso cumpre o critério "assets inválidos ou não autorizados não podem ser carregados
  arbitrariamente": o servidor recusa o que está fora do catálogo, e o cliente só sabe montar o que
  está nele.

- `parseAvatar` lê qualquer valor externo (banco ou estado da sala) e devolve o avatar padrão quando
  o valor é inválido. Nunca falha.
- `AVATAR_FORMAT_VERSION = 1`. Uma mudança incompatível sobe a versão e exige migrar o que está
  salvo.

### Convenção de esqueleto (`MANNEQUIN_JOINTS`)

- As articulações são `pelvis`, `head`, `left/right-hip`, `left/right-knee`, `left/right-shoulder`
  e `left/right-elbow`. A frente do corpo é +Z local, Y aponta para cima e as unidades são metros.
- Equipamentos se prendem a articulações:
  - cabelo, óculos e boné à `head`;
  - saia e colar à `pelvis`.
- Um modelo licenciado (glTF/GLB com rig) precisa expor essas articulações, ou um mapeamento para
  elas. Assim a pose procedural, o ciclo de caminhada e os encaixes continuam valendo.
- **Trocar a aparência nunca recria nem desloca o esqueleto.** A troca só recolore o corpo, ajusta a
  escala das malhas conforme o tipo de corpo e refaz os equipamentos. Um teste percorre todo o
  catálogo e confere que as articulações são as mesmas instâncias, com a mesma posição e o mesmo
  pai, e que nenhuma malha vaza.

### Persistência e propagação

- Coluna `User.avatar` (`jsonb`, `null` = padrão). Rotas `GET /avatar` e `PUT /avatar`, com sessão,
  validação pelo contrato e limite de 30 trocas por minuto.
- A API coloca o avatar salvo **no ticket assinado** do realtime. O realtime o grava em
  `PlayerState.avatar` (JSON), e os outros jogadores o veem.
- Depois de salvar, o cliente reapresenta um ticket novo (`refresh-ticket`) e a mudança chega aos
  outros sem precisar sair da sala. O realtime continua sem acesso ao banco.
- `PROTOCOL_VERSION = 3`, porque `PlayerState` ganhou o campo `avatar` e o ticket ganhou a claim
  `avatar`.

### Editor

- O editor fica num painel lateral, sem escurecer o mundo, com opções em `fieldset`/`radio`
  acessíveis por teclado.
- A **prévia ao vivo** aparece no próprio avatar e não vai ao servidor. Ela termina sozinha quando o
  servidor passa a informar a mesma aparência, sem piscar a versão antiga. Cancelar volta ao que
  está salvo.

### Animações

- O ciclo de caminhada procedural continua sendo a "biblioteca" desta fase. Ele opera sobre as
  articulações da convenção, então vale para qualquer combinação do catálogo.
- Animações de esqueleto (idle, gestos, sentar) dependem do modelo licenciado e entram com a Fase 5
  (interações).

### Otimização e medição

- **Materiais compartilhados por cor na cena.** O total fica limitado ao catálogo (pele + paleta + 3) e não cresce com o número de jogadores: 16 avatares variados usam 25 materiais.
- **Sombra só nas partes grandes** (tronco, cabeça, coxas, canelas, braços, cabelo, saia). A passada
  de sombra caiu de cerca de 305 para **160 malhas** com 16 avatares.
- O estado "desconectado" usa `mesh.visibility` em vez de transparência do material, o que permite
  compartilhar os materiais.
- Medições:
  - **CPU** (teste `world.perf.test.ts`, com `NullEngine`): 16 avatares variados somam **314
    malhas** (289 de avatares, cerca de 18 por avatar). Cada quadro custa **3,7 a 5,4 ms**, contando
    estado a 20 Hz, interpolação, animação e preparação do render. Cabe com folga em 60 fps. O teste
    falha acima de 16 ms.
  - **Navegador** (16 jogadores reais: navegador e 15 bots com `--count 15`): **302 malhas ativas**.
    O painel da sala mostra FPS e malhas a cada segundo. **O FPS de GPU não foi medido aqui**,
    porque o painel do navegador usado nos testes fica oculto e não desenha quadros; precisa ser
    lido num navegador visível, nas máquinas que serão o alvo.
- Próximas otimizações, se a medição pedir: juntar as malhas de um mesmo pivô (`MergeMeshes`) e
  usar instâncias por geometria. Com um modelo GLB, isso vira LOD e compressão (Draco/meshopt,
  KTX2), conforme a especificação.

## Pendências

- **Modelo licenciado com rig** compatível com a convenção, mais o pipeline de assets (origem,
  licença e versão registradas). — **resolvido** na atualização abaixo.
- Medir o FPS de GPU num navegador visível, com 16 avatares, nos dispositivos-alvo.
- Variações extras (rosto, mais roupas) entram aos poucos, sempre pelo catálogo.

---

## Atualização (2026-10-16): base licenciada e biblioteca GoE

O manequim provisório foi substituído em produção pelo **GoE Character Creator** (DanilGOE, licença
comercial / Royalty Free), exportado do Blender 5.2. Detalhes do pipeline no
`docs/guides/assets-3d.md`, seção 11. As decisões desta atualização:

- **Formato (`AvatarConfig`).** `AVATAR_FORMAT_VERSION = 5`. Campos novos: `skinTexture`
  (`SKIN_TEXTURES`), `eyes` (`EYE_COLORS`) e `decals: DecalChoice[]` (`DECAL_CATEGORIES` +
  `DECAL_SLOTS`). O catálogo de peças (`PART_CATALOG`) ganhou o slot `hair`. Como o avatar é salvo
  como JSON, não houve migração de banco: campos novos caem no padrão ao ler avatar antigo.
- **Segurança.** Continua valendo "só IDs do catálogo": o decalque guarda `categoria` + nome do
  arquivo (regex `^[a-z0-9_]+$`), nunca caminho/URL; o renderizador monta o caminho.
- **Renderização.** Os materiais do GLB são compartilhados entre instâncias, então a troca de pele e
  de olhos **clona o material do corpo só para aquele avatar** na primeira troca. Decalques são
  planos translúcidos presos ao osso da região (seguem a pose, não se deformam com a pele). Poses
  estáticas exportadas do rig de controle (IK) são reescritas para a hierarquia FK do jogo em
  `goe/poses/goe-poses.json`.
- **Texturas.** WebP lossy (`img.save_render`, qualidade 88): as texturas de aparência somam ~6,4 MB
  para 169 arquivos, em vez de centenas de MB em PNG.
- **Editor.** Seletores de pele, olhos, cabelo (slot) e decalques (categoria → imagem por slot),
  todos com prévia ao vivo.

Pendências desta atualização:

- **Peso do cabelo**: **resolvido** — os 6 GLBs passaram por `weld`/`prune`/`resize 1024`/`simplify`
  (`--ratio 0.3 --error 0.02`)/`quantize` (`KHR_mesh_quantization`, nativo no Babylon)/`meshopt`
  (`@gltf-transform/cli`), caindo de 19,6 MB para **4,0 MB (-80%)** — 5 dos 6 dentro do orçamento de
  ≤1 MB, o maior em 1,01 MB. `error 0.02` não produz mudança visível nas cards. O `meshopt`
  (`EXT_meshopt_compression`) exige o decoder, injetado do pacote `meshoptimizer` (wasm inline) em
  `gltf-loaders.ts`, que também anula a busca do Babylon por CDN — assim não quebra os testes nem a CSP.
- **Poses na rede**: **resolvido** — as 20 poses viraram `POSE_ACTIONS` (contrato), entrando em
  `ACTIONS`/`PlayerAction`; o servidor replica como gesto persistente (`actionUntil` indefinido) e o
  cliente aplica o preset quando a ação é uma pose, com seletor em `RoomPanel.tsx`. Duras até andar,
  sentar ou trocar.
- **Âncoras de decalque**: **resolvido** — calculadas por raycast na malha do corpo em repouso e
  convertidas para o espaço de cada osso, com escala local `(1,-1,1)` para cancelar o espelhamento do
  esqueleto (glTF→Babylon). O teste `goe-decals.test.ts` garante frente para fora e topo para cima;
  `?testDecalAnchor` segue disponível para ajuste fino ao vivo.
- Medir o FPS de GPU num navegador visível, com 16 avatares.
