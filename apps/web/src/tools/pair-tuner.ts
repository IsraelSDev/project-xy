import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { AssetContainer, InstantiatedEntries } from '@babylonjs/core/assetContainer';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Engine } from '@babylonjs/core/Engines/engine';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
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
  pairFacing,
  partnerPlacement,
  type RoomLayout,
  type SceneSeat,
} from '@3dx/game-core';
import {
  freezeFaceOnSit,
  JOINTS_3DX_FEMALE,
  JOINTS_3DX_MALE,
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

type RoomName = 'club' | 'home';
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
}

interface TunerAvatar {
  root: TransformNode;
  container: AssetContainer;
  entries: InstantiatedEntries;
  groups: Map<string, AnimationGroup>;
  current?: AnimationGroup;
}

const el = <T extends HTMLElement>(id: string): T => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`elemento #${id} não encontrado`);
  return found as T;
};

const interactionTypes = Object.keys(PAIR_POSES).filter((type) => PAIR_POSES[type]?.seat);
const fallbackType = interactionTypes.includes('sofa-3')
  ? 'sofa-3'
  : (interactionTypes[0] ?? 'sofa-3');
const params = new URLSearchParams(location.search);
const numberParam = (key: string): number | undefined => {
  const value = Number(params.get(key));
  return Number.isFinite(value) ? value : undefined;
};
const requestedType = params.get('type');
const state: State = {
  room: params.get('room') === 'home' ? 'home' : 'club',
  type: requestedType && PAIR_POSES[requestedType]?.seat ? requestedType : fallbackType,
  initiator: params.get('initiator') === 'female' ? 'female' : 'male',
  seatIndex: Number(params.get('seat') ?? '-1'),
  seatRight: numberParam('sr') ?? 0,
  seatForward: numberParam('sf') ?? 0,
  facing: numberParam('facing') ?? 0,
  partnerRight: numberParam('pr') ?? 0,
  partnerForward: numberParam('pf') ?? 0,
  partnerYaw: numberParam('yaw') ?? 0,
};

const currentPair = () => PAIR_POSES[state.type] ?? PAIR_POSES[fallbackType]!;
const currentVariant = () => {
  const pair = currentPair();
  return pair.byInitiator?.[state.initiator] ?? pair;
};

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
  state.facing = pairFacing(currentPair(), seat);
  syncInputs();
}

async function setRoom(name: RoomName) {
  const token = ++roomToken;
  setStatus('Carregando sala…');
  const loaded = name === 'club' ? await loadClub(scene) : await loadHome(scene);
  if (token !== roomToken) {
    loaded.dispose();
    return;
  }
  roomDispose?.();
  clubLights?.dispose();
  roomDispose = () => loaded.dispose();
  clubLights = name === 'club' ? createClubLighting(scene) : undefined;
  clubLights?.setEnabled(true);
  layout = name === 'club' ? CLUB : HOME;
  refreshSeats();
  setStatus('');
}

function focusSeat() {
  if (!seat) return;
  camera.setTarget(new Vector3(seat.position.x, 0.75, seat.position.z));
  camera.alpha = Math.PI / 2 - seat.heading;
  camera.beta = 1.15;
  camera.radius = 3.2;
}

// ---------------------------------------------------------------------------
// Avatars
// ---------------------------------------------------------------------------

let male: TunerAvatar | undefined;
let female: TunerAvatar | undefined;
let paused = false;
let showPartner = true;

async function loadAvatar(model: Gender): Promise<TunerAvatar> {
  const url = `/assets/3dx/character_${model === 'male' ? 'male' : 'female'}.glb?v=${NATIVE_ASSET_VERSION}`;
  const container = await LoadAssetContainerAsync(url, scene, { pluginExtension: '.glb' });
  stripDefaultMetallic(container);
  softenAlphaMasks(container);
  const entries = container.instantiateModelsToScene(undefined, false);
  const root = new TransformNode(`tuner-${model}`, scene);
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
  return { root, container, entries, groups };
}

async function loadAvatars() {
  setStatus('Carregando avatares…');
  [male, female] = await Promise.all([loadAvatar('male'), loadAvatar('female')]);
  applyAction();
  place();
  setStatus('');
}

function setAction(avatar: TunerAvatar, action: string) {
  for (const group of avatar.groups.values()) group.stop();
  avatar.current = undefined;
  const group = avatar.groups.get(action);
  if (!group) {
    setStatus(`Clipe ${action} não encontrado no GLB (versão ${NATIVE_ASSET_VERSION}).`, true);
    return;
  }
  group.start(true, 1);
  group.pause();
  group.goToFrame(0);
  avatar.current = group;
  if (!paused) group.play(true);
}

