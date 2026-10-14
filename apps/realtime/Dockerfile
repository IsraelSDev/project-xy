# Imagem só do realtime. Contexto de build: a RAIZ do monorepo (precisa dos pacotes compartilhados).
#   docker build -f apps/realtime/Dockerfile -t 3dx-realtime .
# Sem etapa de build: o Node 24 executa o TypeScript direto. Os pacotes do workspace ficam fora de
# node_modules (o pnpm só cria links), porque o Node não remove tipos de arquivos em node_modules.
FROM node:24-alpine

WORKDIR /app
RUN corepack enable

# Só os manifestos primeiro: a camada de dependências é reaproveitada enquanto eles não mudam.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/realtime/package.json apps/realtime/
COPY packages/contracts/package.json packages/contracts/
COPY packages/game-core/package.json packages/game-core/
COPY packages/observability/package.json packages/observability/
# Na mesma camada, apaga o cache do pnpm e do corepack (centenas de MB que a execução não usa).
RUN pnpm install --frozen-lockfile --prod --filter "@3dx/realtime..." \
  && rm -rf /root/.cache /root/.local/share/pnpm

COPY packages/contracts/src packages/contracts/src
COPY packages/game-core/src packages/game-core/src
COPY packages/observability/src packages/observability/src
COPY apps/realtime/src apps/realtime/src

ENV NODE_ENV=production
USER node
WORKDIR /app/apps/realtime
# A plataforma define PORT; o health check fica em GET /health.
CMD ["node", "src/main.ts"]
