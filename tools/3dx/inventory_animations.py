#!/usr/bin/env python3
"""Gera o inventário das animações do export 3DX.

Lê a pasta `animation` dos AssetBundles (uma pasta por categoria de
composição: f, m, mf, ff, mm, mmf, mff, fff, mmm, ingame, f_drum, m_drum)
e, opcionalmente, os `.anim` do projeto Unity exportado.

Saída:
  - Markdown com resumo por categoria e lista completa por pasta;
  - CSV com uma linha por bundle (categoria, pasta, arquivo, ator, clipe, bytes).

Uso:
  py -3.11 tools/3dx/inventory_animations.py \
      --animation-dir C:/dev/Mv444/AssetBundles/animation \
      --project-anim-dir C:/dev/exported/ExportedProject/Assets \
      --out-dir docs/roadmap

O diretório de bundles é a fonte completa. O projeto exportado tem apenas um
subconjunto de clipes soltos/pares (80 `.anim`, um vazio, na sonda de 2026-10-20).
"""

from __future__ import annotations

import argparse
import csv
import hashlib
from collections import Counter, defaultdict
from pathlib import Path

CATEGORIES = {
    "f": "solo feminino (1 atriz)",
    "m": "solo masculino (1 ator)",
    "mf": "par M+F (2 atores)",
    "ff": "par F+F (2 atrizes)",
    "mm": "par M+M (2 atores)",
    "mmf": "trio 2M+F (3 atores)",
    "mff": "trio M+2F (3 atores)",
    "fff": "trio F+F+F (3 atrizes)",
    "mmm": "trio M+M+M (3 atores)",
    "ingame": "clipes sociais/emotes/danças do cliente; mistura 1, 2 e 4 atores",
    "f_drum": "atriz + prop `drum` (2 bundles; duplica `f/drum`)",
    "m_drum": "ator + prop `drum` (2 bundles; duplica `m/drum`)",
}


def human_mb(num_bytes: int) -> str:
    return f"{num_bytes / (1024 * 1024):.1f}".replace(".", ",")


def loc_display(loc: str) -> str:
    return "(raiz)" if loc == "." else loc


def scan_bundles(root: Path) -> list[dict]:
    rows: list[dict] = []
    for cat_dir in sorted((p for p in root.iterdir() if p.is_dir()), key=lambda p: p.name.lower()):
        cat = cat_dir.name
        for path in sorted(cat_dir.rglob("*"), key=lambda p: str(p).lower()):
            if not path.is_file():
                continue
            rel = path.relative_to(cat_dir).as_posix()
            loc = rel.rsplit("/", 1)[0] if "/" in rel else "."
            actor, sep, clip = path.name.partition("@")
            rows.append(
                {
                    "categoria": cat,
                    "pasta": loc,
                    "arquivo": path.name,
                    "ator": actor if sep else "",
                    "clipe": clip if sep else path.name,
                    "bytes": path.stat().st_size,
                    "valido": "nao" if path.suffix == ".filepart" else "sim",
                    "caminho": str(path),
                }
            )
    return rows


def scan_project_clips(root: Path) -> list[dict]:
    rows: list[dict] = []
    if not root or not root.exists():
        return rows
    for path in sorted(root.rglob("*.anim"), key=lambda p: str(p).lower()):
        rel = path.relative_to(root).as_posix()
        rows.append({"arquivo": rel, "bytes": path.stat().st_size})
    return rows


def write_csv(rows: list[dict], out: Path) -> None:
    fields = ["categoria", "pasta", "arquivo", "ator", "clipe", "bytes", "mb", "valido"]
    with out.open("w", encoding="utf-8-sig", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields)
        writer.writeheader()
        for r in rows:
            writer.writerow(
                {
                    "categoria": r["categoria"],
                    "pasta": r["pasta"],
                    "arquivo": r["arquivo"],
                    "ator": r["ator"],
                    "clipe": r["clipe"],
                    "bytes": r["bytes"],
                    "mb": f"{r['bytes'] / (1024 * 1024):.3f}",
                    "valido": r["valido"],
                }
            )


