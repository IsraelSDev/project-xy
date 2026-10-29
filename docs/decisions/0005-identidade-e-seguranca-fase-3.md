# ADR 0005: Identidade, chat e segurança (Fase 3)

- **Status:** aceita
- **Data:** 2026-10-14

## Contexto

A Fase 3 pede cadastro e login, perfis mínimos, identidade confiável no realtime, chat público com
limites, bloqueio e denúncia, e registros protegidos de moderação. As três decisões abaixo foram
tomadas com o responsável pelo produto antes da implementação: verificação de idade, ORM e modelo
de autenticação.

## Decisões

### Idade (18+): declaração no cadastro, verificação pelo verify-id

- O cadastro exige data de nascimento e recusa menores de 18 anos ou idades acima de 120. A conta
  guarda `ageAssurance = SELF_DECLARED`.
- **Não é garantia suficiente para lançamento** (especificação, seção 8). Em 2026-10-29 o provedor
  foi decidido e contratado (**verify-id**); as credenciais de integração serão entregues por ele.
  O enum `AgeAssurance` e o módulo `apps/api/src/age-verification` já recebem e registram a
  promoção para `VERIFIED` (referência de uso único de 15 min, trilha de auditoria), então a
  integração troca só a confirmação interna pelo callback do provedor — o contrato do cliente e as
  contas antigas não mudam.
- Retenção mínima de documentos e países atendidos ficam com o provedor; nenhum documento é
  guardado na nossa base.

### Banco: Prisma 7 + PostgreSQL

- Gerador `prisma-client` com `moduleFormat = "cjs"`, porque a API Nest é CommonJS (desde
  2026-10-15, `esm`, junto com a API). O código
  gerado vai para `apps/api/src/generated` (fora do Git, gerado no `postinstall`) e é compilado
  pelo `nest build`. Funciona porque o Node 24 permite `require()` de ESM.
- Driver adapter `@prisma/adapter-pg`, sem binário de consulta.
- Liberei os scripts de instalação de `prisma` (confere a versão do Node) e `@prisma/engines`
  (baixa o Schema Engine do CDN da Prisma, usado pelo `migrate`), com justificativa em
  `pnpm-workspace.yaml`.
- Modelo: `User`, `Session`, `Block`, `Report` e `ModerationAction`.
  - Denúncias e auditoria usam `onDelete: Restrict`, para não sumirem com a conta.
  - Sessões e bloqueios usam `Cascade`.
- `displayNameKey` (nome em minúsculas, único) impede nomes que só diferem na caixa e servem para
  se passar por outra pessoa.

### Autenticação: cookie de sessão + ticket assinado para o realtime

- **Sessão:** token aleatório de 32 bytes num cookie `sid` com `HttpOnly`, `SameSite=Lax`,
  `Secure` em produção, 7 dias. O banco guarda só o **SHA-256** do token, então quem lê o banco não
  sequestra sessões. O logout apaga a sessão no servidor.
- **Senha:** `scrypt` da biblioteca padrão do Node (N = 2^15, r = 8, p = 1, sal de 16 bytes), com
  comparação em tempo constante. O login com e-mail inexistente custa o mesmo tempo que com senha
  errada e devolve a mesma mensagem.
- **CSRF:** cookie `Lax`, corpo sempre JSON e `OriginGuard`. Requisições que alteram estado com
  `Origin` fora de `WEB_ORIGIN` recebem 403.
- **Limites (`@nestjs/throttler`, por IP; desde 2026-10-15, guard próprio `RateLimitGuard`, porque
  o throttler é CommonJS e não carrega o Nest 12 na Vercel):** 120 requisições por minuto no geral, 5 cadastros e 10
  logins por minuto, 30 tickets por minuto e 10 denúncias por hora. O armazenamento é em memória:
  com mais de uma instância da API, vai precisar de um armazenamento compartilhado.
