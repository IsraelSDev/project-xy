# Guia: assets 3D (avatares e salas) para o navegador

Este guia é para uma IA (ou pessoa) que vai implementar assets 3D no 3dxchat-web. Siga as etapas na ordem. Não pule etapas. Se algo não bater com o repo, pare e relate.

Leia antes: `docs/decisions/0006-avatares-personalizaveis-fase-4.md` (decisões de avatar) e este arquivo.

---

## 0. Regras fixas (não mudar)

1. **Catálogo fechado.** O `AvatarConfig` guarda só IDs (`packages/contracts/src/avatar.ts`). Nunca guardar URL, caminho ou cor livre.
2. **Esqueleto fixo.** Trocar cabelo, roupa ou acessório nunca recria nem move o esqueleto. Isso já é testado em `apps/web/src/game/characters/mannequin.test.ts`.
3. **Convenção de articulações.** Os ossos do modelo têm que mapear para `MANNEQUIN_JOINTS` (`apps/web/src/game/characters/mannequin.ts`):
   `pelvis`, `head`, `left-hip`, `left-knee`, `right-hip`, `right-knee`, `left-shoulder`, `left-elbow`, `right-shoulder`, `right-elbow`.
   Frente do corpo = +Z local. Y para cima. Unidades em metros.
4. **Materiais compartilhados.** Um material por cor/atlas, não um por malha ou por jogador.
5. **Nada de GLB grande.** `apps/web/public/test-assets/red-bikini-model.glb` tem 60 MB. É só de teste. Não usar como base de produção.
6. **Licença e origem registradas.** Todo asset precisa de uma entrada no manifesto (seção 5). Sem entrada, não entra no build.

Se uma tarefa pedir algo que quebra uma regra acima, pare e pergunte.

---

## 1. Pré-requisito: o modelo base

Status atual: **escolhido e integrado.** A base é o **modelo 3DX nativo**, extraído do projeto Unity
exportado em `C:\dev\exported\ExportedProject`. Os arquivos e o pipeline estão na seção 11. O manequim
procedural continua como fallback enquanto o GLB carrega (ou se a carga falhar).

O modelo atende ao pré-requisito da Etapa 2:

- skeleton com os 10 ossos de `MANNEQUIN_JOINTS` (mapeados em `JOINTS_3DX_MALE`/`FEMALE`);
- um mesh por tipo de corpo;
- origem e licença documentadas (seção 11).

---

## 2. Formato do arquivo de asset

Cada asset é um GLB separado:

| Tipo               | Arquivo                                         | Skeleton | Como prende                                                                           |
| ------------------ | ----------------------------------------------- | -------- | ------------------------------------------------------------------------------------- |
| Corpo base         | `avatar/body-<tipo>.glb`                        | próprio  | é a raiz do avatar                                                                    |
| Cabelo             | `avatar/hair-<id>.glb`                          | do corpo | rígido: `TransformNode` no osso `head`                                                |
| Roupa (top/bottom) | `avatar/top-<id>.glb`, `avatar/bottom-<id>.glb` | do corpo | skinned no skeleton do corpo                                                          |
| Acessório          | `avatar/acc-<id>.glb`                           | nenhum   | rígido: `TransformNode` no osso indicado (óculos e boné em `head`, colar em `pelvis`) |
| Cenário            | `rooms/<sala>/<nome>.glb`                       | nenhum   | estático, carregado por sala                                                          |

Regras:

- Nome do arquivo = ID do catálogo em `packages/contracts/src/avatar.ts` (ex.: `hair-long.glb`).
- Cor não tem arquivo próprio. Cor é tint (ver Etapa 2.2).

### 2.1 Cores por tint

- A paleta é `PALETTE` em `avatar.ts`. Não criar textura por cor.
- Para cabelo e roupa: material com cor base neutra (branca) e aplicar a cor via `material.diffuseColor` (ou uniform), usando o `hex` do item.
- No 3DX, o cabelo nativo segue a mesma regra: atlas de fios claro com alfa (`alphaMode: MASK`, `doubleSided`) e cor por `hairTint` (`hairColor`).
- Trocar cor = trocar um valor de material, nunca carregar outro arquivo.

### 2.2 Carregamento

- Usar `LoadAssetContainerAsync` (como `apps/web/src/game/characters/test-avatar.ts`).
- Cachear por URL. Mesmo arquivo carregado duas vezes = um container só.
- Carregamento assíncrono. Enquanto carrega, mostrar o manequim procedural. Não travar o render.
- Erro de carregamento: manter o manequim e registrar aviso no console. Não quebrar o avatar.

---

## 3. Animações

