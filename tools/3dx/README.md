# tools/3dx — pipeline dos assets nativos do 3DXChat

Pipeline versionado que extrai malha + esqueleto (+ animação) do cliente 3DXChat
instalado e exporta GLB para o jogo. Antes vivia em `%TEMP%`; este é o lar dele.

Plano e regras fixas: `docs/roadmap/migracao-3dxchat-exportado.md` (seção 2) e
`docs/guides/3dx-nativo.md`. **Não redescobrir a matemática** — ela está em
`lib3dx.py` e é copiada do piloto.

## Pré-requisitos

> **Caminhos locais:** os projetos-fonte 3DX foram migrados do disco `C:` para `E:`. Os exemplos
> abaixo usam `E:\dev\...`; se a fonte estiver em outro lugar, ajuste o caminho ou use
> `$THREEDX_PROJECT`.

- Python **3.11** com `PyYAML` e, só para o caminho legado de bundle, `UnityPy==1.25.4`:
  `py -3.11 -m pip install -r tools/3dx/requirements.txt`
- Blender **5.2** (caminho padrão `C:\Program Files\Blender Foundation\Blender 5.2` ou `$BLENDER`)
- Fontes (ver `docs/decisions/0017-fonte-projeto-exportado-3dx.md`):
  - **Única fonte de malha:** projeto Unity exportado em `E:\dev\exported\ExportedProject`
    (YAML + PNG, lido por `project_env.py`; sem UnityPy).
  - **Contrato de esqueleto:** `tools/3dx/rigs/3dx_male.json` e `3dx_female.json` congelam a
    ordem/rest pose (322/464 ossos) do corpo já publicado. As roupas são retargetadas para esse
    contrato com `--skeleton-json`; nenhum asset bundle é necessário.

## Estado e próximo passo

A fonte padrão é o **projeto Unity exportado**. `project_env.py` lê YAML, GUID, prefab, malha
(`m_VertexData`/`m_Skin`/`m_BindPose`) e clipe; `import_anim_project.py` importa qualquer `.anim`.
Em 2026-10-19 os dois avatares publicados foram regerados por esse caminho (corpo + idle + walk +
pose01 + pair01) e validados com `verify_glb.py --rest` (`maxdisp=0`) e render.

O que ainda falta:

- O leitor nativo `tools/3dx/project/` (o adaptador é a ponte e não será descartado).
- Reexportar **cabelos** pelo projeto (as roupas já saem só de
  `Resources/{man,woman}/cloth/*.prefab`).
- Migrar o corpo para o rig nativo do projeto (P3): hoje o contrato de 322/464 ossos é mantido
  por `tools/3dx/rigs/`, porque é a ordem que os GLBs publicados usam (`sameBoneLayout`).
- O gate de paridade de malha: as contagens do projeto divergem do bundle (6 332 × 6 336 no
  `man_body`, 7 905 × 9 580 no `woman_body`), aceito na regeração de 2026-10-19.

O contrato de saída continua sendo o **JSON atual**; `export_glb.py`, `verify_glb.py`,
`skin_export.py` e `render_check.py` não mudam. O caminho por bundle (`extract_character.py` +
UnityPy) fica como **legado/fallback** e não é necessário para roupas.

Desde 2026-10-20 o corpo e as roupas publicados levam as **texturas nativas**: albedo e normal map
lidos dos materiais do projeto (PNG lossless na resolução original, embutido byte a byte no GLB) e
`--tangents`. O caminho é `extract_body_textures_project.py` (corpo/cabeça/cílios) e o próprio
`export_clothes_project.py` (peças), ambos via `project_textures.py`.

## Fluxo

```
extract_character.py  ->  JSON  ->  export_glb.py (Blender)  ->  GLB
                                   skin_export.py / verify_glb.py  (validação)
                                   render_check.py                 (olho)
```

### 1. Extrair (Python 3.11)

A fonte padrão é o **projeto exportado**. O adaptador `project_env.py` decodifica o YAML com a
mesma API que o pipeline usava do UnityPy (`lib3dx.load_env`/`extract_mesh` já roteiam `.prefab` e
`Node`), então o contrato JSON e o `export_glb.py` não mudam. O esqueleto vem do contrato congelado
em `tools/3dx/rigs/3dx_{male,female}.json` (`--skeleton-json`): é a ordem que o corpo publicado usa
(`sameBoneLayout`), sem depender de bundle.

Corpo + cabeça (+ anatomia no masculino), tudo do projeto:

```powershell
py -3.11 tools/3dx/extract_character.py `
  --source "E:\dev\exported\ExportedProject\Assets\Resources\man\man.prefab" `
  --skeleton-json tools/3dx/rigs/3dx_male.json `
  --mesh man_body man_head man_eyelashes man_penis --gender male `
  --out tools/3dx/build/project/body_male.json
```

Feminino: `Resources\woman\woman.prefab`, `tools/3dx/rigs/3dx_female.json`, meshes
`woman_body woman_head woman_eyelashes`. O extrator imprime `bone remap N -> ok`; a malha é
decodificada de `m_VertexData` (streams alinhados a 16 bytes) e remapeada para o esqueleto por
bindpose.

#### Texturas do corpo (pele, rosto, cílios e anatomia)

Os materiais do prefab apontam para os PNGs em `Assets/Texture2D` por GUID. O extrator copia cada
mapa na resolução nativa, sem recodificar, e escreve o JSON de materiais que o `export_glb.py`
consome:

```powershell
py -3.11 tools/3dx/extract_body_textures_project.py --outdir tools/3dx/build/project
```

Saída por gênero: `body_<g>_diffuse.png` (2048²), `body_<g>_normal.png` (2048²),
`head_<g>_diffuse.png` (2048×1024 no masculino, 1024×512 no feminino), `head_<g>_normal.png`,
`eyelashes_<g>.png` (RGB preto + alfa pela luminância), `jaw_eyes_atlas_diffuse.png` (olhos + boca)
e `body_<g>_materials.json`. A anatomia masculina usa o **mesmo** material do corpo (as UVs de
`man_penis` caem no atlas do corpo), então não há textura duplicada.

- **Olhos:** a malha é `{man,woman}_jaw_eyes_atlas` (globo ocular + interior da boca) e entra no
  GLB como quinta/quarta malha, presa 100% ao osso `Head` (`rigidBone`): os pesos autorais vêm do
  bindpose do nó e o remap por bindpose os mandava para os pés. A malha masculina é autorada no
  espaço do nó (`m_LocalPosition`), então o extrator aplica o TRS do renderer nela.
