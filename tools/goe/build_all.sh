#!/usr/bin/env bash
# Gera todos os GLB do GoE a partir dos .blend do pacote: export -> hierarquia FK -> ajustes por peça.
#
# Uso:
#   BLENDER=/caminho/blender.exe tools/goe/build_all.sh <pasta-com-os-.blend> <pasta-de-saida> [item ...]
#
# `item` = nome do arquivo de saída sem extensão (ex.: GoE_Male). Sem itens, gera todos.
# Não salva os .blend. Depois: tools/goe/build_manifest.py e tools/goe/verify_goe.py na pasta de saída.
set -u
cd "$(dirname "$0")/../.." || exit 1

BLENDER="${BLENDER:-blender}"
SRC="${1:?pasta com Male_Basemesh_*.blend e Female_Basemesh_*.blend}"
OUT="${2:?pasta de saída}"
shift 2
WANT=("$@")

MALE=$(ls "$SRC"/Male_Basemesh_*.blend | head -1)
FEMALE=$(ls "$SRC"/Female_Basemesh_*.blend | head -1)
mkdir -p "$OUT/raw" "$OUT/fk" "$OUT/logs"

# gênero  item-de-export  nome-do-arquivo  [pós-processo: remap | remap+flare]
JOBS=(
  "male body GoE_Male"
  "male genitals GoE_M_Genitals"
  "male hair-1 GoE_M_Hair01"
  "male hair-2 GoE_M_Hair02"
  "male hair-3 GoE_M_Hair03"
  "male top-fitness GoE_M_Top_Fitness remap+flare"
  "male bottom-fitness GoE_M_Bottom_Fitness"
  "male shoes-fitness GoE_M_Shoes_Fitness"
  "male outerwear-street GoE_M_Outerwear_Street remap+flare"
  "male bottom-street GoE_M_Bottom_Street"
  "female body GoE_Female"
  "female hair-1 GoE_F_Hair01"
  "female hair-2 GoE_F_Hair02"
  "female hair-3 GoE_F_Hair03"
  "female top-casualsport GoE_F_Top_CasualSport remap"
  "female bottom-casualsport GoE_F_Bottom_CasualSport"
  "female shoes-casual GoE_F_Shoes_Casual"
  "female top-sportswear GoE_F_Top_Sportswear remap"
  "female bottom-sportswear GoE_F_Bottom_Sportswear"
)

wanted() {
  [ ${#WANT[@]} -eq 0 ] && return 0
  for name in "${WANT[@]}"; do [ "$name" = "$1" ] && return 0; done
  return 1
}

for job in "${JOBS[@]}"; do
  read -r gender item name post <<< "$job"
  wanted "$name" || continue
  blend="$MALE"; [ "$gender" = "female" ] && blend="$FEMALE"

  "$BLENDER" -b "$blend" --factory-startup --python tools/goe/export_goe.py -- \
    --gender "$gender" --item "$item" --out "$OUT/raw" > "$OUT/logs/$name.export.log" 2>&1
  [ -f "$OUT/raw/$name.glb" ] || { echo "FALHA export $name"; continue; }

  python tools/goe/fk_hierarchy.py "$OUT/raw/$name.glb" "$OUT/fk/$name.glb" > "$OUT/logs/$name.fk.log" 2>&1 \
    || { echo "FALHA fk $name"; continue; }
  cp "$OUT/fk/$name.glb" "$OUT/$name.glb"

  case "${post:-}" in
    remap|remap+flare)
      python tools/goe/remap_shoulder_weights.py "$OUT/fk/$name.glb" "$OUT/$name.glb" > "$OUT/logs/$name.remap.log" 2>&1 \
        || { echo "FALHA remap $name"; continue; }
      ;;
  esac
  if [ "${post:-}" = "remap+flare" ]; then
    # Caimento da camiseta fitness sobre a calça street (ver flare_hem.py).
    cp "$OUT/$name.glb" "$OUT/fk/$name.remap.glb"
    python tools/goe/flare_hem.py "$OUT/fk/$name.remap.glb" "$OUT/$name.glb" --delta 0.02 --y-full 1.10 --y-fade 1.20 \
      > "$OUT/logs/$name.flare.log" 2>&1 || { echo "FALHA flare $name"; continue; }
  fi
  echo "OK $name"
done
echo "FIM"
