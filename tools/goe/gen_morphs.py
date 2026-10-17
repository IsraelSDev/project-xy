"""
Gera packages/contracts/src/morphs.ts, o catálogo das shape keys (morph targets) do GoE, a partir dos GLB exportados.

Uso:
    python tools/goe/gen_morphs.py apps/web/public/assets/goe packages/contracts/src/morphs.ts

As chaves vêm dos nomes dos morph targets do corpo de cada gênero (`GoE_Male.glb` + `GoE_M_Genitals.glb`,
`GoE_Female.glb`); o resto do conjunto (roupa, cabelo, olhos...) repete subconjuntos delas. Os rótulos em português estão neste arquivo.
"""

import json
import os
import re
import struct
import sys

# Grupo de cada chave, pelo prefixo do nome no .blend. Anatomia explícita é separada das demais expressões.
ANATOMY = {
    "AnimAnusOpen": "Ânus aberto",
    "AnimPenisErect": "Pênis ereto",
    "AnimForeskin": "Prepúcio",
    "AnimClitorisExpose": "Clitóris exposto",
    "AnimGensOpen": "Genitais abertos",
    "BodyBallsSize": "Tamanho dos testículos",
    "BodyNipples": "Mamilos",
}

# Chaves sintetizadas por nós no export (o basemesh v1.4 não as traz); ver export_goe.add_genital_morphs.
GENITAL = {
    "BodyPenisSize": "Tamanho do pênis",
    "BodyPenisGirth": "Grossura do pênis",
}

EXPRESSIONS = {
    "Afraid": "Assustado",
    "Angry": "Bravo",
    "BrowDown": "Sobrancelhas baixas",
    "BrowUp": "Sobrancelhas altas",
    "CheeksBalloon": "Bochechas infladas",
    "CheeksBalloonPucker": "Bochechas infladas com bico",
    "Concentrate": "Concentrado",
    "Confused": "Confuso",
    "Disgust": "Nojo",
    "Excitement": "Empolgado",
    "EyesClosedL": "Olho esquerdo fechado",
    "EyesClosedR": "Olho direito fechado",
    "Fear": "Medo",
    "Flirting": "Flertando",
    "FlirtingFeminineL": "Flerte feminino (esq.)",
    "FlirtingFeminineR": "Flerte feminino (dir.)",
    "FlirtingMasculineL": "Flerte masculino (esq.)",
    "FlirtingMasculineR": "Flerte masculino (dir.)",
    "Frown": "Testa franzida",
    "Glare": "Olhar fulminante",
    "Happy": "Feliz",
    "LightSmile": "Sorriso leve",
    "LipsPuckerWide": "Beicinho largo",
    "Pain": "Dor",
    "Sad": "Triste",
    "Scream": "Grito",
    "Shock": "Choque",
    "SmileFullFace": "Sorriso largo",
    "SnarlLeft": "Desdém",
    "Surprise": "Surpresa",
}

BODY = {
    "AssLarge": "Bumbum grande",
    "BodybuilderDetails": "Fisiculturista (definição)",
    "BodybuilderSize": "Fisiculturista (tamanho)",
    "BreastsSag": "Seios caídos",
    "BreastsSmall": "Seios pequenos",
    "Emaciated": "Muito magro",
    "PearFigure": "Formato pera",
    "Pregnant": "Grávida",
    "DollBody": "Corpo de boneca",
    "AnimeWaist": "Cintura anime",
    "AnimeNeck": "Pescoço anime",
    "AnimeProportion": "Proporção anime",
    "SuperBreast": "Seios enormes",
    "BigHips": "Quadris largos",
    "NarrowWaist": "Cintura fina",
}

FACE = {
    "RoundFace": "Rosto redondo",
    "LongFace": "Rosto longo",
    "IndianFace": "Rosto indiano",
    "BlackFace": "Rosto negro",
    "NoseHump": "Nariz adunco",
    "NostrilsFlare": "Narinas abertas",
    "Cheekbones": "Maçãs do rosto",
    "CheeksSize": "Tamanho das bochechas",
    "ChinSize": "Tamanho do queixo",
    "EarHeight": "Altura das orelhas",
    "EarSize": "Tamanho das orelhas",
    "EarsElfLong": "Orelhas de elfo",
    "EyesShape": "Formato dos olhos",
    "BrowDown": "Sobrancelha baixa",
    "EyesSpacing": "Distância entre os olhos",
    "BrowUp": "Sobrancelha alta",
    "EyebrowSize": "Tamanho da sobrancelha",
    "EyelashLength": "Cílios longos",
    "EyesDown": "Olhos baixos",
    "EyesUp": "Olhos altos",
    "JawWidth": "Largura da mandíbula",
    "MouthHeight": "Altura da boca",
    "MouthSize": "Tamanho da boca",
    "MouthWidth": "Largura da boca",
    "NoseHeight": "Altura do nariz",
    "NoseSmall": "Nariz pequeno",
    "NoseWide": "Nariz largo",
    "Symmetry": "Simetria",
    "NoseAngle": "Ângulo do nariz",
    "AnimeHead": "Cabeça anime",
    "AnimeMouth": "Boca anime",
    "AnimeNose": "Nariz anime",
    "AnimeChin": "Queixo anime",
    "AnimeEyes": "Olhos anime",
    "LipsToMegalips": "Lábios grandes",
    "EyelashesSpecial": "Cílios especiais",
    "JapanFace": "Rosto japonês",
    "NoseNarrow": "Nariz fino",
    "OldFace": "Rosto envelhecido",
    "NoseSnub": "Nariz arrebitado",
    "NoseTipDown": "Ponta do nariz baixa",
    "FlattenFace": "Rosto achatado",
    "EarsShaped": "Orelhas definidas",
    "StretchFace": "Rosto esticado",
    "EarStretch": "Orelhas esticadas",
    "EyesSpacingWide": "Olhos bem afastados",
    "MouthDown": "Boca caída",
}