- O shader `Charecters_Eye` desenha a íris/pupila por cima do atlas (`_PupilColor` + cor dos olhos
  do editor); como ele não é exportável, o `paint_iris` assa a íris em **tons de cinza** (pupila,
  íris, brilho). O jogo multiplica pela cor escolhida (`EyeTintPlugin`), então a esclera fica branca
  e a íris aceita qualquer hex do color picker.

- `_BumpMap` do projeto **é** normal map de espaço tangente (azul ≈ 254) — diferente do bump em
  escala de cinza do caminho por bundle, que não deve ser usado.
- `--webp` grava WebP lossless (≈40–60% do PNG, mesmos pixels). O Blender embute o arquivo
  original e o material passa a usar `EXT_texture_webp` **sem fallback** — só use se todo cliente
  que lê o GLB souber decodificar WebP. O padrão é PNG, embutido byte a byte sem reencode.
- `_Pubes`/`_Nipples`/`_EyesMakeup`/`_Beard` são camadas de customização (decals do shader 3DX), não
  entram no atlas base.

Cada clipe vira um JSON próprio, com os `bones` do corpo (mesma ordem) e o `world` do projeto:

```powershell
py -3.11 tools/3dx/import_anim_project.py --gender male `
  --bones-json tools/3dx/build/project/body_male.json `
  --anim "E:\dev\exported\ExportedProject\Assets\AnimationClip\stay_pose_1.anim" `
  --from-prefab --out tools/3dx/build/project/male_idle_pf.json
```

- `--from-prefab` usa o clipe que o componente `Animation` do prefab referencia. É o modo do
  idle/walk/pose e o que preserva o publicado: `stay_pose_1.anim` tem 41 quadros, mas o clipe do
  prefab (`stay_pose_1_0.anim`) tem 201, e é esse que o GLB publicado usa.
- Sem `--from-prefab` o script fixa o clipe do **arquivo** passado (não o homônimo do prefab). É o
  modo do par, que não existe no prefab.
- O nome do arquivo é o do **parceiro**: `slowdance_woman.anim` anima os paths `man ...` (rig
  masculino) e `slowdance_man.anim` anima `woman ...` (rig feminino). Identifique o rig pelo
  prefixo do path, nunca pelo nome do arquivo.
- Clipes: idle `stay_pose_1`, walk `walk`, pose01 `stay_pose_2`, pair01 `slowdance_woman`
  (masculino) / `slowdance_man` (feminino), pair02 `slowdance_kiss_woman` /
  `slowdance_kiss_man`, pair03 `slowdance_invert_woman` / `slowdance_invert_man`.

O walk masculino passa por `damp_walk_sway.py` antes do export (o nativo balança a cabeça 14,65 cm;
o feminino ~3,4 cm e não é dampado):

```powershell
py -3.11 tools/3dx/damp_walk_sway.py `
  --json tools/3dx/build/project/male_walk_pf.json `
  --out tools/3dx/build/project/male_walk_pf_sway.json `
  --bones man_Spine1 man_Spine2 man_Neck man_Head --factor 0.25
```

O `par` M/F está na seção abaixo. O caminho antigo por `resources.assets` + bundle continua no
histórico do git e só é usado como fallback.

Par pela **nova forma** (projeto exportado): cada lado sai do `.anim` do projeto
e roda no corpo do **próprio** gênero, sem retarget cross-gender. O importador é
reutilizável:

```powershell
py -3.11 tools/3dx/import_anim_project.py --gender male `
  --bones-json tools/3dx/build/character_male_idle.json `
  --anim "E:\dev\exported\ExportedProject\Assets\AnimationClip\slowdance_woman.anim" `
  --out tools/3dx/build/character_male_pair.json
