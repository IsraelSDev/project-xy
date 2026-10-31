# 3DXChat Web

Plataforma social 3D multiplayer para adultos, executada no navegador. Especificação completa em
[`3dxchat-web-plano-claude-code.md`](3dxchat-web-plano-claude-code.md).

**Estado atual:** fases 0 a 6 concluídas, mais a Fase 7 (provedor de verificação de idade
contratado) e sanções de moderação (silenciar e suspender). A
Fase 6 trouxe E2E, carga, métricas, backup, cabeçalhos de segurança e runbook, sobre salas e
interações (5), avatares (4) e identidade (3). Cadastro e login com sessão em cookie,
sala multiplayer com identidade verificada, chat público com limites, bloqueio, denúncia, fila de
moderação com auditoria, avatar personalizável (catálogo fechado, salvo na conta), salas públicas e
privadas com convite, e interações (sentar, acenar, dançar). O servidor realtime é a autoridade sobre posição e rotação. O avatar é o modelo 3DX nativo e a **balada** (`level7`) é o hall inicial, com texturas em resolução nativa, normal/emissive, luzes coloridas e colisão real. A **praia** também tem geometria nativa (recorte da cena, com areia e mar desenhados no cliente) e o **closet** usa o quarto do editor; `lounge` e `private-room` ainda usam o layout provisório. Por enquanto o projeto roda só localmente.

> **Idade:** no MVP a idade é apenas **declarada** (data de nascimento, recusa menores de 18). A
> verificação pelo provedor **verify-id** está contratada e entra quando as credenciais chegarem; o
> módulo `age-verification` já guarda o estado `VERIFIED` e a auditoria
> ([ADR 0005](docs/decisions/0005-identidade-e-seguranca-fase-3.md)).

## Requisitos

- Node.js 24 (ver [`.nvmrc`](.nvmrc))
- pnpm 12, via Corepack (a versão exata está em `packageManager` no [`package.json`](package.json))
- Docker com Docker Compose, só para o PostgreSQL local

## Instalação

```bash
corepack enable pnpm
pnpm install
cp .env.example .env
```

Edite o `.env` e troque `POSTGRES_PASSWORD`. Depois complete o `.env` (banco e chaves dos
tickets), suba o banco e aplique as migrações:

```bash
pnpm env:setup
pnpm db:up
pnpm --filter @3dx/api db:deploy
```

O `.env` não é versionado. `pnpm env:setup` não sobrescreve valores existentes nem imprime segredos.

## Desenvolvimento

```bash
pnpm dev
```

Sobe os três apps em paralelo, com reload:

| App      | Pacote          | Porta padrão | Health                           |
| -------- | --------------- | ------------ | -------------------------------- |
| Web      | `@3dx/web`      | 5173         | painel no canto superior direito |
| API      | `@3dx/api`      | 3000         | `GET /health`                    |
| Realtime | `@3dx/realtime` | 2567         | `GET /health`                    |

Abra http://localhost:5173. O dev server do Vite repassa `/api/*` para a API e `/realtime/*` para o
realtime, então o navegador fala só com uma origem e não há CORS em desenvolvimento.

Controles do mundo 3D: **WASD** ou **setas** para andar (relativo à câmera), **SHIFT** para correr
(10x a caminhada, só para contas **ADMIN**), **arrastar o mouse** para girar a câmera e **roda do
mouse** para zoom. A cena precisa de WebGL 2.

Clique/toque direto no mundo: no **piso** o avatar anda até ali; no **sofá/cadeira/cama/banco** o
clique esquerdo abre o **menu do móvel** (Sentar aqui — ou Levantar, se já estiver sentado — e
**convidar alguém da sala para aquela posição**, que senta você antes de mandar o convite) e o
**botão direito senta direto** (anda até a frente do móvel e usa a mesma ação do atalho **E**); no
**corpo de alguém** o clique esquerdo abre o menu de ações ao lado do ponteiro (**Ver perfil**,
amizade, interações do par — abraço, dança, beijos, pares de móvel —, **Bloquear** e **Denunciar**),
sem precisar procurar a pessoa na lista da sala.
Quando há avatar ou móvel com opção sob o ponteiro, o **cursor vira o asterisco verde do 3DX**.
Durante um par, o **painel lateral de poses** abre sozinho com as cenas daquele móvel (Sofá 1, 2, 3…)
ou os pares sociais (abraço, beijos, danças) e troca a animação sem encerrar; a cena atual fica
destacada e o botão **Poses** na barra da interação reabre o painel. Sentado, um toque no piso
levanta; **Esc** ou tocar fora fecha os menus.