- **Ticket do realtime:** JWT EdDSA (Ed25519, via `jose`) com validade de 60 s.
  - Claims: `sub` (id do usuário), `name` e `blocked` (ids bloqueados, até 500), mais `iss`, `aud` e
    `jti`.
  - **Só a API tem a chave privada; o realtime tem só a pública** e nunca acessa o banco (menor
    privilégio).
  - As chaves vêm do ambiente; `pnpm env:setup` gera as locais.
- **Moderação:** papéis `USER`, `MODERATOR` e `ADMIN`. O papel não pode ser escolhido no cadastro
  (o schema estrito recusa o campo). O primeiro moderador é definido pelo comando `user:role`, que
  registra a mudança na auditoria como ação do sistema.

### Realtime

- `onAuth` exige `{ protocol, ticket }` com `PROTOCOL_VERSION = 2`. Ticket ausente, forjado ou
  expirado recebe 401. Nome e `userId` do jogador vêm do ticket; o cliente não escolhe o próprio
  nome.
- `PlayerState.userId` é o identificador público usado para bloquear e denunciar.
- **Chat:**
  - Texto sem caracteres de controle ou invisíveis, de 1 a 200 caracteres.
  - Limite de 5 mensagens a cada 10 s por usuário; o excedente recebe `chat-rejected` só para quem
    enviou.
  - Payload fora do contrato derruba a conexão.
  - O texto é exibido como texto pelo React, nunca como HTML.
  - **Nada do chat é salvo** (privacidade). Com isso, a moderação ainda não tem como ver o histórico
    de uma denúncia.
- **Bloqueio** vale nos dois sentidos: nenhum dos dois recebe o chat do outro. O filtro roda no
  servidor a partir dos tickets assinados, então o bloqueado não consegue contorná-lo pelo cliente.
  Um bloqueio feito durante a sessão passa a valer quando o cliente reapresenta um ticket novo
  (`refresh-ticket`). Ticket de outro usuário nesse fluxo é ignorado.
- **Sessão fantasma:** quando a mesma conta entra de novo, a reserva de reconexão da sessão antiga
  que caiu é cancelada na hora, sem esperar os 20 s.

### Web

- Tela de entrada (login e cadastro) valida com os mesmos schemas de `@3dx/contracts`, com
  mensagens do zod em `ptBR`.
- Chat no canto inferior direito. A lista de jogadores tem Bloquear e Denunciar, e não oferece essas
  ações para outra sessão da própria conta.
- Diálogo de denúncia e painel de moderação aparecem só para `MODERATOR` e `ADMIN`; a API também
  confere o papel.

### Testes

- Os testes de integração da API rodam no Postgres local, num banco `<db>_test` criado e migrado
  pelo `globalSetup`. Por isso `pnpm test` exige `pnpm db:up`. Cada arquivo de teste é um processo
  com limite de requisições próprio, e os testes de cadastro e login respeitam esses limites.
- Os testes do realtime geram o próprio par de chaves e emitem tickets válidos, forjados e
  expirados.

## Pendências

- **Estratégia de verificação de idade**: resolvida em 2026-10-29 — provedor **verify-id**
  contratado (credenciais a receber). O módulo `age-verification` já cobre referência de uso único,
  promoção para `VERIFIED` e auditoria; falta só a chamada ao provedor no lugar da confirmação
  interna.
- Histórico mínimo de chat para embasar denúncias, com política de retenção definida.
- Mensagens privadas e amizades (a especificação pede só o planejamento nesta fase): exigirão
  persistência, bloqueio também nas DMs e um canal autenticado.
- Exclusão de conta e política de retenção (LGPD).
- Limitador de requisições com armazenamento compartilhado quando houver mais de uma instância.
- Uso único dos tickets (`jti`), se a janela de 60 s para reuso virar problema.

> Resolvido depois: o avatar de quem está bloqueado some do mundo, nos dois sentidos. O servidor
> (que tem o ticket de todos) diz a cada cliente quem esconder; vale na hora, ao entrar/sair alguém
> ou quando um ticket novo muda os bloqueios. O estado da sala continua indo para todos.
