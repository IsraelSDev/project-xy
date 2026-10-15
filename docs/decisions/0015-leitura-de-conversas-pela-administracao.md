# ADR 0015: Leitura das conversas pela administração

- **Status:** aceita
- **Data:** 2026-10-15

## Contexto

O ADR 0014 decidiu que o **conteúdo não é guardado** e que, por consequência, "a moderação não vê o
conteúdo de mensagens privadas". A moderação pediu o contrário: poder **ler o que foi conversado**,
inclusive mensagens privadas entre amigos, para investigar denúncias. Este ADR reverte, em parte, o
ADR 0014.

## Decisões

- **Persistência:** o realtime grava o chat da sala e a mensagem privada na tabela `MessageLog`
  (Postgres, o mesmo banco da API) por uma conexão `pg` própria, em modo fire-and-forget: uma falha
  de escrita vira log de operação e **não** derruba o chat. Sem `DATABASE_URL`, nada é guardado
  (testes e ambientes sem banco seguem iguais).
- **Sem nomes, só ids.** A tabela guarda `senderId`/`recipientId`; os nomes são resolvidos na
  leitura. Assim a exclusão da conta (que anonimiza o `User`) reflete na hora — a conversa aparece
  como "Conta excluída". Sem chave estrangeira para `User`: é um log, escrito pelo realtime.
- **Chat da sala:** guarda `roomId` (efêmero) e o `roomTitle` do momento, para a administração
  identificar a sala.
- **Mensagem privada:** guarda o par por `conversationKey` (`menorId:maiorId`, como `Friendship`),
  então a mesma dupla cai sempre na mesma conversa.
- **Retenção de 90 dias.** A API apaga o que venceu pelas próprias leituras (índice em `sentAt`),
  sem tarefa agendada — como já faz com sessões e rate limit.
- **Quem lê: só `ADMIN`.** `MODERATOR` não lê conversas. Toda leitura grava uma ação de auditoria
  (`ModerationAction action = 'conversation.read'`, `note = '<kind>:<id>'`).
- **API:** `GET /admin/conversations?kind=DIRECT|ROOM` (lista), `GET /admin/conversations/direct/:a/:b`
  e `GET /admin/conversations/room/:roomId` (thread, em ordem cronológica, até 500 mensagens).
- **Site:** botão **Conversas** na barra, só para `ADMIN`, com abas Privadas/Salas e **Ler conversa**.
- **Titular:** a exclusão de conta apaga as mensagens do titular (enviadas e recebidas) e a
  exportação passa a incluir as próprias mensagens (direito de acesso).
- Sem mudança de protocolo (`PROTOCOL_VERSION`) nem do contrato da sala: o registro é interno.

## Limites conhecidos

- **Conteúdo em texto puro** no banco, sem criptografia além da do provedor. Ler conversas privadas
  exige **base legal e transparência** (aviso na política de privacidade) e revisão jurídica (LGPD).
  Registrado em `docs/operations/privacidade.md`.
- Várias instâncias do realtime gravam no mesmo banco (ok); a presença continua por instância.
- Só as **500 mensagens mais recentes** de cada conversa são lidas pela API (a lista mostra o total).
- A lista cobre as **100 conversas mais recentes**.
