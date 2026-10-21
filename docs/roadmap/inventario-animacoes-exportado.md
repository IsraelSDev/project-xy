# Inventário de animações — export 3DX

Gerado em **2026-10-20** a partir de:

- Bundles: `C:\dev\Mv444\AssetBundles\animation`
- Projeto Unity exportado: `C:\dev\exported\ExportedProject\Assets`

> **Leia primeiro:** a pasta `AssetBundles/animation` é a fonte **completa** das animações.
> O projeto Unity exportado (`Assets/AnimationClip` + `Assets/Resources`) tem só os `.anim`
> soltos/pares que o AssetRipper extraiu do `3DXChat_Data` — **não** contém as categorias `f`, `m`, `mf`, `mmf`,
> `mff`, `fff`, `mmm` etc. Para importar o catálogo inteiro, a fonte é o bundle; o `.anim` do
> projeto serve para os clipes que já existem lá (ver §5).

Cada arquivo é um bundle de **um ator**. O nome segue `ator@clipe`; o prefixo `man`/`woman`
identifica o rig animado, **não** o gênero da cena. Uma cena de par/trio tem 2 ou 3 bundles
(um por participante), com sufixo de participante (`_woman1`, `_man2`, `_mmf3`, `_mff1` etc.).

## 1. Resumo

| Cat. | Composição | Bundles | Válidos | Tamanho | Pastas | Atores |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `f` | solo feminino (1 atriz) | 169 | 169 | 332,1 MB | 29 | drum, guitar, woman |
| `f_drum` | atriz + prop `drum` (2 bundles; duplica `f/drum`) | 2 | 2 | 1,6 MB | 1 | drum, woman |
| `ff` | par F+F (2 atrizes) | 1078 | 1078 | 1287,7 MB | 19 | woman |
| `fff` | trio F+F+F (3 atrizes) | 186 | 186 | 174,2 MB | 14 | woman |
| `ingame` | clipes sociais/emotes/danças do cliente; mistura 1, 2 e 4 atores | 191 | 191 | 454,9 MB | 1 | man, woman |
| `m` | solo masculino (1 ator) | 80 | 80 | 115,4 MB | 29 | drum, guitar, man |
| `m_drum` | ator + prop `drum` (2 bundles; duplica `m/drum`) | 2 | 2 | 1,5 MB | 1 | drum, man |
| `mf` | par M+F (2 atores) | 1461 | 1460 | 1494,1 MB | 20 | man, woman |
| `mff` | trio M+2F (3 atores) | 229 | 229 | 209,9 MB | 20 | man, woman |
| `mm` | par M+M (2 atores) | 580 | 580 | 475,1 MB | 18 | man |
| `mmf` | trio 2M+F (3 atores) | 159 | 159 | 144,5 MB | 19 | man, woman |
| `mmm` | trio M+M+M (3 atores) | 81 | 81 | 96,3 MB | 10 | man |
| **Total** | **12 categorias** | **4218** | **4217** | **4787,2 MB** | — | — |

- **4218 bundles**, **4217 válidos**; 1 `.filepart` incompleto.
- **4787,2 MB** só de animação (o `AssetBundles` inteiro tem ~8,37 GB).
- Categorias de cena: solo (`f`, `m`), par (`mf`, `ff`, `mm`) e trio (`mmf`, `mff`, `fff`, `mmm`).
- **Não existe** pasta `mmmf` (3M+F), nem `ffff`, `mmmm`, `mmff` ou `mfff`.
  O maior grupo é de **3 atores**; `ingame` tem alguns clipes de dança com 4 bundles
  (2 homens + 2 mulheres), mas não é uma categoria de cena.
- `f_drum`/`m_drum` são ator + prop de tambor e **duplicam** `f/drum`/`m/drum`.
- `ingame` é uma coleção mista: `dance_1..54` para cada gênero, emotes, esportes e sociais.
- O roadmap cita **4 410 entradas** de animação no zip; a pasta `animation` — extraída e
  conferida no próprio zip — tem **4 218 bundles**. A diferença não está nesta pasta;
  provavelmente são entradas de configuração (`Config.Animations.bin`), que é cifrado.

### Convenções de nome observadas

| Categoria | Bundles por cena | Sufixos mais comuns |
| --- | ---: | --- |
| `f` / `m` | 1 | `woman@...` / `man@...` (alguns `drum@`, `guitar@`) |
| `mf` | 2 | `man@...1` + `woman@...2`; também `..._1`/`..._2`, `..._mf...` |
| `ff` | 2 | `woman@..._woman1` / `_woman2`; antigos `_1`/`_2` |
| `mm` | 2 | `man@..._man1` / `_man2`; antigos `_1`/`_2` |
| `mmf` | 3 | `_mmf1`, `_mmf2`, `_mmf3`; também `_man1_mmf`/`_man2_mmf`/`_woman_mmf` |
| `mff` | 3 | `_mff1`, `_mff2`, `_mff3`; também `_man_mff`/`_woman1_mff`/`_woman2_mff` |
| `fff` | 3 | `_fff_woman1..3`; também `_woman1..3_fff`, `_fff1..3` |
| `mmm` | 3 | `_man1..3`; também `_man1..3_mmm`, `_mmm1..3` |
| `ingame` | 1, 2 ou 4 | `man@...`, `woman@...`, `_man1/_man2`, `_woman1/_woman2` |

A numeração **não é consistente**: em `mf`, `ai_barstool_21` é a cena `ai_barstool_2`
(participante 1); em `ff`, `ai_barstool_1_woman1` é a cena `ai_barstool_1`. Sempre leia o
sufixo do participante, não o último número do nome.

## 2. Lista completa por categoria

A lista abaixo é **exatamente** o conteúdo da pasta `animation`, arquivo por arquivo. O CSV
companheiro (`inventario-animacoes-exportado.csv`) tem as mesmas linhas com tamanho em bytes/MB.

> A contagem é de **bundles**, não de cenas: um par tem 2 bundles, um trio tem 3. O export
> não traz um manifesto `cena → participantes`, e a nomenclatura é inconsistente, então este
> inventário não afirma um total de cenas. O agrupamento é a primeira tarefa do importador
> (ver §6, item 2).

### `f` — 169 bundles (332,1 MB)

**Composição:** solo feminino (1 atriz).

**Pastas (29):** `bar_chair1`, `bar_chair1_poses`, `barstool4`, `bed`, `cage_bot_1`, `cage_bot_2`, `cage_top_1`, `cage_top_2`, `chair`, `chair_g`, `djpult`, `drum`, `eames`, `glory`, `guitar`, `mattress`, `microphone`, `pillorymid`, `pillorytop`, `pillow`, `pole`, `pool`, `rocking`, `shell`, `sofa`, `sunbed`, `table`, `toilet`, `wall`

**`bar_chair1`** (4)

- `woman@barstool_sit_1`
- `woman@barstool_sit_2`
- `woman@midnight_ai_lucky_f_barstool_f_1`
- `woman@midnight_linka_f_barstool_f_1`

**`bar_chair1_poses`** (1)

- `woman@bar_chair1_poses_sit`

**`barstool4`** (1)

- `woman@barstool4_sit`

**`bed`** (51)

- `woman@ai_ahegao`
- `woman@ai_bed_f_armsokneck`
- `woman@ai_bed_f_masturbatecock`
- `woman@ai_bed_f_masturbatecockonback`
- `woman@ai_bed_f_photo1`
- `woman@ai_bed_f_photo2`
- `woman@ai_bed_f_photo3`
- `woman@ai_bed_f_photo4`
- `woman@ai_bed_f_physjerks`
- `woman@ai_bed_f_physjerks1`
- `woman@ai_bed_solo_obedience1`
- `woman@ai_bed_solo_sexy1`
- `woman@ai_bed_solo_sleep1`
- `woman@ai_bed_solo_sport1`
- `woman@ai_bed_solo_sport2`
- `woman@ai_bed_solo_stayonhand1`
- `woman@ai_cometome`
- `woman@ai_layonsand`
- `woman@ai_layonthesand`
- `woman@ai_masturbating`
- `woman@ai_n_bed_f_bondage`
- `woman@ai_n_bed_f_watch`
- `woman@ai_n_f_lickfloor`
- `woman@ai_pohoron`
- `woman@ai_sitonkort`
- `woman@ai_stratching`
- `woman@bed_6_f`
- `woman@bed_7_f`
- `woman@bed_jumping_jack`
- `woman@bed_kneel`
- `woman@bed_lie`
- `woman@bed_lie_1`
- `woman@bed_photo_f_1`
- `woman@bed_photo_f_2`
- `woman@bed_photo_f_3`
- `woman@bed_photo_f_4`
- `woman@bed_seat`
- `woman@bed_sleep`
- `woman@bed_sleep_1`
- `woman@bed_sport_1`
- `woman@bed_sport_2`
- `woman@bed_squatting`
- `woman@masturbating`
- `woman@masturbating_anal`
- `woman@masturbating_f_1`
- `woman@masturbating_f_2`
- `woman@midnight_lucky_f_bed_photo_1`
- `woman@midnight_lucky_f_bed_photo_2`
- `woman@midnight_lucky_f_bed_photo_3`
- `woman@midnight_lucky_f_bed_photo_4`
- `woman@midnight_lucky_f_bed_photo_5`

**`cage_bot_1`** (2)

- `woman@ai_cage_bot_1_1_f`
- `woman@cage_bot_1_2_f`

**`cage_bot_2`** (2)

- `woman@ai_cage_bot_2_1_f`
- `woman@ai_cage_bot_2_2_f`

**`cage_top_1`** (2)

- `woman@ai_cage_top_1_1_f`
- `woman@ai_cage_top_1_2_f`

**`cage_top_2`** (1)

- `woman@ai_cage_top_2_1_f`

**`chair`** (11)

- `woman@ai_chair_sit_shy`
- `woman@ai_chair_sit_zadumalas`
- `woman@ai_chair_solo_chair1`
- `woman@ai_chair_solo_chair2`
- `woman@ai_chairsitw`
- `woman@ai_chairspirov`
- `woman@ai_relaxsitwomanchair`
- `woman@chair_3_f`
- `woman@chair_sit_1`
- `woman@chair_sit_2`
- `woman@custom_chairsitw`

**`chair_g`** (11)

- `woman@ai_chairg_f_comf`
- `woman@ai_chairg_f_shy`
- `woman@ai_chairg_f_solo`
- `woman@ai_chairg_f_wait`
- `woman@ai_chairg_f_waiting`
- `woman@ai_chairg_sit_zadumalas`
- `woman@ai_chairsitw`
- `woman@ai_relaxsitwomanchair`
- `woman@chair_giovannetti_sit_f`
- `woman@chairg_sit_1`
- `woman@midnight_ai_lucky_f_chairg_v_1_f`

**`djpult`** (1)

- `woman@dj`

**`drum`** (2)

- `drum@drum_1_single_f`
- `woman@drum_1_single_f`

**`eames`** (7)

- `woman@ai_eames_2_f`
- `woman@ai_eames_3_f`
- `woman@ai_eames_4_f`
- `woman@ai_eames_5_f`
- `woman@ai_eames_6_f`
- `woman@eames_1`
- `woman@midnight_ai_lucky_f_eames_v_1_f`

**`glory`** (2)

- `woman@ai_glory_f_1`
- `woman@glory_f_1`

**`guitar`** (2)

- `guitar@guitar_1_single_f`
- `woman@guitar_1_single_f`

**`mattress`** (1)

- `woman@mattress_lies`

**`microphone`** (1)

- `woman@sing`

**`pillorymid`** (1)

- `woman@pillorymid_1_f`

**`pillorytop`** (1)

- `woman@pillorytop_1_f`

**`pillow`** (1)

- `woman@sit_heart`

**`pole`** (8)

- `woman@ai_rubpussypole`
- `woman@ai_upindown`
- `woman@strip1`
- `woman@strip2`
- `woman@strip3`
- `woman@strip4`
- `woman@strip5`
- `woman@strip6`

**`pool`** (12)

- `woman@ai_pool_f_sit`
- `woman@ai_pool_f_sitshy`
- `woman@ai_pool_f_wait`
- `woman@ai_pool_f_waiting`
- `woman@ai_pool_sexy1`
- `woman@ai_pool_sit_zadumalas`
- `woman@ai_pool_sitinlotos`
- `woman@ai_wallsinglesitpoolw`
- `woman@poolsit_1`
- `woman@poolsit_2`
- `woman@poolsit_3`
- `woman@poolsit_4`

**`rocking`** (1)

- `woman@rocking_1`

**`shell`** (1)

- `woman@wash_hands`

**`sofa`** (18)

- `woman@ai_layonsofa1`
- `woman@ai_layonsofa2`
- `woman@ai_sitonsofa1`
- `woman@ai_sofa_1_f`
- `woman@ai_sofa_2_f`
- `woman@ai_sofa_3_f`
- `woman@ai_sofa_4_f`
- `woman@ai_sofa_5_f`
- `woman@ai_sofa_6_f`
- `woman@ai_sofa_7_f`
- `woman@ai_sofa_sit_zadumalas`
- `woman@sofa_masturbate`
- `woman@sofa_masturbate_sh`
- `woman@sofa_photo_f_1`
- `woman@sofa_photo_f_2`
- `woman@sofa_photo_f_3`
- `woman@sofa_sit`
- `woman@sofa_sleep`

**`sunbed`** (4)

- `woman@ai_sunbed_1_f`
- `woman@ai_sunbed_2_f`
- `woman@ai_sunbed_3_f`
- `woman@sunbed_sit`

**`table`** (4)

- `woman@ai_table_1_f`
- `woman@ai_table_2_f`
- `woman@ai_table_3_f`
- `woman@ai_table_4_f`

**`toilet`** (1)

- `woman@toilet_1`

**`wall`** (15)

- `woman@ai_wall_2_single_f`
- `woman@ai_wall_3_single_f`
- `woman@ai_wall_4_single_f`
- `woman@ai_wall_5_single_f`
- `woman@ai_wall_6_single_f`
- `woman@ai_wall_f_bondage`
- `woman@ai_wall_sitinlotos`
- `woman@ai_wall_stay`
- `woman@ai_wallsinglesitw`
- `woman@midnight_lucky_f_wall_photo_1`
- `woman@wall_1_single_f`
- `woman@wall_2_single_f`
- `woman@wall_3_single_f`
- `woman@wall_4_single_f`
- `woman@wall_5_single_f`

### `f_drum` — 2 bundles (1,6 MB)

**Composição:** atriz + prop `drum` (2 bundles; duplica `f/drum`).

**Pastas (1):** `(raiz)`

**`(raiz)`** (2)

- `drum@drum_1_single_drum`
- `woman@drum_1_single_f`

### `ff` — 1078 bundles (1287,7 MB)

**Composição:** par F+F (2 atrizes).

**Pastas (19):** `bar_chair1`, `bar_chair1_poses`, `bed`, `cage_bot_1`, `cage_bot_2`, `chair`, `chair_g`, `eames`, `glory`, `pillorymid`, `pillorytop`, `pillow`, `pole`, `pool`, `rel`, `rel/wedding`, `sofa`, `table`, `wall`

**`bar_chair1`** (26)

- `woman@ai_barstool_1_woman1`
- `woman@ai_barstool_1_woman2`
- `woman@ai_barstool_2_woman1`
- `woman@ai_barstool_2_woman2`
- `woman@ai_barstool_3_woman1`
- `woman@ai_barstool_3_woman2`
- `woman@ai_barstool_4_woman1`
- `woman@ai_barstool_4_woman2`
- `woman@ai_barstool_Oral_1_woman1`
- `woman@ai_barstool_Oral_1_woman2`
- `woman@barstool_2_woman1`
- `woman@barstool_2_woman2`
- `woman@barstool_3_woman1`
- `woman@barstool_3_woman2`
- `woman@barstool_4_woman1`
- `woman@barstool_4_woman2`
- `woman@barstool_6_woman1`
- `woman@barstool_6_woman2`
- `woman@barstool_7_woman1`
- `woman@barstool_7_woman2`
- `woman@barstool_8_woman1`
- `woman@barstool_8_woman2`
- `woman@barstool_9_woman1`
- `woman@barstool_9_woman2`
- `woman@midnight_lucky_ff_barstool_f_1_1`
- `woman@midnight_lucky_ff_barstool_f_1_2`

**`bar_chair1_poses`** (2)

- `woman@barstool_1_woman1`
- `woman@barstool_1_woman2`

**`bed`** (400)

