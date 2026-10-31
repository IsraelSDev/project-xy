"""Read the exported Unity project (YAML text) with the same API the pipeline uses from UnityPy.

``lib3dx`` and ``extract_character`` only touch a few members of UnityPy objects: ``env.objects``
(``.type.name``, ``.path_id``, ``.read()``), and on the read objects the YAML field names
(``m_Name``, ``m_Father``, ``m_Bones``, ``m_RotationCurves``...). The exported project keeps the same
names in YAML, so this module wraps the documents in attribute-access nodes and resolves references
(``{fileID, guid}``) through the ``.meta`` GUID index. The pipeline code does not change.

Scope: transforms, skinned renderers, mesh decoding and animation clips (the same data
``lib3dx`` reads from a bundle). See ``docs/guides/3dx-projeto-exportado.md``.

Usage::

    env = ProjectEnv.from_prefab(r"E:\\dev\\exported\\ExportedProject\\Assets\\Resources\\man\\man.prefab",
                                 extra_files=[r"...\\AnimationClip\\slowdance_man.anim"])
    _, info = lib3dx.build_transforms(env)   # works on env as on a UnityPy env
"""

from __future__ import annotations

import re
import struct
from pathlib import Path

import yaml

_FLOAT_NO_DOT = re.compile(r"^[-+]?[0-9][0-9_]*\.?[0-9_]*[eE][-+]?[0-9]+$")
_FLOAT = re.compile(r"^[-+]?(\.[0-9]+|[0-9][0-9_]*\.[0-9_]*)([eE][-+]?[0-9]+)?$")


class _UnityLoader(yaml.CSafeLoader):
    """Unity writes ``1E-05`` (no dot); PyYAML reads that as a string. Teach it the float form."""


_UnityLoader.add_implicit_resolver(
    "tag:yaml.org,2002:float", _FLOAT_NO_DOT, list("-+0123456789.")
)
_UnityLoader.add_implicit_resolver("tag:yaml.org,2002:float", _FLOAT, list("-+0123456789."))

_DOC_HEADER = re.compile(r"^--- !u!(\d+) &(-?\d+)\s*$", re.M)
_DIRECTIVE = re.compile(r"^%(?:YAML|TAG)[^\n]*\n", re.M)
_GUID_LINE = re.compile(r"^guid: ([0-9a-f]{32})\s*$", re.M)
# Unity writes these blobs as a bare hex line. When every nibble is a digit PyYAML parses
# them as an int and the leading zeros (and the byte offset) are lost. Quote them first.
_HEX_FIELD = re.compile(
    r"^(?P<indent>\s*)(?P<key>m_IndexBuffer|_typelessdata):\s*(?P<value>[0-9a-fA-F]+)\s*$", re.M
)


def parse_unity_yaml(text: str) -> dict[int, tuple[int, str, dict]]:
    """Split a Unity YAML asset into ``{fileID: (classID, className, payload)}``."""
    text = _HEX_FIELD.sub(
        lambda match: f'{match.group("indent")}{match.group("key")}: "{match.group("value")}"',
        text,
    )
    text = _DIRECTIVE.sub("", text)
    parts = _DOC_HEADER.split(text)
    docs: dict[int, tuple[int, str, dict]] = {}
    for i in range(1, len(parts), 3):
        class_id, file_id, body = int(parts[i]), int(parts[i + 1]), parts[i + 2]
        data = yaml.load(body, Loader=_UnityLoader)
        if not data:
            continue
        (class_name, payload), = data.items()
        docs[file_id] = (class_id, class_name, payload)
    return docs


def find_project_root(path: Path) -> Path:
    for parent in [path, *path.parents]:
        if parent.name == "Assets":
            return parent.parent
    raise ValueError(f"{path} is not inside an Assets folder of a Unity project")


_guid_cache: dict[Path, dict[str, Path]] = {}


