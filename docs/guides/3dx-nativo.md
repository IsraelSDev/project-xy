# Guia: pipeline nativo do 3DXChat (Fases B, C e E — idle, walk e pose)

Como os personagens e as primeiras roupas do cliente 3DXChat viram GLB para o jogo. Este é o passo a
passo das Fases B e C do `docs/roadmap/migracao-3dxchat.md`; os scripts ficam em
`tools/3dx/` (ver `tools/3dx/README.md`). Leia antes as regras de assets do repo
em `docs/guides/assets-3d.md`.

Regra de ouro: **não otimizar os GLB** (sem `weld`/`prune`/`simplify`/`quantize`/
`meshopt`) e **não redescobrir a matemática** — ela está congelada em
`tools/3dx/lib3dx.py` e na seção 2 do plano.

---

> **Fonte única.** A única fonte permitida é o projeto exportado em
> `E:\dev\exported\ExportedProject`, descrito em `docs/guides/3dx-projeto-exportado.md`. Os comandos
> abaixo que apontam para outras pastas são históricos e não devem ser executados; use o leitor do
> projeto (`tools/3dx/import_anim_project.py` e `tools/3dx/project_env.py`).

## O que é fonte (e o que não é)

| O que                   | Caminho                                                  | Observação                                                               |
| ----------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Personagem base**     | `E:\dev\exported\ExportedProject` (prefab `man`/`woman`) | malhas do corpo/rosto com rig completo (ver `3dx-projeto-exportado.md`). |
| Esqueleto de referência | prefab `Resources/{man,woman}`                           | o rig (322 ossos M / 464 F).                                             |
| Idle nativo             | `Assets/AnimationClip/stay_pose_1.anim`                  | É o idle publicado.                                                      |
| Walk nativo             | `Assets/AnimationClip/walk.anim`                         | Toca quando o avatar se desloca.                                         |
| Pose nativa (piloto)    | `Assets/AnimationClip/stay_pose_2.anim`                  | Vira a action `pose01`.                                                  |
| Roupas / cabelo         | `Assets/Resources` (prefabs de peça)                     | Fase C (primeiro conjunto) / Fase D.                                     |

O nome `man_body` reaparece nos itens de roupa — ali é a malha da **peça**, não
o corpo nu. O corpo nu (com mãos e pés) é o do `character`.

## A descoberta que destrava a Fase B

O `character` não tem `SkinnedMeshRenderer` nem hierarquia; o esqueleto vem de um
bundle de `wear`. Cada malha do `character` carrega os próprios `m_BindPose`,
`BoneIndices` e `BoneWeights`, com índices **locais** à malha (60 no corpo M, 26
na cabeça). Para casar com o rig:

```
P⁻¹ · inverse(bindpose)  ==  rest_world do osso     (bate exato)
```

Ou seja, invertendo o bindpose e tirando o swap de eixo (`P⁻¹`) o osso cai no
mesmo lugar do `rest_world` do bundle de `wear`. O `extract_character.py` faz
esse casamento por translação (e usa a rotação para desempatar) — ver
`lib3dx.remap_bindposes`.

Eixos: a **malha** é Z-up; o **rig** é Y-up; a ponte é `P` (regra 1 da seção 2).
No Blender, montar osso → pai → `length` → `matrix` por último (regra 5).

## Passo a passo (Fase B)

Pré-requisito: Python 3.11 com `UnityPy==1.25.4` e Blender 5.2.

```powershell
# 1) extrair corpo + cabeça + cílios + anatomia (JSON)
py -3.11 tools/3dx/extract_character.py `
  --source "E:\dev\exported\ExportedProject\Assets\Resources\man\man.prefab" `
  --skeleton "E:\dev\exported\ExportedProject\Assets\Resources\man\man.prefab" `
  --mesh man_body man_head man_eyelashes man_penis --gender male `
  --anim "E:\dev\exported\ExportedProject\Assets\AnimationClip" `
  --anim-root man --anim-clip stay_pose_1 `
  --out tools/3dx/build/character_male_idle.json

# 2) extrair o walk (mesmo corpo/esqueleto; só o world interessa no export)
py -3.11 tools/3dx/extract_character.py `
  --source "E:\dev\exported\ExportedProject\Assets\Resources\man\man.prefab" `
  --skeleton "E:\dev\exported\ExportedProject\Assets\Resources\man\man.prefab" `
  --mesh man_body man_head man_eyelashes man_penis --gender male `
  --anim "E:\dev\exported\ExportedProject\Assets\AnimationClip" `
  --anim-root man --anim-clip walk `
  --out tools/3dx/build/character_male_walk.json

# 3) exportar GLB com idle + walk (duas actions no mesmo arquivo)
python tools/3dx/run_blender.py export_glb.py -- `
  --json tools/3dx/build/character_male_idle.json `
  --out apps/web/public/assets/3dx/character_male.glb --anim --anim-name idle `
  --extra-anim tools/3dx/build/character_male_walk.json walk

# 4) validar (em repouso: maxdisp ≈ 0; animado: bate com skin_export.py)
py -3.11 tools/3dx/verify_glb.py --glb apps/web/public/assets/3dx/character_male.glb --frame 80
py -3.11 tools/3dx/verify_glb.py --glb apps/web/public/assets/3dx/character_male.glb --anim walk --frame 15
py -3.11 tools/3dx/skin_export.py --json tools/3dx/build/character_male.json --frames 80 --no-obj

