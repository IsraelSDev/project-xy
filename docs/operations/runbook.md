# Runbook de operação

Procedimentos para quando o projeto sair do ambiente local. **Hoje nada disso está hospedado:** o
que está marcado como _verificado_ foi exercitado localmente; o resto é procedimento a validar no
primeiro ambiente real (staging) antes de valer para produção.

## Componentes

| Serviço  | Processo                              | Estado                                            |
| -------- | ------------------------------------- | ------------------------------------------------- |
| web      | arquivos estáticos de `apps/web/dist` | nenhum                                            |
| api      | `pnpm --filter @3dx/api start` (Nest) | PostgreSQL (contas, sessões, moderação)           |
| realtime | `node src/main.ts` (Colyseus)         | em memória: salas efêmeras, perdidas ao reiniciar |

Variáveis de ambiente: ver [`.env.example`](../../.env.example). Em produção vêm do gerenciador de
segredos da plataforma, nunca de arquivo versionado. `METRICS_TOKEN`, `DATABASE_URL` e
`REALTIME_TICKET_PRIVATE_KEY` são segredos; a chave privada fica **só** na API.

## Checklist antes de publicar

1. `pnpm check` verde e `pnpm --filter @3dx/web e2e` verde.
2. Backup do banco e teste de restauração (seção [Backup](#backup-e-restauração)).
3. Migrações novas revisadas: são compatíveis com a versão anterior da API? (ver
   [Migrações](#migrações)).
4. Se `PROTOCOL_VERSION` mudou, web e realtime saem **juntos** (abas antigas são recusadas pelo
   realtime e precisam recarregar).

## Ordem do deploy

1. **Banco:** `pnpm --filter @3dx/api db:deploy` (só aplica migrações existentes; nunca
   `db:migrate` fora do desenvolvimento).
2. **API:** sobe a nova versão. Sessões continuam válidas (estão no banco).
3. **Realtime:** reiniciar derruba todas as salas (ficam em memória). _Verificado em container
   Linux (`docker stop`, como o Render):_ no `SIGTERM` o Colyseus fecha todas as conexões na hora
   com o código `SERVER_SHUTDOWN` (4001), registra `presence.left` e encerra o processo, sem esperar
   as salas esvaziarem. O cliente reconhece o código, avisa que o servidor foi atualizado e entra
   numa sala pública assim que o servidor novo responde (1 s, 2 s, 4 s… entre tentativas). Salas
   privadas e convites se perdem. Fazer em horário de pouco uso quando houver usuários reais.
4. **Web:** publica `apps/web/dist`. O build precisa de `VITE_REALTIME_URL` quando o realtime
   estiver em outra origem: ele entra no `connect-src` da CSP.
5. Conferir `GET /health` e `GET /metrics` dos dois serviços e o fluxo do e2e manualmente.

## Rollback

- **Web, API e realtime:** voltar para o artefato anterior. Não há estado no processo da API; o
  realtime perde as salas de novo.
- **Banco:** o Prisma não tem migração "down". A regra é que toda migração seja **expansiva**
  (adiciona coluna ou tabela opcional) e que a remoção só aconteça numa versão posterior, quando
  nenhuma versão em uso dependa mais do campo. Assim o rollback do código não exige mexer no
  banco. Se uma migração destrutiva for inevitável, ela exige backup imediatamente anterior e
  aprovação explícita, e o rollback passa a ser restauração do backup (com perda do que foi escrito
  depois).

## Migrações

- Criar em desenvolvimento com `pnpm --filter @3dx/api db:migrate` e versionar a pasta gerada em
  `apps/api/prisma/migrations/`.
- Tabelas grandes: evitar `ALTER` que reescreve a tabela ou segura lock longo (ex.: coluna
  `NOT NULL` sem default em tabela populada). Preferir coluna opcional, preencher em lotes e só
  depois apertar a restrição.
- Índices novos em tabela grande: `CREATE INDEX CONCURRENTLY` em migração SQL manual (não roda
  dentro de transação).

## Backup e restauração

_Verificado localmente_ (Postgres do Docker Compose):

```bash
pnpm db:backup          # pg_dump -Fc em backups/<banco>-<data>.dump
pnpm db:restore-check   # restaura o último backup em <banco>_restore_check, compara linhas, apaga
```

- `backups/` está no `.gitignore`: os dumps têm dados pessoais (e-mail, data de nascimento).
- `db:restore-check` nunca escreve no banco principal. Diferença de contagem só é esperada se o
  banco mudou depois do backup.
- Restauração real (desastre): `pg_restore --clean --if-exists --no-owner -d <banco> <arquivo>` com
  a API e o realtime parados. Exige aprovação explícita: sobrescreve o banco.
- Em produção: usar o backup gerenciado do provedor (PITR) e manter o teste de restauração
  periódico, com o dump guardado criptografado e com retenção definida
  ([privacidade](privacidade.md)).

## Monitoramento

_Verificado localmente:_ `GET /metrics` na API e no realtime, com `Authorization: Bearer
<METRICS_TOKEN>`. Sem token configurado, ou com token errado, a rota responde **404**.

| Métrica                 | API | Realtime | Alerta sugerido (a calibrar)     |
| ----------------------- | --- | -------- | -------------------------------- |
| `cpuPercent`            | sim | sim      | > 70% por 5 min                  |
| `memory.rssMb`          | sim | sim      | crescimento contínuo (vazamento) |
| `eventLoopDelay.p99Ms`  | sim | sim      | > 100 ms                         |
| `database.ok/latencyMs` | sim | não      | `ok=false` ou > 200 ms           |
| `rooms.total/clients`   | não | sim      | capacidade                       |

Logs: o realtime escreve uma linha JSON por evento (`presence.joined`, `presence.dropped`,
`presence.reconnected`, `presence.left`, `ticket.rejected`, `ticket.expired`) com `roomId` e
`sessionId`, sem e-mail nem nome. `ticket.expired` é quem saiu da sala por não renovar o ticket
(suspensão, sessão encerrada ou aba sem rede por mais de 90 s). Desconexões aparecem como `presence.dropped` sem `reconnected` em seguida.

## Carga

_Verificado localmente_ com `pnpm --filter @3dx/realtime load` (tickets assinados com a chave do
`.env`, sem criar contas). Ver números e limites da medição na
[ADR 0008](../decisions/0008-preparacao-producao-fase-6.md).

## Cabeçalhos, HTTPS e CORS

- **API:** `helmet` (nosniff, `X-Frame-Options: SAMEORIGIN`, CSP `default-src 'self'`, sem
  `X-Powered-By`). Cookie `sid` com `Secure` quando `NODE_ENV=production`.
- **Web:** CSP em `<meta>` injetada no build. `frame-ancestors` e HSTS **não** funcionam em meta:
  o servidor/CDN que publicar o site precisa mandar
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `Content-Security-Policy: frame-ancestors 'none'` (ou `X-Frame-Options: DENY`)
  - `Referrer-Policy: strict-origin-when-cross-origin`
- **HTTPS/WSS:** terminar TLS no proxy/CDN; o realtime em `wss://`. Nada aceita HTTP puro fora do
  ambiente local.
- **CORS:** a API **não** habilita CORS. O navegador fala com ela pela mesma origem (`/api`, via
  proxy reverso, como o dev server do Vite faz). Se um dia a API ficar em outra origem, liberar só
  a origem do web, com `credentials`, e manter o `OriginGuard`.
- **Proxy reverso:** o rate limit da API usa o IP do cliente. Atrás de proxy, configurar `trust
proxy` no Express só para os IPs do proxy; senão todos os usuários dividem o mesmo limite.

## CDN e cache

- `apps/web/dist/assets/*` tem hash no nome: `Cache-Control: public, max-age=31536000, immutable`.
- `index.html`: `Cache-Control: no-cache` (sempre revalida, para pegar o bundle novo após deploy).
- API e realtime: sem cache de CDN (`/metrics` nunca exposto publicamente por CDN).
- Assets 3D licenciados (fase futura): mesmo esquema de nome com hash, e conferir se a licença
  permite distribuição por CDN.

## Limites conhecidos para escalar

- Rate limit da API (`RateLimitGuard`): contadores no Postgres, compartilhados entre instâncias,
  por usuário nas rotas autenticadas e por IP no login e no cadastro
  ([ADR 0011](../decisions/0011-rate-limit-compartilhado.md)). Custa um upsert por requisição; se o
  banco virar gargalo, o próximo passo é um Redis.
- O limite do chat do realtime fica em memória, o que basta enquanto o realtime for um processo só.
- O realtime roda em **um processo**. Várias instâncias exigem presença e driver compartilhados do
  Colyseus e balanceamento com afinidade por sala.
- Troca da chave dos tickets: o realtime aceita **uma** chave pública. Trocar exige publicar a
  chave nova no realtime e na API ao mesmo tempo (tickets duram 60 s, então o impacto é curto).