- `woman@ai_bed_1_domobedince1`
- `woman@ai_bed_1_domobedince2`
- `woman@ai_bed_47_woman1`
- `woman@ai_bed_47_woman2`
- `woman@ai_bed_48_woman1`
- `woman@ai_bed_48_woman2`
- `woman@ai_bed_49_woman1`
- `woman@ai_bed_49_woman2`
- `woman@ai_bed_50_woman1`
- `woman@ai_bed_50_woman2`
- `woman@ai_bed_51_woman1`
- `woman@ai_bed_51_woman2`
- `woman@ai_bed_52_woman1`
- `woman@ai_bed_52_woman2`
- `woman@ai_bed_53_woman1`
- `woman@ai_bed_53_woman2`
- `woman@ai_bed_54_woman1`
- `woman@ai_bed_54_woman2`
- `woman@ai_bed_55_woman1`
- `woman@ai_bed_55_woman2`
- `woman@ai_bed_56_woman1`
- `woman@ai_bed_56_woman2`
- `woman@ai_bed_57_woman1`
- `woman@ai_bed_57_woman2`
- `woman@ai_bed_58_woman1`
- `woman@ai_bed_58_woman2`
- `woman@ai_bed_59_woman1`
- `woman@ai_bed_59_woman2`
- `woman@ai_bed_60_woman1`
- `woman@ai_bed_60_woman2`
- `woman@ai_bed_61_woman1`
- `woman@ai_bed_61_woman2`
- `woman@ai_bed_62_woman1`
- `woman@ai_bed_62_woman2`
- `woman@ai_bed_63_woman1`
- `woman@ai_bed_63_woman2`
- `woman@ai_bed_64_woman1`
- `woman@ai_bed_64_woman2`
- `woman@ai_bed_65_woman1`
- `woman@ai_bed_65_woman2`
- `woman@ai_bed_66_woman1`
- `woman@ai_bed_66_woman2`
- `woman@ai_bed_67_woman1`
- `woman@ai_bed_67_woman2`
- `woman@ai_bed_68_woman1`
- `woman@ai_bed_68_woman2`
- `woman@ai_bed_69_woman1`
- `woman@ai_bed_69_woman2`
- `woman@ai_bed_70_woman1`
- `woman@ai_bed_70_woman2`
- `woman@ai_bed_analspina1`
- `woman@ai_bed_analspina2`
- `woman@ai_bed_doggy1`
- `woman@ai_bed_doggy2`
- `woman@ai_bed_ff_lickass1`
- `woman@ai_bed_ff_lickass2`
- `woman@ai_bed_ff_sleep1`
- `woman@ai_bed_ff_sleep2`
- `woman@ai_bed_ff_sweetdream1`
- `woman@ai_bed_ff_sweetdream2`
- `woman@ai_bed_ffanalspina1`
- `woman@ai_bed_ffanalspina2`
- `woman@ai_bed_fuckface1`
- `woman@ai_bed_fuckface2`
- `woman@ai_bed_minet1`
- `woman@ai_bed_minet2`
- `woman@ai_bed_stayhug1`
- `woman@ai_bed_stayhug2`
- `woman@ai_bloodsuckingff1`
- `woman@ai_bloodsuckingff2`
- `woman@ai_dom1`
- `woman@ai_dom2`
- `woman@ai_domchockff1`
- `woman@ai_domchockff2`
- `woman@ai_kamiff1`
- `woman@ai_kamiff2`
- `woman@ai_kunifirstff1`
- `woman@ai_kunifirstff2`
- `woman@ai_n_lucky_ff_bed_f_1_woman1`
- `woman@ai_n_lucky_ff_bed_f_1_woman2`
- `woman@ai_n_lucky_ff_bed_v_1_woman1`
- `woman@ai_n_lucky_ff_bed_v_1_woman2`
- `woman@ai_n_lucky_ff_bed_v_2_woman1`
- `woman@ai_n_lucky_ff_bed_v_2_woman2`
- `woman@ai_sex_bed_2_ameliafuta1`
- `woman@ai_sex_bed_2_ameliafuta2`
- `woman@ai_spankffbed1`
- `woman@ai_spankffbed2`
- `woman@bed_100_woman1`
- `woman@bed_100_woman2`
- `woman@bed_101_woman1`
- `woman@bed_101_woman2`
- `woman@bed_102_woman1`
- `woman@bed_102_woman2`
- `woman@bed_103_woman1`
- `woman@bed_103_woman2`
- `woman@bed_104_woman1`
- `woman@bed_104_woman2`
- `woman@bed_105_woman1`
- `woman@bed_105_woman2`
- `woman@bed_106_woman1`
- `woman@bed_106_woman2`
- `woman@bed_107_woman1`
- `woman@bed_107_woman2`
- `woman@bed_108_woman1`
- `woman@bed_108_woman2`
- `woman@bed_109_woman1`
- `woman@bed_109_woman2`
- `woman@bed_10_woman1`
- `woman@bed_10_woman2`
- `woman@bed_110_woman1`
- `woman@bed_110_woman2`
- `woman@bed_111_woman1`
- `woman@bed_111_woman2`
- `woman@bed_112_woman1`
- `woman@bed_112_woman2`
- `woman@bed_113_woman1`
- `woman@bed_113_woman2`
- `woman@bed_114_woman1`
- `woman@bed_114_woman2`
- `woman@bed_115_woman1`
- `woman@bed_115_woman2`
- `woman@bed_116_woman1`
- `woman@bed_116_woman2`
- `woman@bed_117_woman1`
- `woman@bed_117_woman2`
- `woman@bed_118_woman1`
- `woman@bed_118_woman2`
- `woman@bed_119_woman1`
- `woman@bed_119_woman2`
- `woman@bed_11_woman1`
- `woman@bed_11_woman2`
- `woman@bed_120_woman1`
- `woman@bed_120_woman2`
- `woman@bed_121_woman1`
- `woman@bed_121_woman2`
- `woman@bed_122_woman1`
- `woman@bed_122_woman2`
- `woman@bed_123_woman1`
- `woman@bed_123_woman2`
- `woman@bed_124_woman1`
- `woman@bed_124_woman2`
- `woman@bed_125_woman1`
- `woman@bed_125_woman2`
- `woman@bed_126_woman1`
- `woman@bed_126_woman2`
- `woman@bed_127_woman1`
- `woman@bed_127_woman2`
- `woman@bed_128_woman1`
- `woman@bed_128_woman2`
- `woman@bed_129_woman1`
- `woman@bed_129_woman2`
- `woman@bed_12_woman1`
- `woman@bed_12_woman2`
- `woman@bed_130_woman1`
- `woman@bed_130_woman2`
- `woman@bed_131_woman1`
- `woman@bed_131_woman2`
- `woman@bed_132_woman1`
- `woman@bed_132_woman2`
- `woman@bed_133_woman1`
- `woman@bed_133_woman2`
- `woman@bed_134_woman1`
- `woman@bed_134_woman2`
- `woman@bed_135_woman1`
- `woman@bed_135_woman2`
- `woman@bed_136_woman1`
- `woman@bed_136_woman2`
- `woman@bed_137_woman1`
- `woman@bed_137_woman2`
- `woman@bed_138_woman1`
- `woman@bed_138_woman2`
- `woman@bed_139_woman1`
- `woman@bed_139_woman2`
- `woman@bed_13_woman1`
- `woman@bed_13_woman2`
- `woman@bed_140_woman1`
- `woman@bed_140_woman2`
- `woman@bed_141_woman1`
- `woman@bed_141_woman2`
- `woman@bed_142_woman1`
- `woman@bed_142_woman2`
- `woman@bed_143_woman1`
- `woman@bed_143_woman2`
- `woman@bed_144_woman1`
- `woman@bed_144_woman2`
- `woman@bed_145_woman1`
- `woman@bed_145_woman2`
- `woman@bed_146_woman1`
- `woman@bed_146_woman2`
- `woman@bed_147_woman1`
- `woman@bed_147_woman2`
- `woman@bed_148_woman1`
- `woman@bed_148_woman2`
- `woman@bed_149_woman1`
- `woman@bed_149_woman2`
- `woman@bed_14_woman1`
- `woman@bed_14_woman2`
- `woman@bed_150_woman1`
- `woman@bed_150_woman2`
- `woman@bed_151_woman1`
- `woman@bed_151_woman2`
- `woman@bed_152_woman1`
- `woman@bed_152_woman2`
- `woman@bed_153_woman1`
- `woman@bed_153_woman2`
- `woman@bed_154_woman1`
- `woman@bed_154_woman2`
- `woman@bed_155_woman1`
- `woman@bed_155_woman2`
- `woman@bed_156_woman1`
- `woman@bed_156_woman2`
- `woman@bed_15_woman1`
- `woman@bed_15_woman2`
- `woman@bed_16_woman1`
- `woman@bed_16_woman2`
- `woman@bed_17_woman1`
- `woman@bed_17_woman2`
- `woman@bed_18_woman1`
- `woman@bed_18_woman2`
- `woman@bed_19_woman1`
- `woman@bed_19_woman2`
- `woman@bed_1_woman1`
- `woman@bed_1_woman2`
- `woman@bed_20_woman1`
- `woman@bed_20_woman2`
- `woman@bed_21_woman1`
- `woman@bed_21_woman2`
- `woman@bed_22_woman1`
- `woman@bed_22_woman2`
- `woman@bed_23_woman1`
- `woman@bed_23_woman2`
- `woman@bed_24_woman1`
- `woman@bed_24_woman2`
- `woman@bed_25_woman1`
- `woman@bed_25_woman2`
- `woman@bed_26_woman1`
- `woman@bed_26_woman2`
- `woman@bed_27_woman1`
- `woman@bed_27_woman2`
- `woman@bed_28_woman1`
- `woman@bed_28_woman2`
- `woman@bed_29_woman1`
- `woman@bed_29_woman2`
- `woman@bed_2_woman1`
- `woman@bed_2_woman2`
- `woman@bed_30_woman1`
- `woman@bed_30_woman2`
- `woman@bed_31_woman1`
- `woman@bed_31_woman2`
- `woman@bed_32_woman1`
- `woman@bed_32_woman2`
- `woman@bed_33_woman1`
- `woman@bed_33_woman2`
- `woman@bed_34_woman1`
- `woman@bed_34_woman2`
- `woman@bed_35_woman1`
- `woman@bed_35_woman2`
- `woman@bed_36_woman1`
- `woman@bed_36_woman2`
- `woman@bed_37_woman1`
- `woman@bed_37_woman2`
- `woman@bed_38_woman1`
- `woman@bed_38_woman2`
- `woman@bed_39_woman1`
- `woman@bed_39_woman2`
- `woman@bed_3_woman1`
- `woman@bed_3_woman2`
- `woman@bed_40_woman1`
- `woman@bed_40_woman2`
- `woman@bed_41_woman1`
- `woman@bed_41_woman2`
- `woman@bed_42_woman1`
- `woman@bed_42_woman2`
- `woman@bed_43_woman1`
- `woman@bed_43_woman2`
- `woman@bed_44_woman1`
- `woman@bed_44_woman2`
- `woman@bed_45_woman1`
- `woman@bed_45_woman2`
- `woman@bed_46_woman1`
- `woman@bed_46_woman2`
- `woman@bed_47_woman1`
- `woman@bed_47_woman2`
- `woman@bed_48_woman1`
- `woman@bed_48_woman2`
- `woman@bed_4_woman1`
- `woman@bed_4_woman2`
- `woman@bed_5_woman1`
- `woman@bed_5_woman2`
- `woman@bed_68_woman1`
- `woman@bed_68_woman2`
- `woman@bed_6_woman1`
- `woman@bed_6_woman2`
- `woman@bed_72_woman1`
- `woman@bed_72_woman2`
- `woman@bed_73_woman1`
- `woman@bed_73_woman2`
- `woman@bed_74_woman1`
- `woman@bed_74_woman2`
- `woman@bed_75_woman1`
- `woman@bed_75_woman2`
- `woman@bed_76_woman1`
- `woman@bed_76_woman2`
- `woman@bed_77_woman1`
- `woman@bed_77_woman2`
- `woman@bed_78_woman1`
- `woman@bed_78_woman2`
- `woman@bed_79_woman1`
- `woman@bed_79_woman2`
- `woman@bed_7_woman1`
- `woman@bed_7_woman2`
- `woman@bed_80_woman1`
- `woman@bed_80_woman2`
- `woman@bed_81_woman1`
- `woman@bed_81_woman2`
- `woman@bed_82_woman1`
- `woman@bed_82_woman2`
- `woman@bed_83_woman1`
- `woman@bed_83_woman2`
- `woman@bed_84_woman1`
- `woman@bed_84_woman2`
- `woman@bed_85_woman1`
- `woman@bed_85_woman2`
- `woman@bed_86_woman1`
- `woman@bed_86_woman2`
- `woman@bed_87_woman1`
- `woman@bed_87_woman2`
- `woman@bed_88_woman1`
- `woman@bed_88_woman2`
- `woman@bed_89_woman1`
- `woman@bed_89_woman2`
- `woman@bed_8_woman1`
- `woman@bed_8_woman2`
- `woman@bed_90_woman1`
- `woman@bed_90_woman2`
- `woman@bed_91_woman1`
- `woman@bed_91_woman2`
- `woman@bed_92_woman1`
- `woman@bed_92_woman2`
- `woman@bed_93_woman1`
- `woman@bed_93_woman2`
- `woman@bed_94_woman1`
- `woman@bed_94_woman2`
- `woman@bed_95_woman1`
- `woman@bed_95_woman2`
- `woman@bed_96_woman1`
- `woman@bed_96_woman2`
- `woman@bed_97_woman1`
- `woman@bed_97_woman2`
- `woman@bed_98_woman1`
- `woman@bed_98_woman2`
- `woman@bed_99_woman1`
- `woman@bed_99_woman2`
- `woman@bed_9_woman1`
- `woman@bed_9_woman2`
- `woman@custom_bed81`
- `woman@custom_bed82`
- `woman@custom_bed_1_woman1`
- `woman@custom_bed_1_woman2`
- `woman@custom_bed_2_woman1`
- `woman@custom_bed_2_woman2`
- `woman@custom_cumshot_foot1`
- `woman@custom_cumshot_foot2`
- `woman@midnight_ai_lucky_ff_bed_cum_1_f1`
- `woman@midnight_ai_lucky_ff_bed_cum_1_f2`
- `woman@midnight_ai_n_lucky_ff_bed_f_2_f1`
- `woman@midnight_ai_n_lucky_ff_bed_f_2_f2`
- `woman@midnight_ai_n_lucky_ff_bed_v_3_f1`
- `woman@midnight_ai_n_lucky_ff_bed_v_3_f2`
- `woman@midnight_ff_bed_f_10_1`
- `woman@midnight_ff_bed_f_10_2`
- `woman@midnight_lucky_ff_bed_a_1_1`
- `woman@midnight_lucky_ff_bed_a_1_2`
- `woman@midnight_lucky_ff_bed_a_2_1`
- `woman@midnight_lucky_ff_bed_a_2_2`
- `woman@midnight_lucky_ff_bed_cum_2_f1`
- `woman@midnight_lucky_ff_bed_cum_2_f2`
- `woman@midnight_lucky_ff_bed_cum_3_1`
- `woman@midnight_lucky_ff_bed_cum_3_2`
- `woman@midnight_lucky_ff_bed_f_3_1`
- `woman@midnight_lucky_ff_bed_f_3_2`
- `woman@midnight_lucky_ff_bed_f_4_1`
- `woman@midnight_lucky_ff_bed_f_4_2`
- `woman@midnight_lucky_ff_bed_o_1_1`
- `woman@midnight_lucky_ff_bed_o_1_2`
- `woman@midnight_lucky_ff_bed_o_2_1`
- `woman@midnight_lucky_ff_bed_o_2_2`
- `woman@midnight_lucky_ff_bed_o_3_1`
- `woman@midnight_lucky_ff_bed_o_3_2`
- `woman@midnight_lucky_ff_bed_v_4_1`
- `woman@midnight_lucky_ff_bed_v_4_2`
- `woman@midnight_lucky_ff_bed_v_5_1`
- `woman@midnight_lucky_ff_bed_v_5_2`
- `woman@midnight_lucky_ff_bed_v_6_1`
- `woman@midnight_lucky_ff_bed_v_6_2`
- `woman@midnight_lucky_ff_bed_v_7_1`
- `woman@midnight_lucky_ff_bed_v_7_2`
- `woman@midnight_lucky_ff_bed_v_8_1`
- `woman@midnight_lucky_ff_bed_v_8_2`

**`cage_bot_1`** (16)

- `woman@ai_cage_bot_1_1_woman1`
- `woman@ai_cage_bot_1_1_woman2`
- `woman@ai_cage_bot_1_2_woman1`
- `woman@ai_cage_bot_1_2_woman2`
- `woman@cage_bot_1_3_woman1`
- `woman@cage_bot_1_3_woman2`
- `woman@cage_bot_1_4_woman1`
- `woman@cage_bot_1_4_woman2`
- `woman@cage_bot_1_5_woman1`
- `woman@cage_bot_1_5_woman2`
- `woman@cage_bot_1_6_woman1`
- `woman@cage_bot_1_6_woman2`
- `woman@cage_bot_1_7_woman1`
- `woman@cage_bot_1_7_woman2`
- `woman@cage_bot_1_8_woman1`
- `woman@cage_bot_1_8_woman2`

**`cage_bot_2`** (6)

- `woman@ai_cage_bot_2_1_woman1`
- `woman@ai_cage_bot_2_1_woman2`
- `woman@ai_cage_bot_2_2_woman1`
- `woman@ai_cage_bot_2_2_woman2`
- `woman@ai_cage_bot_2_3_woman1`
- `woman@ai_cage_bot_2_3_woman2`

**`chair`** (54)

- `woman@ai_chair_4_woman1`
- `woman@ai_chair_4_woman2`
- `woman@ai_chair_5_woman1`
- `woman@ai_chair_5_woman2`
- `woman@ai_chair_6_woman1`
- `woman@ai_chair_6_woman2`
- `woman@ai_chair_7_woman1`
- `woman@ai_chair_7_woman2`
- `woman@ai_chair_ffsitonknees1`
- `woman@ai_chair_ffsitonknees2`
- `woman@ai_chair_suckfing1`
- `woman@ai_chair_suckfing2`
- `woman@chair_10_woman1`
- `woman@chair_10_woman2`
- `woman@chair_11_woman1`
- `woman@chair_11_woman2`
- `woman@chair_12_woman1`
- `woman@chair_12_woman2`
- `woman@chair_13_woman1`
- `woman@chair_13_woman2`
- `woman@chair_14_woman1`
- `woman@chair_14_woman2`
- `woman@chair_15_woman1`
- `woman@chair_15_woman2`
- `woman@chair_16_woman1`
- `woman@chair_16_woman2`
- `woman@chair_17_woman1`
- `woman@chair_17_woman2`
- `woman@chair_18_woman1`
- `woman@chair_18_woman2`
- `woman@chair_19_woman1`
- `woman@chair_19_woman2`
- `woman@chair_1_woman1`
- `woman@chair_1_woman2`
- `woman@chair_20_woman1`
- `woman@chair_20_woman2`
- `woman@chair_2_woman1`
- `woman@chair_2_woman2`
- `woman@chair_3_woman1`
- `woman@chair_3_woman2`
- `woman@chair_7_woman1`
- `woman@chair_7_woman2`
- `woman@chair_8_woman1`
- `woman@chair_8_woman2`
- `woman@chair_9_woman1`
- `woman@chair_9_woman2`
- `woman@midnight_lucky_ff_chair_cum_1_1`
- `woman@midnight_lucky_ff_chair_cum_1_2`
- `woman@midnight_lucky_ff_chair_o_1_1`
- `woman@midnight_lucky_ff_chair_o_1_2`
- `woman@pool_10_woman2`
- `woman@pool_11_woman2`
- `woman@pool_13_woman2`
- `woman@pool_8_woman2`

**`chair_g`** (32)

- `woman@ai_chair_g_2_woman1`
- `woman@ai_chair_g_2_woman2`
- `woman@ai_chair_g_ff_legsonback1`
- `woman@ai_chair_g_ff_legsonback2`
- `woman@ai_chairgfapww1`
- `woman@ai_chairgfapww2`
- `woman@ai_chairgfapwwf1`
- `woman@ai_chairgfapwwf2`
- `woman@ai_kuni1`
- `woman@ai_kuni2`
- `woman@chair_g_1_woman1`
- `woman@chair_g_1_woman2`
- `woman@chair_g_2_woman1`
- `woman@chair_g_2_woman2`
- `woman@chair_G_3_woman1`
- `woman@chair_G_3_woman2`
- `woman@chair_g_4_woman1`
- `woman@chair_g_4_woman2`
- `woman@chair_g_5_woman1`
- `woman@chair_g_5_woman2`
- `woman@chair_g_6_woman1`
- `woman@chair_g_6_woman2`
- `woman@chair_g_7_woman1`
- `woman@chair_g_7_woman2`
- `woman@midnight_ai_lucky_ff_chairg_o_2_f1`
- `woman@midnight_ai_lucky_ff_chairg_o_2_f2`
- `woman@midnight_ai_lucky_ff_chairg_v_1_f1`
- `woman@midnight_ai_lucky_ff_chairg_v_1_f2`
- `woman@midnight_ai_n_lucky_ff_chairg_o_1_f1`
- `woman@midnight_ai_n_lucky_ff_chairg_o_1_f2`
- `woman@midnight_lucky_ff_chairg_cum_1_1`
- `woman@midnight_lucky_ff_chairg_cum_1_2`

**`eames`** (24)

- `woman@eames_1_woman1`
- `woman@eames_1_woman2`
- `woman@eames_2_woman1`
- `woman@eames_2_woman2`
- `woman@eames_3_woman1`
- `woman@eames_3_woman2`
- `woman@eames_5_woman1`
- `woman@eames_5_woman2`
- `woman@eames_6_woman1`
- `woman@eames_6_woman2`
- `woman@midnight_ai_lucky_ff_eames_o_1_f1`
- `woman@midnight_ai_lucky_ff_eames_o_1_f2`
- `woman@midnight_ai_n_lucky_ff_eames_v_1_f1`
- `woman@midnight_ai_n_lucky_ff_eames_v_1_f2`
- `woman@midnight_lucky_ff_eames_a_1_1`
- `woman@midnight_lucky_ff_eames_a_1_2`
- `woman@midnight_lucky_ff_eames_a_2_1`
- `woman@midnight_lucky_ff_eames_a_2_2`
- `woman@midnight_lucky_ff_eames_cum_1_1`
- `woman@midnight_lucky_ff_eames_cum_1_2`
- `woman@midnight_lucky_ff_eames_v_2_1`
- `woman@midnight_lucky_ff_eames_v_2_2`
- `woman@midnight_lucky_ff_eames_v_3_1`
- `woman@midnight_lucky_ff_eames_v_3_2`

**`glory`** (18)

- `woman@ai_glory_1_woman1`
- `woman@ai_glory_1_woman2`
- `woman@ai_glory_2_woman1`
- `woman@ai_glory_2_woman2`
- `woman@ai_glory_3_woman1`
- `woman@ai_glory_3_woman2`
- `woman@ai_glory_4_woman1`
- `woman@ai_glory_4_woman2`
- `woman@glory_1_woman1`
- `woman@glory_1_woman2`
- `woman@glory_2_woman1`
- `woman@glory_2_woman2`
- `woman@glory_3_woman1`
- `woman@glory_3_woman2`
- `woman@glory_4_woman1`
- `woman@glory_4_woman2`
- `woman@glory_5_woman1`
- `woman@glory_5_woman2`

**`pillorymid`** (8)

- `woman@pillorymid_1_woman1`
- `woman@pillorymid_1_woman2`
- `woman@pillorymid_2_woman1`
- `woman@pillorymid_2_woman2`
- `woman@pillorymid_3_woman1`
- `woman@pillorymid_3_woman2`
- `woman@pillorymid_4_woman1`
- `woman@pillorymid_4_woman2`

**`pillorytop`** (14)

- `woman@pillorytop_1_woman1`
- `woman@pillorytop_1_woman2`
- `woman@pillorytop_2_woman1`
- `woman@pillorytop_2_woman2`
- `woman@pillorytop_3_woman1`
- `woman@pillorytop_3_woman2`
- `woman@PilloryTop_4_woman1`
- `woman@PilloryTop_4_woman2`
- `woman@PilloryTop_5_woman1`
- `woman@PilloryTop_5_woman2`
- `woman@pillorytop_6_woman1`
- `woman@pillorytop_6_woman2`
- `woman@pillorytop_7_woman1`
- `woman@pillorytop_7_woman2`

**`pillow`** (30)

- `woman@ai_pillow_2_woman1`
- `woman@ai_pillow_2_woman2`
- `woman@ai_pillow_3_woman1`
- `woman@ai_pillow_3_woman2`
- `woman@midnight_lucky_ff_pillow_a_1_1`
- `woman@midnight_lucky_ff_pillow_a_1_2`
- `woman@midnight_lucky_ff_pillow_cum_1_1`
- `woman@midnight_lucky_ff_pillow_cum_1_2`
- `woman@midnight_lucky_ff_pillow_v_1_1`
- `woman@midnight_lucky_ff_pillow_v_1_2`
- `woman@pillow_10_woman1`
- `woman@pillow_10_woman2`
- `woman@pillow_11_woman1`
- `woman@pillow_11_woman2`
- `woman@pillow_12_woman1`
- `woman@pillow_12_woman2`
- `woman@pillow_1_woman1`
- `woman@pillow_1_woman2`
- `woman@pillow_4_woman1`
- `woman@pillow_4_woman2`
- `woman@pillow_5_woman1`
- `woman@pillow_5_woman2`
- `woman@pillow_6_woman1`
- `woman@pillow_6_woman2`
- `woman@pillow_7_woman1`
- `woman@pillow_7_woman2`
- `woman@pillow_8_woman1`
- `woman@pillow_8_woman2`
- `woman@pillow_9_woman1`
- `woman@pillow_9_woman2`

**`pole`** (14)

- `woman@pole1_woman1`
- `woman@pole1_woman2`
- `woman@pole2_woman1`
- `woman@pole2_woman2`
- `woman@pole3_woman1`
- `woman@pole3_woman2`
- `woman@pole_4_woman1`
- `woman@pole_4_woman2`
- `woman@pole_5_woman1`
- `woman@pole_5_woman2`
- `woman@pole_6_woman1`
- `woman@pole_6_woman2`
- `woman@pole_7_woman1`
- `woman@pole_7_woman2`

**`pool`** (52)

- `woman@ai_n_lucky_ff_pool_o_1_woman1`
- `woman@ai_n_lucky_ff_pool_o_1_woman2`
- `woman@ai_pool_6_woman1`
- `woman@ai_pool_6_woman2`
- `woman@ai_pool_7_woman1`
- `woman@ai_pool_7_woman2`
- `woman@ai_pool_8_woman1`
- `woman@ai_pool_8_woman2`
- `woman@midnight_lucky_ff_pool_f_1_f1`
- `woman@midnight_lucky_ff_pool_f_1_f2`
- `woman@midnight_lucky_ff_pool_v_1_1`
- `woman@midnight_lucky_ff_pool_v_1_2`
- `woman@pool_10_woman1`
- `woman@pool_10_woman2`
- `woman@pool_11_woman1`
- `woman@pool_11_woman2`
- `woman@pool_12_woman1`
- `woman@pool_12_woman2`
- `woman@pool_13_woman1`
- `woman@pool_13_woman2`
- `woman@pool_14_woman1`
- `woman@pool_14_woman2`
- `woman@pool_15_woman1`
- `woman@pool_15_woman2`
- `woman@pool_16_woman1`
- `woman@pool_16_woman2`
- `woman@pool_17_woman1`
- `woman@pool_17_woman2`
- `woman@pool_18_woman1`
- `woman@pool_18_woman2`
- `woman@pool_19_woman1`
- `woman@pool_19_woman2`
- `woman@pool_1_woman1`
- `woman@pool_1_woman2`
- `woman@pool_20_woman1`
- `woman@pool_20_woman2`
- `woman@pool_21_woman1`
- `woman@pool_21_woman2`
- `woman@pool_22_woman1`
- `woman@pool_22_woman2`
- `woman@pool_23_woman1`
- `woman@pool_23_woman2`
- `woman@pool_2_woman1`
- `woman@pool_2_woman2`
- `woman@pool_3_woman1`
- `woman@pool_3_woman2`
- `woman@pool_4_woman1`
- `woman@pool_4_woman2`
- `woman@pool_5_woman1`
- `woman@pool_5_woman2`
- `woman@pool_9_woman1`
- `woman@pool_9_woman2`

**`rel`** (8)

- `woman@cuddle_woman1`
- `woman@cuddle_woman2`
- `woman@slowdance_invert_woman1`
- `woman@slowdance_invert_woman2`
- `woman@slowdance_kiss_woman1`
- `woman@slowdance_kiss_woman2`
- `woman@slowdance_woman1`
- `woman@slowdance_woman2`

**`rel/wedding`** (10)

- `woman@phase1_woman1`
- `woman@phase1_woman2`
- `woman@phase2_wait_woman1`
- `woman@phase2_wait_woman2`
- `woman@phase3_agree_woman1`
- `woman@phase3_agree_woman2`
- `woman@phase3_disagree_woman1`
- `woman@phase3_disagree_woman2`
- `woman@phase4_agree_loop_woman1`
- `woman@phase4_agree_loop_woman2`

**`sofa`** (210)

