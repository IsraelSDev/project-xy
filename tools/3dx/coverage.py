"""Relatório de cobertura do projeto exportado (Fase P0 do roadmap de migração).

Varre o projeto Unity exportado e responde duas perguntas antes de trocar o leitor:

1. **Cobertura de clipes** — quais clipes que o jogo usa existem de fato no export
   (`wave`, `dance`, `beer`/`drink`, `sit`...) e com qual rig cada `.anim` foi autorado
   (`man`/`woman bone POSE PIVOT` × `Bip01`). Saída: `tools/3dx/build/cobertura.csv`.
2. **Manifesto da fonte** — versão do editor, contagens e hash dos arquivos-chave, para
   amarrar qualquer medição futura a um export específico. Saída:
   `tools/3dx/build/source-export.json`.

Nada é copiado para o git: os dois arquivos caem em `tools/3dx/build/` (ignorado).

Uso::

    py -3.11 tools/3dx/coverage.py
    py -3.11 tools/3dx/coverage.py --project "E:/dev/exported/ExportedProject"
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PROJECT = Path(os.environ.get("THREEDX_PROJECT", r"E:\dev\exported\ExportedProject"))
DEFAULT_OUTDIR = ROOT / "tools/3dx/build"

# Clipes que o jogo precisa hoje (roadmap, seção P0). Cada item é (nome, regex no arquivo).
REQUIRED = [
    ("idle", r"^idle$"),
    ("walk", r"^walk$"),
    ("run", r"^run$"),
    ("swim", r"^swim$"),
    ("dance", r"^dance$"),
    ("wave", r"^wave$"),
    ("beer/drink", r"beer|drink"),
    ("sit", r"^sit($|_)"),
    ("pose (stay_pose)", r"^stay_pose_"),
    ("par: slowdance", r"^slowdance_(man|woman)$"),
    ("par: beijo", r"^slowdance_kiss_"),
    ("par: invertida", r"^slowdance_invert_"),
    ("strip", r"^strip\d"),
]

# Toda categoria precisa estar mapeada: clipe fora da lista vira "desconhecido" e aparece no
# fim do relatório para alguém decidir (é o critério de aceite da P0).
CATEGORIES = [
    ("base", r"^(idle|walk|run|swim|dance|strip\d)"),
    ("face", r"^blink"),
    ("par", r"^slowdance"),
    ("pose", r"^stay_pose_"),
    ("adulto", r"^(cumshot|orgasm|squirt)"),
    ("interface", r"^(Normal|Pressed|Highlighted|Disabled|Message Blinking|Load Rotate|Take 001)"),
    (
        "prop/cena",
        r"^(Birthday_rotate|Cubes|Poster_anim|Garland|Fire|Flap|Glide|Cloth_moving|drum_|guitar_)",
    ),
]

RIG_PATTERNS = ("man", "woman")


def classify(name: str) -> str:
    for category, pattern in CATEGORIES:
        if re.search(pattern, name):
            return category
    return "desconhecido"


def describe_anim(path: Path) -> dict:
    """Lê o `.anim` (YAML) e devolve rig, contagem de curvas, sample rate e duração.

    O rig vem do prefixo do `path:` de cada curva (`man`/`woman bone POSE PIVOT`) — nunca do nome
    do arquivo, que é o do parceiro (`slowdance_man.anim` anima o rig `woman`). Cuidado com
    substring: `"man bone POSE PIVOT"` também casa dentro de `"woman bone POSE PIVOT"`.
    """
    text = path.read_text(encoding="utf-8", errors="ignore")
    rigs = sorted(set(re.findall(r"path:\s*(\w+) bone POSE PIVOT", text)))
    if not rigs and "Bip01" in text:
        rigs = ["bip01"]
    sample_rate = re.search(r"m_SampleRate:\s*([\d.]+)", text)
    times = [float(value) for value in re.findall(r"time:\s*([\d.]+)", text)]
    return {
        "rig": "+".join(rigs) if rigs else "?",
        "curves": text.count("m_Curve:"),
        "sample_rate": float(sample_rate.group(1)) if sample_rate else None,
        "seconds": max(times) if times else None,
    }


def sha256(path: Path) -> dict:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return {"sha256": digest.hexdigest(), "bytes": path.stat().st_size}


def count_files(directory: Path, pattern: str = "*") -> int:
    if not directory.is_dir():
        return 0
    return sum(1 for path in directory.rglob(pattern) if path.is_file() and path.suffix != ".meta")


def main() -> None:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("--project", default=str(DEFAULT_PROJECT), help="raiz do ExportedProject")
    ap.add_argument("--outdir", default=str(DEFAULT_OUTDIR))
    args = ap.parse_args()

    project = Path(args.project)
    animations_dir = project / "Assets/AnimationClip"
    if not animations_dir.is_dir():
        raise SystemExit(f"pasta de clipes não encontrada: {animations_dir}")
    outdir = Path(args.outdir) if Path(args.outdir).is_absolute() else ROOT / args.outdir
    outdir.mkdir(parents=True, exist_ok=True)

    clips = []
    for path in sorted(animations_dir.glob("*.anim")):
        info = describe_anim(path)
        clips.append(
            {
                "name": path.stem,
                "file": path.name,
                "category": classify(path.stem),
                **info,
            }
        )

    # Cobertura dos itens obrigatórios.
    required_rows = []
    for need, pattern in REQUIRED:
        matches = [clip["name"] for clip in clips if re.search(pattern, clip["name"])]
        required_rows.append(
            {
                "status": "presente" if matches else "ausente",
                "necessidade": need,
                "categoria": "",
                "arquivo": ", ".join(matches) if matches else "—",
                "rig": ", ".join(sorted({clip["rig"] for clip in clips if clip["name"] in matches}))
                if matches
                else "—",
                "curvas": "",
                "sample_rate": "",
                "segundos": "",
            }
        )

    clip_rows = [
        {
            "status": "presente",
            "necessidade": "",
            "categoria": clip["category"],
            "arquivo": clip["file"],
            "rig": clip["rig"],
            "curvas": clip["curves"],
            "sample_rate": clip["sample_rate"] if clip["sample_rate"] is not None else "",
            "segundos": clip["seconds"] if clip["seconds"] is not None else "",
        }
        for clip in clips
    ]

    csv_path = outdir / "cobertura.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "status",
                "necessidade",
                "categoria",
                "arquivo",
                "rig",
                "curvas",
                "sample_rate",
                "segundos",
            ],
        )
        writer.writeheader()
        writer.writerows(required_rows)
        writer.writerows(clip_rows)

    version_file = project / "ProjectSettings/ProjectVersion.txt"
    editor_version = None
    if version_file.is_file():
        found = re.search(r"m_EditorVersion:\s*(\S+)", version_file.read_text(encoding="utf-8"))
        editor_version = found.group(1) if found else None

    key_files = {
        "man.prefab": project / "Assets/Resources/man/man.prefab",
        "woman.prefab": project / "Assets/Resources/woman/woman.prefab",
        "walk.anim": animations_dir / "walk.anim",
        "path_id_map.json": project.parent / "AuxiliaryFiles/path_id_map.json",
    }
    hashes = {name: sha256(path) for name, path in key_files.items() if path.is_file()}

    unknown = sorted(clip["name"] for clip in clips if clip["category"] == "desconhecido")
    missing = [row["necessidade"] for row in required_rows if row["status"] == "ausente"]
    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "project": str(project),
        "unity": {"editorVersion": editor_version},
        "counts": {
            "meshes": count_files(project / "Assets/Mesh", "*.asset"),
            "materials": count_files(project / "Assets/Material"),
            "textures": count_files(project / "Assets/Texture2D", "*.png"),
            "animations": len(clips),
            "scenes": count_files(project / "Assets/scenes", "*.unity"),
            "prefabs": count_files(project / "Assets", "*.prefab"),
        },
        "hashes": hashes,
        "coverage": {
            "requiredPresent": [row["necessidade"] for row in required_rows if row["status"] == "presente"],
            "requiredMissing": missing,
            "unknownClips": unknown,
        },
    }
    manifest_path = outdir / "source-export.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    print(f"[cobertura] {len(clips)} clipes -> {csv_path.relative_to(ROOT)}")
    for row in required_rows:
        print(f"  {row['status']:8} {row['necessidade']:20} {row['arquivo']}")
    if unknown:
        print(f"  desconhecidos ({len(unknown)}): {', '.join(unknown)}")
    print(f"[manifesto] {manifest_path.relative_to(ROOT)} (Unity {editor_version})")
    print(f"  contagens: {manifest['counts']}")


if __name__ == "__main__":
    main()
