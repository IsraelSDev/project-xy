# Migração dos assets nativos do 3DXChat (Mv444 → 3dxchat-web)

Status: em execução — o modelo único **3DX** está integrado (corpo, roupas, cabelo, acessórios, animações e decalques). `3dx-male`/`3dx-female` são a única fam?lia de avatar.

Leia antes: `docs/guides/assets-3d.md` (regras de assets do repo), `docs/decisions/0006-avatares-personalizaveis-fase-4.md` (decisões de avatar) e `docs/roadmap/proximas-fases.md`.

> **Regra de ouro deste plano:** cada fase termina com algo **visível e verificável** (um GLB que abre no `viewer3dx.html`), e nada entra no jogo antes de passar pela fase de integração (G). Não pular etapas.

> **Plano revisado em 2026-10-19.** O caminho do adaptador (passos 4 a 7 desta seção) continua
> como **ponte** para reusar `lib3dx`/`extract_character`; o alvo é o leitor nativo
> `tools/3dx/project/`, com o mesmo contrato JSON e o mesmo gate de fidelidade. O plano executável
> agora é `docs/roadmap/migracao-3dxchat-exportado.md`; os passos 1–3 (baseline) e 8–12 (gate,
> exportação e registro) continuam válidos. O que destrava a migração é **exportar os
> `AssetBundles` também** (o export atual só cobre `3DXChat_Data`) e medir a cobertura; a sonda já
> confirmou paridade exata da geometria do `man_body` com o GLB publicado.

---

## 0.1 Próxima IA: comece aqui (passo a passo executável)

Esta seção é a instrução de trabalho. Ela substitui as fases A0 e A6 (que ficam como referência logo abaixo). Não pergunte ao usuário o que já está decidido aqui; só pare se um critério de pronto falhar e não houver ação prevista para essa falha. **Para o caminho novo, leia primeiro `docs/roadmap/migracao-3dxchat-exportado.md`; os passos 4–7 abaixo ficam como histórico do adaptador.**

### Estado verificado em 2026-10-19

| Item                                     | Onde está                                               | Observação                                                                                                                                                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Projeto Unity exportado (editor 5.5.5p2) | `C:\dev\exported\ExportedProject`                       | **Mudou de lugar.** Não existe mais em `C:\dev\New folder\exported`. Use este caminho (chamado `<PROJ>` abaixo).                                                                                                                                                 |
| Auxiliares do projeto                    | `C:\dev\exported\AuxiliaryFiles`                        | `path_id_map.json` e DLLs. Não entra no caminho principal.                                                                                                                                                                                                       |
| Zip com os bundles                       | `C:\dev\New folder\Mv444R.zip` (6,9 GB, 8 447 entradas) | Entradas começam em `Mv444/`. Tem `3DXChat_Data/character`, `3DXChat_Data/resources.assets` e `AssetBundles/...`. **Não está criptografado** (extração de `Mv444/3DXChat_Data/app.info` verificada em 2026-10-19). Descompactado: 10,93 GB (8,37 GB de bundles). |
| `C:\dev\Mv444`                           | só uma pasta `AssetBundles\animation` vazia             | **Não usar.** Os comandos antigos que apontam para cá não rodam nesta máquina.                                                                                                                                                                                   |
| Código do pipeline                       | `tools/3dx/`                                            | Só roda com bundles **depois** de extrair do zip (passo 2). Nenhuma parte do caminho "projeto" foi escrita ainda.                                                                                                                                                |

### Regra de reuso (a mais importante)

**Não reescreva** `export_glb.py`, `verify_glb.py`, `skin_export.py` nem `render_check.py`. O
contrato de saída continua sendo o **JSON atual**; o GLB não muda. A frente de leitura começa pelo
adaptador `tools/3dx/project_env.py` (em andamento: YAML, GUID, prefab, clipe) e evolui para o
leitor nativo `tools/3dx/project/`; `lib3dx.py` e `extract_character.py` ganham um caminho
`--source *.prefab` que usa o adaptador. O caminho de bundle continua funcionando até o gate.
Falta a decodificação de malha (`extract_mesh_project`). Detalhes em
`docs/roadmap/migracao-3dxchat-exportado.md`.

### 0.2 O que o adaptador precisa imitar

Verificado lendo o código atual (`lib3dx.py` e `extract_character.py`):

| Uso no pipeline hoje (UnityPy)                                   | Atributos e métodos exigidos                                                                                         |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `env.objects` iterado com `o.type.name`, `o.path_id`, `o.read()` | `find_mesh`, `build_transforms`, `widest_skeleton_smr`, `pick_smr_for_mesh`, `_select_clip`                          |
| `Transform` (lido com `read()`)                                  | `m_GameObject.read().m_Name`, `m_Father.path_id`, `m_LocalPosition.x/y/z`, `m_LocalRotation.x/y/z/w`, `m_LocalScale` |
| `SkinnedMeshRenderer`                                            | `m_Bones[i].path_id` (lista ordenada), `m_Mesh.path_id`                                                              |
| `Mesh`                                                           | `m_Name`, `m_BindPose[k].e{r}{c}`, e os dados de vértice (passo 5)                                                   |
| `AnimationClip`                                                  | `m_Name`, `m_SampleRate`, `m_RotationCurves[i].path`, `.curve.m_Curve[k].time`, `.value.x/y/z/w`                     |

Todos esses nomes existem **iguais** no YAML do Unity. Basta um wrapper genérico que transforma `dict` em atributos.

### 0.3 Passos (faça nesta ordem; cada um tem critério de pronto)

**Passo 1 — dependência.** Instale PyYAML no Python 3.11 que já tem UnityPy.

```powershell
py -3.11 -m pip install pyyaml
py -3.11 -c "import yaml; print(yaml.__version__, hasattr(yaml, 'CSafeLoader'))"
```

Adicione `PyYAML==<versão impressa>` em `tools/3dx/requirements.txt`.
**Pronto quando:** imprime `True` no segundo valor.

**Passo 2 — extrair só o necessário do zip.** Não extraia o zip inteiro (7 GB).

```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead('C:\dev\New folder\Mv444R.zip')
$want = @(
  'Mv444/3DXChat_Data/character',
  'Mv444/AssetBundles/wear/male/HZmalelatexsuit',
  'Mv444/AssetBundles/wear/female/s_squipanties1cum'
)
foreach ($e in $zip.Entries) {
  if ($want -contains $e.FullName) {
    $dst = Join-Path $env:TEMP ('mv444src\' + ($e.FullName -replace '/', '\'))
    New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($e, $dst, $true)
  }
}
$zip.Dispose()
```

