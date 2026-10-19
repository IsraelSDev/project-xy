# Guia: assets 3D (avatares e salas) para o navegador

Este guia é para uma IA (ou pessoa) que vai implementar assets 3D no 3dxchat-web. Siga as etapas na ordem. Não pule etapas. Se algo não bater com o repo, pare e relate.

Leia antes: `docs/decisions/0006-avatares-personalizaveis-fase-4.md` (decisões de avatar) e este arquivo.

---

## 0. Regras fixas (não mudar)

1. **Catálogo fechado.** O `AvatarConfig` guarda só IDs (`packages/contracts/src/avatar.ts`). Nunca guardar URL, caminho ou cor livre.
2. **Esqueleto fixo.** Trocar cabelo, roupa ou acessório nunca recria nem move o esqueleto. Isso já é testado em `apps/web/src/game/characters/mannequin.test.ts`.
3. **Convenção de articulações.** Os ossos do modelo têm que mapear para `MANNEQUIN_JOINTS` (`apps/web/src/game/characters/mannequin.ts`):
   `pelvis`, `head`, `left-hip`, `left-knee`, `right-hip`, `right-knee`, `left-shoulder`, `left-elbow`, `right-shoulder`, `right-elbow`.
   Frente do corpo = +Z local. Y para cima. Unidades em metros.
4. **Materiais compartilhados.** Um material por cor/atlas, não um por malha ou por jogador.
5. **Nada de GLB grande.** `apps/web/public/test-assets/red-bikini-model.glb` tem 60 MB. É só de teste. Não usar como base de produção.
6. **Licença e origem registradas.** Todo asset precisa de uma entrada no manifesto (seção 5). Sem entrada, não entra no build.

Se uma tarefa pedir algo que quebra uma regra acima, pare e pergunte.

---

## 1. Pré-requisito: o modelo base

Status atual: **escolhido e integrado.** A base é o **GoE Character Creator** (DanilGOE), com licença comercial / Royalty Free, exportada do Blender 5.2. Os arquivos e o pipeline estão na seção 11. O manequim procedural continua como fallback enquanto o GLB carrega (ou se a carga falhar).

O modelo atende ao pré-requisito da Etapa 2:

- skeleton com os 10 ossos de `MANNEQUIN_JOINTS` (via o mapa `GOE_JOINTS`);
- um mesh por tipo de corpo;
- origem e licença documentadas (seção 11).

---

## 2. Formato do arquivo de asset

Cada asset é um GLB separado:

| Tipo               | Arquivo                                         | Skeleton | Como prende                                                                           |
| ------------------ | ----------------------------------------------- | -------- | ------------------------------------------------------------------------------------- |
| Corpo base         | `avatar/body-<tipo>.glb`                        | próprio  | é a raiz do avatar                                                                    |
| Cabelo             | `avatar/hair-<id>.glb`                          | do corpo | rígido: `TransformNode` no osso `head`                                                |
| Roupa (top/bottom) | `avatar/top-<id>.glb`, `avatar/bottom-<id>.glb` | do corpo | skinned no skeleton do corpo                                                          |
| Acessório          | `avatar/acc-<id>.glb`                           | nenhum   | rígido: `TransformNode` no osso indicado (óculos e boné em `head`, colar em `pelvis`) |
| Cenário            | `rooms/<sala>/<nome>.glb`                       | nenhum   | estático, carregado por sala                                                          |

Regras:

- Nome do arquivo = ID do catálogo em `packages/contracts/src/avatar.ts` (ex.: `hair-long.glb`).
- Cor não tem arquivo próprio. Cor é tint (ver Etapa 2.2).

### 2.1 Cores por tint

- A paleta é `PALETTE` em `avatar.ts`. Não criar textura por cor.
- Para cabelo e roupa: material com cor base neutra (branca) e aplicar a cor via `material.diffuseColor` (ou uniform), usando o `hex` do item.
- Trocar cor = trocar um valor de material, nunca carregar outro arquivo.

### 2.2 Carregamento

- Usar `LoadAssetContainerAsync` (como `apps/web/src/game/characters/test-avatar.ts`).
- Cachear por URL. Mesmo arquivo carregado duas vezes = um container só.
- Carregamento assíncrono. Enquanto carrega, mostrar o manequim procedural. Não travar o render.
- Erro de carregamento: manter o manequim e registrar aviso no console. Não quebrar o avatar.