1. Clipes de animação ficam no mesmo GLB do corpo ou em `avatar/anim-<nome>.glb`.
2. Carregar sob demanda (ex.: `idle`, `wave`, `sit`). Não carregar todos no início.
3. Caminhada: o manequim e os modelos sem clipe usam o ciclo procedural de `apps/web/src/game/animation/walk-cycle.ts`; a família 3DX usa o clipe nativo `walk` embutido no corpo (`motionClip`), com `speedRatio` ajustado à velocidade do avatar.
4. Não criar novas ações de animação sem pedido explícito. Ações de esqueleto estão previstas para a Fase 5.

---

## 4. Salas e cenários

1. Cada sala tem seus GLBs em `rooms/<sala>/`.
2. Quarto padrão 3DX: `apps/web/public/assets/3dx/rooms/home/home.glb` (cama, sofá, mesa e mezanino), aberto por `viewer-room.html`; `viewer-closet.html` usa a mesma sala como closet com câmera fixa e avatar + opções. A balada fica em `rooms/club7/club7.glb` (`level7`), reimportada com texturas nativas, normal/emissive e tangentes, e é o **hall inicial** do jogo (luzes coloridas, glow e colisão em `packages/game-core/src/club-walls.ts`). `viewer-club.html` abre a cena para inspeção.
3. **Merge por material:** juntar malhas que usam o mesmo material (`MergeMeshes`) e depois `freezeWorldMatrix()` nas malhas estáticas.
4. **Instâncias:** objeto repetido (cadeira, luminária) usa `thinInstances`, não cópias.
5. **Luz:** cenário com lightmap baked ou sem sombra dinâmica. Sombra em tempo real só para avatares (como hoje em `shadows.addShadowCaster`).
6. **Carregamento por sala:** carregar ao entrar, descartar ao sair (`container.dispose()`).
7. **Texturas de cenário:** juntar em atlas por categoria (chão, parede, mobília). Formato KTX2 com mipmaps.

Tamanhos iniciais (hipótese, medir antes de fixar):

- textura de prop: até 1024 px;
- chão e parede: até 2048 px.

---

## 5. Pipeline de otimização (obrigatório)

Ferramentas sugeridas (não estão instaladas no repo; confirmar antes de adicionar dependência):

- Blender para modelar e exportar glTF.
- `@gltf-transform/cli` para otimizar: `dedup`, `prune`, `weld`, compressão de geometria (Draco ou meshopt) e textura em KTX2 (`toktx`).

Passos:

1. Exportar do Blender como `.glb`, com um único skeleton por corpo.
2. Rodar a otimização. Salvar o resultado em `apps/web/public/assets/`.
3. Gerar/atualizar `apps/web/public/assets/manifest.json` com, para cada arquivo:
   - `id`, `path`, `bytes`, `sha256`, `version`;
   - `origin` (de onde veio), `license`, `author` (ou "próprio");
   - `triangles`, `materials`, `textures` (contagem, medidas pelo script).
4. O build falha se:
   - um arquivo não estiver no manifesto;
   - um arquivo passar do orçamento (seção 6);
   - um ID do catálogo não tiver arquivo correspondente.

---

## 6. Orçamentos (hipóteses iniciais, medir antes de fixar)

| Item                                   | Orçamento inicial             |
| -------------------------------------- | ----------------------------- |
| Corpo base, triângulos                 | ≤ 15 000                      |
| Cabelo / roupa / acessório, triângulos | ≤ 5 000 cada                  |
| Tamanho GLB corpo (comprimido)         | ≤ 3 MB                        |
| Tamanho GLB de roupa/cabelo            | ≤ 1 MB                        |
| Avatares simultâneos no teste          | 16                            |
| Malhas ativas por avatar               | ≤ 20 (hoje ~18, ver ADR 0006) |
| Tamanho de textura por asset           | ≤ 1024 px (avatar)            |

Estes números são pontos de partida. Qualquer mudança exige medição (seção 7), não palpite.

---

## 7. Como medir (obrigatório antes de dizer que está pronto)

1. CPU: rodar `apps/web/src/game/engine/world.perf.test.ts`. Ele falha acima de 16 ms por quadro.
2. Navegador: rodar com bots (`--count 15` no fluxo já existente) e observar o painel da sala (FPS e malhas).
3. GPU: **não medido ainda** (ver ADR 0006). Só afirmar FPS de GPU se medido num navegador visível, no dispositivo alvo. Caso contrário, dizer "não medido".
4. Registrar número antes/depois para cada mudança de asset.

---

## 8. Checklist de implementação (ordem)

- [ ] Confirmar que existe modelo base com skeleton de `MANNEQUIN_JOINTS` (seção 1). Se não, parar nesta etapa e relatar.
- [ ] Criar o script de otimização e o `manifest.json` (seção 5).
- [ ] Carregar corpo base com cache e fallback para o manequim (seção 2.2).
- [ ] Trocar cabelo, roupa e acessório por ID; cor por tint (seção 2.1, 2.2).
- [ ] Garantir que trocar aparência não move o esqueleto (teste existente em `mannequin.test.ts` deve passar).
- [ ] Animações sob demanda (seção 3).
- [ ] Salas: merge, instâncias, lightmap, carregamento por sala (seção 4).
- [ ] Rodar testes, typecheck e medir (seção 7).
- [ ] Atualizar `manifest.json` e registrar medições.

