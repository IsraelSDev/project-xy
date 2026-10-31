import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { Skeleton } from '@babylonjs/core/Bones/skeleton';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
// Efeito colateral: registra `Ray`/`createPickingRay` (usado no arrastar do casal).
import '@babylonjs/core/Culling/ray';
import type { AssetContainer, InstantiatedEntries } from '@babylonjs/core/assetContainer';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import type { ArcRotateCameraPointersInput } from '@babylonjs/core/Cameras/Inputs/arcRotateCameraPointersInput';
import { Engine } from '@babylonjs/core/Engines/engine';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Plane } from '@babylonjs/core/Maths/math.plane';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateLineSystem, CreateLines } from '@babylonjs/core/Meshes/Builders/linesBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import { INTERACTION_LABELS, type InteractionType } from '@3dx/contracts';
import {
  CLUB,
  HOME,
  PAIR_POSES,
  STUDIO,
  pairFacing,
  partnerPlacement,
  type RoomLayout,
  type SceneSeat,
} from '@3dx/game-core';
import {
  freezeFaceOnSit,
  JOINTS_3DX_FEMALE,
  JOINTS_3DX_MALE,
  loadPairClipGroup,
  NATIVE_ASSET_VERSION,
  normalizeModelTo,
  pickRig,
  softenAlphaMasks,
  stripDefaultMetallic,
  stripRootMotion,
} from '../game/characters/avatar-model';
import {
  clubFloorHeight,
  createClubLighting,
  loadClub,
  type ClubLighting,
} from '../game/rendering/club';
import { loadHome } from '../game/rendering/home';
import { buildStudio } from '../game/rendering/studio';

type RoomName = 'club' | 'home' | 'studio';
type Gender = 'male' | 'female';

interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface State {
  room: RoomName;
  type: string;
  initiator: Gender;
  seatIndex: number;
  seatRight: number;
  seatForward: number;
  facing: number;
  partnerRight: number;
  partnerForward: number;
  partnerYaw: number;
  /** Altura extra do par (m) para encaixar na altura do móvel. */
  liftOffset: number;
}

interface TunerAvatar {
  model: Gender;
  root: TransformNode;
  container: AssetContainer;
  entries: InstantiatedEntries;
  groups: Map<string, AnimationGroup>;
  current?: AnimationGroup;
  /** Última ação pedida: um clipe sob demanda que chega atrasado só toca se ainda for esta. */
  wanted?: string;
  disposed?: boolean;
  skeleton?: Skeleton;
  meshes: AbstractMesh[];
  pelvis?: TransformNode;
}

const el = <T extends HTMLElement>(id: string): T => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`elemento #${id} não encontrado`);
  return found as T;
};

// Todos os pares de móvel (M/F, F/F e M/M): o editor monta os dois corpos do gênero do par.
const interactionTypes = Object.keys(PAIR_POSES).filter((type) => PAIR_POSES[type]?.seat);
/** Composição do par selecionado; os pares antigos não declaram nada e são M/F. */
const pairingOf = (type: string): 'mf' | 'ff' | 'mm' => PAIR_POSES[type]?.pairing ?? 'mf';
const fallbackType = interactionTypes.includes('sofa-3')
  ? 'sofa-3'
  : (interactionTypes[0] ?? 'sofa-3');
const params = new URLSearchParams(location.search);
const numberParam = (key: string): number | undefined => {
  const value = Number(params.get(key));
  return Number.isFinite(value) ? value : undefined;
};
const requestedType = params.get('type');
const requestedRoom = params.get('room');
const state: State = {
  room: requestedRoom === 'home' ? 'home' : requestedRoom === 'studio' ? 'studio' : 'club',
  type: requestedType && interactionTypes.includes(requestedType) ? requestedType : fallbackType,
  initiator: params.get('initiator') === 'female' ? 'female' : 'male',
  seatIndex: Number(params.get('seat') ?? '-1'),
  seatRight: numberParam('sr') ?? 0,
  seatForward: numberParam('sf') ?? 0,
  facing: numberParam('facing') ?? 0,
  partnerRight: numberParam('pr') ?? 0,
  partnerForward: numberParam('pf') ?? 0,
  partnerYaw: numberParam('yaw') ?? 0,
  liftOffset: numberParam('lift') ?? 0,
};

const currentPair = () => PAIR_POSES[state.type] ?? PAIR_POSES[fallbackType]!;

// ---------------------------------------------------------------------------
// Ajustes feitos à mão (rascunhos)
// ---------------------------------------------------------------------------

/**
 * Valores que o editor manda de volta: `facing` gira o par no referencial do assento,
 * `seatOffset` move o par no chão e `byInitiator` guarda o deslocamento/giro do parceiro por
 * gênero de quem inicia (é o mesmo formato de `PAIR_POSES`).
 */
interface Draft {
  facing: number;
  seatOffset: [number, number];
  lift: number;
  byInitiator: Record<Gender, { offset: [number, number]; yaw: number }>;
}

const DRAFT_KEY = '3dx-pair-tuner-drafts-v1';

function loadDrafts(): Record<string, Draft> {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<Draft>>;
    const loaded: Record<string, Draft> = {};
    for (const [type, value] of Object.entries(parsed)) {
      if (!PAIR_POSES[type] || !value) continue;
      const seatOffset = value.seatOffset;
      if (!Array.isArray(seatOffset) || seatOffset.length !== 2) continue;
      if (!Number.isFinite(value.facing ?? NaN)) continue;
      const side = (gender: Gender): { offset: [number, number]; yaw: number } => {
        const entry = value.byInitiator?.[gender];
        const offset = entry?.offset;
        return {
          offset:
            Array.isArray(offset) && offset.length === 2
              ? [Number(offset[0]), Number(offset[1])]
              : [0, 0],
          yaw: Number.isFinite(entry?.yaw ?? NaN) ? Number(entry?.yaw) : 0,
        };
      };
      loaded[type] = {
        facing: Number(value.facing),
        seatOffset: [Number(seatOffset[0]), Number(seatOffset[1])],
        lift: Number.isFinite(value.lift ?? NaN) ? Number(value.lift) : 0,
        byInitiator: { male: side('male'), female: side('female') },
      };
    }
    return loaded;
  } catch {
    return {};
  }
}

