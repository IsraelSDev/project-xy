import { isGoeModel, type AvatarConfig, type AvatarModelId } from '@3dx/contracts';
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
import { ClipPlayer, loadClipLibrary } from '../characters/goe-clips';
import { loadPosePresets, poseGenderOf, type PosePreset } from '../characters/goe-poses';

/** Enquadramento fixo do closet: corpo inteiro ou uma parte para tatuagem/piercing. */
export type WardrobeFocus =
  | 'body'
  | 'face'
  | 'profile'
  | 'torso'
  | 'arms'
  | 'legs'
  | 'back';

/** Posição do avatar no quarto/vestiário `level20`. */
const CLOSET_X = -0.35;
const CLOSET_Z = 0.95;
const CLOSET_ROOM = '/assets/3dx/rooms/room20/room20.glb';

/** Altura do alvo da câmera, num avatar normalizado em 1,7 m (meio do peito). */
const FOCUS_HEIGHT = 1.05;
const DEFAULT_RADIUS = 2.6;
const MAX_RADIUS = 7;
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
}

export interface WardrobeStage {
  /** Aplica a aparência no avatar do palco; troca o modelo só quando ele muda. */
  setAppearance(config: AvatarConfig): void;
  /** Enquadra o corpo inteiro ou uma parte para conferir tatuagem/piercing. */
  setFocus(focus: WardrobeFocus): void;
  /** Prende o corpo numa pose estática do GoE; `undefined` volta à pose parada procedural. */
  setPose(name: string | undefined): void;
  /** Total de malhas desenhadas (corpo + peças), para o contador da tela. */
  meshCount(): number;
  /** Quadros por segundo do palco. */
  fps(): number;
  dispose(): void;
}

/**
 * Palco 3D do vestiário: uma cena isolada (estúdio, câmera orbital e um avatar) para experimentar
 * peças, cabelos e decalques fora do mundo — sem sala, sem rede. A câmera é dirigida pelos botões e
 * pelo arrasto/roda no canvas (sem `attachControl`, que exigiria os inputs do ArcRotateCamera).
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
  // Câmera fixa: os limites só existem para a transição dos focos, não há órbita/zoom livre.
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
  /** Animações do gênero montado: parado, o avatar respira e muda o peso (pose estática = sem clipe). */
  let player: ClipPlayer | undefined;
  /** Nome da pose estática pedida (ver `setPose`); resolvido no mapa quando ele carrega. */
  let presetName: string | undefined;
  let presets: Map<string, PosePreset> | undefined;
  let presetsModel: AvatarModelId | undefined;
  let generation = 0;
  let targetAlpha = FRONT_ALPHA;
  let targetRadius = DEFAULT_RADIUS;
  let targetBeta = BODY_BETA;
  let targetFocusY = FOCUS_HEIGHT;
  let focus: WardrobeFocus = 'body';
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
    targetFocusY = FOCUS_POSES[focus].height * avatarHeight;
    model?.applyAppearance(config);
    model?.applyDecals(config.decals);
    void parts?.apply(config);
  };

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

  const matchPose = () => {
    const preset = presetName === undefined ? undefined : presets?.get(presetName);
    // Primeiro a pose estática (ou a volta ao repouso), depois a pose parada: ao sair de uma pose o corpo volta ao
    // repouso em T e só então recebe os braços abaixados; na ordem inversa ele ficava em T até o próximo quadro de pose.
    model?.setPosePreset(preset);
    parts?.setPosePreset(preset);
    // No 3DX é um no-op (sem animação ainda): o modelo fica na pose de repouso.
    model?.applyMotion(idle, undefined);
    parts?.applyPose(idle);
  };

  const load = async (config: AvatarConfig) => {
    const token = ++generation;
    parts?.dispose();
    parts = undefined;
    model?.dispose();
    model = undefined;
    player = undefined;
    loadedModel = config.model;
    if (presetName !== undefined) ensurePresets();
    try {
      const attachment = await attachAvatarModel(scene, root, shadows, config.model);
      // Uma troca mais nova substituiu esta: o modelo que chegou tarde é descartado.
      if (token !== generation) {
        attachment.dispose();
        return;
      }
      model = attachment;
      if (isGoeModel(config.model)) {
        void loadClipLibrary(config.model === 'goe-male' ? 'male' : 'female')
          .then((library) => {
            if (token === generation) player = new ClipPlayer(library);
          })
          .catch((error: unknown) => {
            console.warn('Não foi possível carregar as animações do GoE.', error);
          });
      }
      parts = attachAvatarParts(scene, attachment.root, shadows, attachment.skeleton);
      paint(config);
      matchPose();
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
    if (player && model && !(presetName !== undefined && presets?.has(presetName))) {
      const frame = player.update({ clip: 'idle', distance: 0 }, dt);
      model.setPosePreset(frame);
      parts?.setPosePreset(frame);
    }
    scene.render();
  };
  engine.runRenderLoop(renderLoop);

  const resizeObserver = new ResizeObserver(() => {
    engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  });
  resizeObserver.observe(canvas);

  /** Poses do gênero do modelo montado (cada gênero tem as suas; ver `PoseGender`). */
  const ensurePresets = () => {
    const wanted = loadedModel;
    if (!wanted || (presets && presetsModel === wanted)) return;
    // Poses exportadas são do GoE: no 3DX não há pose estática (o mapa fica vazio, sem download).
    if (!isGoeModel(wanted)) {
      presets = undefined;
      presetsModel = wanted;
      return;
    }
    const own = new Map<string, PosePreset>();
    presets = own;
    presetsModel = wanted;
    void loadPosePresets(poseGenderOf(wanted))
      .then((loaded) => {
        for (const [name, value] of loaded) own.set(name, value);
        // A pose pode ter sido pedida antes da lista chegar: reaplica com o mapa completo.
        if (presets === own && presetName !== undefined) matchPose();
      })
      .catch((error: unknown) => {
        if (presets === own) presets = undefined;
        console.warn('Não foi possível carregar as poses do GoE no vestiário.', error);
      });
  };

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

    setPose(name) {
      ensurePresets();
      presetName = name;
      matchPose();
    },

    meshCount: () => (model?.meshCount ?? 0) + (parts?.meshCount() ?? 0),

    fps: () => Math.round(engine.getFps()),

    dispose() {
      generation += 1;
      resizeObserver.disconnect();
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