# tools/3dx — pipeline dos assets nativos do 3DXChat

Pipeline versionado que extrai malha + esqueleto (+ animação) do cliente 3DXChat
instalado e exporta GLB para o jogo. Antes vivia em `%TEMP%`; este é o lar dele.

Plano e regras fixas: `docs/roadmap/migracao-3dxchat.md` (seção 2) e
`docs/guides/3dx-nativo.md`. **Não redescobrir a matemática** — ela está em
`lib3dx.py` e é copiada do piloto.

## Pré-requisitos

- Python **3.11** com `PyYAML` e, só para o caminho legado de bundle, `UnityPy==1.25.4`:
  `py -3.11 -m pip install -r tools/3dx/requirements.txt`
- Blender **5.2** (caminho padrão `C:\Program Files\Blender Foundation\Blender 5.2` ou `$BLENDER`)
- Fontes (ver `docs/decisions/0017-fonte-projeto-exportado-3dx.md`):
  - **Única fonte de malha:** projeto Unity exportado em `C:\dev\exported\ExportedProject`
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
  --source "C:\dev\exported\ExportedProject\Assets\Resources\man\man.prefab" `
  --skeleton-json tools/3dx/rigs/3dx_male.json `
  --mesh man_body man_head man_eyelashes man_penis --gender male `
  --out tools/3dx/build/project/body_male.json
```

Feminino: `Resources\woman\woman.prefab`, `tools/3dx/rigs/3dx_female.json`, meshes
`woman_body woman_head woman_eyelashes`. O extrator imprime `bone remap N -> ok`; a malha é
decodificada de `m_VertexData` (streams alinhados a 16 bytes) e remapeada para o esqueleto por
bindpose.

Cada clipe vira um JSON próprio, com os `bones` do corpo (mesma ordem) e o `world` do projeto:

```powershell
py -3.11 tools/3dx/import_anim_project.py --gender male `
  --bones-json tools/3dx/build/project/body_male.json `
  --anim "C:\dev\exported\ExportedProject\Assets\AnimationClip\stay_pose_1.anim" `
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
  --anim "C:\dev\exported\ExportedProject\Assets\AnimationClip\slowdance_woman.anim" `
  --out tools/3dx/build/character_male_pair.json
# feminino: --gender female, --bones-json ...character_female_idle.json,
#           --anim ...\slowdance_man.anim, --out ...character_female_pair.json
```

Depois entra no corpo igual a qualquer clipe: `--extra-anim <json> pair01`.

Os pares `pair02` (`slowdance_kiss`) e `pair03` (`slowdance_invert`) seguem o mesmo
importador, 111 quadros cada, e são exportados junto com `pair01` nos corpos
publicados. O `pair02` é o mais expressivo dos três (58 ossos móveis no masculino,
64 no feminino) e o `pair03` tem o maior deslocamento de parceira.

#### Pares em lote a partir do projeto exportado

A fonte é sempre `C:\dev\exported\ExportedProject`; não há mais caminho de bundle nesta etapa. O
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
- `ff_kiss` — `slowdance_kiss_woman.anim` + `slowdance_kiss_man.anim` (F/F), 111 quadros @ 30 fps,
  `gap` 0,25 m, `yaw` 180; actions `pair05_a`/`pair05_b` (um lado em cada corpo).

Quando o par for aprovado, `tools/3dx/export_bodies.py` reconstrói `character_male.glb` e
`character_female.glb` com as actions publicáveis do manifesto (entradas com `publish: false` são
ignoradas). Esse passo aumenta o tamanho dos corpos publicados; os comandos de teste acima não tocam
neles.

Para comparar com os pares publicados, a página `apps/web/public/viewer-pair.html` carrega
`character_male.glb`/`character_female.glb` com a colocação do jogo
(`pnpm --filter @3dx/web dev`, abrir `/viewer-pair.html`). Ela lista os clipes que existem nos dois
gêneros (`idle`, `walk`, `pose01`, `pair01`, `pair02`, `pair03`) e tem slider de quadro, de distância
e troca de quem inicia. Os novos pares ficam em `/viewer-pair-test.html`, lendo
`test/pairs.test.json`.

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
  --source "C:\dev\exported\ExportedProject\Assets\Resources\man\cloth\shirt_1.prefab" `
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

As peças são exportadas com o **mesmo esqueleto/rest pose** do corpo. No jogo, o
`attachAvatarParts` troca o esqueleto clone da peça pelo esqueleto do corpo quando
`sameBoneLayout` confirma que a ordem dos ossos é idêntica (`avatar-parts.ts`).
No `viewer3dx.html` a troca é feita ao montar cada nó. Sem isso a peça fica no
rest pose enquanto o corpo toca o idle, e o corpo atravessa a roupa.

#### Acessórios (P6)

Chapéus são `SkinnedMeshRenderer` de 1 osso e usam o mesmo `--retarget` das
roupas. Óculos e máscaras são `MeshFilter`/`MeshRenderer` **rígidos**: o
`extract_accessory_project.py` assa a malha no espaço do corpo e atribui 100% do
peso ao osso `Head` (a translação da raiz do prefab é só offset de preview; usamos
rotação/escala e ancoramos na posição de rest da cabeça).

```powershell
# chapéu (skinned)
py -3.11 tools/3dx/extract_character.py `
  --source "C:\dev\exported\ExportedProject\Assets\Resources\man\cloth\hat_flat.prefab" `
  --skeleton-json tools/3dx/rigs/3dx_male.json `
  --mesh hat_flat --gender male --retarget `
  --out tools/3dx/build/project/accessories/3dx_m_hat_flat.json

