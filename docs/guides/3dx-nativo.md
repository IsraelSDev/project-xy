# Guia: pipeline nativo do 3DXChat (Fases B, C e E — idle e walk)

Como os personagens e as primeiras roupas do cliente 3DXChat viram GLB para o jogo. Este é o passo a
passo das Fases B e C do `docs/roadmap/migracao-3dxchat.md`; os scripts ficam em
`tools/3dx/` (ver `tools/3dx/README.md`). Leia antes as regras de assets do repo
em `docs/guides/assets-3d.md`.

Regra de ouro: **não otimizar os GLB** (sem `weld`/`prune`/`simplify`/`quantize`/
`meshopt`) e **não redescobrir a matemática** — ela está congelada em
`tools/3dx/lib3dx.py` e na seção 2 do plano.

---

## O que é fonte (e o que não é)

| O que                   | Caminho                                                   | Observação                                                                                         |
| ----------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Personagem base**     | `3DXChat_Data\character`                                  | arquivo serial com as **9 malhas** do corpo/rosto (M e F). **Só malhas** — sem renderer/esqueleto. |
| Esqueleto de referência | `AssetBundles\wear\{male,female}\<bundle>`                | o rig (322 ossos M / 464 F). A Fase B usa um bundle neutro.                                        |
| Idle nativo             | `3DXChat_Data\resources.assets`, clipe `stay_pose_1`      | 201 quadros M / 41 F @ 30 fps. É o idle publicado; o clipe não traz esqueleto próprio.             |
| Walk nativo             | `3DXChat_Data\resources.assets`, clipe `walk`             | 37 quadros @ 30 fps (1,2 s), em loop. Mesmo esquema do idle; toca quando o avatar se desloca.      |
| Animação de teste       | `AssetBundles\animation\{m,f}\djpult\man@dj` / `woman@dj` | 217 quadros @ 30 fps. Não é publicada; serve para comparar amplitudes.                             |
| Roupas / cabelo         | `AssetBundles\wear`, `AssetBundles\hair`                  | Fase C (primeiro conjunto) / Fase D.                                                               |

O nome `man_body` reaparece nos itens de roupa — ali é a malha da **peça**, não
o corpo nu. O corpo nu (com mãos e pés) é o do `character`.

## A descoberta que destrava a Fase B

O `character` não tem `SkinnedMeshRenderer` nem hierarquia; o esqueleto vem de um
bundle de `wear`. Cada malha do `character` carrega os próprios `m_BindPose`,
`BoneIndices` e `BoneWeights`, com índices **locais** à malha (60 no corpo M, 26
na cabeça). Para casar com o rig:

```
P⁻¹ · inverse(bindpose)  ==  rest_world do osso     (bate exato)
```

Ou seja, invertendo o bindpose e tirando o swap de eixo (`P⁻¹`) o osso cai no
mesmo lugar do `rest_world` do bundle de `wear`. O `extract_character.py` faz
esse casamento por translação (e usa a rotação para desempatar) — ver
`lib3dx.remap_bindposes`.

Eixos: a **malha** é Z-up; o **rig** é Y-up; a ponte é `P` (regra 1 da seção 2).
No Blender, montar osso → pai → `length` → `matrix` por último (regra 5).

## Passo a passo (Fase B)

Pré-requisito: Python 3.11 com `UnityPy==1.25.4` e Blender 5.2.

