# Guia: projeto Unity exportado (fonte 3DX)

Como ler o projeto Unity exportado do 3DXChat como fonte dos assets do jogo. Decisão e motivos
em `docs/decisions/0017-fonte-projeto-exportado-3dx.md`; ordem de execução em
`docs/roadmap/migracao-3dxchat.md` (fases A0 e A6).

> **Estado:** em uso. `tools/3dx/project_env.py` lê YAML, GUID, prefab, **malha** e clipe;
> `import_anim_project.py` importa qualquer `.anim`. Em 2026-10-19 os dois avatares publicados
> (`character_{male,female}.glb`) foram regerados por esse caminho — corpo, idle, walk, pose01 e o
> par `pair01` — e validados com `verify_glb.py --rest` (`maxdisp=0`) e render. O alvo de médio
> prazo é separar o leitor nativo `tools/3dx/project/` (`yaml_docs`, `guid_index`, `prefab`,
> `mesh`, `anim`, `scene`, `materials`); o adaptador é a ponte e não será descartado. O plano
> executável é `docs/roadmap/migracao-3dxchat-exportado.md`.

---

## 1. Localização

| Item               | Caminho                                             |
| ------------------ | --------------------------------------------------- |
| Projeto (`$PROJ`)  | `C:\dev\exported\ExportedProject`                   |
| Auxiliares         | `C:\dev\exported\AuxiliaryFiles`                    |
| Bundles (fallback) | `C:\dev\Mv444` (extraído) e `Mv444R.zip` se preciso |

`AuxiliaryFiles` tem `path_id_map.json` (781 KB, mapa de `PathID` para nome e tipo, por arquivo de
origem) e `GameAssemblies\` (DLLs gerenciadas: `Assembly-CSharp.dll` etc.). As DLLs não entram no
pipeline de assets; podem ajudar a conferir nomes de campos de script (`MonoBehaviour`) no futuro.

Versão do editor: `ProjectSettings/ProjectVersion.txt` → `m_EditorVersion: 5.5.5p2`.
Os bundles do cliente foram gerados com Unity 5.4.3 (roadmap, seção 1). A diferença de versão
precisa ser coberta pelo gate A0.6.

## 2. Layout verificado

Contagens feitas com `Get-ChildItem` em 2026-10-19. Quando a contagem inclui `.meta`, está dito.

| Pasta (`$PROJ\Assets\...`)         | Conteúdo                                                                                                                    |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `Mesh\`                            | `.asset` YAML de malhas (`man_body.asset`, `woman_head.asset`, `hair_15.asset`, ...)                                        |
| `Resources\man\man.prefab`         | prefab do personagem masculino (malhas `man_body`, `man_head`, `man_eyelashes`, `man_penis`)                                |
| `Resources\woman\woman.prefab`     | prefab do personagem feminino (`woman_body`, `woman_head`)                                                                  |
| `Resources\{man,woman}\cloth\`     | roupas, prefab por peça (man: 57 prefabs; woman: 97 prefabs)                                                                |
| `Resources\{man,woman}\hair\`      | cabelos, prefab por peça (man: 14 prefabs; woman: 29 prefabs)                                                               |
| `Resources\{man,woman}\cust_face\` | customização de rosto: **só PNG** (man: 11; woman: 25) — textura, não malha                                                 |
| `Resources\{man,woman}\cust_body\` | customização de corpo: **só PNG** (man: 2; woman: 13)                                                                       |
| `AnimationClip\`                   | 79 `.anim` (325 MB): `stay_pose_1..5` (+ variantes `_0`), `walk`, `walk_0`, `slowdance_*`, `dance`, `strip*`, `run`, `swim` |
| `Avatar\`                          | `.asset` YAML de avatares humanoides (ex.: `BedAvatar.asset`, `hair_10Avatar.asset`)                                        |
| `Texture2D\`                       | 1 574 PNG (946 MB) e seus `.meta`                                                                                           |
| `Material\`                        | 929 `.mat` (3 MB)                                                                                                           |
| `scenes\`                          | 16 `.unity` (ex.: `club.unity`, `beach.unity`, `SALOON.unity`)                                                              |
| `Prefab` em `GameObject\`          | 776 `.prefab` no total do projeto                                                                                           |

**Cobertura:** o export atual foi gerado a partir de `3DXChat_Data`; o `path_id_map.json` lista
apenas os 49 arquivos principais (`level0..21`, `resources.assets`, `sharedassets*`,
`globalgamemanagers`). Ele **não** contém todos os itens de `AssetBundles` — o zip tem 1 169 bundles
de `wear` e 178 de `hair`. A exportação completa (AssetRipper sobre os bundles) é a Fase P0 do plano
revisado. O zip **não está criptografado** (extração de `app.info` verificada).

Não confirmado: `level20` e `level7` (salas do roadmap) não aparecem pelo nome entre as cenas
listadas. A verificação está na Fase A0.5 e R7.

## 3. Formato Unity YAML (regras de leitura)

### 3.1. Documentos

Cada arquivo de asset é uma sequência de documentos YAML separados por cabeçalho Unity:

```
%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!43 &4300000
Mesh:
  serializedVersion: 8
  ...