No **celular/tablet** (apontador de toque): **joystick virtual** no canto inferior esquerdo para
andar, **botões** (Sentar/Levantar, Dançar, Dançar 2) no canto direito, e os mesmos toques no mundo
(piso, móvel, avatar). Os painéis do HUD sobem enquanto os controles estão na tela.

### Roupa direto no mundo

No topo da tela, o painel **Roupa** mostra o que o avatar está vestindo em uma **grade de
miniaturas** (fotos das peças), com um toque para tirar cada peça sem abrir o vestiário — a camiseta
e o casaco contam como uma peça só (ocupam a mesma camada). Quem sai vai para **Vestir de novo**
(com um `+`), e o atalho **Tirar a roupa** tira camada de cima, fantasia, parte de baixo, meias,
sapatos e luvas, mantendo a roupa íntima e os acessórios (chapéu, óculos e máscara).

As miniaturas são renderizadas a partir dos próprios GLBs (fundo transparente, um PNG por peça) e
ficam em `apps/web/public/assets/3dx/clothes/thumbs`; sem o PNG, o tile cai no ícone do slot. Para
regerar depois de mudar o catálogo:

```powershell
python tools/3dx/run_blender.py render_cloth_thumbs.py -- --out apps/web/public/assets/3dx/clothes/thumbs
```

A mudança é **salva no perfil** e vale para todo mundo na hora: o cliente grava em `PUT /avatar`,
reapresenta o ticket do realtime e o servidor atualiza o avatar de todos na sala. Para conferir:

```powershell
cd apps/web
node scripts/outfit-check.mjs   # tira/veste peças e confere o avatar salvo na API
```

### PWA (instalar no celular)

O app é um PWA: manifest com ícones (inclusive maskable), **service worker** com app shell offline e
cache versionado dos assets. Em produção (`pnpm --filter @3dx/web build` + `preview`), o navegador
oferece “Instalar” e abre em tela cheia (`standalone`). Para conferir:

```powershell
pnpm --filter @3dx/web build
pnpm --filter @3dx/web preview --port 4173
cd apps/web
node scripts/pwa-check.mjs          # manifest, ícones, service worker e reload offline
node scripts/touch-check.mjs        # controles de toque (emulação de celular) e ausência no desktop
```

O service worker **não** é registrado em desenvolvimento (cache do Vite atrapalharia o hot reload) e
nunca cacheia `/api` nem `/realtime`.

### Voz por proximidade (WebRTC)

O botão **Voz** (canto superior direito) abre o painel; **Ligar microfone** entra na voz da sala — o
clique é o consentimento, não existe convite por par. O áudio vai **direto entre os navegadores**
(um canal 1:1 por pessoa, mesh); o servidor só repassa a sinalização (oferta/resposta/candidatos ICE)
pelo mesmo WebSocket da sala e **não vê o áudio**.

- **Distância**: volume cheio até 3 m, caindo suavemente até sumir em 15 m. O volume é aplicado no
  próprio elemento de áudio (caminho nativo do navegador): no Chrome, passar o stream remoto pelo
  WebAudio fazia a voz chegar em rajadas, então o som **não** passa por lá.
- **Quem fala**: um ponto verde acende no nome de quem está falando (nível de áudio do RTP) e no
  cabeçalho do painel.
- **Controles**: **Mudo** desliga o próprio microfone (continua ouvindo), o **volume** geral vai de 0
  a 100% e **Silenciar** esconde uma pessoa só para você.