def guid_index(root: Path) -> dict[str, Path]:
    """GUID -> asset path (the ``.meta`` file name without ``.meta``)."""
    if root not in _guid_cache:
        index: dict[str, Path] = {}
        for meta in (root / "Assets").rglob("*.meta"):
            match = _GUID_LINE.search(meta.read_text(encoding="utf-8", errors="ignore"))
            if match:
                index[match.group(1)] = meta.with_suffix("")
        _guid_cache[root] = index
    return _guid_cache[root]


class _Type:
    __slots__ = ("name",)

    def __init__(self, name: str):
        self.name = name


class ProjectObject:
    """One YAML document, shaped like a UnityPy object (``type.name``, ``path_id``, ``read()``)."""

    def __init__(self, env: "ProjectEnv", file_key: str, path_id: int, class_name: str, payload: dict):
        self._env = env
        self._file_key = file_key
        self.path_id = path_id
        self.type = _Type(class_name)
        self._payload = payload

    def read(self) -> "Node":
        return Node(self._payload, self._env, self._file_key)


def _normalize_guid(guid) -> str | None:
    """``guid: 0``/``0.0`` is Unity's built-in resources, not a file in the project."""
    if guid is None:
        return None
    if isinstance(guid, (int, float)) and not guid:
        return None
    text = str(guid)
    if text in ("0", "0.0") or text.startswith("0000000000000000"):
        # Unity built-in resources (default material, primitives) live outside the project.
        return None
    return text


class Ref:
    """``{fileID: N, guid: G}``. ``read()`` returns the referenced node (UnityPy-like)."""

    __slots__ = ("path_id", "_guid", "_file_key", "_env")

    def __init__(self, env: "ProjectEnv", file_key: str, file_id: int, guid: str | None):
        self._env = env
        self._file_key = file_key
        self.path_id = file_id
        self._guid = _normalize_guid(guid)

    @property
    def guid(self) -> str | None:
        return self._guid

    def read(self) -> "Node | None":
        if self.path_id == 0:
            return None
        obj = self._env.resolve(self._file_key, self.path_id, self._guid)
        return obj.read() if obj is not None else None


class Node:
    """Attribute view over a YAML mapping. Fields are converted on access."""

    def __init__(self, data: dict, env: "ProjectEnv", file_key: str):
        object.__setattr__(self, "_data", data)
        object.__setattr__(self, "_env", env)
        object.__setattr__(self, "_file_key", file_key)

    def __getattr__(self, name: str):
        data = object.__getattribute__(self, "_data")
        if name not in data:
            raise AttributeError(name)
        return _convert(data[name], object.__getattribute__(self, "_env"), object.__getattribute__(self, "_file_key"))

    def __repr__(self) -> str:
        return f"Node({sorted(object.__getattribute__(self, '_data'))[:6]}...)"


def _convert(value, env: "ProjectEnv", file_key: str):
    if isinstance(value, dict):
        if set(value) >= {"fileID"} and len(value) <= 3 and set(value) <= {"fileID", "guid", "type"}:
            return Ref(env, file_key, int(value["fileID"]), value.get("guid"))
        return Node(value, env, file_key)
    if isinstance(value, list):
        return [_convert(item, env, file_key) for item in value]
    return value