- `ai_n_sofa_ff_mutualmast1` — sem prefixo `ator@`; o nome inteiro é o clipe
- `ai_n_sofa_ff_mutualmast2` — sem prefixo `ator@`; o nome inteiro é o clipe
- `woman@ai_fapww1`
- `woman@ai_fapww2`
- `woman@ai_layonlegff1`
- `woman@ai_layonlegff2`
- `woman@ai_n_sofa_ff_mutualmast1`
- `woman@ai_n_sofa_ff_mutualmast2`
- `woman@ai_sofa_13_woman1`
- `woman@ai_sofa_13_woman2`
- `woman@ai_sofa_14_woman1`
- `woman@ai_sofa_14_woman2`
- `woman@ai_sofa_15_woman1`
- `woman@ai_sofa_15_woman2`
- `woman@ai_sofa_16_woman1`
- `woman@ai_sofa_16_woman2`
- `woman@ai_sofa_17_woman1`
- `woman@ai_sofa_17_woman2`
- `woman@ai_sofa_18_woman1`
- `woman@ai_sofa_18_woman2`
- `woman@ai_sofa_19_woman1`
- `woman@ai_sofa_19_woman2`
- `woman@ai_sofa_20_woman1`
- `woman@ai_sofa_20_woman2`
- `woman@ai_sofa_21_woman1`
- `woman@ai_sofa_21_woman2`
- `woman@ai_sofa_22_woman1`
- `woman@ai_sofa_22_woman2`
- `woman@ai_sofa_23_woman1`
- `woman@ai_sofa_23_woman2`
- `woman@ai_sofa_24_woman1`
- `woman@ai_sofa_24_woman2`
- `woman@ai_sofa_25_woman1`
- `woman@ai_sofa_25_woman2`
- `woman@ai_sofa_26_woman1`
- `woman@ai_sofa_26_woman2`
- `woman@ai_sofa_27_woman1`
- `woman@ai_sofa_27_woman2`
- `woman@ai_sofa_28_woman1`
- `woman@ai_sofa_28_woman2`
- `woman@ai_sofa_ff_legsonback1`
- `woman@ai_sofa_ff_legsonback2`
- `woman@ai_sofakuniw1`
- `woman@ai_sofakuniw2`
- `woman@ai_spankffsofa1`
- `woman@ai_spankffsofa2`
- `woman@ai_ssofasleep1`
- `woman@ai_ssofasleep2`
- `woman@midnight_ai_n_lucky_ff_sofa_o_1_f1`
- `woman@midnight_ai_n_lucky_ff_sofa_o_1_f2`
- `woman@midnight_lucky_ff_sofa_f_1_f1`
- `woman@midnight_lucky_ff_sofa_f_1_f2`
- `woman@midnight_lucky_ff_sofa_fet_1_1`
- `woman@midnight_lucky_ff_sofa_fet_1_2`
- `woman@midnight_lucky_ff_sofa_fet_2_1`
- `woman@midnight_lucky_ff_sofa_fet_2_2`
- `woman@sofa_10_woman1`
- `woman@sofa_10_woman2`
- `woman@sofa_11_woman1`
- `woman@sofa_11_woman2`
- `woman@sofa_12_woman1`
- `woman@sofa_12_woman2`
- `woman@sofa_13_woman1`
- `woman@sofa_13_woman2`
- `woman@sofa_14_woman1`
- `woman@sofa_14_woman2`
- `woman@sofa_15_woman1`
- `woman@sofa_15_woman2`
- `woman@sofa_1_woman1`
- `woman@sofa_1_woman2`
- `woman@sofa_24_woman1`
- `woman@sofa_24_woman2`
- `woman@sofa_29_woman1`
- `woman@sofa_29_woman2`
- `woman@sofa_2_woman1`
- `woman@sofa_2_woman2`
- `woman@sofa_30_woman1`
- `woman@sofa_30_woman2`
- `woman@sofa_31_woman1`
- `woman@sofa_31_woman2`
- `woman@sofa_32_woman1`
- `woman@sofa_32_woman2`
- `woman@sofa_33_woman1`
- `woman@sofa_33_woman2`
- `woman@sofa_34_woman1`
- `woman@sofa_34_woman2`
- `woman@sofa_35_woman1`
- `woman@sofa_35_woman2`
- `woman@sofa_36_woman1`
- `woman@sofa_36_woman2`
- `woman@sofa_37_woman1`
- `woman@sofa_37_woman2`
- `woman@sofa_38_woman1`
- `woman@sofa_38_woman2`
- `woman@sofa_39_woman1`
- `woman@sofa_39_woman2`
- `woman@sofa_3_woman1`
- `woman@sofa_3_woman2`
- `woman@sofa_40_woman1`
- `woman@sofa_40_woman2`
- `woman@sofa_41_woman1`
- `woman@sofa_41_woman2`
- `woman@sofa_42_woman1`
- `woman@sofa_42_woman2`
- `woman@sofa_43_woman1`
- `woman@sofa_43_woman2`
- `woman@sofa_44_woman1`
- `woman@sofa_44_woman2`
- `woman@sofa_45_woman1`
- `woman@sofa_45_woman2`
- `woman@sofa_46_woman1`
- `woman@sofa_46_woman2`
- `woman@sofa_47_woman1`
- `woman@sofa_47_woman2`
- `woman@sofa_48_woman1`
- `woman@sofa_48_woman2`
- `woman@sofa_49_woman1`
- `woman@sofa_49_woman2`
- `woman@sofa_4_woman1`
- `woman@sofa_4_woman2`
- `woman@sofa_50_woman1`
- `woman@sofa_50_woman2`
- `woman@sofa_51_woman1`
- `woman@sofa_51_woman2`
- `woman@sofa_52_woman1`
- `woman@sofa_52_woman2`
- `woman@sofa_53_woman1`
- `woman@sofa_53_woman2`
- `woman@sofa_54_woman1`
- `woman@sofa_54_woman2`
- `woman@sofa_55_woman1`
- `woman@sofa_55_woman2`
- `woman@sofa_56_woman1`
- `woman@sofa_56_woman2`
- `woman@sofa_57_woman1`
- `woman@sofa_57_woman2`
- `woman@sofa_58_woman1`
- `woman@sofa_58_woman2`
- `woman@sofa_59_woman1`
- `woman@sofa_59_woman2`
- `woman@sofa_5_woman1`
- `woman@sofa_5_woman2`
- `woman@sofa_60_woman1`
- `woman@sofa_60_woman2`
- `woman@sofa_61_woman1`
- `woman@sofa_61_woman2`
- `woman@sofa_62_woman1`
- `woman@sofa_62_woman2`
- `woman@sofa_63_woman1`
- `woman@sofa_63_woman2`
- `woman@sofa_64_woman1`
- `woman@sofa_64_woman2`
- `woman@sofa_65_woman1`
- `woman@sofa_65_woman2`
- `woman@sofa_66_woman1`
- `woman@sofa_66_woman2`
- `woman@sofa_67_woman1`
- `woman@sofa_67_woman2`
- `woman@sofa_68_woman1`
- `woman@sofa_68_woman2`
- `woman@sofa_69_woman1`
- `woman@sofa_69_woman2`
- `woman@sofa_6_woman1`
- `woman@sofa_6_woman2`
- `woman@sofa_70_woman1`
- `woman@sofa_70_woman2`
- `woman@sofa_71_woman1`
- `woman@sofa_71_woman2`
- `woman@sofa_72_woman1`
- `woman@sofa_72_woman2`
- `woman@sofa_73_woman1`
- `woman@sofa_73_woman2`
- `woman@sofa_74_woman1`
- `woman@sofa_74_woman2`
- `woman@sofa_75_woman1`
- `woman@sofa_75_woman2`
- `woman@sofa_76_woman1`
- `woman@sofa_76_woman2`
- `woman@sofa_77_woman1`
- `woman@sofa_77_woman2`
- `woman@sofa_78_woman1`
- `woman@sofa_78_woman2`
- `woman@sofa_79_woman1`
- `woman@sofa_79_woman2`
- `woman@sofa_7_woman1`
- `woman@sofa_7_woman2`
- `woman@sofa_80_woman1`
- `woman@sofa_80_woman2`
- `woman@sofa_81_woman1`
- `woman@sofa_81_woman2`
- `woman@sofa_82_woman1`
- `woman@sofa_82_woman2`
- `woman@sofa_83_woman1`
- `woman@sofa_83_woman2`
- `woman@sofa_84_woman1`
- `woman@sofa_84_woman2`
- `woman@sofa_85_woman1`
- `woman@sofa_85_woman2`
- `woman@sofa_86_woman1`
- `woman@sofa_86_woman2`
- `woman@sofa_87_woman1`
- `woman@sofa_87_woman2`
- `woman@sofa_88_woman1`
- `woman@sofa_88_woman2`
- `woman@sofa_89_woman1`
- `woman@sofa_89_woman2`
- `woman@sofa_8_woman1`
- `woman@sofa_8_woman2`
- `woman@sofa_9_woman1`
- `woman@sofa_9_woman2`

**`table`** (78)

- `woman@ai_table_10_woman1`
- `woman@ai_table_10_woman2`
- `woman@ai_table_11_woman1`
- `woman@ai_table_11_woman2`
- `woman@ai_table_12_woman1`
- `woman@ai_table_12_woman2`
- `woman@ai_table_13_woman1`
- `woman@ai_table_13_woman2`
- `woman@ai_table_14_woman1`
- `woman@ai_table_14_woman2`
- `woman@ai_table_15_woman1`
- `woman@ai_table_15_woman2`
- `woman@ai_table_16_woman1`
- `woman@ai_table_16_woman2`
- `woman@ai_table_17_woman1`
- `woman@ai_table_17_woman2`
- `woman@ai_table_18_woman1`
- `woman@ai_table_18_woman2`
- `woman@ai_table_1_woman1`
- `woman@ai_table_1_woman2`
- `woman@ai_table_2_woman1`
- `woman@ai_table_2_woman2`
- `woman@ai_table_3_woman1`
- `woman@ai_table_3_woman2`
- `woman@ai_table_4_woman1`
- `woman@ai_table_4_woman2`
- `woman@ai_table_5_woman1`
- `woman@ai_table_5_woman2`
- `woman@ai_table_6_woman1`
- `woman@ai_table_6_woman2`
- `woman@ai_table_7_woman1`
- `woman@ai_table_7_woman2`
- `woman@ai_table_8_woman1`
- `woman@ai_table_8_woman2`
- `woman@ai_table_9_woman1`
- `woman@ai_table_9_woman2`
- `woman@midnight_lucky_ff_table_v_1_1`
- `woman@midnight_lucky_ff_table_v_1_2`
- `woman@table_10_woman1`
- `woman@table_10_woman2`
- `woman@table_17_woman1`
- `woman@table_17_woman2`
- `woman@table_18_woman1`
- `woman@table_18_woman2`
- `woman@table_19_woman1`
- `woman@table_19_woman2`
- `woman@table_20_woman1`
- `woman@table_20_woman2`
- `woman@table_21_woman1`
- `woman@table_21_woman2`
- `woman@table_22_woman1`
- `woman@table_22_woman2`
- `woman@table_23_woman1`
- `woman@table_23_woman2`
- `woman@table_24_woman1`
- `woman@table_24_woman2`
- `woman@table_25_woman1`
- `woman@table_25_woman2`
- `woman@table_26_woman1`
- `woman@table_26_woman2`
- `woman@table_27_woman1`
- `woman@table_27_woman2`
- `woman@table_28_woman1`
- `woman@table_28_woman2`
- `woman@table_29_woman1`
- `woman@table_29_woman2`
- `woman@table_30_woman1`
- `woman@table_30_woman2`
- `woman@table_31_woman1`
- `woman@table_31_woman2`
- `woman@table_32_woman1`
- `woman@table_32_woman2`
- `woman@table_33_woman1`
- `woman@table_33_woman2`
- `woman@table_34_woman1`
- `woman@table_34_woman2`
- `woman@table_35_woman1`
- `woman@table_35_woman2`

**`wall`** (76)

- `woman@ai_n_lucky_ff_wall_v_1_woman1`
- `woman@ai_n_lucky_ff_wall_v_1_woman2`
- `woman@ai_wall_10_woman1`
- `woman@ai_wall_10_woman2`
- `woman@ai_wall_11_woman1`
- `woman@ai_wall_11_woman2`
- `woman@ai_wall_12_woman1`
- `woman@ai_wall_12_woman2`
- `woman@ai_wall_5_woman1`
- `woman@ai_wall_5_woman2`
- `woman@ai_wall_6_woman1`
- `woman@ai_wall_6_woman2`
- `woman@ai_wall_7_woman1`
- `woman@ai_wall_7_woman2`
- `woman@ai_wall_8_woman1`
- `woman@ai_wall_8_woman2`
- `woman@ai_wall_9_woman1`
- `woman@ai_wall_9_woman2`
- `woman@ai_wall_ff_lickpussy1`
- `woman@ai_wall_ff_lickpussy2`
- `woman@ai_wall_ff_pussyfap1`
- `woman@ai_wall_ff_pussyfap2`
- `woman@midnight_lucky_ff_wall_o_1_f1`
- `woman@midnight_lucky_ff_wall_o_1_f2`
- `woman@midnight_lucky_ff_wall_v_1_woman1`
- `woman@midnight_lucky_ff_wall_v_1_woman2`
- `woman@midnight_lucky_ff_wall_v_2_f1`
- `woman@midnight_lucky_ff_wall_v_2_f2`
- `woman@midnight_lucky_ff_wall_v_3_f1`
- `woman@midnight_lucky_ff_wall_v_3_f2`
- `woman@wall_11_woman1`
- `woman@wall_11_woman2`
- `woman@wall_12_woman1`
- `woman@wall_12_woman2`
- `woman@wall_13_woman1`
- `woman@wall_13_woman2`
- `woman@wall_14_woman1`
- `woman@wall_14_woman2`
- `woman@wall_15_woman1`
- `woman@wall_15_woman2`
- `woman@wall_16_woman1`
- `woman@wall_16_woman2`
- `woman@wall_17_woman1`
- `woman@wall_17_woman2`
- `woman@wall_18_woman1`
- `woman@wall_18_woman2`
- `woman@wall_19_woman1`
- `woman@wall_19_woman2`
- `woman@wall_1_woman1`
- `woman@wall_1_woman2`
- `woman@wall_20_woman1`
- `woman@wall_20_woman2`
- `woman@wall_21_woman1`
- `woman@wall_21_woman2`
- `woman@wall_22_woman1`
- `woman@wall_22_woman2`
- `woman@wall_23_woman1`
- `woman@wall_23_woman2`
- `woman@wall_24_woman1`
- `woman@wall_24_woman2`
- `woman@wall_25_woman1`
- `woman@wall_25_woman2`
- `woman@wall_26_woman1`
- `woman@wall_26_woman2`
- `woman@wall_2_woman1`
- `woman@wall_2_woman2`
- `woman@wall_3_woman1`
- `woman@wall_3_woman2`
- `woman@wall_4_woman1`
- `woman@wall_4_woman2`
- `woman@wall_5_woman1`
- `woman@wall_5_woman2`
- `woman@wall_6_woman1`
- `woman@wall_6_woman2`
- `woman@wall_7_woman1`
- `woman@wall_7_woman2`

### `fff` — 186 bundles (174,2 MB)

**Composição:** trio F+F+F (3 atrizes).

**Pastas (14):** `bed`, `bed/bed_1`, `bed/bed_2`, `bed/bed_3`, `bed/bed_4`, `bed/bed_5`, `bed/bed_6`, `bed_1`, `chair_G`, `pillorymid`, `pillorytop`, `pool`, `sofa`, `table`

**`bed`** (66)

- `woman@ai_bed_10_fff_woman1`
- `woman@ai_bed_10_fff_woman2`
- `woman@ai_bed_10_fff_woman3`
- `woman@ai_bed_1_fff_woman1`
- `woman@ai_bed_1_fff_woman2`
- `woman@ai_bed_1_fff_woman3`
- `woman@ai_bed_2_fff_woman1`
- `woman@ai_bed_2_fff_woman2`
- `woman@ai_bed_2_fff_woman3`
- `woman@ai_bed_3_fff_woman1`
- `woman@ai_bed_3_fff_woman2`
- `woman@ai_bed_3_fff_woman3`
- `woman@ai_bed_4_fff_woman1`
- `woman@ai_bed_4_fff_woman2`
- `woman@ai_bed_4_fff_woman3`
- `woman@ai_bed_5_fff_woman1`
- `woman@ai_bed_5_fff_woman2`
- `woman@ai_bed_5_fff_woman3`
- `woman@ai_bed_6_fff_woman1`
- `woman@ai_bed_6_fff_woman2`
- `woman@ai_bed_6_fff_woman3`
- `woman@ai_bed_7_fff_woman1`
- `woman@ai_bed_7_fff_woman2`
- `woman@ai_bed_7_fff_woman3`
- `woman@ai_bed_8_fff_woman1`
- `woman@ai_bed_8_fff_woman2`
- `woman@ai_bed_8_fff_woman3`
- `woman@ai_bed_9_fff_woman1`
- `woman@ai_bed_9_fff_woman2`
- `woman@ai_bed_9_fff_woman3`
- `woman@ai_bed_fff_fuckfacecuni1`
- `woman@ai_bed_fff_fuckfacecuni2`
- `woman@ai_bed_fff_fuckfacecuni3`
- `woman@ai_bed_fff_triosleep1`
- `woman@ai_bed_fff_triosleep2`
- `woman@ai_bed_fff_triosleep3`
- `woman@ai_bed_staytriohug1`
- `woman@ai_bed_staytriohug2`
- `woman@ai_bed_staytriohug3`
- `woman@bed_10_fff_woman1`
- `woman@bed_10_fff_woman2`
- `woman@bed_10_fff_woman3`
- `woman@bed_11_fff_woman1`
- `woman@bed_11_fff_woman2`
- `woman@bed_11_fff_woman3`
- `woman@bed_12_fff_woman1`
- `woman@bed_12_fff_woman2`
- `woman@bed_12_fff_woman3`
- `woman@bed_13_fff_woman1`
- `woman@bed_13_fff_woman2`
- `woman@bed_13_fff_woman3`
- `woman@bed_14_woman1_fff`
- `woman@bed_14_woman2_fff`
- `woman@bed_14_woman3_fff`
- `woman@bed_15_woman1_fff`
- `woman@bed_15_woman2_fff`
- `woman@bed_15_woman3_fff`
- `woman@bed_16_woman1_fff`
- `woman@bed_16_woman2_fff`
- `woman@bed_16_woman3_fff`
- `woman@bed_17_woman1_fff`
- `woman@bed_17_woman2_fff`
- `woman@bed_17_woman3_fff`
- `woman@custom_bed_9_fff_woman1`
- `woman@custom_bed_9_fff_woman2`
- `woman@custom_bed_9_fff_woman3`

**`bed/bed_1`** (3)

- `woman@bed_1_woman1_fff`
- `woman@bed_1_woman2_fff`
- `woman@bed_1_woman3_fff`

**`bed/bed_2`** (3)

- `woman@bed_2_woman1_fff`
- `woman@bed_2_woman2_fff`
- `woman@bed_2_woman3_fff`

**`bed/bed_3`** (3)

- `woman@bed_3_woman1_fff`
- `woman@bed_3_woman2_fff`
- `woman@bed_3_woman3_fff`

**`bed/bed_4`** (3)

- `woman@bed_4_woman1_fff`
- `woman@bed_4_woman2_fff`
- `woman@bed_4_woman3_fff`

**`bed/bed_5`** (3)

- `woman@bed_5_woman1_fff`
- `woman@bed_5_woman2_fff`
- `woman@bed_5_woman3_fff`

**`bed/bed_6`** (3)

- `woman@bed_6_woman1_fff`
- `woman@bed_6_woman2_fff`
- `woman@bed_6_woman3_fff`

**`bed_1`** (3)

- `woman@bed_1_woman1_fff`
- `woman@bed_1_woman2_fff`
- `woman@bed_1_woman3_fff`

**`chair_G`** (3)

- `woman@ai_chair_G_fucktrio_fff1`
- `woman@ai_chair_G_fucktrio_fff2`
- `woman@ai_chair_G_fucktrio_fff3`

**`pillorymid`** (18)

- `woman@pillorymid_1_woman1_fff`
- `woman@pillorymid_1_woman2_fff`
- `woman@pillorymid_1_woman3_fff`
- `woman@pillorymid_2_woman1_fff`
- `woman@pillorymid_2_woman2_fff`
- `woman@pillorymid_2_woman3_fff`
- `woman@pillorymid_3_woman1_fff`
- `woman@pillorymid_3_woman2_fff`
- `woman@pillorymid_3_woman3_fff`
- `woman@pillorymid_4_woman1_fff`
- `woman@pillorymid_4_woman2_fff`
- `woman@pillorymid_4_woman3_fff`
- `woman@pillorymid_5_woman1_fff`
- `woman@pillorymid_5_woman2_fff`
- `woman@pillorymid_5_woman3_fff`
- `woman@pillorymid_6_woman1_fff`
- `woman@pillorymid_6_woman2_fff`
- `woman@pillorymid_6_woman3_fff`

**`pillorytop`** (6)

- `woman@pillorytop_1_woman1_fff`
- `woman@pillorytop_1_woman2_fff`
- `woman@pillorytop_1_woman3_fff`
- `woman@pillorytop_2_woman1_fff`
- `woman@pillorytop_2_woman2_fff`
- `woman@pillorytop_2_woman3_fff`

**`pool`** (18)

- `woman@pool_1_fff_woman1`
- `woman@pool_1_fff_woman2`
- `woman@pool_1_fff_woman3`
- `woman@pool_2_fff_woman1`
- `woman@pool_2_fff_woman2`
- `woman@pool_2_fff_woman3`
- `woman@pool_3_fff_woman1`
- `woman@pool_3_fff_woman2`
- `woman@pool_3_fff_woman3`
- `woman@pool_4_fff_woman1`
- `woman@pool_4_fff_woman2`
- `woman@pool_4_fff_woman3`
- `woman@pool_5_fff_woman1`
- `woman@pool_5_fff_woman2`
- `woman@pool_5_fff_woman3`
- `woman@pool_6_fff_woman1`
- `woman@pool_6_fff_woman2`
- `woman@pool_6_fff_woman3`

**`sofa`** (39)