# óculos/máscara (rígido)
py -3.11 tools/3dx/extract_accessory_project.py `
  --source "C:\dev\exported\ExportedProject\Assets\Resources\man\cloth\glasses_1.prefab" `
  --rig tools/3dx/rigs/3dx_male.json --gender male `
  --out tools/3dx/build/project/accessories/3dx_m_glasses_1.json

# lote: 5 chapéus + 5 óculos + 5 máscaras por gênero
py -3.11 tools/3dx/export_accessories_project.py
```

Óculos e máscaras saem com cor própria (não recebem `TintPlugin`); chapéus também.
O lote aceita `--only` e `--staging`.

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
  --extra-anim tools/3dx/build/project/male_idle_pf.json idle `
  --extra-anim tools/3dx/build/project/male_walk_pf_sway.json walk `
  --extra-anim tools/3dx/build/project/male_pose_pf.json pose01 `
  --extra-anim tools/3dx/build/project/male_pair.json pair01
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

```powershell
py -3.11 tools/3dx/extract_character.py `
  --source "C:\dev\Mv444\AssetBundles\hair\male\hair_15" `
  --skeleton "C:\dev\Mv444\AssetBundles\wear\male\HZmalelatexsuit" `
  --mesh hair_15_1 --gender male --retarget `
  --out tools/3dx/build/hair_male_15.json

py -3.11 tools/3dx/extract_texture.py `
  --source "C:\dev\Mv444\AssetBundles\hair\male\hair_15" `
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
  --scene "C:\dev\exported\ExportedProject\Assets\scenes\char_editor_decor.unity" `
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
  --scene "C:\dev\exported\ExportedProject\Assets\scenes\club.unity" `
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

| Script                          | Papel                                                   |
| ------------------------------- | ------------------------------------------------------- |
| `lib3dx.py`                     | matemática (P, quaternions, matrizes) e leitura UnityPy |
| `extract_character.py`          | malha + esqueleto (+ animação) → JSON                   |
| `export_clothes_project.py`     | lote da coleção de roupas do projeto → GLBs publicados  |
| `extract_accessory_project.py`  | acessório rígido (óculos/máscara) → skin de 1 osso      |
| `export_accessories_project.py` | lote de chapéus, óculos e máscaras → GLBs               |
| `calibrate_decals_3dx.py`       | recalibra as âncoras de tatuagem 3DX (Blender)          |
| `damp_walk_sway.py`             | reduz a balançada lateral de um walk JSON               |
| `extract_texture.py`            | `_MainTex` de um material do bundle → PNG               |
| `extract_room_project.py`       | cena `.unity` do projeto → JSON da sala                 |
| `extract_room.py`               | legado: cena `level*` (bundle) → JSON da sala           |
| `export_room_glb.py`            | JSON da sala → GLB estático                             |
| `export_glb.py`                 | JSON → GLB (rest ou com animação), roda no Blender      |
| `skin_export.py`                | skinning de referência em Python puro                   |
| `verify_glb.py`                 | skinning independente direto do GLB                     |
| `render_check.py`               | renderiza GLB ou OBJs, roda no Blender                  |
| `run_blender.py`                | acha o Blender e roda um script                         |

## Convenções (não mudar)

- Malha em **Z-up**, rig em **Y-up**; a ponte é `P` (só nos ossos).
- Chavear por `path_id`, não por nome.
- No Blender: criar osso → **pai** → `length` → **`matrix` por último**.
- Gênero determina a fonte: `male` ↔ `man_*`, `female` ↔ `woman_*`.
- Saída em `apps/web/public/assets/3dx/`; JSON intermediário em `tools/3dx/build/`.
