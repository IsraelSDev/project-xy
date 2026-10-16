import type { AvatarConfig, AvatarModelId } from '@3dx/contracts';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Engine } from '@babylonjs/core/Engines/engine';
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
import { loadPosePresets, type PosePreset } from '../characters/goe-poses';

/** Vista da câmera pedida pelos botões do vestiário: de frente (rosto) ou de costas. */
export type WardrobeView = 'front' | 'back';

/** Altura do alvo da câmera, num avatar normalizado em 1,7 m (meio do peito). */
const FOCUS_HEIGHT = 1.05;
const DEFAULT_RADIUS = 3.4;
const MIN_RADIUS = 1.1;
const MAX_RADIUS = 7;
/** O avatar olha para +Z; a câmera em `alpha = π/2` fica na frente dele (e `-π/2`, atrás). */
const FRONT_ALPHA = Math.PI / 2;
const BACK_ALPHA = -Math.PI / 2;
/** Giro automático (rad/s) e a suavização da câmera (1/s). */
const SPIN_SPEED = 0.7;
const SMOOTHING = 10;
/** Nitidez em telas de alta densidade, limitada a 2x como no mundo. */
const MAX_PIXEL_RATIO = 2;

export interface WardrobeStageOptions {
  /** Primeiro modelo carregado (tira o "Carregando…"). */
  onReady?: () => void;
  /** Falha ao montar o modelo: o manequim não existe aqui, então avisa e fica vazio. */
  onError?: (message: string) => void;
}

export interface WardrobeStage {
  /** Aplica a aparência no avatar do palco; troca o modelo só quando ele muda. */
  setAppearance(config: AvatarConfig): void;
  /** Vira a câmera para uma vista fixa. */
  setView(view: WardrobeView): void;
  /** Gira a câmera em volta do avatar (mostra os quatro lados sem arrastar). */
  spin(radians: number): void;
  /** Liga/desliga o giro contínuo. */
  setSpinning(spinning: boolean): void;
  /** Aproxima/afasta a câmera (fator multiplicativo, ex.: 0.85 e 1.15). */
  zoom(factor: number): void;
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
    1.35,
    DEFAULT_RADIUS,
    new Vector3(0, FOCUS_HEIGHT, 0),
    scene,
  );
  camera.minZ = 0.05;
  // Planos de corte curtos: preciso o bastante para o piso e a parede não brigarem por profundidade.
  camera.maxZ = 120;
  camera.lowerRadiusLimit = MIN_RADIUS;
  camera.upperRadiusLimit = MAX_RADIUS;
  camera.lowerBetaLimit = 0.2;
  camera.upperBetaLimit = 1.55;

  const root = new TransformNode('wardrobe-avatar', scene);
  /** Pose parada (procedural): a mesma base do avatar em pé no mundo. */
  const idle: Pose = walkPose({ phase: 0, intensity: 0 });

  let model: AvatarModelAttachment | undefined;
  let parts: AvatarParts | undefined;
  let loadedModel: AvatarModelId | undefined;
  /** Nome da pose estática pedida (ver `setPose`); resolvido no mapa quando ele carrega. */
  let presetName: string | undefined;
  let presets: Map<string, PosePreset> | undefined;
  let generation = 0;
  let targetAlpha = FRONT_ALPHA;
  let targetRadius = DEFAULT_RADIUS;
  let spinning = false;
  let ready = false;

  const paint = (config: AvatarConfig) => {
    model?.applyAppearance(config);
    model?.applyDecals(config.decals);
    void parts?.apply(config);
  };

  const matchPose = () => {
    const preset = presetName === undefined ? undefined : presets?.get(presetName);
    model?.applyMotion(idle, undefined);
    parts?.applyPose(idle);
    model?.setPosePreset(preset);
    parts?.setPosePreset(preset);
  };

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
      parts = attachAvatarParts(scene, attachment.root, shadows);
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

  // Arrasto gira, roda aprofunda. `pointercancel` cobre o gesto interrompido pelo sistema.
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const onPointerDown = (event: PointerEvent) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!dragging) return;
    targetAlpha -= (event.clientX - lastX) * 0.008;
    camera.beta = clamp(camera.beta - (event.clientY - lastY) * 0.008, 0.2, 1.55);
    lastX = event.clientX;
    lastY = event.clientY;
  };
  const onPointerUp = (event: PointerEvent) => {
    dragging = false;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    targetRadius = clamp(targetRadius * Math.exp(event.deltaY * 0.001), MIN_RADIUS, MAX_RADIUS);
  };
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  const renderLoop = () => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.1);
    if (spinning) targetAlpha += dt * SPIN_SPEED;
    const t = 1 - Math.exp(-SMOOTHING * dt);
    camera.alpha += (targetAlpha - camera.alpha) * t;
    camera.radius += (targetRadius - camera.radius) * t;
    scene.render();
  };
  engine.runRenderLoop(renderLoop);

  const resizeObserver = new ResizeObserver(() => {
    engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  });
  resizeObserver.observe(canvas);

  const ensurePresets = () => {
    if (presets) return;
    presets = new Map();
    void loadPosePresets()
      .then((loaded) => {
        for (const [name, value] of loaded) presets?.set(name, value);
        // A pose pode ter sido pedida antes da lista chegar: reaplica com o mapa completo.
        if (presetName !== undefined) matchPose();
      })
      .catch((error: unknown) => {
        presets = undefined;
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

    setView(view) {
      spinning = false;
      targetAlpha = view === 'front' ? FRONT_ALPHA : BACK_ALPHA;
    },

    spin(radians) {
      spinning = false;
      targetAlpha += radians;
    },

    setSpinning(value) {
      spinning = value;
    },

    zoom(factor) {
      targetRadius = clamp(targetRadius * factor, MIN_RADIUS, MAX_RADIUS);
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
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      parts?.dispose();
      model?.dispose();
      root.dispose();
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
