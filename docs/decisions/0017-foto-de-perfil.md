# ADR 0017: Perfil do usuário e foto

- **Status:** aceita
- **Data:** 2026-10-29

## Contexto

O perfil público existia só com `id`, `displayName` e `createdAt`. A Fase 12 pede perfil social mais
rico (bio, foto). A API roda como Function na Vercel, com **filesystem efêmero** — upload em disco
não sobrevive a um deploy, e um bucket (Supabase/S3) exigiria credenciais e uma integração antes de
qualquer validação de produto.

## Decisões

- **Bio:** `User.bio VARCHAR(300)`, texto puro (sem HTML), editável só pelo dono
  (`PATCH /profiles/me`, 30/min). String vazia vira `null`; a exclusão de conta zera a bio.
- **Foto no Postgres:** `ProfilePhoto { userId, mime, data BYTEA, updatedAt }`, 1:1 com `User`
  (cascade). O cliente redimensiona para 512 px e manda **JPEG em base64 dentro do JSON**
  (`POST /profiles/me/photo`), que é o único formato de corpo que a API aceita (proteção CSRF).
  Limite de 256 KB decodificados, `mime` conferido contra a assinatura do arquivo (JPEG/PNG/WebP).
  O corpo do JSON sobe para 1 MB em `main.ts` (o padrão do Express é 100 KB).
- **Leitura:** `GET /profiles/:id/photo` devolve a imagem com `Cache-Control: private, max-age=300`;
  o cliente usa `?v=<photoUpdatedAt>` para invalidar. `PublicProfile.photoUpdatedAt` é o único sinal
  de "tem foto" (nenhuma URL é exposta).
- **Visibilidade:** só usuários logados; bloqueio nos dois sentidos e conta excluída respondem 404
  (mesma regra do perfil e do chat).
- **Site:** botão **Perfil** no topo (edita bio/foto) e **Ver perfil** no menu de cada jogador.
- **Nome de exibição:** trocável no próprio perfil (`displayName` em `PATCH /profiles/me`), com as
  mesmas regras do cadastro (3–24, letras/números/espaço/`_.-`, nome reservado barrado). Unicidade
  é caixa-insensível (`displayNameKey`, 409 se em uso) e há **intervalo mínimo de 24 h** por conta
  (`displayNameChangedAt`, 429 com o tempo restante) contra assédio por renomeação. Enviar o mesmo
  nome não gasta o intervalo. A sessão (`/auth/me`) e o nome na sala acompanham: o realtime atualiza
  `player.name` no refresh periódico do ticket.
- **Busca de membros:** `GET /profiles/search?q=` (mín. 2 letras, até 20 resultados, prefixo antes de
  "contém"). A mesma regra de visibilidade vale: bloqueio nos dois sentidos e conta excluída ficam
  fora; o próprio usuário também não aparece. No site, a busca fica no topo do diálogo **Amigos**,
  com atalho para o perfil e para pedir/aceitar amizade.

## Por que não bucket agora

Guardar no Postgres não exige serviço novo, funciona em dev e na Vercel e mantém o contrato estável.
O custo é o banco crescer ~100 KB por pessoa com foto. **Migrar para Supabase Storage/S3 é trocar só
o `ProfilePhotosService`** (salvar/ler/apagar); contrato, rotas e UI não mudam.

## Próximo passo

Quando o volume justificar: bucket S3-compatível (Supabase), com a URL assinada ou pública na
`ProfilePhoto` e o mesmo limite de tamanho no upload.