# 4) ver no navegador
#    pnpm --filter @3dx/web dev  →  http://localhost:5173/viewer3dx.html?model=character_male
```

Feminino: `--gender female`, rig `...\wear\female\s_squipanties1cum`, malhas
`woman_body woman_head woman_eyelashes`, `--anim-root woman` e o mesmo
`--anim-clip stay_pose_1` (ou `walk`, para o segundo JSON).

### Idle nativo (Fase E)

O clipe `stay_pose_1` mora em `resources.assets` e **não tem esqueleto próprio**:
o `--anim-root man|woman` seleciona o subtree `*_bone_POSE_PIVOT` do prefab e o
extrator usa esse rest para calcular o delta. Duas regras fazem os membros
ficarem certos:

1. O delta é **world-space**: `q_delta = q_pose * inverse(q_rest)` e
   `q_world = q_delta * q_rest_target`. Aplicar o delta como rotação local mistura
   os eixos de rest da origem e do alvo e torce braços/rosto.
2. Osso do alvo **sem curva** no clipe herda a **rotação local de rest do pai**
   (`q_world = q_world_pai * q_local_rest`), não a rotação global de rest. Sem
   isso o filho translada com o membro mas não gira no cotovelo/joelho/pulso, e a
   pele colapsa (era o "braço/ perna torto").

O casamento de nomes duplicados no prefab usa a posição/rotação de rest mais
próxima do osso alvo, para não pegar props estáticos que reutilizam nomes de
ossos. O `export_glb.py --anim-name idle` nomeia o grupo que o
`applyMotion`/`motionClip` procura.

### Walk nativo (Fase E)

O `walk` sai do mesmo `resources.assets`, com `--anim-root man|woman --anim-clip
walk` (37 quadros @ 30 fps). O clipe é **in-place**: a translação da pelve fica
constante; o deslocamento do avatar continua sendo o do servidor. A extração usa
as mesmas regras de delta world-space e herança local do idle.

O GLB publicado leva **duas actions**: `idle` e `walk`. O `export_glb.py` aceita
`--extra-anim <json> <nome>` (repetível), valida que o esqueleto é idêntico ao do
`--json` e exporta todas as actions com `export_animation_mode=ACTIONS`. No jogo:

- `motionClip(model, '', moving)` devolve `walk` quando `walk.intensity > 0.05`
  (ou seja, quando o avatar está se deslocando) e `idle` quando parado;
- `playClip` reinicia do rest pose ao trocar de clipe, para ossos não
  chaveados não herdarem o último quadro do clipe anterior;
- o `walk` foi autorado para ~1,17 m/s (passada de ~1,4 m em 1,2 s). Como o jogo
  anda a 1,35 m/s, `applyMotion` ajusta `speedRatio = avatar.speed / 1,17`
  (limitado a 0,6–1,8) para o pé não patinar; a 1,35 m/s o walk toca a ~1,16x.
- o walk masculino nativo balançava demais a parte de cima: a cabeça andava
  ~14,6 cm de um lado para o outro (o feminino, ~3,4 cm). O
  `damp_walk_sway.py` reduz só o componente lateral (Y/Z local) de
  `man_Spine1/Spine2/Neck/Head` por 0,25, mantendo o passo e a inclinação para
  frente; a cabeça fica em ~3,3 cm. O corpo masculino é exportado com o
  `character_male_walk_sway.json`:

  ```powershell
  py -3.11 tools/3dx/damp_walk_sway.py `
    --json tools/3dx/build/character_male_walk.json `
    --out tools/3dx/build/character_male_walk_sway.json `
    --bones man_Spine1 man_Spine2 man_Neck man_Head --factor 0.25
  ```

As roupas compartilham o esqueleto do corpo (C8), então acompanham o walk sem
retarget adicional. No `viewer3dx.html`, `?anim=walk` toca só o clipe de
caminhada (`?anim=idle` é o padrão) e `?outfit=all` mostra as peças. Para conferir
no Blender:

```powershell
python tools/3dx/run_blender.py render_check.py -- `
  --glb apps/web/public/assets/3dx/character_male.glb `
  --action walk --frames 0 9 18 27 --azimuth 90 --outdir "$env:TEMP\walk"
```

## Pose nativa (piloto E0c)

A primeira pose é o `stay_pose_2` (41 quadros @ 30 fps = 1,33 s), um stance parado
com respiração leve. Ela entra como terceira action no mesmo GLB (`pose01`) e o
jogo a escolhe quando o servidor replica a ação `pose01`.

```powershell
py -3.11 tools/3dx/extract_character.py `
  --source "E:\dev\exported\ExportedProject\Assets\Resources\man\man.prefab" `
  --skeleton "E:\dev\exported\ExportedProject\Assets\Resources\man\man.prefab" `
  --mesh man_body man_head man_eyelashes man_penis --gender male `
  --anim "E:\dev\exported\ExportedProject\Assets\AnimationClip" `
  --anim-root man --anim-clip stay_pose_2 `
  --out tools/3dx/build/character_male_pose.json

python tools/3dx/run_blender.py export_glb.py -- `
  --json tools/3dx/build/character_male_idle.json `
  --out apps/web/public/assets/3dx/character_male.glb `
  --anim --anim-name idle `
  --extra-anim tools/3dx/build/character_male_walk_sway.json walk `
  --extra-anim tools/3dx/build/character_male_pose.json pose01 `
  --materials tools/3dx/build/body_male_materials.json
```

Feminino: `--gender female`, rig `s_squipanties1cum`, malhas `woman_*`,
`--anim-root woman`, `--out character_female_pose.json` e o GLB feminino.

No cliente, `RIGS['3dx-*'].clips.pose01` aponta para a action `pose01` e
`motionClip` a devolve para a ação `POSE_ACTIONS` `pose01`. Para trazer mais
poses, basta repetir a extração com outro `--anim-clip` e acrescentar
`--extra-anim <json> pose02` (etc.) ao mesmo corpo, mapeando no `RIGS` — o
`export_glb.py` já aceita várias actions.

O `viewer3dx.html`/`viewer-closet.html` também listam `Pose 1` no seletor de
animação para conferir o clipe isolado.

### Par a dois

Os clipes de par nativos entram como `pair01`..`pair04`, `pair06`..`pair09` e os pares de móvel
`pair10`..`pair17` nos dois corpos (`slowdance` e variantes, 111 quadros @ 30 fps; os de móvel
têm 121–241 quadros). `motionClip` mapeia cada action para o clipe de
mesmo nome; o servidor usa `PAIR_POSES` para colocar os dois lados (offset padrão 0,25 m à frente,
giro 180°, com o parceiro de frente para quem iniciou; a dança por trás usa 0,35 m e um
deslocamento lateral de -0,15 m). Interações publicadas: abraço e pose íntima
(`pair01`), dança a dois (`dance`), dança lenta II (`pair04`), dança por trás (`pair06`), beijo
(`pair07`), beijo no pescoço (`pair08`) e dança invertida (`pair09`). O piloto F/F `pair05`
(`tools/3dx/pairs.json`) ficou fora dos corpos publicados; os pares F/F e M/M publicados vêm das
bundles `ff/*` e `mm/*` (ver abaixo).

**Pares do mesmo gênero (F/F e M/M):** as bundles `ff/rel` e `mm/rel` trazem abraço e beijo com as
duas metades autoradas para o mesmo corpo, e as pastas `ff/*`/`mm/*` de móvel também têm sofá, cama,
cadeira e parede — esta primeira leva publica sofá e cama. Cada metade é uma action própria
(`ff_hug_a`/`ff_hug_b`), porque as duas tocam no mesmo corpo. O manifesto é
`tools/3dx/same-gender-pairs.json`; `PAIR_POSES` marca o par com `pairing: 'ff' | 'mm'`, e o servidor
só aceita o convite quando os corpos dos dois jogadores batem com essa composição (M/F é o padrão
dos pares antigos).

