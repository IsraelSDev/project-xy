# 3DXChat Web — Próximas fases (pós-Fase 6)

Status: planejamento inicial, ainda não implementado. A Fase 6 (preparação para produção) e os ADRs 0009–0014 (sanções, amigos, mensagens privadas) estão concluídos. Não há roadmap definido além disso no repositório.

## Ordem sugerida

1. Fase 7 — Verificação de idade e compliance (pré-lançamento adulto)
2. Fase 8 — Economia virtual, moeda e loja
3. Fase 9 — Múltiplos cenários e salas temáticas
4. Fase 10 — Interações sociais avançadas (adulto, consentidas)
5. Fase 11 — Voz por proximidade (WebRTC)
6. Fase 12 — Perfis sociais e feed
7. Fase 13 — PWA e mobile
8. Fase 14 — Moderação avançada e admin

A Fase 7 deve vir primeiro por ser requisito legal do público adulto.

---

## Fase 7 — Verificação de idade e compliance (pré-lançamento adulto)

**Objetivo:** garantir que apenas maiores de 18 acessem áreas adultas, substituindo a declaração simples de idade (ADR 0005 pendente).

### Escopo

- Integração com provedor de verificação de identidade/idade (ex: documento, selfie, terço de idade) ou declaração + termos rígidos, conforme estratégia aprovada.
- Bloqueio de menores (<18): não permitem acesso a salas adultas nem funcionalidades sensíveis.
- Política de privacidade, termos de uso, banner de cookies, LGPD/GDPR.
- Retenção mínima de dados pessoais; exclusão/anonimização conforme ADR 0010.
- Auditoria de ações de verificação de idade.

### Critérios de aceite

- Usuário não verificado não acessa salas adultas.
- Ações de verificação ficam registradas na trilha de auditoria.
- Política de privacidade e termos acessíveis antes do cadastro.

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

### Escopo

- Novos cenários: boate, praia, quarto privado, etc.
- Carregamento assíncrono de cenário por sala e descarte de assets quando não mais necessários.
- Limite de jogadores por cenário baseado em medição de desempenho.
- Troca de sala sem recarregar a página.

### Critérios de aceite

- ≥3 cenários jogáveis além do lounge.
- Troca de cena sem recarregar a página.
- Desempenho medido com múltiplos avatares em cada cenário.

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

## Fase 11 — Voz por proximidade (WebRTC)

**Objetivo:** chat de voz posicional entre usuários na mesma sala.

### Escopo

- Voz por proximidade: ouve mais alto quem está perto.
- Mudo individual, controle de volume, indicador de quem está falando.
- Teste com 4+ usuários na mesma sala.

### Critérios de aceite

- Voz funciona com latência aceitável em sala com múltiplos usuários.
- Controles de mudo e volume funcionam.

---

## Fase 12 — Perfis sociais e feed

**Objetivo:** perfis públicos mais ricos e descoberta de usuários.

### Escopo

- Foto de perfil, bio, aniversário, localização (opcionais).
- Feed de atividades (mudou avatar, entrou em sala, amizade nova).
- Busca de usuários e sugestão de amizade.

### Critérios de aceite

- Perfil público visível a outros usuários.
- Busca retorna resultados filtrados e respeita bloqueios.

---

## Fase 13 — PWA e mobile

**Objetivo:** tornar a web instalável e jogável em navegadores mobile.

### Escopo

- PWA: manifest, service worker, instalação na tela inicial.
- Controles touch: joystick virtual, botões de interação.

### Critérios de aceite

- Instala como app em navegadores mobile suportados.
- Controles touch permitem andar e interagir.

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
