# Deploy do web e da API na Vercel (projetos separados)

| Parte    | Onde                                  | Root Directory |
| -------- | ------------------------------------- | -------------- |
| web      | projeto Vercel (Vite)                 | `apps/web`     |
| API      | projeto Vercel (NestJS, uma Function) | `apps/api`     |
| banco    | Prisma Postgres (integração Vercel)   | —              |
| realtime | Render ([guia](deploy-realtime.md))   | —              |

Cada projeto instala só as próprias dependências (`installCommand` com `--filter` no
`vercel.json` de cada app); sem isso a Vercel instala o monorepo inteiro e roda os scripts de
instalação de todos os apps.

O navegador fala só com o domínio do web: o [`apps/web/vercel.json`](../../apps/web/vercel.json)
repassa `/api/*` para a API. Assim o cookie de sessão é do mesmo site e não há CORS.

## 1. Banco (Prisma Postgres)

A integração cria variáveis com o prefixo escolhido (ex.: `xydb_DATABASE_URL`). A API lê
**`DATABASE_URL`** e usa conexão Postgres direta (driver `pg`), não a URL `prisma+postgres://` do
Accelerate.

Aplique as migrações uma vez (e a cada migração nova), do seu computador, com a URL direta do
banco (`xydb_DATABASE_URL` ou `xydb_POSTGRES_URL`, a que começa com `postgres://`):

```powershell
$env:DATABASE_URL = "<url postgres:// do Prisma Postgres>"; pnpm --filter @3dx/api db:deploy
```

A variável do terminal tem prioridade sobre o `.env` local. Feche o terminal depois: a URL contém
a senha do banco.

## 2. Projeto da API

- **Root Directory:** `apps/api`. Framework: NestJS (detectado; entrada `src/main.ts`).
- **Variáveis** (Production e Preview):

| Variável                       | Valor                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| `DATABASE_URL`                 | a URL `postgres://` do Prisma Postgres                                                    |
| `REALTIME_TICKET_PRIVATE_KEY`  | chave privada Ed25519 (par da pública configurada no Render)                              |
| `WEB_ORIGIN`                   | domínio do web, ex.: `https://seu-web.vercel.app`                                         |
| `METRICS_TOKEN`                | token longo e aleatório                                                                   |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` (o repositório fixa o pnpm 12 em `packageManager`; sem isso a Vercel pode usar outro) |

O par de chaves pode ser o do seu `.env` local (`pnpm env:setup`) ou um novo, só de produção. O
importante é a privada na API e a pública correspondente no Render.

Depois do deploy, confira `https://<api>.vercel.app/health`.

Para promover a primeira moderadora, rode localmente com a `DATABASE_URL` de produção no terminal:
`pnpm --filter @3dx/api user:role pessoa@exemplo.com MODERATOR`.

## 3. Projeto do web

- Troque `TROQUE-PELO-DOMINIO-DA-API.vercel.app` em [`apps/web/vercel.json`](../../apps/web/vercel.json)
  pelo domínio da API e faça commit.
- **Root Directory:** `apps/web`. Framework: Vite.
- **Variáveis:**

| Variável                       | Valor                               |
| ------------------------------ | ----------------------------------- |
| `VITE_REALTIME_URL`            | `https://project-xy-1.onrender.com` |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1`                                 |

`VITE_REALTIME_URL` entra no bundle e na CSP do build (`connect-src`); mudou, refaça o deploy.

## 4. Realtime (Render)

Em **Environment** do serviço no Render:

- `WEB_ORIGIN`: o domínio do web (`https://seu-web.vercel.app`; vários separados por vírgula, ex.:
  também `http://localhost:5173` para testar local).
- `REALTIME_TICKET_PUBLIC_KEY`: a pública do mesmo par usado na API.
- **Health Check Path:** `/health`.

## Ordem

1. Migrações no banco → 2. deploy da API → 3. domínio da API no `apps/web/vercel.json` → 4. deploy
   do web → 5. `WEB_ORIGIN` no Render e na API com o domínio do web (redeploy de ambos).

## Riscos ainda não verificados

- Primeiro deploy da API: a Vercel precisa compilar os pacotes do workspace (`@3dx/contracts`,
  `@3dx/observability`), que exportam TypeScript. Se o build ou a Function falhar com erro de
  módulo, mande o log.
- Rate limit: a API confia no `X-Forwarded-For` da Vercel (`trust proxy`). Conferir nos logs que o
  IP visto é o do cliente, não o do proxy do web.
- Conexões com o banco: cada instância da Function abre seu próprio pool `pg`. Com muitas
  instâncias, o limite de conexões do plano gratuito do Prisma Postgres pode estourar.
- Realtime no plano gratuito do Render dorme após 15 min: o primeiro acesso depois disso leva ~1 min.