```powershell
# 1) extrair corpo + cabeça + cílios + anatomia (JSON)
py -3.11 tools/3dx/extract_character.py `
  --source "C:\dev\Mv444\3DXChat_Data\character" `
  --skeleton "C:\dev\Mv444\AssetBundles\wear\male\HZmalelatexsuit" `
  --mesh man_body man_head man_eyelashes man_penis --gender male `
  --anim "C:\dev\Mv444\3DXChat_Data\resources.assets" `
  --anim-root man --anim-clip stay_pose_1 `
  --out tools/3dx/build/character_male_idle.json

# 2) extrair o walk (mesmo corpo/esqueleto; só o world interessa no export)
py -3.11 tools/3dx/extract_character.py `
  --source "C:\dev\Mv444\3DXChat_Data\character" `
  --skeleton "C:\dev\Mv444\AssetBundles\wear\male\HZmalelatexsuit" `
  --mesh man_body man_head man_eyelashes man_penis --gender male `
  --anim "C:\dev\Mv444\3DXChat_Data\resources.assets" `
  --anim-root man --anim-clip walk `
  --out tools/3dx/build/character_male_walk.json

# 3) exportar GLB com idle + walk (duas actions no mesmo arquivo)
python tools/3dx/run_blender.py export_glb.py -- `
  --json tools/3dx/build/character_male_idle.json `
  --out apps/web/public/assets/3dx/character_male.glb --anim --anim-name idle `
  --extra-anim tools/3dx/build/character_male_walk.json walk

# 4) validar (em repouso: maxdisp ≈ 0; animado: bate com skin_export.py)
py -3.11 tools/3dx/verify_glb.py --glb apps/web/public/assets/3dx/character_male.glb --frame 80
py -3.11 tools/3dx/verify_glb.py --glb apps/web/public/assets/3dx/character_male.glb --anim walk --frame 15
py -3.11 tools/3dx/skin_export.py --json tools/3dx/build/character_male.json --frames 80 --no-obj

# 4) ver no navegador
#    pnpm --filter @3dx/web dev  →  http://localhost:5173/viewer3dx.html?model=character_male
```

Feminino: `--gender female`, rig `...\wear\female\s_squipanties1cum`, malhas
`woman_body woman_head woman_eyelashes`, `--anim-root woman` e o mesmo
`--anim-clip stay_pose_1` (ou `walk`, para o segundo JSON).

### Idle nativo (Fase E)

O clipe `stay_pose_1` mora em `resources.assets` e **não tem esqueleto próprio**:
o `--anim-root man|woman` seleciona o subtree `*_bone_POSE_PIVOT` do prefab e o
extrator usa esse rest para calcular o delta. Duas regras fazem os membros
ficarem certos:

1. O delta é **world-space**: `q_delta = q_pose * inverse(q_rest)` e
   `q_world = q_delta * q_rest_target`. Aplicar o delta como rotação local mistura
   os eixos de rest da origem e do alvo e torce braços/rosto.
2. Osso do alvo **sem curva** no clipe herda a **rotação local de rest do pai**
   (`q_world = q_world_pai * q_local_rest`), não a rotação global de rest. Sem
   isso o filho translada com o membro mas não gira no cotovelo/joelho/pulso, e a
   pele colapsa (era o "braço/ perna torto").

O casamento de nomes duplicados no prefab usa a posição/rotação de rest mais
próxima do osso alvo, para não pegar props estáticos que reutilizam nomes de
ossos. O `export_glb.py --anim-name idle` nomeia o grupo que o
`applyMotion`/`motionClip` procura.

### Walk nativo (Fase E)

O `walk` sai do mesmo `resources.assets`, com `--anim-root man|woman --anim-clip
walk` (37 quadros @ 30 fps). O clipe é **in-place**: a translação da pelve fica
constante; o deslocamento do avatar continua sendo o do servidor. A extração usa
as mesmas regras de delta world-space e herança local do idle.

O GLB publicado leva **duas actions**: `idle` e `walk`. O `export_glb.py` aceita
`--extra-anim <json> <nome>` (repetível), valida que o esqueleto é idêntico ao do
`--json` e exporta todas as actions com `export_animation_mode=ACTIONS`. No jogo:

- `motionClip(model, '', moving)` devolve `walk` quando `walk.intensity > 0.05`
  (ou seja, quando o avatar está se deslocando) e `idle` quando parado;
- `playClip` reinicia do rest pose ao trocar de clipe, para ossos não
  chaveados não herdarem o último quadro do clipe anterior;
- o `walk` foi autorado para ~1,17 m/s (passada de ~1,4 m em 1,2 s). Como o jogo
  anda a 1,35 m/s, `applyMotion` ajusta `speedRatio = avatar.speed / 1,17`
  (limitado a 0,6–1,8) para o pé não patinar; a 1,35 m/s o walk toca a ~1,16x.
- o walk masculino nativo balançava demais a parte de cima: a cabeça andava
  ~14,6 cm de um lado para o outro (o feminino, ~3,4 cm). O
  `damp_walk_sway.py` reduz só o componente lateral (Y/Z local) de
  `man_Spine1/Spine2/Neck/Head` por 0,25, mantendo o passo e a inclinação para
  frente; a cabeça fica em ~3,3 cm. O corpo masculino é exportado com o
  `character_male_walk_sway.json`:

  ```powershell
  py -3.11 tools/3dx/damp_walk_sway.py `
    --json tools/3dx/build/character_male_walk.json `
    --out tools/3dx/build/character_male_walk_sway.json `
    --bones man_Spine1 man_Spine2 man_Neck man_Head --factor 0.25
  ```