- **Bloqueio**: o servidor não repassa a sinalização entre quem se bloqueou, então o canal nem abre.
- Trocar de sala **mantém** o microfone ligado e entra na voz da nova sala; sair da voz desliga tudo.

Em produção, configure STUN/TURN em `VITE_ICE_SERVERS` (JSON de `RTCIceServer[]`, veja
`.env.example`). Sem **TURN** o voicechat só conecta quando as redes permitem ligação direta — para
internet aberta é preciso um TURN (ex.: coturn) com credenciais efêmeras.

Para conferir com navegadores reais (microfone sintético do Chrome):

```powershell
cd apps/web
node scripts/voice-check.mjs        # 2 usuários
node scripts/voice-check.mjs http://localhost:5173 4   # 4 usuários (se a máquina aguentar 4 Chromiums)
```

O script confere a lista de vozes dos dois lados, o mudo, o silenciar individual, o áudio decodificado
nos canais e o indicador de fala. Com `HEADED=1` ele roda com janelas (saída de áudio real):

```powershell
$env:HEADED='1'; node scripts/voice-check.mjs   # janelas abrem por alguns segundos
```

A lista de vozes e o relay com **4 jogadores** são cobertos pelo teste do realtime
(`rooms-and-actions.test.ts`).

O cadastro tem limite de 5 por minuto por IP: rode uma vez por minuto.

### Multiplayer local

Abra http://localhost:5173, crie uma conta e entre. Em outra janela anônima (ou outro navegador),
crie outra conta: cada uma entra na sala inicial **Balada** com um avatar de cor própria (o seu é cinza).

- **Painel da sala** (inferior esquerdo): conexão e jogadores, com **Bloquear** e **Denunciar**.
  Quem cai fica translúcido, marcado como "reconectando", por até 20 s; se a mesma conta entra de
  novo (ex.: recarregou a página), a sessão antiga sai na hora.
- **Chat** (inferior direito): mensagens de até 200 caracteres, no máximo 5 a cada 10 s. Bloqueio
  vale nos dois sentidos. **Esc** devolve o teclado ao mundo 3D. Nada do chat é salvo no servidor.

Para ter outro jogador sem abrir outro navegador, rode um bot (cria uma conta de bot a cada
execução, entra, diz "oi" e anda em quadrado):

```bash
pnpm --filter @3dx/realtime exec node scripts/bot.ts --seconds 30
```

### Salas e interações

- **Salas** (botão no painel da sala): lista das salas públicas, entrar, ou criar uma sala pública
  ou privada. Na privada, o dono copia o link de convite (`/?sala=…&convite=…`) e pode trocar o
  convite, o que invalida os links antigos. Salas vivem enquanto tiverem gente.
- **Interações:** **E** senta no sofá mais próximo (ou levanta), **1** acena, **2** dança (de novo
  para parar). Também há botões no painel da sala. Andar encerra qualquer ação.
- Bot numa sala específica: `node scripts/bot.ts --room <id> --invite <código>`.

### Avatar

Botão **Avatar** no topo: corpo, tom de pele, cabelo, roupas, cores e acessório, com prévia no seu
personagem. Ao salvar, os outros jogadores na sala veem a mudança na hora. Só existem opções do
catálogo ([`packages/contracts/src/avatar.ts`](packages/contracts/src/avatar.ts)); o personagem usa
o corpo 3DX nativo com pele, rosto e roupas **texturizados** (albedo + normal map na resolução
original), e o catálogo de cores é aplicado por cima (ver [`tools/3dx/README.md`](tools/3dx/README.md)).

Para ver a sala cheia e medir desempenho (FPS e malhas aparecem no painel da sala):

```bash
pnpm --filter @3dx/realtime exec node scripts/bot.ts --count 15 --seconds 60
```

### Amigos

Na lista de jogadores da sala, **Adicionar amigo** manda um pedido (se a outra pessoa já tinha
pedido, vira amizade na hora). O botão **Amigos** no topo lista amigos e pedidos. Bloquear desfaz a
amizade ([ADR 0013](docs/decisions/0013-amigos.md)). Amigos online trocam **mensagens privadas**
pelo painel Mensagens, em qualquer sala; o conteúdo não é guardado
([ADR 0014](docs/decisions/0014-mensagens-privadas.md)).

