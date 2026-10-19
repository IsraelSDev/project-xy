# Guia: pipeline nativo do 3DXChat (Fases B e C)

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
| Animação de teste       | `AssetBundles\animation\{m,f}\djpult\man@dj` / `woman@dj` | 217 quadros @ 30 fps. A Fase E traz o resto.                                                       |
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
  --anim "C:\dev\Mv444\AssetBundles\animation\m\djpult\man@dj" `
  --out tools/3dx/build/character_male.json

# 2) exportar GLB (rest ou com animação)
python tools/3dx/run_blender.py export_glb.py -- `
  --json tools/3dx/build/character_male.json `
  --out apps/web/public/assets/3dx/character_male.glb --anim

# 3) validar (em repouso: maxdisp ≈ 0; animado: bate com skin_export.py)
py -3.11 tools/3dx/verify_glb.py --glb apps/web/public/assets/3dx/character_male.glb --frame 80
py -3.11 tools/3dx/skin_export.py --json tools/3dx/build/character_male.json --frames 80 --no-obj

# 4) ver no navegador
#    pnpm --filter @3dx/web dev  →  http://localhost:5173/viewer3dx.html?model=character_male
```

Feminino: `--gender female`, rig `...\wear\female\s_squipanties1cum`, malhas
`woman_body woman_head woman_eyelashes`, clipe `...\animation\f\djpult\woman@dj`.

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
- sem pose procedural/preset no 3DX por enquanto (Fase E): a peça fica no
  repouso do GLB;
- `?outfit=top|bottom|underwear|all` no `viewer3dx.html` carrega as peças sobre
  o corpo para a prova visual.

## Critérios de aceite (atingidos)

- `character_male.glb` (corpo + cabeça + cílios + anatomia) e
  `character_female.glb` (corpo + cabeça + cílios) com mãos e pés;
- em repouso, `verify_glb.py` dá `maxdisp = 0.0000` em todas as malhas;
- com a animação de teste, `skin_export.py` e `verify_glb.py` dão o mesmo
  deslocamento no quadro 80 (corpo M 0.9827 / F 0.7930);
- os braços não viram fita (regra 5);
- Fase C: as 6 peças do primeiro conjunto dão `maxdisp = 0.0000` em repouso e
  ficam alinhadas ao corpo no render combinado, sem mover o esqueleto.

## Não fazer

- Carregar a malha de `wear` como se fosse o corpo nu (é a peça de roupa).
- Casar os clipes pelo caminho completo do osso — cada bundle tem uma raiz
  diferente (`man_1/`, `item/item_1/`). Casar pelo **nome do osso** (`bone_key`).
- Escolher o `SkinnedMeshRenderer` pelo “que tem mais ossos” em bundle de roupa:
  em `s_CropTop_ni`/`s_pantie_15_ni` isso pega o LOD errado. Usar o
  `m_Mesh.path_id`.
- Usar bundles criptografados ou com dependência externa (ex.: `venfsuitshirtcum`,
  “Reference has no path_id”).
