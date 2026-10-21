import { type AvatarConfig, type AvatarModelId } from '@3dx/contracts';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Engine } from '@babylonjs/core/Engines/engine';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import { walkPose, type Pose } from '../animation/walk-cycle';
import { attachAvatarModel, type AvatarModelAttachment } from '../characters/avatar-model';
import { attachAvatarParts, type AvatarParts } from '../characters/avatar-parts';

/** Enquadramento do closet: corpo inteiro ou uma parte para tatuagem/piercing. */
export type WardrobeFocus = 'body' | 'face' | 'profile' | 'torso' | 'arms' | 'legs' | 'back';

/** Posição do avatar no quarto/vestiário `level20`. */
const CLOSET_X = -0.35;
const CLOSET_Z = 0.95;
const CLOSET_ROOM = '/assets/3dx/rooms/home/home.glb';

/** Altura do alvo da câmera, num avatar normalizado em 1,7 m (meio do peito). */
const FOCUS_HEIGHT = 1.05;
const DEFAULT_RADIUS = 2.6;
/** Zoom-out livre limitado para a câmera não atravessar a parede do quarto. */
const MAX_RADIUS = 3.2;
/** Rosto: alvo no meio da cabeça (a 1,7 m), a câmera bem perto e mais nivelada com os olhos. */
const FACE_HEIGHT = 1.62;
const FACE_RADIUS = 0.75;
const FACE_MIN_RADIUS = 0.3;
const FACE_BETA = 1.48;
const BODY_BETA = 1.35;
/** O avatar olha para +Z; a câmera em `alpha = π/2` fica na frente dele (e `-π/2`, atrás). */
const FRONT_ALPHA = Math.PI / 2;
const SIDE_ALPHA = 0;
/** Suavização da câmera (1/s). */
const SMOOTHING = 10;
/** Órbita livre: radianos por pixel arrastado (o mesmo sentido do arrasto da câmera do mundo). */
const DRAG_SENSITIVITY = 0.005;
/** Zoom da roda do mouse/trackpad: escala exponencial por pixel de rolagem. */
const WHEEL_ZOOM_SPEED = 0.001;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
/** Nitidez em telas de alta densidade, limitada a 2x como no mundo. */
const MAX_PIXEL_RATIO = 2;

interface FocusPose {
  alpha: number;
  beta: number;
  radius: number;
  height: number;
}

const FOCUS_POSES: Record<WardrobeFocus, FocusPose> = {
  body: { alpha: FRONT_ALPHA, beta: BODY_BETA, radius: DEFAULT_RADIUS, height: FOCUS_HEIGHT },
  face: { alpha: FRONT_ALPHA, beta: FACE_BETA, radius: FACE_RADIUS, height: FACE_HEIGHT },
  profile: { alpha: SIDE_ALPHA, beta: FACE_BETA, radius: 1.05, height: FACE_HEIGHT },
  torso: { alpha: FRONT_ALPHA, beta: 1.38, radius: 1.65, height: 1.16 },
  arms: { alpha: 0.55, beta: 1.38, radius: 1.6, height: 1.1 },
  legs: { alpha: FRONT_ALPHA, beta: 1.45, radius: 1.7, height: 0.55 },
  back: {
    alpha: -Math.PI / 2 + 0.55,
    beta: 1.4,
    radius: 1.75,
    height: FOCUS_HEIGHT,
  },
};

export interface WardrobeStageOptions {
  /** Primeiro modelo carregado (tira o "Carregando…"). */
  onReady?: () => void;
  /** Falha ao montar o modelo: o manequim não existe aqui, então avisa e fica vazio. */
  onError?: (message: string) => void;
  /** O usuário girou/aproximou à mão: o enquadramento do botão de foco deixou de valer. */
  onOrbit?: () => void;
}

export interface WardrobeStage {
  /** Aplica a aparência no avatar do palco; troca o modelo só quando ele muda. */
  setAppearance(config: AvatarConfig): void;
  /** Enquadra o corpo inteiro ou uma parte para conferir a aparência. */
  setFocus(focus: WardrobeFocus): void;
  /** Total de malhas desenhadas (corpo + peças), para o contador da tela. */
  meshCount(): number;
  /** Quadros por segundo do palco. */
  fps(): number;
  dispose(): void;
}

/**
 * Palco 3D do vestiário: uma cena isolada (a sala do quarto, luzes e um avatar) para experimentar
 * peças, cabelos e decalques fora do mundo — sem rede. Os botões enquadram o corpo ou uma parte;
 * arrastar no canvas gira livremente em volta do avatar e a roda aproxima. Os gestos são lidos à
 * mão (sem `attachControl`), para não trazer junto o pan/teclado nativos do ArcRotateCamera.
 */