As roupas compartilham o esqueleto do corpo (C8), então acompanham o walk sem
retarget adicional. No `viewer3dx.html`, `?anim=walk` toca só o clipe de
caminhada (`?anim=idle` é o padrão) e `?outfit=all` mostra as peças. Para conferir
no Blender:

```powershell
python tools/3dx/run_blender.py render_check.py -- `
  --glb apps/web/public/assets/3dx/character_male.glb `
  --action walk --frames 0 9 18 27 --azimuth 90 --outdir "$env:TEMP\walk"
```

## Anatomia (B3)

O `man_penis` entra como **quarta malha do mesmo GLB** (`man_body`, `man_head`,
`man_eyelashes`, `man_penis`), no mesmo armature e no mesmo espaço das outras.
É a regra de "anatomia como peça" adaptada ao 3DX: em vez de um GLB equipável à
parte como o `GoE_M_Genitals`, ela viaja junto do corpo e o jogo a **oculta**
(`isVisible = false`) quando há calça ou roupa íntima. Os ossos usados são
`b4` (pelve), `b8`/`b9`/`b10` (cadeia `man_bone_pen_*`) e `b14`
(`man_bone_pen_balls`), então o mapa de juntas (`JOINTS_3DX_MALE`) não muda. A
peça feminina (`woman_penis`) fica pendente.

## Roupas (Fase C)

Os bundles de roupa usam uma **cópia própria do rig**: a raiz vem rotacionada e
deslocada, e o mesh está no bind A-pose. O remap por posição (usado no corpo)
não serve. Por isso o `extract_character.py` ganhou `--retarget`: ele casa os
ossos **por nome** (sufixos `_1`/`_2`; dedos ausentes herdam o antebraço) e assa
cada vértice com

```
v_ref = Σ w_i * refWorld[map(i)] * bindpose[i] * v
```

Depois aplica `P` (Y-up → Z-up) e reescreve o `boneIdx` para o esqueleto do
corpo. O resultado é a peça no **rest pose do corpo**, pronta para ser filha da
raiz normalizada no jogo.

```powershell
# 1) extrair UMA peça retargetada (o mesh certo vem do m_Mesh.path_id)
py -3.11 tools/3dx/extract_character.py `
  --source "C:\dev\Mv444\AssetBundles\wear\male\s_ManShirt1_ni" `
  --skeleton "C:\dev\Mv444\AssetBundles\wear\male\HZmalelatexsuit" `
  --mesh man_body --gender male --retarget `
  --out tools/3dx/build/outfit_male_top.json

# 2) exportar em branco (o jogo colore pelo TintPlugin) e sem animação
python tools/3dx/run_blender.py export_glb.py -- `
  --json tools/3dx/build/outfit_male_top.json `
  --out apps/web/public/assets/3dx/clothes/top/3dx_m_top_shirt.glb `
  --color 1,1,1 --roughness 0.8