# feminino: --gender female, --bones-json ...character_female_idle.json,
#           --anim ...\slowdance_man.anim, --out ...character_female_pair.json
```

Depois entra no corpo igual a qualquer clipe: `--extra-anim <json> pair01`.

Os pares `pair02` (`slowdance_kiss`), `pair03` (`slowdance_invert`) e as variantes
`pair04`/`pair06`/`pair07`/`pair08`/`pair09` seguem o mesmo importador, 111 quadros cada,
e são exportados junto com `pair01` nos corpos publicados. As variantes foram verificadas com
`render_pair.py`: `pair04` é a dança de frente II, `pair06` a dança por trás, `pair07` o beijo,
`pair08` o beijo no pescoço e `pair09` a dança invertida II.

#### Pares em lote a partir do projeto exportado

A fonte é sempre `E:\dev\exported\ExportedProject`; não há mais caminho de bundle nesta etapa. O
manifesto `tools/3dx/pairs.json` diz, por par, a composição (`mf` ou `ff`), a action, o `gap` e o
`yaw` (0 = os dois no mesmo sentido, 180 = um de frente para o outro). Cada participante aponta para
o `.anim` do projeto e para o rig em que ele foi autorado (`man` ou `woman`).

```powershell
py -3.11 tools/3dx/import_pairs.py       # assa cada metade no esqueleto do corpo
py -3.11 tools/3dx/export_pair_tests.py  # gera GLBs de teste + pairs.test.json
```

O campo `rig` é o que permite montar F/F sem retarget manual: uma metade feminina usa o clipe
autorado para o rig masculino e a outra usa o clipe autorado para o rig feminino; o importador casa
os nomes (`man_*`/`woman_*`) no corpo feminino. Os GLBs de teste ficam em
`apps/web/public/assets/3dx/test/` e a página `/viewer-pair-test.html` os carrega pelo catálogo
`pairs.test.json` (M/F usa masculino + feminino; F/F usa duas cópias do corpo feminino). Para o
próximo par: inclua a entrada no manifesto, rode os dois comandos e recarregue a página; não é
preciso editar o HTML.

Pilotos atuais:

- `mf_slowdance` — `slowdance_woman.anim` + `slowdance_man.anim` (M/F), 111 quadros @ 30 fps,
  `gap` 0,25 m, `yaw` 180; usa `publish: false` porque é o controle do `pair01` já publicado.
- `mf_slowdance_b` / `mf_slowdance_c` — variantes `slowdance_man1/woman1` e `slowdance_man2/woman2`;
  actions `pair04`/`pair06`, publicadas nos dois corpos.
- `mf_kiss_b` / `mf_kiss_c` — `slowdance_kiss_man1/woman1` e `slowdance_kiss_man2/woman2`;
  actions `pair07`/`pair08`, publicadas nos dois corpos.
- `mf_invert_b` — `slowdance_invert_man1/woman1`; action `pair09`, publicada nos dois corpos.
- `ff_kiss` — `slowdance_kiss_woman.anim` + `slowdance_kiss_man.anim` (F/F), 111 quadros @ 30 fps,
  `gap` 0,25 m, `yaw` 180; actions `pair05_a`/`pair05_b` (um lado em cada corpo), `publish: false`.

Quando o par for aprovado, `tools/3dx/export_bodies.py` reconstrói `character_male.glb` e
`character_female.glb` com as actions publicáveis do manifesto (entradas com `publish: false` são
ignoradas). Esse passo aumenta o tamanho dos corpos publicados; os comandos de teste acima não tocam
neles.

Para comparar com os pares publicados, a página `apps/web/public/viewer-pair.html` carrega
`character_male.glb`/`character_female.glb` com a colocação do jogo
(`pnpm --filter @3dx/web dev`, abrir `/viewer-pair.html`). Ela lista os clipes que existem nos dois
gêneros (`idle`, `walk`, `pose01`, `pair01`..`pair04`, `pair06`..`pair17`) e tem slider de quadro, de
distância e troca de quem inicia. Os pares ainda em teste ficam em `/viewer-pair-test.html`, lendo
`test/pairs.test.json`.

#### Pares de móvel (sofá/cadeira/cama) e de parede

`pair10`..`pair37` são clipes de **penetração** M/F das bundles `ai_*`/`midnight_*` em `mf/sofa`,
`mf/chair`, `mf/bed` e `mf/wall`. O manifesto `tools/3dx/seated-pairs.json` (versão 2,
`mode: "motion"`) aponta bundle e JSON de saída de cada lado; `PAIR_POSES` só mapeia ação/lado e a
âncora exigida (`sofa-1`..`sofa-8`, `chair-1`..`chair-7`, `bed-1`..`bed-8`, `wall-1`..`wall-5`).

| Action   | Bundles (M / F)                                                         | Âncora  | Inserção     |
| -------- | ----------------------------------------------------------------------- | ------- | ------------ |
| `pair10` | `man@sofa_106` / `woman@sofa_106`                                       | sofá    | vaginal 90%  |
| `pair11` | `man@sofa_103` / `woman@sofa_103`                                       | sofá    | anal 62%     |
| `pair12` | `man@sofa_107` / `woman@sofa_107`                                       | sofá    | anal 64%     |
| `pair13` | `man@ai_chair_mf_rideoncock1` / `woman@ai_chair_mf_rideoncock2`         | cadeira | vaginal 33%  |
| `pair14` | `man@chair_25` / `woman@chair_25`                                       | cadeira | anal 40%     |
| `pair15` | `man@midnight_lucky_mf_bed_a_1_1` / `woman@midnight_lucky_mf_bed_a_1_2` | cama    | anal 87%     |
| `pair16` | `man@ai_bed_mfdoggy1` / `woman@ai_bed_mfdoggy2`                         | cama    | anal 59%     |
| `pair17` | `man@midnight_lucky_mf_bed_v_5_1` / `woman@midnight_lucky_mf_bed_v_5_2` | cama    | vaginal 37%  |
| `pair18` | `man@sofa_114` / `woman@sofa_114`                                       | sofá    | anal 78%     |
| `pair19` | `man@sofa_341` / `woman@sofa_342`                                       | sofá    | vaginal 58%  |
| `pair20` | `man@sofa_351` / `woman@sofa_352`                                       | sofá    | anal 44%     |
| `pair21` | `man@sofa_321` / `woman@sofa_322`                                       | sofá    | vaginal 42%  |
| `pair22` | `man@sofa_113` / `woman@sofa_113`                                       | sofá    | pênis 30%    |
| `pair23` | `man@ai_chair_51` / `woman@ai_chair_52`                                 | cadeira | vaginal 100% |
| `pair24` | `man@ai_chair_41` / `woman@ai_chair_42`                                 | cadeira | anal 100%    |
| `pair25` | `man@ai_chair_71` / `woman@ai_chair_72`                                 | cadeira | vaginal 33%  |
| `pair26` | `man@ai_chair_81` / `woman@ai_chair_82`                                 | cadeira | vaginal 33%  |
| `pair27` | `man@chair_24` / `woman@chair_24`                                       | cadeira | vaginal 44%  |
| `pair28` | `man@midnight_ai_n_lucky_mf_bed_v_3_1` / `..._v_3_2`                    | cama    | vaginal 56%  |
| `pair29` | `man@midnight_lucky_mf_bed_v_6_1` / `..._v_6_2`                         | cama    | vaginal 64%  |
| `pair30` | `man@midnight_lucky_mf_bed_a_2_1` / `..._a_2_2`                         | cama    | anal 33%     |
| `pair31` | `man@ai_bed72_1` / `woman@ai_bed72_2`                                   | cama    | anal 43%     |
| `pair32` | `man@ai_lotusmfv1` / `woman@ai_lotusmfv2`                               | cama    | vaginal 31%  |
| `pair33` | `man@midnight_lucky_mf_wall_v_2_1` / `..._v_2_2`                        | parede  | vaginal 43%  |
| `pair34` | `man@wall_141` / `woman@wall_142`                                       | parede  | vaginal 59%  |
| `pair35` | `man@wall_26` / `woman@wall_26`                                         | parede  | vaginal 68%  |
| `pair36` | `man@wall_25` / `woman@wall_25`                                         | parede  | vaginal 64%  |
| `pair37` | `man@wall_151` / `woman@wall_152`                                       | parede  | anal 38%     |

"Inserção" é a fração dos quadros em que `min(dist(Gen Pussy|Gen Ass, pen_1..pen_3))` fica abaixo
de 1,5 cm, por frame, no espaço do bundle depois do import; no restante a outra cadeia fica a
≥ 1,8 cm, então o orifício medido é o certo. `pen_3_end` é marcador ~9 cm além da glande e ficaria
fora da conta. Os pares `pair18`..`pair37` foram escolhidos medindo vários candidatos por móvel:
ficaram os de mediana ≤ 2,5 cm (mesma faixa de `pair10`..`pair17`) e, nos de parede, também os de
altura de piso correta (pelve perto da faixa de pé, sem corpo abaixo do chão).

```powershell
py -3.11 tools/3dx/import_seated_pairs.py   # toca cada clipe no prefab (skeleton_env + position_curves)
py -3.11 tools/3dx/export_bodies.py         # inclui pair10..pair37 nos dois corpos
```

O importador usa `THREEDX_BUNDLES` (padrão: `E:\dev\New folder\Mv444R\AssetBundles\animation`).
Para regenerar só um par: `--pair sofa1`. O `seat` aceita `sofa`, `chair`, `bed` e `wall`.

##### Encaixe dos móveis (pivô compartilhado)

O jogo ancora **os dois corpos no mesmo pivô**: em `propaction.cs` (Assembly-UnityScript), ao
usar um móvel, `playerSlot2.obj.transform.position = gameObject2.transform.position` e
`posepivot.position/rotation = transform.position/rotation`; e, ao iniciar um par,
`playerSlot2.posepivot.position/rotation = playerSlot3.posepivot`. As duas metades do clipe foram
autoradas nesse espaço (`* bone POSE PIVOT` = origem), então **a relação entre os corpos —
inclusive o contato — está no clipe**, não no servidor. Nos móveis inspecionados `animDY = 0`,
`poselist.pivot[]` está vazio e `rootTransform` é nulo, então o pivô é a própria raiz do móvel.

O importador preserva isso: o clipe carrega o deslocamento autoral do corpo em relação ao pivô e
não reancora o XZ nem normaliza a guinada por lado. No jogo os dois avatares vão para o `Seat.pivot`
com `heading = heading do assento` — os clipes mantêm a orientação nativa do prefab, então os pares
não têm `offset`, `yaw` nem `seatOffset`. A exceção é `sofa-2` (`sofa_103`), que se estende
ao longo do sofá: `facing: -90` com `facingTowardCenter` (ver `pairFacing` em `game-core`).

**Cadeira.** Os clipes de `mf/chair` vieram com o referencial girado 90° em relação à âncora do
assento: medindo a bacia (eixo quadril/ombro) no GLB, ela fica a ±90° da frente do assento, enquanto
sofá e cama ficam a 0°. Sem correção o par senta **atravessado** na cadeira, com o encosto no lado do
corpo. Por isso **todos** os sete pares de cadeira (`chair-1`..`chair-7`) usam `facing: 90`. A cama
não recebeu giro: as medidas variam com a pose (deitada/de bruços), então a orientação ali é
conferida visualmente por par, não por regra.

##### Parede

Pares de parede usam âncoras `kind: 'wall'` no layout — **não são assentos**: `nearestFreeSeat`
as ignora (ninguém "senta" na parede), e o servidor aceita o par quando o iniciador está a até
`WALL_REACH` (1,8 m) de uma delas (`isOnAnchor`). No estúdio há quatro âncoras, uma por parede,
com o `heading` apontando **para** a parede. O clipe (`mf/wall`) foi autorado com os dois corpos de
costas para o +Z local (mulher na frente, homem atrás), então os pares `wall-*` usam
`facing: 180`: isso vira o par para encarar a parede, com a mulher apoiada nela e o homem do lado
da sala. Sem esse giro o par fica de frente para a sala e o corpo da mulher atravessa a parede.
Os dois avatares ficam no ponto da âncora. As outras salas ainda não têm âncoras de parede; por
isso os pares `wall-*` só aparecem no estúdio (`RoomPanel`).

Pivôs: os 12 módulos da balada usam o plano da raiz guardada em `clubSofas.anchor` (mesma
profundidade da raiz, no lugar do assento); o sofá e a cadeira do quarto usam a raiz do
`Sofa_01` `(2,215, 0,66)` e do `Chair_Tolix` `(1,927, −2,592)`; a cama usa a própria raiz
`(0,03, −3,762)`. O ponto do quadril (`SOFA_HIP_FORWARD = 0,175` a partir da raiz) continua
valendo para sentar sozinho.

Altura: os clipes foram autorados para esqueletos iguais, então durante um par os dois corpos
usam uma **escala comum** (média das alturas configuradas) — sem isso, jogadores de alturas
diferentes desalinham o encaixe. Fora do par cada um volta à sua altura.

**Como a inserção foi obtida.** As poses antigas `sofa1–3`, `chair_1/16` e `bed1–3`
(`man@sofaN`, `man@bedN`) eram só contato: a haste nunca entrava no orifício. O jogo base não move
o corpo no runtime (`coupleDance.cs` põe os dois no mesmo pivô; `propaction.cs` só soma o `animDY`
do móvel), então a inserção tem que vir do clipe. Os clipes `ai_*`/`midnight_*` guardam só curvas,
sem esqueleto próprio: o jogo as toca no prefab `man`/`woman` (`Resources/man/man.prefab`). O
importador faz o mesmo (`skeleton_env`), aplica as curvas de posição (`position_curves`) e
reparenta as raízes `pen_1`/`pen_balls` sob a pelve do prefab, com o delta de mundo das raízes.
A raiz `man_bone_Pelvis` casa com o osso de controle `man Pelvis` (alias de raiz, não de filho):
o prefab anima o controle, não o osso de deformação, e sem esse alias a pelve ficava na altura de
pé enquanto o resto do corpo descia — a cintura/glúteo esticavam até a posição de pé.
Nada disso existe no runtime: o GLB já sai com o movimento pronto.

O assento da cama no quarto tem `kind: 'bed'` e `reach: 1.9` — o pivô fica no centro do colchão
e a colisão do móvel impede chegar a menos de ~1,5 m dele.

#### Pares do mesmo gênero (F/F e M/M)

As bundles nativas também trazem pares com as **duas metades autoradas para o mesmo corpo**:
`ff/*` (feminino) e `mm/*` (masculino), tanto sociais (`*/rel`: abraço, beijo, dança) quanto de
móvel (`*/sofa`, `*/bed`, `*/chair`, `*/wall`). Como as duas metades tocam no mesmo corpo, cada
lado precisa de uma action própria — não dá para usar o mesmo nome nos dois avatares como nos
pares M/F.

O manifesto `tools/3dx/same-gender-pairs.json` declara, por lado, o `gender` do corpo e a
`action` publicada:

```json
"ff_hug": {
  "action": "ff_hug",
  "pairing": "ff",
  "mode": "motion",
  "sides": {
    "a": { "gender": "female", "action": "ff_hug_a", "bundle": "ff/rel/woman@cuddle_woman1", "out": "..." },
    "b": { "gender": "female", "action": "ff_hug_b", "bundle": "ff/rel/woman@cuddle_woman2", "out": "..." }
  }
}
```

```powershell
py -3.11 tools/3dx/import_seated_pairs.py --manifest tools/3dx/same-gender-pairs.json
py -3.11 tools/3dx/export_bodies.py   # F/F entra só no corpo feminino; M/M, só no masculino
```

Na primeira leva: `ff_hug`/`ff_kiss` (`ff/rel`), `ff_sofa_1` (`ai_n_sofa_ff_mutualmast1/2`),
`ff_bed_1` (`midnight_lucky_ff_bed_v_5_1/2`), `mm_hug`/`mm_kiss` (`mm/rel`), `mm_sofa_1`
(`ai_sofa_13_man1/2`) e `mm_bed_1` (`ai_bed_mmdoggy1/2`).

Medindo a bacia dos dois lados no JSON importado, as metades **já vêm separadas dentro do clipe**
(abraço ~0,65–0,88 m entre os corpos; beijo ~0,16–0,21 m; nos móveis, os dois no pivô). Por isso
`PAIR_POSES` usa `offset` 0 / `yaw` 0 e os dois avatares ficam no mesmo ponto do mundo — igual aos
pares M/F de móvel. Os de sofá mantêm `facing: 180` (viram para o encosto) e os de cama, `facing`
0, como os equivalentes M/F.

No jogo, `PAIR_POSES[type].pairing` (`'mf'` por padrão, `'ff'` ou `'mm'`) restringe quem pode
pedir o par: o servidor calcula a composição dos dois corpos (`coupleComposition`) e recusa se não
bater (`pairAccepts`), e o menu do jogador (`RoomPanel`) só lista os pares válidos para aquele
casal. O cliente compartilha altura e relógio do clipe entre as metades ignorando o sufixo `_a`/`_b`
(`pairKey` em `avatars.ts`).

#### Pair Tuner (ajuste no móvel)

Para inspecionar o encaixe no sofá/cadeira sem editar código e recarregar o jogo:

```powershell
pnpm --filter @3dx/web dev
# abrir http://localhost:5173/pair-tuner.html
```

A página carrega o quarto/balada, os dois corpos e o clipe escolhido. Os controles ajustam
`seatOffset`, `facing`, offset/yaw do parceiro e o assento; o painel mostra as distâncias ao
encosto/frente em centímetros. Esses valores são só de teste local (os pares publicados usam 0):
servem para medir um móvel novo antes de decidir o pivô. **Copiar JSON** gera o bloco com os
valores para colar na conversa; **Copiar link** guarda a cena no URL.

##### Editor manual de posição (menu + tela)

Para ajustar à mão onde o casal fica em cada móvel:

1. `pnpm --filter @3dx/web dev` e abra `http://localhost:5173/pair-tuner.html`.
2. Escolha a **sala**, **quem inicia** e o **móvel** (Sofá/Cadeira/Cama/Parede); a lista mostra os
   pares daquele móvel. Um ponto amarelo marca os pares já ajustados.