| Interação              | Actions                     | Bundles (`ff/*`, `mm/*`)                      | Âncora  |
| ---------------------- | --------------------------- | --------------------------------------------- | ------- |
| `ff-hug`               | `ff_hug_a`/`ff_hug_b`       | `rel/woman@cuddle_woman1/2`                   | —       |
| `ff-kiss`              | `ff_kiss_a`/`ff_kiss_b`     | `rel/woman@slowdance_kiss_woman1/2`           | —       |
| `ff-sofa-1`            | `ff_sofa_1_a/_b`            | `sofa/woman@ai_n_sofa_ff_mutualmast1/2`       | sofá    |
| `ff-bed-1`             | `ff_bed_1_a/_b`             | `bed/woman@midnight_lucky_ff_bed_v_5_1/2`     | cama    |
| `mm-hug`               | `mm_hug_a`/`mm_hug_b`       | `rel/man@cuddle_man1/2`                       | —       |
| `mm-kiss`              | `mm_kiss_a`/`mm_kiss_b`     | `rel/man@slowdance_kiss_man1/2`               | —       |
| `mm-sofa-1`            | `mm_sofa_1_a/_b`            | `sofa/man@ai_sofa_13_man1/2`                  | sofá    |
| `mm-bed-1`             | `mm_bed_1_a/_b`             | `bed/man@ai_bed_mmdoggy1/2`                   | cama    |
| `ff-slow-dance`        | `ff_slow_dance_a/_b`        | `rel/woman@slowdance_woman1/2`                | —       |
| `ff-slow-dance-invert` | `ff_slow_dance_invert_a/_b` | `rel/woman@slowdance_invert_woman1/2`         | —       |
| `ff-chair-1`           | `ff_chair_1_a/_b`           | `chair/woman@ai_chair_ffsitonknees1/2`        | cadeira |
| `mm-slow-dance`        | `mm_slow_dance_a/_b`        | `rel/man@slowdance_man1/2`                    | —       |
| `mm-slow-dance-invert` | `mm_slow_dance_invert_a/_b` | `rel/man@slowdance_invert_man1/2`             | —       |
| `mm-chair-1`           | `mm_chair_1_a/_b`           | `chair/man@ai_chair_3_man1/2`                 | cadeira |
| `mm-wall-1`            | `mm_wall_1_a/_b`            | `wall/man@ai_wall_4_man1/2`                   | parede  |
| `ff-sofa-2`            | `ff_sofa_2_a/_b`            | `sofa/woman@ai_sofakuniw1/2`                  | sofá    |
| `ff-bed-2`             | `ff_bed_2_a/_b`             | `bed/woman@midnight_lucky_ff_bed_o_1_1/2`     | cama    |
| `ff-chair-2`           | `ff_chair_2_a/_b`           | `chair/woman@midnight_lucky_ff_chair_o_1_1/2` | cadeira |
| `ff-wall-1`            | `ff_wall_1_a/_b`            | `wall/woman@wall_5_woman1/2`                  | parede  |
| `mm-sofa-2`            | `mm_sofa_2_a/_b`            | `sofa/man@ai_sofa_14_man1/2`                  | sofá    |
| `mm-bed-2`             | `mm_bed_2_a/_b`             | `bed/man@ai_bed_40_man1/2`                    | cama    |
| `mm-chair-2`           | `mm_chair_2_a/_b`           | `chair/man@ai_chair_4_man1/2`                 | cadeira |

A parede F/F usa `wall_5_woman1/2` (quem inicia de pé, parceiro ajoelhado — o mesmo desenho do
`mm-wall-1`). Os clipes `ff/wall` da família `ai_n_lucky`/`midnight_lucky` ficam de fora: vêm com a
bacia ~0,8 m abaixo da referência dos pares M/F de parede, como se fossem autorados no chão.

Como nos pares M/F de móvel, as metades já vêm separadas dentro do clipe (medido na bacia: abraço
~0,65–0,88 m, beijo ~0,16–0,21 m), então os dois avatares ficam no mesmo ponto e `PAIR_POSES` não
precisa de `offset`/`yaw`. Os de sofá giram 180° para o encosto e os de cama ficam em 0°, iguais
aos M/F. Cada corpo publica só as suas metades (`ff_*` no feminino, `mm_*` no masculino).

**Pares de móvel (sofá/cadeira/cama):** `pair10`..`pair17` vêm dos bundles de movimento
`ai_*`/`midnight_*` de `mf/sofa`, `mf/chair` e `mf/bed` — clipes de penetração, não poses de
contato. O manifesto `tools/3dx/seated-pairs.json` (versão 2) guarda o bundle e o JSON de saída de
cada lado; o `import_seated_pairs.py` no modo `motion` toca o clipe sobre o esqueleto do prefab
nativo (`man`/`woman`) e aplica as curvas de posição (`skeleton_env` + `position_curves=True`), que
trazem o quadril e a haste. O `export_bodies.py` inclui as oito actions nos dois corpos e roda o
`slim_glb.py` no GLB temporário: o exportador assa todos os ossos em todos os quadros e ~80% dos
canais são constantes; colapsá-los em duas chaves corta o corpo de 124→42 MB (masculino) e
189→53 MB (feminino) sem perda. Depois, o `split_clips.py` move os clipes de par para
`clips/<gênero>/` (o corpo fica em ~13,5/14,7 MB e cada clipe carrega sob demanda). No jogo:

| Action   | Bundle (M / F)                                                          | Assento | Interação           | Inserção    |
| -------- | ----------------------------------------------------------------------- | ------- | ------------------- | ----------- |
| `pair10` | `man@sofa_106` / `woman@sofa_106`                                       | sofá    | Sofá 1 · vaginal    | vaginal 90% |
| `pair11` | `man@sofa_103` / `woman@sofa_103`                                       | sofá    | Sofá 2 · anal       | anal 62%    |
| `pair12` | `man@sofa_107` / `woman@sofa_107`                                       | sofá    | Sofá 3 · anal       | anal 64%    |
| `pair13` | `man@ai_chair_mf_rideoncock1` / `woman@ai_chair_mf_rideoncock2`         | cadeira | Cadeira 1 · vaginal | vaginal 33% |
| `pair14` | `man@chair_25` / `woman@chair_25`                                       | cadeira | Cadeira 2 · anal    | anal 40%    |
| `pair15` | `man@midnight_lucky_mf_bed_a_1_1` / `woman@midnight_lucky_mf_bed_a_1_2` | cama    | Cama 1 · anal       | anal 87%    |
| `pair16` | `man@ai_bed_mfdoggy1` / `woman@ai_bed_mfdoggy2`                         | cama    | Cama 2 · anal       | anal 59%    |
| `pair17` | `man@midnight_lucky_mf_bed_v_5_1` / `woman@midnight_lucky_mf_bed_v_5_2` | cama    | Cama 3 · vaginal    | vaginal 37% |

