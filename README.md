# 3DXChat Web

Plataforma social 3D multiplayer para adultos, executada no navegador. Especificação completa em
[`3dxchat-web-plano-claude-code.md`](3dxchat-web-plano-claude-code.md).

**Estado atual:** Fase 1 (primeiro ambiente 3D jogável). Um avatar anda por um lounge com câmera
em terceira pessoa e colisões, só no navegador. Ainda não há multiplayer, autenticação nem acesso
ao banco. Avatar e cenário são **placeholders** (primitivas geradas por código), sem assets
licenciados.

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

Para subir um app só: `pnpm --filter @3dx/api dev` (ou `@3dx/web`, `@3dx/realtime`).

As portas vêm do `.env` (`API_PORT`, `REALTIME_PORT`, `WEB_PORT`). Sem `.env`, os apps usam os
valores padrão da tabela.

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

Em produção as variáveis vêm do ambiente do processo, não do `.env`.

## Estrutura

```text
apps/
  web/        React + Vite + Babylon.js
    src/game/   engine, câmera, movimento, personagens, animação e cenário (sem React)
    src/features/world/  componente React que monta e libera o mundo 3D
  api/        NestJS: identidade, perfis e regras de negócio
  realtime/   Colyseus: salas e estado multiplayer autoritativo
packages/
  contracts/  Tipos compartilhados entre os apps (por enquanto, só tipos)
infra/
  docker/     Compose do ambiente local
docs/
  decisions/  Registros de decisão de arquitetura (ADR)
```

## Decisões

As decisões e pendências de cada fase estão em [`docs/decisions/`](docs/decisions/):

- [0001: fundação do monorepo (Fase 0)](docs/decisions/0001-fundacao-fase-0.md)
- [0002: primeiro ambiente 3D (Fase 1)](docs/decisions/0002-ambiente-3d-fase-1.md)

## Segurança

- Nunca coloque segredo em variável `VITE_*`: elas entram no bundle do navegador.
- Dependências novas só entram depois de 7 dias publicadas (`minimumReleaseAge`), e scripts de
  instalação ficam bloqueados por padrão (`allowBuilds` em [`pnpm-workspace.yaml`](pnpm-workspace.yaml)).