3. Mexa no casal: **arraste com o botão esquerdo** (o par desliza no chão do móvel) ou use os campos
   `Par ↔`, `Par ↕`, `Giro do par`, `Altura do par` e, para o parceiro, `Parceiro ↔`, `Parceiro ↕`
   e `Giro do parceiro`. Os botões `−10/−1/+1/+10`, `−90/−15/+15/+90` e `Inverter par 180°` (gira o
   par, não a câmera) aceleram o ajuste; `Aplicar giro ao móvel` replica o giro nos outros pares do
   mesmo móvel.
   **Câmera**: `Frente`/`Atrás` ficam no eixo do assento e `Lado esq.`/`Lado dir.` perpendiculares a
   ele — é a vista para conferir o encaixe nas laterais. `◀ 15°`/`15° ▶` afinam o ângulo, a roda
   aproxima e o **botão do meio** (ou o direito) gira a câmera em qualquer momento. A opção
   `Girar câmera` faz o botão esquerdo orbitar em vez de mover o par; `Esconder a sala` deixa só o
   casal, a caixa do móvel e a grade, para ver de lado sem a decoração na frente.
4. Cada mudança é salva no navegador (`localStorage`, chave `3dx-pair-tuner-drafts-v1`), então dá
   para pular entre pares sem perder nada. `Voltar ao código` apaga o ajuste do par atual;
   `Limpar ajustes` apaga todos.