- `woman@ai_sofa_1_fff_woman1`
- `woman@ai_sofa_1_fff_woman2`
- `woman@ai_sofa_1_fff_woman3`
- `woman@ai_sofa_2_fff_woman1`
- `woman@ai_sofa_2_fff_woman2`
- `woman@ai_sofa_2_fff_woman3`
- `woman@sofa_10_woman1_fff`
- `woman@sofa_10_woman2_fff`
- `woman@sofa_10_woman3_fff`
- `woman@sofa_11_woman1_fff`
- `woman@sofa_11_woman2_fff`
- `woman@sofa_11_woman3_fff`
- `woman@sofa_12_woman1_fff`
- `woman@sofa_12_woman2_fff`
- `woman@sofa_12_woman3_fff`
- `woman@sofa_13_woman1_fff`
- `woman@sofa_13_woman2_fff`
- `woman@sofa_13_woman3_fff`
- `woman@sofa_3_fff_woman1`
- `woman@sofa_3_fff_woman2`
- `woman@sofa_3_fff_woman3`
- `woman@sofa_4_fff_woman1`
- `woman@sofa_4_fff_woman2`
- `woman@sofa_4_fff_woman3`
- `woman@sofa_5_fff_woman1`
- `woman@sofa_5_fff_woman2`
- `woman@sofa_5_fff_woman3`
- `woman@sofa_6_fff_woman1`
- `woman@sofa_6_fff_woman2`
- `woman@sofa_6_fff_woman3`
- `woman@sofa_7_fff_woman1`
- `woman@sofa_7_fff_woman2`
- `woman@sofa_7_fff_woman3`
- `woman@sofa_8_fff_woman1`
- `woman@sofa_8_fff_woman2`
- `woman@sofa_8_fff_woman3`
- `woman@sofa_9_fff_woman1`
- `woman@sofa_9_fff_woman2`
- `woman@sofa_9_fff_woman3`

**`table`** (15)

- `woman@table_1_fff_woman1`
- `woman@table_1_fff_woman2`
- `woman@table_1_fff_woman3`
- `woman@table_2_fff_woman1`
- `woman@table_2_fff_woman2`
- `woman@table_2_fff_woman3`
- `woman@table_3_fff_woman1`
- `woman@table_3_fff_woman2`
- `woman@table_3_fff_woman3`
- `woman@table_4_fff_woman1`
- `woman@table_4_fff_woman2`
- `woman@table_4_fff_woman3`
- `woman@table_5_fff_woman1`
- `woman@table_5_fff_woman2`
- `woman@table_5_fff_woman3`

### `ingame` — 191 bundles (454,9 MB)

**Composição:** clipes sociais/emotes/danças do cliente; mistura 1, 2 e 4 atores.

**Pastas (1):** `(raiz)`

**`(raiz)`** (191)

- `man@afk_phone`
- `man@ai_bite_man1`
- `man@ai_bite_man2`
- `man@ai_bite_woman`
- `man@ai_kiss2_man1`
- `man@ai_kiss2_man2`
- `man@ai_kiss2_woman`
- `man@ai_m_bask`
- `man@ai_Onhands_man1`
- `man@ai_Onhands_man2`
- `man@ai_Onhands_woman`
- `man@ai_sand_sit3`
- `man@ai_stay_6`
- `man@dance_1`
- `man@dance_10`
- `man@dance_11`
- `man@dance_12`
- `man@dance_13`
- `man@dance_14`
- `man@dance_15`
- `man@dance_16`
- `man@dance_17`
- `man@dance_18`
- `man@dance_19`
- `man@dance_2`
- `man@dance_20`
- `man@dance_21`
- `man@dance_22`
- `man@dance_23`
- `man@dance_24`
- `man@dance_25`
- `man@dance_26`
- `man@dance_27`
- `man@dance_28`
- `man@dance_29`
- `man@dance_3`
- `man@dance_30`
- `man@dance_31`
- `man@dance_32`
- `man@dance_33`
- `man@dance_34`
- `man@dance_35`
- `man@dance_36`
- `man@dance_37`
- `man@dance_38`
- `man@dance_39`
- `man@dance_4`
- `man@dance_40`
- `man@dance_41`
- `man@dance_42`
- `man@dance_43`
- `man@dance_44`
- `man@dance_45`
- `man@dance_46`
- `man@dance_47`
- `man@dance_48`
- `man@dance_49`
- `man@dance_5`
- `man@dance_50`
- `man@dance_51`
- `man@dance_52`
- `man@dance_53`
- `man@dance_54`
- `man@dance_6`
- `man@dance_7`
- `man@dance_8`
- `man@dance_9`
- `man@dance_Bunny_Hop_man1`
- `man@dance_Bunny_Hop_man2`
- `man@dance_Bunny_Hop_woman`
- `man@dance_Gothic_Waltz_man1`
- `man@dance_Gothic_Waltz_man2`
- `man@dance_Gothic_Waltz_woman`
- `man@emo_applause`
- `man@emo_mashet_rukoy`
- `man@jump_dock`
- `man@phase4_agree_loop_man`
- `man@phase4_agree_loop_woman`
- `man@sand_lie`
- `man@sand_lie1`
- `man@sand_sit`
- `man@sit_lotus`
- `man@swim_idle`
- `man@walleyball_hit`
- `man@walleyball_idle`
- `woman@afk_phone`
- `woman@ai_bite_man`
- `woman@ai_bite_woman1`
- `woman@ai_bite_woman2`
- `woman@ai_effectposew`
- `woman@ai_f_bask`
- `woman@ai_floorstandingf`
- `woman@ai_floorww`
- `woman@ai_kiss2`
- `woman@ai_kiss2_man`
- `woman@ai_kiss2_woman1`
- `woman@ai_kiss2_woman2`
- `woman@ai_lynx`
- `woman@ai_Onhands_man`
- `woman@ai_Onhands_woman1`
- `woman@ai_Onhands_woman2`
- `woman@ai_photo`
- `woman@ai_praying`
- `woman@ai_rever`
- `woman@ai_sit4`
- `woman@ai_stay2`
- `woman@ai_stay_10`
- `woman@ai_stay_11`
- `woman@ai_stay_6`
- `woman@ai_stay_7`
- `woman@ai_stay_8`
- `woman@ai_stay_9`
- `woman@dance_1`
- `woman@dance_10`
- `woman@dance_11`
- `woman@dance_12`
- `woman@dance_13`
- `woman@dance_14`
- `woman@dance_15`
- `woman@dance_16`
- `woman@dance_17`
- `woman@dance_18`
- `woman@dance_19`
- `woman@dance_2`
- `woman@dance_20`
- `woman@dance_21`
- `woman@dance_22`
- `woman@dance_23`
- `woman@dance_24`
- `woman@dance_25`
- `woman@dance_26`
- `woman@dance_27`
- `woman@dance_28`
- `woman@dance_29`
- `woman@dance_3`
- `woman@dance_30`
- `woman@dance_31`
- `woman@dance_32`
- `woman@dance_33`
- `woman@dance_34`
- `woman@dance_35`
- `woman@dance_36`
- `woman@dance_37`
- `woman@dance_38`
- `woman@dance_39`
- `woman@dance_4`
- `woman@dance_40`
- `woman@dance_41`
- `woman@dance_42`
- `woman@dance_43`
- `woman@dance_44`
- `woman@dance_45`
- `woman@dance_46`
- `woman@dance_47`
- `woman@dance_48`
- `woman@dance_49`
- `woman@dance_5`
- `woman@dance_50`
- `woman@dance_51`
- `woman@dance_52`
- `woman@dance_53`
- `woman@dance_54`
- `woman@dance_6`
- `woman@dance_7`
- `woman@dance_8`
- `woman@dance_9`
- `woman@dance_Bunny_Hop_man`
- `woman@dance_Bunny_Hop_woman1`
- `woman@dance_Bunny_Hop_woman2`
- `woman@dance_Gothic_Waltz_man`
- `woman@dance_Gothic_Waltz_woman1`
- `woman@dance_Gothic_Waltz_woman2`
- `woman@emo_applause`
- `woman@emo_mashet_rukoy`
- `woman@jump_dock`
- `woman@lie_down`
- `woman@phase4_agree_loop_man`
- `woman@phase4_agree_loop_woman`
- `woman@sand_lie`
- `woman@sand_lie1`
- `woman@sand_sit`
- `woman@sit_lotus`
- `woman@stay1`
- `woman@stay2`
- `woman@stay3`
- `woman@stay4`
- `woman@stay5`
- `woman@stay6`
- `woman@swim_idle`
- `woman@walleyball_hit`
- `woman@walleyball_idle`

### `m` — 80 bundles (115,4 MB)

**Composição:** solo masculino (1 ator).

**Pastas (29):** `bar_chair1`, `bar_chair1_poses`, `barstool4`, `bed`, `cage_bot_1`, `cage_bot_2`, `cage_top_1`, `cage_top_2`, `chair`, `chair_g`, `djpult`, `drum`, `eames`, `glory`, `guitar`, `mattress`, `microphone`, `pillorymid`, `pillorytop`, `pillow`, `pole`, `pool`, `rocking`, `shell`, `sofa`, `sunbed`, `table`, `toilet`, `wall`

**`bar_chair1`** (2)

- `man@barstool_sit_1`
- `man@barstool_sit_2`

**`bar_chair1_poses`** (1)

- `man@bar_chair1_poses_sit`

**`barstool4`** (1)

- `man@barstool4_sit`

**`bed`** (19)

- `man@ai_bed_1_m`
- `man@ai_bed_1_single_m`
- `man@ai_bed_2_m`
- `man@ai_bed_3_m`
- `man@ai_bed_4_m`
- `man@ai_bed_armsonneck_m`
- `man@ai_bed_kneel_m`
- `man@ai_manobediencesolo_1`
- `man@ai_masturbating_m_1`
- `man@ai_n_m_lickfloor`
- `man@ai_pohoronm1`
- `man@ai_pushupmalesolo_1`
- `man@bed_1_single_m`
- `man@bed_sleep`
- `man@masturbating`
- `man@masturbating_m_1`
- `man@midnight_lucky_m_bed_photo_1`
- `man@midnight_lucky_m_bed_photo_2`
- `man@midnight_lucky_m_bed_photo_3`

**`cage_bot_1`** (1)

- `man@ai_cage_bot_1_1_m`

**`cage_bot_2`** (2)

- `man@ai_cage_bot_2_1_m`
- `man@ai_cage_bot_2_2_m`

**`cage_top_1`** (2)

- `man@ai_cage_top_1_1_m`
- `man@cage_bot_1_2_m`

**`cage_top_2`** (1)

- `man@ai_cage_top_2_1_m`

**`chair`** (5)

- `man@ai_chair_1`
- `man@ai_chair_1_m`
- `man@chair_1_m`
- `man@chair_sit_1`
- `man@custom_chair_Giovannetti_sit`

**`chair_g`** (2)

- `man@ai_chairg_1_m`
- `man@chair_giovannetti_sit`

**`djpult`** (1)

- `man@dj`

**`drum`** (2)

- `drum@drum_1_single_m`
- `man@drum_1_single_m`

**`eames`** (3)

- `man@ai_eames_2_m`
- `man@ai_eames_3_m`
- `man@eames_1`

**`glory`** (2)

- `man@ai_glory_m_1`
- `man@glory_m_1`

**`guitar`** (2)

- `guitar@guitar_1_single_m`
- `man@guitar_1_single_m`

**`mattress`** (1)

- `man@mattress_lies`

**`microphone`** (1)

- `man@sing`

**`pillorymid`** (1)

- `man@pillorymid_1_m`

**`pillorytop`** (1)

- `man@pillorytop_1_m`

**`pillow`** (1)

- `man@sit_heart`

**`pole`** (6)

- `man@strip1`
- `man@strip2`
- `man@strip3`
- `man@strip4`
- `man@strip5`
- `man@strip6`

**`pool`** (5)

- `man@ai_poolsit_4`
- `man@poolsit_1`
- `man@poolsit_2`
- `man@poolsit_3`
- `man@poolsit_4`

**`rocking`** (1)

- `man@rocking_1`

**`shell`** (1)

- `man@wash_hands`

**`sofa`** (5)

- `man@ai_sofa_1_m`
- `man@ai_sofa_2_m`
- `man@sofa_masturbate`
- `man@sofa_sit`
- `man@sofa_sleep`

**`sunbed`** (2)

- `man@ai_sunbed_1_m`
- `man@sunbed_sit`

**`table`** (1)

- `man@ai_table_1_m`

**`toilet`** (1)

- `man@toilet_1`

**`wall`** (7)

- `man@ai_wall_2_single_m`
- `man@ai_wall_3_single_m`
- `man@ai_wall_GlorySingle`
- `man@ai_wall_m_bondage`
- `man@midnight_lucky_m_wall_photo_1`
- `man@wall_1_single_m`
- `man@wall_2_single_m`

### `m_drum` — 2 bundles (1,5 MB)

**Composição:** ator + prop `drum` (2 bundles; duplica `m/drum`).

**Pastas (1):** `(raiz)`

**`(raiz)`** (2)

- `drum@drum_1_single_m`
- `man@drum_1_single_m`

### `mf` — 1461 bundles (1494,1 MB)

**Composição:** par M+F (2 atores).

**Pastas (20):** `bar_chair1`, `bar_chair1_poses`, `bed`, `cage_bot_1`, `cage_bot_2`, `chair`, `chair_g`, `eames`, `glory`, `pillorymid`, `pillorytop`, `pillow`, `pole`, `pool`, `rel`, `rel/wedding/fm`, `rel/wedding/mf`, `sofa`, `table`, `wall`

**`bar_chair1`** (38)

- `man@ai_barstool_21`
- `man@ai_barstool_31`
- `man@ai_barstool_41`
- `man@ai_barstool_51`
- `man@ai_barstool_61`
- `man@ai_barstool_71`
- `man@ai_barstool_cuni1`
- `man@ai_barstool_hug1`
- `man@barstool_10`
- `man@barstool_11`
- `man@barstool_12`
- `man@barstool_13`
- `man@barstool_14`
- `man@barstool_2`
- `man@barstool_3`
- `man@barstool_4`
- `man@barstool_7`
- `man@barstool_9`
- `man@midnight_lucky_mf_barstool_f_1_1`
- `woman@ai_barstool_22`
- `woman@ai_barstool_32`
- `woman@ai_barstool_42`
- `woman@ai_barstool_52`
- `woman@ai_barstool_62`
- `woman@ai_barstool_72`
- `woman@ai_barstool_cuni2`
- `woman@ai_barstool_hug2`
- `woman@barstool_10`
- `woman@barstool_11`
- `woman@barstool_12`
- `woman@barstool_13`
- `woman@barstool_14`
- `woman@barstool_2`
- `woman@barstool_3`
- `woman@barstool_4`
- `woman@barstool_7`
- `woman@barstool_9`
- `woman@midnight_lucky_mf_barstool_f_1_2`

**`bar_chair1_poses`** (2)

- `man@barstool_1`
- `woman@barstool_1`

**`bed`** (572)