class ProjectEnv:
    """The objects of one or more Unity YAML files of a project."""

    def __init__(self, root: Path):
        self.root = root
        self.objects: list[ProjectObject] = []
        self._docs: dict[str, dict[int, ProjectObject]] = {}
        self._guids = guid_index(root)

    @classmethod
    def from_prefab(cls, prefab: str | Path, extra_files: "list[str | Path] | tuple" = ()) -> "ProjectEnv":
        prefab = Path(prefab).resolve()
        env = cls(find_project_root(prefab))
        env._load(prefab)
        for extra in extra_files:
            env._load(Path(extra).resolve())
        env._attach_referenced_meshes()
        return env

    @classmethod
    def from_scene(cls, scene: str | Path, extra_files: "list[str | Path] | tuple" = ()) -> "ProjectEnv":
        """Load a ``.unity`` scene. Meshes/materials/textures resolve by GUID on demand."""
        scene = Path(scene).resolve()
        env = cls(find_project_root(scene))
        env._load(scene)
        for extra in extra_files:
            env._load(Path(extra).resolve())
        return env

    def asset_path(self, guid: str | None) -> Path | None:
        """Path of a project asset by GUID (``None`` for built-in resources)."""
        guid = _normalize_guid(guid)
        return None if guid is None else self._guids.get(guid)

    def _load(self, path: Path) -> dict[int, ProjectObject]:
        key = str(path)
        if key in self._docs:
            return self._docs[key]
        parsed = parse_unity_yaml(path.read_text(encoding="utf-8"))
        docs = {}
        for file_id, (_, class_name, payload) in parsed.items():
            obj = ProjectObject(self, key, file_id, class_name, payload)
            docs[file_id] = obj
        self._docs[key] = docs
        self.objects.extend(docs.values())
        return docs

    def _asset_key(self, file_key: str, guid: str | None) -> str:
        if guid is None:
            return file_key
        path = self._guids.get(guid)
        if path is None:
            raise KeyError(f"guid {guid} is not in the project (referenced from {file_key})")
        return str(path.resolve())

    def resolve(self, file_key: str, file_id: int, guid: str | None) -> ProjectObject | None:
        key = self._asset_key(file_key, guid)
        if key not in self._docs:
            self._load(Path(key))
        return self._docs[key].get(file_id)

    def _attach_referenced_meshes(self) -> None:
        """Put the mesh of each SkinnedMeshRenderer into ``objects``, as UnityPy does with ``find_mesh``."""
        present = {(obj._file_key, obj.path_id) for obj in self.objects}
        for obj in list(self.objects):
            if obj.type.name != "SkinnedMeshRenderer":
                continue
            mesh_ref = obj.read().m_Mesh
            if mesh_ref.path_id == 0:
                continue
            mesh_key = self._asset_key(obj._file_key, mesh_ref._guid)
            mesh = self.resolve(obj._file_key, mesh_ref.path_id, mesh_ref._guid)
            if mesh is not None and (mesh_key, mesh.path_id) not in present:
                present.add((mesh_key, mesh.path_id))
                self.objects.append(mesh)


# --- meshes ----------------------------------------------------------------

# Unity ``VertexAttributeFormat`` -> bytes per component.
_FORMAT_SIZE = {0: 4, 1: 2, 2: 1, 3: 1, 4: 2, 5: 2, 6: 1, 7: 1, 8: 2, 9: 2, 10: 4, 11: 4}


def _component(raw: bytes, offset: int, fmt: int) -> float:
    if fmt == 0:  # Float32
        return struct.unpack_from("<f", raw, offset)[0]
    if fmt == 1:  # Float16
        return struct.unpack_from("<e", raw, offset)[0]
    if fmt == 2:  # UNorm8
        return raw[offset] / 255.0
    raise NotImplementedError(f"vertex format {fmt} is not supported yet")


def _index_bytes(mesh_node: Node) -> bytes:
    value = mesh_node._data.get("m_IndexBuffer")
    if value is None:
        return b""
    if isinstance(value, str):
        return bytes.fromhex(value)
    # Defensive: an old read may have parsed a digit-only blob as int (leading zeros lost).
    raise ValueError(
        f"mesh {mesh_node.m_Name!r}: m_IndexBuffer was parsed as {type(value).__name__}; "
        "reload the file with project_env.parse_unity_yaml"
    )


def mesh_submeshes(mesh_node: Node) -> list[list[int]]:
    """Triangle index lists per submesh, in the order ``m_SubMeshes`` declares them."""
    index_bytes = _index_bytes(mesh_node)
    index16 = struct.unpack(f"<{len(index_bytes) // 2}H", index_bytes)
    submeshes: list[list[int]] = []
    for submesh in mesh_node.m_SubMeshes:
        if int(submesh.topology) != 0:  # triangles only
            submeshes.append([])
            continue
        first = int(submesh.firstByte) // 2
        submeshes.append(list(index16[first : first + int(submesh.indexCount)]))
    return submeshes