5. No fim, **Copiar ajustes** gera o JSON com os pares mexidos:

```json
{
  "pairs": {
    "chair-3": {
      "facing": 90,
      "seatOffset": [-0.05, 0.12],
      "lift": 0.03,
      "male": { "offset": [0, 0], "yaw": 0 },
      "female": { "offset": [0, 0], "yaw": 0 }
    }
  }
}
```

Esses são exatamente os campos de `PAIR_POSES` (`facing`, `seatOffset`, `lift`, `offset`/`yaw` por
`byInitiator`), então o ajuste entra no código sem conversão: `facing` em graus, distâncias em
metros, `lift` em metros (o cliente soma ao piso do avatar via `pairLift`).

O **nome do arquivo é o do parceiro**: `slowdance_woman.anim` anima os paths
`man bone POSE PIVOT/...` (rig masculino) e `slowdance_man.anim` anima
`woman bone POSE PIVOT/...` (rig feminino). Sempre identifique o rig pelo prefixo
do path, nunca pelo nome do arquivo. O `.anim` não traz esqueleto: o `--prefab`
(padrão `Resources\{man,woman}\{man,woman}.prefab`) e o `--anim-root man|woman`
fornecem a árvore de transforms, e o `--bones-json` do mesmo gênero fixa a ordem
dos ossos (a mesma do corpo exportado). O ganho sobre o bundle é não precisar de
retarget entre gêneros: o par nativo já encaixa no offset 0,25 m / yaw 180°.

O clipe anima os **ossos de controle** (`man Pelvis`, `man Spine`, ...); os ossos
de deformação que não têm curva (mãos, pés, twist, face) herdam a **rotação local
de rest do pai**, não a rotação global de rest. Sem isso o membro translada mas
não gira no cotovelo/joelho/pulso e a pele colapsa. O casamento de nomes
duplicados também usa a posição/rotação de rest mais próxima do osso alvo, para
não casar com props estáticos do `POSE PIVOT`.

Animação de teste antiga (opcional, para comparar): `--anim
"...\animation\m\djpult\man@dj"` (feminino: `...\animation\f\djpult\woman@dj`).
Ela não é publicada; o corpo publicado leva o `idle` nativo.

Um bundle em que malha e esqueleto convivem não precisa de `--skeleton`:

```powershell
py -3.11 tools/3dx/extract_character.py --source <bundle> --mesh man_body --gender male --out <json>
```

#### Roupas (P5)

