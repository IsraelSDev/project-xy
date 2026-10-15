# ADR 0008: Preparação para produção (Fase 6)

- **Status:** aceita
- **Data:** 2026-10-14

## Contexto

A Fase 6 pede testes E2E e de carga, monitoramento, backup com teste de restauração, rate limiting,
HTTPS e cabeçalhos de segurança, CDN, procedimentos de deploy e rollback, e revisão legal. O projeto
continua **só local até o MVP**: não há hospedagem, domínio, certificado nem CDN. Esta fase entrega
o que dá para construir e verificar localmente e documenta o resto como procedimento a validar no
primeiro ambiente real.

## Decisões

### Testes

- **E2E com Playwright** (`apps/web/e2e`, `pnpm --filter @3dx/web e2e`), Chromium com WebGL por
  software (SwiftShader), então roda sem GPU. Sobe API, realtime e web pelo `webServer` do
  Playwright ou reaproveita os que já estão no ar. Cobre: menor de idade barrado no cadastro; duas
  pessoas se cadastram, entram na mesma sala e trocam mensagens.
- O E2E fica **fora** do `pnpm check`: precisa do banco, baixa o navegador e leva mais tempo.
- **Carga do realtime** (`pnpm --filter @3dx/realtime load`): assina tickets com a chave do `.env`
  (faz o papel da API, sem criar contas) e mede a latência de comando, isto é, o tempo entre enviar
  um movimento e receber o patch em que o próprio jogador virou. Amostra `/metrics` durante o teste.

### Resultado da carga (máquina de desenvolvimento, Windows, tudo local)

| Clientes | Salas | Latência p50 / p95 / p99 | CPU máx | RSS máx | Event loop p99 |
| -------- | ----- | ------------------------ | ------- | ------- | -------------- |
| 48       | 3–4   | 75 / 108 / 112 ms        | 12%     | 105 MB  | 26 ms          |
| 96       | 7     | 81 / 116 / 124 ms        | 30%     | 128 MB  | 27 ms          |

- O piso da latência vem do desenho: a simulação e o envio de patches rodam a 20 Hz cada (ADR
  0004), então o comando espera até 50 ms pela simulação e até 50 ms pelo patch. Os clientes da
  carga rodam no mesmo processo Node, o que soma tempo de decodificação do lado cliente.
- A medição é sensível à carga da máquina: uma rodada curta (48 clientes, 10 s) logo depois do E2E
  teve p99 de 345 ms com o p50 inalterado (83 ms). Comparar versões sempre com a máquina ociosa.
- Sem rede real: os números servem de **linha de base** para comparar versões, não de capacidade de
  produção.
- **Falha intermitente (resolvida em 2026-10-15):** numa rodada com 96 clientes, 35 entradas
  falharam. Causa: o realtime rodava em modo dev (`node --watch`), e no Windows o `--watch` reinicia
  o processo quando antivírus ou indexador mexem em arquivos do `node_modules` (visto acontecer
  sozinho, sem edição). Reinício durante a entrada reproduz a falha (`fetch failed`, 42 de 96). Sem
  `--watch` (produção, container): 0 falhas em 4 rodadas, até 200 clientes, 65 MB de memória. O
  `--watch-path` do Node 24.21 não evita (os módulos importados continuam observados).

### Monitoramento

- Pacote `@3dx/observability` compartilhado: amostra de processo (CPU, memória, atraso do event
  loop), autorização do `/metrics` e log em linha JSON.
- `GET /metrics` na API (inclui latência do banco) e no realtime (inclui salas e clientes).
  Protegido por `Authorization: Bearer <METRICS_TOKEN>` com comparação em tempo constante. Sem
  token configurado a rota responde **404**, para não anunciar que existe. `pnpm env:setup` gera o
  token.
- JSON próprio em vez de formato Prometheus: sem coletor escolhido ainda, o JSON é lido por
  qualquer ferramenta e por `curl`. Trocar de formato quando houver plataforma de monitoramento.
- Logs de presença do realtime (`presence.*`, `ticket.rejected`) em JSON, sem dado pessoal.

### Backup

- `pnpm db:backup`: `pg_dump -Fc` pelo container do Compose, em `backups/` (fora do Git).
- `pnpm db:restore-check`: restaura num banco temporário, compara a contagem de linhas de cada
  tabela com a origem e apaga o temporário. Nunca escreve no banco principal.

### Segurança HTTP

- **API:** `helmet` em todas as rotas.
- **Web:** CSP em `<meta>` injetada só no build (o dev server do Vite usa scripts inline para o
  hot reload). O realtime entra no `connect-src` a partir de `VITE_REALTIME_URL`.
- `frame-ancestors`, HSTS e `Referrer-Policy` dependem do servidor que publicar o site: estão no
  [runbook](../operations/runbook.md#cabeçalhos-https-e-cors).
- Rate limit e auditoria administrativa já vinham das Fases 3 e 5. Nada novo aqui, além de
  registrar que os limites ficam em memória (um processo).

### Documentação

- [Runbook](../operations/runbook.md): deploy, rollback, migrações, backup, monitoramento,
  cabeçalhos, CDN e limites para escalar.
- [Privacidade](../operations/privacidade.md): inventário de dados pessoais e pendências legais e de
  fornecedores.

## Fora do escopo (decisão de ficar local)

- Hospedagem, HTTPS/WSS reais, CDN, backup gerenciado e alertas: procedimentos escritos, nada
  provisionado.
- Rate limit compartilhado entre instâncias e realtime em várias instâncias.

## Pendências

- ~~Investigar a falha intermitente de entrada sob 96 clientes.~~ Era o `--watch` do modo dev.
- Rotina que apaga sessões expiradas (hoje só o logout apaga).
- Exportação e exclusão de conta (direitos do titular).
- ~~Verificar o desligamento do Colyseus no `SIGTERM`.~~ Verificado ([runbook](../operations/runbook.md#ordem-do-deploy)).
- Itens legais em [privacidade.md](../operations/privacidade.md), principalmente verificação de
  idade.