# Chaves de movimento do rosto (padrão ARKit, em minúscula no .blend). O lado Left/Right é o do personagem.
FACIAL = {
    "eyeBlink": "Piscar",
    "eyeLookDown": "Olhar para baixo",
    "eyeLookIn": "Olhar para dentro",
    "eyeLookOut": "Olhar para fora",
    "eyeLookUp": "Olhar para cima",
    "eyeSquint": "Apertar o olho",
    "eyeWide": "Arregalar o olho",
    "jawForward": "Mandíbula à frente",
    "jawLeft": "Mandíbula para a esquerda",
    "jawRight": "Mandíbula para a direita",
    "jawOpen": "Abrir a boca",
    "mouthClose": "Fechar a boca",
    "mouthFunnel": "Boca em funil",
    "mouthPucker": "Biquinho",
    "mouthRight": "Boca para a direita",
    "mouthLeft": "Boca para a esquerda",
    "mouthSmile": "Sorriso",
    "mouthFrown": "Boca para baixo",
    "mouthDimple": "Covinha",
    "mouthStretch": "Esticar a boca",
    "mouthRollLower": "Enrolar o lábio inferior",
    "mouthRollUpper": "Enrolar o lábio superior",
    "mouthShrugLower": "Encolher o lábio inferior",
    "mouthShrugUpper": "Encolher o lábio superior",
    "mouthPress": "Pressionar os lábios",
    "mouthLowerDown": "Baixar o lábio inferior",
    "mouthUpperUp": "Subir o lábio superior",
    "browDown": "Baixar a sobrancelha",
    "browInnerUp": "Subir o canto interno das sobrancelhas",
    "browOuterUp": "Subir a ponta da sobrancelha",
    "cheekPuff": "Inflar as bochechas",
    "cheekSquint": "Apertar a bochecha",
    "noseSneer": "Torcer o nariz",
    "tongueOut": "Língua para fora",
}

# Região do rosto de cada chave de `Face*` (sem o prefixo) e de movimento (pelo prefixo do nome ARKit).
REGIONS = [
    ("shape", "Formato do rosto"),
    ("eyes", "Olhos"),
    ("brows", "Sobrancelhas"),
    ("nose", "Nariz"),
    ("mouth", "Boca e lábios"),
    ("jaw", "Queixo e mandíbula"),
    ("cheeks", "Bochechas"),
    ("ears", "Orelhas"),
]
FACE_REGION = {
    "shape": ["RoundFace", "LongFace", "IndianFace", "BlackFace", "JapanFace", "OldFace", "FlattenFace", "StretchFace",
              "Symmetry", "AnimeHead"],
    "eyes": ["EyesShape", "EyesSpacing", "EyesSpacingWide", "EyesDown", "EyesUp", "AnimeEyes", "EyelashLength",
             "EyelashesSpecial"],
    "brows": ["BrowDown", "BrowUp", "EyebrowSize"],
    "nose": ["NoseHump", "NostrilsFlare", "NoseHeight", "NoseSmall", "NoseWide", "NoseAngle", "AnimeNose", "NoseNarrow",
             "NoseSnub", "NoseTipDown"],
    "mouth": ["MouthHeight", "MouthSize", "MouthWidth", "AnimeMouth", "LipsToMegalips", "MouthDown"],
    "jaw": ["ChinSize", "JawWidth", "AnimeChin"],
    "cheeks": ["Cheekbones", "CheeksSize"],
    "ears": ["EarHeight", "EarSize", "EarsElfLong", "EarsShaped", "EarStretch"],
}
FACIAL_REGION = {"eye": "eyes", "brow": "brows", "jaw": "jaw", "mouth": "mouth", "cheek": "cheeks", "nose": "nose",
                 "tongue": "mouth"}

GROUPS = [
    ("body", "Corpo"),
    ("face", "Rosto"),
    ("expression", "Expressões"),
    ("facial", "Movimentos do rosto"),
    ("anatomy", "Anatomia"),
]
MODELS = {"goe-male": ["GoE_Male", "GoE_M_Genitals"], "goe-female": ["GoE_Female"]}
SIDE = {"Left": " (esq.)", "Right": " (dir.)"}