### Conta

O botão **Conta** no topo exporta os dados da própria conta (JSON) e exclui a conta com a senha
atual. A exclusão anonimiza: apaga e-mail, senha, data de nascimento, avatar, sessões e bloqueios,
e mantém denúncias e sanções sem os dados pessoais
([ADR 0010](docs/decisions/0010-exclusao-de-conta-e-retencao.md)).

### Moderação

Denúncias vão para uma fila visível só a `MODERATOR` e `ADMIN` (botão **Moderação** no topo).
Ao resolver, dá para **silenciar** (sem chat, com prazo) ou **suspender** (sem login nem salas, com
prazo ou permanente) quem foi denunciado; o painel lista as sanções em vigor, com motivo, e permite
revogar. No flagrante, o botão **Moderar** na lista de jogadores da sala aplica a sanção direto,
sem denúncia, com motivo obrigatório. Quem recebeu a sanção pode contestá-la uma vez: quem está
suspenso, pela tela de login; quem está silenciado, em **Conta**. A fila de contestações fica no
painel de Moderação; aceitar revoga a sanção
([ADR 0012](docs/decisions/0012-contestacao-de-sancoes.md)).
A sanção chega a quem está numa sala na próxima renovação do ticket (a cada 20 s). Toda revisão,
sanção e revogação fica na trilha de auditoria. Para promover uma conta (registrado na auditoria como
ação do sistema):

```bash
pnpm --filter @3dx/api user:role pessoa@example.com MODERATOR
```

O realtime roda com o TypeScript nativo do Node (`node src/main.ts`), sem etapa de build.

Para subir um app só: `pnpm --filter @3dx/api dev` (ou `@3dx/web`, `@3dx/realtime`).

As portas vêm do `.env` (`API_PORT`, `REALTIME_PORT`, `WEB_PORT`). Sem `.env`, os apps usam os
valores padrão da tabela. `VITE_REALTIME_URL` aponta o navegador para outro endereço de realtime;
vazio, usa `/realtime` na mesma origem.

### Banco local

```bash
pnpm db:up     # sobe o PostgreSQL 18 (porta só em 127.0.0.1)
pnpm db:logs   # acompanha os logs
pnpm db:down   # para o container (os dados ficam no volume)
```

O Compose exige `POSTGRES_USER`, `POSTGRES_PASSWORD` e `POSTGRES_DB` no `.env`. A API usa Prisma 7
(schema em [`apps/api/prisma/schema.prisma`](apps/api/prisma/schema.prisma)):

```bash
pnpm --filter @3dx/api db:migrate   # cria/aplica migração em desenvolvimento
pnpm --filter @3dx/api db:deploy    # só aplica as migrações existentes
```

Os testes da API usam o mesmo Postgres, num banco separado `<POSTGRES_DB>_test` criado e migrado
automaticamente; por isso `pnpm test` e `pnpm check` precisam do banco no ar (`pnpm db:up`).

Backup e teste de restauração (os dumps ficam em `backups/`, fora do Git, e têm dados pessoais):

```bash
pnpm db:backup          # pg_dump do banco local
pnpm db:restore-check   # restaura o último backup num banco temporário e compara as tabelas
```

## Verificações

```bash
pnpm check
```

Roda, em ordem: `format:check`, `lint`, `typecheck`, `test` e `build`. Também dá para rodar cada um
isoladamente (`pnpm lint`, `pnpm test`...). Para corrigir a formatação: `pnpm format`.

Fora do `check`, porque precisam do banco e de mais tempo:

```bash
pnpm --filter @3dx/web e2e        # Playwright (sobe API, realtime e web se não estiverem no ar)
pnpm --filter @3dx/realtime load  # carga no realtime em execução (--clients 48 --seconds 30)
```

O E2E usa o Chromium do Playwright (`pnpm --filter @3dx/web exec playwright install chromium` na
primeira vez).

