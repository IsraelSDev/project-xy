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
(arquivo serial com as malhas). Ele não tem *renderer* nem esqueleto, então o
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

Animação de teste embutida (opcional): `--anim "...\animation\m\djpult\man@dj"`
(feminino: `...\animation\f\djpult\woman@dj`).

Um bundle em que malha e esqueleto convivem não precisa de `--skeleton`:

```powershell
py -3.11 tools/3dx/extract_character.py --source <bundle> --mesh man_body --gender male --out <json>
```

### 2. Exportar (Blender 5.2)

```powershell
python tools/3dx/run_blender.py export_glb.py -- --json tools/3dx/build/character_male.json --out apps/web/public/assets/3dx/character_male.glb
python tools/3dx/run_blender.py export_glb.py -- --json tools/3dx/build/character_male.json --out apps/web/public/assets/3dx/character_male.glb --anim
```

### 3. Validar

```powershell
py -3.11 tools/3dx/skin_export.py --json tools/3dx/build/character_male.json --outdir "$env:TEMP\skin"
py -3.11 tools/3dx/verify_glb.py --glb apps/web/public/assets/3dx/character_male.glb --frame 80
python tools/3dx/run_blender.py render_check.py -- --glb apps/web/public/assets/3dx/character_male.glb --outdir "$env:TEMP\render"
```

Em repouso, `verify_glb.py` deve dar `maxdisp ≈ 0`. Com a animação, o
deslocamento do GLB tem que bater com o `skin_export.py` no mesmo quadro.

## Arquivos

| Script | Papel |
| --- | --- |
| `lib3dx.py` | matemática (P, quaternions, matrizes) e leitura UnityPy |
| `extract_character.py` | malha + esqueleto (+ animação) → JSON |
| `export_glb.py` | JSON → GLB (rest ou com animação), roda no Blender |
| `skin_export.py` | skinning de referência em Python puro |
| `verify_glb.py` | skinning independente direto do GLB |
| `render_check.py` | renderiza GLB ou OBJs, roda no Blender |
| `run_blender.py` | acha o Blender e roda um script |

## Convenções (não mudar)

- Malha em **Z-up**, rig em **Y-up**; a ponte é `P` (só nos ossos).
- Chavear por `path_id`, não por nome.
- No Blender: criar osso → **pai** → `length` → **`matrix` por último**.
- Gênero determina a fonte: `male` ↔ `man_*`, `female` ↔ `woman_*`.
- Saída em `apps/web/public/assets/3dx/`; JSON intermediário em `tools/3dx/build/`.