**Pronto quando:** `$env:TEMP\mv444src\Mv444\3DXChat_Data\character` existe com 5 550 001 bytes.

**Passo 3 — baseline com o pipeline atual.** Esta é a referência contra a qual tudo é comparado. Não altere código neste passo.

```powershell
$src = "$env:TEMP\mv444src\Mv444"
py -3.11 tools/3dx/extract_character.py --source "$src\3DXChat_Data\character" --skeleton "$src\AssetBundles\wear\male\HZmalelatexsuit" --mesh man_body man_head man_eyelashes man_penis --gender male --out tools/3dx/build/baseline/character_male.json
py -3.11 tools/3dx/extract_character.py --source "$src\3DXChat_Data\character" --skeleton "$src\AssetBundles\wear\female\s_squipanties1cum" --mesh woman_body woman_head woman_eyelashes --gender female --out tools/3dx/build/baseline/character_female.json
```

**Pronto quando:** os dois JSON existem. **Anote a linha `N verts` impressa para `man_body` e `woman_body`.** Ela resolve a divergência entre o plano (6336 / 9580) e o projeto (6332 / 7905).

**Passo 4 (histórico — substituído pelo leitor nativo) — criar `tools/3dx/project_env.py` (o adaptador).** Especificação original, mantida como referência:

- **4a. Carga do prefab.** `ProjectEnv.from_prefab(prefab_path, extra_files=())`.
  - Ache a raiz `<PROJ>` subindo a partir do prefab até achar a pasta `Assets`.
  - **Mapa de GUID:** varra `<PROJ>\Assets` por `*.meta`. Na linha `guid: <32 hex>` associe o GUID ao caminho do asset (o nome do `.meta` sem `.meta`). Faça uma vez por processo.
  - **Divisão em documentos:** `parts = re.split(r'^--- !u!(\d+) &(-?\d+)\s*$', text, flags=re.M)`. Remova as linhas `%YAML` e `%TAG` do começo antes de dividir. Os blocos vêm em trios: classID, fileID, corpo.
  - **Parse:** cada corpo vai para `yaml.load(corpo, Loader=yaml.CSafeLoader)`. O resultado é um dict com uma chave, o nome da classe (`GameObject`, `Transform`, `SkinnedMeshRenderer`, `Mesh`, `AnimationClip`...).
  - **Índice local:** `{fileID: (classID, className, dados)}`.
  - **Referências:** `{fileID: N, guid: G, type: T}`. Sem `guid` ou com o GUID do próprio arquivo, busque local. Com GUID de outro arquivo, carregue esse arquivo (com cache) e pegue o objeto `fileID`. Mesh principal usa `fileID` `4300000`.
  - **Malhas do SMR:** para cada `SkinnedMeshRenderer` do prefab, resolva `m_Mesh` e inclua o `Mesh` (de outro arquivo) em `objects`. Assim `find_mesh` e `pick_smr_for_mesh` funcionam sem mudança.
  - **`extra_files`** (ex.: um `.anim`): parse e inclua os objetos (`AnimationClip`) em `objects`.
  - `env.objects` é uma lista de `ProjectObject`, com `.type.name` (= nome da classe), `.path_id` (= fileID como `int`) e `.read()` (retorna `Node`).

- **4b. `Node`** (wrapper de dict):
  - `node.campo` devolve o valor já convertido:
    - `{fileID: N}` vira `Ref`: `.path_id = N` e `.read()` devolve o alvo. `N = 0` é nulo.
    - `{x, y, z}` ou `{x, y, z, w}` vira `Node` com `.x`, `.y`, `.z` (e `.w`).
    - `{e00 ... e33}` vira `Node` com `.e00 ... .e33`.
    - lista vira lista de valores convertidos.
    - demais valores ficam como estão.

- **4c. Import.** Os scripts fazem `import lib3dx as L`, então rode a partir de `tools/3dx` ou com `PYTHONPATH=tools/3dx`.

**Pronto quando:** este comando lista pelo menos `Transform`, `GameObject`, `SkinnedMeshRenderer` e `Mesh`:

```powershell
cd tools/3dx
py -3.11 -c "from project_env import ProjectEnv; e=ProjectEnv.from_prefab(r'C:\dev\exported\ExportedProject\Assets\Resources\man\man.prefab'); print(sorted({o.type.name for o in e.objects}))"
```

**Status (2026-10-19):** o passo 4 está implementado em um único módulo `tools/3dx/project_env.py` (sem criar `tools/3dx/project/`): divisão de documentos, índice de GUID com cache, `Ref`/`Node` com a mesma API do UnityPy, carregamento de `.anim` como `extra_files` e malhas do SMR anexadas por GUID. O passo 5 (decodificar `m_VertexData`) também está feito (`extract_mesh_project`, com os streams alinhados a 16 bytes); os dois avatares publicados foram regerados por esse caminho. A **animação** passa por `import_anim_project.py`; as curvas de `slowdance_*` batem 103/103 com o bundle e o par M/F encaixa no render (ver `tools/3dx/README.md` e `docs/guides/3dx-projeto-exportado.md` §3.3/§3.5).

**Passo 5 — malha sem UnityPy: `extract_mesh_project(mesh_node)`** (em `project_env.py`). Retorna o **mesmo dicionário** de `lib3dx.extract_mesh`: `name, verts, normals, uvs, indices, boneIdx, weights, bindposes`.

Regras verificadas no `man_body.asset` e no código do UnityPy (`UnityPy/helpers/MeshHelper.py`, linhas 323–456, que é Unity < 2018):

