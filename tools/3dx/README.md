# tools/3dx — pipeline dos assets nativos do 3DXChat

Pipeline versionado que extrai malha + esqueleto (+ animação) do cliente 3DXChat
instalado e exporta GLB para o jogo. Antes vivia em `%TEMP%`; este é o lar dele.

Plano e regras fixas: `docs/roadmap/migracao-3dxchat.md` (seção 2) e
`docs/guides/3dx-nativo.md`. **Não redescobrir a matemática** — ela está em
`lib3dx.py` e é copiada do piloto.

## Pré-requisitos

- Python **3.11** com `UnityPy==1.25.4`: `py -3.11 -m pip install -r tools/3dx/requirements.txt`
- Blender **5.2** (caminho padrão `C:\Program Files\Blender Foundation\Blender 5.2` ou `$BLENDER`)
- Cliente 3DXChat instalado (fonte): `C:\dev\Mv444`

## Fluxo

```
extract_character.py  ->  JSON  ->  export_glb.py (Blender)  ->  GLB
                                   skin_export.py / verify_glb.py  (validação)
                                   render_check.py                 (olho)
```

### 1. Extrair (Python 3.11)

O corpo base **não** está em `wear` (roupa): está em `3DXChat_Data\character`
(arquivo serial com as malhas). Ele não tem _renderer_ nem esqueleto, então o
esqueleto vem de um bundle de `wear` (mesmo rig). Corpo + cabeça (+ anatomia no masculino):

```powershell
py -3.11 tools/3dx/extract_character.py `
  --source "C:\dev\Mv444\3DXChat_Data\character" `
  --skeleton "C:\dev\Mv444\AssetBundles\wear\male\HZmalelatexsuit" `
  --mesh man_body man_head man_eyelashes man_penis --gender male `
  --out tools/3dx/build/character_male.json
```

O masculino leva `man_penis` como quarta malha do mesmo GLB (Fase B3, dentro do
`character_male.glb`). Feminino usa `--gender female --mesh woman_body woman_head
woman_eyelashes --skeleton ...\wear\female\s_squipanties1cum`.

O idle publicado vem de `3DXChat_Data\resources.assets` (o clipe não tem esqueleto
próprio; o `--anim-root` escolhe o subtree `*_bone_POSE_PIVOT` do prefab):

```powershell
py -3.11 tools/3dx/extract_character.py `
  --source "C:\dev\Mv444\3DXChat_Data\character" `
  --skeleton "C:\dev\Mv444\AssetBundles\wear\male\HZmalelatexsuit" `
  --mesh man_body man_head man_eyelashes man_penis --gender male `
  --anim "C:\dev\Mv444\3DXChat_Data\resources.assets" `
  --anim-root man --anim-clip stay_pose_1 `
  --out tools/3dx/build/character_male_idle.json
```

Feminino: `--gender female`, rig `...\wear\female\s_squipanties1cum`, malhas
`woman_body woman_head woman_eyelashes`, `--anim-root woman` e o mesmo
`--anim-clip stay_pose_1`.

O walk nativo sai do mesmo `resources.assets` (clipe `walk`, 37 quadros @ 30 fps =
1,2 s, em loop). O extrator grava as malhas de novo, mas o export usa só o `world`:

```powershell
py -3.11 tools/3dx/extract_character.py `
  --source "C:\dev\Mv444\3DXChat_Data\character" `
  --skeleton "C:\dev\Mv444\AssetBundles\wear\male\HZmalelatexsuit" `
  --mesh man_body man_head man_eyelashes man_penis --gender male `
  --anim "C:\dev\Mv444\3DXChat_Data\resources.assets" `
  --anim-root man --anim-clip walk `
  --out tools/3dx/build/character_male_walk.json
```

O walk masculino passa por `damp_walk_sway.py` antes do export: o clipe nativo
balança a parte de cima demais (cabeça ~14,6 cm de um lado ao outro; o feminino
~3,4 cm), e o script reduz só o componente lateral de
`man_Spine1/Spine2/Neck/Head`, mantendo o passo:

```powershell
py -3.11 tools/3dx/damp_walk_sway.py `
  --json tools/3dx/build/character_male_walk.json `
  --out tools/3dx/build/character_male_walk_sway.json `
  --bones man_Spine1 man_Spine2 man_Neck man_Head --factor 0.25
```

O export do corpo masculino usa o JSON corrigido no `--extra-anim`; o feminino
usa o `character_female_walk.json` sem damping.

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

#### Roupas (Fase C)

Os bundles de roupa foram autorados em cópias do rig (raiz rotacionada/deslocada,
mesh no bind A-pose), então o corpo usa o casamento por posição e as roupas usam
`--retarget`: os ossos são casados **por nome** (`_1`/`_2`, dedos ausentes herdam
o antebraço) e o vértice é assado com `refWorld[map(i)] * bindpose[i] * v`, no
rest pose do corpo.

```powershell
py -3.11 tools/3dx/extract_character.py `
  --source "C:\dev\Mv444\AssetBundles\wear\male\s_ManShirt1_ni" `
  --skeleton "C:\dev\Mv444\AssetBundles\wear\male\HZmalelatexsuit" `
  --mesh man_body --gender male --retarget `
  --out tools/3dx/build/outfit_male_top.json