- `man@ai_bed52_1`
- `man@ai_bed53_1`
- `man@ai_bed54_1`
- `man@ai_bed55_1`
- `man@ai_bed56_1`
- `man@ai_bed57_1`
- `man@ai_bed58_1`
- `man@ai_bed59_1`
- `man@ai_bed60_1`
- `man@ai_bed61_1`
- `man@ai_bed63_1`
- `man@ai_bed64_1`
- `man@ai_bed65_1`
- `man@ai_bed67_1`
- `man@ai_bed68_1`
- `man@ai_bed69_1`
- `man@ai_bed70_1`
- `man@ai_bed71_1`
- `man@ai_bed72_1`
- `man@ai_bed73_1`
- `man@ai_bed74_1`
- `man@ai_bed75_1`
- `man@ai_bed76_1`
- `man@ai_bed77_1`
- `man@ai_bed78_1`
- `man@ai_bed79_1`
- `man@ai_bed80_1`
- `man@ai_bed81_1`
- `man@ai_bed82_1`
- `man@ai_bed83_1`
- `man@ai_bed84_1`
- `man@ai_bed85_1`
- `man@ai_bed86_1`
- `man@ai_bed87_1`
- `man@ai_bed88_1`
- `man@ai_bed89_1`
- `man@ai_bed90_1`
- `man@ai_bed91_1`
- `man@ai_bed92_1`
- `man@ai_bed93_1`
- `man@ai_bed94_1`
- `man@ai_bed95_1`
- `man@ai_bed96_1`
- `man@ai_bed_analspina1`
- `man@ai_bed_fmdoggy1`
- `man@ai_bed_fmslap1`
- `man@ai_bed_mf_minet1`
- `man@ai_bed_mf_stayhug1`
- `man@ai_bed_mfanalspina1`
- `man@ai_bed_mfdoggy1`
- `man@ai_bed_mffuckface1`
- `man@ai_bed_mfslap1`
- `man@ai_bloodsuckingmf1`
- `man@ai_bridge1`
- `man@ai_chock1`
- `man@ai_kissonhandsv1`
- `man@ai_lotusmfv1`
- `man@ai_n_lucky_mf_bed_f_1_1`
- `man@ai_n_lucky_mf_bed_v_1_1`
- `man@ai_n_lucky_mf_bed_v_2_1`
- `man@ai_obedience1`
- `man@ai_obediencefmbed1`
- `man@ai_pushup1`
- `man@ai_sex_bridge1`
- `man@ai_wmankissonhands1`
- `man@bed1`
- `man@bed10`
- `man@bed11`
- `man@bed12`
- `man@bed13`
- `man@bed14`
- `man@bed15`
- `man@bed16`
- `man@bed17`
- `man@bed18`
- `man@bed19`
- `man@bed2`
- `man@bed20`
- `man@bed21`
- `man@bed22`
- `man@bed23`
- `man@bed24`
- `man@bed25`
- `man@bed26`
- `man@bed27`
- `man@bed28`
- `man@bed29`
- `man@bed3`
- `man@bed30`
- `man@bed31`
- `man@bed32`
- `man@bed33`
- `man@bed34`
- `man@bed35`
- `man@bed36`
- `man@bed37`
- `man@bed38`
- `man@bed39`
- `man@bed4`
- `man@bed40`
- `man@bed41`
- `man@bed42`
- `man@bed43`
- `man@bed44`
- `man@bed45`
- `man@bed46`
- `man@bed47`
- `man@bed48`
- `man@bed49`
- `man@bed5`
- `man@bed50`
- `man@bed51`
- `man@bed52`
- `man@bed53`
- `man@bed54`
- `man@bed55`
- `man@bed56`
- `man@bed57`
- `man@bed58`
- `man@bed59`
- `man@bed6`
- `man@bed60`
- `man@bed61`
- `man@bed62`
- `man@bed63`
- `man@bed64`
- `man@bed67`
- `man@bed7`
- `man@bed70`
- `man@bed76`
- `man@bed8`
- `man@bed80`
- `man@bed85`
- `man@bed9`
- `man@bed_1001`
- `man@bed_1011`
- `man@bed_1021`
- `man@bed_1031`
- `man@bed_1041`
- `man@bed_1051`
- `man@bed_1061`
- `man@bed_1071`
- `man@bed_1081`
- `man@bed_1091`
- `man@bed_1101`
- `man@bed_1111`
- `man@bed_1121`
- `man@bed_1131`
- `man@bed_1141`
- `man@bed_1151`
- `man@bed_1161`
- `man@bed_1171`
- `man@bed_1181`
- `man@bed_1191`
- `man@bed_1211`
- `man@bed_1221`
- `man@bed_1231`
- `man@bed_1241`
- `man@bed_1251`
- `man@bed_1261`
- `man@bed_1271`
- `man@bed_1281`
- `man@bed_1291`
- `man@bed_1301`
- `man@bed_1311`
- `man@bed_1321`
- `man@bed_1331`
- `man@bed_1341`
- `man@bed_1351`
- `man@bed_1361`
- `man@bed_1371`
- `man@bed_1381`
- `man@bed_1391`
- `man@bed_1401`
- `man@bed_1411`
- `man@bed_1421`
- `man@bed_143`
- `man@bed_1431`
- `man@bed_144`
- `man@bed_1441`
- `man@bed_1451`
- `man@bed_1461`
- `man@bed_1471`
- `man@bed_1481`
- `man@bed_1491`
- `man@bed_1501`
- `man@bed_1511`
- `man@bed_1521`
- `man@bed_1531`
- `man@bed_154`
- `man@bed_155`
- `man@bed_156`
- `man@bed_157`
- `man@bed_158`
- `man@bed_159`
- `man@bed_160`
- `man@bed_161`
- `man@bed_162`
- `man@bed_163`
- `man@bed_164`
- `man@bed_165`
- `man@bed_166`
- `man@bed_167`
- `man@bed_168`
- `man@bed_169`
- `man@bed_170`
- `man@bed_171`
- `man@bed_172`
- `man@bed_173`
- `man@bed_174`
- `man@bed_175`
- `man@bed_176`
- `man@bed_177`
- `man@bed_178`
- `man@bed_179`
- `man@bed_180`
- `man@bed_181`
- `man@bed_182`
- `man@bed_183`
- `man@bed_184`
- `man@bed_185`
- `man@bed_186`
- `man@bed_187`
- `man@bed_188`
- `man@bed_189`
- `man@bed_190`
- `man@bed_191`
- `man@bed_192`
- `man@bed_193`
- `man@bed_194`
- `man@bed_195`
- `man@bed_196`
- `man@bed_197`
- `man@bed_198`
- `man@bed_199`
- `man@bed_1_sport1`
- `man@bed_200`
- `man@bed_201`
- `man@bed_202`
- `man@bed_203`
- `man@bed_204`
- `man@bed_205`
- `man@bed_206`
- `man@bed_207`
- `man@bed_208`
- `man@bed_209`
- `man@bed_210`
- `man@bed_211`
- `man@bed_212`
- `man@bed_213`
- `man@bed_215`
- `man@bed_216`
- `man@bed_217`
- `man@bed_218`
- `man@bed_911`
- `man@bed_92`
- `man@bed_93`
- `man@bed_941`
- `man@bed_971`
- `man@bed_981`
- `man@bed_991`
- `man@cumshot_face`
- `man@cumshot_foot`
- `man@custom-bed26`
- `man@custom_bed1`
- `man@custom_bed_1`
- `man@midnight_ai_lucky_mf_bed_cum_1_1`
- `man@midnight_ai_n_lucky_mf_bed_f_2_1`
- `man@midnight_ai_n_lucky_mf_bed_v_3_1`
- `man@midnight_lucky_mf_bed_a_1_1`
- `man@midnight_lucky_mf_bed_a_2_1`
- `man@midnight_lucky_mf_bed_cum_2_1`
- `man@midnight_lucky_mf_bed_cum_3_1`
- `man@midnight_lucky_mf_bed_f_3_1`
- `man@midnight_lucky_mf_bed_f_4_1`
- `man@midnight_lucky_mf_bed_o_1_1`
- `man@midnight_lucky_mf_bed_o_2_1`
- `man@midnight_lucky_mf_bed_o_3_1`
- `man@midnight_lucky_mf_bed_v_4_1`
- `man@midnight_lucky_mf_bed_v_5_1`
- `man@midnight_lucky_mf_bed_v_6_1`
- `man@midnight_lucky_mf_bed_v_7_1`
- `man@midnight_lucky_mf_bed_v_8_1`
- `man@midnight_mf_bed_f_10_1`
- `woman@ai_bed52_2`
- `woman@ai_bed53_2`
- `woman@ai_bed54_2`
- `woman@ai_bed55_2`
- `woman@ai_bed56_2`
- `woman@ai_bed57_2`
- `woman@ai_bed58_2`
- `woman@ai_bed59_2`
- `woman@ai_bed60_2`
- `woman@ai_bed61_2`
- `woman@ai_bed63_2`
- `woman@ai_bed64_2`
- `woman@ai_bed65_2`
- `woman@ai_bed67_2`
- `woman@ai_bed68_2`
- `woman@ai_bed69_2`
- `woman@ai_bed70_2`
- `woman@ai_bed71_2`
- `woman@ai_bed72_2`
- `woman@ai_bed73_2`
- `woman@ai_bed74_2`
- `woman@ai_bed75_2`
- `woman@ai_bed76_2`
- `woman@ai_bed77_2`
- `woman@ai_bed78_2`
- `woman@ai_bed79_2`
- `woman@ai_bed80_2`
- `woman@ai_bed81_2`
- `woman@ai_bed82_2`
- `woman@ai_bed83_2`
- `woman@ai_bed84_2`
- `woman@ai_bed85_2`
- `woman@ai_bed86_2`
- `woman@ai_bed87_2`
- `woman@ai_bed88_2`
- `woman@ai_bed89_2`
- `woman@ai_bed90_2`
- `woman@ai_bed91_2`
- `woman@ai_bed92_2`
- `woman@ai_bed93_2`
- `woman@ai_bed94_2`
- `woman@ai_bed95_2`
- `woman@ai_bed96_2`
- `woman@ai_bed_analspina2`
- `woman@ai_bed_fmdoggy2`
- `woman@ai_bed_fmslap2`
- `woman@ai_bed_mf_minet2`
- `woman@ai_bed_mf_stayhug2`
- `woman@ai_bed_mfanalspina2`
- `woman@ai_bed_mfdoggy2`
- `woman@ai_bed_mffuckface2`
- `woman@ai_bed_mfslap2`
- `woman@ai_bed_stayhug1`
- `woman@ai_bed_stayhug2`
- `woman@ai_bed_stayhug2.filepart` — **_incompleto (.filepart)_**
- `woman@ai_bloodsuckingmf2`
- `woman@ai_bridge2`
- `woman@ai_chock2`
- `woman@ai_kissonhandsv2`
- `woman@ai_lotusmfv2`
- `woman@ai_n_lucky_mf_bed_f_1_2`
- `woman@ai_n_lucky_mf_bed_v_1_2`
- `woman@ai_n_lucky_mf_bed_v_2_2`
- `woman@ai_obedience2`
- `woman@ai_obediencefmbed2`
- `woman@ai_pushup2`
- `woman@ai_sex_bridge2`
- `woman@ai_wmankissonhands2`
- `woman@bed1`
- `woman@bed10`
- `woman@bed11`
- `woman@bed12`
- `woman@bed13`
- `woman@bed14`
- `woman@bed15`
- `woman@bed16`
- `woman@bed17`
- `woman@bed18`
- `woman@bed19`
- `woman@bed2`
- `woman@bed20`
- `woman@bed21`
- `woman@bed22`
- `woman@bed23`
- `woman@bed24`
- `woman@bed25`
- `woman@bed26`
- `woman@bed27`
- `woman@bed28`
- `woman@bed29`
- `woman@bed3`
- `woman@bed30`
- `woman@bed31`
- `woman@bed32`
- `woman@bed33`
- `woman@bed34`
- `woman@bed35`
- `woman@bed36`
- `woman@bed37`
- `woman@bed38`
- `woman@bed39`
- `woman@bed4`
- `woman@bed40`
- `woman@bed41`
- `woman@bed42`
- `woman@bed43`
- `woman@bed44`
- `woman@bed45`
- `woman@bed46`
- `woman@bed47`
- `woman@bed48`
- `woman@bed49`
- `woman@bed5`
- `woman@bed50`
- `woman@bed51`
- `woman@bed52`
- `woman@bed53`
- `woman@bed54`
- `woman@bed55`
- `woman@bed56`
- `woman@bed57`
- `woman@bed58`
- `woman@bed59`
- `woman@bed6`
- `woman@bed60`
- `woman@bed61`
- `woman@bed62`
- `woman@bed63`
- `woman@bed64`
- `woman@bed67`
- `woman@bed7`
- `woman@bed70`
- `woman@bed76`
- `woman@bed8`
- `woman@bed80`
- `woman@bed85`
- `woman@bed9`
- `woman@bed_1002`
- `woman@bed_1012`
- `woman@bed_1022`
- `woman@bed_1032`
- `woman@bed_1042`
- `woman@bed_1052`
- `woman@bed_1062`
- `woman@bed_1072`
- `woman@bed_1082`
- `woman@bed_1092`
- `woman@bed_1102`
- `woman@bed_1112`
- `woman@bed_1122`
- `woman@bed_1132`
- `woman@bed_1142`
- `woman@bed_1152`
- `woman@bed_1162`
- `woman@bed_1172`
- `woman@bed_1182`
- `woman@bed_1192`
- `woman@bed_1212`
- `woman@bed_1222`
- `woman@bed_1232`
- `woman@bed_1242`
- `woman@bed_1252`
- `woman@bed_1262`
- `woman@bed_1272`
- `woman@bed_1282`
- `woman@bed_1292`
- `woman@bed_1302`
- `woman@bed_1312`
- `woman@bed_1322`
- `woman@bed_1332`
- `woman@bed_1342`
- `woman@bed_1352`
- `woman@bed_1362`
- `woman@bed_1372`
- `woman@bed_1382`
- `woman@bed_1392`
- `woman@bed_1402`
- `woman@bed_1412`
- `woman@bed_1422`
- `woman@bed_143`
- `woman@bed_1432`
- `woman@bed_144`
- `woman@bed_1442`
- `woman@bed_1452`
- `woman@bed_1462`
- `woman@bed_1472`
- `woman@bed_1482`
- `woman@bed_1492`
- `woman@bed_1502`
- `woman@bed_1512`
- `woman@bed_1522`
- `woman@bed_1532`
- `woman@bed_154`
- `woman@bed_155`
- `woman@bed_156`
- `woman@bed_157`
- `woman@bed_158`
- `woman@bed_159`
- `woman@bed_160`
- `woman@bed_161`
- `woman@bed_162`
- `woman@bed_163`
- `woman@bed_164`
- `woman@bed_165`
- `woman@bed_166`
- `woman@bed_167`
- `woman@bed_168`
- `woman@bed_169`
- `woman@bed_170`
- `woman@bed_171`
- `woman@bed_172`
- `woman@bed_173`
- `woman@bed_174`
- `woman@bed_175`
- `woman@bed_176`
- `woman@bed_177`
- `woman@bed_178`
- `woman@bed_179`
- `woman@bed_180`
- `woman@bed_181`
- `woman@bed_182`
- `woman@bed_183`
- `woman@bed_184`
- `woman@bed_185`
- `woman@bed_186`
- `woman@bed_187`
- `woman@bed_188`
- `woman@bed_189`
- `woman@bed_190`
- `woman@bed_191`
- `woman@bed_192`
- `woman@bed_193`
- `woman@bed_194`
- `woman@bed_195`
- `woman@bed_196`
- `woman@bed_197`
- `woman@bed_198`
- `woman@bed_199`
- `woman@bed_1_sport2`
- `woman@bed_200`
- `woman@bed_201`
- `woman@bed_202`
- `woman@bed_203`
- `woman@bed_204`
- `woman@bed_205`
- `woman@bed_206`
- `woman@bed_207`
- `woman@bed_208`
- `woman@bed_209`
- `woman@bed_210`
- `woman@bed_211`
- `woman@bed_212`
- `woman@bed_213`
- `woman@bed_215`
- `woman@bed_216`
- `woman@bed_217`
- `woman@bed_218`
- `woman@bed_912`
- `woman@bed_92`
- `woman@bed_93`
- `woman@bed_942`
- `woman@bed_952`
- `woman@bed_972`
- `woman@bed_982`
- `woman@bed_992`
- `woman@cumshot_face`
- `woman@cumshot_foot`
- `woman@custom-bed26`
- `woman@custom_bed1`
- `woman@custom_bed_1`
- `woman@midnight_ai_lucky_mf_bed_cum_1_2`
- `woman@midnight_ai_n_lucky_mf_bed_f_2_2`
- `woman@midnight_ai_n_lucky_mf_bed_v_3_2`
- `woman@midnight_lucky_mf_bed_a_1_2`
- `woman@midnight_lucky_mf_bed_a_2_2`
- `woman@midnight_lucky_mf_bed_cum_2_2`
- `woman@midnight_lucky_mf_bed_cum_3_2`
- `woman@midnight_lucky_mf_bed_f_3_2`
- `woman@midnight_lucky_mf_bed_f_4_2`
- `woman@midnight_lucky_mf_bed_o_1_2`
- `woman@midnight_lucky_mf_bed_o_2_2`
- `woman@midnight_lucky_mf_bed_o_3_2`
- `woman@midnight_lucky_mf_bed_v_4_2`
- `woman@midnight_lucky_mf_bed_v_5_2`
- `woman@midnight_lucky_mf_bed_v_6_2`
- `woman@midnight_lucky_mf_bed_v_7_2`
- `woman@midnight_lucky_mf_bed_v_8_2`
- `woman@midnight_mf_bed_f_10_2`

**`cage_bot_1`** (24)

- `man@ai_cage_bot_1_11`
- `man@ai_cage_bot_1_21`
- `man@ai_cage_bot_1_31`
- `man@cage_bot_1_10`
- `man@cage_bot_1_11`
- `man@cage_bot_1_12`
- `man@cage_bot_1_4`
- `man@cage_bot_1_5`
- `man@cage_bot_1_6`
- `man@cage_bot_1_7`
- `man@cage_bot_1_8`
- `man@cage_bot_1_9`
- `woman@ai_cage_bot_1_12`
- `woman@ai_cage_bot_1_22`
- `woman@ai_cage_bot_1_32`
- `woman@cage_bot_1_10`
- `woman@cage_bot_1_11`
- `woman@cage_bot_1_12`
- `woman@cage_bot_1_4`
- `woman@cage_bot_1_5`
- `woman@cage_bot_1_6`
- `woman@cage_bot_1_7`
- `woman@cage_bot_1_8`
- `woman@cage_bot_1_9`

**`cage_bot_2`** (12)

- `man@ai_cage_bot_2_11`
- `man@ai_cage_bot_2_21`
- `man@ai_cage_bot_2_31`
- `man@ai_cage_bot_2_41`
- `man@ai_cage_bot_2_51`
- `man@ai_cage_bot_2_61`
- `woman@ai_cage_bot_2_12`
- `woman@ai_cage_bot_2_22`
- `woman@ai_cage_bot_2_32`
- `woman@ai_cage_bot_2_42`
- `woman@ai_cage_bot_2_52`
- `woman@ai_cage_bot_2_62`

**`chair`** (64)

- `man@ai_chair_41`
- `man@ai_chair_51`
- `man@ai_chair_61`
- `man@ai_chair_71`
- `man@ai_chair_81`
- `man@ai_chair_91`
- `man@ai_chair_mf_rideoncock1`
- `man@ai_chair_mfsitonknees1`
- `man@chair_1`
- `man@chair_101`
- `man@chair_111`
- `man@chair_121`
- `man@chair_131`
- `man@chair_141`
- `man@chair_151`
- `man@chair_16`
- `man@chair_171`
- `man@chair_181`
- `man@chair_19`
- `man@chair_2`
- `man@chair_201`
- `man@chair_211`
- `man@chair_221`
- `man@chair_231`
- `man@chair_24`
- `man@chair_25`
- `man@chair_26`
- `man@chair_27`
- `man@chair_28`
- `man@chair_3`
- `man@midnight_lucky_mf_chair_cum_1_1`
- `man@midnight_lucky_mf_chair_o_1_1`
- `woman@ai_chair_42`
- `woman@ai_chair_52`
- `woman@ai_chair_62`
- `woman@ai_chair_72`
- `woman@ai_chair_82`
- `woman@ai_chair_92`
- `woman@ai_chair_mf_rideoncock2`
- `woman@ai_chair_mfsitonknees2`
- `woman@chair_1`
- `woman@chair_102`
- `woman@chair_112`
- `woman@chair_122`
- `woman@chair_132`
- `woman@chair_142`
- `woman@chair_152`
- `woman@chair_16`
- `woman@chair_172`
- `woman@chair_182`
- `woman@chair_19`
- `woman@chair_2`
- `woman@chair_202`
- `woman@chair_212`
- `woman@chair_222`
- `woman@chair_232`
- `woman@chair_24`
- `woman@chair_25`
- `woman@chair_26`
- `woman@chair_27`
- `woman@chair_28`
- `woman@chair_3`
- `woman@midnight_lucky_mf_chair_cum_1_2`
- `woman@midnight_lucky_mf_chair_o_1_2`

**`chair_g`** (26)

- `man@ai_chair_g_mf_legsonback1`
- `man@chair_g_1`
- `man@chair_g_2`
- `man@chair_G_3`
- `man@chair_G_4`
- `man@chair_g_5`
- `man@chair_g_6`
- `man@chair_g_7`
- `man@chair_g_8`
- `man@midnight_ai_lucky_mf_chairg_o_2_1`
- `man@midnight_ai_lucky_mf_chairg_v_1_1`
- `man@midnight_ai_n_lucky_mf_chairg_o_1_1`
- `man@midnight_lucky_mf_chairg_cum_1_1`
- `woman@ai_chair_g_mf_legsonback2`
- `woman@chair_g_1`
- `woman@chair_g_2`
- `woman@chair_G_3`
- `woman@chair_G_4`
- `woman@chair_g_5`
- `woman@chair_g_6`
- `woman@chair_g_7`
- `woman@chair_g_8`
- `woman@midnight_ai_lucky_mf_chairg_o_2_2`
- `woman@midnight_ai_lucky_mf_chairg_v_1_2`
- `woman@midnight_ai_n_lucky_mf_chairg_o_1_2`
- `woman@midnight_lucky_mf_chairg_cum_1_2`

**`eames`** (28)

- `man@eames1_1`
- `man@eames_2`
- `man@eames_3`
- `man@eames_4`
- `man@eames_5`
- `man@eames_6`
- `man@eames_7`
- `man@midnight_ai_lucky_mf_eames_o_1_1`
- `man@midnight_ai_n_lucky_mf_eames_v_1_1`
- `man@midnight_lucky_mf_eames_a_1_1`
- `man@midnight_lucky_mf_eames_a_2_1`
- `man@midnight_lucky_mf_eames_cum_1_1`
- `man@midnight_lucky_mf_eames_v_2_1`
- `man@midnight_lucky_mf_eames_v_3_1`
- `woman@eames1_1`
- `woman@eames_2`
- `woman@eames_3`
- `woman@eames_4`
- `woman@eames_5`
- `woman@eames_6`
- `woman@eames_7`
- `woman@midnight_ai_lucky_mf_eames_o_1_2`
- `woman@midnight_ai_n_lucky_mf_eames_v_1_2`
- `woman@midnight_lucky_mf_eames_a_1_2`
- `woman@midnight_lucky_mf_eames_a_2_2`
- `woman@midnight_lucky_mf_eames_cum_1_2`
- `woman@midnight_lucky_mf_eames_v_2_2`
- `woman@midnight_lucky_mf_eames_v_3_2`

**`glory`** (32)

- `man@ai_glory_11`
- `man@ai_glory_21`
- `man@ai_glory_31`
- `man@ai_glory_41`
- `man@ai_glory_51`
- `man@ai_glory_61`
- `man@ai_glory_71`
- `man@glory_1`
- `man@glory_2`
- `man@glory_3`
- `man@glory_4`
- `man@glory_5`
- `man@glory_6`
- `man@glory_7`
- `man@glory_8`
- `man@glory_9`
- `woman@ai_glory_12`
- `woman@ai_glory_22`
- `woman@ai_glory_32`
- `woman@ai_glory_42`
- `woman@ai_glory_52`
- `woman@ai_glory_62`
- `woman@ai_glory_72`
- `woman@glory_1`
- `woman@glory_2`
- `woman@glory_3`
- `woman@glory_4`
- `woman@glory_5`
- `woman@glory_6`
- `woman@glory_7`
- `woman@glory_8`
- `woman@glory_9`

**`pillorymid`** (12)

- `man@pillorymid_1`
- `man@pillorymid_2`
- `man@pillorymid_3`
- `man@pillorymid_4`
- `man@pillorymid_5`
- `man@pillorymid_6`
- `woman@pillorymid_1`
- `woman@pillorymid_2`
- `woman@pillorymid_3`
- `woman@pillorymid_4`
- `woman@pillorymid_5`
- `woman@pillorymid_6`

**`pillorytop`** (22)

- `man@pillorytop_1`
- `man@pillorytop_10`
- `man@pillorytop_11`
- `man@pillorytop_2`
- `man@pillorytop_3`
- `man@pillorytop_4`
- `man@pillorytop_5`
- `man@PilloryTop_6`
- `man@PilloryTop_7`
- `man@PilloryTop_8`
- `man@pillorytop_9`
- `woman@pillorytop_1`
- `woman@pillorytop_10`
- `woman@pillorytop_11`
- `woman@pillorytop_2`
- `woman@pillorytop_3`
- `woman@pillorytop_4`
- `woman@pillorytop_5`
- `woman@PilloryTop_6`
- `woman@PilloryTop_7`
- `woman@PilloryTop_8`
- `woman@pillorytop_9`

**`pillow`** (40)

- `man@ai_pillow_21`
- `man@ai_pillow_31`
- `man@ai_pillow_41`
- `man@midnight_lucky_mf_pillow_a_1_1`
- `man@midnight_lucky_mf_pillow_cum_1_1`
- `man@midnight_lucky_mf_pillow_v_1_1`
- `man@pillow_1`
- `man@pillow_10`
- `man@pillow_11`
- `man@pillow_12`
- `man@pillow_13`
- `man@pillow_14`
- `man@pillow_15`
- `man@pillow_16`
- `man@pillow_17`
- `man@pillow_5`
- `man@pillow_6`
- `man@pillow_7`
- `man@pillow_8`
- `man@pillow_9`
- `woman@ai_pillow_22`
- `woman@ai_pillow_32`
- `woman@ai_pillow_42`
- `woman@midnight_lucky_mf_pillow_a_1_2`
- `woman@midnight_lucky_mf_pillow_cum_1_2`
- `woman@midnight_lucky_mf_pillow_v_1_2`
- `woman@pillow_1`
- `woman@pillow_10`
- `woman@pillow_11`
- `woman@pillow_12`
- `woman@pillow_13`
- `woman@pillow_14`
- `woman@pillow_15`
- `woman@pillow_16`
- `woman@pillow_17`
- `woman@pillow_5`
- `woman@pillow_6`
- `woman@pillow_7`
- `woman@pillow_8`
- `woman@pillow_9`

**`pole`** (18)

- `man@pole1`
- `man@pole2`
- `man@pole3`
- `man@pole_4`
- `man@pole_5`
- `man@pole_6`
- `man@pole_7`
- `man@pole_8`
- `man@pole_9`
- `woman@pole1`
- `woman@pole2`
- `woman@pole3`
- `woman@pole_4`
- `woman@pole_5`
- `woman@pole_6`
- `woman@pole_7`
- `woman@pole_8`
- `woman@pole_9`

**`pool`** (69)

- `man@ai_n_lucky_mf_pool_o_1_1`
- `man@ai_pool_51`
- `man@ai_pool_61`
- `man@ai_pool_71`
- `man@midnight_lucky_mf_pool_v_1_1`
- `man@pool1`
- `man@pool2`
- `man@pool_1`
- `man@pool_10`
- `man@pool_111`
- `man@pool_121`
- `man@pool_122`
- `man@pool_13`
- `man@pool_141`
- `man@pool_151`
- `man@pool_161`
- `man@pool_17`
- `man@pool_18`
- `man@pool_19`
- `man@pool_2`
- `man@pool_20`
- `man@pool_21`
- `man@pool_22`
- `man@pool_23`
- `man@pool_24`
- `man@pool_25`
- `man@pool_26`
- `man@pool_27`
- `man@pool_28`
- `man@pool_29`
- `man@pool_3`
- `man@pool_30`
- `man@pool_4`
- `man@pool_81`
- `man@pool_91`
- `woman@ai_n_lucky_mf_pool_o_1_2`
- `woman@ai_pool_52`
- `woman@ai_pool_62`
- `woman@ai_pool_72`
- `woman@midnight_lucky_mf_pool_v_1_2`
- `woman@pool1`
- `woman@pool2`
- `woman@pool_1`
- `woman@pool_10`
- `woman@pool_112`
- `woman@pool_122`
- `woman@pool_13`
- `woman@pool_142`
- `woman@pool_152`
- `woman@pool_162`
- `woman@pool_17`
- `woman@pool_18`
- `woman@pool_19`
- `woman@pool_2`
- `woman@pool_20`
- `woman@pool_21`
- `woman@pool_22`
- `woman@pool_23`
- `woman@pool_24`
- `woman@pool_25`
- `woman@pool_26`
- `woman@pool_27`
- `woman@pool_28`
- `woman@pool_29`
- `woman@pool_3`
- `woman@pool_30`
- `woman@pool_4`
- `woman@pool_82`
- `woman@pool_92`

**`rel`** (10)

- `man@cuddle_man`
- `man@kisscheek_man`
- `man@slowdance_invert_woman`
- `man@slowdance_kiss_woman`
- `man@slowdance_woman`
- `woman@cuddle_woman`
- `woman@kisscheek_woman`
- `woman@slowdance_invert_man`
- `woman@slowdance_kiss_man`
- `woman@slowdance_man`

**`rel/wedding/fm`** (10)

- `man@phase1_fm`
- `man@phase2_wait_fm`
- `man@phase3_agree_fm`
- `man@phase3_disagree_fm`
- `man@phase4_agree_loop_fm`
- `woman@phase1_fm`
- `woman@phase2_wait_fm`
- `woman@phase3_agree_fm`
- `woman@phase3_disagree_fm`
- `woman@phase4_agree_loop_fm`

**`rel/wedding/mf`** (10)

- `man@phase1_mf`
- `man@phase2_wait_mf`
- `man@phase3_agree_mf`
- `man@phase3_disagree_mf`
- `man@phase4_agree_loop_mf`
- `woman@phase1_mf`
- `woman@phase2_wait_mf`
- `woman@phase3_agree_mf`
- `woman@phase3_disagree_mf`
- `woman@phase4_agree_loop_mf`

**`sofa`** (274)

