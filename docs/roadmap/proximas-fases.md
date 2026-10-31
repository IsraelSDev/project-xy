# 3DXChat Web — Próximas fases (pós-Fase 6)

Status: Fase 7 concluída (provedor de verificação de idade contratado). A Fase 6 (preparação para produção) e os ADRs 0009–0014 (sanções, amigos, mensagens privadas) estão concluídos.

## Ordem sugerida

1. Fase 7 — Verificação de idade e compliance (pré-lançamento adulto) — **concluída**
2. Fase 8 — Economia virtual, moeda e loja
3. Fase 9 — Múltiplos cenários e salas temáticas — **concluída**
4. Fase 10 — Interações sociais avançadas (adulto, consentidas)
5. Fase 11 — Voz por proximidade (WebRTC) — **concluída**
6. Fase 12 — Perfis sociais e feed
7. Fase 13 — PWA e mobile — **concluída**
8. Fase 14 — Moderação avançada e admin

A Fase 7 foi a primeira por ser requisito legal do público adulto; o contrato com o provedor está fechado.

---

## Fase 7 — Verificação de idade e compliance (pré-lançamento adulto) — concluída

**Status:** fechada em 2026-10-29. O acordo com o provedor de verificação (**verify-id**) está
contratado; as credenciais de integração serão entregues pelo fornecedor. O que já existe no
repositório:

- Cadastro exige data de nascimento e recusa menores de 18 e idades acima de 120; a conta guarda
  `ageAssurance` (`SELF_DECLARED` → `VERIFIED`).
- `apps/api/src/age-verification` expõe `GET /age-verification/me`, `POST /age-verification/request`
  (referência de uso único, TTL de 15 min, método declarado) e `POST /age-verification/complete`
  (promove a `VERIFIED` e apaga a referência), com trilha de auditoria em `ModerationAction`
  (`age.verification.requested` / `age.verified`).
- E2E do módulo cobrindo o fluxo (conta nova `SELF_DECLARED`, verificação e auditoria).

**Objetivo:** garantir que apenas maiores de 18 acessem áreas adultas, substituindo a declaração simples de idade (ADR 0005).

### Escopo

- Integração com provedor de verificação de identidade/idade — **decidida**: verify-id.
- Bloqueio de menores (<18): não permitem acesso a salas adultas nem funcionalidades sensíveis.
- Política de privacidade, termos de uso, banner de cookies, LGPD/GDPR.
- Retenção mínima de dados pessoais; exclusão/anonimização conforme ADR 0010.
- Auditoria de ações de verificação de idade.

### Critérios de aceite

- Ações de verificação ficam registradas na trilha de auditoria. ✅
- Política de privacidade e termos acessíveis antes do cadastro. ⏳ os links já estão na tela de
  entrada, mas as páginas `/termos-de-uso` e `/politica-de-privacidade` ainda não existem.
- Usuário não verificado não acessa salas adultas. ⏳ o bloqueio entra junto com as salas adultas
  (Fase 10); hoje não existe sala adulta para bloquear. A conta já carrega `ageAssurance` no ticket
  do realtime e no perfil (`verifiedAdult`), então o gate é só uma checagem no servidor de sala.

### Pendências registradas (não bloqueiam o roadmap)

- Integração técnica do verify-id (credenciais, callback e retenção) — troca local ao
  `AgeVerificationService`.
- Páginas de termos de uso e política de privacidade (os links do cadastro apontam para elas).
- Banner de cookies (LGPD/GDPR) antes da abertura ao público.

---

## Fase 8 — Economia virtual, moeda e loja

**Objetivo:** permitir compra de itens de avatar com moeda virtual.

### Escopo

- Moeda virtual (créditos), carteira por usuário e histórico de compras.
- Loja de itens de avatar (roupas, acessórios, cabelos premium) com preço em créditos.
- Gateway de pagamento (ex: Stripe/Pix) via webhook seguro.
- Reembolso e cancelamento de pagamento falhado.
- Itens comprados persistem na configuração de avatar e na conta.

### Critérios de aceite

- Compra bem-sucedida libera o item no avatar da conta.
- Pagamento falhado não libera item nem débita créditos indevidamente.
- Histórico de compras visível ao usuário.