---

## 3. Animações

1. Clipes de animação ficam no mesmo GLB do corpo ou em `avatar/anim-<nome>.glb`.
2. Carregar sob demanda (ex.: `idle`, `wave`, `sit`). Não carregar todos no início.
3. Caminhada: o manequim e os modelos sem clipe usam o ciclo procedural de `apps/web/src/game/animation/walk-cycle.ts`; a família 3DX usa o clipe nativo `walk` embutido no corpo (`motionClip`), com `speedRatio` ajustado à velocidade do avatar.
4. Não criar novas ações de animação sem pedido explícito. Ações de esqueleto estão previstas para a Fase 5.

---

## 4. Salas e cenários

1. Cada sala tem seus GLBs em `rooms/<sala>/`.
2. **Merge por material:** juntar malhas que usam o mesmo material (`MergeMeshes`) e depois `freezeWorldMatrix()` nas malhas estáticas.
3. **Instâncias:** objeto repetido (cadeira, luminária) usa `thinInstances`, não cópias.
4. **Luz:** cenário com lightmap baked ou sem sombra dinâmica. Sombra em tempo real só para avatares (como hoje em `shadows.addShadowCaster`).
5. **Carregamento por sala:** carregar ao entrar, descartar ao sair (`container.dispose()`).
6. **Texturas de cenário:** juntar em atlas por categoria (chão, parede, mobília). Formato KTX2 com mipmaps.

Tamanhos iniciais (hipótese, medir antes de fixar):

- textura de prop: até 1024 px;
- chão e parede: até 2048 px.

---

## 5. Pipeline de otimização (obrigatório)

Ferramentas sugeridas (não estão instaladas no repo; confirmar antes de adicionar dependência):

- Blender para modelar e exportar glTF.
- `@gltf-transform/cli` para otimizar: `dedup`, `prune`, `weld`, compressão de geometria (Draco ou meshopt) e textura em KTX2 (`toktx`).

Passos:

1. Exportar do Blender como `.glb`, com um único skeleton por corpo.
2. Rodar a otimização. Salvar o resultado em `apps/web/public/assets/`.
3. Gerar/atualizar `apps/web/public/assets/manifest.json` com, para cada arquivo:
   - `id`, `path`, `bytes`, `sha256`, `version`;
   - `origin` (de onde veio), `license`, `author` (ou "próprio");
   - `triangles`, `materials`, `textures` (contagem, medidas pelo script).
4. O build falha se:
   - um arquivo não estiver no manifesto;
   - um arquivo passar do orçamento (seção 6);
   - um ID do catálogo não tiver arquivo correspondente.

---

## 6. Orçamentos (hipóteses iniciais, medir antes de fixar)

| Item                                   | Orçamento inicial             |
| -------------------------------------- | ----------------------------- |
| Corpo base, triângulos                 | ≤ 15 000                      |
| Cabelo / roupa / acessório, triângulos | ≤ 5 000 cada                  |
| Tamanho GLB corpo (comprimido)         | ≤ 3 MB                        |
| Tamanho GLB de roupa/cabelo            | ≤ 1 MB                        |
| Avatares simultâneos no teste          | 16                            |
| Malhas ativas por avatar               | ≤ 20 (hoje ~18, ver ADR 0006) |
| Tamanho de textura por asset           | ≤ 1024 px (avatar)            |

Estes números são pontos de partida. Qualquer mudança exige medição (seção 7), não palpite.

---

## 7. Como medir (obrigatório antes de dizer que está pronto)

1. CPU: rodar `apps/web/src/game/engine/world.perf.test.ts`. Ele falha acima de 16 ms por quadro.
2. Navegador: rodar com bots (`--count 15` no fluxo já existente) e observar o painel da sala (FPS e malhas).
3. GPU: **não medido ainda** (ver ADR 0006). Só afirmar FPS de GPU se medido num navegador visível, no dispositivo alvo. Caso contrário, dizer "não medido".
4. Registrar número antes/depois para cada mudança de asset.

---

## 8. Checklist de implementação (ordem)

