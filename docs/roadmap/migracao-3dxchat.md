# Migração dos assets nativos do 3DXChat (Mv444 → 3dxchat-web)

Status: em execução - Fase A (tooling), Fase B (personagens M/F + anatomia masculina, B3) e **Fase C (primeiro conjunto de roupas)** concluídas; a **integração inicial (G1/G2)** feita - os modelos `3dx-male`/`3dx-female` entram no jogo como família paralela (ADR 0016), já vestem o conjunto nativo da Fase C e tocam o **idle nativo** (`stay_pose_1`, E0) e o **walk nativo** (E0b). A **Fase D foi iniciada** com um cabelo nativo por gênero (D0). Próxima: completar a Fase D (3 por gênero) e o restante da Fase E (poses e clipes). Plano **sequencial** para trazer, aos poucos, os assets do cliente 3DXChat para o nosso jogo. Começa pelos **personagens (masculino e feminino)** — já provados no piloto — e segue para roupas, cabelo, animações e customizações.

Leia antes: `docs/guides/assets-3d.md` (regras de assets do repo), `docs/decisions/0006-avatares-personalizaveis-fase-4.md` (decisões de avatar) e `docs/roadmap/proximas-fases.md`.

> **Regra de ouro deste plano:** cada fase termina com algo **visível e verificável** (um GLB que abre no `viewer3dx.html`), e nada entra no jogo antes de passar pela fase de integração (G). Não pular etapas.

---

## 0. Objetivo e princípios

Trazer os assets do 3DXChat nativo (personagens, roupas, cabelo, animações, customizações) para o nosso jogo Babylon.js, sem retarget (usando o esqueleto nativo), e gradualmente.

Princípios:

1. **Fonte é o cliente instalado** em `C:\dev\Mv444` (é a instalação: `3DXChat.exe` + `3DXChat_Data\` + `AssetBundles\`).
2. **Nativo, não adaptado.** Usar o esqueleto e as animações originais (sem retarget). O que já existe (`tools/goe/`) continua valendo para o GoE; o 3DX é uma **família de modelo separada**.
3. **Não otimizar os GLB** (sem `weld`/`prune`/`simplify`/`quantize`/`meshopt`). Decisão explícita: fidelidade primeiro; otimização é fase futura e medida.
4. **Nada de conteúdo explícito** em texto/código. Anatomia é tratada como _slot_ de malha (como o `genitals` do GoE).
5. **Cada asset registrado** no manifesto (seção 5 do guia de assets): origem, licença, hashes.
6. **Pipeline versionado.** Hoje os scripts do piloto estão em `%TEMP%` e **não** estão no repo. Passo A1 é movê-los para `tools/3dx/`.

---

## 1. Fonte — inventário do que existe em Mv444

| Fonte               | Caminho                                                                       | O que é                                                                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Personagem base** | `3DXChat_Data\character`                                                      | Unity serial file com as malhas do corpo/rosto: `man_body`, `man_head`, `man_eyelashes`, `man_penis`, `woman_body`, `woman_head`, `woman_eyelashes`, `woman_penis` |
| Roupas              | `AssetBundles\wear\male\*`, `AssetBundles\wear\female\*`                      | ~315 (M) + ~300 (F) itens. Cada bundle tem o mesh de deformação (nome reusado: `man_body`/`woman_body`)                                                            |
| Cabelo              | `AssetBundles\hair\male\hair_*`, `AssetBundles\hair\female\hair_*`            | ~175 arquivos                                                                                                                                                      |
| Animação            | `AssetBundles\animation\{m,f,mf,mm,ff,mff,mmf,mmm,fff,ingame,m_drum,f_drum}\` | 1 `AnimationClip` legacy (30 fps) + esqueleto **já posado** por bundle                                                                                             |
| Texturas            | `AssetBundles\Textures`                                                       | texturas soltas (pele, olhos, etc.)                                                                                                                                |
| Ícones              | `AssetBundles\icons`, `3DXChat_Data\icons`                                    | previews de itens (UI)                                                                                                                                             |
| Tatuagem facial     | `3DXChat_Data\facetattooman`, `facetattoowoman`                               | recursos de customização do rosto                                                                                                                                  |
| Primitivos/cenário  | `AssetBundles\primitives`, `3DXChat_Data\level*`                              | props e cenas (piloto da `level20` em andamento)                                                                                                                     |

Formato dos bundles: `UnityFS` (Unity 5.4.3f1). **Alguns estão criptografados** (não começam com `UnityFS`) → ignorar e escolher o par em texto claro.

**Fato que destrava a Fase B:** o personagem base (com mãos e pés) **não** está em `wear`; está em `3DXChat_Data\character`. O `man_body` que aparece nos itens de roupa é a malha da **peça** (nominalmente reusada), não o corpo nu.

---

## 2. Regras fixas (aprendidas no piloto — não redescobrir)

Estas regras custaram muitas iterações. Valem para toda a migração.

1. **Espaço de coordenadas trocado.** A malha do corpo é **Z-up** (altura no +Z); o esqueleto/nós são **Y-up**. `m_BindPose` confirma o swap Y↔Z.
   - Conversão: `P = [[1,0,0,0],[0,0,-1,0],[0,1,0,0],[0,0,0,1]]`; **pré-multiplicar só os ossos** (`to_bl(M) = P @ M`); vértices **crus**.
   - Deform correto: `D = P · (pose_world · rest_world⁻¹) · P⁻¹` aplicado ao vértice cru.
   - **Não** aplicar `P` nos vértices; **não** usar conjugação `P·M·Pᵀ`.
2. **Chavear tudo por `path_id`** (object id único do Unity), não por string de path: nomes colidem (`man.034`, `man.118`). Na armature do Blender usar nomes de osso por índice (`b0..bN`) e vertex groups por índice.
3. **Composição hierárquica obrigatória:** `world[i] = world[pai] @ rest_local[i] @ delta[i]`. Osso não-casado (folha `man_bone_*`) **herda o mundo do pai** — senão o corpo fica imóvel.
4. **Não confiar em `pb.matrix` do Blender** para validar deform — ele aplicava os ossos certos e deformava a malha errado. **Fazer skinning em Python** (fórmula validada) para validar.
5. **Ordem de montagem da armature no Blender:** criar ossos → **definir parentes** → `length` → **`matrix` por último**. Atribuir `parent` **depois** de `matrix` corrompe a rotação de rest (era o bug dos braços em fita).
6. **glTF:** node rest = `P·rest_world`; `inverseBindMatrices = inverse(P·rest_world)`; animação = TRS local por quadro por osso, onde `basis = rest_local⁻¹ · pose_world[pai]⁻¹ · pose_world[i]`.
7. **Python 3.11 + UnityPy 1.25.4** (`py -3.11`). Python 3.15 falha (sem wheel `lz4`/MSVC).
8. **Blender 5.2 CLI:** `& "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup --python <script>`. A Action API mudou (`action.fcurves` não existe; usar `slots`).
9. **Path com acento** (`Área de Trabalho`): montar com `[char]0x00C1` e usar `&`, nunca `Start-Process -ArgumentList`.

---

## 3. Fase A — Bootstrap do pipeline (tooling)

**Objetivo:** transformar os scripts do piloto (hoje em `%TEMP%`) em ferramenta versionada do repo, executável de ponta a ponta nos dois gêneros.

### Passos

- [x] A1. Criar `tools/3dx/` e mover/renomear os scripts do piloto:
  - `extract_avatar2.py` → `tools/3dx/extract_character.py` (extrai malha + esqueleto + poses por `path_id`)
  - `skin_export.py` → `tools/3dx/skin_export.py` (skinning em Python, validação)
  - `export_glb.py` e `export_glb_anim.py` → `tools/3dx/export_glb.py` (rest + animação)
  - `glb_eval.py` → `tools/3dx/verify_glb.py` (skinning direto do glTF, validação independente)
  - `render_obj.py` / `check_glb_anim.py` → `tools/3dx/render_check.py`
- [x] A2. Parametrizar por gênero e por bundle (CLI: `--source`, `--mesh`, `--out`, `--gender`). Também `--skeleton`, `--anim`, `--path-id`.
- [x] A3. `tools/3dx/requirements.txt` (UnityPy==1.25.4) e um `README.md` curto em `tools/3dx/`.
- [x] A4. Documentar em `docs/guides/3dx-nativo.md` a seção do pipeline 3DX.
- [x] A5. Convenção de saída: `apps/web/public/assets/3dx/` (já existe, com `avatar_male.glb`). JSON intermediário em `tools/3dx/build/`.

**Aceite:** rodar `python tools/3dx/extract_character.py --gender male ...` reproduz o pipeline do piloto (ver B, adaptado para o `character`).

---

## 4. Fase B — Personagens (masculino e feminino) ← **começamos aqui**

**Objetivo:** ter os dois personagens base completos (corpo + cabeça + mãos + pés), em repouso e com uma animação de teste, visíveis no viewer.

**Fonte correta:** `3DXChat_Data\character` (não `wear`). Malhas por gênero:

- Masculino: `man_body`, `man_head`, `man_eyelashes`, `man_penis`
- Feminino: `woman_body`, `woman_head`, `woman_eyelashes`, `woman_penis`

### B1. Extrair o corpo base

- [x] Ler `3DXChat_Data\character` com UnityPy (é serial file, não `UnityFS`).
- [x] Extrair por gênero: malha do corpo, `BoneIndices`/`BoneWeights`, UV e triângulos.
- [x] Aplicar as regras da seção 2 (P só nos ossos, chave por `path_id`).
- [x] Gerar `character_<gender>.json` (novo formato: `bones` + `meshes[]` + opcional `frames`/`world`).
- [x] **Verificar que `man_body`/`woman_body` daqui vai até a cabeça e inclui mãos e pés.**

> **Descoberta (resolve o esqueleto):** o `character` tem **só malhas** (9 `Mesh`, 133 `Texture2D`) — sem `SkinnedMeshRenderer`, sem `Transform`, sem esqueleto. Cada malha traz os próprios `m_BindPose`/`BoneIndices`/`BoneWeights`. O esqueleto vem de um bundle de `wear` (mesmo rig). Para casar os índices locais da malha com o rig: `P⁻¹ · inverse(bindpose)` bate **exato** com o `rest_world` do osso (60/60 corpo M, 63/63 corpo F, 26/26 cabeça). Ver `lib3dx.remap_bindposes`.

### B2. Cabeça, mãos e pés (resolver o bloqueio atual)

- [x] A cabeça é malha **separada** (`man_head`/`woman_head`); mãos e pés vêm dentro do `man_body`/`woman_body`. Confirmado pelas faixas (corpo M z 0,004–1,594; cabeça M z 1,549–1,778) e pela contagem de vértices (corpo M 6 336 / F 9 580; cabeça M 2 180 / F 2 586).
- [x] Extrair `man_head`/`woman_head` com o **mesmo esqueleto** e o **mesmo espaço** do corpo.
- [x] Unir corpo + cabeça (+ cílios) numa exportação única, como **peças** dentro do mesmo GLB (um armature, três malhas). Decisão B2: um GLB, peças separadas por malha.
- [x] Ossos faciais (olhos, lábios, sobrancelha, mandíbula, língua) entram pelo mesmo esqueleto de `wear`.
- [x] `man_eyelashes`/`woman_eyelashes` como peça fina (opcional).

### B3. Anatomia (slot, como no GoE)

- [x] `man_penis` como **quarta peça dentro de `character_male.glb`** (um armature, quatro malhas: corpo, cabeça, cílios e anatomia). Decisão desta fase: o 3DX ainda **não tem catálogo de peças** (Fase C/G), então a anatomia não pode ser um GLB à parte equipável como `GoE_M_Genitals`; ela entra como peça separada **no mesmo arquivo** e pode ser separada depois, quando o catálogo 3DX existir. Nome do mesh e do osso vêm da fonte (`man_penis`, `man_bone_pen_*`), como todo o resto do pipeline; o mapa de juntas não muda (a peça usa `b4`/`b8`/`b9`/`b10`/`b14`).
- [ ] `woman_penis` — a peça feminina fica para quando o pipeline feminino for revisto (não pedida nesta atividade).
- [x] Validação: `verify_glb.py` em repouso dá `maxdisp = 0.0000` nas quatro malhas; o GLB passa de 2,71 MB para 2,84 MB (dentro do orçamento de 3 MB do guia de assets).

### B4. Export GLB (rest) e validação

- [x] Exportar `apps/web/public/assets/3dx/character_male.glb` e `character_female.glb` (rest/A-pose) com `export_glb.py`.
- [x] Validar com `verify_glb.py`: em repouso, deform = identidade (M e F: `maxdisp = 0.0000` no corpo, cabeça e cílios).
- [x] Abrir no viewer (`viewer3dx.html`, `?model=character_male|character_female`) com altura normalizada em 1,7 m.

### B5. Animação de teste embutida

- [x] Embutir **um** clipe nativo (`man@dj` / `woman@dj`) via `extract_character.py --anim` + `export_glb.py --anim`.
- [x] Validar: no quadro 80, `skin_export.py` (referência) e `verify_glb.py` (GLB) dão o **mesmo** deslocamento máximo — M corpo 0.9827, cabeça 0.3165, cílios 0.1506; F corpo 0.7930, cabeça 0.2577, cílios 0.1336.
- [x] Render conferido: os braços **não** viram fita (regra 5 da seção 2).

> **Nota:** o clipe de teste (`man@dj`/`woman@dj`) foi removido dos GLB publicados; no lugar entraram o **idle nativo** `stay_pose_1` (E0) e o **walk nativo** `walk` (E0b), como grupos `idle`/`walk` (`animations=2`, em repouso `maxdisp ≈ 0`). O caminho `--anim`/`--extra-anim` do pipeline continua valendo para os demais clipes da Fase E.

**Aceite da Fase B:** ✅ `character_male.glb` (6,3 MB, com anatomia) e `character_female.glb` (6,1 MB), corpo+cabeça+mãos+pés, com idle e walk nativos embutidos, validados por `verify_glb.py` e visíveis no `viewer3dx.html`.

---

## 5. Fase C — Roupas (wear)

**Objetivo:** trazer os itens de `AssetBundles\wear\{male,female}` como peças skinnadas no esqueleto do personagem base.

**Fato que destravou a fase:** os bundles de roupa foram autorados em **cópias próprias do rig**, com raízes rotacionadas/deslocadas e o mesh no bind A-pose. O remap por posição falha; o `extract_character.py` ganhou `--retarget`, que mapeia ossos **por nome** (`_1`/`_2`, com herança do ancestral mais próximo para dedos ausentes) e assa cada vértice com `refWorld[map(i)] * bindpose[i] * v`, depois aplica a conversão Y-up → Z-up. O resultado é a peça **no rest pose do corpo**.

### Passos

- [x] C1. Reusar `extract_character.py --retarget` apontando para cada bundle de roupa. O mesh do item chama-se `man_body`/`woman_body`/`item`/`pants_1` (nome reusado por peça) — escolher pelo `m_Mesh.path_id`, não pelo nome nem pelo “SMR com mais ossos”.
- [x] C2. Normalizar nomes: cada item vira um ID de catálogo (`3dx_<gênero>_<slot>_<nome>`) e o catálogo ganhou o campo opcional `file` (caminho relativo a `assets/`).
- [x] C3. Exportar um GLB por peça em `apps/web/public/assets/3dx/clothes/<slot>/<id>.glb`, no mesmo esqueleto e escala do corpo. Primeiro conjunto: `top`, `bottom` e `underwear` por gênero.
- [ ] C4. Peças que **substituem** o corpo (full-body, ex.: `HZmalelatexsuit`, `s_latexfullbody_ni`) recebem tratamento próprio: escondem o corpo nu e podem cobrir a cabeça. (Fora do primeiro conjunto.)
- [x] C5. Filtrar o primeiro conjunto (1 top + 1 bottom + 1 underwear por gênero) e crescer depois:
  - masculino: `s_ManShirt1_ni` → `3dx_m_top_shirt`; `mpants_1` → `3dx_m_bottom_pants`; `mjockstrap` → `3dx_m_underwear_briefs`;
  - feminino: `s_EmoShirtF_ni` → `3dx_f_top_shirt`; `alexwidejeansfem1cum` → `3dx_f_bottom_pants`; `s_pantie_15_ni` → `3dx_f_underwear_panties`.
  - Descartados: `s_CropTop_ni` (retarget assimétrico) e `s_squipanties1cum` (é arnês, não calcinha; segue como esqueleto de referência feminino).
- [x] C6. Tint: materiais exportados em **branco** (`--color 1,1,1`) e recoloridos pelo `TintPlugin` do jogo (`topColor` no top, `bottomColor` no bottom e na roupa íntima). Nada de textura alheia.
- [x] C7. Não otimizar (regra 3 da seção 0): sem `weld`/`prune`/`simplify`/`quantize`/`meshopt`.
- [x] C8. Integração no jogo: slot `underwear` em `PART_SLOTS`/schema/defaults/UI; 6 entradas no catálogo (`FREE_PART_IDS`); `attachAvatarParts` troca o esqueleto clone da peça pelo **esqueleto do corpo** quando `sameBoneLayout` confirma a mesma ordem de ossos (a peça passa a acompanhar idle/walk nativos); a roupa íntima fica sob a calça; a anatomia masculina (`man_penis`) some com `bottom` ou `underwear`.
- [x] C9. Prova: `verify_glb.py --rest` = `maxdisp 0.0000` nos 6 GLBs; testes de skinning do corpo e das peças; `viewer3dx.html?outfit=all` mostra o corpo + peças no mesmo esqueleto, acompanhando o idle.

**Aceite:** um conjunto pequeno de roupas trocável no jogo (viewer/vestiário), sem mover o esqueleto (regra 2 do guia de assets). ✔ Primeiro conjunto masculino e feminino; `?outfit=top|bottom|underwear|all` no `viewer3dx.html` mostra as peças sobre o corpo.

---

## 6. Fase D — Cabelo

**Objetivo:** `AssetBundles\hair\{male,female}` como peças presas à cabeça.

- [x] D0. Piloto: `hair_15` (M) e `hair_30` (F) extraídos com atlas de fios, `alphaMode: MASK`, `doubleSided`, catálogo/defaults/free e `hairTint`; ~2,6/3,4 mil vértices e GLB de 1,6/1,3 MB (acima do alvo de 1 MB; candidato a downscale do atlas).
- [ ] D1. Extrair cada `hair_*` (é malha própria; normalmente presa ao osso `man Head`/`woman Head`).
- [ ] D2. Exportar `apps/web/public/assets/3dx/hair/<id>.glb`, preso ao osso da cabeça (rígido, como o guia de assets manda para cabelo).
- [ ] D3. Reusar o pipeline de material/tint do repo para cor de cabelo.
- [ ] D4. Cuidado com cabelos com muitos cards: medir impacto antes de dizer que está pronto.

**Aceite:** trocar 3 cabelos por gênero no viewer.

---

## 7. Fase E — Animações nativas

**Objetivo:** tocar as animações nativas do 3DXChat no esqueleto nativo (sem retarget).

Contexto do piloto: cada bundle em `animation\...` guarda **1 `AnimationClip` legacy a 30 fps** e o **esqueleto já posado**; o clipe é um delta sutil sobre o idle. Nomes usam espaço (`man Head`) enquanto o wear usa underscore (`man_Head`) → casar por **`norm_path`**. Amplitude medida: `man@dj` = 93.3°, `man@wash_hands` = 101.8°, `drum` = 73.7°, `guitar` = 54.3°.

O idle (`stay_pose_1`) não está em `animation\...`: mora em `resources.assets` e o clipe anima os **ossos de controle** (`man Pelvis`, `man Spine`, ...), não os deform bones do SMR. O `--anim-root man|woman` lê o subtree `*_bone_POSE_PIVOT` e o delta world-space; ossos sem curva herdam a rotação local de rest do pai (ver `tools/3dx/README.md`).

### Passos

- [x] E0. Extrair `stay_pose_1` de `resources.assets`, embutir como `idle` nos corpos M/F, tocar via `applyMotion`/`motionClip` e fazer as peças compartilharem o esqueleto do corpo (C8). Validado no `viewer3dx.html`: braços/pernas sem colapso e roupas acompanhando.
- [x] E0b. Extrair o `walk` nativo (37 quadros @ 30 fps, in-place) como segunda action nos dois corpos (`--extra-anim`), escolher pelo `motionClip` quando há deslocamento e ajustar o `speedRatio` à velocidade do avatar (1,35 m/s) para o pé não patinar. O walk masculino passa por `damp_walk_sway.py` (fator 0,25 em `Spine1/Spine2/Neck/Head`) para tirar a balançada lateral; a cabeça cai de ~14,6 cm para ~3,3 cm. Roupas acompanham pelo esqueleto compartilhado.
- [ ] E1. Escolher o **par em texto claro** de cada clipe (alguns bundles são criptografados).
- [ ] E2. Extrair `AnimationClip` + esqueleto posado; calcular o **delta vs idle** (o clipe não traz o rest absoluto).
- [ ] E3. Para cada quadro, escrever TRS local por osso (regra 6 da seção 2) e embutir no GLB do personagem **ou** exportar `apps/web/public/assets/3dx/anim/<grupo>/<nome>.glb`.
- [ ] E4. Catálogo de clipes em JSON (como `goe/clips/clips-male.json`), por gênero e por grupo (`m`, `f`, `mf`, `mm`, `mff`, `ingame`...).
- [ ] E5. Validação dupla por clipe: `skin_export.py` (referência) × `verify_glb.py` (GLB), quadro a quadro.
- [ ] E6. No cliente, reusar o `ClipPlayer` (crossfade) — ou um novo `clip-player-3dx.ts` se o eixo/formato diferir.

**Aceite:** tocar ≥5 clipes nativos por gênero, sem artefato, com deslocamento máximo do GLB batendo com a referência. Marco atual (E0/E0b): idle e walk nativos nos dois gêneros, sem deformação de membros e com as roupas acompanhando. ✔

---

## 8. Fase F — Customizações

**Objetivo:** pele, olhos, tatuagens faciais, cores e (se houver) morphs.

- [ ] F1. **Pele:** texturas de `AssetBundles\Textures` → `apps/web/public/assets/3dx/skins/<gender>/<id>.webp`; mapear no catálogo como `SKIN_TEXTURES`.
- [ ] F2. **Olhos/sobrancelhas/lábios** (se houver recursos próprios) como no GoE.
- [ ] F3. **Tatuagens faciais:** `3DXChat_Data\facetattooman` / `facetattoowoman` → decalques. Reusar o mecanismo de decalque do repo (`goe-decals.ts` + `decal-projection.ts`) se a malha permitir.
- [ ] F4. **Cores:** reusar `PALETTE` + tint; comprovar no modelo 3DX.
- [ ] F5. **Morphs/shape keys:** investigar se o `character`/wear traz blend shapes (o GoE usa; o 3DX pode não usar). Se não houver, registrar que forma é fixa nesta versão.
- [ ] F6. Tudo no **catálogo fechado** (`packages/contracts/src/avatar.ts`): só IDs, nunca caminho/URL.

**Aceite:** trocar pele e cor no viewer; tatuagem facial aplicada como decalque (se aplicável).

---

## 8b. Piloto — Sala nativa (`level20`)

**Objetivo:** trazer a menor sala completa do cliente, com móveis, para montar o
cenário no nosso viewer/jogo.

- [x] R1. Identificar a menor cena que é uma sala: `3DXChat_Data\level20`
  (quarto/vestiário; raízes `ROOM`, `FURNITURE`, `FURNITURE DYNAMIC`, `LIGHTS`).
- [x] R2. `extract_room.py`: resolver malhas/materiais/texturas externos
  (`sharedassets20.assets`/`resources.assets`), assar transforms no mundo,
  agrupar por material e extrair albedo em 512 px.
- [x] R3. `export_room_glb.py` + `viewer-room.html`: GLB estático com câmera
  orbital, vistas e wireframe. `viewer-closet.html`: a mesma sala como closet,
  câmera fixa e avatar + painel de customização, com focos de câmera (corpo
  inteiro, rosto, perfil, tronco, braços, pernas e costas) para tatuagens,
  piercings e detalhes. Resultado: 101 malhas, ~342 mil triângulos, GLB de
  16,6 MB (texturas 512 px).
- [ ] R4. Integrar no jogo: colisões, spawns, descarte e troca de sala; medir
  FPS/malhas com avatares.
- [ ] R5. Próximas salas: escolher por tamanho/uso e repetir o pipeline.

**Aceite do piloto:** abrir `viewer-room.html` e ver o quarto completo com
móveis e vidros; o aceite de jogo exige R4.

---

## 9. Fase G — Integração no jogo (Babylon)

**Objetivo:** o 3DX nativo entra como **família de modelo** no jogo, sem quebrar o GoE.

### Passos

- [x] G1. Decisão (ADR novo): o 3DX substitui o GoE, é família paralela, ou é experimental? (ver seção 11). Sem isso, **não** mexer em `avatar-model.ts`. → **ADR 0016: família paralela.**
- [x] G2. `avatar-model.ts`: mapa de juntas do 3DX (equivalente a `GOE_JOINTS`) e o modo 3DX; `MANNEQUIN_JOINTS` como contrato. O `RIGS['3dx-*']` declara `clips: { idle: 'idle', walk: 'walk' }`; a `applyMotion` toca idle/walk nativos e ajusta a velocidade do walk; `attachAvatarParts` recebe o esqueleto do corpo. Poses e demais clipes do catálogo entram no restante da Fase E.
- [ ] G3. Nome de arquivo = ID do catálogo; corpo base é a raiz; peças skinnadas no esqueleto do corpo; acessórios rígidos no osso.
- [ ] G4. Carregamento assíncrono com cache e **fallback** para o manequim (regra do guia de assets).
- [ ] G5. Manifesto (`apps/web/public/assets/manifest.json` ou o manifesto 3DX) com `id/path/bytes/sha256/version/origin/license`.
- [ ] G6. Testes: `mannequin.test.ts` (trocar aparência não move o esqueleto) e os testes de avatar seguem verdes.
- [ ] G7. Medir (regra 7 do guia): `world.perf.test.ts`, painel de FPS/malhas com bots.

**Aceite:** entrar no mundo com um avatar 3DX, andar, sentar, dançar; testes e typecheck verdes.

---

## 10. Ordem de execução (resumo)

```
A (tooling) → B (personagens M/F) → C (roupas) → D (cabelo) → E (animações) → F (customizações) → G (integração)
```

B e C andam em sequência; D/E/F podem andar em paralelo depois de B, mas cada uma só "entra no jogo" via G.

Verificação do repo (confirmar nomes no `package.json`):

- `pnpm check` = `format:check && lint && typecheck && test && build` (só quando tocar no repo; até então só arquivos novos em `public/`).
- `pnpm --filter @3dx/web dev` + abrir `http://localhost:5173/viewer3dx.html`.

---

## 11. Riscos e perguntas abertas

1. **Base: corpo + cabeça juntos ou peças?** ~~Decidir em B2.~~ **Resolvido:** um GLB por gênero com um armature e três malhas (corpo, cabeça, cílios), como peças dentro do mesmo arquivo (B2).
2. ~~**Família de modelo vs. troca definitiva do GoE.** Mexer em `avatar-model.ts` exige um ADR novo (G1).~~ **Resolvido:** família paralela (ADR 0016) — os modelos `3dx-male`/`3dx-female` entram ao lado do GoE, com a maquinaria do GoE gateada por `isGoeModel`.
3. **Tamanho dos GLB.** Sem otimização, o corpo pode ficar grande (o GoE masculino ~37 MB com morphs). Medido: `character_male.glb` 2,84 MB (rest, com anatomia) / 5,7 MB (com 1 anim); `character_female.glb` 4,0 MB / 8,4 MB. **Publicados em rest** (2,84 MB / 4,0 MB); o feminino ainda fica acima do orçamento do guia (≤3 MB) — avaliar otimização **medida** numa fase futura. Fase C: camisa masculina 2,58 MB (bundles densos; `alextshirt1male1cum` é a alternativa leve, ~2.920 verts fonte), cueca 1,61 MB, calça M 0,31 MB, top F 0,81 MB, calça F 1,21 MB, calcinha F 0,51 MB — todos individualmente abaixo de 3 MB.
4. **Criptografia de bundles.** Alguns itens (roupa/anim) vêm criptografados. Sempre escolher o par em texto claro; se um item só existir criptografado, registrar como indisponível.
5. **Licença/origem.** Todo asset precisa da entrada no manifesto (regra 6 do guia de assets). Confirmar a origem/uso dos assets do cliente antes de ir para produção.
6. **Morphs/shape keys** podem não existir no 3DX; confirmar em F5.
7. **Texturas e materiais** do 3DX usam shaders próprios; o mapeamento para material Babylon precisa de verificação (F1/F3). No B, o material é provisório (cor de pele chapada).
8. **Esqueleto de referência.** O rig vem de um bundle de `wear`; boneco M `HZmalelatexsuit` (322 ossos), F `s_squipanties1cum` (464 ossos). Nomes diferem por bundle (M com underscore, F com espaço, raiz `item/item_1/`) → casar clipes pelo **nome do osso** (`lib3dx.bone_key`), não pelo caminho completo.

---

## Apêndice A — matemática de coordenadas (referência rápida)

```
P  = [[1,0,0,0],[0,0,-1,0],[0,1,0,0],[0,0,0,1]]        # Y-up -> Z-up
to_bl(M) = P @ M                                       # só nos ossos
D  = P @ (pose_world @ rest_world⁻¹) @ P⁻¹             # deform aplicado ao vértice cru (Z-up)
bRW[i]      = P @ rest_world[i]
bPW[f][i]   = P @ pose_world[f][i]
rest_local[i] = bRW[pai]⁻¹ @ bRW[i]                    # (raiz: bRW[i])
basis[i][f]   = rest_local[i]⁻¹ @ bPW[f][pai]⁻¹ @ bPW[f][i]
# glTF: node rest = bRW; inverseBind = bRW⁻¹; animação = TRS local = rest_local @ basis
```

Armature no Blender (ordem importa): criar → **parentes** → `length` → **`matrix` por último**.

## Apêndice B — convenções de arquivo

```
apps/web/public/assets/3dx/
  character_male.glb                            # Fase B (corpo + cabeça + cílios + anatomia, B3)
  character_female.glb                          # Fase B (corpo + cabeça + cílios; anatomia pendente)
  genitals_male.glb / genitals_female.glb       # Fase B3, à parte — só quando houver catálogo de peças 3DX
  clothes/<slot>/<id>.glb                        # Fase C
  hair/<id>.glb                                  # Fase D
  anim/<grupo>/<nome>.glb                        # Fase E
  skins/<gender>/<id>.webp                       # Fase F
  catalog/<gender>.json                          # IDs, slots, metadados
tools/3dx/                                       # Fase A (pipeline versionado)
viewer3dx.html                                   # prova visual (já existe)
```