1. `N = m_VertexData.m_VertexCount`.
2. Canais em `m_VertexData.m_Channels`, cada um com `stream`, `offset`, `format`, `dimension`. Ignore canal com `dimension == 0`.
3. **Ordem dos canais (Unity 5.x):** `0` vértice · `1` normal · `2` cor · `3` UV0 · `4` UV1 · `5` UV2 · `6` UV3 · `7` tangente. (Cuidado: tangente é o **último**, não o terceiro.)
4. **Stride** de cada stream = soma de `dimension × tamanho_do_formato` dos canais daquele stream.
5. **Offset** do stream `s` = soma de `stride_k × N` para `k < s`.
6. **Checagem obrigatória:** soma de `stride × N` == `m_DataSize`. No `man_body`: `40 × 6332 + 20 × 6332 = 379 920` = `m_DataSize`. ✔
7. Endereço do canal `c` no vértice `v`: `offset_do_stream[s] + v × stride[s] + canal.offset`.
8. Dados: `bytes.fromhex(m_VertexData._typelessdata)`, little-endian.
9. **Formatos suportados:** `0` = float32 (`<f`), `2` = UNorm8 (byte / 255). **Qualquer outro:** `raise NotImplementedError` com o número. (No `man_body` aparecem só `0` e `2`.)
10. Posição = canal 0 (3 floats). Normal = canal 1 (3 floats). UV0 = canal 3 (2 floats). Arredonde em 5 casas, como `extract_mesh`.
11. **Índices:** `m_IndexBuffer` (hex) em bytes, **16 bits little-endian** (`<H`). Não existe `m_IndexFormat` nesta versão; o UnityPy também assume 16 bits quando o campo não existe. **Checagem:** `len(bytes) / 2 >= soma(indexCount)`. Para cada `m_SubMeshes[j]` com `topology == 0`: comece em `firstByte // 2` e pegue `indexCount` valores. Concatene em `indices`.
12. **Pesos:** `m_Skin` é uma lista de `N` entradas. Cada entrada tem `weight[0..3]` e `boneIndex[0..3]`. Para cada vértice, na ordem 0..3: `boneIdx` recebe `boneIndex[k]` e `weights` recebe `round(weight[k], 5)`.
13. **bindposes:** cada `m_BindPose[k]` tem chaves `e00..e33`. Achate com `r` por fora e `c` por dentro, `round(x, 6)`, igual a `extract_mesh`.
14. **Compressão:** o `man_body` tem `m_CompressedMesh.m_Vertices.m_NumItems: 0`, então os dados estão em `m_VertexData`. Se algum mesh tiver `m_NumItems > 0`, **pare e registre** esse mesh. Não tente descomprimir agora.

**Pronto quando:** `extract_mesh_project` de `man_body` retorna `len(verts) == 6332`, `len(bindposes) == len(m_BindPose)` e `len(indices)` igual à soma de `indexCount` das submeshes com `topology == 0`.

**Passo 6 — ligar no pipeline (três edições mínimas).**

1. `lib3dx.load_env(path)`: se o caminho termina em `.prefab`, retorne `ProjectEnv.from_prefab(path)`. Um `.anim` sozinho não é carregado aqui; ele entra como `extra_files` no item 3.
2. `lib3dx.extract_mesh(mesh)`: se `mesh` é um `Node` do projeto, retorne `extract_mesh_project(mesh)`.
3. `extract_character.animation_frames(...)`: aceite um parâmetro opcional `aenv=None` e troque `aenv = L.load_env(anim_path)` por `aenv = aenv or L.load_env(anim_path)`. Em `main()`, quando `--source` é `.prefab` e `--anim` é `.anim`, passe `aenv = ProjectEnv.from_prefab(args.source, extra_files=[args.anim])`.

**Pronto quando:** este comando roda **sem** `--skeleton` (o prefab já tem o SMR com o rig):

```powershell
py -3.11 tools/3dx/extract_character.py --source "C:\dev\exported\ExportedProject\Assets\Resources\man\man.prefab" --mesh man_body --gender male --out tools/3dx/build/project/man_body_test.json
```

**Passo 7 — ordem dos ossos (decisão já tomada, não pergunte).** Os joints do jogo são **por índice** (`JOINTS_3DX_MALE`, ADR 0016). O baseline usa a ordem do SMR do `HZmalelatexsuit`. O projeto usa a ordem do `m_Bones` do `man.prefab`. Podem diferir.

- **Regra:** a saída do projeto **tem que manter a ordem do baseline**.
- Implemente `reorder_to_reference(ref_bones, new_bones)` em `project_env.py`. Ela casa pelo `L.bone_key(path)`, reordena `bones`, ajusta `parent` e reindexa `boneIdx` de cada mesh (`novo = mapa[antigo]`). Se faltar osso de um lado, falhe listando os nomes.
- Se a ordem já for igual, a função só confirma e não mexe em nada.

**Passo 8 — o gate: `tools/3dx/compare_json.py`** (novo, stdlib, ~80 linhas).

```powershell
py -3.11 tools/3dx/compare_json.py --ref tools/3dx/build/baseline/character_male.json --new tools/3dx/build/project/character_male.json
```

Checagens, cada uma com PASS ou FAIL:

- **ossos:** mesma quantidade; por índice, `bone_key(path)` igual e `parent` igual; diferença máxima de `rest` e `pos` menor que `1e-4`.
- **malhas** (casadas pelo nome): mesmo `len(verts)`; diferença máxima de `verts` menor que `1e-4`; `indices` idênticos; diferença máxima de `bindposes` menor que `1e-5`.
- **pesos comparados pelo NOME do osso, não pelo índice:** para cada vértice, monte `{bone_key(bones[boneIdx]): weight}` ignorando peso 0 e compare os dois lados com tolerância `1e-4`.
- **clipes** (se houver `world`): mesmo `frames`; diferença máxima de `world[f][i].rot` menor que `1e-3`.
- Saída: tabela com check, valor e PASS/FAIL. Código de saída `1` se algo falhar.

**Gate:** PASS em todos os checks para `character_male` **e** `character_female` → a categoria "personagem" passa a usar **projeto** (ADR 0017). Se FAIL, registre o valor exato no ADR 0017 e a categoria continua no bundle.

**Passo 9 — exportar e provar sem trocar o GLB publicado.**

```powershell
python tools/3dx/run_blender.py export_glb.py -- --json tools/3dx/build/project/character_male.json --out "$env:TEMP\3dx-proj\character_male.glb"
py -3.11 tools/3dx/verify_glb.py --glb "$env:TEMP\3dx-proj\character_male.glb" --rest
```

**Pronto quando:** `maxdisp 0.0000` em todas as malhas. **Não sobrescreva** `apps/web/public/assets/3dx/*.glb` sem avisar o usuário, porque isso muda asset já publicado.

**Passo 10 — roupas e cabelo (só depois do passo 8 passar).**

**10.0 — cobertura (obrigatório antes de qualquer peça).** Os nomes dos bundles de roupa **não existem** como prefab no projeto. Verificado: `s_ManShirt1_ni`, `mpants_1`, `mjockstrap`, `s_EmoShirtF_ni`, `alexwidejeansfem1cum`, `s_pantie_15_ni` e `hair_30` não foram achados. O projeto usa outros nomes (ex.: `boots_1`, `blouse_1`, `cap_1_new_year`, `hair_15`). Gere a tabela:

```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead('C:\dev\New folder\Mv444R.zip')
$bundles = $zip.Entries | Where-Object { $_.FullName -match '^Mv444/AssetBundles/(wear|hair)/(male|female)/[^/]+$' } | ForEach-Object { $_.FullName }
$zip.Dispose()
$proj = Get-ChildItem -Recurse -File 'C:\dev\exported\ExportedProject\Assets\Resources' -Filter *.prefab | ForEach-Object { $_.BaseName }
New-Item -ItemType Directory -Force tools/3dx/build | Out-Null
$bundles | ForEach-Object { $n = Split-Path $_ -Leaf; [pscustomobject]@{ bundle = $n; zip_path = $_; in_project = ($proj -contains $n) } } | Export-Csv tools/3dx/build/cobertura.csv -NoTypeInformation
```

Regra de decisão, por item:

- `in_project = True` → use o prefab do projeto.
- `in_project = False` → use o bundle: extraia **só essa entrada** do zip (como no passo 2) e siga o caminho antigo. Registre `source: bundle` no JSON.

**10.1 — peça com retarget.** Só depois de 10.0. Exemplo com um prefab que **exista**:

```powershell
py -3.11 tools/3dx/extract_character.py --source "C:\dev\exported\ExportedProject\Assets\Resources\woman\cloth\blouse_1.prefab" --skeleton "C:\dev\exported\ExportedProject\Assets\Resources\woman\woman.prefab" --mesh woman_body --gender female --retarget --out tools/3dx/build/project/outfit_female_top_test.json
```

O nome da malha (`--mesh`) vem do `m_Name` do `Mesh` apontado pelo SMR da peça. Se não bater, liste os SMR da peça com o adaptador antes de chutar.

**Passo 11 — clipes** (depois do passo 8 de personagem passar):

```powershell
py -3.11 tools/3dx/extract_character.py --source "C:\dev\exported\ExportedProject\Assets\Resources\man\man.prefab" --anim "C:\dev\exported\ExportedProject\Assets\AnimationClip\stay_pose_1.anim" --anim-root man --anim-clip stay_pose_1 --gender male --out tools/3dx/build/project/character_male_idle.json
```

Compare com o `idle` do baseline (`resources.assets`): mesmo número de quadros e diferença máxima de `world` menor que `1e-3`. Confirme antes a contagem: o plano diz 201 quadros (M) e 41 (F), mas isso não foi verificado no projeto (A0.4).

**Passo 12 — registrar.** Atualize o ADR 0017 (aceito por categoria), `tools/3dx/README.md`, `docs/guides/3dx-nativo.md` (com os comandos de projeto) e o manifesto (G5) com o campo `source`.

### 0.4 Não faça

- Não extraia o zip inteiro.
- Não mude `export_glb.py` nem `verify_glb.py`. O JSON é o contrato.
- Não sobrescreva `apps/web/public/assets/3dx/*.glb` antes do passo 9 e sem avisar o usuário.
- Não use `Select-String` com padrão genérico em `.asset` ou `.anim`. Há linhas de hex com centenas de KB. Use padrão ancorado (`^  m_Name:`) ou `Get-Content -TotalCount`.
- Não adicione UnityPy ao caminho do projeto.
- Não crie o pacote `tools/3dx/project/` **antes do gate**: nesta fase é um módulo só
  (`project_env.py`). A separação em módulos é limpeza pós-gate (P1 do plano revisado).
- Não assuma que um nome de bundle existe no projeto. Consulte `cobertura.csv`.

### 0.5 Pendências que não bloqueiam os passos 1 a 9

- Mapa de roupas e cabelos (passo 10.0).
- `level20`/`level7` no projeto (R7) — **resolvido em 2026-10-20**: as cenas existem com outro nome, `scenes\char_editor_decor.unity` (closet) e `scenes\club.unity` (balada).
- **Clipes de par/cuddle não estão no export atual.** Verificado: não há `cuddle` em nenhum arquivo de `Assets\AnimationClip` (há `slowdance_*`, mas não `cuddle`). A única ocorrência de `cuddle` no projeto é um botão de UI (`gui.unity`). O par (`mf/rel/man@cuddle_man` e `mf/rel/woman@cuddle_woman`) existe no zip, que **não está criptografado** (verificação de 2026-10-19). Solução: exportação completa dos `AssetBundles` (P0 do plano revisado); enquanto isso, `slowdance_man`/`slowdance_woman` são pares nativos reais.
- Demais clipes de Fase E (`kisscheek`, `slowdance` de bundle) também devem ser conferidos contra o projeto, que tem `slowdance_*` mas não `kisscheek`.

### Mapa de fonte por categoria

| Categoria                       | Fonte primária (projeto)                                                    | Fallback (zip)                                                    | Passo                  |
| ------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------- |
| Corpo, cabeça, cílios, anatomia | `Resources\man\man.prefab`, `Resources\woman\woman.prefab` e `Mesh\*.asset` | `3DXChat_Data/character`                                          | 3 a 9                  |
| Esqueleto                       | SMR do prefab (`m_Bones`)                                                   | `wear\...\HZmalelatexsuit` (M) e `wear\...\s_squipanties1cum` (F) | 7                      |
| Idle, walk, poses               | `AnimationClip\*.anim`                                                      | `resources.assets`                                                | 11                     |
| Roupas (Fase C)                 | `Resources\{man,woman}\cloth\*.prefab`                                      | `AssetBundles\wear\...`                                           | 10                     |
| Cabelo (Fase D)                 | `Resources\{man,woman}\hair\*.prefab`                                       | `AssetBundles\hair\...`                                           | 10                     |
| Pele, olhos, tatuagem (Fase F)  | `Resources\{man,woman}\cust_face`, `cust_body`, `Texture2D\*.png`           | `AssetBundles\Textures`, `3DXChat_Data\facetattoo*`               | fase F, não verificado |
| Salas (Fase R)                  | `scenes\*.unity` (ver 0.5)                                                  | `3DXChat_Data\level*`                                             | fase R, não verificado |

---

## 0. Objetivo e princípios

Trazer os assets do 3DXChat nativo (personagens, roupas, cabelo, animações, customizações) para o nosso jogo Babylon.js, sem retarget (usando o esqueleto nativo), e gradualmente.

Princípios:

1. **Fonte primária é o projeto Unity exportado** em `C:\dev\exported\ExportedProject` (YAML de texto, editor 5.5.5p2), lido pelo adaptador `tools/3dx/project_env.py`. **Fallback é o cliente em `C:\dev\New folder\Mv444R.zip`** (entradas `Mv444/...`, bundles e `3DXChat_Data`). `C:\dev\Mv444` não serve mais como fonte nesta máquina (ver seção 0.1). Decisão: ADR 0017.
2. **Nativo, não adaptado.** Usar o esqueleto e as animações originais (sem retarget). O pipeline em `tools/3dx/` é a fonte do modelo 3DX.
3. **Não otimizar os GLB** (sem `weld`/`prune`/`simplify`/`quantize`/`meshopt`). Decisão explícita: fidelidade primeiro; otimização é fase futura e medida.
4. **Nada de conte?do expl?cito** em texto/c?digo. Anatomia ? parte do corpo, oculta sob a roupa.
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
| Primitivos/cenário  | `AssetBundles\primitives`, `3DXChat_Data\level*`                              | props e cenas (piloto da `level20` em andamento)                                                                                                                   |

Formato dos bundles: `UnityFS` (Unity 5.4.3f1). **Alguns estão criptografados** (não começam com `UnityFS`) → ignorar e escolher o par em texto claro.

**Fato que destrava a Fase B:** o personagem base (com mãos e pés) **não** está em `wear`; está em `3DXChat_Data\character`. O `man_body` que aparece nos itens de roupa é a malha da **peça** (nominalmente reusada), não o corpo nu.

---

## 1b. Fonte nova: projeto exportado (resumo para quem lê o plano)

Verificado em 2026-10-19 no projeto em `C:\dev\exported\ExportedProject`:

- **Malhas** em `Assets\Mesh\*.asset`, YAML com `m_VertexCount`, `m_IndexBuffer`, `m_BindPose`, `m_Skin`. Contagens: `man_body` 6332, `woman_body` 7905, `man_head` 2181, `woman_head` 2580, `man_penis` 492, `man_eyelashes` 170.
- **Prefabs** de personagem em `Assets\Resources\man\man.prefab` e `woman\woman.prefab` (SMR com rig completo).
- **Prefabs por peça**: `Resources\man\cloth` = 57 prefabs, `Resources\woman\cloth` = 97, `Resources\man\hair` = 14, `Resources\woman\hair` = 29. Total de prefabs em `man` e `woman`: 199.
- **Clipes** em `Assets\AnimationClip\*.anim` (79 arquivos, 325 MB): `stay_pose_1..5` (+ `_0`), `walk`, `walk_0`, `slowdance_*`, `dance`, `strip*`, `run`, `swim`.
- **Texturas**: 1574 PNG em `Assets\Texture2D` (946 MB).
- **Cenas**: 16 `.unity` em `Assets\scenes`.
- **Cobertura do export atual**: ele foi gerado a partir de `3DXChat_Data` (o `path_id_map.json` só lista os 49 arquivos principais: `level0..21`, `resources.assets`, `sharedassets*`, `globalgamemanagers`). Portanto **não** contém todos os itens de `AssetBundles`: o zip tem 1 169 bundles de `wear` e 178 de `hair`, contra 57/97 e 14/29 prefabs no projeto. A exportação completa é a Fase P0 do plano revisado.

Diferenças em relação ao plano original (bundles):

- Os nomes de roupa e cabelo da Fase C/D **não** são os mesmos: `s_ManShirt1_ni`, `mpants_1`, `mjockstrap`, `s_EmoShirtF_ni`, `alexwidejeansfem1cum`, `s_pantie_15_ni` e `hair_30` não existem como prefab. Por isso existe o passo 10.0 (tabela de cobertura).
- As contagens de vértice do corpo não batem com os valores escritos na seção B2 (`6336`, `9580`, `2180`, `2586`). Resolvido pelo passo 3 da seção 0.1 (`baseline`).

Mapa completo por categoria: seção 0.1, "Mapa de fonte por categoria".

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

## 2b. Fases A0 e A6 — fonte e leitor do projeto (referência)

O passo a passo está na seção 0.1 e é o que deve ser executado. Aqui ficam só os critérios de fase.

### Fase A0 — Fonte e fidelidade (gate)

Corresponde aos passos 2, 3 e 8 da seção 0.1.

- [ ] A0.1 Zip extraído só com as três entradas do passo 2 (`character`, `HZmalelatexsuit`, `s_squipanties1cum`).
- [ ] A0.2 Baseline gerado pelo pipeline atual (passo 3), com o número de vértices anotado.
- [ ] A0.3 `compare_json.py` com PASS em todos os checks para `character_male` e `character_female` (passo 8).
- [ ] A0.4 Clipe `stay_pose_1`: número de quadros do bundle × projeto (passo 11).
- [ ] A0.5 Tabela de cobertura gerada (passo 10.0), com a lista de itens que faltam no projeto.
- [ ] A0.6 Diferença de versão 5.4.3 (bundle) × 5.5.5 (projeto) analisada pelo resultado do gate. Se o gate passar, a diferença não afeta os campos lidos.
- [ ] A0.7 Decisão por categoria registrada no ADR 0017 (passo 12).

**Aceite:** tabela de divergências preenchida no ADR 0017 e decisão por categoria registrada.

### Fase A6 — Leitor do projeto (`tools/3dx/project_env.py`)

Corresponde aos passos 4 a 7 e 10.1 da seção 0.1.

- [ ] A6.1 Adaptador com a API da tabela 0.2 (passo 4).
- [ ] A6.2 `extract_mesh_project` com checagem de `m_DataSize` (passo 5).
- [ ] A6.3 Três edições mínimas em `lib3dx.py` e `extract_character.py` (passo 6), sem mudar o comportamento do caminho bundle (conferir rodando o passo 3 de novo).
- [ ] A6.4 Ordem de ossos igual ao baseline (passo 7).
- [ ] A6.5 Testes: `tools/3dx/test_project_env.py` (stdlib `unittest`), cobrindo a divisão de documentos, o stride e as contagens de `man_body`.

**Aceite:** passo 8 PASS para personagem e passo 9 com `maxdisp 0.0000`.

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

## 4. Fase B — Personagens (masculino e feminino) ✔ concluída

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

### B3. Anatomia (parte do corpo)

- [x] `man_penis` como **quarta peça dentro de `character_male.glb`** (um armature, quatro malhas: corpo, cabeça, cílios e anatomia). Decisão desta fase: o 3DX ainda **não tem catálogo de peças** (Fase C/G), então a anatomia não pode ser um GLB à parte equipável ela entra como peça separada **no mesmo arquivo** e pode ser separada depois, quando o catálogo 3DX existir. Nome do mesh e do osso vêm da fonte (`man_penis`, `man_bone_pen_*`), como todo o resto do pipeline; o mapa de juntas não muda (a peça usa `b4`/`b8`/`b9`/`b10`/`b14`).
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