- [ ] Confirmar que existe modelo base com skeleton de `MANNEQUIN_JOINTS` (seção 1). Se não, parar nesta etapa e relatar.
- [ ] Criar o script de otimização e o `manifest.json` (seção 5).
- [ ] Carregar corpo base com cache e fallback para o manequim (seção 2.2).
- [ ] Trocar cabelo, roupa e acessório por ID; cor por tint (seção 2.1, 2.2).
- [ ] Garantir que trocar aparência não move o esqueleto (teste existente em `mannequin.test.ts` deve passar).
- [ ] Animações sob demanda (seção 3).
- [ ] Salas: merge, instâncias, lightmap, carregamento por sala (seção 4).
- [ ] Rodar testes, typecheck e medir (seção 7).
- [ ] Atualizar `manifest.json` e registrar medições.

Comandos de verificação do repo:

- testes: `pnpm test` (ou o script equivalente do workspace);
- tipos: `pnpm typecheck`.

Confirmar os nomes de script no `package.json` antes de rodar.

---

## 9. Não fazer

- Não criar um GLB por combinação de cor ou por item completo.
- Não usar `red-bikini-model.glb` em produção.
- Não carregar assets sem entrada no manifesto.
- Não aceitar URL ou caminho vindo do servidor ou do cliente.
- Não criar texturas por cor.
- Não ligar sombra dinâmica em cenário inteiro.
- Não dizer que um número de performance foi medido sem medição real.

---

## 10. Decisões que não são técnicas (pedir ao responsável)

- Escolha do modelo base licenciado com rig.
- Origem e licença de cada asset.
- Lista final de itens do catálogo além dos atuais (ver `avatar.ts`).
- Se um item novo muda o formato do avatar: exige subir `AVATAR_FORMAT_VERSION` e migrar o que já está salvo.

---

## 11. Biblioteca GoE (implementada)

**Modelo base:** GoE Character Creator (DanilGOE) — licença comercial (US$ 179,99 pessoal) / Royalty Free. Fonte: `C:\Users\israe\OneDrive\Área de Trabalho\personagem` (`.blend`, `TextureM/F.zip`, `Decals.zip`, `Poses.zip`, add-on `goe_character_creator`). Exportado do Blender 5.2 (`tools/goe/build_all.sh`, que chama `tools/goe/export_goe.py`).

### Arquivos (`apps/web/public/test-assets/`)

| O que        | Onde                                                     | Observação                                       |
| ------------ | -------------------------------------------------------- | ------------------------------------------------ |
| Corpos base  | `GoE_Male.glb`, `GoE_Female.glb`                         | **sem cabelo** (o cabelo é peça)                 |
| Roupa (10)   | `GoE_{M,F}_*.glb`                                        | mesmo esqueleto do corpo, slot por peça          |
| Anatomia (M) | `GoE_M_Genitals.glb`                                     | slot `genitals`, opcional (a feminina é o corpo) |
| Cabelo (6)   | `GoE_{M,F}_Hair0{1,2,3}.glb`                             | slot `hair`; presos ao osso `head.x`             |
| Peles        | `goe/skins/{male,female}/<id>.webp`                      | `SKIN_TEXTURES`                                  |
| Olhos        | `goe/eyes/<id>.webp`                                     | `EYE_COLORS`                                     |
| Sobrancelhas | `goe/eyebrows/{male,female}.webp`                        | —                                                |
| Decalques    | `goe/decals/<categoria>/<imagem>.webp` + `manifest.json` | categorias em `DECAL_CATEGORIES`                 |
| Poses        | `goe/poses/goe-poses.json`                               | 20 poses (`pose01–10`, `sex01–10`)               |

### Cores (paleta)

As cores da aparência (`skin`, `hairColor`, `topColor`, `bottomColor`) valem no modelo GoE; antes só o manequim as usava.
Cada avatar clona os materiais que recolore (o do GLB é compartilhado):

- **Pele** (`skin`, em `avatar-colors.ts`): multiplica a textura de pele; o tom padrão não muda nada, os escuros escurecem
  na proporção e os claros clareiam até +15%. Só nas peles naturais (natural, negra, asiática); alienígena e zumbi ficam como estão.
  Dentes e língua não levam o tom. A anatomia masculina usa o mesmo.
- **Cabelo** (`hairColor`): troca o fator de cor do material (a textura do cabelo é só o desenho dos fios); a sobrancelha do
  corpo acompanha, mais escura.
