# Plano revisado: consumir o projeto Unity exportado

Status: **plano revisado em 2026-10-19**. Mantém o **contrato JSON** e o `export_glb.py` que já
funcionam. A leitura do projeto começou pelo adaptador `tools/3dx/project_env.py` (em andamento:
YAML, GUID, prefab e clipe); o alvo é o leitor nativo `tools/3dx/project/`, mas **o adaptador não é
descartado** — ele é a ponte até o gate de paridade. A mudança que destrava a migração é outra:
**exportar os `AssetBundles` também** (o export atual só cobre `3DXChat_Data`) e medir a cobertura.
O gate de fidelidade (comparar com os GLBs publicados) continua obrigatório.

Leia junto: `docs/decisions/0017-fonte-projeto-exportado-3dx.md`,
`docs/guides/3dx-projeto-exportado.md` e `docs/guides/3dx-nativo.md`.

---

## 1. O que foi verificado (sonda de 2026-10-19)

Sonda independente, lendo os arquivos do projeto em `E:\dev\exported\ExportedProject` com PyYAML
(`CSafeLoader`) e `struct`, **sem UnityPy**:

| Item                         | Resultado                                                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `man_body.asset`             | 6 332 vértices, 10 812 triângulos, 59 bindposes, 6 332 entradas de skin, UV0+UV1, tangente, sem malha comprimida                  |
| Layout dos vértices          | streams separados: `stream 0` = 40 B/vértice, `stream 1` = 20 B; `40×6332 + 20×6332 = 379 920 = m_DataSize`                       |
| Índices                      | `m_IndexBuffer` com 64 872 bytes = **32 436 índices u16** = soma de `indexCount` das submeshes                                    |
| Bounds decodificados         | min `(-0.59176, -0.25892, 0.00360)` · max `(0.59176, 0.14771, 1.59372)` — igual ao `m_LocalAABB`                                  |
| Bounds do GLB publicado      | `character_male.glb`, `man_body`: min `(-0.59176, 0.00360, -0.14771)` · max `(0.59176, 1.59372, 0.25892)`                         |
| Conversão                    | `gltf = (unity.x, unity.z, -unity.y)`; a geometria do projeto **bate exatamente** com o GLB atual                                 |
| `man.prefab`                 | 192 GameObjects, 191 transforms, 12 `SkinnedMeshRenderer`; corpo 59 ossos, cabeça 26, cílios 5, anatomia 5; 63 nomes `man bone *` |
| `blouse_1.prefab`            | 169 transforms, 3 SMRs (12/14/11 ossos) — a peça carrega uma cópia do rig                                                         |
| `walk.anim`                  | 103 curvas de rotação, 1,2 s, `m_Legacy: 1`, 30 fps                                                                               |
| `stay_pose_1.anim`           | 104 curvas, 1,3333 s — igual ao `pose01` do GLB atual                                                                             |
| `slowdance_man.anim`         | 104 curvas, 3,6667 s; **os paths são `woman bone POSE PIVOT/...`** (o nome do arquivo é o do parceiro)                            |
| `house.unity` / `club.unity` | 134 / 560 transforms, 51 / 408 referências de malha, **sem `PrefabInstance`** (hierarquia achatada)                               |
| Cobertura do export atual    | 1 303 malhas, 929 materiais, 1 574 PNG, 79 `.anim`, 16 cenas, 57/97 prefabs de roupa, 14/29 de cabelo                             |
| `cust_body` / `cust_face`    | só PNGs (2/11 M, 13/25 F), sem prefabs/malhas — customização é por textura, não por shape key                                     |

Conclusão: o projeto exportado **não é só uma alternativa**: para malha, esqueleto, clipe e cena, ele
é mais simples e mais fiel que o caminho por bundle. O que falta hoje é **cobertura** (o export foi
gerado a partir de `3DXChat_Data`, não dos `AssetBundles`), e isso se resolve com **uma exportação
completa** — o zip não tem senha.

---

## 2. O que simplifica (e o que não simplifica)