---

## Fase 9 — Múltiplos cenários e salas temáticas

**Objetivo:** ampliar além do lounge com ambientes variados.

**Status (2026-10-30):** concluída nos critérios da fase. Já com asset nativo: `club`
(`club.unity`), `home` (`char_editor_decor.unity`) e `beach` (`beach.unity`, recorte da área
jogável + areia/mar procedurais). A balada e a praia têm cartão público no diálogo de salas
("Balada" e "Praia"), que entram na sala existente ou criam uma. `studio` é procedural. `lounge`
segue provisório por decisão do plano (é o cenário de fallback), e o `private-room` continua sem
fonte: `house.unity` é o editor de casa e a geometria está num prefab, não na cena. Desempenho
medido com 1 e 10 avatares por cenário em
[desempenho-cenarios.md](../operations/desempenho-cenarios.md), com o **limite de jogadores por
cenário** derivado do custo de cena e o quarto reexportado com `--decimate 0.5` (342 → 171 mil
triângulos).

### Escopo

- Novos cenários: boate, praia, quarto privado, etc.
- Carregamento assíncrono de cenário por sala e descarte de assets quando não mais necessários.
- Limite de jogadores por cenário baseado em medição de desempenho.
- Troca de sala sem recarregar a página.

### Critérios de aceite

- ≥3 cenários jogáveis além do lounge. ✅ (balada, closet e praia com GLB nativo, mais o estúdio)
- Troca de cena sem recarregar a página. ✅ (`world.setScene` reusa a cena e descarta a sala anterior)
- Desempenho medido com múltiplos avatares em cada cenário. ✅ (2026-10-30, 1 e 10 avatares por
  cenário; ver [desempenho-cenarios.md](../operations/desempenho-cenarios.md) — o quarto é o cenário
  mais pesado, 355 mil triângulos de cenário, e cada avatar custa ~52 mil triângulos e ~323 ossos)

---

## Fase 10 — Interações sociais avançadas (adulto, consentidas)

**Objetivo:** interações a dois com sistema de consentimento.

### Escopo

- Poses a dois: sentar junto, abraçar, dança a dois, poses íntimas.
- Sistema de consentimento: aceitar/recusar, possibilidade de interromper a qualquer momento.
- Histórico de interações consentidas.
- Bloqueio impede interações com usuários bloqueados.

### Critérios de aceite

- Interação só inicia com consentimento mútuo.
- Qualquer participante pode interromper a qualquer momento.
- Bloqueados não conseguem iniciar interações.

---

## Fase 11 - Voz por proximidade (WebRTC)

**Objetivo:** chat de voz posicional entre usuários na mesma sala.

**Status (2026-10-31):** concluída. Voz por proximidade com canais 1:1 (mesh) sinalizados pelo
WebSocket da sala: o áudio é P2P, o servidor só repassa oferta/resposta/candidatos ICE e não vê o
áudio. Entrar na voz = ligar o microfone (sem convite por par). Volume cai com a distância (cheio
até 3 m, zero em 15 m), aplicado no próprio elemento de áudio (caminho nativo do navegador — passar
o stream remoto pelo WebAudio no Chrome fazia a voz chegar em rajadas). Ponto verde em quem fala
(nível de áudio do RTP), mudo próprio, volume geral e **Silenciar** por pessoa. Bloqueio impede o
relay (o canal nem abre). Trocar de sala mantém o microfone e entra na voz da nova. Verificação: 14
testes de unidade do cliente (proximidade + WebRTC/elemento falsos), teste do realtime com **4
jogadores na voz** (cada um vê os outros três e as ofertas/respostas chegam ao destinatário certo) e
`apps/web/scripts/voice-check.mjs` (áudio P2P e indicador de fala conferidos com 2 navegadores e
microfone sintético — o script aceita N usuários).

### Escopo

- Voz por proximidade: ouve mais alto quem está perto. ✅
- Mudo individual, controle de volume, indicador de quem está falando. ✅
- Teste com 4+ usuários na mesma sala. ✅ (4 clientes reais no teste do realtime; áudio P2P no
  navegador conferido com 2, já que cada browser headless pesa muito para rodar quatro de uma vez)

