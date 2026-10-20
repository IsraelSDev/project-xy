# ADR 0016: modelo único 3DX

- **Status:** aceita (substitui a decisão anterior de família paralela)
- **Data:** 2026-10-18
- **Atualização:** 2026-10-20 — modelo anterior removido

## Contexto

O avatar já tinha um conceito de "modelo base" (`AvatarConfig.model`, ADR 0006) com rig, peças e
catálogo próprios. O modelo anterior foi usado como fase de teste do pipeline de avatar, mas o 3DX nativo já
cobre corpo, roupas, cabelo, acessórios, animações, decalques e altura com assets extraídos do
projeto Unity exportado (`C:\dev\exported\ExportedProject`).

Manter as duas famílias exigia gate `isGoeModel`, catálogos paralelos, bibliotecas de clipes/poses
e caminhos de render exclusivos. O modelo anterior não é mais necessário.

## Decisão

- **Só existem dois modelos:** `3dx-male` e `3dx-female` em `AVATAR_MODELS`. O modelo anterior e todos os seus
  assets, ferramentas e módulos foram removidos.
- **Avatar padrão 3DX.** `DEFAULT_AVATAR` nasce `3dx-male`, com camisa, calça, cueca e cabelo 3DX.
  `defaultAvatarFor` escolhe as peças grátis compatíveis com o modelo.
- **Rig por gênero, juntas por índice.** `avatar-model.ts` usa `JOINTS_3DX_MALE`/`FEMALE`; o
  `export_glb.py` nomeia cada osso pelo índice na lista `bones` do JSON (`b0..bN`).
- **Idle, walk e poses nativos.** Os corpos levam `idle`, `walk`, `pose01` e `pair01`..`pair03`
  embutidos. `motionClip` escolhe o clipe da ação replicada; sem clipe, toca o `idle`.
- **Peças compartilham o esqueleto do corpo** quando a ordem dos ossos coincide (`sameBoneLayout`),
  então roupas, cabelo e acessórios acompanham as animações sem retarget adicional.
- **Decalques 3DX.** As tatuagens autorais são projetadas sobre a malha do corpo em `decals-3dx.ts`;
  as âncoras vivem em `DECAL_ANCHORS_3DX_MALE`/`FEMALE`.
- **Altura** é um multiplicador genérico da base de 1,7 m, aplicado à raiz inteira do modelo.

## Consequências

- Um único caminho de carregamento, pose e aparência; sem branches por família.
- Avatares salvos com modelo/campos modelo anterior caem no avatar padrão 3DX ao serem lidos
  (`AVATAR_FORMAT_VERSION` 6).
- O catálogo 3DX é a única fonte de peças; qualquer item novo entra em `PART_CATALOG`.
- O pipeline de geração continua em `tools/3dx/` e `docs/guides/3dx-nativo.md`.
