# ADR 0007: Salas e interações (Fase 5)

- **Status:** aceita
- **Data:** 2026-10-14

## Contexto

A Fase 5 pede seleção de salas, ambientes públicos e privados, convites e permissões de entrada,
interações contextuais (sentar, gestos) e preparo para carregar e descartar cenários. Novos cenários
só devem entrar depois de validar desempenho e o fluxo de produção de assets.

## Decisões

### Salas

- **Um tipo de sala (`lounge`), com várias instâncias.** O cenário é o mesmo lounge; o que muda é
  título, privacidade e quem está dentro. `PROTOCOL_VERSION = 4`.
- **Sala pública:** aparece em `GET /rooms` no realtime (título e lotação) e no `joinOrCreate`.
  Qualquer pessoa autenticada pode criar uma, com título validado: 3 a 40 caracteres, sem
  caracteres de controle.
- **Sala privada** (`setPrivate`): fica fora da listagem e do `joinOrCreate`, e só entra quem tem o
  id da sala e o convite.
  - **Dono:** quem a criou. Ele é o primeiro a entrar, porque só ele conhece o id nesse momento.
    O `ownerId` é público, mas o convite não.
  - **Convite:** código aleatório de 18 bytes (base64url), comparado em tempo constante. Vai só para
    as sessões do dono por mensagem privada (`invite`), nunca para o estado da sala.
  - **Troca de convite:** o dono troca o convite com `rotate-invite` e os links antigos deixam de
    funcionar. Pedido de troca de quem não é dono é ignorado.
  - **Bloqueio:** bloqueio entre dono e visitante, em qualquer sentido, impede a entrada, mesmo com
    convite.
  - **Duração:** a sala é **efêmera**: vive enquanto tiver gente (e o prazo de reconexão). Não há
    sala persistente no banco nesta fase.
- **Cliente:**
  - Diálogo "Salas" com a lista pública, entrada e criação.
  - Link de convite `/?sala=<id>&convite=<código>`, lido ao abrir a página e apagado da URL logo em
    seguida.
  - Se a sala pedida recusar (não existe mais, convite inválido), o cliente volta para uma sala
    pública e explica o motivo.
  - Se copiar para a área de transferência falhar, o link aparece num campo para copiar à mão.
  - Trocar de sala descarta os avatares, o chat e os avisos da sala anterior.

### Interações

- `PlayerState.action` replica o estado de animação, como a ADR 0004 previa para ações que não se
  deduzem do movimento: `''`, `sit`, `wave` ou `dance`.
- **Sentar:** a regra fica no `game-core`.
  - **Assentos:** `SEATS` são 6 assentos (3 por sofá), derivados do próprio layout, virados para
    longe do encosto.
  - **Regra no servidor:** o servidor escolhe o assento livre mais próximo ao alcance (1,3 m), coloca
    o avatar nele e ignora a colisão do sofá enquanto a pessoa está sentada. Andar ou pedir `stand`
    levanta para a frente do assento.
  - **Pré-checagem no cliente:** o cliente faz a mesma conta antes de pedir, só para explicar
    quando não há assento.
- **Gestos:** o aceno dura 2,5 s e acaba sozinho. A dança dura até a pessoa andar ou tocar Dançar
  de novo. Gestos sentado são ignorados, porque a pose de sentar prevalece.
- **Atalhos:** E (sentar/levantar), 1 (acenar), 2 (dançar). Ficam inativos com o foco no chat.
- **Poses procedurais** sobre as articulações da convenção (ADR 0006). O cotovelo passou a ser um
  por braço, para permitir o aceno com uma mão.

### Cenários e assets

- **Não foram adicionados cenários**, como a especificação pede até validar desempenho (o FPS de
  GPU ainda não foi medido em navegador visível; ver ADR 0006).
- O ciclo de vida já está pronto para troca de sala sem vazamento: avatares liberados ao sair,
  materiais compartilhados na cena e jogo inteiro descartado ao desmontar. O carregamento
  assíncrono de cenários (GLB sob demanda, com descarte) entra junto com o primeiro asset
  licenciado: hoje o único cenário é gerado por código.

## Pendências

- Salas privadas persistentes (dono, título e lista de convidados no banco), se o produto quiser.
- Expulsar alguém da sala e moderação dentro da sala.
- Mais pontos de interação (bar, pista de dança) e animações de esqueleto, junto com o modelo
  licenciado.
- Carregamento assíncrono e descarte de cenários GLB, quando houver o segundo cenário.
