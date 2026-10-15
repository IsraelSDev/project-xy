# ADR 0010: Exclusão de conta, exportação de dados e retenção de sessões

- **Status:** aceita
- **Data:** 2026-10-15

## Contexto

Com o site publicado, os direitos do titular (LGPD) deixaram de ser pendência teórica. A decisão de
produto já estava tomada (ADR 0009): excluir a conta **anonimiza** a pessoa e mantém denúncias,
sanções e auditoria. As sessões vencidas nunca eram apagadas.

## Decisões

### Excluir a conta (`POST /account/delete`)

- Exige a **senha atual**: quem só tem o cookie (ex.: computador emprestado) não exclui a conta.
  Senha errada responde 403 (não 401, que o site entende como sessão expirada). Limite de 5
  tentativas por minuto.
- Na mesma transação:
  - e-mail vira `excluida-<id>@excluida.invalid` (domínio `.invalid` não recebe e-mail);
  - nome de exibição vira "Conta excluída"; a chave de unicidade vira `excluida:<id>`, formato que
    nenhum cadastro aceita;
  - senha vira um valor que não é hash scrypt (nenhuma senha confere);
  - data de nascimento e avatar apagados (`birthDate` passou a aceitar nulo), papel volta a `USER`;
  - `deletedAt` preenchido; sessões e bloqueios (nos dois sentidos) apagados;
  - auditoria `account.deleted`.
- O e-mail e o nome ficam livres para um cadastro novo.
- Para os outros, a conta não existe: perfil, bloqueio e denúncia respondem 404. O login responde
  como e-mail inexistente, no mesmo tempo (hash de referência).
- Quem estava numa sala sai quando o ticket vence (ADR 0009): as sessões já não existem.
- `POST` em vez de `DELETE`: o pedido leva corpo (a senha).

### Exportar os dados (`GET /account/export`)

- JSON com conta, sessões, bloqueios feitos, denúncias feitas e sanções recebidas.
- **Fora:** denúncias recebidas, porque revelariam quem denunciou. A sanção recebida entra.
  Revisão jurídica pendente ([privacidade](../operations/privacidade.md)).
- O site gera o arquivo no navegador (Blob), sem nova requisição.

### Sessões vencidas

- Cada login ou cadastro apaga as sessões vencidas de todos (`deleteMany` com índice em
  `expiresAt`). A hospedagem serverless não tem processo para tarefa agendada, e o custo é uma
  consulta indexada por login.

### Migração `exclusao_de_conta`

Só expansiva: coluna `deletedAt` opcional, `birthDate` aceitando nulo e índice em
`Session.expiresAt`. Compatível com a versão anterior da API (rollback sem mexer no banco).

### Testes

`pnpm test` da API não depende mais do pnpm para migrar o banco de teste: o setup chama o CLI do
Prisma pelo próprio Node.

## Pendências

- Revisão jurídica: base legal para manter denúncias e sanções de contas excluídas, e o recorte da
  exportação.
- Prazo de retenção para denúncias, auditoria, logs e backups (inclusive dumps com dados de contas
  já excluídas).
- ~~Reservar o nome "Conta excluída" no cadastro.~~ Feito: o cadastro recusa o nome em qualquer
  caixa, com ou sem acento.