- **Roupa** (`topColor` vale para camiseta e casaco, `bottomColor` para a calça): `tint-plugin.ts`, um plugin de material que
  troca o albedo pela cor da paleta com o brilho da luminância da textura. Só multiplicar não serve: a roupa preta (moletom, calça)
  continuaria preta. Sapato e acessórios ficam com a cor do GLB.

### Formas (shape keys / morph targets)

Nada do pacote fica de fora do export: o corpo, as roupas, o cabelo, os olhos e a sobrancelha saem com todas as shape
keys do `.blend` (corpo, rosto, expressões, movimentos do rosto padrão ARKit e anatomia), com o nome original. Só saem
da malha as chaves que não deslocam nenhum vértice (`MIN_KEY_DISPLACEMENT` em `export_goe.py`): sem isso o cabelo
masculino 1 passava de 290 MB.

- **Catálogo:** `packages/contracts/src/morphs.ts` é GERADO por `tools/goe/gen_morphs.py` a partir dos GLB (não editar à
  mão; os rótulos em português estão no gerador). O avatar guarda `morphs: { nomeDaChave: 0..1 }`, só as diferentes de zero
  (`AvatarConfig`, leitura tolerante: chave desconhecida ou valor fora da faixa é descartado/limitado).
- **Aplicação:** `apps/web/src/game/characters/morph-bake.ts`. O gerenciador de morph do Babylon guarda todas as chaves de
  uma malha numa textura float (o corpo masculino passa de 100 MB por avatar), então o container perde os gerenciadores ao
  carregar e cada avatar recalcula posições e normais das suas malhas na CPU, só das chaves em uso. A mesma chave existe no
  corpo, nas roupas e no cabelo (no `.blend` elas seguem o corpo por driver); o jogo aplica a influência por nome em todas.
- **Interface:** no vestiário, a aba **Formas** tem o corpo e a anatomia (a masculina é uma peça, `GoE_M_Genitals`, slot
  `genitals`, grátis, nunca vem no avatar padrão). O basemesh v1.4 **não traz** chave de tamanho nem de grossura do
  pênis: o export as **sintetiza** (`BodyPenisSize`, `BodyPenisGirth`, ver `add_genital_morphs` em `export_goe.py`) a
  partir da própria geometria da peça. O tamanho é uma escala uniforme do conjunto (base, escroto, cano e glande crescem juntos, em torno do encaixe no corpo, que fica parado para não abrir emenda); a grossura só aumenta o raio do cano. A aba **Rosto** (`FaceEditor.tsx`) tem a expressão (uma por vez, com
  intensidade), o formato por região (`MORPH_REGIONS`: olhos, nariz, boca...), os movimentos finos com os dois lados juntos,
  "Sortear rosto" e "Zerar rosto"; a câmera do palco (`setFocus('face')`) chega perto do rosto ao abrir a aba, e o botão
  Rosto/Corpo inteiro da barra da câmera ajusta à mão. A lógica de edição está em `face-edit.ts` (com testes).
- **Físico (aba Corpo):** Esguio / Médio / Largo viram um preset de formas (`BODY_BUILD_MORPHS` em
  `packages/contracts/src/avatar.ts`: magro / nada / fisiculturista) somado **por baixo** do `morphs` do avatar —
  o que o usuário mexer na aba Formas tem prioridade.
- **Regerar os GLB:** `BLENDER=<blender> tools/goe/build_all.sh <pasta dos .blend> <saída>` (export, hierarquia FK, remapeamento
  de ombro nas 4 camisetas e caimento da camiseta fitness), depois `tools/goe/build_manifest.py`, `tools/goe/verify_goe.py` e
  `tools/goe/gen_morphs.py <pasta dos GLB> packages/contracts/src/morphs.ts`. O export dos genitais acrescenta as chaves
  sintéticas de tamanho/grossura do pênis (`add_genital_morphs`); os rótulos delas ficam em `gen_morphs.py`.
- **Tamanho:** sem compressão (o meshopt quebra a posição de malha com pele). Corpo masculino ~37 MB, feminino ~72 MB, cabelos
  com formas até ~46 MB. Baixar tudo no primeiro acesso é pesado fora da rede local: o próximo passo natural é servir uma
  variante sem formas para o mundo e a completa só no vestiário.

### Altura