A coluna "Inserção" é a fração dos quadros em que o orifício correspondente (`Gen Pussy` ou
`Gen Ass`) fica a menos de 1,5 cm da cadeia da haste (`pen_1`..`pen_3`); a outra cadeia fica a
≥ 1,8 cm, então não há ambiguidade de orifício. `pen_3_end` é um marcador ~9 cm além da glande e
não entra na conta. A medição é feita no espaço do bundle, depois do import (ver
`tools/3dx/README.md`).

`PAIR_POSES` tem só `actor`, `partner` e `seat` para os oito pares: sem `offset`, `yaw` nem
`seatOffset`; a única exceção é o `facing` do `sofa-2` (abaixo). Como no jogo base, os dois corpos ficam no **mesmo pivô** do móvel
(`coupleDance.cs`: `P_1/P_3/P_4.position = P_0.position`; `propaction.cs` só soma o `animDY` do
móvel) e a relação entre eles — quadril, haste e orifício — está dentro do clipe. O servidor
coloca os dois avatares no `Seat.pivot` com `heading = heading do assento`, porque os clipes
mantêm a orientação nativa do prefab. O convite só é aceito com o iniciador sentado no tipo de
móvel do par (`seat: 'sofa' | 'chair' | 'bed'`). A cadeia facial desses clipes entra no
congelamento de `freezeFaceOnSit` (junto com `sit_*`).

A **fase** do clipe é a mesma nas duas pontas: o `INTERACTION_STARTED_EVENT` leva `startedAt` (relógio
do servidor) e cada cliente ancora o par nele (`avatars.notePairStart`), em vez de começar quando o
estado — ou o download do clipe — chega. A correção de deriva em `applyMotion` pula o quadro quando
a diferença passa de 0,12 s. Sem isso as duas telas podiam estar em momentos diferentes da mesma
animação (o clipe tem movimento), o que parece um par "torto" mesmo com posição e frente certas.

`sofa-2` (`sofa_103`) é o único clipe que corre **ao longo** do sofá (1,7 m de corpo contra 1 m
de profundidade). Ele leva `facing: -90` e `facingTowardCenter`: `pairFacing(pair, seat)`
(`game-core`) usa `Seat.lateralOffset` — a distância do lugar ao centro do módulo, no sentido da
direita do assento — e troca o sinal para +90 no lugar à direita, de modo que o corpo sempre
segue para o centro. No lugar do meio o clipe ainda passa ~0,5 m da ponta do sofá.

Esse pivô é medido, não estimado: o jogo ancora o avatar na origem do móvel
(`propaction`, `obj.transform.position = furniture.position`) e o pacote de pose sentada coloca o
quadril 0,17 m à frente dela, a 0,57 m de altura. Na balada a raiz de cada um dos 12 módulos
`sofa_3` fica guardada em `clubSofas.anchor` (a caixa de colisão medida avança ~4,5 cm para a
frente dela, então o assento não pode sair do centro da caixa). Ver `tools/3dx/README.md`,
"Encaixe dos móveis".

Como o clipe é autorado no pivô, **só o lugar do meio de cada módulo é sentável** (um por módulo):
nos lugares das pontas o casal saía deslocado em relação ao sofá. Vale para os módulos da balada, o
sofá do quarto e os do lounge; a caixa do módulo continua com a largura de três lugares para colisão
e visual.

As cadeiras usam o próprio assento como pivô: o bundle `mf/chair` tem outro referencial (frente
em −Z) e a origem do `Chair_Tolix` fica a ~0,61 m do assento, fora da caixa — o pivô do par é o
assento, não a origem do móvel. Os sete pares de cadeira giram `facing: -90` (referencial do bundle
medido na bacia) e os deslocamentos finos vêm do editor de pares.

### Cama

`pair15`..`pair17` vêm de `mf/bed/{man,woman}@midnight_lucky_mf_bed_a_1`, `@ai_bed_mfdoggy` e
`@midnight_lucky_mf_bed_v_5` e valem com o iniciador sentado na cama (`seat: 'bed'`). A âncora é a
raiz do `Bed` do quarto `(0,03, -3,762)`, com a cabeceira no −Z (lado alto do `Bed_Base`, junto da
parede `Bed_Wall`), então o heading do assento aponta para ela. Os oito pares de cama usam
`seatOffset` (recuo até o travesseiro) e `lift` 0,15–0,2 m (altura do colchão), exportados do
`pair-tuner`; `bed-5` também desloca o iniciador homem 1 cm à direita via `byInitiator`.

### Escala comum e verificações

Durante um par os dois corpos usam uma **escala comum** (média das alturas dos participantes),
porque os clipes foram autorados para esqueletos iguais; fora do par cada avatar volta à sua
altura. É por isso que a diferença de altura entre os jogadores não abre o encaixe.

O importador preserva o espaço do bundle: o clipe carrega o deslocamento autoral de cada corpo em
relação ao pivô e a relação quadril/haste/orifício. Nada é reancorado no runtime — o servidor só
leva os dois avatares ao `Seat.pivot` e aplica o heading do assento.

Para inspecionar o encaixe sem editar código, rode `pnpm --filter @3dx/web dev` e abra
`/pair-tuner.html`: escolha sala, interação e assento e veja as distâncias ao encosto e à frente
em centímetros. Os campos `seatOffset`/`facing`/offset do parceiro que existem lá são só de teste
local (os pares publicados usam 0), para medir um móvel novo antes de decidir o pivô.

O offset é medido entre as **raízes dos modelos** (os pés), a mesma referência do
`viewer-pair.html` e do `render_pair.py`. Por isso o corpo 3DX **não** é centralizado em Z na
normalização do jogo (`normalizeModelTo`): o centro do corpo fica alguns centímetros à frente da
raiz, como no GLB cru, e o encaixe do par não muda em relação ao viewer.

### Sentar

Os clipes nativos de sentar entram nos dois corpos, nomeados pela mobília: `chair_sit_1` →
`sit_chair` e `barstool_sit_1` → `sit_stool` (121 e 61 quadros @ 30 fps); o `sit_sofa` feminino
vem do `sofa_sit` (201 quadros). A extração usa `import_pose_bundle.py` com o modo `source_pose` de
`extract_character.py`: rotações locais absolutas do clipe mais uma correção de guinada (linha do
quadril → +Z), que é a formulação que mantém a pose sentada coerente.

**Exceção masculina no sofá:** o `man@sofa_sit` original é uma pose de chaise longa (tronco
reclinado ~30°, braços abertos sobre o encosto, pernas cruzadas). Nos nossos sofás (assento de
0,68 m e encosto de 0,21 m) ele não cabe: ou o quadril fica na beirada do assento, ou o tronco
entra no encosto. O `sit_sofa` masculino é gerado do `chair_sit_1` (postura sentada ereta, mãos
no colo, pés no chão), que é o mesmo clipe do `sit_chair`; o feminino continua vindo do
`woman@sofa_sit` (pose reclinada de pernas cruzadas, que assenta no encosto).