const drafts: Record<string, Draft> = loadDrafts();

function persistDrafts() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
  } catch {
    setStatus('Não consegui salvar os ajustes no navegador.', true);
  }
}

/** Parceiro do código para o gênero indicado (usado ao criar o ajuste do outro gênero). */
function codeSide(type: string, gender: Gender): { offset: [number, number]; yaw: number } {
  const pair = PAIR_POSES[type] ?? currentPair();
  const variant = pair.byInitiator?.[gender] ?? pair;
  return { offset: [variant.offset[0], variant.offset[1]], yaw: variant.yaw };
}

/** Grava o estado atual como ajuste do par selecionado. */
function commitDraft() {
  const isNew = drafts[state.type] === undefined;
  const existing = drafts[state.type];
  const byInitiator: Draft['byInitiator'] = {
    male: existing?.byInitiator.male ?? codeSide(state.type, 'male'),
    female: existing?.byInitiator.female ?? codeSide(state.type, 'female'),
  };
  byInitiator[state.initiator] = {
    offset: [state.partnerRight, state.partnerForward],
    yaw: state.partnerYaw,
  };
  drafts[state.type] = {
    facing: state.facing,
    seatOffset: [state.seatRight, state.seatForward],
    lift: state.liftOffset,
    byInitiator,
  };
  persistDrafts();
  if (isNew) refreshList();
  refreshJson();
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** JSON que o editor devolve: só os pares mexidos, em metros e graus. */
function exportDrafts(): string {
  const pairs: Record<string, unknown> = {};
  for (const type of Object.keys(drafts).sort()) {
    const draft = drafts[type]!;
    const side = (gender: Gender) => ({
      offset: [
        roundTo(draft.byInitiator[gender].offset[0], 3),
        roundTo(draft.byInitiator[gender].offset[1], 3),
      ],
      yaw: roundTo(draft.byInitiator[gender].yaw, 1),
    });
    const base = {
      facing: roundTo(draft.facing, 1),
      seatOffset: [roundTo(draft.seatOffset[0], 3), roundTo(draft.seatOffset[1], 3)],
      lift: roundTo(draft.lift, 3),
    };
    // Pares do mesmo gênero não têm variante por gênero de quem inicia.
    pairs[type] =
      pairingOf(type) === 'mf' ? { ...base, male: side('male'), female: side('female') } : base;
  }
  return JSON.stringify({ pairs }, null, 2);
}

function refreshJson() {
  const pre = document.getElementById('json');
  if (!pre) return;
  const count = Object.keys(drafts).length;
  pre.textContent =
    count === 0 ? 'Nenhum ajuste ainda. Arraste o casal ou mexa nos campos.' : exportDrafts();
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

const canvas = el<HTMLCanvasElement>('canvas');
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
const scene = new Scene(engine);
scene.clearColor = new Color4(0.03, 0.035, 0.05, 1);

const camera = new ArcRotateCamera(
  'tuner-camera',
  -Math.PI / 2,
  1.18,
  3.2,
  new Vector3(0, 0.7, 0),
  scene,
);
camera.attachControl(canvas, true);
camera.wheelPrecision = 40;
camera.lowerRadiusLimit = 0.5;
camera.upperRadiusLimit = 20;
camera.checkCollisions = false;
camera.panningSensibility = 0;
// O botão do meio (e o direito) giram a câmera; o esquerdo depende do modo escolhido no painel
// (`applyDragMode`). Sem isso o botão do meio abre o autoscroll do navegador por cima do canvas.
canvas.addEventListener('mousedown', (event) => {
  if (event.button === 1) event.preventDefault();
});
scene.activeCamera = camera;

const hemi = new HemisphericLight('tuner-hemi', new Vector3(0, 1, 0), scene);
hemi.intensity = 0.6;
hemi.groundColor = new Color3(0.12, 0.1, 0.16);
const sun = new DirectionalLight('tuner-sun', new Vector3(-0.35, -1, -0.3), scene);
sun.intensity = 0.85;
sun.position = new Vector3(4, 6, -4);

const overlayRoot = new TransformNode('tuner-overlay', scene);
let overlayMeshes: Mesh[] = [];
let propMesh: Mesh | undefined;
let gridMesh: LinesMesh | undefined;
let actorMarker: Mesh | undefined;
let partnerMarker: Mesh | undefined;
let seatMarker: Mesh | undefined;
let forwardLine: LinesMesh | undefined;

const propMaterial = new StandardMaterial('tuner-prop-material', scene);
propMaterial.emissiveColor = new Color3(0.25, 0.9, 0.55);
propMaterial.disableLighting = true;
propMaterial.wireframe = true;

const markerMaterials = {
  seat: new StandardMaterial('tuner-seat-material', scene),
  actor: new StandardMaterial('tuner-actor-material', scene),
  partner: new StandardMaterial('tuner-partner-material', scene),
};
markerMaterials.seat.emissiveColor = new Color3(1, 0.85, 0.25);
markerMaterials.actor.emissiveColor = new Color3(0.25, 0.7, 1);
markerMaterials.partner.emissiveColor = new Color3(1, 0.35, 0.65);
for (const material of Object.values(markerMaterials)) material.disableLighting = true;

// ---------------------------------------------------------------------------
// Room and seats
// ---------------------------------------------------------------------------

let layout: RoomLayout = CLUB;
let roomDispose: (() => void) | undefined;
/** Raiz da sala carregada, para poder esconder a decoração e ver o casal de qualquer lado. */
let roomRoot: TransformNode | undefined;

function applyRoomVisibility() {
  const hide = document.getElementById('hideRoom');
  roomRoot?.setEnabled(!(hide instanceof HTMLInputElement && hide.checked));
}
let clubLights: ClubLighting | undefined;
let roomToken = 0;
let seat: SceneSeat | undefined;
/** A URL fixou o `facing`: a primeira escolha de assento não o sobrescreve. */
let facingFromUrl = params.has('facing');
let seatProp: { name: string; box: Box; height: number } | undefined;

const seatKind = () => currentPair().seat;
const inside = (box: Box, point: { x: number; z: number }) =>
  point.x >= box.minX && point.x <= box.maxX && point.z >= box.minZ && point.z <= box.maxZ;

function findSeatProp(): { name: string; box: Box; height: number } | undefined {
  if (!seat) return undefined;
  const containing = layout.props
    .filter((prop) => inside(prop.box, seat!.position))
    .sort(
      (a, b) =>
        (a.box.maxX - a.box.minX) * (a.box.maxZ - a.box.minZ) -
        (b.box.maxX - b.box.minX) * (b.box.maxZ - b.box.minZ),
    );
  const chosen = containing[0];
  if (chosen) return { name: chosen.name, box: chosen.box, height: chosen.height };
  const nearest = [...layout.props].sort((a, b) => {
    const center = (prop: (typeof layout.props)[number]) =>
      Math.hypot(
        (prop.box.minX + prop.box.maxX) / 2 - seat!.position.x,
        (prop.box.minZ + prop.box.maxZ) / 2 - seat!.position.z,
      );
    return center(a) - center(b);
  })[0];
  return nearest ? { name: nearest.name, box: nearest.box, height: nearest.height } : undefined;
}

function clearOverlay() {
  for (const mesh of overlayMeshes) mesh.dispose();
  overlayMeshes = [];
  propMesh = undefined;
  gridMesh = undefined;
  actorMarker = undefined;
  partnerMarker = undefined;
  seatMarker = undefined;
  forwardLine = undefined;
}

function rebuildOverlay() {
  clearOverlay();
  if (!seat) return;
  seatProp = findSeatProp();

  if (seatProp && el<HTMLInputElement>('showBoxes').checked) {
    const width = Math.max(0.05, seatProp.box.maxX - seatProp.box.minX);
    const depth = Math.max(0.05, seatProp.box.maxZ - seatProp.box.minZ);
    propMesh = CreateBox(
      'tuner-prop-box',
      { width, height: Math.max(0.2, seatProp.height), depth },
      scene,
    );
    propMesh.position.set(
      (seatProp.box.minX + seatProp.box.maxX) / 2,
      Math.max(0.2, seatProp.height) / 2,
      (seatProp.box.minZ + seatProp.box.maxZ) / 2,
    );
    propMesh.material = propMaterial;
    propMesh.isPickable = false;
    propMesh.parent = overlayRoot;
    overlayMeshes.push(propMesh);
  }

  if (el<HTMLInputElement>('showGrid').checked) {
    const lines: Vector3[][] = [];
    for (let i = -6; i <= 6; i++) {
      const offset = i * 0.25;
      lines.push([
        new Vector3(seat.position.x + offset, 0.012, seat.position.z - 1.5),
        new Vector3(seat.position.x + offset, 0.012, seat.position.z + 1.5),
      ]);
      lines.push([
        new Vector3(seat.position.x - 1.5, 0.012, seat.position.z + offset),
        new Vector3(seat.position.x + 1.5, 0.012, seat.position.z + offset),
      ]);
    }
    gridMesh = CreateLineSystem('tuner-grid', { lines }, scene);
    gridMesh.color = new Color3(0.28, 0.32, 0.48);
    gridMesh.alpha = 0.6;
    gridMesh.isPickable = false;
    gridMesh.parent = overlayRoot;
    overlayMeshes.push(gridMesh);
  }

  const forward = new Vector3(Math.sin(seat.heading), 0, Math.cos(seat.heading));
  forwardLine = CreateLines(
    'tuner-forward',
    {
      points: [
        new Vector3(seat.position.x, 0.03, seat.position.z),
        new Vector3(seat.position.x + forward.x * 0.8, 0.03, seat.position.z + forward.z * 0.8),
      ],
    },
    scene,
  );
  forwardLine.color = new Color3(1, 0.65, 0.2);
  forwardLine.isPickable = false;
  forwardLine.parent = overlayRoot;
  overlayMeshes.push(forwardLine);

  seatMarker = CreateSphere('tuner-seat-marker', { diameter: 0.07 }, scene);
  seatMarker.position.set(seat.position.x, 0.04, seat.position.z);
  seatMarker.material = markerMaterials.seat;
  seatMarker.isPickable = false;
  seatMarker.parent = overlayRoot;
  overlayMeshes.push(seatMarker);

  actorMarker = CreateSphere('tuner-actor-marker', { diameter: 0.09 }, scene);
  actorMarker.material = markerMaterials.actor;
  actorMarker.isPickable = false;
  actorMarker.parent = overlayRoot;
  overlayMeshes.push(actorMarker);

  partnerMarker = CreateSphere('tuner-partner-marker', { diameter: 0.09 }, scene);
  partnerMarker.material = markerMaterials.partner;
  partnerMarker.isPickable = false;
  partnerMarker.parent = overlayRoot;
  overlayMeshes.push(partnerMarker);
}

function refreshSeats() {
  const kind = seatKind();
  const seats = layout.seats
    .map((value, index) => ({ value, index }))
    .filter(({ value }) => !kind || (value.kind ?? 'sofa') === kind);
  const select = el<HTMLSelectElement>('seat');
  select.innerHTML = '';
  if (seats.length === 0) {
    const option = document.createElement('option');
    option.value = '-1';
    option.textContent = `— nenhum assento do tipo ${kind ?? 'livre'} nesta sala —`;
    select.append(option);
    seat = undefined;
    rebuildOverlay();
    place();
    setStatus(`Nenhum assento do tipo ${kind ?? 'livre'} nesta sala — troque a sala.`, true);
    return;
  }
  setStatus('');
  for (const { value, index } of seats) {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent =
      `${value.kind ?? 'sofa'} #${index} — x=${value.position.x.toFixed(2)} ` +
      `z=${value.position.z.toFixed(2)}`;
    select.append(option);
  }
  if (!seats.some(({ index }) => index === state.seatIndex)) {
    const nearest = seats.reduce((best, candidate) => {
      const current = layout.seats[best.index]!.position;
      const next = candidate.value.position;
      const spawn = layout.spawn.position;
      const currentDistance = Math.hypot(current.x - spawn.x, current.z - spawn.z);
      const nextDistance = Math.hypot(next.x - spawn.x, next.z - spawn.z);
      return nextDistance < currentDistance ? candidate : best;
    });
    state.seatIndex = nearest.index;
  }
  select.value = String(state.seatIndex);
  seat = layout.seats[state.seatIndex];
  applySeatFacing();
  rebuildOverlay();
  place();
  focusSeat();
}

/** Giro autoral do par para o assento atual (alguns clipes dependem do lado do móvel). */
function applySeatFacing() {
  if (facingFromUrl) {
    facingFromUrl = false;
    return;
  }
  const draft = drafts[state.type];
  state.facing = draft ? draft.facing : pairFacing(currentPair(), seat);
  syncInputs();
}

async function setRoom(name: RoomName) {
  const token = ++roomToken;
  setStatus('Carregando sala…');
  const loaded =
    name === 'studio'
      ? buildStudio(scene)
      : await (name === 'club' ? loadClub(scene) : loadHome(scene));
  if (token !== roomToken || scene.isDisposed) {
    loaded.dispose();
    return;
  }
  roomDispose?.();
  clubLights?.dispose();
  roomDispose = () => loaded.dispose();
  roomRoot = loaded.root;
  applyRoomVisibility();
  clubLights = name === 'club' ? createClubLighting(scene) : undefined;
  clubLights?.setEnabled(true);
  layout = name === 'club' ? CLUB : name === 'home' ? HOME : STUDIO;
  refreshSeats();
  setStatus('');
}

/**
 * Vista de câmera relativa ao MÓVEL (é o eixo que importa para conferir o encaixe): 0 = da frente
 * do assento, 90 = lado esquerdo, 180 = por trás do encosto. O alvo é o meio do casal, não o pivô.
 */
function setView(angle: number, beta = 1.1, radius = 3) {
  if (!seat) return;
  const placement = computePlacement();
  const target = placement
    ? new Vector3(
        (placement.actor.x + placement.partner.x) / 2,
        0.9,
        (placement.actor.z + placement.partner.z) / 2,
      )
    : new Vector3(seat.position.x, 0.75, seat.position.z);
  camera.setTarget(target);
  camera.alpha = Math.PI / 2 - seat.heading + (angle * Math.PI) / 180;
  camera.beta = beta;
  camera.radius = radius;
}

function focusSeat() {
  setView(0);
}

// ---------------------------------------------------------------------------
// Avatars
// ---------------------------------------------------------------------------

let actorAvatar: TunerAvatar | undefined;
let partnerAvatar: TunerAvatar | undefined;
/** Gênero do corpo do ator (para o rótulo do painel). */
let actorSide: Gender = 'male';
/** Composição dos corpos carregados; trocar de M/F para F/F (ou M/M) recarrega os avatares. */
let loadedPairing: 'mf' | 'ff' | 'mm' | undefined;
let paused = false;
let showPartner = true;

async function loadAvatar(model: Gender, role: 'actor' | 'partner'): Promise<TunerAvatar> {
  const url = `/assets/3dx/character_${model === 'male' ? 'male' : 'female'}.glb?v=${NATIVE_ASSET_VERSION}`;
  const container = await LoadAssetContainerAsync(url, scene, { pluginExtension: '.glb' });
  stripDefaultMetallic(container);
  softenAlphaMasks(container);
  const entries = container.instantiateModelsToScene(undefined, false);
  const root = new TransformNode(`tuner-${role}`, scene);
  for (const node of entries.rootNodes) node.parent = root;
  const meshes = entries.rootNodes
    .flatMap((node) => node.getChildMeshes(false))
    .filter((mesh) => mesh.getTotalVertices() > 0);
  normalizeModelTo(root, meshes, 1.7);
  const joints = model === 'male' ? JOINTS_3DX_MALE : JOINTS_3DX_FEMALE;
  const skeleton = pickRig(entries.skeletons, joints.pelvis);
  const pelvis = skeleton?.bones.find((bone) => bone.name === joints.pelvis)?.getTransformNode();
  if (pelvis) stripRootMotion(entries.animationGroups, pelvis);
  if (skeleton) freezeFaceOnSit(entries.animationGroups, skeleton, meshes);
  const groups = new Map(
    entries.animationGroups.map((group): [string, AnimationGroup] => [
      group.name.replace(/^Clone of /, ''),
      group,
    ]),
  );
  return { model, root, container, entries, groups, skeleton, meshes, pelvis: pelvis ?? undefined };
}

/** Tira o avatar da cena: malhas, esqueleto, AnimationGroups (inclusive os sob demanda) e container. */
function disposeAvatar(avatar: TunerAvatar) {
  avatar.disposed = true;
  for (const group of avatar.groups.values()) group.dispose();
  avatar.entries.dispose();
  avatar.root.dispose();
  avatar.container.dispose();
}

/** Seleções rápidas disparam vários loads: só o último monta avatares na cena. */
let avatarsToken = 0;

async function loadAvatars() {
  const token = ++avatarsToken;
  setStatus('Carregando avatares…');
  for (const avatar of [actorAvatar, partnerAvatar]) if (avatar) disposeAvatar(avatar);
  actorAvatar = undefined;
  partnerAvatar = undefined;
  const pairing = pairingOf(state.type);
  loadedPairing = pairing;
  // M/F monta um corpo de cada; F/F e M/M montam duas cópias do mesmo corpo (metade a/b cada).
  actorSide = pairing === 'mf' ? state.initiator : pairing === 'ff' ? 'female' : 'male';
  const partnerSide: Gender =
    pairing === 'mf' ? (actorSide === 'male' ? 'female' : 'male') : actorSide;
  const results = await Promise.allSettled([
    loadAvatar(actorSide, 'actor'),
    loadAvatar(partnerSide, 'partner'),
  ]);
  const [actor, partner] = results.map((result) =>
    result.status === 'fulfilled' ? result.value : undefined,
  );
  if (token !== avatarsToken || !actor || !partner) {
    for (const avatar of [actor, partner]) if (avatar) disposeAvatar(avatar);
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (token === avatarsToken && failure) throw failure.reason;
    return;
  }
  actorAvatar = actor;
  partnerAvatar = partner;
  applyAction();
  place();
  setStatus('');
}

function setAction(avatar: TunerAvatar, action: string) {
  for (const group of avatar.groups.values()) group.stop();
  avatar.current = undefined;
  avatar.wanted = action;
  const group = avatar.groups.get(action);
  if (!group) {
    // Clipes de par de móvel/F-F/M-M saem do corpo e chegam sob demanda.
    setStatus(`Carregando ${action}…`);
    void loadPairClipGroup(
      scene,
      avatar.model === 'male' ? '3dx-male' : '3dx-female',
      action,
      avatar.skeleton!,
      avatar.meshes,
      avatar.pelvis,
    ).then((loaded) => {
      // O avatar saiu da cena, ou um pedido igual chegou antes: o grupo novo sobra.
      if (loaded && (avatar.disposed || avatar.groups.has(action))) loaded.dispose();
      if (avatar.disposed || avatar.wanted !== action) return;
      if (!avatar.groups.has(action)) {
        if (!loaded) {
          setStatus(`Clipe ${action} não encontrado (versão ${NATIVE_ASSET_VERSION}).`, true);
          return;
        }
        avatar.groups.set(action, loaded);
      }
      setStatus('');
      setAction(avatar, action);
    });
    return;
  }
  group.start(true, 1);
  group.pause();
  group.goToFrame(0);
  avatar.current = group;
  if (!paused) group.play(true);
}

function applyAction() {
  const pair = currentPair();
  if (actorAvatar) setAction(actorAvatar, pair.actor);
  if (partnerAvatar) setAction(partnerAvatar, pair.partner);
}

// ---------------------------------------------------------------------------
// Placement and measurement
// ---------------------------------------------------------------------------

interface Placement {
  actor: { x: number; z: number; heading: number; floor: number };
  partner: { x: number; z: number; heading: number; floor: number };
}

function computePlacement(): Placement | undefined {
  if (!seat) return undefined;
  const base = partnerPlacement(
    seat.pivot ?? seat.position,
    seat.heading,
    [state.seatRight, state.seatForward],
    0,
  );
  const heading = seat.heading + (state.facing * Math.PI) / 180;
  const partner = partnerPlacement(
    base.position,
    heading,
    [state.partnerRight, state.partnerForward],
    state.partnerYaw,
  );
  return {
    actor: {
      x: base.position.x,
      z: base.position.z,
      heading,
      floor:
        (state.room === 'club' ? clubFloorHeight(base.position.x, base.position.z) : 0) +
        state.liftOffset,
    },
    partner: {
      x: partner.position.x,
      z: partner.position.z,
      heading: partner.heading,
      floor:
        (state.room === 'club' ? clubFloorHeight(partner.position.x, partner.position.z) : 0) +
        state.liftOffset,
    },
  };
}

function distancesToSofa(position: { x: number; z: number }, heading: number) {
  if (!seatProp) return undefined;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const box = seatProp.box;
  if (Math.abs(fx) >= Math.abs(fz)) {
    const frontEdge = fx >= 0 ? box.maxX : box.minX;
    const backEdge = fx >= 0 ? box.minX : box.maxX;
    return {
      back: (position.x - backEdge) * fx,
      front: (frontEdge - position.x) * fx,
    };
  }
  const frontEdge = fz >= 0 ? box.maxZ : box.minZ;
  const backEdge = fz >= 0 ? box.minZ : box.maxZ;
  return {
    back: (position.z - backEdge) * fz,
    front: (frontEdge - position.z) * fz,
  };
}

function cm(value: number | undefined): string {
  if (value === undefined) return '—';
  return `${Math.round(value * 100)} cm`;
}

function place() {
  const placement = computePlacement();
  if (!placement) {
    updatePanel(undefined);
    return;
  }
  const actor = actorAvatar;
  const partner = partnerAvatar;
  if (actor) {
    actor.root.position.set(placement.actor.x, placement.actor.floor, placement.actor.z);
    actor.root.rotation.y = placement.actor.heading;
  }
  if (partner) {
    partner.root.setEnabled(showPartner);
    partner.root.position.set(placement.partner.x, placement.partner.floor, placement.partner.z);
    partner.root.rotation.y = placement.partner.heading;
  }
  actorMarker?.position.set(placement.actor.x, 0.05, placement.actor.z);
  partnerMarker?.position.set(placement.partner.x, 0.05, placement.partner.z);
  updatePanel(placement);
}

function updatePanel(placement: Placement | undefined) {
  const readout = el<HTMLDivElement>('readout');
  if (!seat || !placement) {
    readout.textContent = 'Nenhum assento selecionado.';
    refreshJson();
    return;
  }
  // A profundidade do assento é medida no referencial do móvel (heading do assento), não no
  // heading do par: poses deitadas giram o par no comprimento do sofá.
  const actorDistance = distancesToSofa(placement.actor, seat.heading);
  const partnerDistance = distancesToSofa(placement.partner, seat.heading);
  const degrees = (value: number) => ((value * 180) / Math.PI).toFixed(1);
  const draft = drafts[state.type];
  readout.textContent = [
    `Assento: ${seat.kind ?? 'sofa'} #${state.seatIndex} · (${seat.position.x.toFixed(3)}, ${seat.position.z.toFixed(3)}) · heading ${degrees(seat.heading)}°`,
    `Ator (${actorSide === 'male' ? 'homem' : 'mulher'}): (${placement.actor.x.toFixed(3)}, ${placement.actor.z.toFixed(3)}) · heading ${degrees(placement.actor.heading)}°`,
    `  encosto ${cm(actorDistance?.back)} · frente ${cm(actorDistance?.front)}`,
    `Parceiro: (${placement.partner.x.toFixed(3)}, ${placement.partner.z.toFixed(3)}) · heading ${degrees(placement.partner.heading)}°`,
    `  encosto ${cm(partnerDistance?.back)} · frente ${cm(partnerDistance?.front)}`,
    seatProp
      ? `Móvel: ${seatProp.name} · x[${seatProp.box.minX.toFixed(2)}, ${seatProp.box.maxX.toFixed(2)}] z[${seatProp.box.minZ.toFixed(2)}, ${seatProp.box.maxZ.toFixed(2)}]`
      : layout.props.length === 0
        ? 'Móvel: nenhum (sala vazia)'
        : 'Móvel: caixa não encontrada',
    draft ? 'Ajuste: salvo à mão (aparece no JSON do fim)' : 'Ajuste: valores do código',
  ].join('\n');
  refreshJson();
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

function syncInputs() {
  const toCm = (meters: number) => String(roundTo(meters * 100, 1));
  const toDegrees = (degrees: number) => String(roundTo(degrees, 1));
  el<HTMLSelectElement>('room').value = state.room;
  el<HTMLSelectElement>('initiator').value = state.initiator;
  // Só pares M/F têm variante por gênero de quem inicia.
  el<HTMLSelectElement>('initiator').disabled = pairingOf(state.type) !== 'mf';
  // Nos pares do mesmo gênero as metades já vêm separadas dentro do clipe: não há offset do
  // parceiro a ajustar (o jogo coloca os dois no mesmo ponto).
  for (const id of ['partnerRight', 'partnerForward', 'partnerYaw']) {
    el<HTMLInputElement>(id).disabled = pairingOf(state.type) !== 'mf';
  }
  el<HTMLInputElement>('seatRight').value = toCm(state.seatRight);
  el<HTMLInputElement>('seatForward').value = toCm(state.seatForward);
  el<HTMLInputElement>('facing').value = toDegrees(state.facing);
  el<HTMLInputElement>('partnerRight').value = toCm(state.partnerRight);
  el<HTMLInputElement>('partnerForward').value = toCm(state.partnerForward);
  el<HTMLInputElement>('partnerYaw').value = toDegrees(state.partnerYaw);
  el<HTMLInputElement>('lift').value = toCm(state.liftOffset);
  const readout = (id: string, text: string) => {
    const node = document.getElementById(id);
    if (node) node.textContent = text;
  };
  readout('seatRightNow', `${toCm(state.seatRight)} cm`);
  readout('seatForwardNow', `${toCm(state.seatForward)} cm`);
  readout('facingNow', `${toDegrees(state.facing)}°`);
  readout('partnerRightNow', `${toCm(state.partnerRight)} cm`);
  readout('partnerForwardNow', `${toCm(state.partnerForward)} cm`);
  readout('partnerYawNow', `${toDegrees(state.partnerYaw)}°`);
  readout('liftNow', `${toCm(state.liftOffset)} cm`);
}

function applyPairDefaults() {
  const pair = currentPair();
  const draft = drafts[state.type];
  const variant = pair.byInitiator?.[state.initiator] ?? pair;
  const side = draft?.byInitiator[state.initiator];
  state.seatRight = draft?.seatOffset[0] ?? pair.seatOffset?.[0] ?? 0;
  state.seatForward = draft?.seatOffset[1] ?? pair.seatOffset?.[1] ?? 0;
  state.facing = draft?.facing ?? pairFacing(pair, seat);
  state.liftOffset = draft?.lift ?? pair.lift ?? 0;
  state.partnerRight = side?.offset[0] ?? variant.offset[0];
  state.partnerForward = side?.offset[1] ?? variant.offset[1];
  state.partnerYaw = side?.yaw ?? variant.yaw;
  syncInputs();
}

function setStatus(message: string, error = false) {
  const status = el<HTMLDivElement>('status');
  status.textContent = message;
  status.className = error ? 'error' : '';
  status.style.display = message ? 'block' : 'none';
}

function currentLink() {
  const query = new URLSearchParams({
    room: state.room,
    type: state.type,
    initiator: state.initiator,
    seat: String(state.seatIndex),
    sr: String(state.seatRight),
    sf: String(state.seatForward),
    facing: String(state.facing),
    pr: String(state.partnerRight),
    pf: String(state.partnerForward),
    yaw: String(state.partnerYaw),
  });
  return `${location.origin}${location.pathname}?${query.toString()}`;
}

// Se a URL não trouxe valores de ajuste, começa nos valores autorais (ou no ajuste salvo).
if (!params.has('sr') && !params.has('sf') && !params.has('facing')) {
  applyPairDefaults();
}
syncInputs();

// ---------------------------------------------------------------------------
// Menu de pares
// ---------------------------------------------------------------------------

const KIND_LABEL: Record<'sofa' | 'chair' | 'bed' | 'wall', string> = {
  sofa: 'Sofá',
  chair: 'Cadeira',
  bed: 'Cama',
  wall: 'Parede',
};
type SeatKindFilter = keyof typeof KIND_LABEL;

const currentKind = (): SeatKindFilter => {
  const kind = currentPair().seat;
  return kind && kind in KIND_LABEL ? kind : 'sofa';
};
let kindFilter: SeatKindFilter = currentKind();

function refreshList() {
  const list = document.getElementById('pairList');
  if (!list) return;
  list.textContent = '';
  for (const type of interactionTypes.filter((item) => PAIR_POSES[item]?.seat === kindFilter)) {
    const pair = PAIR_POSES[type]!;
    const button = document.createElement('button');
    button.type = 'button';
    button.classList.toggle('active', type === state.type);
    const name = document.createElement('span');
    name.textContent = INTERACTION_LABELS[type as InteractionType] ?? type;
    const clip = document.createElement('span');
    clip.className = 'clip';
    clip.textContent = pair.actor;
    button.append(name, clip);
    if (drafts[type]) {
      const dot = document.createElement('span');
      dot.className = 'edited';
      dot.title = 'ajustado à mão';
      button.append(dot);
    }
    button.addEventListener('click', () => selectPair(type));
    list.append(button);
  }
  for (const tab of document.querySelectorAll<HTMLButtonElement>('#kindTabs button')) {
    tab.classList.toggle('active', tab.dataset.kind === kindFilter);
  }
}

function selectPair(type: string) {
  if (type === state.type) return;
  state.type = type;
  kindFilter = currentKind();
  applyPairDefaults();
  refreshSeats();
  if (pairingOf(type) !== loadedPairing) {
    // M/F usa um corpo de cada gênero; F/F e M/M usam duas cópias do mesmo corpo.
    void loadAvatars();
  } else {
    applyAction();
    place();
  }
  refreshList();
}

for (const tab of document.querySelectorAll<HTMLButtonElement>('#kindTabs button')) {
  tab.addEventListener('click', () => {
    const kind = tab.dataset.kind as SeatKindFilter | undefined;
    if (!kind || kind === kindFilter) return;
    kindFilter = kind;
    const first = interactionTypes.find((item) => PAIR_POSES[item]?.seat === kind);
    if (first) selectPair(first);
    else refreshList();
  });
}

el<HTMLSelectElement>('initiator').addEventListener('change', (event) => {
  state.initiator = (event.target as HTMLSelectElement).value as Gender;
  applyPairDefaults();
  place();
});

el<HTMLSelectElement>('seat').addEventListener('change', (event) => {
  state.seatIndex = Number((event.target as HTMLSelectElement).value);
  seat = layout.seats[state.seatIndex];
  applySeatFacing();
  rebuildOverlay();
  place();
  focusSeat();
});

el<HTMLSelectElement>('room').addEventListener('change', (event) => {
  state.room = (event.target as HTMLSelectElement).value as RoomName;
  void setRoom(state.room);
});

const commit = () => {
  commitDraft();
  place();
};

const bindLength = (id: string, assign: (meters: number) => void) => {
  el<HTMLInputElement>(id).addEventListener('input', (event) => {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) return;
    assign(value / 100);
    commit();
  });
};

const bindAngle = (id: string, assign: (degrees: number) => void) => {
  el<HTMLInputElement>(id).addEventListener('input', (event) => {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) return;
    assign(value);
    commit();
  });
};

bindLength('seatRight', (value) => (state.seatRight = value));
bindLength('seatForward', (value) => (state.seatForward = value));
bindAngle('facing', (value) => (state.facing = value));
bindLength('partnerRight', (value) => (state.partnerRight = value));
bindLength('partnerForward', (value) => (state.partnerForward = value));
bindAngle('partnerYaw', (value) => (state.partnerYaw = value));
bindLength('lift', (value) => (state.liftOffset = value));

for (const button of document.querySelectorAll<HTMLButtonElement>('button.nudge')) {
  button.addEventListener('click', () => {
    const target = button.dataset.target;
    const step = Number(button.dataset.step ?? '0');
    if (!target || !Number.isFinite(step)) return;
    const input = el<HTMLInputElement>(target);
    const value = Number(input.value) + step;
    if (!Number.isFinite(value)) return;
    input.value = String(roundTo(value, 1));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

el<HTMLButtonElement>('reset').addEventListener('click', () => {
  delete drafts[state.type];
  persistDrafts();
  applyPairDefaults();
  place();
  refreshList();
  setStatus('Valores do código restaurados.');
});

el<HTMLButtonElement>('copyFacing').addEventListener('click', () => {
  const kind = currentPair().seat;
  if (!kind) return;
  let count = 0;
  for (const type of interactionTypes) {
    if (type === state.type || PAIR_POSES[type]?.seat !== kind) continue;
    const pair = PAIR_POSES[type];
    const seatOffset = drafts[type]?.seatOffset ?? [
      pair.seatOffset?.[0] ?? 0,
      pair.seatOffset?.[1] ?? 0,
    ];
    drafts[type] = {
      facing: state.facing,
      seatOffset: [seatOffset[0], seatOffset[1]],
      lift: drafts[type]?.lift ?? pair.lift ?? 0,
      byInitiator: {
        male: drafts[type]?.byInitiator.male ?? codeSide(type, 'male'),
        female: drafts[type]?.byInitiator.female ?? codeSide(type, 'female'),
      },
    };
    count += 1;
  }
  persistDrafts();
  refreshList();
  refreshJson();
  setStatus(
    `Giro de ${roundTo(state.facing, 1)}° aplicado a ${count} par(es) de ${KIND_LABEL[kind]}.`,
  );
});

el<HTMLButtonElement>('flip').addEventListener('click', () => {
  state.facing = state.facing >= 0 ? state.facing - 180 : state.facing + 180;
  syncInputs();
  commit();
});

// ---------------------------------------------------------------------------
// Câmera: varrer em volta do assento para conferir o encaixe de lado
// ---------------------------------------------------------------------------

el<HTMLButtonElement>('viewFront').addEventListener('click', () => setView(0, 1.15, 3.2));
el<HTMLButtonElement>('viewLeft').addEventListener('click', () => setView(90, 1.05, 2.6));
el<HTMLButtonElement>('viewRight').addEventListener('click', () => setView(-90, 1.05, 2.6));
el<HTMLButtonElement>('viewBack').addEventListener('click', () => setView(180, 1.15, 3.2));
el<HTMLButtonElement>('viewTop').addEventListener('click', () => setView(0, 0.02, 4.2));

const orbit = (degrees: number) => {
  camera.alpha += (degrees * Math.PI) / 180;
};
el<HTMLButtonElement>('orbitLeft').addEventListener('click', () => orbit(15));
el<HTMLButtonElement>('orbitRight').addEventListener('click', () => orbit(-15));

el<HTMLButtonElement>('play').addEventListener('click', () => {
  paused = !paused;
  el<HTMLButtonElement>('play').textContent = paused ? 'Tocar' : 'Pausar';
  for (const avatar of [actorAvatar, partnerAvatar]) {
    if (!avatar?.current) continue;
    if (paused) avatar.current.pause();
    else avatar.current.play(true);
  }
});

el<HTMLInputElement>('showBoxes').addEventListener('change', () => {
  rebuildOverlay();
  place();
});
el<HTMLInputElement>('showGrid').addEventListener('change', () => {
  rebuildOverlay();
  place();
});
el<HTMLInputElement>('hideRoom').addEventListener('change', () => {
  applyRoomVisibility();
});
el<HTMLInputElement>('showPartner').addEventListener('change', (event) => {
  showPartner = (event.target as HTMLInputElement).checked;
  place();
});

el<HTMLButtonElement>('copy').addEventListener('click', () => {
  void navigator.clipboard.writeText(exportDrafts());
  setStatus('Ajustes copiados — cole no chat.');
});

el<HTMLButtonElement>('copyLink').addEventListener('click', () => {
  void navigator.clipboard.writeText(currentLink());
  setStatus('Link copiado.');
});

el<HTMLButtonElement>('clear').addEventListener('click', () => {
  for (const type of Object.keys(drafts)) delete drafts[type];
  persistDrafts();
  applyPairDefaults();
  place();
  refreshList();
  setStatus('Ajustes apagados.');
});

// ---------------------------------------------------------------------------
// Arrastar: casal (chão) ou câmera
// ---------------------------------------------------------------------------

const groundPlane = Plane.FromPositionAndNormal(Vector3.Zero(), new Vector3(0, 1, 0));

/**
 * O que o botão esquerdo faz: `couple` move o par no chão, `camera` orbita a câmera (para ver o
 * encaixe de lado). O botão do meio/direito gira a câmera nos dois modos.
 */
let dragMode: 'couple' | 'camera' = 'couple';
let drag:
  { startRight: number; startForward: number; originX: number; originZ: number } | undefined;

function applyDragMode() {
  const pointers = camera.inputs.attached.pointers as ArcRotateCameraPointersInput | undefined;
  // Em `camera` o esquerdo também orbita; em `couple` o esquerdo fica para o arrastar do par.
  if (pointers) pointers.buttons = dragMode === 'camera' ? [0, 1, 2] : [1, 2];
  for (const tab of document.querySelectorAll<HTMLButtonElement>('#dragModes button')) {
    tab.classList.toggle('active', tab.dataset.mode === dragMode);
  }
  canvas.style.cursor = dragMode === 'camera' ? 'grab' : '';
}

for (const tab of document.querySelectorAll<HTMLButtonElement>('#dragModes button')) {
  tab.addEventListener('click', () => {
    const mode = tab.dataset.mode;
    if (mode !== 'couple' && mode !== 'camera') return;
    dragMode = mode;
    applyDragMode();
  });
}
applyDragMode();

const pointerOnFloor = (event: PointerEvent): Vector3 | undefined => {
  const rect = canvas.getBoundingClientRect();
  const ray = scene.createPickingRay(
    event.clientX - rect.left,
    event.clientY - rect.top,
    Matrix.Identity(),
    camera,
  );
  const distance = ray.intersectsPlane(groundPlane);
  if (distance === null || distance < 0) return undefined;
  return ray.origin.add(ray.direction.scale(distance));
};

canvas.addEventListener('pointerdown', (event) => {
  if (dragMode !== 'couple' || event.button !== 0 || event.shiftKey) return;
  const point = pointerOnFloor(event);
  if (!point) return;
  drag = {
    startRight: state.seatRight,
    startForward: state.seatForward,
    originX: point.x,
    originZ: point.z,
  };
  camera.detachControl();
  canvas.setPointerCapture(event.pointerId);
  canvas.style.cursor = 'grabbing';
});

canvas.addEventListener('pointermove', (event) => {
  if (!drag || !seat) return;
  const point = pointerOnFloor(event);
  if (!point) return;
  const dx = point.x - drag.originX;
  const dz = point.z - drag.originZ;
  const sin = Math.sin(seat.heading);
  const cos = Math.cos(seat.heading);
  state.seatRight = drag.startRight + dx * cos - dz * sin;
  state.seatForward = drag.startForward + dx * sin + dz * cos;
  syncInputs();
  commit();
});

const endDrag = (event: PointerEvent) => {
  if (!drag) return;
  drag = undefined;
  canvas.style.cursor = dragMode === 'camera' ? 'grab' : '';
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  camera.attachControl(canvas, true);
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

window.addEventListener('resize', () => engine.resize());
engine.runRenderLoop(() => scene.render());

refreshList();
refreshJson();

void (async () => {
  try {
    await Promise.all([setRoom(state.room), loadAvatars()]);
    place();
    refreshList();
    setStatus('');
  } catch (error) {
    console.error(error);
    setStatus(`Falhou: ${error instanceof Error ? error.message : String(error)}`, true);
  }
})();
