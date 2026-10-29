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
  "contém"), sobre `User.searchKey` — nome sem acento, minúsculo e com espaços colapsados
  (`nameSearchKey`, o mesmo normalizador no cadastro, na troca de nome e na consulta), então "ana"
  acha "Ána". A mesma regra de visibilidade vale: bloqueio nos dois sentidos e conta excluída ficam
  fora; o próprio usuário também não aparece. No site, a busca fica no topo do diálogo **Amigos**,
  com atalho para o perfil e para pedir/aceitar amizade.
- **Atividade do perfil:** `ProfileEvent (kind, createdAt)` com `JOINED` (criado no cadastro, com
  backfill para contas antigas), `BIO`, `PHOTO` e `NAME` — só o **fato**, nunca o valor antigo.
  `GET /profiles/:id/activity` devolve os 20 mais recentes (mesma visibilidade/bloqueio do perfil) e
  o diálogo mostra a lista com a data. A bio só gera evento quando o texto muda; reenviar a mesma
  bio/nome não polui o feed.

## Por que não bucket no começo

Guardar no Postgres não exigia serviço novo, funcionava em dev e na Vercel e mantinha o contrato
estável. O custo é o banco crescer ~100 KB por pessoa com foto.

## Bucket (Supabase Storage) — opcional

Com `SUPABASE_URL` **e** `SUPABASE_SERVICE_ROLE_KEY` definidas, o `ProfilesModule` injeta o
`SupabasePhotoStorage`: os **bytes** vão para o bucket (`profiles/<userId>`, upload com `x-upsert`),
e a linha `ProfilePhoto` guarda só `mime`/`updatedAt` (`data` fica `NULL`). Sem as duas variáveis, o
`DatabasePhotoStorage` continua sendo o padrão — dev, CI e produção sem bucket não mudam nada.

- O bucket é **privado**: `GET /profiles/:id/photo` continua saindo da API (que aplica a regra de
  bloqueio) e lê o objeto com a service key; nenhuma URL pública é exposta.
- Configuração em `.env.example` (`SUPABASE_BUCKET` padrão `profile-photos`).
- Trocar de volta é só remover as variáveis (as fotos antigas do banco continuam lá; as do bucket
  passam a responder 404 até serem reenviadas).

## Próximo passo

Quando o volume justificar: criar o bucket privado no Supabase, definir `SUPABASE_URL` e
`SUPABASE_SERVICE_ROLE_KEY` na API e reenviar as fotos existentes (ou aceitar o 404 até o próximo
upload). Nada mais muda: contrato, rotas e UI são os mesmos.