Cada peça é um `.prefab` em `Resources/{man,woman}/cloth`. O mesh LOD0 vem do
`m_Mesh` do `SkinnedMeshRenderer`; `--retarget` casa os ossos **por nome**
(`_1`/`_2`, dedos ausentes herdam o antebraço) e assa o vértice com
`refWorld[map(i)] * bindpose[i] * v` no rest pose do corpo. O rest pose de
referência é `tools/3dx/rigs/3dx_{gender}.json` (`--skeleton-json`), congelado a
partir do corpo publicado — nenhum bundle é lido.

```powershell
py -3.11 tools/3dx/extract_character.py `
  --source "E:\dev\exported\ExportedProject\Assets\Resources\man\cloth\shirt_1.prefab" `
  --skeleton-json tools/3dx/rigs/3dx_male.json `
  --mesh shirt_1 --gender male --retarget `
  --out tools/3dx/build/project/clothes/3dx_m_top_shirt.json
```

As variantes `_LOD1`/`_LOD2` ficam de fora porque `--mesh` usa o nome exato do
LOD0. Quando dois meshes têm o mesmo nome, o extrator imprime o `path_id`
escolhido; `--path-id` fixa outro.

Para regerar a coleção inteira (28 peças), use o lote versionado:

```powershell
py -3.11 tools/3dx/export_clothes_project.py
# só algumas peças, em staging:
py -3.11 tools/3dx/export_clothes_project.py --only 3dx_m_top_shirt --staging C:\Temp\clothes
```

O mesh correto vem do `m_Mesh.path_id` (nunca do “SMR com mais ossos”, que pega
LOD errado em `s_CropTop_ni`/`s_pantie_15_ni`).

Cada peça leva o material nativo: `_MainTex` (albedo) e `_BumpMap` (normal map) do projeto, em PNG
na resolução original, com `--tangents`. Peças sem `_MainTex` (a maioria — o tecido é tingido no
jogo) saem brancas **com normal map**, que é o que dá o relevo do pano. As texturas e os
`*_materials.json` ficam em `tools/3dx/build/project/clothes/textures/`.

O `TintPlugin` (`apps/web/src/game/characters/tint-plugin.ts`) recolore pela **luminância** da
textura, então o albedo branco continua recebendo `topColor`/`bottomColor` e as dobras/estampas
aparecem. Por isso o albedo nativo é embutido (não é tintado duas vezes): quem escolhe a cor é o
jogo.

As peças são exportadas com o **mesmo esqueleto/rest pose** do corpo. No jogo, o
`attachAvatarParts` troca o esqueleto clone da peça pelo esqueleto do corpo quando
`sameBoneLayout` confirma que a ordem dos ossos é idêntica (`avatar-parts.ts`).
No `viewer3dx.html` a troca é feita ao montar cada nó. Sem isso a peça fica no
rest pose enquanto o corpo toca o idle, e o corpo atravessa a roupa.

#### Encaixe na pele (`fit_cloth.py`)

O retarget deixa o pano a poucos milímetros da pele e, nas dobras (ombro, axila, busto, coxa), ele
afunda — o corpo atravessa a roupa. Antes de exportar, o lote roda o `fit_cloth.py` com o
`body_<gender>.json`:

1. afasta a peça `--base-offset` (6 mm) ao longo das normais;
2. copia o skinning do corpo no ponto mais próximo da superfície (interpolação baricêntrica do
   triângulo, top 4 ossos) — a peça passa a deformar junto com a pele, e não com o próprio bind;
3. empurra só o que ficou dentro ou a menos de `--clearance` (5 mm) da pele, difundindo com
   Gaussiana e espelhando em X (contato de um lado limpa o par: mamilos, gola).

O JSON encaixado é `build/project/clothes/<id>_fit.json` (o retarget cru fica ao lado para
diagnóstico). Sem isso, `verify_glb --rest` continua passando — o problema só aparece na pele

- `--no-fit` exporta o retarget cru; `--base-offset`/`--clearance` ajustam a folga (por padrão ela
  vem do slot: sobretudo 12/8 mm, topo e baixo 7/6 mm, roupa íntima 5/4 mm).
- `--fill-holes <cm²>` fecha vãos pequenos entre painéis (o sobretudo mostrava o fundo da sala nas
  costas: são frestas entre as peças da malha, não pele). O leque usa o centro do contorno e copia os
  pesos; hems, decotes e punhos (|x| grande ou área > 12 cm²) ficam abertos.
- Toda peça sai com `doubleSided: true`: o pano do 3DX é uma superfície de uma camada só e, na dobra
  do ombro/axila, a câmera vê o verso do tecido. Com backface culling o pedaço desaparece e a pele
  aparece como um "buraco" no casaco.
- Roupa íntima não é renderizada quando a região dela está coberta (`covers` no catálogo: sutiã =
  `top`, calcinha/cueca = `bottom`). O sutiã atravessava a blusa e aparecia como duas manchas no
  busto; sem a peça de cima ele continua aparecendo normalmente (`equippedPartIds`).

#### Acessórios (P6)

Chapéus são `SkinnedMeshRenderer` de 1 osso e usam o mesmo `--retarget` das
roupas. Óculos e máscaras são `MeshFilter`/`MeshRenderer` **rígidos**: o
`extract_accessory_project.py` assa a malha no espaço do corpo e atribui 100% do
peso ao osso `Head` (a translação da raiz do prefab é só offset de preview; usamos
rotação/escala e ancoramos na posição de rest da cabeça).

```powershell
# chapéu (skinned)
py -3.11 tools/3dx/extract_character.py `
  --source "E:\dev\exported\ExportedProject\Assets\Resources\man\cloth\hat_flat.prefab" `
  --skeleton-json tools/3dx/rigs/3dx_male.json `
  --mesh hat_flat --gender male --retarget `
  --out tools/3dx/build/project/accessories/3dx_m_hat_flat.json

# óculos/máscara (rígido)
py -3.11 tools/3dx/extract_accessory_project.py `
  --source "E:\dev\exported\ExportedProject\Assets\Resources\man\cloth\glasses_1.prefab" `
  --rig tools/3dx/rigs/3dx_male.json --gender male `
  --out tools/3dx/build/project/accessories/3dx_m_glasses_1.json