```

- `!u!<classID>` é o tipo do objeto; `&<fileID>` é o identificador local no arquivo.
- Antes de carregar com PyYAML, troque `--- !u!N &M` por `---` e trate o tipo pela chave de topo
  (`Mesh:`, `GameObject:`, `Transform:`, ...). Não use o tag como dado.
- Um arquivo pode ter vários objetos (ex.: um prefab tem `GameObject`, `Transform`,
  `SkinnedMeshRenderer` e `MonoBehaviour` juntos).

ClassIDs usados (tabela padrão do Unity; confirmar na Fase A6 contra os arquivos):

| classID | Tipo            | classID | Tipo                  |
| ------: | --------------- | ------: | --------------------- |
|       1 | `GameObject`    |      90 | `Avatar`              |
|       4 | `Transform`     |      91 | `AnimatorController`  |
|      21 | `Material`      |      95 | `Animator`            |
|      23 | `MeshRenderer`  |     114 | `MonoBehaviour`       |
|      28 | `Texture2D`     |     137 | `SkinnedMeshRenderer` |
|      33 | `MeshFilter`    |    1001 | `PrefabInstance`      |
|      43 | `Mesh`          |         |                       |
|      74 | `AnimationClip` |         |                       |

Verificados nos arquivos lidos: `!u!1` (GameObject), `!u!43` (Mesh, com `&4300000`) e `!u!90`
(Avatar).

### 3.2. Referências e GUID

- Referência local: `{fileID: 4300000}`.
- Referência a outro arquivo: `{fileID: 4300000, guid: <32 hex>, type: 3}`.
- `fileID: 0` é nulo.
- Cada asset tem um `.meta` com a linha `guid: <32 hex>`. O mapa `guid → caminho` é montado
  varrendo todos os `.meta` de `$PROJ\Assets` (são 9123 `.meta` no projeto).
- Nomes de arquivo com acento e caracteres não-ASCII são normais (ex.: `Bar_n.png`, `bar_1 illum.png`,
  pastas com espaço). Use `pathlib` com UTF-8.

### 3.3. Malha (`Mesh`)

Campos observados em `Assets/Mesh/man_body.asset` (YAML, `m_IsReadable: 1`):

| Campo              | Uso no leitor                                                                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `m_VertexCount`    | número de vértices (validação)                                                                                                                                          |
| `m_VertexData`     | `m_Channels` (formato, dimensão, stream, offset) e `_typelessdata` (hex)                                                                                                |
| `m_IndexBuffer`    | índices em hex, **16 bits little-endian** (`<H`). Não existe `m_IndexFormat` neste Unity. **Confirmado no `man_body`**: 64 872 bytes = 32 436 índices = Σ `indexCount`. |
| `m_SubMeshes`      | intervalos de índices por submesh (`firstByte`, `indexCount`, `topology`)                                                                                               |
| `m_BindPose`       | matrizes de bind por osso (mesma forma que `m_Bones` do SMR)                                                                                                            |
| `m_Skin`           | lista de N entradas; cada uma tem `weight[0..3]` e `boneIndex[0..3]` (verificado em `man_body.asset`, linha 977)                                                        |
| `m_CompressedMesh` | `m_Vertices.m_NumItems: 0` no `man_body` (não comprimido). Se algum mesh tiver `m_NumItems > 0`, parar e registrar                                                      |

**Canais de vértice** (Unity 5.x, verificado em `UnityPy/helpers/MeshHelper.py`, linhas 436–456, e
no `man_body.asset`): índice `0` vértice, `1` normal, `2` cor, `3` UV0, `4` UV1, `5` UV2, `6` UV3,
`7` tangente. A tangente é o **último** canal. Canal com `dimension: 0` não existe e é ignorado.

**Formatos** (enum padrão do Unity): 0 Float32, 1 Float16, 2 UNorm8, 3 SNorm8, 4 UNorm16,
5 SNorm16, 6 UInt8, 7 SInt8, 8 UInt16, 9 SInt16, 10 UInt32, 11 SInt32. No `man_body` aparecem só
`0` (float32) e `2` (UNorm8). O leitor suporta `0` e `2` e falha com erro claro para o resto.

**Layout dos streams** (verificado no `man_body` e no `man_head`): cada stream é contíguo. O stride
do stream é a soma de `dimension × tamanho` dos canais dele; o offset do stream `s` é a soma de
`stride_k × N` para `k < s`, **com cada stream alinhado a 16 bytes** (só há padding entre streams,
não no fim). No `man_body`: `40 × 6332 + 20 × 6332 = 379 920` = `m_DataSize`. No `man_head`:
`40 × 2181 + 20 × 2181 = 130 860`, mas `m_DataSize` é `130 868` — o stream 1 começa em `87 248`
(`87 240` alinhado a 16), e não em `87 240`.

Regra de ouro: **decodificar com o próprio `m_Channels`**, sem assumir layout fixo. O teste de
aceite é a contagem e os pesos iguais aos do bundle (gate A0.2 e A0.3).

**Malha verificada (2026-10-19).** `extract_mesh_project` lê posição/normal/UV0, índices, `m_Skin` e
`m_BindPose` e devolve o mesmo dicionário de `lib3dx.extract_mesh`:

| Malha             | Vértices | Índices | Bindposes |
| ----------------- | -------- | ------- | --------- |
| `man_body`        | 6 332    | 32 436  | 59        |
| `man_head`        | 2 181    | 11 862  | 26        |
| `man_eyelashes`   | 170      | 708     | 5         |
| `man_penis`       | 492      | 2 400   | 5         |
| `woman_body`      | 7 905    | 42 522  | 63        |
| `woman_head`      | 2 580    | 14 118  | 26        |
| `woman_eyelashes` | 210      | 924     | 5         |

O remap por bindpose casa com o esqueleto do bundle: masculino `ok` em todas; no feminino o bindpose
do osso raiz (`woman bone POSE PIVOT`) não existe no esqueleto de `wear` (peso somado ≈ 0,001, ou
seja, sem influência). O `extract_character.py` reporta `WARN worst_t=0.0718` nesse caso (o valor é
distância ao quadrado); **não** é erro de skin. `verify_glb.py --rest` dá `maxdisp=0` nos dois GLBs.

### 3.4. Esqueleto e prefab

- O `SkinnedMeshRenderer` (classID 137) tem `m_Bones`: lista de `{fileID}` que apontam para
  `Transform` do próprio prefab. **A ordem de `m_Bones` define os índices do `m_Skin`.**
- A ordem dos ossos é contrato do pipeline: `sameBoneLayout` em `avatar-parts.ts` compara a ordem.
  O leitor deve produzir os ossos na mesma ordem que `extract_character.py` produz hoje
  (verificar na A6.4 comparando os dois JSON). Como as roupas publicadas ainda vêm dos bundles, o
  corpo exportado pelo projeto usa o **esqueleto do bundle de `wear`** (322/464 ossos) e remapeia a
  malha do prefab para ele; trocar a ordem exigiria reexportar todas as roupas.
- A hierarquia vem de `Transform` (`m_Father`, `m_Children`) ligado a `GameObject` (`m_Name`).
- Os nomes são duplicados em prefabs que misturam props (`woman bone POSE PIVOT`, `woman bip ...`).
  Casar por nome exige o mesmo critério de posição/rotação de rest já usado em `--anim-root`.
- Os prefabs de roupa carregam o rig inteiro, copiado (mesmo padrão do bundle de `wear`). O
  `--retarget` por nome do pipeline atual continua necessário.

### 3.5. Clipe (`AnimationClip`)

- Curvas por caminho (`m_Path`), com `m_PositionCurves` e `m_RotationCurves` (chaves com `time`,
  `value`, `inSlope`, `outSlope`).
- Dados no mesmo formato de `resources.assets`: o pipeline atual (delta world-space, herança de
  rotação local de rest, `--anim-root`) vale sem mudança conceitual.
- Os arquivos são grandes: `stay_pose_1_0.anim` tem 16,7 MB e `stay_pose_5_0.anim` 19,7 MB. Medir
  o tempo de parse (A6.1) e, se preciso, carregar só o `AnimationClip` pelo `fileID`.

**PyYAML não lê todo float do Unity.** O Unity grava `1E-05` (sem ponto); o resolver padrão do
PyYAML devolve **string**. O `project_env.py` registra um resolver de float extra no
`CSafeLoader`; sem ele, valores assim viram `str` e quebram a conta em silêncio.

**Animação verificada (2026-10-19).** O importador `tools/3dx/import_anim_project.py` lê o `.anim`
do projeto, aplica sobre o `--prefab` do gênero e emite o mesmo JSON do `extract_character.py`:

- `slowdance_woman.anim` (rig masculino) e `man@slowdance_woman` (bundle) têm **curvas
  idênticas**: 103 caminhos, mesmos valores de chave, 111 quadros @ 30 fps, `85/322` ossos casados
  nos dois. Igual para o par feminino (`slowdance_man.anim` × `woman@slowdance_man`, `102/464`).
- O `world` resultante **não** é comparável com o do bundle clipe a clipe: o bundle resolve a pose
  contra o rest do esqueleto do próprio bundle, e o projeto contra o rest do prefab; com rests
  diferentes o delta world-space difere, mesmo com curvas iguais. O teste que vale é o **render**.
- No render, o clipe do **projeto** produz o abraço de dança (homem com as mãos à frente, mulher com
  as mãos na altura do peito) e encaixa no offset 0,25 m/yaw 180°. O mesmo clipe extraído do **bundle
  mf** (`man@slowdance_woman`, com ou sem `--anim-root`) sai quase em A-pose, porque o rest do nó
  `man` do esqueleto do bundle é girado ~180° em relação ao prefab/corpo. Ou seja: para clipe de
  par, a fonte do projeto não é só mais simples — é a que reproduz a pose correta.

### 3.6. Textura

PNG em `Texture2D\` com `.meta` (`TextureImporter`). O material (`.mat`) liga a textura pelo
`guid`. O `_MainTex` do material é o mesmo campo que `extract_texture.py` lê no bundle.

### 3.7. Paridade verificada na sonda (2026-10-19)

Leitura direta com PyYAML + `struct`, sem UnityPy:

- `man_body.asset`: 6 332 vértices, 10 812 triângulos, 59 bindposes, 6 332 entradas de `m_Skin`,
  pesos somando 1, UV0 + UV1 + tangente, sem `m_CompressedMesh`.
- Streams: `stream 0` = 40 B/vértice, `stream 1` = 20 B; `40×6332 + 20×6332 = 379 920 = m_DataSize`.
- Bounds decodificados = `m_LocalAABB` (centro `(0, -0.0556, 0.7987)`, extensão
  `(0.5918, 0.2033, 0.7951)`).
- O GLB publicado (`character_male.glb`, `man_body`) tem os mesmos bounds depois da conversão
  `gltf = (unity.x, unity.z, -unity.y)` — **paridade exata** de geometria.
- `walk.anim` = 1,2 s; `stay_pose_1.anim` = 1,3333 s — iguais aos clipes `walk`/`pose01` do GLB.
- `slowdance_man.anim` anima os paths `woman bone POSE PIVOT/...` (o nome é o do parceiro);
  **identificar o rig pelo prefixo do path, não pelo nome do arquivo**.

## 4. Armadilhas

1. **Tag `!u!` sem remover**: PyYAML falha ou produz chaves de tag. Sempre trate o cabeçalho antes.
2. **Documentos concatenados**: um arquivo tem vários objetos. Não assuma um só.
3. **Blobs hex na mesma linha**: `_typelessdata` e `m_IndexBuffer` são uma linha longa de hex
   (centenas de KB). Não imprima nem faça `Select-String` com padrão genérico — já custou uma
   saída enorme durante a investigação. Use padrões ancorados (`^\s+m_VertexCount:`).
4. **Carregar tudo de uma vez**: `.anim` de 19 MB em PyYAML puro é lento. Use `CSafeLoader` e
   cache por arquivo (chave: caminho + tamanho + mtime).
5. **GUID quebrado**: referência a arquivo que não está no projeto. Registrar como item ausente e
   cair no fallback de bundle, em vez de falhar em silêncio.
6. **Versão diferente**: 5.5.5 contra 5.4.3. Qualquer campo novo ou renomeado precisa de teste
   contra o bundle antes de virar padrão.
7. **Clipe de par (mf) do bundle**: esses bundles **trazem o próprio esqueleto**, cujo rest do nó
   `man`/`woman` é girado ~180° em relação ao prefab do projeto e ao corpo. O retarget por delta
   world-space herda essa diferença e a pose sai quase em A-pose (braços abertos), com ou sem
   `--anim-root`. Para par M/F, importe o `.anim` do **projeto** (`import_anim_project.py`), que usa
   o rest do prefab; o `--anim-root` só se aplica a clipes sem esqueleto (`resources.assets`), onde
   a árvore vem do prefab. O `.anim` do projeto **sempre** precisa de `--anim-root`, porque não tem
   esqueleto.

## 5. Contrato de saída

O leitor gera o mesmo JSON de `extract_character.py` (`bones` + `meshes[]` + `frames`/`world`
opcionais, `fps`, `animName`). Campos extras só com prefixo `project_` (ex.: `project_guid`,
`project_fileID`) e sem quebrar consumidores. Cada JSON inclui:

```json
"source": { "kind": "project", "editor": "5.5.5p2", "file": "Assets/Mesh/man_body.asset", "guid": "..." }
```

Ou `"kind": "bundle"` com o caminho dentro de `Mv444R.zip`. Esse campo vai para o manifesto (G5).

## 6. Verificado × a verificar

| Afirmação                                                     | Estado                                                                                                                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Projeto é YAML de texto com `%YAML 1.1`                       | verificado (`man_body.asset`, `ball.prefab`, `BedAvatar.asset`)                                                                                               |
| Editor 5.5.5p2                                                | verificado (`ProjectVersion.txt`)                                                                                                                             |
| Contagens de vértice do projeto (6332/7905/2181/2580/492/170) | verificado (`m_VertexCount`)                                                                                                                                  |
| Contagens do bundle batem com o projeto                       | **não**: bundle 6336/9580/2180/2586/492/210 × projeto 6332/7905/2181/2580/492/170; divergência **aceita** — desde 2026-10-19 o corpo publicado vem do projeto |
| Pesos e bindposes batem com o bundle                          | verificado: remap por bindpose `ok` (masculino) / raiz sem peso (feminino) e `verify_glb --rest` `maxdisp=0`                                                  |
| Bounds da malha × `m_LocalAABB`                               | verificado (`man_body`, exato)                                                                                                                                |
| Bounds do projeto × GLB publicado                             | verificado (`gltf = (x, z, -y)`, exato)                                                                                                                       |
| `stay_pose_1` tem 201 quadros (M) / 41 (F)                    | verificado: `stay_pose_1.anim` 41, o clipe do prefab (`stay_pose_1_0.anim`) 201; publicado usa o do prefab (M 201 / F 41)                                     |
| Roupas e cabelos do zip estão todos no projeto                | **não**: o export atual cobre 57/97 roupas e 14/29 cabelos; ver P0                                                                                            |
| `level20` / `level7` existem como cena no projeto             | **a verificar (A0.5, R7)**                                                                                                                                    |
| Ordem de canais (0 vértice … 7 tangente) e formatos 0 e 2     | verificado (YAML + `MeshHelper.py`)                                                                                                                           |
| Stride × N = `m_DataSize` no `man_body`                       | verificado (379 920)                                                                                                                                          |
| `m_Skin` com `weight[0..3]` / `boneIndex[0..3]`               | verificado (`man_body.asset`)                                                                                                                                 |
| `m_CompressedMesh` vazio no `man_body`                        | verificado (`m_NumItems: 0`)                                                                                                                                  |
| Índice de 16 bits                                             | verificado: 32 436 índices u16                                                                                                                                |
| Nomes de roupa/cabelo do plano existem como prefab            | **não**: `s_ManShirt1_ni`, `mpants_1`, `mjockstrap`, `s_EmoShirtF_ni`, `alexwidejeansfem1cum`, `s_pantie_15_ni`, `hair_30` não encontrados (passo 10.0)       |
| Zip do cliente está criptografado                             | **não**: extração verificada                                                                                                                                  |
| PyYAML funciona com `CSafeLoader` no `py -3.11`               | verificado (6.0.3, `CSafeLoader` presente)                                                                                                                    |
| Curvas do clipe do projeto = bundle (`slowdance`)             | verificado: 103/103 caminhos com os mesmos valores, 111 quadros @ 30 fps, mesmos ossos casados                                                                |
| Import de par M/F pelo projeto (`import_anim_project.py`)     | verificado: par encaixa no offset 0,25 m/yaw 180° no render (ela nos braços dele, mão dele nas costas dela)                                                   |
| `project_env.ProjectEnv` carrega prefab + `.anim`             | verificado: 519 objetos, malhas por GUID, 12 SMRs, clipe com chaves iguais ao YAML                                                                            |
| `extract_mesh_project` decodifica `m_VertexData`              | verificado: 7 malhas, contagens acima, índices u16 e skin; streams com padding de 16 bytes                                                                    |
| Avatares publicados regerados pelo projeto (2026-10-19)       | verificado: 322/464 juntas, ações `idle`/`walk`/`pose01`/`pair01`, `maxdisp=0`, renders ok                                                                    |
| Pares `pair02`/`pair03` importados (2026-10-19)               | verificado: `slowdance_kiss` e `slowdance_invert`, 111 quadros @ 30 fps, 85/322 (M) e 102/464 (F) ossos casados, `maxdisp=0` no rest                          |
| Idle/walk/pose01 idênticos ao publicado (tolerância)          | verificado: walk 3e-05; idle 1e-03 (M) / 5e-03 (F); pose01 4e-03 (M) / 1e-02 (F) em componente de quatérnio                                                   |