**Objetivo:** trazer os itens de roupa como peças skinnadas no esqueleto do personagem base. O primeiro conjunto veio de bundles; desde 2026-10-20 a fonte é `Resources\{man,woman}\cloth` do projeto exportado.

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
- [x] C8. Integração no jogo: slot `underwear` em `PART_SLOTS`/schema/defaults/UI; 6 entradas iniciais no catálogo (`FREE_PART_IDS`); `attachAvatarParts` troca o esqueleto clone da peça pelo **esqueleto do corpo** quando `sameBoneLayout` confirma a mesma ordem de ossos (a peça passa a acompanhar idle/walk nativos); a roupa íntima combina com a peça de baixo (camada independente, exibe junto com calça/saia); a anatomia masculina (`man_penis`) some com `bottom` ou `underwear`.
- [x] C9. Prova: `verify_glb.py --rest` = `maxdisp 0.0000` nos 6 GLBs; testes de skinning do corpo e das peças; `viewer3dx.html?outfit=all` mostra o corpo + peças no mesmo esqueleto, acompanhando o idle.
- [x] C10. 2026-10-20: **reexportação só do projeto** (`Resources/{man,woman}/cloth/*.prefab`, sem bundles). O contrato de rest pose/esqueleto foi congelado em `tools/3dx/rigs/3dx_{male,female}.json` e é lido por `--skeleton-json`. A coleção passou de 6 para **28 ids** (13 masculinos / 15 femininos), incluindo tops, outerwear, calças, shorts, saias, cuecas, calcinhas e sutiãs. Todos os GLBs publicados são byte a byte os mesmos antes/depois da troca de fonte; `verify_glb --rest` = `maxdisp 0.0000` e os testes (`sameBoneLayout`) passam nos 28.
- [x] C11. 2026-10-20: **acessórios nativos** — 5 chapéus, 5 óculos e 5 máscaras por gênero (30 GLBs). Chapéus usam `extract_character.py --retarget`; óculos/máscaras são rígidos e viram skin de 1 osso na cabeça (`extract_accessory_project.py`). Novo slot `mask` em `PART_SLOTS`/`AvatarConfig`; `hat` e `glasses` já existiam. Lote em `export_accessories_project.py`; `verify_glb --rest` = `maxdisp 0.0000` nos 30.
- [x] C12. 2026-10-20: **tatuagens 3DX** — 10 desenhos autorais em `assets/3dx/decals/14_tattoo_autoral/` + `3dx/decals/manifest.json`; `DECAL_CATEGORIES`/`DECAL_SLOTS`/`DecalChoice` voltam ao contrato já como 3DX e `decals` entra no `AvatarConfig`. `decals-3dx.ts` projeta pedaços da pele do corpo/cabeça com âncoras por gênero (`DECAL_ANCHORS_3DX_MALE/FEMALE`, ossos `bN`); o pescoço cai no plano preso ao osso. Teste `decals-3dx.test.ts` cobre manifesto e os dois gêneros.

**Aceite:** um conjunto pequeno de roupas trocável no jogo (viewer/vestiário), sem mover o esqueleto (regra 2 do guia de assets). ✔ 28 peças masculinas/femininas + 30 acessórios (5 chapéus, 5 óculos e 5 máscaras por gênero); `?outfit=top|outerwear|bottom|underwear|all` no `viewer3dx.html` mostra as roupas sobre o corpo.

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
- [x] E0c. Piloto de pose: extrair `stay_pose_2` (41 quadros @ 30 fps) M/F como action `pose01` no mesmo corpo, mapear `RIGS['3dx-*'].clips.pose01`/`motionClip` e validar `verify_glb.py --anim pose01`. O padrão `--extra-anim <json> poseNN` fica pronto para as próximas poses.
- [x] E0d. Piloto de par M/F: `pair01` (slowdance, 111 quadros @ 30 fps) nos dois corpos; `motionClip` mapeia `pair01` para o clipe nativo nas interações consentidas `pose-intimate` e `hug`. `PAIR_POSES` coloca a parceira ? frente e de frente (offset 0,25 m, yaw 180?).
- [ ] E1. Escolher o **par em texto claro** de cada clipe (alguns bundles são criptografados).
- [ ] E2. Extrair `AnimationClip` + esqueleto posado; calcular o **delta vs idle** (o clipe não traz o rest absoluto).
- [ ] E3. Para cada quadro, escrever TRS local por osso (regra 6 da seção 2) e embutir no GLB do personagem **ou** exportar `apps/web/public/assets/3dx/anim/<grupo>/<nome>.glb`.
- [ ] E4. Catálogo de clipes em JSON (como `3dx/clips/clips-male.json`), por gênero e por grupo (`m`, `f`, `mf`, `mm`, `mff`, `ingame`...).
- [ ] E5. Validação dupla por clipe: `skin_export.py` (referência) × `verify_glb.py` (GLB), quadro a quadro.
- [ ] E6. No cliente, reusar o `ClipPlayer` (crossfade) — ou um novo `clip-player-3dx.ts` se o eixo/formato diferir.

**Aceite:** tocar ≥5 clipes nativos por gênero, sem artefato, com deslocamento máximo do GLB batendo com a referência. Marco atual (E0/E0b): idle e walk nativos nos dois gêneros, sem deformação de membros e com as roupas acompanhando. ✔

---

## 8. Fase F — Customizações

**Objetivo:** pele, olhos, tatuagens faciais, cores e (se houver) morphs.

- [x] F1a. **Pele no corpo:** o atlas nativo (albedo 2048² + normal map) entra por `extract_body_textures_project.py` nos GLBs `character_{male,female}.glb`; o tom da paleta vira multiplicador relativo à pele do atlas (`skinTint` em `avatar-colors.ts`), então os seis tons continuam distintos.
- [ ] F1b. **Peles alternativas por catálogo:** `skins/<gender>/<id>.webp` + `SKIN_TEXTURES` (o 3DX muda a pele por textura, não só por tint).
- [ ] F2. **Olhos/sobrancelhas/lábios** (se houver recursos próprios).
- [ ] F3. **Tatuagens faciais:** `3DXChat_Data\facetattooman` / `facetattoowoman` → decalques. Reusar o mecanismo de decalque do repo (`decals-3dx.ts` + `decal-projection.ts`).
- [ ] F4. **Cores:** reusar `PALETTE` + tint; comprovar no modelo 3DX.
- [ ] F5. **Morphs/shape keys:** o 3DX usa forma fixa; o catálogo não expõe morphs.
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
      piercings e detalhes. Resultado pelo projeto (2026-10-20): 102 malhas,
      341 919 triângulos, GLB de 16,8 MB (texturas 512 px).