### Critérios de aceite

- Voz funciona com latência aceitável em sala com múltiplos usuários. ✅ (mesh local; latência real
  depende da rede/TURN)
- Controles de mudo e volume funcionam. ✅

### Pendências para produção

- **TURN** (coturn) com credenciais efêmeras em `VITE_ICE_SERVERS`: sem ele, redes atrás de NAT
  simétrico não conectam.
- Limite de participantes com voz (o mesh cresce O(n) em upload por pessoa) e corte automático de
  faixa quando a sala enche.
- Indicador de "entrou na voz" na lista da sala e supressão de ruído própria (hoje usa a nativa do
  navegador).

---

## Fase 12 — Perfis sociais e feed

**Objetivo:** perfis públicos mais ricos e descoberta de usuários.

**Status (2026-10-31):** concluída. Perfil público (`GET /profiles/:id`) com foto (bucket ou
Postgres), nome, selo de staff, `18+ verificado`, bio, **localização**, **status curto**,
**aniversário (dia/mês, sem ano) quando a pessoa escolhe mostrar**, **interesses** (até 6),
**idiomas** (até 3), **o que procura** e **pronomes** — todas as opções são opcionais e o próprio
sempre vê o aniversário para editar. A edição (`PATCH /profiles/me`) valida bio/localização/status
com a mesma política (sem links/contato) e a troca de nome mantém o intervalo de 24 h e o histórico
para moderação. A **seção de atividade saiu da interface** (a pedido); os eventos continuam no banco
para moderação/futuro. Busca por nome com chave sem acento, prefixo antes de "contém", respeitando
bloqueios nos dois sentidos, e sugestões de amizade (`/friends/suggestions`). Localização, status,
interesses, idiomas, procurando e pronomes entram na **exportação da conta** e são apagados na
exclusão. Verificação: `apps/web/scripts/profile-check.mjs` (opções pela interface + API, e a
atividade ausente) e testes e2e do perfil, do avatar, do ticket e da conta.

### Escopo

- Foto de perfil, bio, aniversário, localização (opcionais). ✅
- Status, interesses, idiomas, procurando e pronomes (opcionais). ✅
- Busca de usuários e sugestão de amizade. ✅

### Critérios de aceite

- Perfil público visível a outros usuários. ✅
- Busca retorna resultados filtrados e respeita bloqueios. ✅

---

## Fase 13 — PWA e mobile

**Objetivo:** tornar a web instalável e jogável em navegadores mobile.

**Status (2026-10-30):** concluída. Manifest (`display: standalone`, ícones 192/512 + maskable),
service worker com app shell offline e cache versionado dos assets (nunca `/api`/`/realtime`),
registro só em produção. Controles de toque: joystick virtual + botões (Sentar/Levantar, Dançar,
Dançar 2), com o mundo já respondendo a toque (piso, móvel, avatar). Verificação: `scripts/pwa-check.mjs`
(manifest, ícones, SW ativo, reload offline) e `scripts/touch-check.mjs` (emulação de celular).

### Escopo

- PWA: manifest, service worker, instalação na tela inicial.
- Controles touch: joystick virtual, botões de interação.

### Critérios de aceite

- Instala como app em navegadores mobile suportados. ✅
- Controles touch permitem andar e interagir. ✅

### Pendências de polimento (não bloqueiam)

- Aviso de “nova versão disponível” ao atualizar o service worker.
- Layout dos painéis do HUD em telas estreitas (hoje eles sobem quando os controles aparecem).

---

## Fase 14 — Moderação avançada e admin

**Objetivo:** ferramentas de administração e moderação em escala.

### Escopo

- Banimento de IP/dispositivo, shadowban.
- Revisão de denúncias em massa.
- Dashboard admin com métricas de moderação e exportação de relatórios.

### Critérios de aceite

- Moderador gerencia fila de denúncias com eficiência.
- Relatórios de moderação exportáveis.

---

## Fora de escopo (mantido do plano original)

- Mundo aberto contínuo.
- Editor completo de corpo e rosto.
- Economia virtual complexa além da loja simples.
- Criação de conteúdo por usuários.
- Arquitetura distribuída prematura.
