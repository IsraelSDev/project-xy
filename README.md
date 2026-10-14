# 3DXChat Web

Plataforma social 3D multiplayer para adultos, executada no navegador. Especificação completa em
[`3dxchat-web-plano-claude-code.md`](3dxchat-web-plano-claude-code.md).

**Estado atual:** Fase 2 (multiplayer). Vários navegadores entram na mesma sala do lounge e se
veem andando. O servidor realtime é a autoridade sobre posição e rotação: o cliente só envia a
direção desejada. Ainda não há autenticação, chat nem acesso ao banco. Avatar e cenário são
**placeholders** (primitivas geradas por código), sem assets licenciados. Por enquanto o projeto
roda só localmente.

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

Edite o `.env` e troque `POSTGRES_PASSWORD`. O `.env` não é versionado.

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

Controles do mundo 3D: **WASD** ou **setas** para andar (relativo à câmera), **arrastar o mouse**
para girar a câmera e **roda do mouse** para zoom. A cena precisa de WebGL 2.

### Multiplayer local

Abra http://localhost:5173 em duas abas ou dois navegadores: cada um entra na sala `lounge` com
um avatar de cor própria (o seu é cinza). O painel no canto inferior esquerdo mostra o estado da
conexão e os jogadores presentes. Quem cai fica translúcido, marcado como "reconectando", por até
20 s; depois sai da sala.

Para ter outro jogador sem abrir outro navegador, rode um bot que anda em quadrado:

```bash
pnpm --filter @3dx/realtime exec node scripts/bot.ts --seconds 30
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

O Compose exige `POSTGRES_USER`, `POSTGRES_PASSWORD` e `POSTGRES_DB` no `.env`. A API ainda não se
conecta ao banco: o ORM será escolhido na Fase 3.

## Verificações

```bash
pnpm check
```

Roda, em ordem: `format:check`, `lint`, `typecheck`, `test` e `build`. Também dá para rodar cada um
isoladamente (`pnpm lint`, `pnpm test`...). Para corrigir a formatação: `pnpm format`.

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
  api/        NestJS: identidade, perfis e regras de negócio
  realtime/   Colyseus: sala do lounge com estado autoritativo (TypeScript nativo do Node)
packages/
  contracts/  Contratos entre os apps: health check, estado e mensagens da sala (zod + schema)
  game-core/  Simulação compartilhada cliente/servidor: movimento, colisão e layout do lounge
infra/
  docker/     Compose do ambiente local
docs/
  decisions/  Registros de decisão de arquitetura (ADR)
```

## Decisões

As decisões e pendências de cada fase estão em [`docs/decisions/`](docs/decisions/):

- [0001: fundação do monorepo (Fase 0)](docs/decisions/0001-fundacao-fase-0.md)
- [0002: primeiro ambiente 3D (Fase 1)](docs/decisions/0002-ambiente-3d-fase-1.md)
- [0003: pacotes compartilhados e contrato da sala (Fase 2)](docs/decisions/0003-pacotes-compartilhados-fase-2.md)
- [0004: sala autoritativa, rede e interpolação (Fase 2)](docs/decisions/0004-sala-autoritativa-fase-2.md)

## Segurança

- Nunca coloque segredo em variável `VITE_*`: elas entram no bundle do navegador.
- Dependências novas só entram depois de 7 dias publicadas (`minimumReleaseAge`), e scripts de
  instalação ficam bloqueados por padrão (`allowBuilds` em [`pnpm-workspace.yaml`](pnpm-workspace.yaml)).
