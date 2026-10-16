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

Status atual: **não há modelo licenciado com rig escolhido**. O avatar é o manequim procedural. Não invente um modelo.

Antes de implementar a Etapa 2, precisa existir um arquivo `.glb` com:

- um skeleton com os 10 ossos de `MANNEQUIN_JOINTS` (ou um mapa explícito nome-do-osso → articulação);
- um mesh por tipo de corpo (ou morph targets para `slim` / `regular` / `broad`);
- origem e licença documentadas.

Se o arquivo não existir, faça só as Etapas 3 e 4 (pipeline e orçamento), testando com um GLB pequeno gerado para teste.

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
3. Caminhada: manter o ciclo procedural de `apps/web/src/game/animation/walk-cycle.ts`. Ele já opera sobre as articulações da convenção.
4. Não criar novas ações de animação sem pedido explícito. Ações de esqueleto estão previstas para a Fase 5.

---

## 4. Salas e cenários

1. Cada sala tem seus GLBs em `rooms/<sala>/`.
2. **Merge por material:** juntar malhas que usam o mesmo material (`MergeMeshes`) e depois `freezeWorldMatrix()` nas malhas estáticas.
3. **Instâncias:** objeto repetido (cadeira, luminária) usa `thinInstances`, não cópias.
4. **Luz:** cenário com lightmap baked ou sem sombra dinâmica. Sombra em tempo real só para avatares (como hoje em `shadows.addShadowCaster`).
5. **Carregamento por sala:** carregar ao entrar, descartar ao sair (`container.dispose()`).
6. **Texturas de cenário:** juntar em atlas por categoria (chão, parede, mobília). Formato KTX2 com mipmaps.

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