# lote: 5 chapéus + 5 óculos + 5 máscaras por gênero
py -3.11 tools/3dx/export_accessories_project.py
```

Os acessórios saem com o **material original do projeto**: albedo e normal maps em
resolução nativa, cor do `_Color`, roughness/glossiness, metallic e alpha. O lote
copia as texturas para `build/project/accessories/textures/`, gera um
`{id}.materials.json` por peça e exporta com `--materials ... --tangents`; o
`export_glb.py` aceita `metallic` no spec e no CLI. Eles não recebem `TintPlugin`
(a cor já vem do material). O lote aceita `--only` e `--staging`.

#### Tatuagens (P7)

As tatuagens são decalques 3DX (não passam pelo extrator de prefab): texturas em
`apps/web/public/assets/3dx/decals/14_tattoo_autoral/`, manifesto em
`3dx/decals/manifest.json` e projeção em `apps/web/src/game/characters/decals-3dx.ts`.
As âncoras por gênero usam os ossos `bN` do corpo 3DX e são calibradas contra o
GLB publicado; o teste `decals-3dx.test.ts` cobre os dois gêneros.

### 2. Exportar (Blender 5.2)

```powershell
python tools/3dx/run_blender.py export_glb.py -- `
  --json tools/3dx/build/project/body_male.json `
  --out apps/web/public/assets/3dx/character_male.glb `
  --materials tools/3dx/build/project/body_male_materials.json `
  --tangents `
  --extra-anim tools/3dx/build/project/male_idle_pf.json idle `
  --extra-anim tools/3dx/build/project/male_walk_pf_sway.json walk `
  --extra-anim tools/3dx/build/project/male_pose_pf.json pose01 `
  --extra-anim tools/3dx/build/project/male_pair.json pair01
```

Na prática use o lote (ele monta o comando com as seis actions base + os pares publicáveis do
`pairs.json` e já passa `--materials`/`--tangents`):

```powershell
py -3.11 tools/3dx/export_bodies.py                  # publica os dois corpos
py -3.11 tools/3dx/export_bodies.py --only female --skip-pairs   # só as actions base
py -3.11 tools/3dx/export_bodies.py --no-textures    # pele chapada (sem albedo/normal)
```

O corpo do projeto não tem `world`: **todos** os clipes entram por `--extra-anim`, inclusive o
`idle`. O feminino repete sem o damping do walk. `--anim-name` continua valendo quando o `world`
vem no `--json` (forma antiga); sem ele o nome vem de `animName`.

`--anim-name` nomeia o grupo de animação no GLB (o jogo procura `idle`); sem ele
o nome vem de `animName` no JSON. `--extra-anim <json> <nome>` (repetível) anexa
outros clipes ao **mesmo** GLB, desde que o esqueleto (rest/parent) seja idêntico
ao do `--json`. Cada clipe vira uma _action_ com o próprio intervalo de quadros;
o `export_glb.py` exporta todas com `export_animation_mode=ACTIONS` e
`export_anim_single_armature`. O `fps` do JSON é respeitado (todos os clipes
precisam ter o mesmo fps).

Opções de material (usadas nas roupas): `--color r,g,b` (padrão `0.78,0.6,0.48`,
pele) e `--roughness` (padrão `0.65`). As roupas saem **em branco**
(`--color 1,1,1`) porque o jogo recolore pelo `TintPlugin`:

```powershell
python tools/3dx/run_blender.py export_glb.py -- `
  --json tools/3dx/build/project/clothes/3dx_m_top_shirt.json `
  --out apps/web/public/assets/3dx/clothes/top/3dx_m_top_shirt.glb `
  --color 1,1,1 --roughness 0.8
```

#### Cabelos (Fase D, piloto)

O cabelo é uma peça skinnada no esqueleto do corpo. O bundle traz a malha, o
esqueleto completo e um **atlas de fios** (`_MainTex`) com alfa; o `--retarget`
casa os ossos por nome e assa a malha no rest pose do corpo (no `hair_15`
masculino todos os pesos caem em `man_bone_Head`; no `hair_30` feminino, cabeça +
clavículas + `Spine2`, por causa do comprimento).

O atlas é extraído para PNG e embutido no GLB. A textura é clara (grayscale) e
o jogo aplica `hairColor` por cima com `hairTint`; use
`--alpha-mode cutout` e `--double-sided` para os cards de cabelo.

O atlas masculino é o mesmo `hair_atlas_waves.png` do projeto; o normal map
`detailedWavesMapNM.png` foi injetado no GLB publicado sem reexportar a malha:

```powershell
py -3.11 tools/3dx/add_normal_texture.py `
  --glb apps/web/public/assets/3dx/hair/3dx_m_hair_15.glb `
  --normal "E:\dev\exported\ExportedProject\Assets\Texture2D\detailedWavesMapNM.png" `
  --out apps/web/public/assets/3dx/hair/3dx_m_hair_15.glb
```

```powershell
py -3.11 tools/3dx/extract_character.py `
  --source "E:\dev\exported\ExportedProject\Assets\Resources\man" `
  --skeleton "E:\dev\exported\ExportedProject\Assets\Resources\man\man.prefab" `
  --mesh hair_15_1 --gender male --retarget `
  --out tools/3dx/build/hair_male_15.json

py -3.11 tools/3dx/extract_texture.py `
  --source "E:\dev\exported\ExportedProject\Assets\Resources\man" `
  --material hair15 --out tools/3dx/build/hair_male_15.png

python tools/3dx/run_blender.py export_glb.py -- `
  --json tools/3dx/build/hair_male_15.json `
  --out apps/web/public/assets/3dx/hair/3dx_m_hair_15.glb `
  --texture tools/3dx/build/hair_male_15.png `
  --alpha-mode cutout --cutoff 0.3 --double-sided `
  --color 1,1,1 --roughness 0.75
```

Feminino: fonte `...\hair\female\hair_30`, `--mesh hair_37`, esqueleto
`...\wear\female\s_squipanties1cum`, `--material hair_diff_002_a_uni` e
`--cutoff 0.5`.

`--alpha-mode cutout` exporta `alphaMode: MASK`; `--double-sided` exporta
`doubleSided: true`. O `extract_texture.py` imprime o `_Mode`/`_Cutoff` do
material original para escolher os parâmetros.

#### Salas

A fonte padrão é o **projeto Unity exportado**: a sala é uma cena `.unity` e as
malhas/materiais/texturas resolvem por GUID (`.meta`), igual ao corpo. O
`extract_room_project.py` assa cada malha no espaço do mundo, agrupa por
material, descarta LOD1+ e extrai o albedo. O `export_room_glb.py` monta um GLB
estático (sem skin).

O quarto padrão (e closet) é a cena `scenes\char_editor_decor.unity` (cama,
sofá, mesa, armários e mezanino; raízes `ROOM`, `FURNITURE`, `FURNITURE DYNAMIC`,
`LIGHTS`):