A altura é um campo `height` em `AvatarConfig` (aba **Corpo** do vestiário): multiplicador da base do modelo (1,7 m,
`MODEL_HEIGHT`), faixa `HEIGHT_MIN`..`HEIGHT_MAX` (0,85–1,2 → ~1,45–2,04 m), padrão 1. Em `avatar-model.ts`, o
`applyAppearance` escala a raiz inteira (corpo e peças, que são filhas dela) por `height` em torno dos pés; o alvo da câmera
do vestiário sobe junto. Vale para os modelos GoE no mundo e no vestiário; só o manequim de espera (antes do GLB carregar)
fica no tamanho base. Leitura tolerante: valor fora da faixa é limitado e não numérico vira 1.

### Esqueleto

Os ossos deform do GoE são `*_stretch`; o mapa está em `GOE_JOINTS` (`avatar-model.ts`). O eixo de flexão de quadril/joelho/ombro/cotovelo é Z (sinal espelhado no lado direito) em `GOE_POSE_AXES`. O corpo é modelado em **T-pose**: `GOE_BASE` gira os ombros ~77° no eixo X para abaixar os braços antes da pose procedural.

### Texturas

Convertidas para WebP **lossy** com `img.save_render(filepath=dest, scene=scene)`, `render.image_settings.file_format='WEBP'`, `quality=88`, `view_settings.view_transform='Standard'`. **`img.save()` grava sem perda** (não usar: o PNG de corpo de 3,88 MB virou 126 KB só com `save_render`). Alfa é preservado.

### Cabelo (por que é peça)

O cabelo no `.blend` estava parenteado (`parent_type='BONE'`) ao osso de controle `c_head.x`, que **não** é exportado com `export_def_bones=True` — a malha era descartada em silêncio. `skin_bone_parented()` (em `export_goe.py`) remove o prefixo `c_` quando o resto é osso deform (`c_head.x` → `head.x`), reparenta à armature e cria um vertex group com peso 1,0. Por isso o corpo base **não** inclui cabelo e cada estilo é um GLB próprio.

### Otimização dos GLBs de cabelo

O cabelo era o maior peso da biblioteca (19,6 MB em 6 arquivos), com a geometria dominando (16,5 MB) e os vértices praticamente **não indexados** (ex.: `GoE_M_Hair01` tinha 86 443 vértices para 29 404 triângulos ≈ 3 por triângulo). Passou por `@gltf-transform/cli` 4.5.1 (via `npx`, **não** adicionado como dependência do repo):

```
gltf-transform weld      in.glb  a.glb   # junta vértices idênticos
gltf-transform prune     a.glb   b.glb   # remove o que não é referenciado
gltf-transform resize    b.glb   c.glb   --width 1024 --height 1024   # texturas 2048 → 1024
gltf-transform simplify  c.glb   d.glb   --ratio 0.3 --error 0.02     # decimação (meshoptimizer)
gltf-transform quantize  d.glb   e.glb   # KHR_mesh_quantization
gltf-transform meshopt   e.glb   out.glb # EXT_meshopt_compression
```

Resultado: **19,6 MB → 4,0 MB (-80%)**, em duas etapas: `weld/prune/resize/quantize/simplify` levam a 9,1 MB e o `meshopt` fecha em 4,0 MB. O `quantize` (posição/normal/uv/peso em inteiros normalizados, **`KHR_mesh_quantization` suportado nativamente pelo Babylon**, sem decoder) e o `meshopt` (compressão sem perda do buffer, `EXT_meshopt_compression`) são os maiores ganhos; o `simplify` corta ~10-19% dos triângulos (é lossy). O `error 0.02` (2% do raio) **não produz mudança visível** nos renders das cards — a malha é uma sopa de ~16 600 cards sem vértices compartilhados, então `simplify` satura perto de 89% e não ajuda a ir além. Ossos e nomes são preservados (verificado por `avatar-parts.test.ts > cabelo otimizado`, que também exige `EXT_meshopt_compression` no `extensionsRequired`).

Tamanhos finais: `F_Hair01` 0,47 / `F_Hair02` 0,91 / `F_Hair03` 0,47 / `M_Hair01` 0,69 / `M_Hair02` 1,01 / `M_Hair03` 0,45 MB — 5 dos 6 dentro do orçamento de ≤1 MB (seção 6); `M_Hair02` fica em 1,01 MB.