def read_json(path):
    with open(path, "rb") as handle:
        data = handle.read()
    length = struct.unpack_from("<I", data, 12)[0]
    return json.loads(data[20:20 + length])


def model_keys(folder, files):
    """Nomes dos morph targets de todas as malhas dos arquivos, na ordem em que aparecem (corpo primeiro)."""
    names = []
    for file in files:
        gltf = read_json(os.path.join(folder, f"{file}.glb"))
        for mesh in sorted(gltf["meshes"], key=lambda m: -len(m.get("extras", {}).get("targetNames", []))):
            for name in mesh.get("extras", {}).get("targetNames", []):
                if name not in names:
                    names.append(name)
    return names


def classify(key):
    """(grupo, rótulo, região) de uma chave; a região só existe nas chaves do rosto e de movimento."""
    if key in ANATOMY:
        return "anatomy", ANATOMY[key], None
    if key in GENITAL:
        return "anatomy", GENITAL[key], None
    if key.startswith("Anim") and key[4:] in EXPRESSIONS:
        return "expression", EXPRESSIONS[key[4:]], None
    if key.startswith("Body") and key[4:] in BODY:
        return "body", BODY[key[4:]], None
    if key.startswith("Face") and key[4:] in FACE:
        region = next((name for name, keys in FACE_REGION.items() if key[4:] in keys), None)
        if region is None:
            raise SystemExit(f"Chave de rosto sem região: {key}")
        return "face", FACE[key[4:]], region
    match = re.match(r"^([a-z]+(?:[A-Z][a-z]+)+?)(Left|Right)?$", key)
    if match and match.group(1) in FACIAL:
        prefix = re.match(r"^[a-z]+", key).group(0)
        return "facial", FACIAL[match.group(1)] + SIDE.get(match.group(2), ""), FACIAL_REGION[prefix]
    raise SystemExit(f"Chave sem rótulo em português: {key}")


def main():
    folder = sys.argv[1]
    out = sys.argv[2]
    per_model = {model: model_keys(folder, files) for model, files in MODELS.items()}
    order = []
    for keys in per_model.values():
        for key in keys:
            if key not in order:
                order.append(key)
    items = []
    for key in order:
        group, label, region = classify(key)
        models = [model for model, keys in per_model.items() if key in keys]
        items.append((key, label, group, region, models))
    # Grupos na ordem do catálogo; dentro de cada um, a ordem do .blend.
    rank = {group: i for i, (group, _) in enumerate(GROUPS)}
    items.sort(key=lambda item: rank[item[2]])

    lines = [
        "/**",
        " * Catálogo das shape keys (morph targets) do GoE. GERADO por tools/goe/gen_morphs.py a partir dos GLB",
        " * exportados: não editar à mão. `id` é o nome da chave no GLB; o avatar guarda só `{ id: influência 0..1 }`.",
        " * A mesma chave existe no corpo, nas roupas, no cabelo, nos olhos... e o jogo aplica a influência por nome",
        " * em todas as malhas do avatar que a tenham.",
        " */",
        "",
        "export const MORPH_GROUPS = [",
    ]
    for group, label in GROUPS:
        lines.append(f"  {{ id: '{group}', label: '{label}' }},")
    lines += [
        "] as const;",
        "",
        "export type MorphGroup = (typeof MORPH_GROUPS)[number]['id'];",
        "",
        "/** Região do rosto das chaves dos grupos `face` e `facial` (as demais não têm região). */",
        "export const MORPH_REGIONS = [",
    ]
    for region, label in REGIONS:
        lines.append(f"  {{ id: '{region}', label: '{label}' }},")
    lines += [
        "] as const;",
        "",
        "export type MorphRegion = (typeof MORPH_REGIONS)[number]['id'];",
        "",
        "export const MORPHS = [",
    ]
    for key, label, group, region, models in items:
        model_list = ", ".join(f"'{model}'" for model in models)
        region_part = f" region: '{region}'," if region else ""
        lines.append(f"  {{ id: '{key}', label: '{label}', group: '{group}',{region_part} models: [{model_list}] }},")
    lines += [
        "] as const satisfies readonly {",
        "  id: string;",
        "  label: string;",
        "  group: MorphGroup;",
        "  region?: MorphRegion;",
        "  models: readonly ('goe-male' | 'goe-female')[];",
        "}[];",
        "",
        "export type MorphId = (typeof MORPHS)[number]['id'];",
        "",
        "export const MORPH_IDS = MORPHS.map((morph) => morph.id) as [MorphId, ...MorphId[]];",
        "",
    ]
    with open(out, "w", encoding="utf-8", newline="\n") as handle:
        handle.write("\n".join(lines))
    print(f"MORPHS {out} ({len(items)} chaves; " + ", ".join(f"{m}={len(k)}" for m, k in per_model.items()) + ")")


if __name__ == "__main__":
    main()