```powershell
py -3.11 tools/3dx/extract_room_project.py `
  --scene "E:\dev\exported\ExportedProject\Assets\scenes\char_editor_decor.unity" `
  --name home `
  --out tools/3dx/build/project/home.json `
  --texdir tools/3dx/build/project/home_textures --max-texture 1024

python tools/3dx/run_blender.py export_room_glb.py -- `
  --json tools/3dx/build/project/home.json `
  --out apps/web/public/assets/3dx/rooms/home/home.glb
```

As texturas de sala são reduzidas para 1024 px (orçamento de cenário) e salvas em
JPEG; materiais com transparência (vidro/espelho) usam PNG + blend. O
`viewer-room.html` abre o GLB com vistas frente/lado/topo e wireframe; o
`viewer-closet.html` usa a sala como closet, com câmera fixa, focos (corpo
inteiro/rosto/perfil/tronco/braços/pernas/costas) e o avatar + painel de
customização.

Balada: a cena é `scenes\club.unity`, com `--roots LEVEL bar_1 dj_pult coctail1
coctail2 coctail3`. O passo do projeto descarta LOD1+ de fato (o caminho por
bundle empilhava os quatro LODs das garrafas) e o `collider_floor` **entra**:
apesar do nome, é o piso real (concreto + tile) e sem ele o salão ficava sem
chão.

A balada é o hall inicial do jogo e foi reimportada na melhor qualidade que a
fonte oferece: texturas em resolução nativa (sem o teto de 512 px), PNG
lossless, normal maps, mapas de emissão (neon, bar, letreiros e cortinas de luz)
e tangentes. O resultado fica em
`apps/web/public/assets/3dx/rooms/club7/club7.glb` (56 grupos, ~48 mil
triângulos, 56 materiais, 10,6 MB), aberto por `viewer-club.html`. A colisão do
jogo é gerada à parte a partir do `collider_level` (`packages/game-core/src/club-walls.ts`).

```powershell
py -3.11 tools/3dx/extract_room_project.py `
  --scene "E:\dev\exported\ExportedProject\Assets\scenes\club.unity" `
  --name club7 --out tools/3dx/build/project/club7.json `
  --texdir tools/3dx/build/project/club7_textures `
  --max-texture 0 --texture-format png `
  --roots LEVEL bar_1 dj_pult coctail1 coctail2 coctail3

python tools/3dx/run_blender.py export_room_glb.py -- `
  --json tools/3dx/build/project/club7.json `
  --out apps/web/public/assets/3dx/rooms/club7/club7.glb
```

`--max-texture 0` mantém a resolução original; `--texture-format png` grava
albedo, normal e emissão sem perda. O `export_room_glb.py` liga `_BumpMap` ao
nó Normal Map (com `_BumpScale`), `_EmissionMap`/`_EmissionColor` ao Emission e
exporta tangentes. Use `auto`/`1024` para salas comuns (orçamento menor).

O caminho por bundle (`extract_room.py` + `3DXChat_Data\level*`) fica como
**legado/fallback**.

## 3. Validar

```powershell
py -3.11 tools/3dx/skin_export.py --json tools/3dx/build/character_male.json --outdir "$env:TEMP\skin"
py -3.11 tools/3dx/verify_glb.py --glb apps/web/public/assets/3dx/character_male.glb --frame 80
py -3.11 tools/3dx/verify_glb.py --glb apps/web/public/assets/3dx/character_male.glb --anim walk --frame 15
python tools/3dx/run_blender.py render_check.py -- --glb apps/web/public/assets/3dx/character_male.glb --action walk --frames 0 9 18 27 --azimuth 90 --outdir "$env:TEMP\render"
```

Em repouso, `verify_glb.py` deve dar `maxdisp ≈ 0` (nas roupas, use `--rest`).
Com a animação, o deslocamento do GLB tem que bater com o `skin_export.py` no
mesmo quadro; `--anim <nome>` escolhe a action quando o GLB tem mais de uma
(`idle`/`walk`). `render_check.py --action` e `--azimuth` (0 = frente, 90 = lado)
ajudam a conferir o ciclo. Para ver as roupas sobre o corpo, importe corpo + peças
no mesmo Blender e troque o modificador `Armature` de cada peça para o armature do
corpo (o mesmo que `attachAvatarParts` faz em runtime). O script local
`render_outfit.py`, quando existe, automatiza essa troca; ele não é versionado.

## Arquivos

| Script                             | Papel                                                      |
| ---------------------------------- | ---------------------------------------------------------- |
| `lib3dx.py`                        | matemática (P, quaternions, matrizes) e leitura UnityPy    |
| `project_textures.py`              | materiais/texturas do projeto (normal, alfa, PNG lossless) |
| `extract_body_textures_project.py` | corpo/cabeça/cílios/anatomia → PNG + materiais JSON        |
| `extract_character.py`             | malha + esqueleto (+ animação) → JSON                      |
| `export_clothes_project.py`        | lote da coleção de roupas do projeto → GLBs publicados     |
| `extract_accessory_project.py`     | acessório rígido (óculos/máscara) → skin de 1 osso         |
| `export_accessories_project.py`    | lote de chapéus, óculos e máscaras → GLBs                  |
| `calibrate_decals_3dx.py`          | recalibra as âncoras de tatuagem 3DX (Blender)             |
| `damp_walk_sway.py`                | reduz a balançada lateral de um walk JSON                  |
| `extract_texture.py`               | `_MainTex` de um material do bundle → PNG                  |
| `extract_room_project.py`          | cena `.unity` do projeto → JSON da sala                    |
| `extract_room.py`                  | legado: cena `level*` (bundle) → JSON da sala              |
| `export_room_glb.py`               | JSON da sala → GLB estático                                |
| `export_glb.py`                    | JSON → GLB (rest ou com animação), roda no Blender         |
| `skin_export.py`                   | skinning de referência em Python puro                      |
| `add_normal_texture.py`            | injeta um normal map num GLB existente (cabelo)            |
| `verify_glb.py`                    | skinning independente direto do GLB                        |
| `render_check.py`                  | renderiza GLB ou OBJs, roda no Blender                     |
| `run_blender.py`                   | acha o Blender e roda um script                            |

## Convenções (não mudar)

- Malha em **Z-up**, rig em **Y-up**; a ponte é `P` (só nos ossos).
- Chavear por `path_id`, não por nome.
- No Blender: criar osso → **pai** → `length` → **`matrix` por último**.
- Gênero determina a fonte: `male` ↔ `man_*`, `female` ↔ `woman_*`.
- Saída em `apps/web/public/assets/3dx/`; JSON intermediário em `tools/3dx/build/`.