export function createWardrobeStage(
  canvas: HTMLCanvasElement,
  options: WardrobeStageOptions = {},
): WardrobeStage {
  const engine = new Engine(canvas, true, { stencil: true });
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));

  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.04, 0.04, 0.06, 1);

  const ambient = new HemisphericLight('wardrobe-ambient', new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.5;
  ambient.groundColor = new Color3(0.16, 0.15, 0.19);

  const key = new DirectionalLight('wardrobe-key', new Vector3(-0.4, -1, 0.35), scene);
  key.position = new Vector3(3.5, 6, -3);
  key.intensity = 0.75;

  // Luz de recorte por trás: separa o avatar do fundo escuro sem estourar o rosto.
  const rim = new DirectionalLight('wardrobe-rim', new Vector3(0.5, -0.6, -1), scene);
  rim.position = new Vector3(-3, 4, 5);
  rim.intensity = 0.35;

  const shadows = new ShadowGenerator(1024, key);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  shadows.bias = 0.002;

  const floor = CreateGround('wardrobe-floor', { width: 16, height: 16 }, scene);
  floor.receiveShadows = true;
  floor.isPickable = false;
  const floorMaterial = new StandardMaterial('wardrobe-floor-material', scene);
  floorMaterial.diffuseColor = new Color3(0.14, 0.14, 0.17);
  floorMaterial.specularColor = new Color3(0.02, 0.02, 0.02);
  floor.material = floorMaterial;

  // Cilindro em volta (sem tampos) faz o papel de fundo infinito: funciona de qualquer ângulo. Sem
  // o tampo de baixo, que ficaria coplanar ao piso e brigaria por profundidade (riscos no chão).
  const backdrop = CreateCylinder(
    'wardrobe-backdrop',
    { height: 9, diameter: 24, tessellation: 48, cap: Mesh.NO_CAP },
    scene,
  );
  backdrop.position.y = 4.5;
  backdrop.isPickable = false;
  const backdropMaterial = new StandardMaterial('wardrobe-backdrop-material', scene);
  backdropMaterial.disableLighting = true;
  backdropMaterial.emissiveColor = new Color3(0.07, 0.07, 0.09);
  backdropMaterial.backFaceCulling = false;
  backdrop.material = backdropMaterial;

  const camera = new ArcRotateCamera(
    'wardrobe-camera',
    FRONT_ALPHA,
    BODY_BETA,
    DEFAULT_RADIUS,
    new Vector3(CLOSET_X, FOCUS_HEIGHT, CLOSET_Z),
    scene,
  );
  camera.minZ = 0.05;
  // Planos de corte curtos: preciso o bastante para o piso e a parede não brigarem por profundidade.
  camera.maxZ = 120;
  // Limites da órbita livre: sem pan, a câmera fica em volta do avatar e a roda para no raio máximo.
  camera.lowerRadiusLimit = FACE_MIN_RADIUS;
  camera.upperRadiusLimit = MAX_RADIUS;
  camera.lowerBetaLimit = 0.2;
  camera.upperBetaLimit = 1.55;

  const root = new TransformNode('wardrobe-avatar', scene);
  root.position.set(CLOSET_X, 0, CLOSET_Z);
  /** Pose parada (procedural): a mesma base do avatar em pé no mundo. */
  const idle: Pose = walkPose({ phase: 0, intensity: 0 });

  let model: AvatarModelAttachment | undefined;
  let parts: AvatarParts | undefined;
  let loadedModel: AvatarModelId | undefined;
  let generation = 0;
  let targetAlpha = FRONT_ALPHA;
  let targetRadius = DEFAULT_RADIUS;
  let targetBeta = BODY_BETA;
  let targetFocusY = FOCUS_HEIGHT;
  /** Foco ativo; `undefined` depois de um giro à mão (a câmera fica onde o usuário deixou). */
  let focus: WardrobeFocus | undefined = 'body';
  let ready = false;
  /** Altura atual do avatar (multiplicador): o enquadramento da câmera acompanha (ver `paint`). */
  let avatarHeight = 1;
  let room: AssetContainer | undefined;

  const applyFocus = (value: WardrobeFocus) => {
    const pose = FOCUS_POSES[value];
    focus = value;
    targetAlpha = pose.alpha;
    targetBeta = pose.beta;
    targetRadius = pose.radius;
    targetFocusY = pose.height * avatarHeight;
  };

  const paint = (config: AvatarConfig) => {
    avatarHeight = config.height;
    // O alvo da câmera sobe com o avatar, senão um personagem alto sai do quadro (os raios ficam).
    // Com a câmera livre, o alvo fica onde o usuário deixou: mudar a altura não dá um salto.
    if (focus) targetFocusY = FOCUS_POSES[focus].height * avatarHeight;
    model?.applyAppearance(config);
    model?.applyDecals(config.decals);
    void parts?.apply(config);
  };

  /**
   * Giro livre em volta do avatar: grava o alvo junto com a câmera, senão o loop de render puxaria
   * de volta para o enquadramento do último foco. O alvo (altura) não muda: a parte em foco
   * continua no centro enquanto o usuário contorna o personagem.
   */
  const orbitCamera = (alpha: number, beta: number, radius: number) => {
    const nextBeta = clamp(beta, camera.lowerBetaLimit ?? 0, camera.upperBetaLimit ?? Math.PI);
    const nextRadius = clamp(radius, camera.lowerRadiusLimit ?? FACE_MIN_RADIUS, MAX_RADIUS);
    const moved =
      camera.alpha !== alpha || camera.beta !== nextBeta || camera.radius !== nextRadius;
    camera.alpha = targetAlpha = alpha;
    camera.beta = targetBeta = nextBeta;
    camera.radius = targetRadius = nextRadius;
    return moved;
  };

  let dragPointer: number | undefined;
  let dragX = 0;
  let dragY = 0;
  let notifiedOrbit = false;

  const markOrbit = () => {
    focus = undefined;
    if (!notifiedOrbit) {
      notifiedOrbit = true;
      options.onOrbit?.();
    }
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    dragPointer = event.pointerId;
    dragX = event.clientX;
    dragY = event.clientY;
    notifiedOrbit = false;
    canvas.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerId !== dragPointer) return;
    const dx = event.clientX - dragX;
    const dy = event.clientY - dragY;
    if (dx === 0 && dy === 0) return;
    dragX = event.clientX;
    dragY = event.clientY;
    const moved = orbitCamera(
      camera.alpha - dx * DRAG_SENSITIVITY,
      camera.beta - dy * DRAG_SENSITIVITY,
      camera.radius,
    );
    if (moved) markOrbit();
  };

  const endDrag = (event: PointerEvent) => {
    if (event.pointerId !== dragPointer) return;
    dragPointer = undefined;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    // Firefox rola em linhas (deltaMode 1) em vez de pixels: sem normalizar, o zoom quase não anda.
    const delta = event.deltaMode === 0 ? event.deltaY : event.deltaY * 16;
    const moved = orbitCamera(
      camera.alpha,
      camera.beta,
      camera.radius * Math.exp(delta * WHEEL_ZOOM_SPEED),
    );
    if (moved) markOrbit();
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('lostpointercapture', endDrag);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  // A sala 20 (quarto/vestiário) substitui o estúdio assim que carrega. Enquanto isso, o piso/cilindro
  // provisórios mantêm a tela utilizável.
  void LoadAssetContainerAsync(CLOSET_ROOM, scene)
    .then((container) => {
      room = container;
      const entries = container.instantiateModelsToScene(undefined, false);
      for (const node of entries.rootNodes) {
        for (const mesh of node.getChildMeshes(false)) {
          mesh.receiveShadows = true;
          mesh.isPickable = false;
        }
      }
      floor.setEnabled(false);
      backdrop.setEnabled(false);
    })
    .catch((error: unknown) => {
      console.warn('Não foi possível carregar a sala do closet.', error);
    });

  const load = async (config: AvatarConfig) => {
    const token = ++generation;
    parts?.dispose();
    parts = undefined;
    model?.dispose();
    model = undefined;
    loadedModel = config.model;
    try {
      const attachment = await attachAvatarModel(scene, root, shadows, config.model);
      // Uma troca mais nova substituiu esta: o modelo que chegou tarde é descartado.
      if (token !== generation) {
        attachment.dispose();
        return;
      }
      model = attachment;
      parts = attachAvatarParts(scene, attachment.root, shadows, attachment.skeleton);
      paint(config);
      model.applyMotion(idle, undefined);
      if (!ready) {
        ready = true;
        options.onReady?.();
      }
    } catch (error: unknown) {
      if (token !== generation) return;
      console.warn('Não foi possível montar o avatar no vestiário.', error);
      options.onError?.(
        error instanceof Error ? error.message : 'Não foi possível carregar o avatar.',
      );
    }
  };

  const renderLoop = () => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.1);
    const t = 1 - Math.exp(-SMOOTHING * dt);
    camera.alpha += (targetAlpha - camera.alpha) * t;
    camera.radius += (targetRadius - camera.radius) * t;
    camera.beta += (targetBeta - camera.beta) * t;
    camera.target.y += (targetFocusY - camera.target.y) * t;
    scene.render();
  };
  engine.runRenderLoop(renderLoop);

  const resizeObserver = new ResizeObserver(() => {
    engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  });
  resizeObserver.observe(canvas);

  return {
    setAppearance(config) {
      if (loadedModel === config.model) {
        paint(config);
        return;
      }
      void load(config);
    },

    setFocus(value) {
      applyFocus(value);
    },

    meshCount: () => (model?.meshCount ?? 0) + (parts?.meshCount() ?? 0),

    fps: () => Math.round(engine.getFps()),

    dispose() {
      generation += 1;
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', endDrag);
      canvas.removeEventListener('pointercancel', endDrag);
      canvas.removeEventListener('lostpointercapture', endDrag);
      canvas.removeEventListener('wheel', onWheel);
      parts?.dispose();
      model?.dispose();
      root.dispose();
      room?.dispose();
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    },
  };
}