A guinada procura a linha do quadril nas duas grafias do rig (`woman bip L Thigh` no feminino e
`man_L_Thigh` no masculino); sem isso ela ficava identidade e a pose masculina saía deitada de
lado. O rig masculino tem cinco raízes sem pai (`man_bone_Gen_Ass`, `man_bone_Pelvis`,
`man_bone_pen_1`, `man_bone_pen_balls` e `man_Spine`), então a altura do bundle entra em todas,
mas o deslocamento horizontal é único (ancorado no osso 0): repetir o x/z de repouso em cada raiz
endireitava o tronco reclinado e afastava a pelve da coluna.

**Altura do quadril:** nos clipes de sentar a translação da pelve é a descida até o assento — um
valor **constante** dentro do clipe, portanto pose, não root motion. O cliente só remove a
translação que varia ao longo do clipe (`stripRootMotion`). Remover a constante deixava a pelve
masculina na altura de pé (0,88 m) com as pernas sentadas (0,48 m): o quadril rasgava só no jogo,
porque o GLB renderiza com a pose correta. O clipe de sofá masculino reaproveita o de cadeira;
ambos mantêm a translação de pose.

**Face:** os clipes de sentar trazem também a cadeia facial do bundle (mandíbula, lábios, língua e
olhos). No corpo retargetado essas rotações deformam a malha do rosto e a boca sai torta, enquanto
o atlas de olhos/boca fica preso ao osso Head. `freezeFaceOnSit` remove as animações dos
descendentes do osso principal da cabeça nos clipes de sentar e nos pares de móvel (`pair10`..`pair17`);
a expressão fica em repouso e o osso Head continua animando, então a cabeça ainda acompanha o tronco.

`motionClip(model, 'sit', moving, seatKind)` escolhe o clipe pelo tipo do assento. O cliente
descobre o tipo com `nearestSeatKind(layout, posição)` (até 0,75 m); sem um assento próximo, usa
`sit_sofa`. Os assentos vêm de `RoomLayout.seats`, com `kind: 'sofa' | 'chair' | 'stool'`.

## Anatomia (B3)

O `man_penis` entra como **quarta malha do mesmo GLB** (`man_body`, `man_head`,
`man_eyelashes`, `man_penis`), no mesmo armature e no mesmo espaço das outras.
É a regra de "anatomia como peça" adaptada ao 3DX: em vez de um GLB equipável à
A anatomia viaja junto do corpo (não é um GLB equipável à parte) e o jogo a **oculta**
(`isVisible = false`) quando há calça ou roupa íntima. Os ossos usados são
`b4` (pelve), `b8`/`b9`/`b10` (cadeia `man_bone_pen_*`) e `b14`
(`man_bone_pen_balls`), então o mapa de juntas (`JOINTS_3DX_MALE`) não muda. A
peça feminina (`woman_penis`) fica pendente.

## Texturas (pele, rosto e tecido)

Desde 2026-10-20 o corpo e as roupas publicados levam o material nativo do projeto. Os mapas são
copiados para PNG **lossless na resolução original** e o Blender os embute byte a byte no GLB (não
há reencode); `--tangents` acompanha os normal maps.

- Corpo/cabeça/cílios/olhos/anatomia: `py -3.11 tools/3dx/extract_body_textures_project.py --outdir
tools/3dx/build/project` → `body_<g>_{diffuse,normal}.png`, `head_<g>_{diffuse,normal}.png`,
  `eyelashes_<g>.png`, `jaw_eyes_atlas_{diffuse,normal}.png` e `body_<g>_materials.json`.
- **Olhos 3D:** `{man,woman}_jaw_eyes_atlas` (globo ocular + boca) entra no GLB preso 100% ao osso
  `Head`; a íris é assada em **tons de cinza** (`paint_iris`) porque o shader `Charecters_Eye` a
  desenha em runtime. O `EyeTintPlugin` multiplica só a íris pela cor escolhida (`eyeColor` ou o hex
  do color picker) e deixa a esclera branca.
- `_BumpMap` do projeto é normal map de espaço tangente de verdade (azul ≈ 254): o bump em escala
  de cinza do caminho por bundle não deve ser usado como normal (dava manchas escuras).
- O `_Color` do shader 3DX não é exportado: quem escolhe a cor é o jogo.
- **Tom de pele:** o atlas já tem a pele desenhada, então `skinTint(model, hex)` em
  `avatar-colors.ts` divide o tom da paleta pela pele mais clara do atlas (percentil 95, medido nas
  texturas). O swatch continua sendo a cor final e o atlas entra com poros/sombras/lábios/olhos; sem
  o divisor o tom seria aplicado duas vezes e os tons claros empatariam.
- **Tecido:** as peças levam `_MainTex` quando existe + `_BumpMap`; o `TintPlugin` recolore pela
  luminância, mantendo dobras e estampas.

## Roupas (P5, fonte projeto)

Cada peça é um `.prefab` em `Resources/{man,woman}/cloth`. O `SkinnedMeshRenderer`
aponta para o `Mesh` LOD0 (`_LOD1`/`_LOD2` ficam de fora) e traz uma **cópia
própria do rig**, com a raiz rotacionada/deslocada e o mesh no bind A-pose. O
remap por posição (usado no corpo) não serve. Por isso o `extract_character.py`
usa `--retarget`: ele casa os ossos **por nome** (sufixos `_1`/`_2`; dedos
ausentes herdam o antebraço) e assa cada vértice com

```
v_ref = Σ w_i * refWorld[map(i)] * bindpose[i] * v
```

O `refWorld` vem de `tools/3dx/rigs/3dx_{male,female}.json` (`--skeleton-json`),
o contrato de 322/464 ossos do corpo publicado. Depois aplica `P` (Y-up → Z-up)
e reescreve o `boneIdx` para esse esqueleto. O resultado é a peça no **rest pose
do corpo**, pronta para ser filha da raiz normalizada no jogo.

```powershell
# 1) extrair UMA peça retargetada (o mesh certo vem do m_Mesh.path_id)
py -3.11 tools/3dx/extract_character.py `
  --source "E:\dev\exported\ExportedProject\Assets\Resources\man\cloth\shirt_1.prefab" `
  --skeleton-json tools/3dx/rigs/3dx_male.json `
  --mesh shirt_1 --gender male --retarget `
  --out tools/3dx/build/project/clothes/3dx_m_top_shirt.json

# 2) exportar em branco (o jogo colore pelo TintPlugin) e sem animação
python tools/3dx/run_blender.py export_glb.py -- `
  --json tools/3dx/build/project/clothes/3dx_m_top_shirt.json `
  --out apps/web/public/assets/3dx/clothes/top/3dx_m_top_shirt.glb `
  --color 1,1,1 --roughness 0.8

