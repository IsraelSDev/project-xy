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
  - **Primária:** projeto Unity exportado em `C:\dev\exported\ExportedProject` (YAML + PNG, lido
    por `project_env.py`; sem UnityPy).
  - **Contrato de esqueleto/fallback:** bundles em `C:\dev\Mv444` (cliente extraído, 5 669
    arquivos). O corpo e os clipes vêm do projeto; o bundle de `wear` do gênero só fornece a
    **ordem dos ossos** (322 masculino / 464 feminino) que as roupas publicadas usam.

## Estado e próximo passo

A fonte padrão é o **projeto Unity exportado**. `project_env.py` lê YAML, GUID, prefab, malha
(`m_VertexData`/`m_Skin`/`m_BindPose`) e clipe; `import_anim_project.py` importa qualquer `.anim`.
Em 2026-10-19 os dois avatares publicados foram regerados por esse caminho (corpo + idle + walk +
pose01 + pair01) e validados com `verify_glb.py --rest` (`maxdisp=0`) e render.

O que ainda falta:

- O leitor nativo `tools/3dx/project/` (o adaptador é a ponte e não será descartado).
- Reexportar **roupas/cabelos** pelo projeto; hoje eles continuam vindo dos bundles e por isso o
  esqueleto do corpo precisa manter a ordem antiga.
- O gate de paridade de malha: as contagens do projeto divergem do bundle (6 332 × 6 336 no
  `man_body`, 7 905 × 9 580 no `woman_body`), aceito na regeração de 2026-10-19.

O contrato de saída continua sendo o **JSON atual**; `export_glb.py`, `verify_glb.py`,
`skin_export.py` e `render_check.py` não mudam. O caminho por bundle (`extract_character.py` +
UnityPy) fica como **legado/fallback**.

## Fluxo

```
extract_character.py  ->  JSON  ->  export_glb.py (Blender)  ->  GLB
                                   skin_export.py / verify_glb.py  (validação)
                                   render_check.py                 (olho)
```

### 1. Extrair (Python 3.11)

A fonte padrão é o **projeto exportado**. O adaptador `project_env.py` decodifica o YAML com a
mesma API que o pipeline usava do UnityPy (`lib3dx.load_env`/`extract_mesh` já roteiam `.prefab` e
`Node`), então o contrato JSON e o `export_glb.py` não mudam. O esqueleto (ordem dos ossos) continua
vindo de um bundle de `wear` do gênero: é o **contrato** que as roupas publicadas usam
(`sameBoneLayout`) e não muda nesta etapa.

Corpo + cabeça (+ anatomia no masculino), tudo do projeto:

```powershell
py -3.11 tools/3dx/extract_character.py `
  --source "C:\dev\exported\ExportedProject\Assets\Resources\man\man.prefab" `
  --skeleton "C:\dev\Mv444\AssetBundles\wear\male\HZmalelatexsuit" `
  --mesh man_body man_head man_eyelashes man_penis --gender male `
  --out tools/3dx/build/project/body_male.json
```

Feminino: `Resources\woman\woman.prefab`, skeleton `...\wear\female\s_squipanties1cum`,
meshes `woman_body woman_head woman_eyelashes`. O extrator imprime `bone remap N -> ok`; a malha é
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

Para ver o resultado sem publicar: os GLBs de teste ficam em
`apps/web/public/assets/3dx/test/pair_{male,female}.glb` (só a action `pair01`) e a
página `apps/web/public/viewer-pair.html` carrega os corpos publicados com a colocação
do jogo (`pnpm --filter @3dx/web dev`, abrir `/viewer-pair.html`). Ela lista os
clipes que existem nos dois gêneros (`idle`, `walk`, `pose01`, `pair01`, `pair02`,
`pair03`) e tem slider de quadro, de distância e troca de quem inicia.

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

#### Salas

A fonte padrão é o **projeto Unity exportado**: a sala é uma cena `.unity` e as
malhas/materiais/texturas resolvem por GUID (`.meta`), igual ao corpo. O
`extract_room_project.py` assa cada malha no espaço do mundo, agrupa por
material, descarta LOD1+ e extrai o albedo. O `export_room_glb.py` monta um GLB
estático (sem skin).

O closet é a cena `scenes\char_editor_decor.unity` (quarto/vestiário com cama,
sofá, mesa, armários e mezanino; raízes `ROOM`, `FURNITURE`, `FURNITURE DYNAMIC`,
`LIGHTS`):

```powershell
py -3.11 tools/3dx/extract_room_project.py `
  --scene "C:\dev\exported\ExportedProject\Assets\scenes\char_editor_decor.unity" `
  --name room20 `
  --out tools/3dx/build/project/room20.json `
  --texdir tools/3dx/build/project/room20_textures --max-texture 512

python tools/3dx/run_blender.py export_room_glb.py -- `
  --json tools/3dx/build/project/room20.json `
  --out apps/web/public/assets/3dx/rooms/room20/room20.glb
```

As texturas de sala são reduzidas para 512 px (orçamento de cenário) e salvas em
JPEG; materiais com transparência (vidro/espelho) usam PNG + blend. O
`viewer-room.html` abre o GLB com vistas frente/lado/topo e wireframe; o
`viewer-closet.html` usa a sala como closet, com câmera fixa, focos (corpo
inteiro/rosto/perfil/tronco/braços/pernas/costas) e o avatar + painel de
customização.

Balada: a cena é `scenes\club.unity`, com `--roots LEVEL bar_1 dj_pult coctail1
coctail2 coctail3`. O passo do projeto descarta LOD1+ de fato (o caminho por
bundle empilhava os quatro LODs das garrafas); o resultado fica em
`apps/web/public/assets/3dx/rooms/club7/club7.glb` (54 grupos, ~48 mil
triângulos, 2,5 MB), aberto por `viewer-club.html`.

```powershell
py -3.11 tools/3dx/extract_room_project.py `
  --scene "C:\dev\exported\ExportedProject\Assets\scenes\club.unity" `
  --name club7 --out tools/3dx/build/project/club7.json `
  --texdir tools/3dx/build/project/club7_textures --max-texture 512 `
  --roots LEVEL bar_1 dj_pult coctail1 coctail2 coctail3

python tools/3dx/run_blender.py export_room_glb.py -- `
  --json tools/3dx/build/project/club7.json `
  --out apps/web/public/assets/3dx/rooms/club7/club7.glb
```

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
ajudam a conferir o ciclo. Para ver as roupas sobre o corpo,
`tools/3dx/build/render_outfit.py` (script local, não versionado) importa o corpo

- as peças no mesmo Blender:

## Arquivos

| Script                 | Papel                                                   |
| ---------------------- | ------------------------------------------------------- |
| `lib3dx.py`            | matemática (P, quaternions, matrizes) e leitura UnityPy |
| `extract_character.py` | malha + esqueleto (+ animação) → JSON                   |
| `damp_walk_sway.py`    | reduz a balançada lateral de um walk JSON               |
| `extract_texture.py`   | `_MainTex` de um material do bundle → PNG               |
| `extract_room_project.py` | cena `.unity` do projeto → JSON da sala              |
| `extract_room.py`      | legado: cena `level*` (bundle) → JSON da sala           |
| `export_room_glb.py`   | JSON da sala → GLB estático                             |
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