- `man@ai_onhand1`
- `man@ai_sofa15_1`
- `man@ai_sofa16_1`
- `man@ai_sofa17_1`
- `man@ai_sofa18_1`
- `man@ai_sofa19_1`
- `man@ai_sofa20_1`
- `man@ai_sofa21_1`
- `man@ai_sofa22_1`
- `man@ai_sofa23_1`
- `man@ai_sofa24_1`
- `man@ai_sofa25_1`
- `man@ai_sofa26_1`
- `man@ai_sofa27_1`
- `man@ai_sofa28_1`
- `man@ai_sofa29_1`
- `man@ai_sofa30_1`
- `man@ai_sofa31_1`
- `man@ai_sofa32_1`
- `man@ai_sofa33_1`
- `man@ai_sofa_facesit1`
- `man@ai_sofa_fmslap1`
- `man@ai_sofa_mf_legsonback1`
- `man@ai_sofa_mfslap1`
- `man@ai_sofafap1`
- `man@ai_ssofasleepmf1`
- `man@cumshot_belly`
- `man@midnight_ai_n_lucky_mf_sofa_o_1_1`
- `man@midnight_lucky_mf_sofa_f_1_1`
- `man@midnight_lucky_mf_sofa_fet_1_1`
- `man@midnight_lucky_mf_sofa_fet_2_1`
- `man@sofa1`
- `man@sofa10`
- `man@sofa11`
- `man@sofa12`
- `man@sofa13`
- `man@sofa14`
- `man@sofa15`
- `man@sofa16`
- `man@sofa2`
- `man@sofa3`
- `man@sofa4`
- `man@sofa5`
- `man@sofa6`
- `man@sofa7`
- `man@sofa8`
- `man@sofa9`
- `man@sofa_100`
- `man@sofa_101`
- `man@sofa_102`
- `man@sofa_103`
- `man@sofa_104`
- `man@sofa_105`
- `man@sofa_106`
- `man@sofa_107`
- `man@sofa_108`
- `man@sofa_109`
- `man@sofa_110`
- `man@sofa_111`
- `man@sofa_112`
- `man@sofa_113`
- `man@sofa_114`
- `man@sofa_115`
- `man@sofa_116`
- `man@sofa_117`
- `man@sofa_118`
- `man@sofa_119`
- `man@sofa_120`
- `man@sofa_121`
- `man@sofa_122`
- `man@sofa_321`
- `man@sofa_341`
- `man@sofa_351`
- `man@sofa_361`
- `man@sofa_371`
- `man@sofa_381`
- `man@sofa_391`
- `man@sofa_401`
- `man@sofa_411`
- `man@sofa_421`
- `man@sofa_431`
- `man@sofa_441`
- `man@sofa_451`
- `man@sofa_461`
- `man@sofa_471`
- `man@sofa_481`
- `man@sofa_491`
- `man@sofa_50`
- `man@sofa_511`
- `man@sofa_521`
- `man@sofa_531`
- `man@sofa_54`
- `man@sofa_55`
- `man@sofa_561`
- `man@sofa_571`
- `man@sofa_58`
- `man@sofa_59`
- `man@sofa_60`
- `man@sofa_61`
- `man@sofa_62`
- `man@sofa_63`
- `man@sofa_64`
- `man@sofa_65`
- `man@sofa_66`
- `man@sofa_67`
- `man@sofa_68`
- `man@sofa_69`
- `man@sofa_70`
- `man@sofa_71`
- `man@sofa_72`
- `man@sofa_73`
- `man@sofa_74`
- `man@sofa_75`
- `man@sofa_76`
- `man@sofa_77`
- `man@sofa_78`
- `man@sofa_79`
- `man@sofa_80`
- `man@sofa_81`
- `man@sofa_82`
- `man@sofa_83`
- `man@sofa_84`
- `man@sofa_85`
- `man@sofa_86`
- `man@sofa_87`
- `man@sofa_88`
- `man@sofa_89`
- `man@sofa_90`
- `man@sofa_91`
- `man@sofa_92`
- `man@sofa_93`
- `man@sofa_94`
- `man@sofa_95`
- `man@sofa_96`
- `man@sofa_97`
- `man@sofa_98`
- `man@sofa_99`
- `woman@ai_onhand2`
- `woman@ai_sofa15_2`
- `woman@ai_sofa16_2`
- `woman@ai_sofa17_2`
- `woman@ai_sofa18_2`
- `woman@ai_sofa19_2`
- `woman@ai_sofa20_2`
- `woman@ai_sofa21_2`
- `woman@ai_sofa22_2`
- `woman@ai_sofa23_2`
- `woman@ai_sofa24_2`
- `woman@ai_sofa25_2`
- `woman@ai_sofa26_2`
- `woman@ai_sofa27_2`
- `woman@ai_sofa28_2`
- `woman@ai_sofa29_2`
- `woman@ai_sofa30_2`
- `woman@ai_sofa31_2`
- `woman@ai_sofa32_2`
- `woman@ai_sofa33_2`
- `woman@ai_sofa_facesit2`
- `woman@ai_sofa_fmslap2`
- `woman@ai_sofa_mf_legsonback2`
- `woman@ai_sofa_mfslap2`
- `woman@ai_sofafap2`
- `woman@ai_ssofasleepmf2`
- `woman@cumshot_belly`
- `woman@midnight_ai_n_lucky_mf_sofa_o_1_2`
- `woman@midnight_lucky_mf_sofa_f_1_2`
- `woman@midnight_lucky_mf_sofa_fet_1_2`
- `woman@midnight_lucky_mf_sofa_fet_2_2`
- `woman@sofa1`
- `woman@sofa10`
- `woman@sofa11`
- `woman@sofa12`
- `woman@sofa13`
- `woman@sofa14`
- `woman@sofa15`
- `woman@sofa16`
- `woman@sofa2`
- `woman@sofa3`
- `woman@sofa4`
- `woman@sofa5`
- `woman@sofa6`
- `woman@sofa7`
- `woman@sofa8`
- `woman@sofa9`
- `woman@sofa_100`
- `woman@sofa_101`
- `woman@sofa_102`
- `woman@sofa_103`
- `woman@sofa_104`
- `woman@sofa_105`
- `woman@sofa_106`
- `woman@sofa_107`
- `woman@sofa_108`
- `woman@sofa_109`
- `woman@sofa_110`
- `woman@sofa_111`
- `woman@sofa_112`
- `woman@sofa_113`
- `woman@sofa_114`
- `woman@sofa_115`
- `woman@sofa_116`
- `woman@sofa_117`
- `woman@sofa_118`
- `woman@sofa_119`
- `woman@sofa_120`
- `woman@sofa_121`
- `woman@sofa_122`
- `woman@sofa_322`
- `woman@sofa_342`
- `woman@sofa_352`
- `woman@sofa_362`
- `woman@sofa_372`
- `woman@sofa_382`
- `woman@sofa_392`
- `woman@sofa_402`
- `woman@sofa_412`
- `woman@sofa_422`
- `woman@sofa_432`
- `woman@sofa_442`
- `woman@sofa_452`
- `woman@sofa_462`
- `woman@sofa_472`
- `woman@sofa_482`
- `woman@sofa_492`
- `woman@sofa_50`
- `woman@sofa_512`
- `woman@sofa_522`
- `woman@sofa_532`
- `woman@sofa_54`
- `woman@sofa_55`
- `woman@sofa_562`
- `woman@sofa_572`
- `woman@sofa_58`
- `woman@sofa_59`
- `woman@sofa_60`
- `woman@sofa_61`
- `woman@sofa_62`
- `woman@sofa_63`
- `woman@sofa_64`
- `woman@sofa_65`
- `woman@sofa_66`
- `woman@sofa_67`
- `woman@sofa_68`
- `woman@sofa_69`
- `woman@sofa_70`
- `woman@sofa_71`
- `woman@sofa_72`
- `woman@sofa_73`
- `woman@sofa_74`
- `woman@sofa_75`
- `woman@sofa_76`
- `woman@sofa_77`
- `woman@sofa_78`
- `woman@sofa_79`
- `woman@sofa_80`
- `woman@sofa_81`
- `woman@sofa_82`
- `woman@sofa_83`
- `woman@sofa_84`
- `woman@sofa_85`
- `woman@sofa_86`
- `woman@sofa_87`
- `woman@sofa_88`
- `woman@sofa_89`
- `woman@sofa_90`
- `woman@sofa_91`
- `woman@sofa_92`
- `woman@sofa_93`
- `woman@sofa_94`
- `woman@sofa_95`
- `woman@sofa_96`
- `woman@sofa_97`
- `woman@sofa_98`
- `woman@sofa_99`

**`table`** (104)

- `man@ai_table_10_1`
- `man@ai_table_11_1`
- `man@ai_table_12_1`
- `man@ai_table_13_1`
- `man@ai_table_14_1`
- `man@ai_table_15_1`
- `man@ai_table_16_1`
- `man@ai_table_17_1`
- `man@ai_table_18_1`
- `man@ai_table_19_1`
- `man@ai_table_1_1`
- `man@ai_table_20_1`
- `man@ai_table_21_1`
- `man@ai_table_22_1`
- `man@ai_table_23_1`
- `man@ai_table_24_1`
- `man@ai_table_25_1`
- `man@ai_table_26_1`
- `man@ai_table_2_1`
- `man@ai_table_3_1`
- `man@ai_table_4_1`
- `man@ai_table_5_1`
- `man@ai_table_6_1`
- `man@ai_table_7_1`
- `man@ai_table_8_1`
- `man@ai_table_9_1`
- `man@midnight_lucky_mf_table_v_1_1`
- `man@table_241`
- `man@table_251`
- `man@table_261`
- `man@table_271`
- `man@table_281`
- `man@table_291`
- `man@table_301`
- `man@table_311`
- `man@table_321`
- `man@table_331`
- `man@table_341`
- `man@table_351`
- `man@table_361`
- `man@table_37`
- `man@table_38`
- `man@table_39`
- `man@table_40`
- `man@table_41`
- `man@table_42`
- `man@table_44`
- `man@table_45`
- `man@table_46`
- `man@table_47`
- `man@table_48`
- `man@table_49`
- `woman@ai_table_10_2`
- `woman@ai_table_11_2`
- `woman@ai_table_12_2`
- `woman@ai_table_13_2`
- `woman@ai_table_14_2`
- `woman@ai_table_15_2`
- `woman@ai_table_16_2`
- `woman@ai_table_17_2`
- `woman@ai_table_18_2`
- `woman@ai_table_19_2`
- `woman@ai_table_1_2`
- `woman@ai_table_20_2`
- `woman@ai_table_21_2`
- `woman@ai_table_22_2`
- `woman@ai_table_23_2`
- `woman@ai_table_24_2`
- `woman@ai_table_25_2`
- `woman@ai_table_26_2`
- `woman@ai_table_2_2`
- `woman@ai_table_3_2`
- `woman@ai_table_4_2`
- `woman@ai_table_5_2`
- `woman@ai_table_6_2`
- `woman@ai_table_7_2`
- `woman@ai_table_8_2`
- `woman@ai_table_9_2`
- `woman@midnight_lucky_mf_table_v_1_2`
- `woman@table_242`
- `woman@table_252`
- `woman@table_262`
- `woman@table_272`
- `woman@table_282`
- `woman@table_292`
- `woman@table_302`
- `woman@table_312`
- `woman@table_322`
- `woman@table_332`
- `woman@table_342`
- `woman@table_352`
- `woman@table_362`
- `woman@table_37`
- `woman@table_38`
- `woman@table_39`
- `woman@table_40`
- `woman@table_41`
- `woman@table_42`
- `woman@table_44`
- `woman@table_45`
- `woman@table_46`
- `woman@table_47`
- `woman@table_48`
- `woman@table_49`

**`wall`** (94)

- `man@ai_glory_anal1`
- `man@ai_glory_vaginal1`
- `man@ai_n_lucky_mf_wall_v_1_1`
- `man@ai_wall_101`
- `man@ai_wall_111`
- `man@ai_wall_121`
- `man@ai_wall_131`
- `man@ai_wall_81`
- `man@ai_wall_91`
- `man@ai_wall_Blowjob1`
- `man@ai_wall_mf_fuckinmouth1`
- `man@ai_wall_mf_lickpussy1`
- `man@ai_wall_mf_pussyfap1`
- `man@ai_wall_Minet1`
- `man@midnight_lucky_mf_wall_o_1_1`
- `man@midnight_lucky_mf_wall_v_2_1`
- `man@midnight_lucky_mf_wall_v_3_1`
- `man@wall_1`
- `man@wall_141`
- `man@wall_151`
- `man@wall_16`
- `man@wall_171`
- `man@wall_18`
- `man@wall_19`
- `man@wall_2`
- `man@wall_20`
- `man@wall_21`
- `man@wall_22`
- `man@wall_23`
- `man@wall_24`
- `man@wall_25`
- `man@wall_26`
- `man@wall_27`
- `man@wall_28`
- `man@wall_29`
- `man@wall_3`
- `man@wall_30`
- `man@wall_31`
- `man@wall_32`
- `man@wall_33`
- `man@wall_34`
- `man@wall_35`
- `man@wall_36`
- `man@wall_4`
- `man@wall_5`
- `man@wall_6`
- `man@wall_7`
- `woman@ai_glory_anal2`
- `woman@ai_glory_vaginal2`
- `woman@ai_n_lucky_mf_wall_v_1_2`
- `woman@ai_wall_102`
- `woman@ai_wall_112`
- `woman@ai_wall_122`
- `woman@ai_wall_132`
- `woman@ai_wall_82`
- `woman@ai_wall_92`
- `woman@ai_wall_Blowjob2`
- `woman@ai_wall_mf_fuckinmouth2`
- `woman@ai_wall_mf_lickpussy2`
- `woman@ai_wall_mf_pussyfap2`
- `woman@ai_wall_Minet2`
- `woman@midnight_lucky_mf_wall_o_1_2`
- `woman@midnight_lucky_mf_wall_v_2_2`
- `woman@midnight_lucky_mf_wall_v_3_2`
- `woman@wall_1`
- `woman@wall_142`
- `woman@wall_152`
- `woman@wall_16`
- `woman@wall_172`
- `woman@wall_18`
- `woman@wall_19`
- `woman@wall_2`
- `woman@wall_20`
- `woman@wall_21`
- `woman@wall_22`
- `woman@wall_23`
- `woman@wall_24`
- `woman@wall_25`
- `woman@wall_26`
- `woman@wall_27`
- `woman@wall_28`
- `woman@wall_29`
- `woman@wall_3`
- `woman@wall_30`
- `woman@wall_31`
- `woman@wall_32`
- `woman@wall_33`
- `woman@wall_34`
- `woman@wall_35`
- `woman@wall_36`
- `woman@wall_4`
- `woman@wall_5`
- `woman@wall_6`
- `woman@wall_7`

### `mff` — 229 bundles (209,9 MB)

**Composição:** trio M+2F (3 atores).

**Pastas (20):** `bed`, `bed/bed_1`, `bed/bed_2`, `bed/bed_3`, `bed/bed_4`, `bed/bed_5`, `bed/bed_6`, `bed/bed_7`, `chair_G`, `glory`, `glory/glory_1`, `pillorymid`, `pillorytop`, `pool`, `sofa`, `sofa/sofa_1`, `sofa/sofa_2`, `sofa/sofa_3`, `sofa/sofa_4`, `table`

**`bed`** (63)

- `man@ai_bed_10_mff1`
- `man@ai_bed_11_mff1`
- `man@ai_bed_12_mff1`
- `man@ai_bed_5_mff1`
- `man@ai_bed_7_mff1`
- `man@ai_bed_8_mff1`
- `man@ai_bed_9_mff1`
- `man@ai_bed_mff_fuckfaceminet1`
- `man@ai_bed_mff_staytriohug1`
- `man@bed_12_mff1`
- `man@bed_13_mff1`
- `man@bed_14_mff1`
- `man@bed_15_mff1`
- `man@bed_16_mff1`
- `man@bed_17_mff1`
- `man@bed_18_mff1`
- `man@bed_19_mff1`
- `man@bed_20_mff1`
- `man@bed_21_man_mff`
- `man@bed_22_mff`
- `man@custom_bed_11_mff1`
- `woman@ai_bed_10_mff2`
- `woman@ai_bed_10_mff3`
- `woman@ai_bed_11_mff2`
- `woman@ai_bed_11_mff3`
- `woman@ai_bed_12_mff2`
- `woman@ai_bed_12_mff3`
- `woman@ai_bed_5_mff2`
- `woman@ai_bed_5_mff3`
- `woman@ai_bed_7_mff2`
- `woman@ai_bed_7_mff3`
- `woman@ai_bed_8_mff2`
- `woman@ai_bed_8_mff3`
- `woman@ai_bed_9_mff2`
- `woman@ai_bed_9_mff3`
- `woman@ai_bed_mff_fuckfaceminet2`
- `woman@ai_bed_mff_fuckfaceminet3`
- `woman@ai_bed_mff_staytriohug2`
- `woman@ai_bed_mff_staytriohug3`
- `woman@bed_12_mff2`
- `woman@bed_12_mff3`
- `woman@bed_13_mff2`
- `woman@bed_13_mff3`
- `woman@bed_14_mff2`
- `woman@bed_14_mff3`
- `woman@bed_15_mff2`
- `woman@bed_15_mff3`
- `woman@bed_16_mff2`
- `woman@bed_16_mff3`
- `woman@bed_17_mff2`
- `woman@bed_17_mff3`
- `woman@bed_18_mff2`
- `woman@bed_18_mff3`
- `woman@bed_19_mff2`
- `woman@bed_19_mff3`
- `woman@bed_20_mff2`
- `woman@bed_20_mff3`
- `woman@bed_21_woman1_mff`
- `woman@bed_21_woman2_mff`
- `woman@bed_22_woman1_mff`
- `woman@bed_22_woman2_mff`
- `woman@custom_bed_11_mff2`
- `woman@custom_bed_11_mff3`

**`bed/bed_1`** (3)

- `man@bed_1_man_mff`
- `woman@bed_1_woman1_mff`
- `woman@bed_1_woman2_mff`

**`bed/bed_2`** (3)

- `man@bed_2_man_mff`
- `woman@bed_2_woman1_mff`
- `woman@bed_2_woman2_mff`

**`bed/bed_3`** (3)

- `man@bed_3_man_mff`
- `woman@bed_3_woman1_mff`
- `woman@bed_3_woman2_mff`

**`bed/bed_4`** (3)

- `man@bed_4_man_mff`
- `woman@bed_4_woman1_mff`
- `woman@bed_4_woman2_mff`

**`bed/bed_5`** (3)

- `man@bed_5_man_mff`
- `woman@bed_5_woman1_mff`
- `woman@bed_5_woman2_mff`

**`bed/bed_6`** (3)

- `man@m`
- `woman@f1`
- `woman@f2`

**`bed/bed_7`** (3)

- `man@bed_7_man_mff`
- `woman@bed_7_woman1_mff`
- `woman@bed_7_woman2_mff`

**`chair_G`** (3)

- `man@ai_chair_G_fucktrio_mff1`
- `woman@ai_chair_G_fucktrio_mff2`
- `woman@ai_chair_G_fucktrio_mff3`

**`glory`** (3)

- `man@glory_1_mff`
- `woman@glory_1_woman1_mff`
- `woman@glory_1_woman2_mff`

**`glory/glory_1`** (3)

- `man@glory_1_mff`
- `woman@glory_1_woman1_mff`
- `woman@glory_1_woman2_mff`

**`pillorymid`** (33)

- `man@pillorymid_10_mff`
- `man@pillorymid_11_mff`
- `man@pillorymid_1_man_mff`
- `man@pillorymid_2_man_mff`
- `man@pillorymid_3_man_mff`
- `man@pillorymid_4_man_mff`
- `man@pillorymid_5_man_mff`
- `man@pillorymid_6_man_mff`
- `man@pillorymid_7_man_mff`
- `man@pillorymid_8_man_mff`
- `man@pillorymid_9_mff`
- `woman@pillorymid_10_woman1_mff`
- `woman@pillorymid_10_woman2_mff`
- `woman@pillorymid_11_woman1_mff`
- `woman@pillorymid_11_woman2_mff`
- `woman@pillorymid_1_woman1_mff`
- `woman@pillorymid_1_woman2_mff`
- `woman@pillorymid_2_woman1_mff`
- `woman@pillorymid_2_woman2_mff`
- `woman@pillorymid_3_woman1_mff`
- `woman@pillorymid_3_woman2_mff`
- `woman@pillorymid_4_woman1_mff`
- `woman@pillorymid_4_woman2_mff`
- `woman@pillorymid_5_woman1_mff`
- `woman@pillorymid_5_woman2_mff`
- `woman@pillorymid_6_woman1_mff`
- `woman@pillorymid_6_woman2_mff`
- `woman@pillorymid_7_woman1_mff`
- `woman@pillorymid_7_woman2_mff`
- `woman@pillorymid_8_woman1_mff`
- `woman@pillorymid_8_woman2_mff`
- `woman@pillorymid_9_woman1_mff`
- `woman@pillorymid_9_woman2_mff`

**`pillorytop`** (15)

- `man@pillorytop_1_man_mff`
- `man@pillorytop_2_man_mff`
- `man@pillorytop_3_man_mff`
- `man@pillorytop_4_man_mff`
- `man@pillorytop_5_man_mff`
- `woman@pillorytop_1_woman1_mff`
- `woman@pillorytop_1_woman2_mff`
- `woman@pillorytop_2_woman1_mff`
- `woman@pillorytop_2_woman2_mff`
- `woman@pillorytop_3_woman1_mff`
- `woman@pillorytop_3_woman2_mff`
- `woman@pillorytop_4_woman1_mff`
- `woman@pillorytop_4_woman2_mff`
- `woman@pillorytop_5_woman1_mff`
- `woman@pillorytop_5_woman2_mff`

**`pool`** (18)

- `man@pool1_mff1`
- `man@pool2_mff1`
- `man@pool3_mff1`
- `man@pool4_mff1`
- `man@pool5_mff1`
- `man@pool6_mff1`
- `woman@pool1_mff2`
- `woman@pool1_mff3`
- `woman@pool2_mff2`
- `woman@pool2_mff3`
- `woman@pool3_mff2`
- `woman@pool3_mff3`
- `woman@pool4_mff2`
- `woman@pool4_mff3`
- `woman@pool5_mff2`
- `woman@pool5_mff3`
- `woman@pool6_mff2`
- `woman@pool6_mff3`

**`sofa`** (40)

- `man@sofa_10_mff1`
- `man@sofa_11_mff1`
- `man@sofa_12_mff1`
- `man@sofa_13_mff1`
- `man@sofa_14_mff1`
- `man@sofa_15_mff1`
- `man@sofa_16_mff1`
- `man@sofa_17_mff`
- `man@sofa_5_mff1`
- `man@sofa_6_mff1`
- `man@sofa_7_mff1`
- `man@sofa_8_mff1`
- `man@sofa_9_mff1`
- `woman@sofa_10_mff2`
- `woman@sofa_10_mff3`
- `woman@sofa_11_mff2`
- `woman@sofa_11_mff3`
- `woman@sofa_12_mff2`
- `woman@sofa_12_mff3`
- `woman@sofa_13_mff2`
- `woman@sofa_13_mff3`
- `woman@sofa_14_mff1`
- `woman@sofa_14_mff2`
- `woman@sofa_14_mff3`
- `woman@sofa_15_mff2`
- `woman@sofa_15_mff3`
- `woman@sofa_16_mff2`
- `woman@sofa_16_mff3`
- `woman@sofa_17_woman1_mff`
- `woman@sofa_17_woman2_mff`
- `woman@sofa_5_mff2`
- `woman@sofa_5_mff3`
- `woman@sofa_6_mff2`
- `woman@sofa_6_mff3`
- `woman@sofa_7_mff2`
- `woman@sofa_7_mff3`
- `woman@sofa_8_mff2`
- `woman@sofa_8_mff3`
- `woman@sofa_9_mff2`
- `woman@sofa_9_mff3`

