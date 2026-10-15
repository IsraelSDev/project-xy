# ADR 0012: Contestação de sanções

- **Status:** aceita
- **Data:** 2026-10-15

## Contexto

Quem recebia uma sanção (ADR 0009) não tinha como contestá-la. Quem estava suspenso não conseguia
nem entrar no site para pedir revisão.

## Decisões

- **Autenticação por e-mail e senha, não por sessão** (`POST /appeals`). Funciona para quem está
  suspenso (sem sessão) e para quem está silenciado. A conferência é a mesma do login
  (`AuthService.verifyCredentials`: conta inexistente ou excluída responde igual a senha errada).
  Limite de 10 por hora por IP.
- **Qual sanção:** a ativa mais grave, ou seja, a suspensão antes do silenciamento. Sem sanção em
  vigor, 409.
- **Uma contestação por sanção** (`Appeal.sanctionId` único). Evita insistência e simplifica a
  fila.
- **O que a pessoa vê:** tipo e prazo da sanção, e depois a decisão. O motivo que a moderação
  registrou fica interno, porque foi escrito como nota de auditoria. A moderação escreve, se quiser,
  uma **resposta** separada, essa sim mostrada à pessoa.
- **Onde aparece:**
  - login de quem está suspenso: a mensagem diz se dá para contestar, se a contestação está em
    análise ou se foi negada (com a resposta), e o site abre o formulário com as credenciais já
    digitadas;
  - **Conta → Contestar sanção**, para quem está silenciado.
- **Decisão da moderação** (`/admin/appeals`, fila no painel de Moderação):
  - **aceitar** revoga a sanção, pela mesma função do botão Revogar (`revokeSanction`). Se a sanção
    terminou enquanto esperava, não há o que revogar;
  - **negar** mantém a sanção;
  - a decisão é atômica (duas pessoas não decidem a mesma contestação duas vezes).
- **Auditoria:** `appeal.created` (pela própria pessoa), `appeal.accepted` ou `appeal.rejected`, e
  `sanction.revoke` quando aceita.
- **Migração `contestacao`:** só cria enum e tabela.

## Pendências

- Avisar por e-mail quando a contestação for decidida (não há envio de e-mail no projeto).
- Prazo de retenção das contestações, junto com o das denúncias
  ([privacidade](../operations/privacidade.md)).
