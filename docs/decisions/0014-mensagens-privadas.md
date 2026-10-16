# ADR 0014: Mensagens privadas

- **Status:** aceita (revisada pelo [ADR 0015](./0015-leitura-de-conversas-pela-administracao.md))
- **Data:** 2026-10-15

> O ADR 0015 reverte o "conteúdo não é guardado": o chat da sala e as mensagens privadas passam a ser
> registrados por 90 dias e lidos só pela administração (`ADMIN`). O restante deste ADR continua valendo.

## Contexto

Com amigos (ADR 0013), o passo seguinte da especificação são as mensagens privadas.

## Decisões

- **Só entre amigos** (amizade aceita). A lista vai no ticket do realtime (`friends`, até 500), como
  os bloqueios; o campo é opcional no contrato para aceitar tickets da API anterior durante o
  deploy.
- **Pelo realtime, entre salas:** cada sala assina, na presença do Colyseus, o canal `dm:<id>` de
  quem está nela, e uma contagem de sessões por usuário (`dm:online`) diz se o destinatário está
  online. A mensagem vai para todas as sessões do destinatário e volta (eco) para as de quem enviou.
- **Checagens:**
  - **no envio:** silenciamento (mesma regra do chat), amizade e bloqueio no ticket de quem envia,
    limite de 5 mensagens a cada 10 s, destinatário online;
  - **na entrega:** bloqueio no ticket do destinatário (renovado na hora em que ele bloqueia). Quem
    acabou de bloquear não recebe, mesmo antes de o ticket de quem envia ser renovado. A amizade
    não é conferida na entrega: logo depois de aceitar, o ticket de um dos lados ainda não a tem
    e a mensagem sumiria sem aviso. Desfazer a amizade vale em até 20 s (renovação do ticket).
- **Propagação:** o site recarrega a lista de amigos a cada 20 s e pede ticket novo quando a lista
  de amigos muda, para quem pediu saber do aceite sem recarregar a página.
- **Conteúdo não é guardado**, como no chat público: nem no servidor nem entre recargas da página
  (as conversas ficam só na aba). Consequência: a moderação não vê o conteúdo de mensagens
  privadas. A proteção é o consentimento (só amigos), bloquear e denunciar a pessoa.
- **Site:** painel **Mensagens** acima do chat (escolha do amigo, contagem de não lidas, motivo
  quando a mensagem não foi enviada) e botão **Mensagem** no diálogo Amigos.
- Sem mudança de protocolo nem de banco.

## Limites conhecidos

- A presença em memória vale para um processo de realtime. Várias instâncias exigem presença
  compartilhada (ex.: Redis) — já era a condição para escalar o realtime (runbook).
- Mensagem para amigo offline é recusada, não fica guardada para depois.