```

O mesh correto vem do `m_Mesh.path_id` (nunca do “SMR com mais ossos”, que pega
LOD errado em `s_CropTop_ni`/`s_pantie_15_ni`).

As peças são exportadas com o **mesmo esqueleto/rest pose** do corpo. No jogo, o
`attachAvatarParts` troca o esqueleto clone da peça pelo esqueleto do corpo quando
`sameBoneLayout` confirma que a ordem dos ossos é idêntica (`avatar-parts.ts`).
No `viewer3dx.html` a troca é feita ao montar cada nó. Sem isso a peça fica no
rest pose enquanto o corpo toca o idle, e o corpo atravessa a roupa.

### 2. Exportar (Blender 5.2)

```powershell
python tools/3dx/run_blender.py export_glb.py -- --json tools/3dx/build/character_male.json --out apps/web/public/assets/3dx/character_male.glb
python tools/3dx/run_blender.py export_glb.py `
  --json tools/3dx/build/character_male_idle.json `
  --out apps/web/public/assets/3dx/character_male.glb --anim --anim-name idle `
  --extra-anim tools/3dx/build/character_male_walk.json walk
```

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
  --json tools/3dx/build/outfit_male_top.json `
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
o jogo aplica `hairColor` por cima com `hairTint`, como no GoE; use
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

#### Salas (piloto)

A cena de sala vive em `3DXChat_Data\level*` e referencia malhas/materiais em
`sharedassets*.assets`/`resources.assets`. O `extract_room.py` resolve esses
PPtrs, assa cada malha no espaço do mundo, agrupa por material e extrai as
texturas de albedo. O `export_room_glb.py` monta um GLB estático (sem skin).

A menor sala de fato é a `level20` (quarto/vestiário com cama, sofá, mesa,
armários e mezanino; raízes `ROOM`, `FURNITURE`, `FURNITURE DYNAMIC`, `LIGHTS`):

```powershell
py -3.11 tools/3dx/extract_room.py `
  --scene "C:\dev\Mv444\3DXChat_Data\level20" `
  --name room20 `
  --out tools/3dx/build/room20.json `
  --texdir tools/3dx/build/room20_textures --max-texture 512

python tools/3dx/run_blender.py export_room_glb.py -- `
  --json tools/3dx/build/room20.json `
  --out apps/web/public/assets/3dx/rooms/room20/room20.glb
```

As texturas de sala são reduzidas para 512 px (orçamento de cenário) e salvas em
JPEG; materiais com transparência (vidro/espelho) usam PNG + blend. O
`viewer-room.html` abre o GLB com vistas frente/lado/topo e wireframe; o
`viewer-closet.html` usa a sala como closet, com câmera fixa e o avatar + painel
de customização.

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
ajudam a conferir o ciclo. Para ver as roupas sobre o corpo,
`tools/3dx/build/render_outfit.py` (script local, não versionado) importa o corpo

- as peças no mesmo Blender:

## Arquivos

| Script                 | Papel                                                   |
| ---------------------- | ------------------------------------------------------- |
| `lib3dx.py`            | matemática (P, quaternions, matrizes) e leitura UnityPy |
| `extract_character.py` | malha + esqueleto (+ animação) → JSON                   |
| `damp_walk_sway.py`    | reduz a balançada lateral de um walk JSON               |
| `extract_texture.py`   | `_MainTex` de um material do bundle → PNG                |
| `extract_room.py`      | cena `level*` + móveis/materiais → JSON da sala          |
| `export_room_glb.py`   | JSON da sala → GLB estático                              |
| `export_glb.py`        | JSON → GLB (rest ou com animação), roda no Blender      |
| `skin_export.py`       | skinning de referência em Python puro                   |
| `verify_glb.py`        | skinning independente direto do GLB                     |
| `render_check.py`      | renderiza GLB ou OBJs, roda no Blender                  |
| `run_blender.py`       | acha o Blender e roda um script                         |

## Convenções (não mudar)

- Malha em **Z-up**, rig em **Y-up**; a ponte é `P` (só nos ossos).
- Chavear por `path_id`, não por nome.
- No Blender: criar osso → **pai** → `length` → **`matrix` por último**.
- Gênero determina a fonte: `male` ↔ `man_*`, `female` ↔ `woman_*`.
- Saída em `apps/web/public/assets/3dx/`; JSON intermediário em `tools/3dx/build/`.