- [ ] R4. Integrar no jogo: colisões, spawns, descarte e troca de sala; medir
      FPS/malhas com avatares.
- [x] R5. Balada (`level7`): extrair com LOD0 (sem duplicar LOD1+), raízes
      `LEVEL`, `bar_1`, `dj_pult` e coquetéis. Pelo projeto (2026-10-20): cena
      `scenes\club.unity`. Reimportada em 2026-10-20 na melhor qualidade da fonte:
      56 malhas, 47 945 triângulos, 59 texturas PNG nativas, normal/emissive e
      tangentes, GLB de 10,6 MB. É o **hall inicial** do jogo, com luzes
      coloridas, glow, câmera de frente para o bar e colisão de paredes vinda do
      `collider_level` (`packages/game-core/src/club-walls.ts`); `viewer-club.html`
      continua abrindo a cena para inspeção.
- [ ] R6. Próximas salas: escolher por tamanho/uso e repetir o pipeline; integrar
      as demais no jogo (colisão/spawn/carga por sala).

**Aceite do piloto:** abrir `viewer-room.html` e ver o quarto completo com
móveis e vidros; o aceite de jogo exige R4.

---

## 9. Fase G — Integração no jogo (Babylon)

**Objetivo:** o 3DX nativo ? a **única fam?lia de modelo** no jogo.

### Passos

- [x] G1. Decisão (ADR novo): o 3DX substitui o modelo anterior? → **ADR 0016: modelo ?nico 3DX.**
- [x] G2. `avatar-model.ts`: mapa de juntas do 3DX (`JOINTS_3DX_*`); `RIGS['3dx-*']` declara os clipes embutidos; `applyMotion` toca idle/walk nativos e ajusta a velocidade do walk; `attachAvatarParts` recebe o esqueleto do corpo.
- [ ] G3. Nome de arquivo = ID do catálogo; corpo base é a raiz; peças skinnadas no esqueleto do corpo; acessórios rígidos no osso.
- [ ] G4. Carregamento assíncrono com cache e **fallback** para o manequim (regra do guia de assets).
- [ ] G5. Manifesto (`apps/web/public/assets/manifest.json` ou o manifesto 3DX) com `id/path/bytes/sha256/version/origin/license`.
- [ ] G6. Testes: `mannequin.test.ts` (trocar aparência não move o esqueleto) e os testes de avatar seguem verdes.
- [ ] G7. Medir (regra 7 do guia): `world.perf.test.ts`, painel de FPS/malhas com bots.

**Aceite:** entrar no mundo com um avatar 3DX, andar, sentar, dançar; testes e typecheck verdes.

---

## 10. Ordem de execução (resumo)

```
A0 (fonte e gate) → A6 (leitor do projeto) → B (personagens M/F) → C (roupas) → D (cabelo) → E (animações) → F (customizações) → G (integração)
```

B e C andam em sequência; D/E/F podem andar em paralelo depois de B, mas cada uma só "entra no jogo" via G.

Verificação do repo (confirmar nomes no `package.json`):

- `pnpm check` = `format:check && lint && typecheck && test && build` (só quando tocar no repo; até então só arquivos novos em `public/`).
- `pnpm --filter @3dx/web dev` + abrir `http://localhost:5173/viewer3dx.html`.

---

## 11. Riscos e perguntas abertas

1. **Base: corpo + cabeça juntos ou peças?** ~~Decidir em B2.~~ **Resolvido:** um GLB por gênero com um armature e três malhas (corpo, cabeça, cílios), como peças dentro do mesmo arquivo (B2).
2. ~~**Família de modelo vs. troca definitiva do modelo anterior.**~~ **Resolvido:** modelo ?nico 3DX (ADR 0016); `3dx-male`/`3dx-female` são a única fam?lia.
3. **Tamanho dos GLB.** Sem otimização, o corpo pode ficar grande . Medido: `character_male.glb` 2,84 MB (rest, com anatomia) / 5,7 MB (com 1 anim); `character_female.glb` 4,0 MB / 8,4 MB. **Publicados em rest** (2,84 MB / 4,0 MB); o feminino ainda fica acima do orçamento do guia (≤3 MB) — avaliar otimização **medida** numa fase futura. Fase C: camisa masculina 2,58 MB (bundles densos; `alextshirt1male1cum` é a alternativa leve, ~2.920 verts fonte), cueca 1,61 MB, calça M 0,31 MB, top F 0,81 MB, calça F 1,21 MB, calcinha F 0,51 MB — todos individualmente abaixo de 3 MB.
4. **Criptografia de bundles.** Alguns itens (roupa/anim) vêm criptografados. Sempre escolher o par em texto claro; se um item só existir criptografado, registrar como indisponível.
5. **Licença/origem.** Todo asset precisa da entrada no manifesto (regra 6 do guia de assets). Confirmar a origem/uso dos assets do cliente antes de ir para produção.
6. **Morphs/shape keys** podem não existir no 3DX; confirmar em F5.
7. **Texturas e materiais** do 3DX usam shaders próprios; o mapeamento para material Babylon precisa de verificação (F1/F3). No B, o material é provisório (cor de pele chapada).
8. **Esqueleto de referência.** O rig vem de um bundle de `wear`; boneco M `HZmalelatexsuit` (322 ossos), F `s_squipanties1cum` (464 ossos). Nomes diferem por bundle (M com underscore, F com espaço, raiz `item/item_1/`) → casar clipes pelo **nome do osso** (`lib3dx.bone_key`), não pelo caminho completo.

---

9. **Fidelidade do projeto exportado.** As contagens de vértice do projeto divergem do plano (`corpo M` 6332 × 6336; `corpo F` 7905 × 9580; `cabeça M` 2181 × 2180; `cabeça F` 2580 × 2586). Não usar nenhum item do projeto no jogo antes do passo 8 da seção 0.1.
10. **Cobertura.** Nomes de roupa e cabelo da Fase C/D não existem no projeto. Qualquer item sem prefab correspondente vai para o fallback de bundle, registrado no JSON (`source: bundle`). Nunca presuma que um nome existe; consulte `tools/3dx/build/cobertura.csv` (passo 10.0).
11. **Versão do editor.** Projeto em 5.5.5p2; bundles em 5.4.3. O leitor assume a regra de canais do Unity < 2018 (passo 5). Se um campo mudar de forma, o gate (passo 8) acusa.
12. **Tamanho do parse.** Os `.anim` vão até 19,7 MB. Usar `CSafeLoader` e medir o tempo de carga antes de carregar clipes em lote.
13. **Dependência nova.** PyYAML entra em `tools/3dx/requirements.txt` (passo 1). Justificativa no ADR 0017.

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