**`sofa/sofa_1`** (3)

- `man@sofa_1_man_mff`
- `woman@sofa_1_woman1_mff`
- `woman@sofa_1_woman2_mff`

**`sofa/sofa_2`** (3)

- `man@sofa_2_man_mff`
- `woman@sofa_2_woman1_mff`
- `woman@sofa_2_woman2_mff`

**`sofa/sofa_3`** (3)

- `man@sofa_3_man_mff`
- `woman@sofa_3_woman1_mff`
- `woman@sofa_3_woman2_mff`

**`sofa/sofa_4`** (3)

- `man@sofa_4_man_mff`
- `woman@sofa_4_woman1_mff`
- `woman@sofa_4_woman2_mff`

**`table`** (18)

- `man@table_1_mff1`
- `man@table_2_mff1`
- `man@table_3_mff1`
- `man@table_4_mff1`
- `man@table_5_mff1`
- `man@table_6_mff1`
- `woman@table_1_mff2`
- `woman@table_1_mff3`
- `woman@table_2_mff2`
- `woman@table_2_mff3`
- `woman@table_3_mff2`
- `woman@table_3_mff3`
- `woman@table_4_mff2`
- `woman@table_4_mff3`
- `woman@table_5_mff2`
- `woman@table_5_mff3`
- `woman@table_6_mff2`
- `woman@table_6_mff3`

### `mm` — 580 bundles (475,1 MB)

**Composição:** par M+M (2 atores).

**Pastas (18):** `bar_chair1`, `bed`, `cage_bot_1`, `cage_bot_2`, `chair`, `chair_g`, `eames`, `glory`, `pillorymid`, `pillorytop`, `pillow`, `pole`, `pool`, `rel`, `rel/wedding`, `sofa`, `table`, `wall`

**`bar_chair1`** (14)

- `man@ai_barstool_1_man1`
- `man@ai_barstool_1_man2`
- `man@ai_barstool_2_man1`
- `man@ai_barstool_2_man2`
- `man@ai_barstool_3_man1`
- `man@ai_barstool_3_man2`
- `man@barstool_1_man1`
- `man@barstool_1_man2`
- `man@barstool_4_man1`
- `man@barstool_4_man2`
- `man@barstool_5_man1`
- `man@barstool_5_man2`
- `man@barstool_6_man1`
- `man@barstool_6_man2`

**`bed`** (224)

- `man@ai_bed_40_man1`
- `man@ai_bed_40_man2`
- `man@ai_bed_41_man1`
- `man@ai_bed_41_man2`
- `man@ai_bed_42_man1`
- `man@ai_bed_42_man2`
- `man@ai_bed_43_man1`
- `man@ai_bed_43_man2`
- `man@ai_bed_44_man1`
- `man@ai_bed_44_man2`
- `man@ai_bed_45_man1`
- `man@ai_bed_45_man2`
- `man@ai_bed_46_man1`
- `man@ai_bed_46_man2`
- `man@ai_bed_47_man1`
- `man@ai_bed_47_man2`
- `man@ai_bed_48_man1`
- `man@ai_bed_48_man2`
- `man@ai_bed_49_man1`
- `man@ai_bed_49_man2`
- `man@ai_bed_50_man1`
- `man@ai_bed_50_man2`
- `man@ai_bed_51_man1`
- `man@ai_bed_51_man2`
- `man@ai_bed_52_man1`
- `man@ai_bed_52_man2`
- `man@ai_bed_53_man1`
- `man@ai_bed_53_man2`
- `man@ai_bed_54_man1`
- `man@ai_bed_54_man2`
- `man@ai_bed_55_man1`
- `man@ai_bed_55_man2`
- `man@ai_bed_56_man1`
- `man@ai_bed_56_man2`
- `man@ai_bed_57_man1`
- `man@ai_bed_57_man2`
- `man@ai_bed_mmdoggy1`
- `man@ai_bed_mmdoggy2`
- `man@ai_manobedience1`
- `man@ai_manobedience2`
- `man@bed_100_man1`
- `man@bed_100_man2`
- `man@bed_101_man1`
- `man@bed_101_man2`
- `man@bed_102_man1`
- `man@bed_102_man2`
- `man@bed_103_man1`
- `man@bed_103_man2`
- `man@bed_104_man1`
- `man@bed_104_man2`
- `man@bed_105_man1`
- `man@bed_105_man2`
- `man@bed_106_man1`
- `man@bed_106_man2`
- `man@bed_107_man1`
- `man@bed_107_man2`
- `man@bed_108_man1`
- `man@bed_108_man2`
- `man@bed_109_man1`
- `man@bed_109_man2`
- `man@bed_10_man1`
- `man@bed_10_man2`
- `man@bed_111_man1`
- `man@bed_111_man2`
- `man@bed_11_man1`
- `man@bed_11_man2`
- `man@bed_12_man1`
- `man@bed_12_man2`
- `man@bed_13_man1`
- `man@bed_13_man2`
- `man@bed_14_man1`
- `man@bed_14_man2`
- `man@bed_15_man1`
- `man@bed_15_man2`
- `man@bed_16_man1`
- `man@bed_16_man2`
- `man@bed_17_man1`
- `man@bed_17_man2`
- `man@bed_18_man1`
- `man@bed_18_man2`
- `man@bed_19_man1`
- `man@bed_19_man2`
- `man@bed_1_man1`
- `man@bed_1_man2`
- `man@bed_20_man1`
- `man@bed_20_man2`
- `man@bed_21_man1`
- `man@bed_21_man2`
- `man@bed_22_man1`
- `man@bed_22_man2`
- `man@bed_23_man1`
- `man@bed_23_man2`
- `man@bed_24_man1`
- `man@bed_24_man2`
- `man@bed_25_man1`
- `man@bed_25_man2`
- `man@bed_26_man1`
- `man@bed_26_man2`
- `man@bed_27_man1`
- `man@bed_27_man2`
- `man@bed_28_man1`
- `man@bed_28_man2`
- `man@bed_29_man1`
- `man@bed_29_man2`
- `man@bed_2_man1`
- `man@bed_2_man2`
- `man@bed_30_man1`
- `man@bed_30_man2`
- `man@bed_31_man1`
- `man@bed_31_man2`
- `man@bed_32_man1`
- `man@bed_32_man2`
- `man@bed_33_man1`
- `man@bed_33_man2`
- `man@bed_34_man1`
- `man@bed_34_man2`
- `man@bed_35_man1`
- `man@bed_35_man2`
- `man@bed_36_man1`
- `man@bed_36_man2`
- `man@bed_37_man1`
- `man@bed_37_man2`
- `man@bed_38_man1`
- `man@bed_38_man2`
- `man@bed_39_man1`
- `man@bed_39_man2`
- `man@bed_3_man1`
- `man@bed_3_man2`
- `man@bed_4_man1`
- `man@bed_4_man2`
- `man@bed_58_man1`
- `man@bed_58_man2`
- `man@bed_59_man1`
- `man@bed_59_man2`
- `man@bed_5_man1`
- `man@bed_5_man2`
- `man@bed_60_man1`
- `man@bed_60_man2`
- `man@bed_61_man1`
- `man@bed_61_man2`
- `man@bed_62_man1`
- `man@bed_62_man2`
- `man@bed_63_man1`
- `man@bed_63_man2`
- `man@bed_64_man1`
- `man@bed_64_man2`
- `man@bed_65_man1`
- `man@bed_65_man2`
- `man@bed_66_man1`
- `man@bed_66_man2`
- `man@bed_67_man1`
- `man@bed_67_man2`
- `man@bed_68_man1`
- `man@bed_68_man2`
- `man@bed_69_man1`
- `man@bed_69_man2`
- `man@bed_6_man1`
- `man@bed_6_man2`
- `man@bed_70_man1`
- `man@bed_70_man2`
- `man@bed_71_man1`
- `man@bed_71_man2`
- `man@bed_72_man1`
- `man@bed_72_man2`
- `man@bed_73_man1`
- `man@bed_73_man2`
- `man@bed_74_man1`
- `man@bed_74_man2`
- `man@bed_75_man1`
- `man@bed_75_man2`
- `man@bed_76_man1`
- `man@bed_76_man2`
- `man@bed_77_man1`
- `man@bed_77_man2`
- `man@bed_78_man1`
- `man@bed_78_man2`
- `man@bed_79_man1`
- `man@bed_79_man2`
- `man@bed_7_man1`
- `man@bed_7_man2`
- `man@bed_80_man1`
- `man@bed_80_man2`
- `man@bed_81_man1`
- `man@bed_81_man2`
- `man@bed_82_man1`
- `man@bed_82_man2`
- `man@bed_83_man1`
- `man@bed_83_man2`
- `man@bed_84_man1`
- `man@bed_84_man2`
- `man@bed_85_man1`
- `man@bed_85_man2`
- `man@bed_86_man1`
- `man@bed_86_man2`
- `man@bed_87_man1`
- `man@bed_87_man2`
- `man@bed_88_man1`
- `man@bed_88_man2`
- `man@bed_89_man1`
- `man@bed_89_man2`
- `man@bed_8_man1`
- `man@bed_8_man2`
- `man@bed_90_man1`
- `man@bed_90_man2`
- `man@bed_91_man1`
- `man@bed_91_man2`
- `man@bed_92_man1`
- `man@bed_92_man2`
- `man@bed_93_man1`
- `man@bed_93_man2`
- `man@bed_94_man1`
- `man@bed_94_man2`
- `man@bed_95_man1`
- `man@bed_95_man2`
- `man@bed_96_man1`
- `man@bed_96_man2`
- `man@bed_97_man1`
- `man@bed_97_man2`
- `man@bed_98_man1`
- `man@bed_98_man2`
- `man@bed_99_man1`
- `man@bed_99_man2`
- `man@bed_9_man1`
- `man@bed_9_man2`

**`cage_bot_1`** (8)

- `man@ai_cage_bot_1_1_man1`
- `man@ai_cage_bot_1_1_man2`
- `man@cage_bot_1_2_man1`
- `man@cage_bot_1_2_man2`
- `man@cage_bot_1_3_man1`
- `man@cage_bot_1_3_man2`
- `man@cage_bot_1_4_man1`
- `man@cage_bot_1_4_man2`

**`cage_bot_2`** (6)

- `man@ai_cage_bot_2_1_man1`
- `man@ai_cage_bot_2_1_man2`
- `man@ai_cage_bot_2_2_man1`
- `man@ai_cage_bot_2_2_man2`
- `man@ai_cage_bot_2_3_man1`
- `man@ai_cage_bot_2_3_man2`

**`chair`** (26)

- `man@ai_chair_3_man1`
- `man@ai_chair_3_man2`
- `man@ai_chair_4_man1`
- `man@ai_chair_4_man2`
- `man@chair_10_man1`
- `man@chair_10_man2`
- `man@chair_11_man1`
- `man@chair_11_man2`
- `man@chair_12_man1`
- `man@chair_12_man2`
- `man@chair_13_man1`
- `man@chair_13_man2`
- `man@chair_1_man1`
- `man@chair_1_man2`
- `man@chair_2_man1`
- `man@chair_2_man2`
- `man@chair_5_man1`
- `man@chair_5_man2`
- `man@chair_6_man1`
- `man@chair_6_man2`
- `man@chair_7_man1`
- `man@chair_7_man2`
- `man@chair_8_man1`
- `man@chair_8_man2`
- `man@chair_9_man1`
- `man@chair_9_man2`

**`chair_g`** (12)

- `man@chair_g_1_man1`
- `man@chair_g_1_man2`
- `man@chair_g_2_man1`
- `man@chair_g_2_man2`
- `man@chair_G_3_man1`
- `man@chair_G_3_man2`
- `man@chair_g_4_man1`
- `man@chair_g_4_man2`
- `man@chair_g_5_man1`
- `man@chair_g_5_man2`
- `man@chair_g_6_man1`
- `man@chair_g_6_man2`

**`eames`** (6)

- `man@eames_1_man1`
- `man@eames_1_man2`
- `man@eames_2_man1`
- `man@eames_2_man2`
- `man@eames_3_man1`
- `man@eames_3_man2`

**`glory`** (14)

- `man@ai_glory_1_man1`
- `man@ai_glory_1_man2`
- `man@ai_glory_2_man1`
- `man@ai_glory_2_man2`
- `man@ai_glory_3_man1`
- `man@ai_glory_3_man2`
- `man@glory_1_man1`
- `man@glory_1_man2`
- `man@glory_2_man1`
- `man@glory_2_man2`
- `man@glory_3_man1`
- `man@glory_3_man2`
- `man@glory_4_man1`
- `man@glory_4_man2`

**`pillorymid`** (4)

- `man@pillorymid_1_man1`
- `man@pillorymid_1_man2`
- `man@pillorymid_2_man1`
- `man@pillorymid_2_man2`

**`pillorytop`** (6)

- `man@pillorytop_1_man1`
- `man@pillorytop_1_man2`
- `man@pillorytop_2_man1`
- `man@pillorytop_2_man2`
- `man@pillorytop_4_man1`
- `man@pillorytop_4_man2`

**`pillow`** (14)

- `man@ai_pillow_2_man1`
- `man@ai_pillow_2_man2`
- `man@pillow_1_man1`
- `man@pillow_1_man2`
- `man@pillow_3_man1`
- `man@pillow_3_man2`
- `man@pillow_4_man1`
- `man@pillow_4_man2`
- `man@pillow_5_man1`
- `man@pillow_5_man2`
- `man@pillow_6_man1`
- `man@pillow_6_man2`
- `man@pillow_7_man1`
- `man@pillow_7_man2`

**`pole`** (8)

- `man@pole1_man1`
- `man@pole1_man2`
- `man@pole2_man1`
- `man@pole2_man2`
- `man@pole_3_man1`
- `man@pole_3_man2`
- `man@pole_4_man1`
- `man@pole_4_man2`

**`pool`** (30)

- `man@ai_pool_4_man1`
- `man@ai_pool_4_man2`
- `man@ai_pool_5_man1`
- `man@ai_pool_5_man2`
- `man@pool_10_man1`
- `man@pool_10_man2`
- `man@pool_11_man1`
- `man@pool_11_man2`
- `man@pool_12_man1`
- `man@pool_12_man2`
- `man@pool_13_man1`
- `man@pool_13_man2`
- `man@pool_14_man1`
- `man@pool_14_man2`
- `man@pool_15_man1`
- `man@pool_15_man2`
- `man@pool_1_man1`
- `man@pool_1_man2`
- `man@pool_2_man1`
- `man@pool_2_man2`
- `man@pool_3_man1`
- `man@pool_3_man2`
- `man@pool_6_man1`
- `man@pool_6_man2`
- `man@pool_7_man1`
- `man@pool_7_man2`
- `man@pool_8_man1`
- `man@pool_8_man2`
- `man@pool_9_man1`
- `man@pool_9_man2`

**`rel`** (8)

- `man@cuddle_man1`
- `man@cuddle_man2`
- `man@slowdance_invert_man1`
- `man@slowdance_invert_man2`
- `man@slowdance_kiss_man1`
- `man@slowdance_kiss_man2`
- `man@slowdance_man1`
- `man@slowdance_man2`

**`rel/wedding`** (10)

- `man@phase1_man1`
- `man@phase1_man2`
- `man@phase2_wait_man1`
- `man@phase2_wait_man2`
- `man@phase3_agree_man1`
- `man@phase3_agree_man2`
- `man@phase3_disagree_man1`
- `man@phase3_disagree_man2`
- `man@phase4_agree_loop_man1`
- `man@phase4_agree_loop_man2`

**`sofa`** (116)

- `man@ai_sofa_13_man1`
- `man@ai_sofa_13_man2`
- `man@ai_sofa_14_man1`
- `man@ai_sofa_14_man2`
- `man@ai_sofa_15_man1`
- `man@ai_sofa_15_man2`
- `man@ai_sofa_17_man1`
- `man@ai_sofa_17_man2`
- `man@ai_sofa_18_man1`
- `man@ai_sofa_18_man2`
- `man@ai_sofa_19_man1`
- `man@ai_sofa_19_man2`
- `man@ai_sofa_20_man1`
- `man@ai_sofa_20_man2`
- `man@midnight_lucky_mm_sofa_f_1_m1`
- `man@midnight_lucky_mm_sofa_f_1_m2`
- `man@sofa_10_man1`
- `man@sofa_10_man2`
- `man@sofa_11_man1`
- `man@sofa_11_man2`
- `man@sofa_12_man1`
- `man@sofa_12_man2`
- `man@sofa_16_man1`
- `man@sofa_16_man2`
- `man@sofa_1_man1`
- `man@sofa_1_man2`
- `man@sofa_21_man1`
- `man@sofa_21_man2`
- `man@sofa_22_man1`
- `man@sofa_22_man2`
- `man@sofa_23_man1`
- `man@sofa_23_man2`
- `man@sofa_24_man1`
- `man@sofa_24_man2`
- `man@sofa_25_man1`
- `man@sofa_25_man2`
- `man@sofa_26_man1`
- `man@sofa_26_man2`
- `man@sofa_27_man1`
- `man@sofa_27_man2`
- `man@sofa_28_man1`
- `man@sofa_28_man2`
- `man@sofa_29_man1`
- `man@sofa_29_man2`
- `man@sofa_2_man1`
- `man@sofa_2_man2`
- `man@sofa_30_man1`
- `man@sofa_30_man2`
- `man@sofa_31_man1`
- `man@sofa_31_man2`
- `man@sofa_32_man1`
- `man@sofa_32_man2`
- `man@sofa_33_man1`
- `man@sofa_33_man2`
- `man@sofa_34_man1`
- `man@sofa_34_man2`
- `man@sofa_35_man1`
- `man@sofa_35_man2`
- `man@sofa_36_man1`
- `man@sofa_36_man2`
- `man@sofa_37_man1`
- `man@sofa_37_man2`
- `man@sofa_38_man1`
- `man@sofa_38_man2`
- `man@sofa_39_man1`
- `man@sofa_39_man2`
- `man@sofa_3_man1`
- `man@sofa_3_man2`
- `man@sofa_40_man1`
- `man@sofa_40_man2`
- `man@sofa_41_man1`
- `man@sofa_41_man2`
- `man@sofa_42_man1`
- `man@sofa_42_man2`
- `man@sofa_43_man1`
- `man@sofa_43_man2`
- `man@sofa_44_man1`
- `man@sofa_44_man2`
- `man@sofa_45_man1`
- `man@sofa_45_man2`
- `man@sofa_46_man1`
- `man@sofa_46_man2`
- `man@sofa_47_man1`
- `man@sofa_47_man2`
- `man@sofa_48_man1`
- `man@sofa_48_man2`
- `man@sofa_49_man1`
- `man@sofa_49_man2`
- `man@sofa_4_man1`
- `man@sofa_4_man2`
- `man@sofa_50_man1`
- `man@sofa_50_man2`
- `man@sofa_51_man1`
- `man@sofa_51_man2`
- `man@sofa_52_man1`
- `man@sofa_52_man2`
- `man@sofa_53_man1`
- `man@sofa_53_man2`
- `man@sofa_54_man1`
- `man@sofa_54_man2`
- `man@sofa_55_man1`
- `man@sofa_55_man2`
- `man@sofa_56_man1`
- `man@sofa_56_man2`
- `man@sofa_57_man1`
- `man@sofa_57_man2`
- `man@sofa_5_man1`
- `man@sofa_5_man2`
- `man@sofa_6_man1`
- `man@sofa_6_man2`
- `man@sofa_7_man1`
- `man@sofa_7_man2`
- `man@sofa_8_man1`
- `man@sofa_8_man2`
- `man@sofa_9_man1`
- `man@sofa_9_man2`

**`table`** (38)

- `man@ai_table_10_man1`
- `man@ai_table_10_man2`
- `man@ai_table_1_man1`
- `man@ai_table_1_man2`
- `man@ai_table_2_man1`
- `man@ai_table_2_man2`
- `man@ai_table_3_man1`
- `man@ai_table_3_man2`
- `man@ai_table_4_man1`
- `man@ai_table_4_man2`
- `man@ai_table_5_man1`
- `man@ai_table_5_man2`
- `man@ai_table_6_man1`
- `man@ai_table_6_man2`
- `man@ai_table_7_man1`
- `man@ai_table_7_man2`
- `man@ai_table_8_man1`
- `man@ai_table_8_man2`
- `man@ai_table_9_man1`
- `man@ai_table_9_man2`
- `man@table_10_man1`
- `man@table_10_man2`
- `man@table_11_man1`
- `man@table_11_man2`
- `man@table_12_man1`
- `man@table_12_man2`
- `man@table_13_man1`
- `man@table_13_man2`
- `man@table_14_man1`
- `man@table_14_man2`
- `man@table_15_man1`
- `man@table_15_man2`
- `man@table_16_man1`
- `man@table_16_man2`
- `man@table_17_man1`
- `man@table_17_man2`
- `man@table_18_man1`
- `man@table_18_man2`

**`wall`** (36)

- `man@ai_wall_4_man1`
- `man@ai_wall_4_man2`
- `man@ai_wall_5_man1`
- `man@ai_wall_5_man2`
- `man@ai_wall_6_man1`
- `man@ai_wall_6_man2`
- `man@ai_wall_7_man1`
- `man@ai_wall_7_man2`
- `man@wall_10_man1`
- `man@wall_10_man2`
- `man@wall_11_man1`
- `man@wall_11_man2`
- `man@wall_12_man1`
- `man@wall_12_man2`
- `man@wall_13_man1`
- `man@wall_13_man2`
- `man@wall_14_man1`
- `man@wall_14_man2`
- `man@wall_15_man1`
- `man@wall_15_man2`
- `man@wall_16_man1`
- `man@wall_16_man2`
- `man@wall_17_man1`
- `man@wall_17_man2`
- `man@wall_1_man1`
- `man@wall_1_man2`
- `man@wall_2_man1`
- `man@wall_2_man2`
- `man@wall_3_man1`
- `man@wall_3_man2`
- `man@wall_4_man1`
- `man@wall_4_man2`
- `man@wall_8_man1`
- `man@wall_8_man2`
- `man@wall_9_man1`
- `man@wall_9_man2`

### `mmf` — 159 bundles (144,5 MB)

**Composição:** trio 2M+F (3 atores).