Métricas: `GET /metrics` na API e no realtime, com `Authorization: Bearer <METRICS_TOKEN>` (gerado
por `pnpm env:setup`). Sem o token, a rota responde 404. Procedimentos de deploy, rollback e
monitoramento: [`docs/operations/runbook.md`](docs/operations/runbook.md). Deploy do realtime
sozinho no Render (gratuito): [`docs/operations/deploy-realtime.md`](docs/operations/deploy-realtime.md).
Web e API na Vercel, em projetos separados: [`docs/operations/deploy-vercel.md`](docs/operations/deploy-vercel.md).

Build de produção e execução:

```bash
pnpm build
pnpm --filter @3dx/api start
pnpm --filter @3dx/realtime start
pnpm --filter @3dx/web preview
```

O realtime não tem build: `start` executa `src/main.ts` direto no Node 24.

Em produção as variáveis vêm do ambiente do processo, não do `.env`.

## Estrutura

```text
apps/
  web/        React + Vite + Babylon.js
    src/game/   engine, câmera, entrada, rede, avatares, animação e cenário (sem React)
    src/features/world/  componente React que monta e libera o mundo 3D
    src/features/rooms/  painel da sala (conexão e jogadores)
    src/features/auth, chat, safety, moderation/  telas de entrada, chat, denúncia e moderação
  api/        NestJS + Prisma: contas, sessões, tickets do realtime, bloqueios, denúncias, moderação
  realtime/   Colyseus: salas com estado autoritativo e chat (TypeScript nativo do Node)
packages/
  contracts/  Contratos entre os apps: health check, estado e mensagens da sala (zod + schema)
  game-core/  Simulação compartilhada cliente/servidor: movimento, colisão e layout do lounge
  observability/  Métricas de processo, autorização do /metrics e log JSON (API e realtime)
infra/
  docker/     Compose do ambiente local
scripts/      env:setup, backup e teste de restauração do banco
docs/
  decisions/  Registros de decisão de arquitetura (ADR)
  operations/ Runbook (deploy, rollback, backup, monitoramento) e checklist de privacidade
```

## Decisões

As decisões e pendências de cada fase estão em [`docs/decisions/`](docs/decisions/):

- [0001: fundação do monorepo (Fase 0)](docs/decisions/0001-fundacao-fase-0.md)
- [0002: primeiro ambiente 3D (Fase 1)](docs/decisions/0002-ambiente-3d-fase-1.md)
- [0003: pacotes compartilhados e contrato da sala (Fase 2)](docs/decisions/0003-pacotes-compartilhados-fase-2.md)
- [0004: sala autoritativa, rede e interpolação (Fase 2)](docs/decisions/0004-sala-autoritativa-fase-2.md)
- [0005: identidade, chat e segurança (Fase 3)](docs/decisions/0005-identidade-e-seguranca-fase-3.md)
- [0006: avatares personalizáveis (Fase 4)](docs/decisions/0006-avatares-personalizaveis-fase-4.md)
- [0007: salas e interações (Fase 5)](docs/decisions/0007-salas-e-interacoes-fase-5.md)
- [0008: preparação para produção (Fase 6)](docs/decisions/0008-preparacao-producao-fase-6.md)
- [0009: sanções de moderação](docs/decisions/0009-sancoes-de-moderacao.md)
- [0010: exclusão de conta, exportação de dados e retenção](docs/decisions/0010-exclusao-de-conta-e-retencao.md)
- [0011: rate limit compartilhado e por usuário](docs/decisions/0011-rate-limit-compartilhado.md)
- [0012: contestação de sanções](docs/decisions/0012-contestacao-de-sancoes.md)
- [0013: amigos](docs/decisions/0013-amigos.md)
- [0014: mensagens privadas](docs/decisions/0014-mensagens-privadas.md)

## Segurança

- Nunca coloque segredo em variável `VITE_*`: elas entram no bundle do navegador.
- Dependências novas só entram depois de 7 dias publicadas (`minimumReleaseAge`), e scripts de
  instalação ficam bloqueados por padrão (`allowBuilds` em [`pnpm-workspace.yaml`](pnpm-workspace.yaml)).
