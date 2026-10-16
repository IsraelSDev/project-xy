# Deploy do realtime no Render (gratuito)

O realtime é um servidor WebSocket de processo longo: não roda em funções serverless (Vercel).
Ele sobe sozinho no Render a partir de [`render.yaml`](../../render.yaml) e da imagem
[`apps/realtime/Dockerfile`](../../apps/realtime/Dockerfile). Web e API continuam onde estão.

## Limites do plano gratuito

- Dorme após 15 min sem tráfego e leva ~1 min para acordar; as salas em memória se perdem.
- 512 MB de RAM e 0,1 CPU: suficiente para testes, não para produção.
- Antes de abrir ao público: conferir a política de uso aceitável do Render para conteúdo adulto
  (<https://render.com/acceptable-use>) e passar para um plano pago sem hibernação.

## Primeira vez

1. Crie uma conta em <https://render.com> e conecte o GitHub com acesso ao repositório.
2. **New → Blueprint**, escolha o repositório e a branch `main`. O Render lê o `render.yaml`.
3. Preencha as variáveis pedidas:
   - `REALTIME_TICKET_PUBLIC_KEY`: o valor de `REALTIME_TICKET_PUBLIC_KEY` do `.env` usado pela
     API (é a chave **pública**; a privada nunca sai da API).
   - `WEB_ORIGIN`: origem(ns) do site, separadas por vírgula. Ex.:
     `http://localhost:5173,https://seu-app.vercel.app`.
   - `DATABASE_URL`: o **mesmo** banco da API. O realtime grava as conversas (chat e MP) na tabela
     `MessageLog` para a administração ler ([ADR 0015](../decisions/0015-leitura-de-conversas-pela-administracao.md)).
     Precisa ser um Postgres acessível pela internet (o Render gratuito não fala com o Docker local);
     sem essa variável, o realtime sobe mas nada é guardado. O banco precisa ter as migrações da API
     aplicadas (`pnpm --filter @3dx/api db:deploy`).
   - `METRICS_TOKEN` é gerado pelo próprio Render.
4. Aguarde o deploy e confira `https://<servico>.onrender.com/health`.

## Apontar o site para o realtime

No ambiente que constrói o web (o `.env` local ou as variáveis do projeto na Vercel):

```dotenv
VITE_REALTIME_URL=https://<servico>.onrender.com
```

A variável entra no bundle (não é segredo) e na CSP do build (`connect-src`). Depois de mudar,
reinicie o `pnpm dev` ou refaça o build.

## Atualizações

Cada push na `main` que mexa em `apps/realtime`, `packages/` ou no lockfile gera deploy novo.
Reiniciar o realtime derruba as salas; os clientes reconectam sozinhos.

## Testar a imagem localmente

```bash
docker build -f apps/realtime/Dockerfile -t 3dx-realtime .
```

Rode com `-e PORT=10000 -p 2568:10000` e as mesmas variáveis do Render.