| Etapa         | Hoje (bundle + UnityPy)                         | Projeto exportado                                     |
| ------------- | ----------------------------------------------- | ----------------------------------------------------- |
| Abrir a fonte | `UnityFS`, LZ4, PPtr, `path_id`                 | texto YAML + GUID (`*.meta`)                          |
| Esqueleto     | emprestado de um bundle de roupa (`--skeleton`) | `m_Bones` do `SkinnedMeshRenderer` do prefab          |
| Malha         | `lib3dx.extract_mesh`                           | `m_VertexData` + `m_Skin` + `m_BindPose` (mesmo JSON) |
| Animação      | clipe em `resources.assets`/bundle              | `.anim` com paths completos e auto-descritivos        |
| Roupa/cabelo  | bundle separado + escolha de `path_id`          | um `.prefab` por peça, nome legível                   |
| Textura       | `extract_texture.py` no bundle                  | PNG + `.mat` com GUID                                 |
| Sala          | `level*` + resolução de PPtr                    | `.unity` com transforms e referências diretas         |
| Nomes         | hash do bundle                                  | `man_body`, `blouse_1`, `hair_17`                     |

**Não muda:** o `export_glb.py`/`export_room_glb.py` (Blender), a matemática `P`/skinning, o
`verify_glb.py`, o `skin_export.py`, o gate de comparação, o retarget de roupa (as peças do projeto
também trazem uma cópia do rig), o orçamento de textura e a conversão para PBR.

**Não prometer:** "importar direto no Blender". O Blender não lê YAML do Unity; o leitor nativo é
necessário de qualquer forma. A vantagem é que ele é **um leitor só**, não um adaptador que finge
ser UnityPy.

---

## 3. Fase P0 — exportação completa (pré-requisito)

O export atual cobre o corpo, o rig, as poses e parte das roupas/cenas. A única fonte permitida é
`E:\dev\exported`; o que não estiver lá precisa ser reexportado para essa pasta. Passos:

1. Verificar a cobertura com um relatório (`tools/3dx/build/cobertura.csv`) contra a lista de
   clipes necessários: `wave`, `dance`, `beer`/`drink` (interação com `vedro`) e `sit`.
2. Gravar `source-export.json` (manifesto): versão do AssetRipper, versão do editor Unity, data,
   contagens, hash dos arquivos-chave (`man.prefab`, `man_body.asset`, `walk.anim`).
   **nada de 2 GB no git**.

**Aceite:** `cobertura.csv` sem item "desconhecido"; clipes necessários presentes; `source-export.json` gerado.

---

## 4. Fase P1 — completar a leitura (adaptador → leitor nativo)

O `tools/3dx/project_env.py` já lê YAML, resolve GUID, monta o prefab e carrega clipes como um
"env" compatível com `lib3dx`/`extract_character`. **Falta a decodificação da malha**
(`extract_mesh_project`), que é o próximo passo concreto. Depois do gate, o código pode ser separado
em módulos pequenos (sem UnityPy na API):

```
tools/3dx/project/
  __init__.py
  yaml_docs.py    # divide --- !u!<classe> &<id>; remove %YAML/%TAG; CSafeLoader
  guid_index.py   # varre Assets/**/*.meta -> {guid: caminho} (uma vez por processo)
  prefab.py       # GameObject/Transform/SMR: hierarquia, m_Bones, materiais, mundo
  mesh.py         # m_VertexData (streams/formatos), m_Skin, m_BindPose, m_IndexBuffer
  anim.py         # .anim legacy -> TRS local por quadro; casa path -> Transform
  scene.py        # .unity -> malhas estáticas no mundo + materiais
  materials.py    # .mat -> albedo/normal/metallic/roughness/alpha + texturas
```

A separação é **limpeza pós-gate**, não pré-requisito: o adaptador atual pode entregar o JSON e ser
validado primeiro.

Regras:

- **Contrato de saída = JSON atual** (`bones` + `meshes[]` + `frames`/`world`, `fps`, `animName`).
  `export_glb.py` não muda.
- **Chavear por GUID/fileID**, não por nome (nomes colidem).
- **Não acoplar o resto do pipeline ao adaptador:** ele existe para reusar `lib3dx`/`extract_character`
  durante a transição; o alvo é a API própria. O contrato observável (JSON) é o que importa.
- **Clipe:** identificar o rig pelo prefixo do path (`man bone POSE PIVOT` × `woman bone POSE PIVOT`),
  nunca pelo nome do arquivo — `slowdance_man.anim` anima o rig feminino.
- **Malha comprimida:** se `m_CompressedMesh` tiver itens, falhar com o nome do mesh; não tentar
  descomprimir no P1.
