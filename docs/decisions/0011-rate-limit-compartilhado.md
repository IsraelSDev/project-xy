# ADR 0011: Rate limit compartilhado e por usuário

- **Status:** aceita
- **Data:** 2026-10-15

## Contexto

Dois problemas do rate limit da API ficaram reais com o site publicado:

1. **Contagem por IP.** Cada pessoa conectada renova o ticket do realtime 3 vezes por minuto (ADR
   0009), e o limite da rota é 30 por minuto. Atrás do mesmo IP (casa, empresa, operadora móvel com
   CGNAT) cabiam cerca de 10 pessoas.
2. **Contagem em memória.** Na Vercel a API roda em várias instâncias, cada uma com a própria
   memória. Um ataque de força bruta no login distribuído entre instâncias tinha o limite
   multiplicado.

## Decisões

- **Contadores no Postgres** (tabela `RateLimitBucket`, chave = rota + quem), janela fixa, com um
  upsert atômico por requisição: `INSERT … ON CONFLICT DO UPDATE` reinicia a janela vencida ou
  soma 1, e a trava da linha garante a contagem exata entre instâncias. Sem infraestrutura nova.
- **Quem é contado:**
  - rota autenticada: a **conta** (id do usuário). Pessoas atrás do mesmo IP não dividem o limite;
  - sem sessão: o IP;
  - login e cadastro (`by: 'ip'`): sempre o IP. Trocar ou inventar cookie não zera o limite.
- A sessão é resolvida **uma vez por requisição** (`SessionService.forRequest`), usada pelo rate
  limit (que roda antes, como guard global) e pelo `SessionGuard`.
- **Limpeza:** cada instância apaga os contadores vencidos no máximo uma vez por minuto, sem segurar
  a resposta. O IP fica guardado só durante a janela (no máximo 1 h, a da denúncia).
- **Limites** iguais aos de antes: 120 por minuto no geral, 5 cadastros e 10 logins por minuto,
  30 tickets e 30 avatares por minuto, 10 denúncias por hora.
- **Testes:** cada app de teste tem um prefixo próprio de chaves (`RATE_LIMIT_SCOPE`), porque os
  arquivos rodam em paralelo no mesmo banco. Um teste usa dois apps com o mesmo prefixo para provar
  que instâncias diferentes somam o mesmo contador.

## Consequências

- Uma consulta a mais por requisição. Na escala atual é irrelevante. Se o banco virar gargalo, o
  caminho é um Redis (ex.: Upstash) com o mesmo esquema de chave.
- O limite por IP do login continua dependendo do `X-Forwarded-For` da Vercel (`trust proxy`).

## Alternativas descartadas

- **Redis gerenciado:** mais rápido, mas é conta, segredo e fornecedor novos para um volume que o
  Postgres atende.
- **Limite por usuário só nas rotas sensíveis, contando em memória:** não resolve o problema das
  várias instâncias.