O meshopt **exige decoder**: o Babylon busca-o por padrão de um CDN via `Tools.LoadBabylonScriptAsync` + `MeshoptCompression.Configuration.decoder.url`, o que falha no Vitest (`fetch`) e na CSP do build (`script-src 'self'`). Por isso `apps/web/src/game/characters/gltf-loaders.ts` registra o loader glTF e injeta o decoder do pacote `meshoptimizer` (wasm **inline**, sem `fetch`), setando `globalThis.MeshoptDecoder` e anulando `Tools.LoadBabylonScriptAsync`. **Todo código que carrega GLB deve importar `./gltf-loaders`** em vez de `@babylonjs/loaders/glTF`.

### Decalques

Cada decalque é um **pedaço da própria malha do corpo** (`goe-decals.ts`, `conformingDecal`; a matemática está em `decal-projection.ts`): os triângulos que caem na caixa da âncora, com UV por projeção planar, os mesmos pesos de pele do corpo e uma folga de 0,4 mm acima da pele. Por isso ele acompanha a curvatura (braço, coxa, peito) e deforma com a pose. É refeito a cada `applyDecals` (ao mexer numa forma do corpo, por exemplo) a partir da pose e da forma atuais. A âncora (`DECAL_ANCHORS`: rosto→`head.x`, pescoço→`neck.x`, peito/costas→`spine_03.x`, braços→`arm_stretch.*`, coxas→`thigh_stretch.*`) só diz ONDE; se ela não cair sobre o corpo, ou não houver a malha do corpo, o slot cai para o **plano translúcido** reto preso ao osso (o comportamento antigo). Categorias e slots em `DECAL_CATEGORIES`/`DECAL_SLOTS`; a escolha guarda `categoria` + nome do arquivo (nunca caminho).

As âncoras foram **calculadas por raycast** na malha do corpo em repouso (o ponto e a normal de cada região viraram posição/rotação no espaço do osso), então o plano (e o centro do pedaço de pele) assenta com a frente para fora e o topo para cima. Dois detalhes: o plano do Babylon olha para **-Z**, e o esqueleto GoE chega **espelhado** (a conversão glTF→Babylon deixa determinante negativo nos ossos) — por isso o decalque usa escala local `(1,-1,1)`, que cancela o espelho e mantém a textura sem inversão. Para calibrar ao vivo, sem rebuild: `?testAvatarDecal=` mostra decalques fixos no avatar local e `?testDecalAnchor=` ajusta a âncora de um slot (ver "Diagnóstico"). Os valores bons vão para `DECAL_ANCHORS`; o teste `goe-decals.test.ts` garante frente-para-fora/topo-para-cima.

### Poses

Poses estáticas exportadas do rig de controle original (IK/FK, ~527 ossos) e exportadas por `tools/goe/export_poses_goe.py` (tabela `SOURCES`: qual ação do `Poses.blend` vira cada id) e recalculadas para a hierarquia FK do jogo por `poses_to_json.py` (transform local final por osso, já sem as restrições). **Cada gênero tem o seu arquivo** (`goe-poses.json` = feminino, o rig original das poses; `goe-poses-male.json` = as mesmas ações amostradas no rig masculino por `export_poses_male.py`, no `.blend` masculino com `--poses Poses.blend`, e convertidas com `poses_to_json.py <pasta> goe-poses-male.json`): o transform local de cada osso depende das medidas do corpo, e a pose feminina aplicada ao esqueleto masculino deformava dedos, braços e coluna. Aplicadas por `goe-poses.ts` (escreve `posição` + `quaternion` por osso) e revertidas ao repouso pela pose procedural.

As poses são **ações sincronizadas**: `POSE_ACTIONS` (contrato) lista as 20 chaves (`pose01-10` neutras e `sex01-10` íntimas) com rótulos; `ACTIONS`/`PlayerAction` as incluem, então o servidor só replica como qualquer gesto (`lounge-room.ts` deixa `actionUntil` indefinido — a pose dura até andar, sentar ou escolher outra). No cliente `avatars.ts` chama `setPosePreset` quando a ação é uma pose (`isPoseAction`) e o seletor em `RoomPanel.tsx` envia a ação escolhida. O catálogo JSON é carregado sob demanda na primeira pose. O diagnóstico `?testAvatarPosePreset` segue valendo para inspecionar uma pose avulsa.