def summary_rows(rows: list[dict]) -> list[dict]:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        grouped[r["categoria"]].append(r)

    out = []
    for cat in sorted(grouped, key=lambda c: (c not in CATEGORIES, c.lower())):
        rr = grouped[cat]
        valid = [r for r in rr if r["valido"] == "sim"]
        out.append(
            {
                "cat": cat,
                "desc": CATEGORIES.get(cat, "categoria não catalogada"),
                "bundles": len(rr),
                "validos": len(valid),
                "mb": sum(r["bytes"] for r in rr),
                "pastas": len({r["pasta"] for r in rr}),
                "atores": sorted({r["ator"] for r in rr if r["ator"]}),
            }
        )
    return out


def write_markdown(
    rows: list[dict],
    project_clips: list[dict],
    out: Path,
    animation_dir: Path,
    project_anim_dir: Path | None,
) -> None:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        grouped[r["categoria"]].append(r)

    total_bytes = sum(r["bytes"] for r in rows)
    total_valid = sum(1 for r in rows if r["valido"] == "sim")
    duplicates: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        duplicates[r["arquivo"]].append(r)
    duplicate_names = {name: items for name, items in duplicates.items() if len(items) > 1}

    def loc_label(r: dict) -> str:
        return r["categoria"] if r["pasta"] == "." else f"{r['categoria']}/{r['pasta']}"

    def sha12(path: str) -> str:
        with open(path, "rb") as fh:
            return hashlib.sha256(fh.read()).hexdigest()[:12]

    duplicate_report = []
    for name, items in duplicate_names.items():
        hashes = [sha12(r["caminho"]) for r in items]
        duplicate_report.append(
            (
                name,
                [loc_label(r) for r in items],
                len(set(hashes)) == 1,
            )
        )
    identical_dupes = sum(1 for _, _, same in duplicate_report if same)

    lines: list[str] = []
    a = lines.append

    a("# Inventário de animações — export 3DX")
    a("")
    a("Gerado em **2026-10-20** a partir de:")
    a("")
    a(f"- Bundles: `{animation_dir}`")
    a(f"- Projeto Unity exportado: `{project_anim_dir}`" if project_anim_dir else "- Projeto Unity exportado: não informado")
    a("")
    a("> **Leia primeiro:** a pasta `AssetBundles/animation` é a fonte **completa** das animações.")
    a("> O projeto Unity exportado (`Assets/AnimationClip` + `Assets/Resources`) tem só os `.anim`")
    a("> soltos/pares que o AssetRipper extraiu do `3DXChat_Data` — **não** contém as categorias `f`, `m`, `mf`, `mmf`,")
    a("> `mff`, `fff`, `mmm` etc. Para importar o catálogo inteiro, a fonte é o bundle; o `.anim` do")
    a("> projeto serve para os clipes que já existem lá (ver §5).")
    a("")
    a("Cada arquivo é um bundle de **um ator**. O nome segue `ator@clipe`; o prefixo `man`/`woman`")
    a("identifica o rig animado, **não** o gênero da cena. Uma cena de par/trio tem 2 ou 3 bundles")
    a("(um por participante), com sufixo de participante (`_woman1`, `_man2`, `_mmf3`, `_mff1` etc.).")
    a("")
    a("## 1. Resumo")
    a("")
    a("| Cat. | Composição | Bundles | Válidos | Tamanho | Pastas | Atores |")
    a("| --- | --- | ---: | ---: | ---: | ---: | --- |")
    sm = summary_rows(rows)
    for s in sm:
        actors = ", ".join(s["atores"]) if s["atores"] else "—"
        a(
            f"| `{s['cat']}` | {s['desc']} | {s['bundles']} | {s['validos']} | "
            f"{human_mb(s['mb'])} MB | {s['pastas']} | {actors} |"
        )
    a(
        f"| **Total** | **12 categorias** | **{len(rows)}** | **{total_valid}** | "
        f"**{human_mb(total_bytes)} MB** | — | — |"
    )
    a("")
    a(f"- **{len(rows)} bundles**, **{total_valid} válidos**; 1 `.filepart` incompleto.")
    a(f"- **{human_mb(total_bytes)} MB** só de animação (o `AssetBundles` inteiro tem ~8,37 GB).")
    a("- Categorias de cena: solo (`f`, `m`), par (`mf`, `ff`, `mm`) e trio (`mmf`, `mff`, `fff`, `mmm`).")
    a("- **Não existe** pasta `mmmf` (3M+F), nem `ffff`, `mmmm`, `mmff` ou `mfff`.")
    a("  O maior grupo é de **3 atores**; `ingame` tem alguns clipes de dança com 4 bundles")
    a("  (2 homens + 2 mulheres), mas não é uma categoria de cena.")
    a("- `f_drum`/`m_drum` são ator + prop de tambor e **duplicam** `f/drum`/`m/drum`.")
    a("- `ingame` é uma coleção mista: `dance_1..54` para cada gênero, emotes, esportes e sociais.")
    a("- O roadmap cita **4 410 entradas** de animação no zip; a pasta `animation` — extraída e")
    a("  conferida no próprio zip — tem **4 218 bundles**. A diferença não está nesta pasta;")
    a("  provavelmente são entradas de configuração (`Config.Animations.bin`), que é cifrado.")
    a("")
    a("### Convenções de nome observadas")
    a("")
    a("| Categoria | Bundles por cena | Sufixos mais comuns |")
    a("| --- | ---: | --- |")
    a("| `f` / `m` | 1 | `woman@...` / `man@...` (alguns `drum@`, `guitar@`) |")
    a("| `mf` | 2 | `man@...1` + `woman@...2`; também `..._1`/`..._2`, `..._mf...` |")
    a("| `ff` | 2 | `woman@..._woman1` / `_woman2`; antigos `_1`/`_2` |")
    a("| `mm` | 2 | `man@..._man1` / `_man2`; antigos `_1`/`_2` |")
    a("| `mmf` | 3 | `_mmf1`, `_mmf2`, `_mmf3`; também `_man1_mmf`/`_man2_mmf`/`_woman_mmf` |")
    a("| `mff` | 3 | `_mff1`, `_mff2`, `_mff3`; também `_man_mff`/`_woman1_mff`/`_woman2_mff` |")
    a("| `fff` | 3 | `_fff_woman1..3`; também `_woman1..3_fff`, `_fff1..3` |")
    a("| `mmm` | 3 | `_man1..3`; também `_man1..3_mmm`, `_mmm1..3` |")
    a("| `ingame` | 1, 2 ou 4 | `man@...`, `woman@...`, `_man1/_man2`, `_woman1/_woman2` |")
    a("")
    a("A numeração **não é consistente**: em `mf`, `ai_barstool_21` é a cena `ai_barstool_2`")
    a("(participante 1); em `ff`, `ai_barstool_1_woman1` é a cena `ai_barstool_1`. Sempre leia o")
    a("sufixo do participante, não o último número do nome.")
    a("")
    a("## 2. Lista completa por categoria")
    a("")
    a("A lista abaixo é **exatamente** o conteúdo da pasta `animation`, arquivo por arquivo. O CSV")
    a("companheiro (`inventario-animacoes-exportado.csv`) tem as mesmas linhas com tamanho em bytes/MB.")
    a("")
    a("> A contagem é de **bundles**, não de cenas: um par tem 2 bundles, um trio tem 3. O export")
    a("> não traz um manifesto `cena → participantes`, e a nomenclatura é inconsistente, então este")
    a("> inventário não afirma um total de cenas. O agrupamento é a primeira tarefa do importador")
    a("> (ver §6, item 2).")
    a("")

    for s in sm:
        cat = s["cat"]
        rr = grouped[cat]
        a(f"### `{cat}` — {s['bundles']} bundles ({human_mb(s['mb'])} MB)")
        a("")
        a(f"**Composição:** {s['desc']}.")
        a("")
        per_loc: dict[str, list[dict]] = defaultdict(list)
        for r in rr:
            per_loc[r["pasta"]].append(r)
        a(f"**Pastas ({len(per_loc)}):** " + ", ".join(f"`{loc_display(p)}`" for p in sorted(per_loc, key=str.lower)))
        a("")
        for loc in sorted(per_loc, key=str.lower):
            files = sorted(per_loc[loc], key=lambda r: r["arquivo"].lower())
            a(f"**`{loc_display(loc)}`** ({len(files)})")
            a("")
            for r in files:
                suffix = " — **_incompleto (.filepart)_**" if r["valido"] == "nao" else ""
                if r["ator"]:
                    a(f"- `{r['arquivo']}`{suffix}")
                else:
                    a(f"- `{r['arquivo']}` — sem prefixo `ator@`; o nome inteiro é o clipe{suffix}")
            a("")

    a("## 3. Duplicados e anomalias")
    a("")
    a(f"- **{len(duplicate_names)} nomes de arquivo aparecem em mais de uma pasta**.")
    a(f"  **{identical_dupes} são byte-a-byte idênticos** e **{len(duplicate_names) - identical_dupes} têm o mesmo nome mas conteúdo diferente** (tamanho/hash).")
    a("  Não deduplicar só pelo nome; comparar o hash e, nos diferentes, escolher a cópia canônica")
    a("  por categoria/local e validar o clipe. O CSV mantém todas as linhas.")
    a("")
    for name, locs, same in sorted(duplicate_report, key=lambda item: item[0].lower()):
        tag = "idêntico" if same else "**conteúdo diferente**"
        a(f"  - `{name}` → {', '.join(f'`{loc}`' for loc in locs)} ({tag})")
    a("")
    a("- **1 bundle incompleto:** `mf/bed/woman@ai_bed_stayhug2.filepart` (883 872 bytes).")
    a("  Não importar; baixar/extrair de novo.")
    a("- **2 arquivos sem `ator@`:** `ff/sofa/ai_n_sofa_ff_mutualmast1` e `...2`. O nome é o clipe.")
    a("  Provavelmente bundle de par FF sem prefixo de ator; validar no import.")
    a("")
    a("## 4. Categorias que não existem neste export")
    a("")
    a("| Procurada | Situação |")
    a("| --- | --- |")
    a("| `mmmf` (3M+F) | não existe pasta nem clipe com esse padrão |")
    a("| `ffff`, `mmmm`, `mmmmm` | não existem |")
    a("| `mmff`, `mfff`, `mmfff` | não existem |")
    a("| `f_drum`/`m_drum` como cena de par | são ator + prop de tambor, não par |")
    a("")
    a("Se o catálogo completo do cliente tiver cenas de 4+ atores, elas não estão separadas por")
    a("categoria neste export; a única exceção são os clipes de dança em `ingame` com 4 bundles.")
    a("")
    a("## 5. `.anim` do projeto Unity exportado")
    a("")
    if project_clips:
        total_p = sum(c["bytes"] for c in project_clips)
        a(f"`{project_anim_dir}` — **{len(project_clips)} `.anim`**, {human_mb(total_p)} MB.")
        a("")
        a("A varredura é recursiva em `Assets/`. A maioria está em `Assets/AnimationClip`; também há")
        a("1 arquivo em `Assets/Resources/animcampivots` (0 bytes). Arquivos de 0 byte são clips")
        a("vazios/placeholder e não devem entrar no import.")
        a("")
        a("| Arquivo | MB |")
        a("| --- | ---: |")
        for c in project_clips:
            a(f"| `{c['arquivo']}` | {human_mb(c['bytes'])} |")
        a("")
        a("Esses arquivos são clipes soltos/poses/pares usados na publicação atual. Eles **não**")
        a("substituem o catálogo de bundles: cobrem idle/walk/pose, `slowdance_*`, `strip*`, `dance`,")
        a("`run`, `swim` e props. Muitos dos arquivos pequenos são de **UI/props/efeitos**")
        a("(`Normal`, `Pressed`, `Highlighted`, `Disabled`, `Garland_*`, `Message Blinking...`), não")
        a("de avatar. Para pares M/F, o `.anim` do projeto é a fonte que reproduz a pose correta (o")
        a("bundle `mf` traz um rest girado ~180°); ver `docs/guides/3dx-projeto-exportado.md`.")
    else:
        a("Não informado (rode com `--project-anim-dir` para incluir a lista).")
    a("")
    a("## 6. Notas para o plano de importação")
    a("")
    a("1. **Ordem sugerida:** `ingame` (danças/emotes, maior valor visível) → solos `f`/`m` →")
    a("   pares `mf`/`ff`/`mm` → trios `mmf`/`mff`/`fff`/`mmm`. Os trios são poucos e podem ficar")
    a("   para a última leva.")
    a("2. **Cena = N bundles.** O importador precisa agrupar por nome-base e sufixo de participante,")
    a("   não importar cada bundle como um clipe independente. Sem isso, um trio vira três clipes")
    a("   desconexos.")
    a("3. **Offset/giro do par:** derivar do frame 0 dos dois rigs, como já feito em `pair01`.")
    a("   Não calibrar à mão por cena; criar uma tabela `cena → offset/yaw` só para exceções.")
    a("4. **Rig pelo path, não pelo nome do arquivo.** `slowdance_man.anim` anima o rig feminino;")
    a("   o prefixo `man`/`woman` do bundle pode não corresponder ao rig das curvas.")
    a("5. **Pares M/F:** para os clipes que existem no projeto, importar o `.anim` com")
    a("   `import_anim_project.py --anim-root` (rest do prefab). Para os que só existem em bundle,")
    a("   validar o rest antes de retargetar; o bundle `mf` tem rest girado ~180°.")
    a("6. **`.filepart` e duplicados:** excluir o `.filepart`; deduplicar bundles por hash.")
    a("7. **Cobertura:** este inventário é a lista de conferência. Depois do export completo (Fase")
    a("   P0), rodar de novo e comparar por nome; o que faltar vira linha de `cobertura.csv`.")
    a("8. **Volume:** 4 787 MB de bundles. Processar por categoria/lote e guardar o JSON/GLB fora")
    a("   do git; o repo só recebe o manifesto e os GLBs publicados.")
    a("")
    a("## 7. Como regenerar")
    a("")
    a("```powershell")
    a("py -3.11 tools/3dx/inventory_animations.py `")
    a("  --animation-dir C:/dev/Mv444/AssetBundles/animation `")
    a("  --project-anim-dir C:/dev/exported/ExportedProject/Assets `")
    a("  --out-dir docs/roadmap")
    a("```")
    a("")
    a("O script não altera os bundles; só lê nome/tamanho. A lista é ordenada por categoria, pasta")
    a("e nome do arquivo.")

    out.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--animation-dir", required=True, type=Path)
    parser.add_argument("--project-anim-dir", type=Path, default=None)
    parser.add_argument("--out-dir", required=True, type=Path)
    parser.add_argument("--prefix", default="inventario-animacoes-exportado")
    args = parser.parse_args()

    rows = scan_bundles(args.animation_dir)
    project_clips = scan_project_clips(args.project_anim_dir) if args.project_anim_dir else []

    args.out_dir.mkdir(parents=True, exist_ok=True)
    csv_path = args.out_dir / f"{args.prefix}.csv"
    md_path = args.out_dir / f"{args.prefix}.md"

    write_csv(rows, csv_path)
    write_markdown(rows, project_clips, md_path, args.animation_dir, args.project_anim_dir)

    cats = Counter(r["categoria"] for r in rows)
    print(f"{len(rows)} bundles em {len(cats)} categorias")
    for cat, count in sorted(cats.items()):
        print(f"  {cat:8} {count:5}")
    print(f"CSV: {csv_path}")
    print(f"MD:  {md_path}")


if __name__ == "__main__":
    main()