# 3) validar: em repouso, maxdisp = 0.0000 (mesmo esqueleto do corpo)
py -3.11 tools/3dx/verify_glb.py --glb apps/web/public/assets/3dx/clothes/top/3dx_m_top_shirt.glb --rest

# 4) ou regerar a coleção inteira de uma vez
py -3.11 tools/3dx/export_clothes_project.py
```

A prova visual é feita importando corpo + peça no Blender e trocando o modificador
da peça para o armature do corpo (o mesmo que o jogo faz em `sameBoneLayout`).

Coleção publicada em 2026-10-20 (28 ids no `PART_CATALOG`):

| Gênero    | Slot        | Prefab do projeto | ID                           |
| --------- | ----------- | ----------------- | ---------------------------- |
| masculino | `top`       | `shirt_1`         | `3dx_m_top_shirt`            |
| masculino | `top`       | `tshirt_1`        | `3dx_m_top_tshirt_basic`     |
| masculino | `top`       | `tshirt_2`        | `3dx_m_top_tshirt_print`     |
| masculino | `top`       | `tshirt_3`        | `3dx_m_top_tshirt_long`      |
| masculino | `top`       | `harness_1`       | `3dx_m_top_harness`          |
| masculino | `outerwear` | `cardigan`        | `3dx_m_outerwear_cardigan`   |
| masculino | `outerwear` | `jacket_1`        | `3dx_m_outerwear_jacket`     |
| masculino | `outerwear` | `jacket_2`        | `3dx_m_outerwear_bomber`     |
| masculino | `bottom`    | `jeans_1`         | `3dx_m_bottom_pants`         |
| masculino | `bottom`    | `jeans_2`         | `3dx_m_bottom_jeans`         |
| masculino | `bottom`    | `shorts_1`        | `3dx_m_bottom_shorts`        |
| masculino | `underwear` | `pantie_1`        | `3dx_m_underwear_briefs`     |
| masculino | `underwear` | `pantie_2`        | `3dx_m_underwear_boxer`      |
| feminino  | `top`       | `tshirt_4`        | `3dx_f_top_shirt`            |
| feminino  | `top`       | `blouse_1`        | `3dx_f_top_blouse`           |
| feminino  | `top`       | `tshirt_3`        | `3dx_f_top_tube`             |
| feminino  | `top`       | `tshirt_5`        | `3dx_f_top_offshoulder`      |
| feminino  | `top`       | `tshirt_6`        | `3dx_f_top_tank`             |
| feminino  | `outerwear` | `coat`            | `3dx_f_outerwear_coat`       |
| feminino  | `bottom`    | `jeans_1`         | `3dx_f_bottom_pants`         |
| feminino  | `bottom`    | `leggins_1`       | `3dx_f_bottom_leggings`      |
| feminino  | `bottom`    | `shorts_1`        | `3dx_f_bottom_shorts`        |
| feminino  | `bottom`    | `skirt_1`         | `3dx_f_bottom_skirt`         |
| feminino  | `bottom`    | `skirt_3`         | `3dx_f_bottom_skirt_pleated` |
| feminino  | `bottom`    | `skirt_2`         | `3dx_f_bottom_skirt_short`   |
| feminino  | `underwear` | `pantie_1`        | `3dx_f_underwear_panties`    |
| feminino  | `underwear` | `bra_1`           | `3dx_f_underwear_bra`        |
| feminino  | `underwear` | `bra_2`           | `3dx_f_underwear_bra_lace`   |

Regras de integração que já valem para as próximas peças:

- material com o albedo nativo (quando existe) + normal map + `--tangents`; o
  `TintPlugin` recolore pela **luminância** da textura (`topColor` no `top` e no
  `outerwear`; `bottomColor` no `bottom` e no `underwear`), então o relevo do pano
  e as estampas continuam visíveis. A cor final é sempre a da paleta — o albedo do
  GLB não pode vir pré-colorido;
- toda peça passa pelo `fit_cloth.py` antes do export (folga + empurrão onde
  afunda na pele + pesos do corpo). A folga vem do slot: sobretudo/casaco 12 mm
  de `clearance` e 8 mm de base, topo e baixo 7/6 mm, roupa íntima 5/4 mm. Sem
  isso o corpo atravessa o pano no ombro, na axila, no busto e na coxa, mesmo com
  `verify_glb --rest` em 0;
- o `fit_cloth.py --fill-holes 12` fecha frestas pequenas entre os painéis da
  malha (o sobretudo mostrava o fundo da sala nas costas) — hems, decotes e
  punhos ficam abertos;
- roupa íntima some quando a região dela está coberta (`covers`: sutiã = `top`,
  calcinha/cueca = `bottom`); no jogo é o `equippedPartIds`, nos viewers a mesma
  regra na montagem das peças. O sutiã atravessava a blusa e virava duas manchas
  escuras no busto;
- peça é **`doubleSided`**: o tecido é uma superfície de uma camada e o verso
  aparece na dobra do ombro/axila (com culling, o pedaço some e a pele vira um
  buraco no casaco);
- a roupa íntima é uma camada independente e aparece combinada com calça/saia e
  top/blusa quando os dois slots estão habilitados; a anatomia masculina some com
  calça **ou** roupa íntima; o `outerwear` esconde a camiseta (mesma camada);
- a peça é exportada no mesmo rest pose/esqueleto do corpo e, no jogo, passa a
  usar o esqueleto do corpo (`sameBoneLayout` em `avatar-parts.ts`), então
  acompanha idle/walk nativos; sem essa troca a peça fica no repouso e o corpo a
  atravessa;
- `?outfit=top|outerwear|bottom|underwear|all` no `viewer3dx.html` carrega as
  peças sobre o corpo para a prova visual.

## Acessórios (P6)

Coleção publicada em 2026-10-20: **5 chapéus, 5 óculos e 5 máscaras por gênero**
(30 GLBs em `assets/3dx/accessories/<slot>/`). Chapéus são `SkinnedMeshRenderer`
de 1 osso e usam o mesmo `--retarget` das roupas. Óculos e máscaras são
`MeshFilter`/`MeshRenderer` rígidos: o `extract_accessory_project.py` assa a
malha no espaço do corpo e dá 100% de peso ao osso `Head`; a translação da raiz do
prefab é só offset de preview e é ignorada.

```powershell
# chapéu
py -3.11 tools/3dx/extract_character.py `
  --source "E:\dev\exported\ExportedProject\Assets\Resources\man\cloth\hat_flat.prefab" `
  --skeleton-json tools/3dx/rigs/3dx_male.json `
  --mesh hat_flat --gender male --retarget `
  --out tools/3dx/build/project/accessories/3dx_m_hat_flat.json