- **Cache** de YAML por caminho+tamanho+mtime; os `.anim` chegam a 19,7 MB.

**Aceite:** testes unitários com `unittest` para: divisão de documentos, canais/stride, `m_DataSize`,
índices u16, bounds × `m_LocalAABB`, contagem de ossos do prefab e duração dos clipes.

---

## 5. Fase P2 — paridade de personagem (gate)

1. Gerar `character_male.json` e `character_female.json` pelo leitor novo.
2. Rodar `compare_json.py` contra o baseline do pipeline antigo (passos 1–3 da seção 0.1).
3. Exportar GLB **para `%TEMP%`** e rodar `verify_glb.py --rest` (`maxdisp 0.0000`).
4. Só então sobrescrever `apps/web/public/assets/3dx/character_*.glb`, com bump de
   `NATIVE_ASSET_VERSION` no cliente.

**Aceite:** PASS em ossos, malhas, índices, bindposes, pesos (comparados por **nome** de osso) e
clipes; `maxdisp ≈ 0`.

---

## 6. Fase P3 — ossos por nome (recomendado)

O GLB publicado hoje usa `b0..bN` (índice na lista de ossos), e o cliente tem
`JOINTS_3DX_MALE`/`JOINTS_3DX_FEMALE` com índices fixos. O projeto exportado tem ~63 ossos de
deformação nomeados (`man bone Pelvis`, ...), contra 322/464 do esqueleto emprestado do bundle.

- **Recomendação:** exportar com **nomes nativos** e trocar o mapa do cliente para nomes
  (`pickRig` continua achando o quadril; `sameBoneLayout` continua comparando a ordem).
- Manter um fallback temporário para GLB antigo (`bN`) durante a transição.
- Ganhos: menos ossos, GLB menor, sem índices frágeis, joins e retarget legíveis.
- Custo: uma edição no cliente + bump de asset; coberto pelo gate P2 e por um e2e de avatar.

**Aceite:** dois avatares 3DX no mundo, idle/walk/pose sem erro de junta; peças de roupa continuam
seguindo o corpo (`sameBoneLayout`).

---

## 7. Fase P4 — clipes (resolve o "parado")

Clipes necessários para as ações (fonte única: `E:\dev\exported\ExportedProject`):

- `wave` (acenar), `dance` (dançar) e `beer` (pegar cerveja, interação com `vedro`) ainda não existem no projeto exportado.
- `dance.anim` existente usa `Bip01` e não casa com o rig 3DX.

Importar todos os `.anim` úteis e mapear **cada ação** para um clipe explícito:

- base: `stay_pose_1` (idle), `walk`, `stay_pose_2` (pose01);
- poses: `stay_pose_3..5` e as variantes `_0` por gênero;
- par: `slowdance_man` + `slowdance_woman` (e `slowdance_kiss_*`, `slowdance_invert_*`) ou
  `cuddle` do export completo. Derivar offset/giro do **frame 0 dos dois rigs**, não calibrar à mão;
- extras: `dance`, `strip1..4`, `run`, `swim`, `blink`;
- fallback: ação sem clipe → `idle` (nunca um clipe parado sem `isPlaying`).

No cliente, `motionClip` deixa de ser um `if` de duas ações: vira tabela `ação → clipe` e devolve
`idle` para o que não conhece. `NATIVE_ASSET_VERSION` sobe.

**Aceite:** `hug`, `pose-intimate` e `dance-duo` tocam um clipe nativo nos dois lados; avatar sem
ação toca idle; e2e de dois 3DX com screenshot/estado do clipe (o mesmo tipo de sonda usado para
diagnosticar o bug atual).

---

## 8. Fase P5 — roupas e cabelo

- Um `.prefab` por peça (`Resources/{man,woman}/cloth|hair/*.prefab`), com malha, materiais e cópia
  do rig.
- Escolher o SMR de **LOD0** (ignorar `_LOD1+`), pegar o `Mesh` pelo `m_Mesh`.
- Assar no **rest pose do corpo** (mesma matemática `refWorld[map(i)] * bindpose[i] * v`), casando
  ossos por nome. O projeto dá a hierarquia explícita; não precisa mais do heurístico de posição.
- Catálogo derivado das pastas; `sameBoneLayout` valida a ordem no cliente.
- Cobertura: usar `cobertura.csv`; item ausente no export completo → registrar e decidir (não
  inventar nome).
