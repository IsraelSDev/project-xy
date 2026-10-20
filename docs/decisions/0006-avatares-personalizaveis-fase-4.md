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

## Atualiza??o (2026-10-20): base ?nica 3DX

O manequim provis?rio e a fase de teste com o modelo anterior foram substitu?dos pelo **modelo 3DX nativo**
(ADR 0016). Detalhes do pipeline em `docs/guides/3dx-nativo.md`. As decis?es desta atualiza??o:

- **Formato (`AvatarConfig`).** `AVATAR_FORMAT_VERSION = 6`. S? existem `3dx-male` e `3dx-female`.
  Sa?ram os campos espec?ficos do modelo anterior (`body`, `skinTexture`, `eyes`, `morphs`, `genitals`).
  `decals` continua, agora apontando para as tatuagens 3DX (`assets/3dx/decals`).
- **Seguran?a.** Continua valendo "s? IDs do cat?logo": o decalque guarda `categoria` + nome do
  arquivo (regex `^[a-z0-9_]+$`), nunca caminho/URL; o renderizador monta o caminho.
- **Renderiza??o.** O corpo 3DX usa o tom de pele escolhido como multiplicador do atlas; roupas,
  cabelo e acess?rios compartilham o esqueleto do corpo (`sameBoneLayout`). Decalques s?o peda?os
  conformados da malha do corpo (`decals-3dx.ts`).
- **Editor.** Modelo, altura, tom de pele, cabelo, roupas, acess?rios e tatuagens, todos com pr?via
  ao vivo.
- **A??es.** `POSE_ACTIONS` tem s? os clipes 3DX (`pose01` e `pair01`), usados pelas intera??es
  consentidas.

- Medir o FPS de GPU num navegador visível, com 16 avatares.