def extract_mesh_project(mesh_node: Node, *, with_submeshes: bool = False) -> dict:
    """Decode a project ``Mesh`` into the same dict ``lib3dx.extract_mesh`` returns.

    Unity 5.x layout: ``m_Channels`` is indexed by attribute (0 position, 1 normal, 3 UV0...);
    each channel points at a stream/offset/format/dimension. Strides are the sum of the channel
    sizes of the stream and the streams are packed one after the other, ``stride * N`` each.
    ``m_DataSize`` is the checksum.
    """
    vertex_data = mesh_node.m_VertexData
    count = int(vertex_data.m_VertexCount)
    channels: dict[int, tuple[int, int, int, int]] = {}
    strides: dict[int, int] = {}
    for attribute, channel in enumerate(vertex_data.m_Channels):
        dimension = int(channel.dimension)
        if dimension == 0:
            continue
        fmt = int(channel.format)
        if fmt not in _FORMAT_SIZE:
            raise NotImplementedError(f"vertex format {fmt} is not supported yet")
        stream = int(channel.stream)
        channels[attribute] = (stream, int(channel.offset), fmt, dimension)
        strides[stream] = strides.get(stream, 0) + dimension * _FORMAT_SIZE[fmt]

    starts: dict[int, int] = {}
    cursor = 0
    ordered = sorted(strides)
    for index, stream in enumerate(ordered):
        starts[stream] = cursor
        cursor += strides[stream] * count
        if index + 1 < len(ordered):  # Unity aligns each stream to 16 bytes
            cursor = (cursor + 15) & ~15

    vertex_bytes = bytes.fromhex(vertex_data._typelessdata)
    data_size = int(vertex_data.m_DataSize)
    if cursor != data_size or len(vertex_bytes) != data_size:
        raise ValueError(
            f"mesh {mesh_node.m_Name!r}: {count} verts, computed {cursor} bytes, "
            f"m_DataSize {data_size}, payload {len(vertex_bytes)}"
        )

    def values(attribute: int) -> list[list[float]]:
        stream, offset, fmt, dimension = channels[attribute]
        size = _FORMAT_SIZE[fmt]
        start = starts[stream] + offset
        stride = strides[stream]
        return [
            [_component(vertex_bytes, start + vertex * stride + k * size, fmt) for k in range(dimension)]
            for vertex in range(count)
        ]

    positions = values(0)
    normals = values(1) if 1 in channels else []
    uvs = values(3)[:count] if 3 in channels else []

    submeshes = mesh_submeshes(mesh_node)
    indices: list[int] = []
    for submesh in submeshes:
        indices.extend(submesh)

    skin = mesh_node.m_Skin if "m_Skin" in mesh_node._data else []
    bone_idx: list[int] = []
    weights: list[float] = []
    for vertex in skin:
        for k in range(4):
            bone_idx.append(int(getattr(vertex, f"boneIndex[{k}]")))
            weights.append(round(float(getattr(vertex, f"weight[{k}]")), 5))

    bindposes = []
    for bindpose in mesh_node.m_BindPose if "m_BindPose" in mesh_node._data else []:
        bindposes.append(
            [round(float(getattr(bindpose, f"e{r}{c}")), 6) for r in range(4) for c in range(4)]
        )

    result = {
        "name": mesh_node.m_Name,
        "verts": [[round(float(v), 5) for v in point] for point in positions],
        "normals": [[round(float(v), 5) for v in normal] for normal in normals],
        "uvs": [[round(float(v), 5) for v in uv] for uv in uvs],
        "indices": indices,
        "boneIdx": bone_idx,
        "weights": weights,
        "bindposes": bindposes,
    }
    if with_submeshes:
        result["submeshes"] = submeshes
    return result

