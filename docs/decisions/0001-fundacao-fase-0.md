# ADR 0001: Fundação do monorepo (Fase 0)

- **Status:** aceita
- **Data:** 2026-10-14

## Contexto

Repositório vazio. A especificação pede um monorepo TypeScript com web (React + Vite), API (NestJS) e
realtime (Colyseus), com health checks, lint, testes, PostgreSQL via Docker Compose e nenhuma abstração
sem necessidade demonstrada.

## Decisões

### Ferramentas e cadeia de suprimentos

- **pnpm 12 via Corepack**, com a versão fixada em `packageManager`.
- **`minimumReleaseAge: 10080`** (7 dias): o pnpm só resolve versões publicadas há pelo menos uma
  semana. Isso reduz a exposição a pacotes comprometidos logo após a publicação. Correções de
  segurança urgentes podem precisar de exceção pontual.
- **Scripts de instalação bloqueados.** `esbuild` e `msgpackr-extract` estão negados explicitamente
  em `allowBuilds`, porque os binários nativos vêm dos pacotes opcionais da plataforma.
- **TypeScript 6.0, não 7.** O `typescript-eslint` aceita `<6.1` e o `@nestjs/cli` usa `~6.0`.
  Reavaliar quando ambos suportarem o 7.

### Testes

- **Vitest em todos os pacotes**, um só runner.
- **Nest sem SWC nos testes.** O transformador oxc do Vite 8 emite `emitDecoratorMetadata` (lido do
  tsconfig). Verificado com um teste de injeção de dependência pelo tipo. O SWC 1.16 foi descartado:
  nesta máquina o binário nativo recusa o cache em `%LOCALAPPDATA%\swc`, porque o diretório concede
  controle a um SID de AppContainer. Além disso, ele não era necessário.

### Apps

- **API em CommonJS** (padrão do Nest); **realtime e web em ESM**. _Atualização (2026-10-15): a
  API passou a ESM; o Nest 12 só existe em ESM e a Vercel não carrega ESM por `require`._
- **Realtime usa `@colyseus/core` + `@colyseus/ws-transport`**, não o meta-pacote `colyseus`, que traz
  Redis, monitor, playground e auth. O `/health` usa o router nativo do Colyseus, sem Express.
- **A web fala com API e realtime pelo proxy do Vite** (`/api`, `/realtime`). Assim não há CORS em
  desenvolvimento. Em produção, um reverse proxy equivalente precisa ser definido.
- **Configuração por variáveis de ambiente.** Os apps carregam o `.env` da raiz com
  `--env-file-if-exists` do Node e têm padrões para as portas. Porta inválida derruba o processo na
  inicialização.

### Pacotes compartilhados

- **`packages/contracts` só exporta tipos** (`exports` com a condição `types` apontando para o `.ts`)
  e é consumido com `import type`, então não há etapa de build. Quando entrar validação em runtime
  das mensagens (Fase 2), será preciso compilar o pacote ou empacotá-lo junto de cada app.
- **`game-core` e `config` não foram criados**, porque ainda não há código para eles.
- **`readPort` está duplicado** em `apps/api` e `apps/realtime` (cerca de 10 linhas). Um pacote
  compartilhado com código de runtime exigiria a etapa de build acima. Consolidar quando ela existir.

### Banco

- **PostgreSQL 18** (`postgres:18-alpine`), com a porta publicada só em `127.0.0.1` e o volume em
  `/var/lib/postgresql`.
- **A API ainda não se conecta ao banco**, porque o ORM (Prisma ou TypeORM) segue pendente.

## Pendências

- ORM: Prisma ou TypeORM.
- Autenticação: sessão ou JWT de curta duração com renovação.
- Reverse proxy e domínios em produção (HTTPS/WSS, CORS).
- Build de `packages/contracts` para código de runtime compartilhado.
- Estratégia de garantia de idade (seção 8 da especificação).