Comandos de verificação do repo:

- testes: `pnpm test` (ou o script equivalente do workspace);
- tipos: `pnpm typecheck`.

Confirmar os nomes de script no `package.json` antes de rodar.

---

## 9. Não fazer

- Não criar um GLB por combinação de cor ou por item completo.
- Não usar `red-bikini-model.glb` em produção.
- Não carregar assets sem entrada no manifesto.
- Não aceitar URL ou caminho vindo do servidor ou do cliente.
- Não criar texturas por cor.
- Não ligar sombra dinâmica em cenário inteiro.
- Não dizer que um número de performance foi medido sem medição real.

---

## 10. Decisões que não são técnicas (pedir ao responsável)

- Escolha do modelo base licenciado com rig.
- Origem e licença de cada asset.
- Lista final de itens do catálogo além dos atuais (ver `avatar.ts`).
- Se um item novo muda o formato do avatar: exige subir `AVATAR_FORMAT_VERSION` e migrar o que já está salvo.

---

## 11. Biblioteca 3DX (implementada)

A única família de avatar é a **3DX nativa**, extraída do projeto Unity exportado em
`C:\dev\exported\ExportedProject`. Não há mais modelo, textura, pose ou catálogo do modelo
anterior no repositório.

### Arquivos

| O que      | Onde                                          | Observação                                        |
| ---------- | --------------------------------------------- | ------------------------------------------------- |
| Corpos     | `assets/3dx/character_{male,female}.glb`      | corpo + cabeça + cílios (+ anatomia no masculino) |
| Roupas     | `assets/3dx/clothes/<slot>/<id>.glb`          | retargetadas para o mesmo esqueleto do corpo      |
| Cabelos    | `assets/3dx/hair/*.glb`                       | atlas de fios com alfa; cor vem do `hairColor`    |
| Acessórios | `assets/3dx/accessories/<slot>/<id>.glb`      | chapéus, óculos e máscaras                        |
| Decalques  | `assets/3dx/decals/<categoria>/<imagem>.webp` | tatuagens autorais + `manifest.json`              |
| Salas      | `assets/3dx/rooms/<sala>/<sala>.glb`          | quarto padrão (`home`), balada e demais cenas     |

O catálogo fechado fica em `packages/contracts/src/avatar.ts` (`PART_CATALOG`, `PART_SLOTS`,
`DECAL_CATEGORIES`). O avatar guarda só ids e cores; nunca caminho ou URL.

### Cores e altura

- **Pele** (`skin`): o atlas 3DX é multiplicado pelo tom escolhido em `avatar-model.ts`; cílios
  mantêm o preto do próprio atlas.
- **Cabelo** (`hairColor`): a textura é só o desenho dos fios; a cor vem de `hairTint`.
- **Roupa** (`topColor`/`bottomColor`): `tint-plugin.ts` troca o albedo pela cor da paleta com o
  brilho da luminância da textura.
- **Altura** (`height`): multiplicador da base de 1,7 m (`HEIGHT_MIN`..`HEIGHT_MAX`), aplicado à
  raiz inteira (corpo e peças) em torno dos pés. Leitura tolerante: fora da faixa é limitado.

### Esqueleto e animações

O corpo usa o rig nativo do 3DX (322 ossos no masculino, 464 no feminino), mapeado em
`JOINTS_3DX_MALE`/`JOINTS_3DX_FEMALE`. Os clipes vêm embutidos no GLB (`idle`, `walk`, `pose01`,
`pair01`..`pair03`); `motionClip` escolhe o clipe da ação replicada. Não há pose procedural no 3DX:
sem clipe, toca o `idle` nativo.

As roupas, cabelos e acessórios compartilham o esqueleto do corpo quando a ordem dos ossos coincide
(`sameBoneLayout`), então acompanham a animação sem um segundo esqueleto.

### Decalques

As tatuagens são assets 3DX (`assets/3dx/decals/14_tattoo_autoral/`). A projeção conformada está em
`decals-3dx.ts` + `decal-projection.ts`: cada peça é um pedaço da malha do corpo, com os mesmos pesos
de pele e uma folga de 0,4 mm. As âncoras ficam em `DECAL_ANCHORS_3DX_MALE`/`FEMALE`.

### Diagnóstico

- `?testAvatarClip=<nome>` — toca um clipe embutido do GLB.
- `?testAvatarPose=0` — deixa o modelo em repouso.
- `?testAvatarDecal=<slot>:<categoria>/<imagem>` — força um decalque no avatar local.

O pipeline de geração está em `docs/guides/3dx-nativo.md` e `tools/3dx/README.md`.