Sob a roupa, o corpo nu recua 4 mm ao longo da normal (`underClothes` em `body-build.ts`, só onde a peça cobre: tronco desde a barra, manga até o alcance dela, perna até a barra), porque a pele e o tecido têm pesos de esqueleto parecidos, não iguais, e nas poses a pele aparecia por buracos na calça e na manga.

### Animações (Universal Animation Library)

Os clipes vêm da **Universal Animation Library [Standard]** (Quaternius, CC0, esqueleto de 65 ossos estilo Unreal, em T-pose como o GoE) e são **retargetados** para o rig do GoE por `tools/goe/anim/retarget.py`, rodado no `.blend` de cada gênero (`blender -b Male_Basemesh_*.blend --factory-startup --python tools/goe/anim/retarget.py -- --ual UAL1_Standard.glb --out <pasta> --clips idle=Idle_Loop,walk=Walk_Formal_Loop,...`; sem `--clips` usa o `DEFAULT_CLIPS` do script; não salva o `.blend`). Cada quadro vira pose nos **controles FK** do GoE (bacia: rotação e posição escalada pelas pernas; coluna, pescoço, cabeça, pernas, pés: rotação desde o repouso; braços e mãos: direção do osso, porque o repouso do GoE tem o cotovelo dobrado), depois um ajuste de chão deixa a sola mais baixa em z = 0. O rig calcula os ossos de deformação (torção e esticamento inclusos) e o exporter amostra cada quadro. `tools/goe/anim/clips_to_json.py <pasta> apps/web/public/assets/goe/clips` converte para `clips-male.json` / `clips-female.json` (por osso, `quadros × [x,y,z,qx,qy,qz,qw]` local no pai FK, como as poses; `stride` = metros por ciclo nos clipes de locomoção).

Clipes usados (conjunto "social modesto", para jogo de interação): `idle` (Idle_Loop), `walk` (Walk_Formal_Loop, caminhada discreta), `sit` (Sitting_Idle_Loop), `sitTalk` (Sitting_Talking_Loop, sentado conversando), `talk` (Idle_Talking_Loop), `interact` (Interact, aceno) e `dance` (Dance_Loop, emote). O restante da biblioteca (43 clipes, incluindo `Jog_Fwd_Loop`/`Sprint_Loop`) pode ser adicionado na lista `--clips`.

No cliente, `goe-clips.ts` (`ClipPlayer`) amostra e mistura os clipes (crossfade de 0,25 s) e entrega a pose a `setPosePreset` do corpo e das peças. A locomoção avança **pela distância andada** (`stride`), então o pé não patina, com a cadência limitada a 1,6× a do clipe (`MAX_PACE`: o `walk`, de ~1 m/s, a 1,5 m/s viraria passada apressada). `avatars.ts` escolhe `idle`/`walk` pela velocidade exibida (parado abaixo de 0,3 m/s; sem corrida), `sit`/`dance` pelas ações e `wave` toca `interact`. `talk`/`sitTalk` ficam disponíveis na biblioteca (ainda sem gatilho no cliente). **A UAL não tem animação facial**: nos clipes `talk`/`sitTalk` a boca é procedural — `avatars.ts` (`talkJaw`) abre a mandíbula (`jawbone.x`) com senoides fora de fase (~4,6/2,3 Hz, até ~9°) por cima da pose, e `avatar-model.ts` (`setJaw`) aplica a rotação. Poses estáticas têm prioridade sobre os clipes. Sem a biblioteca carregada o avatar cai na pose procedural. O vestiário toca `idle` com o avatar parado.

### Diagnóstico (parâmetros de URL)

- `?animMenu=1` — abre o menu de teste das animações (ver `AnimationMenu.tsx`): toca cada clipe do GoE no avatar local. Também aparece sozinho no modo de desenvolvimento (`import.meta.env.DEV`).
- `?testAvatarPosePreset=pose03` — aplica uma pose exportada (ex.: `pose03`).
- `?testAvatarClip=<nome>` — toca um clipe embutido do GLB.
- `?testAvatarPose=0` — deixa o modelo em repouso (sem pose procedural).
- `?testAvatarDecal=<slot>:<categoria>/<imagem>` — força um decalque no avatar local (repita o parâmetro para vários slots).
- `?testDecalAnchor=<slot>,<px>,<py>,<pz>,<rx>,<ry>,<rz>,<size>` — sobrepõe uma âncora de decalque, para calibrar posição/rotação/tamanho ao vivo (repita uma por slot).