function applyAction() {
  const action = currentPair().actor;
  if (male) setAction(male, action);
  if (female) setAction(female, action);
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
      floor: state.room === 'club' ? clubFloorHeight(base.position.x, base.position.z) : 0,
    },
    partner: {
      x: partner.position.x,
      z: partner.position.z,
      heading: partner.heading,
      floor: state.room === 'club' ? clubFloorHeight(partner.position.x, partner.position.z) : 0,
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
  const actorAvatar = state.initiator === 'male' ? male : female;
  const partnerAvatar = state.initiator === 'male' ? female : male;
  if (actorAvatar) {
    actorAvatar.root.position.set(placement.actor.x, placement.actor.floor, placement.actor.z);
    actorAvatar.root.rotation.y = placement.actor.heading;
  }
  if (partnerAvatar) {
    partnerAvatar.root.setEnabled(showPartner);
    partnerAvatar.root.position.set(
      placement.partner.x,
      placement.partner.floor,
      placement.partner.z,
    );
    partnerAvatar.root.rotation.y = placement.partner.heading;
  }
  actorMarker?.position.set(placement.actor.x, 0.05, placement.actor.z);
  partnerMarker?.position.set(placement.partner.x, 0.05, placement.partner.z);
  updatePanel(placement);
}

function updatePanel(placement: Placement | undefined) {
  const pair = currentPair();
  const readout = el<HTMLDivElement>('readout');
  const json = el<HTMLElement>('json');
  if (!seat || !placement) {
    readout.textContent = 'Nenhum assento selecionado.';
    json.textContent = '';
    return;
  }
  // A profundidade do assento é medida no referencial do móvel (heading do assento), não no
  // heading do par: poses deitadas giram o par no comprimento do sofá.
  const actorDistance = distancesToSofa(placement.actor, seat.heading);
  const partnerDistance = distancesToSofa(placement.partner, seat.heading);
  const degrees = (value: number) => ((value * 180) / Math.PI).toFixed(1);
  readout.textContent = [
    `Assento: ${seat.kind ?? 'sofa'} #${state.seatIndex} · (${seat.position.x.toFixed(3)}, ${seat.position.z.toFixed(3)}) · heading ${degrees(seat.heading)}°`,
    `Ator (${state.initiator === 'male' ? 'homem' : 'mulher'}): (${placement.actor.x.toFixed(3)}, ${placement.actor.z.toFixed(3)}) · heading ${degrees(placement.actor.heading)}°`,
    `  encosto ${cm(actorDistance?.back)} · frente ${cm(actorDistance?.front)}`,
    `Parceiro: (${placement.partner.x.toFixed(3)}, ${placement.partner.z.toFixed(3)}) · heading ${degrees(placement.partner.heading)}°`,
    `  encosto ${cm(partnerDistance?.back)} · frente ${cm(partnerDistance?.front)}`,
    seatProp
      ? `Móvel: ${seatProp.name} · x[${seatProp.box.minX.toFixed(2)}, ${seatProp.box.maxX.toFixed(2)}] z[${seatProp.box.minZ.toFixed(2)}, ${seatProp.box.maxZ.toFixed(2)}]`
      : 'Móvel: caixa não encontrada',
  ].join('\n');

  const data = {
    room: state.room,
    interaction: state.type,
    clip: pair.actor,
    initiator: state.initiator,
    seat: {
      index: state.seatIndex,
      kind: seat.kind ?? 'sofa',
      x: seat.position.x,
      z: seat.position.z,
      headingDeg: Number(degrees(seat.heading)),
    },
    facing: state.facing,
    seatOffset: [state.seatRight, state.seatForward],
    offset: [state.partnerRight, state.partnerForward],
    yaw: state.partnerYaw,
    actor: {
      x: Number(placement.actor.x.toFixed(3)),
      z: Number(placement.actor.z.toFixed(3)),
      headingDeg: Number(degrees(placement.actor.heading)),
    },
    partner: {
      x: Number(placement.partner.x.toFixed(3)),
      z: Number(placement.partner.z.toFixed(3)),
      headingDeg: Number(degrees(placement.partner.heading)),
    },
    measurementsCm: {
      actor: {
        toBack: actorDistance ? Math.round(actorDistance.back * 100) : null,
        toFront: actorDistance ? Math.round(actorDistance.front * 100) : null,
      },
      partner: {
        toBack: partnerDistance ? Math.round(partnerDistance.back * 100) : null,
        toFront: partnerDistance ? Math.round(partnerDistance.front * 100) : null,
      },
    },
    suggested: {
      facing: state.facing,
      byInitiator: {
        [state.initiator]: {
          offset: [state.partnerRight, state.partnerForward],
          yaw: state.partnerYaw,
          seatOffset: [state.seatRight, state.seatForward],
        },
      },
      note: `clip ${pair.actor}/${pair.partner}`,
    },
  };
  json.textContent = JSON.stringify(data, null, 2);
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

function syncInputs() {
  el<HTMLSelectElement>('room').value = state.room;
  el<HTMLSelectElement>('type').value = state.type;
  el<HTMLSelectElement>('initiator').value = state.initiator;
  el<HTMLInputElement>('seatRight').value = String(state.seatRight);
  el<HTMLInputElement>('seatForward').value = String(state.seatForward);
  el<HTMLInputElement>('facing').value = String(state.facing);
  el<HTMLInputElement>('partnerRight').value = String(state.partnerRight);
  el<HTMLInputElement>('partnerForward').value = String(state.partnerForward);
  el<HTMLInputElement>('partnerYaw').value = String(state.partnerYaw);
}

function applyPairDefaults() {
  const pair = currentPair();
  const variant = currentVariant();
  state.seatRight = pair.seatOffset?.[0] ?? 0;
  state.seatForward = pair.seatOffset?.[1] ?? 0;
  state.facing = pairFacing(pair, seat);
  state.partnerRight = variant.offset[0];
  state.partnerForward = variant.offset[1];
  state.partnerYaw = variant.yaw;
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

const typeSelect = el<HTMLSelectElement>('type');
for (const type of interactionTypes) {
  const option = document.createElement('option');
  option.value = type;
  const pair = PAIR_POSES[type]!;
  option.textContent = `${INTERACTION_LABELS[type as InteractionType] ?? type} · ${pair.actor} · ${pair.seat}`;
  typeSelect.append(option);
}

// Se a URL não trouxe valores de ajuste, começa nos valores autorais.
if (!params.has('sr') && !params.has('sf') && !params.has('facing')) {
  const pair = currentPair();
  const variant = currentVariant();
  state.seatRight = pair.seatOffset?.[0] ?? 0;
  state.seatForward = pair.seatOffset?.[1] ?? 0;
  state.facing = pair.facing ?? 0;
  state.partnerRight = variant.offset[0];
  state.partnerForward = variant.offset[1];
  state.partnerYaw = variant.yaw;
}
syncInputs();

typeSelect.addEventListener('change', () => {
  state.type = typeSelect.value;
  applyPairDefaults();
  refreshSeats();
  applyAction();
  place();
});

el<HTMLSelectElement>('initiator').addEventListener('change', (event) => {
  state.initiator = (event.target as HTMLSelectElement).value as Gender;
  const pair = currentPair();
  const variant = currentVariant();
  state.seatRight = pair.seatOffset?.[0] ?? 0;
  state.seatForward = pair.seatOffset?.[1] ?? 0;
  state.partnerRight = variant.offset[0];
  state.partnerForward = variant.offset[1];
  state.partnerYaw = variant.yaw;
  syncInputs();
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

const bindNumber = (id: string, assign: (value: number) => void) => {
  el<HTMLInputElement>(id).addEventListener('input', (event) => {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) return;
    assign(value);
    place();
  });
};
bindNumber('seatRight', (value) => (state.seatRight = value));
bindNumber('seatForward', (value) => (state.seatForward = value));
bindNumber('facing', (value) => (state.facing = value));
bindNumber('partnerRight', (value) => (state.partnerRight = value));
bindNumber('partnerForward', (value) => (state.partnerForward = value));
bindNumber('partnerYaw', (value) => (state.partnerYaw = value));

el<HTMLButtonElement>('reset').addEventListener('click', () => {
  applyPairDefaults();
  place();
});

el<HTMLButtonElement>('top').addEventListener('click', () => {
  if (!seat) return;
  camera.setTarget(new Vector3(seat.position.x, 0.75, seat.position.z));
  camera.alpha = -Math.PI / 2;
  camera.beta = 0.02;
  camera.radius = 4.2;
});

el<HTMLButtonElement>('front').addEventListener('click', focusSeat);

el<HTMLButtonElement>('play').addEventListener('click', () => {
  paused = !paused;
  el<HTMLButtonElement>('play').textContent = paused ? 'Tocar' : 'Pausar';
  for (const avatar of [male, female]) {
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
el<HTMLInputElement>('showPartner').addEventListener('change', (event) => {
  showPartner = (event.target as HTMLInputElement).checked;
  place();
});

el<HTMLButtonElement>('copy').addEventListener('click', () => {
  void navigator.clipboard.writeText(el<HTMLElement>('json').textContent ?? '');
  setStatus('JSON copiado.');
});
el<HTMLButtonElement>('copyLink').addEventListener('click', () => {
  void navigator.clipboard.writeText(currentLink());
  setStatus('Link copiado.');
});

window.addEventListener('resize', () => engine.resize());
engine.runRenderLoop(() => scene.render());

void (async () => {
  try {
    await Promise.all([setRoom(state.room), loadAvatars()]);
    place();
    setStatus('');
  } catch (error) {
    console.error(error);
    setStatus(`Falhou: ${error instanceof Error ? error.message : String(error)}`, true);
  }
})();