Arquivos novos previstos (ainda não criados): `tools/3dx/project_env.py` (A6), `tools/3dx/compare_json.py` (A0), `tools/3dx/test_project_env.py` (A6.5), `tools/3dx/build/cobertura.csv` (passo 10.0, gerado, não versionado).

---

## 12. Histórico de decisões

- **2026-10-19 — fonte passa a ser o projeto exportado.** Decisão em `docs/decisions/0017-fonte-projeto-exportado-3dx.md` (proposta, aceita por categoria após o gate). Bundles em `Mv444R.zip` viram fallback.
- **2026-10-19 — caminho do projeto mudou.** Estava em `C:\dev\New folder\exported\ExportedProject`; agora está em `C:\dev\exported\ExportedProject`.
- **2026-10-19 — `C:\dev\Mv444` passou a ser o cliente extraído.** Antes só tinha `AssetBundles\animation` vazio; agora tem 5 669 arquivos (`AssetBundles`, `3DXChat_Data\character`, `resources.assets`) e é o baseline/fallback dos clipes. O zip (`Mv444R.zip`) não é mais necessário.
- **2026-10-19 — animação e corpo pela nova forma.** `project_env.py` (decodifica `m_VertexData`/`m_Skin`/`m_BindPose`) + `import_anim_project.py` leem o `.anim` do projeto; o par M/F encaixa no offset **0,25 m**/yaw 180°. Os GLBs publicados (`character_{male,female}.glb`) foram regerados por esse caminho — corpo do projeto remapeado para o esqueleto de `wear` + idle/walk/pose01 + `pair01` — com `verify_glb --rest` `maxdisp=0` e backup dos antigos em `%TEMP%\opencode\3dx-published-backup-2026-10-19`. A ordem dos ossos (322/464) continua sendo o contrato das roupas publicadas; reexportar roupas/cabelos pelo projeto é o próximo passo.
- **2026-10-19 — mais dois pares M/F no corpo publicado.** `slowdance_kiss` → `pair02` e `slowdance_invert` → `pair03`, cada lado importado do `.anim` do parceiro (`slowdance_*_woman` no masculino, `slowdance_*_man` no feminino), 111 quadros @ 30 fps. Os GLBs `character_{male,female}.glb` foram reexportados com os seis clipes (`idle`, `walk`, `pose01`, `pair01`, `pair02`, `pair03`) e `verify_glb --rest` deu `maxdisp=0`; backup do par anterior em `%TEMP%\opencode\3dx-published-backup-2026-10-19-pair02-03`.
- **2026-10-19 — contagens de vértice do projeto divergem do bundle** (6332×6336, 7905×9580, cabeças 2181×2180 / 2580×2586, cílios 170×210). Por isso o corpo publicado continua vindo do bundle; a animação já pode vir do projeto.
- **2026-10-19 — nomes de roupa e cabelo do plano não existem no projeto.** Cobertura medida pelo passo 10.0 antes de qualquer exportação.
- **2026-10-19 — plano reescrito para execução por outra IA.** Seção 0.1 com passos numerados e critérios de pronto; reuso de `lib3dx`/`extract_character`/`export_glb` como regra.
- **2026-10-20 — texturas nativas no corpo e nas roupas.** `extract_body_textures_project.py` (novo, com `project_textures.py` compartilhado) lê `_MainTex`/`_BumpMap` dos materiais do projeto e grava PNG lossless na resolução original; o `export_glb.py` embute os bytes sem reencode e ganhou `normalScale` (o `_BumpMapPower` 1,5 vira `normalTexture.scale`). `character_male.glb` 11,8 → **16,2 MB**, `character_female.glb` 13,7 → **14,4 MB** (corpo 2048² + cabeça + normais + tangentes, sem perder resolução); `verify_glb --rest` `maxdisp=0` nos dois. As 28 roupas saíram com albedo (15 peças têm `_MainTex`) + normal map de todas, 20,9 MB no total, `maxdisp=0` em 28/28. Como o atlas já traz pele desenhada, o tom da paleta passou a ser multiplicador relativo (`skinTint`) em `avatar-colors.ts`, `viewer3dx.html` e `viewer-closet.html`; `NATIVE_ASSET_VERSION` foi para 10. Backup dos GLBs anteriores em `%TEMP%\opencode\3dx-published-backup-2026-10-20-textures`.
- **2026-10-20 — corpo com normais suaves.** Com o `materials.json` o `export_glb.py` passou a aplicar as normais do JSON (`smooth`), então o GLB deixou de ser facetado: o corpo feminino foi de 42 514 para 7 906 vértices no accessor (vértices compartilhados). O centro do decalque das costas anda ~0,3 mm e o limite do teste foi ajustado para `-0,035`.
- **2026-10-20 — roupa não atravessa mais a pele.** O retarget deixava o pano 1–3 mm dentro da pele no repouso (até −22 mm na calça, 177 vértices no `tshirt_4`) e com pesos próprios, então no idle o corpo aparecia em manchas. O lote de roupas agora roda `fit_cloth.py` (folga 6 mm, `clearance` 5 mm, Gaussiana 12 mm, espelho em X) antes do `export_glb.py`: `tshirt_4` 177 vértices dentro → 0; `jeans_1` 127 → 0. As 28 peças foram reexportadas, `verify_glb --rest` segue `maxdisp=0` e a renderização no idle (frente e costas, M e F) não mostra mais pele pelo tecido. O cabelo continua no asset antigo do bundle (Fase D pelo projeto está pendente), então não entra nesse encaixe.
- **2026-10-20 — `doubleSided` nas roupas + folga por slot.** O casaco (e qualquer peça de uma camada) mostrava "buracos" de pele no ombro/axila: era o **verso** do tecido sendo descartado pelo backface culling, não interpenetração. Todas as peças passaram a sair com `doubleSided: true` (como no 3DX), e a folga do `fit_cloth.py` agora vem do slot — sobretudo 12 mm de `clearance` / 8 mm de base (peça solta, pesos de regiões distantes), topo/baixo 7/6 mm, roupa íntima 5/4 mm. Com isso o casaco não mostra mais pele no ombro nem no cotovelo, e as peças justas continuam justas.
