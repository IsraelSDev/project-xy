# ADR 0013: Amigos

- **Status:** aceita
- **Data:** 2026-10-15

## Contexto

A especificação prevê, depois do chat público, "mensagens privadas, amigos e convites" (convites
de sala já existem, ADR 0007). Amigos vêm primeiro: as mensagens privadas serão só entre amigos.

## Decisões

- **Uma linha por par** (`Friendship`, chave `userAId` < `userBId`), com quem pediu e o estado
  (`PENDING` ou `ACCEPTED`). Pedido duplicado ou mútuo cai na mesma chave.
- **Pedido mútuo vira amizade:** se B pede A e A já tinha pedido B, aceita na hora (inclusive em
  pedidos simultâneos, resolvidos pela chave única).
- **Só quem recebeu aceita.** Recusar, cancelar e desfazer apagam a linha (`DELETE /friends/:id`).
- **Bloqueio** em qualquer sentido impede pedidos (403, sem dizer quem bloqueou), e bloquear desfaz
  amizade ou pedido na mesma transação.
- **Conta excluída:** amizades apagadas junto com a anonimização; conta excluída não recebe pedido.
  A exportação de dados inclui as amizades.
- **Limites:** 500 amizades e pedidos enviados por conta; 30 pedidos por hora por conta.
- **Site:** botão "Adicionar amigo" / "Aceitar amizade" na lista de jogadores da sala, marca
  "· amigo", e diálogo **Amigos** (pedidos recebidos, amigos, pedidos enviados).

## Próximo passo

Mensagens privadas entre amigos pelo realtime (a amizade irá no ticket, como os bloqueios).