# óculos/máscara
py -3.11 tools/3dx/extract_accessory_project.py `
  --source "E:\dev\exported\ExportedProject\Assets\Resources\man\cloth\glasses_1.prefab" `
  --rig tools/3dx/rigs/3dx_male.json --gender male `
  --out tools/3dx/build/project/accessories/3dx_m_glasses_1.json

# lote completo
py -3.11 tools/3dx/export_accessories_project.py
```

| Tipo    | Prefabs do projeto                                            | Slot      | IDs                      |
| ------- | ------------------------------------------------------------- | --------- | ------------------------ |
| Chapéu  | `hat_flat`, `hat_bunny`, `hat_horns`, `hat_witch`, `hat_wool` | `hat`     | `3dx_{m,f}_hat_*`        |
| Óculos  | `glasses_1..5`                                                | `glasses` | `3dx_{m,f}_glasses_1..5` |
| Máscara | `mask_1..5`                                                   | `mask`    | `3dx_{m,f}_mask_1..5`    |

O slot `mask` foi adicionado a `PART_SLOTS`/`AvatarConfig`; `hat` e `glasses` já
existiam. Reimportação de 2026-10-20: as peças agora usam o material original do
projeto — albedo e **normal maps** em resolução nativa, cor `_Color`, roughness,
metallic e alpha. É por isso que os GLBs cresceram (o chapéu `hat_flat` foi de
~225 KB para ~735 KB). O jogo não aplica `TintPlugin` nelas; a cor já vem do
material.

## Tatuagens (P7)

As 10 tatuagens autorais são **assets 3DX**:

- texturas em `apps/web/public/assets/3dx/decals/14_tattoo_autoral/` (WebP RGBA 1024²);
- manifesto em `apps/web/public/assets/3dx/decals/manifest.json`;
- categoria `14_tattoo_autoral` em `DECAL_CATEGORIES`, escolhida por `DecalChoice`;
- `decals` no `AvatarConfig` (até 8, um por slot).

A projeção está em `decals-3dx.ts`. Cada slot tem uma âncora por gênero
(`DECAL_ANCHORS_3DX_MALE`/`FEMALE`) com osso `bN`, posição e quaternion no espaço
local do osso; o decalque vira um pedaço da malha do corpo/cabeça com os mesmos
pesos de pele, então acompanha idle/walk. Se a âncora não cair na malha (o pescoço
é o caso limítrofe), cai para um plano preso ao osso.

Slots: rosto, pescoço, peito, costas, braço esquerdo/direito e coxa
esquerda/direita. O teste `decals-3dx.test.ts` confere o manifesto, os 10 arquivos
e a projeção nos dois gêneros.

## Cabelo (Fase D, piloto)

O cabelo nativo é uma peça do slot `hair`, presa ao osso da cabeça e exportada no
mesmo rest pose do corpo. O bundle de cabelo traz o mesh, o esqueleto completo e
o atlas de fios com alfa; o `extract_character.py --retarget` casa os ossos por
nome, e o `extract_texture.py` extrai a `_MainTex` do material.

```powershell
# masculino: todos os pesos caem em man_bone_Head
py -3.11 tools/3dx/extract_character.py `
  --source "E:\dev\exported\ExportedProject\Assets\Resources" `
  --skeleton "E:\dev\exported\ExportedProject\Assets\Resources\man\man.prefab" `
  --mesh hair_15_1 --gender male --retarget `
  --out tools/3dx/build/hair_male_15.json

py -3.11 tools/3dx/extract_texture.py `
  --source "E:\dev\exported\ExportedProject\Assets\Resources" `
  --material hair15 --out tools/3dx/build/hair_male_15.png

python tools/3dx/run_blender.py export_glb.py -- `
  --json tools/3dx/build/hair_male_15.json `
  --out apps/web/public/assets/3dx/hair/3dx_m_hair_15.glb `
  --texture tools/3dx/build/hair_male_15.png `
  --alpha-mode cutout --cutoff 0.3 --double-sided `
  --color 1,1,1 --roughness 0.75
```

O feminino usa `...\hair\female\hair_30`, `--mesh hair_37`, esqueleto
`...\wear\female\s_squipanties1cum`, `--material hair_diff_002_a_uni` e
`--cutoff 0.5`. O `extract_texture.py` imprime `_Mode`/`_Cutoff` do material
original.

| Gênero    | Bundle    | Mesh        | ID do catálogo  |
| --------- | --------- | ----------- | --------------- |
| masculino | `hair_15` | `hair_15_1` | `3dx_m_hair_15` |
| feminino  | `hair_30` | `hair_37`   | `3dx_f_hair_30` |

Regras que valem para os próximos cabelos:

- exportar o atlas claro e deixar a cor para o jogo (`hairTint`, com
  `hairColor`); não pré-multiplicar a cor de origem;
- `--alpha-mode cutout` (`alphaMode: MASK`) e `--double-sided` para os cards;
- `attachAvatarParts` troca o esqueleto do cabelo pelo do corpo
  (`sameBoneLayout`), então ele acompanha idle/walk sem segunda animação;
- `softenAlphaMasks` suaviza a borda dos fios no jogo;
- no `viewer3dx.html`, o cabelo carrega por padrão (`?hair=0` desliga) e
  `?view=back|side` ajuda a conferir o encaixe.

**Auditoria de 2026-10-20:** os dois cabelos do catálogo já usam a maior
resolução disponível no cliente (1 024 px no masculino e 2 048 px no feminino) e
o mesh LOD0 do bundle (9 387/10 128 vértices). O projeto exportado tem versões
menores para os estilos equivalentes (128/1 024 px, 6 097 vértices), então
reimportar pelo projeto **reduziria** a qualidade; eles foram mantidos. O
`maximizeTextureQuality` agora usa anisotropia 16 para os cabelos/acessórios.

## Quarto padrão (`home`)

O quarto padrão do 3DXChat é `scenes\char_editor_decor.unity`: cama, sofá,
mesa, cadeiras, armários, mezanino e paredes/piso. As raízes úteis são `ROOM`,
`FURNITURE`, `FURNITURE DYNAMIC` e `LIGHTS`; malhas, materiais e texturas
resolvem por GUID (`.meta`), sem UnityPy.

```powershell
py -3.11 tools/3dx/extract_room_project.py `
  --scene "E:\dev\exported\ExportedProject\Assets\scenes\char_editor_decor.unity" `
  --name home `
  --out tools/3dx/build/project/home.json `
  --texdir tools/3dx/build/project/home_textures --max-texture 1024

python tools/3dx/run_blender.py export_room_glb.py -- `
  --json tools/3dx/build/project/home.json `
  --out apps/web/public/assets/3dx/rooms/home/home.glb