- O contrato de esqueleto/rest pose do corpo fica em `tools/3dx/rigs/3dx_{male,female}.json` e é
  lido com `--skeleton-json`; a malha vem só do projeto.

**Aceite:** 3 peças por gênero no vestiário, no corpo, sem T-pose e sem costura; `verify_glb --rest`.
**Feito em 2026-10-20:** 28 roupas (13 M / 15 F) e 30 acessórios (5 chapéus, 5 óculos e 5
máscaras por gênero) publicados só com prefabs do projeto; `--rest` = `maxdisp 0.0000` e testes de
ordem de ossos passando. Óculos/máscaras usam o caminho rígido de 1 osso
(`extract_accessory_project.py`).

---

## 9. Fase P6 — texturas e materiais

- `.mat` liga `_MainTex`/`_BumpMap`/`_Metallic`/`_Color` por GUID; mapear para PBR no
  `export_glb.py` (albedo, normal, metallic/roughness, alpha).
- Pele/olhos/cabelo: usar os PNGs do projeto (o 3DX atual só tem cor chapada; isto é a Fase F).
- Manter o orçamento atual de cenário (ex.: 512 px) e o `TintPlugin` das roupas.
- Materiais com shader customizado: aproximar por PBR e registrar o desvio.

**Aceite:** corpo e roupa com atlas correto no viewer; sem material rosa/errado.

---

## 10. Fase P7 — salas

- Ler `.unity` (`house`, `club`, `CLUB_NEW`, `beach`, `island`, `SALOON`, `YACHT`, `BDSM_club`) e
  achatar a hierarquia de `Transform` já existente (não há `PrefabInstance`).
- Resolver `m_Mesh`/`m_Materials` por GUID, agrupar por material, assar no mundo e exportar GLB
  estático (reutilizar `export_room_glb.py`).
- Extrair do próprio `.unity`: spawns, assentos, limites e luzes (em vez de hardcode no
  `lounge-layout`/`scenes`).
- Começar por uma sala pequena (`house`) e uma grande (`club`) para medir orçamento.

**Aceite:** sala abre no `viewer-room`/`viewer-club`, com escala, materiais e chão corretos; server
usa os spawns/assentos do export.

---

## 11. Fase P8 — aposentar o caminho por bundle

- Remover `UnityPy` do `requirements.txt` e o caminho de bundle de `lib3dx.py`/
  `extract_character.py`/`extract_texture.py`/`extract_room.py` (ou deixá-los atrás de flag
  `--legacy`, por uma release).
- Atualizar `tools/3dx/README.md` e `docs/guides/3dx-nativo.md` para os comandos de projeto.
- Aceitar a ADR 0017 e registrar a decisão por categoria (corpo, cabeça, anatomia, roupa, cabelo,
  clipe, textura, sala).

**Aceite:** `pnpm check` verde; nenhuma referência a `AssetBundles` no caminho padrão; manifesto G5
com `source: project`.

---

## 12. Riscos e mitigação

| Risco                                            | Mitigação                                                     |
| ------------------------------------------------ | ------------------------------------------------------------- |
| Export incompleto (hoje: só `3DXChat_Data`)      | P0 com cobertura; o zip **não** tem senha                     |
| Bundle criptografado/inválido                    | `cobertura.csv` marca o item; fallback explícito e registrado |
| Diferença Unity 5.4.3 (bundle) × 5.5.5 (projeto) | gate P2 compara contagens, pesos, bindposes e clipes          |
| Parse lento dos `.anim` (até 19,7 MB)            | `CSafeLoader`, cache e carregar só o clip necessário          |
| Espaço em disco (10,9 GB + export)               | processar em lotes / disco separado; export fora do git       |
| Troca de ossos `bN` → nome quebra o cliente      | fase P3 isolada, fallback e e2e                               |
| Materiais/shader Unity sem PBR equivalente       | aproximar e registrar; validar no viewer                      |
| Licença/proveniência                             | mesmo regime de hoje; manifesto com origem e hash             |

---

## 13. Próximos passos imediatos

1. Extrair o zip (sem senha) e rodar o AssetRipper completo (P0).
2. Implementar `tools/3dx/project/` + testes (P1).
3. Gate P2 contra o baseline e exportar para `%TEMP%`.
4. Só depois P3/P4 (nomes e clipes), que é onde o bug atual do par/pose se resolve.
