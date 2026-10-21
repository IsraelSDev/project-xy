# ADR 0017: Fonte dos assets 3DX — projeto Unity exportado

- **Status:** aceita (2026-10-19) — corpo, animações e par publicados pelo projeto; pendente reexportar roupas/cabelos e o gate de textura
- **Data:** 2026-10-19

## Contexto

Fonte única dos assets 3DX: o **projeto Unity exportado** em `C:\dev\exported`. Nenhuma outra
pasta ou arquivo de cliente é usado pelo pipeline.

Fatos verificados:

- Existe um **projeto Unity exportado** em `C:\dev\exported\ExportedProject`, editor
  **5.5.5p2**, com ~19,8 mil arquivos (2,27 GB). Os arquivos de asset são **YAML de texto**
  (`%YAML 1.1`): malhas em `Assets/Mesh/*.asset` (com `m_VertexCount`, `m_IndexBuffer`,
  `m_BindPose`, `m_Skin`), prefabs de personagem e de roupa em `Assets/Resources/{man,woman}`
  (com o rig completo), clipes em `Assets/AnimationClip/*.anim`, avatares, 2831 PNG de textura e
  cenas `.unity`.
- Contagens de malha lidas do YAML: `man_body` 6332, `woman_body` 7905, `man_head` 2181,
  `woman_head` 2580, `man_penis` 492, `man_eyelashes` 170. O roadmap registra 6336, 9580, 2180 e
  2586 para as mesmas malhas. **A divergência ainda não foi explicada** (versão do cliente, erro
  de documentação ou leitura diferente).

Pontos de atrito do caminho atual:

- a malha correta é escolhida por `path_id`, porque nomes colidem entre peças (`man_body` aparece
  em dezenas de roupas).
- o export atual cobre só parte das roupas, cabelos e cenas; o que faltar precisa ser reexportado
  para dentro de `C:\dev\exported`.

## Decisão (proposta, revisada em 2026-10-19)

1. A fonte primária para malhas, prefabs (personagem, roupa e cabelo), clipes, texturas e cenas
   passa a ser o **projeto exportado**.
2. O projeto é lido **diretamente em Python** pela frente de leitura em `tools/3dx/`: o adaptador
   `project_env.py` (YAML, GUID, prefab, clipe; em andamento) é a **ponte** para reusar
   `lib3dx`/`extract_character`, e o alvo é o leitor nativo em `tools/3dx/project/` (`yaml_docs`,
   `guid_index`, `prefab`, `mesh`, `anim`, `scene`, `materials`). O leitor emite o **mesmo JSON** de
   `extract_character.py`; `export_glb.py`, `skin_export.py`, `verify_glb.py` e `render_check.py`
   não mudam. A sonda de 2026-10-19 confirmou que a leitura direta produz geometria idêntica à do
   GLB publicado.
3. Itens ausentes do projeto exportado ficam **pendentes**: não são extraídos de outra fonte. A
   cobertura é fechada reexportando para `C:\dev\exported` e medindo o que falta.
4. Nenhuma categoria vira canônica sem passar pelo **gate A0** (comparação de contagens, pesos,
   bindposes, quadros e cobertura contra o bundle).
5. **Dependência nova:** PyYAML, pinado em `tools/3dx/requirements.txt`, com `CSafeLoader` quando
   disponível. Justificativa: o YAML do Unity tem tags `!u!` e blobs hex longos; um parser próprio
   aumenta o risco de erro sem ganho real.

## Alternativas consideradas

- **Manter só bundles de outra pasta.** Descartada: fora de `C:\dev\exported` não há fonte permitida.
- **Importar o projeto no Blender.** O Blender não lê YAML do Unity. Exigiria um importador próprio,
  que é o mesmo trabalho do leitor. Descartada.
- **Reimportar o projeto no Unity Editor 5.5.5 e exportar FBX.** Não avaliado: depende de instalar a
  versão exata do Editor, que não foi verificada nesta máquina. Fica registrado como alternativa a
  reconsiderar se o adaptador falhar no gate.
- **Converter manualmente para FBX/OBJ.** Descartada: perde pesos e bindposes ou exige ferramenta
  externa sem controle de versão.

## Consequências

- **Ganhos:** sem criptografia no caminho principal; sem UnityPy; hierarquia e rig explícitos no
  prefab; clipes com paths auto-descritivos; catálogo de peças derivado dos prefabs; referências
  auditáveis por GUID e fileID; diffs e buscas com ferramentas de texto.
- **Paridade medida (sonda 2026-10-19):** `man_body` decodificado tem os mesmos bounds do GLB
  publicado (`gltf = (x, z, -y)`), 6 332 vértices, 59 bindposes e índices u16 conferidos; `walk`
  (1,2 s) e `stay_pose_1` (1,3333 s) batem com os clipes atuais. Isso reduz o risco do gate.
- **Animação e corpo (2026-10-19):** `project_env.py` (inclui `extract_mesh_project`, streams com
  padding de 16 bytes) + `import_anim_project.py` leem o `.anim`, aplicam no prefab do gênero e
  emitem o JSON do pipeline. As curvas de `slowdance_*` são **idênticas** às do bundle (103/103
  caminhos, 111 quadros, mesmos ossos casados) e o par renderizado encaixa no offset **0,25 m**/yaw
  180°. Os GLBs publicados foram regerados por esse caminho; a malha do projeto é remapeada para o
  esqueleto do bundle de `wear` (322/464), que segue sendo o contrato das roupas. As contagens de
  vértice divergem (6 332 × 6 336 etc.) e foram aceitas na regeração.
- **Custos:** leitor nativo em `tools/3dx/project/` (YAML, GUID, canais de vértice, `m_Skin`,
  `m_BindPose`, clipes, cenas, materiais) e uma edição em `extract_character.py` para aceitar
  `--source *.prefab`. Divergência de versão (5.5.5 contra 5.4.3 dos bundles); arquivos grandes
  (`.anim` até 19,7 MB) que exigem `CSafeLoader` e cache.
- **Riscos:** fidelidade (gate A0) e **cobertura** — o export atual cobre 57/97 roupas, 14/29
  cabelos e 79 clipes. Mitigação: reexportar o que falta para `C:\dev\exported` e medir a cobertura.
  Sem clipes de aceno, bebida ou sentar no projeto, essas ações ficam pendentes.

## Pendências para aceitar a ADR

- [ ] Reexportação para `C:\dev\exported` e cobertura sem item desconhecido.
- [ ] Gate A0 executado, com tabela de divergências preenchida.
- [ ] Decisão por categoria (corpo, cabeça, anatomia, roupa, cabelo, clipe, textura, sala) registrada
      nesta ADR.
- [x] PyYAML aprovado e pinado (`PyYAML==6.0.3` em `tools/3dx/requirements.txt`).
- [x] Fatia de animação: clipe do projeto com curvas idênticas ao bundle e par M/F renderizado.
- [x] Corpo + clipes publicados pelo projeto (`character_{male,female}.glb`, 2026-10-19), com
      divergência de contagem de vértice aceita (6 332 × 6 336 no `man_body`).
- [ ] Roupas/cabelos e o gate de textura.

## Referências

- `docs/guides/3dx-projeto-exportado.md` (formato e regras de leitura do projeto)
- `docs/decisions/0016-familia-de-modelo-3dx.md`
