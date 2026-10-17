# Guia: pipeline nativo do 3DXChat (Fase B)

Como os personagens do cliente 3DXChat viram GLB para o jogo. Este é o passo a
passo da Fase B do `docs/roadmap/migracao-3dxchat.md`; os scripts ficam em
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
| Roupas / cabelo         | `AssetBundles\wear`, `AssetBundles\hair`                  | Fases C/D.                                                                                         |

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
# 1) extrair corpo + cabeça + cílios (JSON)
py -3.11 tools/3dx/extract_character.py `
  --source "C:\Users\israe\Downloads\Mv444\3DXChat_Data\character" `
  --skeleton "C:\Users\israe\Downloads\Mv444\AssetBundles\wear\male\HZmalelatexsuit" `
  --mesh man_body man_head man_eyelashes --gender male `
  --anim "C:\Users\israe\Downloads\Mv444\AssetBundles\animation\m\djpult\man@dj" `
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
`woman_*`, clipe `...\animation\f\djpult\woman@dj`.

## Critérios de aceite (atingidos)

- `character_male.glb` / `character_female.glb` com corpo + cabeça + mãos + pés;
- em repouso, `verify_glb.py` dá `maxdisp = 0.0000` em todas as malhas;
- com a animação de teste, `skin_export.py` e `verify_glb.py` dão o mesmo
  deslocamento no quadro 80 (corpo M 0.9827 / F 0.7930);
- os braços não viram fita (regra 5).

## Não fazer

- Carregar a malha de `wear` como se fosse o corpo nu (é a peça de roupa).
- Casar os clipes pelo caminho completo do osso — cada bundle tem uma raiz
  diferente (`man_1/`, `item/item_1/`). Casar pelo **nome do osso** (`bone_key`).
- Mexer em `avatar-model.ts` (integração é a Fase G, só via ADR).