```

O extrator aplica a matriz de mundo de cada `MeshFilter` (Unity Y-up → Blender
Z-up), agrupa os triângulos por material e salva o albedo (`_MainTex`) em 1024 px.
Materiais com `_Mode` 1/2/3 viram cutout ou blend; vidro/espelho são
`doubleSided`. Normal maps não entram neste piloto. O caminho por bundle
(`extract_room.py` + `3DXChat_Data\level*`) fica como legado/fallback.

No jogo, `apps/web/src/game/rendering/home.ts` desfaz o espelho em X do loader glTF
(`root.scaling.x = -1`) e soma o `HOME_OFFSET`. O layout `HOME` (`scenes.ts`) está nas
coordenadas do projeto, sem espelho — ao contrário da balada, cujo layout já vive no
espaço espelhado. Sem isso, sofá, cadeira e cama ficavam do lado oposto dos assentos e
os pôsteres saíam com o texto invertido. Para conferir, abra `pair-tuner.html?room=home`:
o par deve cair sobre o móvel.

`apps/web/public/viewer-room.html` abre a sala com câmera orbital, vistas
frente/lado/topo e wireframe. O `viewer-closet.html` usa a mesma sala como
**closet**: câmera fixa (sem órbita/zoom), avatar 3DX no centro e o painel de
cabelo/roupa/cores/presets. O painel tem **focos de câmera** — corpo inteiro,
rosto, perfil, tronco, braços, pernas e costas — para conferir tatuagens,
piercings e detalhes sem liberar a câmera livre. É a prova visual do closet;
colisões, spawns e troca de sala no jogo ainda são a próxima etapa.

### Balada (`level7`) — hall inicial

A cena `scenes\club.unity` é o **hall inicial** do jogo: bar, banquinhos, DJ,
pista com treliça, cortinas, bebidas e paredes/piso. As raízes usadas são
`LEVEL`, `bar_1`, `dj_pult` e `coctail1..3`; os LOD1+ são descartados (só o LOD0
entra). O `collider_floor` entra mesmo com "collider" no nome: ele carrega o piso
real (`concrete_floor` + `tile_1`) e sem ele o salão fica sem chão.

```powershell
py -3.11 tools/3dx/extract_room_project.py `
  --scene "E:\dev\exported\ExportedProject\Assets\scenes\club.unity" `
  --name club7 --out tools/3dx/build/project/club7.json `
  --texdir tools/3dx/build/project/club7_textures `
  --max-texture 0 --texture-format png `
  --roots LEVEL bar_1 dj_pult coctail1 coctail2 coctail3

python tools/3dx/run_blender.py export_room_glb.py -- `
  --json tools/3dx/build/project/club7.json `
  --out apps/web/public/assets/3dx/rooms/club7/club7.glb
```

Reimportação de 2026-10-20 (melhor qualidade da fonte): 56 grupos/materiais,
~48 mil triângulos, 59 imagens PNG em resolução nativa, normal maps (piso,
sofás, bancos, paredes), mapas de emissão (neon, bar, letreiros, cortinas de luz)
e tangentes; GLB de 10,6 MB. O caminho por bundle empilhava LOD0–LOD3 das
garrafas (436 triângulos por garrafa em vez de 252); o passo do projeto exporta só
o LOD0. `viewer-club.html` abre a balada com câmera orbital.

No jogo, `apps/web/src/game/rendering/club.ts` carrega o GLB, aplica GlowLayer
(emissivos), um ambiente metálico procedural e as luzes coloridas da casa. O
loader do glTF espelha a cena em X; o offset e o layout `CLUB` já vivem nesse
espaço espelhado. A colisão de paredes/divisórias vem do `collider_level` e está
em `packages/game-core/src/club-walls.ts`; sofás (um collider por móvel),
luminárias de chão, alto-falantes, bar e mesa de DJ estão em `scenes.ts`. O bar
e o palco do DJ ficam 0,5 m acima do salão: o servidor continua replicando só
x/z, e o cliente aplica `clubFloorHeight` (com rampa nos degraus) para o avatar
não afundar no piso elevado.

## Critérios de aceite (atingidos)

- `character_male.glb` (corpo + cabeça + cílios + anatomia) e
  `character_female.glb` (corpo + cabeça + cílios) com mãos e pés;
- em repouso, `verify_glb.py` dá `maxdisp = 0.0000` em todas as malhas;
- com o idle nativo, braços e pernas mantêm o volume (sem colapso em
  cotovelo/joelho/pulso) e o rosto não deforma;
- o walk nativo (37 quadros) está embutido como segunda action nos dois corpos e
  é escolhido por `motionClip` quando o avatar se desloca;
- a pose `stay_pose_2` está embutida como terceira action `pose01` nos dois
  corpos, é escolhida por `motionClip` na ação `pose01` e bate com o
  `skin_export.py` no mesmo quadro;
- as peças da Fase C dão `maxdisp = 0.0000` em repouso, compartilham o esqueleto
  do corpo e acompanham idle/walk no `viewer3dx.html?outfit=all`;
- o piloto da Fase D traz um cabelo por gênero (`3dx_m_hair_15` /
  `3dx_f_hair_30`) com atlas de fios, alfa cutout, esqueleto do corpo e cor por
  `hairTint`; acompanha idle/walk no `viewer3dx.html`;
- o piloto de sala traz a `level20` (quarto/vestiário) com móveis, paredes/piso e
  vidros no `viewer-room.html`; o `viewer-closet.html` usa a sala como closet com
  câmera fixa e focos (corpo inteiro/rosto/perfil/tronco/braços/pernas/costas).
  É uma cena estática, ainda sem colisão/spawn no jogo;
- a balada `level7` (`club7.glb`) é o hall inicial, com bar, DJ, piso e móveis,
  texturas nativas em PNG, normal/emissive e tangentes; abre no
  `viewer-club.html` e no jogo (luzes coloridas + glow + colisão real);
- a praia (`beach.unity`) entra no jogo como **recorte** da área jogável (deck,
  espreguiçadeiras, guarda-sóis, postes e pedras) com areia e mar desenhados no
  cliente; é a sala pública "Praia" no diálogo de salas;
- com a animação de teste antiga, `skin_export.py` e `verify_glb.py` dão o mesmo
  deslocamento no quadro 80 (corpo M 0.9827 / F 0.7930).

## Não fazer

- Carregar a malha de `wear` como se fosse o corpo nu (é a peça de roupa).
- Casar os clipes pelo caminho completo do osso — cada bundle tem uma raiz
  diferente (`man_1/`, `item/item_1/`). Casar pelo **nome do osso** (`bone_key`).
- Escolher o `SkinnedMeshRenderer` pelo “que tem mais ossos” em bundle de roupa:
  em `s_CropTop_ni`/`s_pantie_15_ni` isso pega o LOD errado. Usar o
  `m_Mesh.path_id`.
- Usar bundles criptografados ou com dependência externa (ex.: `venfsuitshirtcum`,
  “Reference has no path_id”).