**Pastas (19):** `bed`, `bed/bed_1`, `bed/bed_2`, `bed/bed_3`, `bed/bed_4`, `bed/bed_5`, `bed/bed_6`, `glory`, `glory/glory_1`, `pillorymid`, `pillorytop`, `pool`, `sofa`, `sofa/sofa_1`, `sofa/sofa_2`, `sofa/sofa_3`, `sofa/sofa_4`, `sofa/sofa_5`, `table`

**`bed`** (45)

- `man@ai_bed_4_mmf1`
- `man@ai_bed_4_mmf2`
- `man@ai_bed_5_mmf1`
- `man@ai_bed_5_mmf2`
- `man@ai_bed_6_mmf1`
- `man@ai_bed_6_mmf2`
- `man@bed_10_mmf1`
- `man@bed_10_mmf2`
- `man@bed_11_mmf1`
- `man@bed_11_mmf2`
- `man@bed_12_mmf1`
- `man@bed_12_mmf2`
- `man@bed_13_mmf1`
- `man@bed_13_mmf2`
- `man@bed_14_man1_mmf`
- `man@bed_14_man2_mmf`
- `man@bed_15_man1_mmf`
- `man@bed_15_man2_mmf`
- `man@bed_16_man1_mmf`
- `man@bed_16_man2_mmf`
- `man@bed_17_man1_mmf`
- `man@bed_17_man2_mmf`
- `man@bed_18_man1_mmf`
- `man@bed_18_man2_mmf`
- `man@bed_7_mmf1`
- `man@bed_7_mmf2`
- `man@bed_8_mmf1`
- `man@bed_8_mmf2`
- `man@bed_9_mmf1`
- `man@bed_9_mmf2`
- `woman@ai_bed_4_mmf3`
- `woman@ai_bed_5_mmf3`
- `woman@ai_bed_6_mmf3`
- `woman@bed_10_mmf3`
- `woman@bed_11_mmf3`
- `woman@bed_12_mmf3`
- `woman@bed_13_mmf3`
- `woman@bed_14_woman_mmf`
- `woman@bed_15_woman_mmf`
- `woman@bed_16_woman_mmf`
- `woman@bed_17_mmf`
- `woman@bed_18_mmf`
- `woman@bed_7_mmf3`
- `woman@bed_8_mmf3`
- `woman@bed_9_mmf3`

**`bed/bed_1`** (3)

- `man@bed_1_man1_mmf`
- `man@bed_1_man2_mmf`
- `woman@bed_1_mmf`

**`bed/bed_2`** (3)

- `man@bed_2_man1_mmf`
- `man@bed_2_man2_mmf`
- `woman@bed_2_mmf`

**`bed/bed_3`** (3)

- `man@bed_3_man1_mmf`
- `man@bed_3_man2_mmf`
- `woman@bed_3_mmf`

**`bed/bed_4`** (3)

- `man@bed_4_man1_mmf`
- `man@bed_4_man2_mmf`
- `woman@bed_4_mmf`

**`bed/bed_5`** (3)

- `man@m1`
- `man@m2`
- `woman@f`

**`bed/bed_6`** (3)

- `man@bed_6_man1_mmf`
- `man@bed_6_man2_mmf`
- `woman@bed_6_mmf`

**`glory`** (3)

- `man@glory_1mmf1`
- `man@glory_1mmf2`
- `woman@glory_1mmf3`

**`glory/glory_1`** (3)

- `man@glory_1_man1_mmf`
- `man@glory_1_man2_mmf`
- `woman@glory_1_mmf`

**`pillorymid`** (21)

- `man@pillorymid_1_man1_mmf`
- `man@pillorymid_1_man2_mmf`
- `man@pillorymid_2_man1_mmf`
- `man@pillorymid_2_man2_mmf`
- `man@pillorymid_3_man1_mmf`
- `man@pillorymid_3_man2_mmf`
- `man@pillorymid_4_man1_mmf`
- `man@pillorymid_4_man2_mmf`
- `man@pillorymid_5_man1_mmf`
- `man@pillorymid_5_man2_mmf`
- `man@pillorymid_6_man1_mmf`
- `man@pillorymid_6_man2_mmf`
- `man@pillorymid_7_man1_mmf`
- `man@pillorymid_7_man2_mmf`
- `woman@pillorymid_1_woman_mmf`
- `woman@pillorymid_2_woman_mmf`
- `woman@pillorymid_3_woman_mmf`
- `woman@pillorymid_4_woman_mmf`
- `woman@pillorymid_5_woman_mmf`
- `woman@pillorymid_6_mmf`
- `woman@pillorymid_7_mmf`

**`pillorytop`** (12)

- `man@pillorytop_1_man1_mmf`
- `man@pillorytop_1_man2_mmf`
- `man@pillorytop_2_man1_mmf`
- `man@pillorytop_2_man2_mmf`
- `man@pillorytop_3_man1_mmf`
- `man@pillorytop_3_man2_mmf`
- `man@pillorytop_4_man1_mmf`
- `man@pillorytop_4_man2_mmf`
- `woman@pillorytop_1_woman_mmf`
- `woman@pillorytop_2_woman_mmf`
- `woman@pillorytop_3_woman_mmf`
- `woman@pillorytop_4_woman_mmf`

**`pool`** (6)

- `man@pool_1_mmf1`
- `man@pool_1_mmf2`
- `man@pool_2_mmf1`
- `man@pool_2_mmf2`
- `woman@pool_1_mmf3`
- `woman@pool_2_mmf3`

**`sofa`** (30)

- `man@sofa_10_mmf1`
- `man@sofa_10_mmf2`
- `man@sofa_11_man1_mmf`
- `man@sofa_11_man2_mmf`
- `man@sofa_12_man1_mmf`
- `man@sofa_12_man2_mmf`
- `man@sofa_13_man1_mmf`
- `man@sofa_13_man2_mmf`
- `man@sofa_6_man1_mmf`
- `man@sofa_6_man2_mmf`
- `man@sofa_6_mmf1`
- `man@sofa_6_mmf2`
- `man@sofa_7_man1_mmf`
- `man@sofa_7_man2_mmf`
- `man@sofa_7_mmf1`
- `man@sofa_7_mmf2`
- `man@sofa_8_mmf1`
- `man@sofa_8_mmf2`
- `man@sofa_9_mmf1`
- `man@sofa_9_mmf2`
- `woman@sofa_10_mmf3`
- `woman@sofa_11_mmf`
- `woman@sofa_12_mmf`
- `woman@sofa_13_mmf`
- `woman@sofa_6_mmf`
- `woman@sofa_6_woman_mmf`
- `woman@sofa_7_mmf`
- `woman@sofa_7_woman_mmf`
- `woman@sofa_8_mmf3`
- `woman@sofa_9_mmf3`

**`sofa/sofa_1`** (3)

- `man@sofa_1_man1_mmf`
- `man@sofa_1_man2_mmf`
- `woman@sofa_1_mmf`

**`sofa/sofa_2`** (3)

- `man@sofa_2_man1_mmf`
- `man@sofa_2_man2_mmf`
- `woman@sofa_2_mmf`

**`sofa/sofa_3`** (3)

- `man@sofa_3_man1_mmf`
- `man@sofa_3_man2_mmf`
- `woman@sofa_3_mmf`

**`sofa/sofa_4`** (3)

- `man@sofa_4_man1_mmf`
- `man@sofa_4_man2_mmf`
- `woman@sofa_4_mmf`

**`sofa/sofa_5`** (3)

- `man@sofa_5_man1_mmf`
- `man@sofa_5_man2_mmf`
- `woman@sofa_5_mmf`

**`table`** (6)

- `man@table_1_mmf1`
- `man@table_1_mmf2`
- `man@table_2_mmf1`
- `man@table_2_mmf2`
- `woman@table_1_mmf3`
- `woman@table_2_mmf3`

### `mmm` — 81 bundles (96,3 MB)

**Composição:** trio M+M+M (3 atores).

**Pastas (10):** `bed`, `bed/bed_1`, `bed/bed_2`, `bed/bed_3`, `bed/bed_4`, `pillorymid`, `pillorytop`, `pool`, `sofa`, `table`

**`bed`** (33)

- `man@ai_bed_1_man1`
- `man@ai_bed_1_man2`
- `man@ai_bed_1_man3`
- `man@ai_bed_2_man1`
- `man@ai_bed_2_man2`
- `man@ai_bed_2_man3`
- `man@ai_bed_3_man1`
- `man@ai_bed_3_man2`
- `man@ai_bed_3_man3`
- `man@ai_bed_4_man1`
- `man@ai_bed_4_man2`
- `man@ai_bed_4_man3`
- `man@ai_bed_5_man1`
- `man@ai_bed_5_man2`
- `man@ai_bed_5_man3`
- `man@ai_bed_6_man1`
- `man@ai_bed_6_man2`
- `man@ai_bed_6_man3`
- `man@ai_bed_7_man1`
- `man@ai_bed_7_man2`
- `man@ai_bed_7_man3`
- `man@bed_10_man1_mmm`
- `man@bed_10_man2_mmm`
- `man@bed_10_man3_mmm`
- `man@bed_11_man1_mmm`
- `man@bed_11_man2_mmm`
- `man@bed_11_man3_mmm`
- `man@bedmm_8_man1`
- `man@bedmm_8_man2`
- `man@bedmm_8_man3`
- `man@bedmm_9_man1`
- `man@bedmm_9_man2`
- `man@bedmm_9_man3`

**`bed/bed_1`** (3)

- `man@bed_1_man1_mmm`
- `man@bed_1_man2_mmm`
- `man@bed_1_man3_mmm`

**`bed/bed_2`** (3)

- `man@bed_2_man1_mmm`
- `man@bed_2_man2_mmm`
- `man@bed_2_man3_mmm`

**`bed/bed_3`** (3)

- `man@bed_3_man1_mmm`
- `man@bed_3_man2_mmm`
- `man@bed_3_man3_mmm`

**`bed/bed_4`** (3)

- `man@bed_4_man1_mmm`
- `man@bed_4_man2_mmm`
- `man@bed_4_man3_mmm`

**`pillorymid`** (6)

- `man@pillorymid_1_man1_mmm`
- `man@pillorymid_1_man2_mmm`
- `man@pillorymid_1_man3_mmm`
- `man@pillorymid_2_man1_mmm`
- `man@pillorymid_2_man2_mmm`
- `man@pillorymid_2_man3_mmm`

**`pillorytop`** (3)

- `man@pillorytop_1_man1_mmm`
- `man@pillorytop_1_man2_mmm`
- `man@pillorytop_1_man3_mmm`

**`pool`** (9)

- `man@pool_1_mmm1`
- `man@pool_1_mmm2`
- `man@pool_1_mmm3`
- `man@pool_2_mmm1`
- `man@pool_2_mmm2`
- `man@pool_2_mmm3`
- `man@pool_3_mmm1`
- `man@pool_3_mmm2`
- `man@pool_3_mmm3`

**`sofa`** (12)

- `man@sofa_1_mmm1`
- `man@sofa_1_mmm2`
- `man@sofa_1_mmm3`
- `man@sofa_2_mmm1`
- `man@sofa_2_mmm2`
- `man@sofa_2_mmm3`
- `man@sofa_3_man1_mmm`
- `man@sofa_3_man2_mmm`
- `man@sofa_3_man3_mmm`
- `man@sofa_4_man1_mmm`
- `man@sofa_4_man2_mmm`
- `man@sofa_4_man3_mmm`

**`table`** (6)

- `man@table_1_mmm1`
- `man@table_1_mmm2`
- `man@table_1_mmm3`
- `man@table_2_mmm1`
- `man@table_2_mmm2`
- `man@table_2_mmm3`

## 3. Duplicados e anomalias

- **17 nomes de arquivo aparecem em mais de uma pasta**.
  **7 são byte-a-byte idênticos** e **10 têm o mesmo nome mas conteúdo diferente** (tamanho/hash).
  Não deduplicar só pelo nome; comparar o hash e, nos diferentes, escolher a cópia canônica
  por categoria/local e validar o clipe. O CSV mantém todas as linhas.

  - `drum@drum_1_single_m` → `m/drum`, `m_drum` (**conteúdo diferente**)
  - `man@drum_1_single_m` → `m/drum`, `m_drum` (**conteúdo diferente**)
  - `man@glory_1_mff` → `mff/glory/glory_1`, `mff/glory` (**conteúdo diferente**)
  - `woman@ai_bed_analspina2` → `ff/bed`, `mf/bed` (**conteúdo diferente**)
  - `woman@ai_bed_stayhug1` → `ff/bed`, `mf/bed` (idêntico)
  - `woman@ai_bed_stayhug2` → `ff/bed`, `mf/bed` (idêntico)
  - `woman@ai_chairsitw` → `f/chair`, `f/chair_g` (idêntico)
  - `woman@ai_relaxsitwomanchair` → `f/chair`, `f/chair_g` (idêntico)
  - `woman@bed_1_woman1_fff` → `fff/bed/bed_1`, `fff/bed_1` (**conteúdo diferente**)
  - `woman@bed_1_woman2_fff` → `fff/bed/bed_1`, `fff/bed_1` (**conteúdo diferente**)
  - `woman@bed_1_woman3_fff` → `fff/bed/bed_1`, `fff/bed_1` (**conteúdo diferente**)
  - `woman@drum_1_single_f` → `f/drum`, `f_drum` (**conteúdo diferente**)
  - `woman@glory_1_woman1_mff` → `mff/glory/glory_1`, `mff/glory` (**conteúdo diferente**)
  - `woman@glory_1_woman2_mff` → `mff/glory/glory_1`, `mff/glory` (**conteúdo diferente**)
  - `woman@pool_10_woman2` → `ff/chair`, `ff/pool` (idêntico)
  - `woman@pool_11_woman2` → `ff/chair`, `ff/pool` (idêntico)
  - `woman@pool_13_woman2` → `ff/chair`, `ff/pool` (idêntico)

- **1 bundle incompleto:** `mf/bed/woman@ai_bed_stayhug2.filepart` (883 872 bytes).
  Não importar; baixar/extrair de novo.
- **2 arquivos sem `ator@`:** `ff/sofa/ai_n_sofa_ff_mutualmast1` e `...2`. O nome é o clipe.
  Provavelmente bundle de par FF sem prefixo de ator; validar no import.

## 4. Categorias que não existem neste export

| Procurada | Situação |
| --- | --- |
| `mmmf` (3M+F) | não existe pasta nem clipe com esse padrão |
| `ffff`, `mmmm`, `mmmmm` | não existem |
| `mmff`, `mfff`, `mmfff` | não existem |
| `f_drum`/`m_drum` como cena de par | são ator + prop de tambor, não par |

Se o catálogo completo do cliente tiver cenas de 4+ atores, elas não estão separadas por
categoria neste export; a única exceção são os clipes de dança em `ingame` com 4 bundles.

## 5. `.anim` do projeto Unity exportado

`C:\dev\exported\ExportedProject\Assets` — **80 `.anim`**, 325,1 MB.

A varredura é recursiva em `Assets/`. A maioria está em `Assets/AnimationClip`; também há
1 arquivo em `Assets/Resources/animcampivots` (0 bytes). Arquivos de 0 byte são clips
vazios/placeholder e não devem entrar no import.

| Arquivo | MB |
| --- | ---: |
| `AnimationClip/Birthday_rotate.anim` | 0,6 |
| `AnimationClip/blink.anim` | 0,2 |
| `AnimationClip/blink_0.anim` | 0,2 |
| `AnimationClip/Cloth_moving.anim` | 0,0 |
| `AnimationClip/Cubes.anim` | 0,5 |
| `AnimationClip/cumshot_1.anim` | 1,9 |
| `AnimationClip/cumshot_2.anim` | 0,1 |
| `AnimationClip/cumshot_3.anim` | 0,1 |
| `AnimationClip/dance.anim` | 4,4 |
| `AnimationClip/Disabled.anim` | 0,0 |
| `AnimationClip/Disabled_0.anim` | 0,0 |
| `AnimationClip/drum_1_single_f.anim` | 0,3 |
| `AnimationClip/drum_1_single_m.anim` | 0,3 |
| `AnimationClip/Fire_BDSM.anim` | 0,0 |
| `AnimationClip/Fire_ground 1.anim` | 0,0 |
| `AnimationClip/Flap.anim` | 0,1 |
| `AnimationClip/Garland_Color.anim` | 0,0 |
| `AnimationClip/Garland_Move.anim` | 0,0 |
| `AnimationClip/Glide.anim` | 0,1 |
| `AnimationClip/guitar_1_single_f.anim` | 0,2 |
| `AnimationClip/guitar_1_single_m.anim` | 0,2 |
| `AnimationClip/Highlighted.anim` | 0,0 |
| `AnimationClip/Highlighted_0.anim` | 0,0 |
| `AnimationClip/idle.anim` | 0,0 |
| `AnimationClip/idle_0.anim` | 0,0 |
| `AnimationClip/Load Rotate.anim` | 0,0 |
| `AnimationClip/Message Blinking Char Select.anim` | 0,0 |
| `AnimationClip/Normal.anim` | 0,0 |
| `AnimationClip/Normal_0.anim` | 0,0 |
| `AnimationClip/orgasm_1.anim` | 0,2 |
| `AnimationClip/orgasm_2.anim` | 0,2 |
| `AnimationClip/orgasm_3.anim` | 0,2 |
| `AnimationClip/Poster_anim.anim` | 0,0 |
| `AnimationClip/Pressed.anim` | 0,0 |
| `AnimationClip/Pressed_0.anim` | 0,0 |
| `AnimationClip/run.anim` | 1,4 |
| `AnimationClip/run_0.anim` | 1,4 |
| `AnimationClip/slowdance_invert_man.anim` | 8,8 |
| `AnimationClip/slowdance_invert_man1.anim` | 8,8 |
| `AnimationClip/slowdance_invert_man2.anim` | 8,8 |
| `AnimationClip/slowdance_invert_woman.anim` | 8,8 |
| `AnimationClip/slowdance_invert_woman1.anim` | 9,0 |
| `AnimationClip/slowdance_invert_woman2.anim` | 8,8 |
| `AnimationClip/slowdance_kiss_man.anim` | 7,4 |
| `AnimationClip/slowdance_kiss_man1.anim` | 6,8 |
| `AnimationClip/slowdance_kiss_man2.anim` | 6,8 |
| `AnimationClip/slowdance_kiss_woman.anim` | 6,6 |
| `AnimationClip/slowdance_kiss_woman1.anim` | 7,5 |
| `AnimationClip/slowdance_kiss_woman2.anim` | 7,4 |
| `AnimationClip/slowdance_man.anim` | 7,2 |
| `AnimationClip/slowdance_man1.anim` | 6,6 |
| `AnimationClip/slowdance_man2.anim` | 6,6 |
| `AnimationClip/slowdance_woman.anim` | 6,5 |
| `AnimationClip/slowdance_woman1.anim` | 7,2 |
| `AnimationClip/slowdance_woman2.anim` | 7,2 |
| `AnimationClip/squirt.anim` | 0,0 |
| `AnimationClip/stay_pose_1.anim` | 2,7 |
| `AnimationClip/stay_pose_1_0.anim` | 15,9 |
| `AnimationClip/stay_pose_2.anim` | 2,7 |
| `AnimationClip/stay_pose_2_0.anim` | 3,2 |
| `AnimationClip/stay_pose_3.anim` | 2,7 |
| `AnimationClip/stay_pose_3_0.anim` | 3,3 |
| `AnimationClip/stay_pose_4.anim` | 17,3 |
| `AnimationClip/stay_pose_4_0.anim` | 18,6 |
| `AnimationClip/stay_pose_5.anim` | 17,5 |
| `AnimationClip/stay_pose_5_0.anim` | 18,8 |
| `AnimationClip/strip1.anim` | 8,4 |
| `AnimationClip/strip2.anim` | 9,1 |
| `AnimationClip/strip3.anim` | 23,5 |
| `AnimationClip/strip4.anim` | 16,8 |
| `AnimationClip/swim.anim` | 4,6 |
| `AnimationClip/swim_0.anim` | 4,2 |
| `AnimationClip/Take 001.anim` | 0,0 |
| `AnimationClip/Take 001_0.anim` | 0,9 |
| `AnimationClip/Take 001_1.anim` | 0,5 |
| `AnimationClip/Take 001_2.anim` | 0,1 |
| `AnimationClip/Take 001_3.anim` | 0,0 |
| `AnimationClip/walk.anim` | 2,3 |
| `AnimationClip/walk_0.anim` | 2,5 |
| `Resources/animcampivots/Take 001.anim` | 0,0 |

Esses arquivos são clipes soltos/poses/pares usados na publicação atual. Eles **não**
substituem o catálogo de bundles: cobrem idle/walk/pose, `slowdance_*`, `strip*`, `dance`,
`run`, `swim` e props. Muitos dos arquivos pequenos são de **UI/props/efeitos**
(`Normal`, `Pressed`, `Highlighted`, `Disabled`, `Garland_*`, `Message Blinking...`), não
de avatar. Para pares M/F, o `.anim` do projeto é a fonte que reproduz a pose correta (o
bundle `mf` traz um rest girado ~180°); ver `docs/guides/3dx-projeto-exportado.md`.

## 6. Notas para o plano de importação

1. **Ordem sugerida:** `ingame` (danças/emotes, maior valor visível) → solos `f`/`m` →
   pares `mf`/`ff`/`mm` → trios `mmf`/`mff`/`fff`/`mmm`. Os trios são poucos e podem ficar
   para a última leva.
2. **Cena = N bundles.** O importador precisa agrupar por nome-base e sufixo de participante,
   não importar cada bundle como um clipe independente. Sem isso, um trio vira três clipes
   desconexos.
3. **Offset/giro do par:** derivar do frame 0 dos dois rigs, como já feito em `pair01`.
   Não calibrar à mão por cena; criar uma tabela `cena → offset/yaw` só para exceções.
4. **Rig pelo path, não pelo nome do arquivo.** `slowdance_man.anim` anima o rig feminino;
   o prefixo `man`/`woman` do bundle pode não corresponder ao rig das curvas.
5. **Pares M/F:** para os clipes que existem no projeto, importar o `.anim` com
   `import_anim_project.py --anim-root` (rest do prefab). Para os que só existem em bundle,
   validar o rest antes de retargetar; o bundle `mf` tem rest girado ~180°.
6. **`.filepart` e duplicados:** excluir o `.filepart`; deduplicar bundles por hash.
7. **Cobertura:** este inventário é a lista de conferência. Depois do export completo (Fase
   P0), rodar de novo e comparar por nome; o que faltar vira linha de `cobertura.csv`.
8. **Volume:** 4 787 MB de bundles. Processar por categoria/lote e guardar o JSON/GLB fora
   do git; o repo só recebe o manifesto e os GLBs publicados.

## 7. Como regenerar

```powershell
py -3.11 tools/3dx/inventory_animations.py `
  --animation-dir C:/dev/Mv444/AssetBundles/animation `
  --project-anim-dir C:/dev/exported/ExportedProject/Assets `
  --out-dir docs/roadmap
```

O script não altera os bundles; só lê nome/tamanho. A lista é ordenada por categoria, pasta
e nome do arquivo.