# 3) validar: em repouso, maxdisp = 0.0000 (mesmo esqueleto do corpo)
py -3.11 tools/3dx/verify_glb.py --glb apps/web/public/assets/3dx/clothes/top/3dx_m_top_shirt.glb --rest

# 4) prova visual sobre o corpo (script local, não versionado)
& "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup `
  --python tools/3dx/build/render_outfit.py -- `
  --body apps/web/public/assets/3dx/character_male.glb `
  --pieces apps/web/public/assets/3dx/clothes/top/3dx_m_top_shirt.glb `
           apps/web/public/assets/3dx/clothes/bottom/3dx_m_bottom_pants.glb `
           apps/web/public/assets/3dx/clothes/underwear/3dx_m_underwear_briefs.glb `
  --outdir C:\Users\israe\AppData\Local\Temp\opencode\render-outfit-male
```

Primeiro conjunto (IDs do catálogo):

| Gênero    | Slot        | Bundle fonte           | ID                        |
| --------- | ----------- | ---------------------- | ------------------------- |
| masculino | `top`       | `s_ManShirt1_ni`       | `3dx_m_top_shirt`         |
| masculino | `bottom`    | `mpants_1`             | `3dx_m_bottom_pants`      |
| masculino | `underwear` | `mjockstrap`           | `3dx_m_underwear_briefs`  |
| feminino  | `top`       | `s_EmoShirtF_ni`       | `3dx_f_top_shirt`         |
| feminino  | `bottom`    | `alexwidejeansfem1cum` | `3dx_f_bottom_pants`      |
| feminino  | `underwear` | `s_pantie_15_ni`       | `3dx_f_underwear_panties` |

Regras de integração que já valem para as próximas peças:

- material em branco + `TintPlugin` (`topColor` no `top`; `bottomColor` no
  `bottom` e no `underwear`) — não exportar textura alheia;
- a roupa íntima não é desenhada quando há calça; a anatomia masculina some com
  calça **ou** roupa íntima;
- a peça é exportada no mesmo rest pose/esqueleto do corpo e, no jogo, passa a
  usar o esqueleto do corpo (`sameBoneLayout` em `avatar-parts.ts`), então
  acompanha idle/walk nativos; sem essa troca a peça fica no repouso e o corpo a
  atravessa;
- `?outfit=top|bottom|underwear|all` no `viewer3dx.html` carrega as peças sobre
  o corpo para a prova visual.

## Cabelo (Fase D, piloto)

O cabelo nativo é uma peça do slot `hair`, presa ao osso da cabeça e exportada no
mesmo rest pose do corpo. O bundle de cabelo traz o mesh, o esqueleto completo e
o atlas de fios com alfa; o `extract_character.py --retarget` casa os ossos por
nome, e o `extract_texture.py` extrai a `_MainTex` do material.

