"""Extract a 3DXChat character mesh + skeleton (+ optional animation) to JSON.

Examples
--------
A clothing prefab from the exported Unity project, using the frozen body rig as
the reference rest pose (no asset bundles)::

    py -3.11 tools/3dx/extract_character.py \
        --source ".../Resources/man/cloth/shirt_1.prefab" \
        --skeleton-json tools/3dx/rigs/3dx_male.json \
        --mesh shirt_1 --gender male --retarget \
        --out tools/3dx/build/project/clothes/3dx_m_top_shirt.json

Body + head from the installed client's serial file, with a wear bundle as the
skeleton source (the ``character`` file has meshes only, no renderer)::

    py -3.11 tools/3dx/extract_character.py \
        --source "C:/.../3DXChat_Data/character" \
        --skeleton "C:/.../AssetBundles/wear/male/HZmalelatexsuit" \
        --mesh man_body man_head --gender male \
        --out tools/3dx/build/character_male.json

A wear bundle on its own (mesh and skeleton in the same file)::

    py -3.11 tools/3dx/extract_character.py --source <bundle> --mesh man_body --gender male --out <json>

A wear item authored on its own copy of the rig (A-pose/wrapper root) is
retargeted onto the base character skeleton **by bone name**, which bakes the
item into the base rest pose and rewrites its skin indices::

    py -3.11 tools/3dx/extract_character.py --source <wear-bundle> --mesh item \
        --skeleton <body-skeleton-bundle> --retarget --gender female --out <json>

Add a test animation (embeds per-frame world transforms of the skeleton)::

    ... --anim "C:/.../AssetBundles/animation/m/djpult/man@dj"

See ``docs/roadmap/migracao-3dxchat-exportado.md`` (sections 2, 3, 4).
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import lib3dx as L


def accumulate(
    info: dict,
    overrides: dict[int, list[float]] | None = None,
    pos_overrides: dict[int, list[float]] | None = None,
):
    """World rotation (R) per transform; position accumulated too.

    ``overrides`` replaces the *local* rotation of a transform (by path_id); ``pos_overrides`` the
    *local* position (the clip's translation curves).
    """
    Wr: dict[int, list[list[float]]] = {}
    Wp: dict[int, list[float]] = {}

    def rec(pid):
        if pid in Wr:
            return
        i = info[pid]
        par = i["parent"]
        if par is not None and par in info:
            rec(par)
        R = L.mat_from_q(i["rot"])
        if overrides is not None and pid in overrides:
            R = L.mat_from_q(overrides[pid])
        t = i["pos"]
        if pos_overrides is not None and pid in pos_overrides:
            t = pos_overrides[pid]
        if par is None or par not in info:
            Wr[pid], Wp[pid] = R, list(t)
        else:
            Wr[pid] = L.matmul(Wr[par], R)
            off = L.matvec(Wr[par], t)
            Wp[pid] = [Wp[par][k] + off[k] for k in range(3)]

    for pid in info:
        rec(pid)
    return Wr, Wp


def _descendants(info: dict, root: int) -> set[int]:
    children: dict[object, list[int]] = {}
    for pid, item in info.items():
        children.setdefault(item["parent"], []).append(pid)
    out: set[int] = set()
    stack = [root]
    while stack:
        pid = stack.pop()
        if pid in out:
            continue
        out.add(pid)
        stack.extend(children.get(pid, []))
    return out


def _root_transform(info: dict, name: str) -> int | None:
    """The largest transform named ``name`` (the character root, not a clothing copy)."""
    roots = [pid for pid, item in info.items() if item["name"] == name]
    if not roots:
        return None
    return max(roots, key=lambda pid: len(_descendants(info, pid)))


def _pose_pivot(info: dict, root: int) -> int:
    """The skeleton subtree (``*_bone_POSE_PIVOT``) under the character root, if present."""
    children = [pid for pid, item in info.items() if item["parent"] == root]
    pivots = [
        pid
        for pid in children
        if "POSE" in info[pid]["name"] and "PIVOT" in info[pid]["name"]
    ]
    if not pivots:
        return root
    return max(pivots, key=lambda pid: len(_descendants(info, pid)))


def _select_clip(aenv, selector: str | int | None, root_name: str | None, anim_file=None):
    clips = [o for o in aenv.objects if o.type.name == "AnimationClip"]
    if anim_file is not None:
        # Pin the clip to the file the user passed; the prefab also references a same-named clip
        # from another asset (e.g. stay_pose_1 vs stay_pose_1_0).
        target = Path(anim_file).resolve()
        clips = [o for o in clips if Path(getattr(o, "_file_key", "")).resolve() == target]
    if not clips:
        raise SystemExit("no AnimationClip in animation source")
    if isinstance(selector, int):
        for o in clips:
            if o.path_id == selector:
                return o.read()
        raise SystemExit(f"no AnimationClip with path_id {selector}")
    # The base character prefab has several same-named clips (male/female variants).
    # When an animation root is given, read the one its Animation component uses.
    if root_name and anim_file is None:
        for o in aenv.objects:
            if o.type.name != "Animation":
                continue
            try:
                go = o.read().m_GameObject.read()
            except Exception:
                continue
            if go.m_Name != root_name:
                continue
            for ref in o.read().m_Animations:
                try:
                    clip = ref.read()
                except Exception:
                    continue
                if selector is None or clip.m_Name == selector:
                    return clip
    if selector is None:
        return clips[0].read()
    for o in clips:
        clip = o.read()
        if clip.m_Name == selector:
            return clip
    raise SystemExit(f"no AnimationClip named {selector!r}")


def animation_frames(
    anim_path: str,
    bones: list[dict],
    clip_selector: str | int | None = None,
    anim_root: str | None = None,
    aenv=None,
    anim_file: str | None = None,
    source_pose: bool = False,
    yaw_deg: float | None = None,
    keep_bundle_space: bool = False,
    skeleton_env=None,
    position_curves: bool = False,
) -> tuple[int, list, float, str]:
    """Per-frame world transforms of the skeleton for one native clip.

    Some native clips are stored in ``resources.assets`` without their own
    skeleton. ``anim_root`` then names the character prefab (``man``/``woman``)
    whose ``*_bone_POSE_PIVOT`` subtree supplies the rest pose for the deltas.
    ``aenv`` is an already loaded environment (e.g. ``project_env.ProjectEnv``);
    without it the clip is read from ``anim_path`` as a bundle.

    ``source_pose`` imports a *pose bundle*: the bundle skeleton is already stored
    in the authored pose (the 3DX sit clips work this way), so the rest pose is
    the pose and the curves only add subtle motion. The rotation deltas used for
    motion clips would cancel that pose out; this mode copies the source's world
    rotations instead, aligned to the target's rest root, and takes the seated
    root height from the bundle.

    ``yaw_deg`` overrides the automatic guinada (the hip line) for poses where it
    misreads the facing — e.g. deitado com as pernas levantadas, em que a linha do
    quadril deixa de indicar a direção do corpo. O valor é a direção do tronco
    (quadril → cabeça) no referencial do móvel; o clipe continua normalizado para
    +Z, como os demais.
    """
    clip_env = aenv if aenv is not None else L.load_env(anim_path)
    # Os clipes sexuais das bundles `ai_*`/`midnight_*` guardam só as curvas: a hierarquia dos ossos
    # vem do prefab do personagem (`skeleton_env`), como no jogo.
    _, ainfo = L.build_transforms(skeleton_env if skeleton_env is not None else clip_env)
    clip = _select_clip(clip_env, clip_selector, anim_root, anim_file)
    if anim_root:
        root = _root_transform(ainfo, anim_root)
        if root is None:
            raise SystemExit(f"animation skeleton root {anim_root!r} not found in {anim_path}")
        pivot = _pose_pivot(ainfo, root)
        keep = _descendants(ainfo, pivot)
        ainfo = {pid: ainfo[pid] for pid in keep}
        print(f"  animation skeleton: {anim_root}/{ainfo[pivot]['name']} ({len(ainfo)} transforms)")

    rotcurves = {c.path: c for c in clip.m_RotationCurves}
    dur = 0.0
    for c in clip.m_RotationCurves:
        for k in c.curve.m_Curve:
            dur = max(dur, k.time)
    fps = clip.m_SampleRate or 30
    nf = int(round(dur * fps)) + 1

    clip_by_norm: dict[str, list] = {}
    for p, c in rotcurves.items():
        keys = c.curve.m_Curve
        seq = []
        for i in range(nf):
            t = i / fps
            val = keys[-1].value
            for k in keys:
                if k.time >= t:
                    val = k.value
                    break
            seq.append([round(val.x, 6), round(val.y, 6), round(val.z, 6), round(val.w, 6)])
        clip_by_norm[L.bone_key(p)] = seq

    pos_by_norm: dict[str, list] = {}
    if position_curves:
        for c in clip.m_PositionCurves:
            keys = c.curve.m_Curve
            seq = []
            for i in range(nf):
                t = i / fps
                val = keys[-1].value
                for k in keys:
                    if k.time >= t:
                        val = k.value
                        break
                seq.append([val.x, val.y, val.z])
            pos_by_norm[L.bone_key(c.path)] = seq

    anim_pids = list(ainfo.keys())
    anim_norm = {pid: L.bone_key(L.name_path(ainfo, pid)) for pid in anim_pids}
    a_rest_R, a_rest_T = accumulate(ainfo)
    candidates: dict[str, list[int]] = {}
    for apid in anim_pids:
        np = anim_norm[apid]
        if np in clip_by_norm:
            candidates.setdefault(np, []).append(apid)

    # Skeleton bone index -> animation transform id. Names are not unique in the Unity prefab
    # (props/colliders under PIVOTS reuse bone names); pick the transform whose rest position and
    # orientation are closest to the target bone. Picking the first name match can attach a target
    # bone to a static prop and leave the real pose untouched.
    def animation_aliases(key: str, pose_root: bool = False):
        if key == "woman_bip":
            yield "man"
        elif key.startswith("woman_bip_"):
            yield "man_" + key[len("woman_bip_"):]
        elif key.startswith("woman_bone_"):
            yield "man_bone_" + key[len("woman_bone_"):]
            # Pose bundles name the body root `woman Pelvis` while the target bone is
            # `woman_bone_Pelvis`; only that root (no wrapper) needs the height.
            if pose_root and (source_pose or position_curves):
                yield "woman_" + key[len("woman_bone_"):]
        elif key == "man":
            yield "woman_bip"
        elif key.startswith("man_bone_"):
            yield "woman_bone_" + key[len("man_bone_"):]
            # Same for the male body root (`man_bone_Pelvis` vs `man Pelvis`). Child
            # `man_bone_X` bones must keep their local rest: the mapped `man_X` parent
            # already carries the pose, and matching both would rotate them twice. Motion
            # clips (`position_curves`) also need it: the prefab animates the `man Pelvis`
            # wrapper, so without the alias the target pelvis root stays at the rest height
            # and the waist/glute weights stretch towards the seated body.
            if pose_root and (source_pose or position_curves):
                yield "man_" + key[len("man_bone_"):]
        elif key.startswith("man_"):
            yield "woman_bip_" + key[len("man_"):]

    bone_to_anim: dict[int, int] = {}
    for i, b in enumerate(bones):
        np = L.bone_key(b["path"])
        options = candidates.get(np)
        if not options:
            for alias in animation_aliases(np, b["parent"] < 0):
                options = candidates.get(alias)
                if options:
                    break
        if not options and np.endswith("_1"):
            # O GLB masculino desambigua a mão esquerda com sufixo (`man_L_Hand_1`, `man_L_Finger0_1`…);
            # a curva usa o nome original (`man L Hand`). Sem isso a mão e os dedos ficam no repouso.
            options = candidates.get(np[:-2])
        if not options:
            continue
        target_q = b["rest"]
        target_t = b["pos"]

        def score(apid: int) -> float:
            src_q = L.quat_from_mat(a_rest_R[apid])
            dot = min(1.0, abs(sum(x * y for x, y in zip(src_q, target_q))))
            ang = 2 * math.degrees(math.acos(dot))
            return sum((a_rest_T[apid][k] - target_t[k]) ** 2 for k in range(3)) ** 0.5 + ang / 45.0

        bone_to_anim[i] = min(options, key=score)

    if position_curves:
        # O corpo-alvo guarda o pênis e o saco como raízes, mas no prefab são filhos da pelve: sem
        # isso eles não acompanham o quadril do clipe. Cada raiz herda como pai o alvo do ancestral
        # mapeado mais próximo no prefab (a árvore do prefab não tem ciclos).
        anim_to_target = {apid: i for i, apid in bone_to_anim.items()}
        reparent: dict[int, int] = {}
        for i, b in enumerate(bones):
            apid = bone_to_anim.get(i)
            if b["parent"] >= 0 or apid is None:
                continue
            up = ainfo[apid]["parent"]
            while up is not None and up in ainfo and up not in anim_to_target:
                up = ainfo[up]["parent"]
            if up in anim_to_target and anim_to_target[up] != i:
                reparent[i] = anim_to_target[up]
        bones = [dict(b, parent=reparent.get(i, b["parent"])) for i, b in enumerate(bones)]

    n = len(bones)
    bRW = {i: L.m4(L.mat_from_q(bones[i]["rest"]), bones[i]["pos"]) for i in range(n)}
    bRWi = {i: L.inv4(bRW[i]) for i in range(n)}
    lrest: dict[int, list[list[float]]] = {}
    for i in range(n):
        par = bones[i]["parent"]
        lrest[i] = L.mm4(bRWi[par], bRW[i]) if par in bRWi else bRW[i]

    def depth(i):
        d, p = 0, bones[i]["parent"]
        while p >= 0:
            d += 1
            p = bones[p]["parent"]
        return d

    order = sorted(range(n), key=depth)

    # Rest state of the target in the same convention as the source: world rotations are compared
    # directly, so the source's *global* rotation delta can be applied to the corresponding target
    # bone. Applying that delta as a local rotation (the previous implementation) mixed the source
    # and target rest axes and twisted arms/faces even when the rest poses looked aligned.
    b_rest_q = [list(bones[i]["rest"]) for i in range(n)]
    b_rest_t = [list(bones[i]["pos"]) for i in range(n)]
    # Local rest rotation of each target bone. Bones with no animation curve must keep this
    # local rotation, not their rest *world* orientation: otherwise a child whose parent rotates
    # translates with the limb but keeps its old orientation, collapsing the skin at knees,
    # elbows and wrists.
    b_rest_lq = [
        L.quat_from_mat(lrest[i]) if bones[i]["parent"] >= 0 else b_rest_q[i]
        for i in range(n)
    ]
    # Local rest translation of each target bone in the parent's rest frame; bone lengths are kept.
    lrest_t = [[lrest[i][0][3], lrest[i][1][3], lrest[i][2][3]] for i in range(n)]

    # Pose bundles keep the source's absolute local rotations. The body pose is coherent as a
    # whole; only its global yaw has to be neutralised so the avatar faces the same way as the
    # standing clips (the game applies the seat heading on top). The lateral axis is the hip line;
    # forward = lateral x up and is rotated onto +Z, the standing facing of the target skeleton.
    #
    # `keep_bundle_space` desliga as duas correções de espaço (guinada e reancoragem do XZ): o
    # clipe fica no referencial do `* bone POSE PIVOT` do bundle, com o deslocamento autoral de
    # cada corpo. É o que os pares de móvel precisam — no jogo os dois avatares usam o *mesmo*
    # pivô (`propaction`: `posepivot = posepivot do parceiro`), então a relação entre os corpos
    # tem de ficar no clipe, não no servidor.
    pose_root: int | None = None
    pose_bone: int | None = None
    q_yaw: list[float] = [0.0, 0.0, 0.0, 1.0]
    if source_pose and not keep_bundle_space:
        # The pair bundles do not animate every parentless root (e.g. `man bone Gen Ass` is
        # static), so anchor on the first root that actually has a curve instead of assuming
        # bone 0. All roots still shift by the same amount, keeping their relative placement.
        for i, b in enumerate(bones):
            if b["parent"] < 0 and i in bone_to_anim:
                pose_bone = i
                pose_root = bone_to_anim[i]
                break
        if pose_root is None or pose_bone is None:
            raise SystemExit(
                "pose bundle: target root bone did not match the animation skeleton root"
            )
        # The female rig names the bones with spaces (`woman bip L Thigh`) while the male
        # wear-skeleton uses underscores (`man_L_Thigh`); both spellings have to be tried or
        # the yaw correction silently stays at identity and the male poses face sideways.
        def _thigh(side: str) -> int | None:
            for i, b in enumerate(bones):
                last = b["path"].split("/")[-1]
                if last.endswith(f"{side} Thigh") or last.endswith(f"{side}_Thigh"):
                    return i
            return None

        left_thigh = _thigh("L")
        right_thigh = _thigh("R")
        src_l = bone_to_anim.get(left_thigh) if left_thigh is not None else None
        src_r = bone_to_anim.get(right_thigh) if right_thigh is not None else None
        if yaw_deg is not None:
            # Guinada informada (direção do tronco): o clipe é normalizado para +Z girando por
            # -yaw_deg, e o jogo reaplica o valor em `facing`.
            angle = -math.radians(yaw_deg)
            q_yaw = [0.0, math.sin(angle / 2), 0.0, math.cos(angle / 2)]
        elif src_l is not None and src_r is not None:
            dx = a_rest_T[src_r][0] - a_rest_T[src_l][0]
            dz = a_rest_T[src_r][2] - a_rest_T[src_l][2]
            norm = math.hypot(dx, dz)
            if norm > 1e-6:
                forward_x, forward_z = -dz / norm, dx / norm
                angle = -math.atan2(forward_x, forward_z)
                q_yaw = [0.0, math.sin(angle / 2), 0.0, math.cos(angle / 2)]

    def yaw_xz(x: float, z: float) -> tuple[float, float]:
        m = L.mat_from_q(q_yaw)
        return (m[0][0] * x + m[0][2] * z, m[2][0] * x + m[2][2] * z)

    # Raízes do destino sem curva no clipe e a pelve de destino (para fazê-las acompanhar).
    static_roots: list[int] = []
    pelvis_target: int | None = None
    if source_pose:
        for i, b in enumerate(bones):
            if b["parent"] >= 0:
                continue
            leaf = b["path"].rsplit("/", 1)[-1].replace(" ", "_").lower()
            if pelvis_target is None and leaf.endswith("pelvis"):
                pelvis_target = i
            apid = bone_to_anim.get(i)
            if apid is None or anim_norm[apid] not in clip_by_norm:
                static_roots.append(i)
        if pelvis_target is not None:
            static_roots = [i for i in static_roots if i != pelvis_target]
        print(
            f"  source_pose: pelve={bones[pelvis_target]['path'].rsplit('/', 1)[-1] if pelvis_target is not None else '-'}"
            f" | raízes presas à pelve: "
            f"{[bones[i]['path'].rsplit('/', 1)[-1] for i in static_roots] or '-'}"
        )

    world = []
    # Pose com curvas de posição (danças): a raiz fica ancorada no repouso só no primeiro quadro e o
    # deslocamento seguinte é o autorado (o quadril balança no lugar). Sem curvas de posição a âncora
    # vale em cada quadro, como nos clipes de sentar.
    anchor_shift: tuple[float, float] | None = None
    for f in range(nf):
        ov = {}
        ov_t = {}
        # Com curvas de posição, o clipe vale para o esqueleto inteiro (inclusive ancestrais sem
        # osso no alvo, como o `man` que move o corpo): ele entra no `accumulate` como na Unity.
        driven = anim_pids if position_curves else bone_to_anim.values()
        for apid in driven:
            np = anim_norm[apid]
            if np in clip_by_norm:
                ov[apid] = clip_by_norm[np][f]
            if position_curves and np in pos_by_norm:
                ov_t[apid] = pos_by_norm[np][f]
        # Translação do clipe em relação ao repouso local do esqueleto de origem: o alvo mantém o
        # próprio comprimento de osso e recebe só o deslocamento autorado.
        motion_dt = {
            i: [ov_t[apid][k] - ainfo[apid]["pos"][k] for k in range(3)]
            for i, apid in bone_to_anim.items()
            if apid in ov_t
        }
        a_pose_R, a_pose_T = accumulate(ainfo, ov, ov_t)
        # Deslocamento da pelve na pose em relação ao repouso do bundle: as raízes sem curva
        # (Gen Ass, pen balls) acompanham para não esticar a malha.
        pelvis_delta = [0.0, 0.0, 0.0]
        if source_pose and pose_root is not None:
            pelvis_delta = [a_pose_T[pose_root][k] - a_rest_T[pose_root][k] for k in range(3)]
        # The male wear-skeleton has several parentless roots (pelvis, spine, genitals); the
        # pose only makes sense with their *relative* placement. Anchor the chosen pose root on
        # the target rest position and shift every root by that same amount, instead of resetting
        # each one to its own rest x/z (which straightened the reclined torso and pulled the
        # pelvis away from the spine).
        root_shift = (0.0, 0.0)
        if source_pose and not keep_bundle_space and pose_root is not None and pose_bone is not None:
            if anchor_shift is not None:
                root_shift = anchor_shift
            else:
                ax, az = yaw_xz(a_pose_T[pose_root][0], a_pose_T[pose_root][2])
                root_shift = (b_rest_t[pose_bone][0] - ax, b_rest_t[pose_bone][2] - az)
                if position_curves:
                    anchor_shift = root_shift
        q_world: list[list[float] | None] = [None] * n
        t_world: list[list[float] | None] = [None] * n
        for i in order:
            if i in bone_to_anim:
                apid = bone_to_anim[i]
                q_pose = L.quat_from_mat(a_pose_R[apid])
                if source_pose:
                    # Curve values are *local* rotations, the same intrinsic pose in both skeletons.
                    # Copying world rotations would mix the bundle's seated rest frame with the
                    # target's standing rest frame and collapse the pose; only the root needs the
                    # global alignment (it has no POSE_PIVOT parent on the target side).
                    if i == 0 or bones[i]["parent"] < 0:
                        q_world[i] = L.qmul(q_yaw, q_pose)
                    else:
                        q_world[i] = L.qmul(q_world[bones[i]["parent"]], ov[apid])
                else:
                    q_rest = L.quat_from_mat(a_rest_R[apid])
                    # World-space rotation delta: q_pose * inverse(q_rest). Canonicalize the
                    # quaternion (w >= 0) so interpolation/export never sees a double cover.
                    q_delta = L.qmul(q_pose, L.qconj(q_rest))
                    if q_delta[3] < 0:
                        q_delta = [-c for c in q_delta]
                    q_world[i] = L.qmul(q_delta, b_rest_q[i])
                if q_world[i][3] < 0:
                    q_world[i] = [-c for c in q_world[i]]
            else:
                par = bones[i]["parent"]
                if par >= 0 and q_world[par] is not None:
                    q_world[i] = L.qmul(q_world[par], b_rest_lq[i])
                else:
                    q_world[i] = b_rest_q[i]
            par = bones[i]["parent"]
            dlt = motion_dt.get(i)
            if par >= 0 and q_world[par] is not None and t_world[par] is not None:
                parent_R = L.mat_from_q(q_world[par])
                parent_t = t_world[par]
                loc_t = lrest_t[i] if dlt is None else [lrest_t[i][k] + dlt[k] for k in range(3)]
                t_world[i] = [
                    parent_t[k] + sum(parent_R[k][j] * loc_t[j] for j in range(3))
                    for k in range(3)
                ]
            else:
                # Raiz: o deslocamento é o do osso no mundo, porque o clipe pode animar um ancestral
                # sem equivalente no alvo (o `man` do prefab move o corpo todo).
                apid = bone_to_anim.get(i)
                if position_curves and apid is not None and apid in ov_t:
                    t_world[i] = [
                        b_rest_t[i][k] + (a_pose_T[apid][k] - a_rest_T[apid][k]) for k in range(3)
                    ]
                else:
                    t_world[i] = list(b_rest_t[i])
            if source_pose and bones[i]["parent"] < 0 and i in bone_to_anim:
                # Seated height and horizontal placement come from the bundle skeleton (the
                # clip's position curves are constant). Every root chain needs it: the male
                # rig has no skinned wrapper bone, so the body hangs from its own root
                # (`man_Spine`) next to `man_bone_Pelvis`. `root_shift` keeps their relative
                # offsets intact while leaving bone 0 on the seat point.
                apid = bone_to_anim[i]
                src_t = a_pose_T[apid]
                sx, sz = yaw_xz(src_t[0], src_t[2])
                t_world[i][0] = sx + root_shift[0]
                t_world[i][2] = sz + root_shift[1]
                t_world[i][1] = src_t[1]
        # Raízes sem curva no clipe (`man bone Gen Ass`, `man bone pen balls`): no bundle elas
        # ficam paradas na altura de pé mesmo com a pelve na pose sentada, e as vértices pesadas
        # nelas (cintura/glúteo) esticariam ~40 cm. Passam a acompanhar a pelve, mantendo o
        # offset e a rotação de repouso do esqueleto de destino (como se fossem filhas dela).
        if source_pose and pelvis_target is not None and t_world[pelvis_target] is not None:
            qt = q_world[pelvis_target]
            pt = t_world[pelvis_target]
            parent_R = L.mat_from_q(qt)
            q_inv = L.qconj(b_rest_q[pelvis_target])
            for i in static_roots:
                q_world[i] = L.qmul(qt, L.qmul(q_inv, b_rest_q[i]))
                off = [b_rest_t[i][k] - b_rest_t[pelvis_target][k] for k in range(3)]
                t_world[i] = [
                    pt[k] + sum(parent_R[k][j] * off[j] for j in range(3)) for k in range(3)
                ]
            # Descendentes dessas raízes continuam a cadeia a partir delas.
            children: dict[int, list[int]] = {}
            for j, b in enumerate(bones):
                children.setdefault(b["parent"], []).append(j)
            subtree: set[int] = set()
            stack = [j for i in static_roots for j in children.get(i, [])]
            while stack:
                j = stack.pop()
                if j in subtree:
                    continue
                subtree.add(j)
                stack.extend(children.get(j, []))
            for i in order:
                if i not in subtree:
                    continue
                par = bones[i]["parent"]
                par_R = L.mat_from_q(q_world[par])
                q_world[i] = L.qmul(q_world[par], b_rest_lq[i])
                t_world[i] = [
                    t_world[par][k] + sum(par_R[k][j] * lrest_t[i][j] for j in range(3))
                    for k in range(3)
                ]
        frame = []
        for i in range(n):
            frame.append({
                "rot": [round(c, 6) for c in q_world[i]],
                "pos": [round(c, 6) for c in t_world[i]],
            })
        world.append(frame)

    print(f"  animation {Path(anim_path).name}#{clip.m_Name}: {nf} frames @ {fps:g} fps, "
          f"{len(bone_to_anim)}/{n} bones matched")
    return nf, world, fps, clip.m_Name


def transform_component(go):
    """Primeiro `Transform` do GameObject (o prefab guarda a lista em `m_Component`)."""
    for item in go._data.get("m_Component", []):
        ref = item.get("component") or {}
        if int(ref.get("fileID") or 0) == 0:
            continue
        obj = go._env.resolve(go._file_key, int(ref["fileID"]), ref.get("guid"))
        if obj is not None and obj.type.name in ("Transform", "RectTransform"):
            return obj.read()
    return None


def bake_renderer_transform(data: dict, env, mesh_name: str) -> dict:
    """Aplica o TRS do nó do renderer em malhas autoradas no espaço local do nó.

    Quase todas as malhas do 3DX já vêm no espaço do corpo. A dos olhos masculinos
    (`man_jaw_eyes_atlas`) vem na origem do nó, que tem `m_LocalPosition` perto da cabeça — sem
    isso os olhos aparecem no chão. O resultado é ``P * (R*v + T)``, a mesma convenção dos ossos.
    """
    for obj in getattr(env, "objects", []):
        if obj.type.name != "SkinnedMeshRenderer":
            continue
        smr = obj.read()
        try:
            go = smr.m_GameObject.read()
        except Exception:
            continue
        if str(go.m_Name) != mesh_name:
            continue
        tr = transform_component(go)
        if tr is None:
            continue
        pos = tr._data.get("m_LocalPosition") or {}
        rot = tr._data.get("m_LocalRotation") or {}
        t = [float(pos.get(k, 0.0)) for k in "xyz"]
        if max(abs(c) for c in t) < 1e-6:
            return data
        q = [float(rot.get(k, 0.0)) for k in "xyzw"] or [0.0, 0.0, 0.0, 1.0]
        if abs(sum(c * c for c in q)) < 1e-9:
            q = [0.0, 0.0, 0.0, 1.0]
        R = L.mat_from_q(q)
        # Mesma troca Y-up -> Z-up da ponte dos ossos.
        to_bl = lambda v: [v[0], -v[2], v[1]]
        t_bl = to_bl(t)

        def rotate(v):
            return to_bl(L.matvec(R, v))

        data["verts"] = [
            [rotate(v)[k] + t_bl[k] for k in range(3)] for v in data["verts"]
        ]
        if data.get("normals"):
            data["normals"] = [rotate(n) for n in data["normals"]]
        # Os bindposes estão no espaço do nó: sem ajustar, o remap casa os ossos pelo lugar errado
        # (os olhos iam parar nos pés). bind' = bind * inverse(T*R).
        if data.get("bindposes"):
            world = L.m4(R, t)
            inv = L.inv4(world)
            adjusted = []
            for bind in data["bindposes"]:
                rows = [list(bind[i * 4 : i * 4 + 4]) for i in range(4)]
                adjusted.append([float(v) for row in L.mm4(rows, inv) for v in row])
            data["bindposes"] = adjusted
        print(f"  {mesh_name}: TRS do renderer aplicado ({[round(c, 3) for c in t]})")
        return data
    return data


def transform_of(go):
    return transform_component(go)


def pick_smr_for_mesh(env, mesh_path_id: int):
    smrs = [o for o in env.objects if o.type.name == "SkinnedMeshRenderer"]
    for o in smrs:
        s = o.read()
        try:
            if s.m_Mesh.path_id == mesh_path_id:
                return s
        except Exception:
            continue
    if smrs:
        return max((o.read() for o in smrs), key=lambda s: len(s.m_Bones))
    return None


def _key_variants(key: str):
    """Name candidates for a bone key (some wear rigs use a ``_1`` suffix)."""
    yield key
    if key.endswith("_1") or key.endswith("_2"):
        yield key[:-2]
    yield key + "_1"
    yield key + "_2"


def ref_index_for(key: str, ref_by: dict[str, int]) -> int | None:
    for candidate in _key_variants(key):
        if candidate in ref_by:
            return ref_by[candidate]
    return None


#: Escala máxima (e mínima = 1/x) tolerada na parte linear de um osso da peça: o resto é rotação
#: pura (A-pose -> T-pose), então qualquer osso fora dessa faixa tem bindpose incoerente com o rig.
BONE_SCALE_TOLERANCE = 1.25


def inverse_transpose3(m: list[list[float]]) -> list[list[float]]:
    """Inversa transposta de uma 3x3 (cofatores / det); degenerada devolve a própria matriz."""
    cof = [
        [
            m[(i + 1) % 3][(j + 1) % 3] * m[(i + 2) % 3][(j + 2) % 3]
            - m[(i + 1) % 3][(j + 2) % 3] * m[(i + 2) % 3][(j + 1) % 3]
            for j in range(3)
        ]
        for i in range(3)
    ]
    det = sum(m[0][j] * cof[0][j] for j in range(3))
    if abs(det) < 1e-12:
        return m
    return [[cof[i][j] / det for j in range(3)] for i in range(3)]


def retarget_mesh(data: dict, own_bones: list[dict], ref_worlds: list, ref_by: dict[str, int]):
    """Bake a wear mesh into the reference rest pose, matching bones by name.

    A wear bundle may be authored on its own copy of the rig with a rotated /
    translated wrapper root (and an A-pose bind). ``Sm * inverse(bindpose)`` is
    that copy's bone world; the mesh itself lives in the bind pose. Skinning it
    with the *reference* bone world and its own bindpose (``refWorld * bp * v``)
    puts it in the reference rest pose with the reference joint order, which is
    what the game's body uses. ``P`` then turns the Y-up result into Blender's
    Z-up space, exactly like the body mesh.
    """
    mapping: dict[int, int] = {}
    missing: list[str] = []
    for k, bone in enumerate(own_bones):
        found = ref_index_for(L.bone_key(bone["path"]), ref_by)
        if found is None:
            # Missing in the reference (e.g. an extra finger): inherit the
            # nearest mapped ancestor so the weights stay on the same limb.
            parent = bone["parent"]
            while parent >= 0:
                if parent in mapping:
                    found = mapping[parent]
                    break
                parent = own_bones[parent]["parent"]
        if found is None:
            missing.append(bone["path"])
            found = 0
        mapping[k] = found

    # One world*inverse-bind matrix per source bone, indexed by source bone.
    worlds = []
    for k, bp in enumerate(data["bindposes"]):
        M = [[bp[r * 4 + c] for c in range(4)] for r in range(4)]
        worlds.append(L.mm4(ref_worlds[mapping[k]], M))

    # Osso com escala própria no bindpose (``Gen_Ass`` nas roupas masculinas, ~14x): o contrato de
    # esqueleto congelado não tem escala, então a parte linear dele amplia/gira o vértice e puxa a
    # calça para fora da bunda (um "bico" sólido). A influência é descartada e o peso renormalizado;
    # o ``fit_cloth`` reatribui os pesos pelo corpo depois.
    outliers: set[int] = set()
    for k, M in enumerate(worlds):
        scales = [math.sqrt(sum(M[r][c] ** 2 for r in range(3))) for c in range(3)]
        if any(not (1 / BONE_SCALE_TOLERANCE <= s <= BONE_SCALE_TOLERANCE) for s in scales):
            outliers.add(k)
    if outliers:
        print(
            "  bones com escala destoante (influência descartada): "
            + ", ".join(own_bones[k]["path"].rsplit("/", 1)[-1] for k in sorted(outliers))
        )

    normals_in = data.get("normals")
    verts = []
    normals = []
    for vi, v in enumerate(data["verts"]):
        base = vi * 4
        acc = [0.0, 0.0, 0.0]
        lin = [[0.0] * 3 for _ in range(3)]
        total = 0.0
        for j in range(4):
            w = data["weights"][base + j]
            if w <= 0:
                continue
            local = data["boneIdx"][base + j]
            if local in outliers:
                continue
            M = worlds[local] if local < len(worlds) else L.I4
            total += w
            for r in range(3):
                acc[r] += w * (
                    M[r][0] * v[0] + M[r][1] * v[1] + M[r][2] * v[2] + M[r][3]
                )
                for c in range(3):
                    lin[r][c] += w * M[r][c]
        if total > 0 and abs(total - 1.0) > 1e-6:
            acc = [c / total for c in acc]
        # Y-up reference world -> Blender Z-up (P), same convention as the body.
        verts.append([round(acc[0], 5), round(-acc[2], 5), round(acc[1], 5)])
        if normals_in:
            # A normal segue o mesmo skinning do vértice (inversa transposta da parte linear
            # misturada): sem isso o pano retargeteado (A-pose -> pose de referência) mantém as
            # normais da pose original e partes dele ficam escuras/viradas para dentro.
            n = L.matvec(inverse_transpose3(lin), normals_in[vi])
            length = math.sqrt(sum(c * c for c in n)) or 1.0
            n = [c / length for c in n]
            normals.append([round(n[0], 5), round(-n[2], 5), round(n[1], 5)])
    data["verts"] = verts
    if normals_in:
        data["normals"] = normals
    data["boneIdx"] = [mapping[i] for i in data["boneIdx"]]
    return mapping, missing


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", required=True, help="bundle or serial file that contains the mesh")
    ap.add_argument("--mesh", required=True, nargs="+", help="mesh name(s), e.g. man_body man_head")
    ap.add_argument("--skeleton", help="bundle that provides the rig (defaults to --source)")
    ap.add_argument(
        "--skeleton-json",
        help="rig JSON (bones list) that provides the reference rest pose, e.g. tools/3dx/rigs/3dx_male.json",
    )
    ap.add_argument("--gender", choices=["male", "female"], default="male")
    ap.add_argument("--anim", help="animation bundle or serial file to embed")
    ap.add_argument(
        "--anim-clip",
        help="clip name or path_id inside --anim (base clips live in resources.assets)",
    )
    ap.add_argument(
        "--anim-root",
        help="character prefab (man/woman) whose POSE_PIVOT subtree is the animation skeleton",
    )
    ap.add_argument("--retarget", action="store_true", help="bake a wear item onto --skeleton by bone name")
    ap.add_argument("--path-id", type=int, help="pin a mesh by object id when names collide")
    ap.add_argument("--out", required=True, help="output JSON")
    args = ap.parse_args()

    source = Path(args.source)
    print(f"[extract] source={source.name} meshes={args.mesh} gender={args.gender}")
    project_source = source.suffix.lower() == ".prefab"
    anim_path = Path(args.anim) if args.anim else None
    if project_source and anim_path is not None and anim_path.suffix.lower() == ".anim":
        from project_env import ProjectEnv

        src_env = ProjectEnv.from_prefab(source, extra_files=[anim_path])
    else:
        src_env = L.load_env(source)
    _, src_info = L.build_transforms(src_env)

    # --- skeleton ---
    if args.skeleton and args.skeleton_json:
        raise SystemExit("pass either --skeleton or --skeleton-json, not both")
    if args.retarget:
        if not args.skeleton and not args.skeleton_json:
            raise SystemExit("--retarget needs --skeleton or --skeleton-json (the base character rig)")
        if args.skeleton_json:
            rig = json.loads(Path(args.skeleton_json).read_text(encoding="utf-8"))
            bones = rig["bones"]
            print(
                f"  skeleton {Path(args.skeleton_json).name}: {len(bones)} bones (retarget by name)"
            )
        else:
            if Path(args.skeleton).resolve() != source.resolve():
                skel_env = L.load_env(args.skeleton)
                _, skel_info = L.build_transforms(skel_env)
            else:
                skel_env = src_env
                skel_info = src_info
            bones = L.skeleton_from_smr(skel_env, skel_info, L.widest_skeleton_smr(skel_env))
            print(f"  skeleton {Path(args.skeleton).name}: {len(bones)} bones (retarget by name)")
        ref_worlds = [L.m4(L.mat_from_q(b["rest"]), b["pos"]) for b in bones]
        ref_by: dict[str, int] = {}
        for i, b in enumerate(bones):
            ref_by.setdefault(L.bone_key(b["path"]), i)
        remap = False
    elif args.skeleton_json:
        rig = json.loads(Path(args.skeleton_json).read_text(encoding="utf-8"))
        bones = rig["bones"]
        print(f"  skeleton {Path(args.skeleton_json).name}: {len(bones)} bones")
        remap = True
    elif args.skeleton and Path(args.skeleton).resolve() != source.resolve():
        skel_env = L.load_env(args.skeleton)
        _, skel_info = L.build_transforms(skel_env)
        bones = L.skeleton_from_smr(skel_env, skel_info, L.widest_skeleton_smr(skel_env))
        print(f"  skeleton {Path(args.skeleton).name}: {len(bones)} bones")
        remap = True
    else:
        skel_info = src_info
        remap = False
        bones = []

    # --- meshes ---
    meshes = []
    for name in args.mesh:
        obj_pid, mesh = L.find_mesh(src_env, name, args.path_id)
        data = L.extract_mesh(mesh)
        if project_source:
            data = bake_renderer_transform(data, src_env, name)
        if args.retarget:
            smr = pick_smr_for_mesh(src_env, obj_pid)
            if smr is None:
                raise SystemExit(f"no SkinnedMeshRenderer for mesh {name!r}")
            own_bones = L.skeleton_from_smr(src_env, src_info, smr)
            if len(own_bones) != len(data["bindposes"]):
                raise SystemExit(
                    f"mesh {name!r}: {len(data['bindposes'])} bindposes but "
                    f"{len(own_bones)} SMR bones"
                )
            mapping, missing = retarget_mesh(data, own_bones, ref_worlds, ref_by)
            print(
                f"  {name}: {len(data['verts'])} verts, retargeted {len(mapping)} bones"
                + (f" (unmatched: {missing})" if missing else "")
            )
        elif remap:
            mapping, worst = L.remap_bindposes(data["bindposes"], bones)
            L.remap_mesh_bones(data, mapping)
            status = "ok" if worst < 1e-3 else f"WARN worst_t={worst:.4g}"
            print(f"  {name}: {len(data['verts'])} verts, bone remap {len(mapping)} -> {status}")
        else:
            smr = pick_smr_for_mesh(src_env, obj_pid)
            if not bones and smr is not None:
                bones = L.skeleton_from_smr(src_env, skel_info, smr)
                print(f"  skeleton: {len(bones)} bones (from {name})")
            print(f"  {name}: {len(data['verts'])} verts (skeleton indices kept)")
        meshes.append(data)

    if not bones:
        raise SystemExit("no skeleton resolved: pass --skeleton or use a source with a SkinnedMeshRenderer")

    out = {
        "gender": args.gender,
        "source": str(source),
        "skeleton": (
            str(args.skeleton_json)
            if args.skeleton_json
            else (str(args.skeleton) if args.skeleton else str(source))
        ),
        "bones": bones,
        "meshes": meshes,
    }
    if args.retarget:
        out["retargeted"] = True

    if args.anim:
        selector: str | int | None = args.anim_clip
        if isinstance(selector, str) and selector.isdigit():
            selector = int(selector)
        nf, world, fps, clip_name = animation_frames(
            args.anim,
            bones,
            selector,
            args.anim_root,
            aenv=src_env if project_source else None,
            anim_file=(
                str(anim_path)
                if project_source and anim_path is not None and anim_path.suffix.lower() == ".anim"
                else None
            ),
        )
        out["frames"] = nf
        out["fps"] = fps
        out["animName"] = clip_name
        out["world"] = world

    dest = Path(args.out)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out), encoding="utf-8")
    print(f"[extract] wrote {dest} ({dest.stat().st_size} bytes), bones={len(bones)}, meshes={len(meshes)}")


if __name__ == "__main__":
    main()