```powershell
# masculino: todos os pesos caem em man_bone_Head
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

O feminino usa `...\hair\female\hair_30`, `--mesh hair_37`, esqueleto
`...\wear\female\s_squipanties1cum`, `--material hair_diff_002_a_uni` e
`--cutoff 0.5`. O `extract_texture.py` imprime `_Mode`/`_Cutoff` do material
original.

| Gênero    | Bundle    | Mesh        | ID do catálogo    |
| --------- | --------- | ----------- | ----------------- |
| masculino | `hair_15` | `hair_15_1` | `3dx_m_hair_15`   |
| feminino  | `hair_30` | `hair_37`   | `3dx_f_hair_30`   |

Regras que valem para os próximos cabelos:

- exportar o atlas claro e deixar a cor para o jogo (`hairTint`, com
  `hairColor`); não pré-multiplicar a cor de origem;
- `--alpha-mode cutout` (`alphaMode: MASK`) e `--double-sided` para os cards;
- `attachAvatarParts` troca o esqueleto do cabelo pelo do corpo
  (`sameBoneLayout`), então ele acompanha idle/walk sem segunda animação;
- `softenAlphaMasks` suaviza a borda dos fios no jogo;
- no `viewer3dx.html`, o cabelo carrega por padrão (`?hair=0` desliga) e
  `?view=back|side` ajuda a conferir o encaixe.

## Sala nativa (piloto)

A menor cena que é uma sala completa é a `level20`: quarto/vestiário com cama,
sofá, mesa, cadeiras, armários, mezanino e paredes/piso. As raízes úteis são
`ROOM`, `FURNITURE`, `FURNITURE DYNAMIC` e `LIGHTS`; a cena referencia malhas,
materiais e texturas em `sharedassets20.assets` (algumas em `resources.assets`).

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

O extrator resolve os PPtrs entre arquivos, aplica a matriz de mundo de cada
`MeshFilter` (Unity Y-up → Blender Z-up), agrupa os triângulos por material e
salva o albedo (`_MainTex`) em 512 px. Materiais com `_Mode` 1/2/3 viram cutout
ou blend; vidro/espelho são `doubleSided`. Normal maps não entram neste piloto.

`apps/web/public/viewer-room.html` abre a sala com câmera orbital, vistas
frente/lado/topo e wireframe. O `viewer-closet.html` usa a mesma sala como
**closet**: câmera fixa (sem órbita/zoom), avatar 3DX no centro e o painel de
cabelo/roupa/cores/presets. O painel tem **focos de câmera** — corpo inteiro,
rosto, perfil, tronco, braços, pernas e costas — para conferir tatuagens,
piercings e detalhes sem liberar a câmera livre. É a prova visual do closet;
colisões, spawns e troca de sala no jogo ainda são a próxima etapa.

## Critérios de aceite (atingidos)

- `character_male.glb` (corpo + cabeça + cílios + anatomia) e
  `character_female.glb` (corpo + cabeça + cílios) com mãos e pés;
- em repouso, `verify_glb.py` dá `maxdisp = 0.0000` em todas as malhas;
- com o idle nativo, braços e pernas mantêm o volume (sem colapso em
  cotovelo/joelho/pulso) e o rosto não deforma;
- o walk nativo (37 quadros) está embutido como segunda action nos dois corpos e
  é escolhido por `motionClip` quando o avatar se desloca;
- as peças da Fase C dão `maxdisp = 0.0000` em repouso, compartilham o esqueleto
  do corpo e acompanham idle/walk no `viewer3dx.html?outfit=all`;
- o piloto da Fase D traz um cabelo por gênero (`3dx_m_hair_15` /
  `3dx_f_hair_30`) com atlas de fios, alfa cutout, esqueleto do corpo e cor por
  `hairTint`; acompanha idle/walk no `viewer3dx.html`;
- o piloto de sala traz a `level20` (quarto/vestiário) com móveis, paredes/piso e
  vidros no `viewer-room.html`; o `viewer-closet.html` usa a sala como closet com
  câmera fixa e focos (corpo inteiro/rosto/perfil/tronco/braços/pernas/costas).
  É uma cena estática, ainda sem colisão/spawn no jogo;
- com a animação de teste antiga, `skin_export.py` e `verify_glb.py` dão o mesmo
  deslocamento no quadro 80 (corpo M 0.9827 / F 0.7930).

## Não fazer

- Carregar a malha de `wear` como se fosse o corpo nu (é a peça de roupa).
- Casar os clipes pelo caminho completo do osso — cada bundle tem uma raiz
  diferente (`man_1/`, `item/item_1/`). Casar pelo **nome do osso** (`bone_key`).
- Escolher o `SkinnedMeshRenderer` pelo “que tem mais ossos” em bundle de roupa:
  em `s_CropTop_ni`/`s_pantie_15_ni` isso pega o LOD errado. Usar o
  `m_Mesh.path_id`.
- Usar bundles criptografados ou com dependência externa (ex.: `venfsuitshirtcum`,
  “Reference has no path_id”).
