import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { createKeyboardInput } from '../movement/keyboard';
import { createWorld } from './world';

export interface Game {
  dispose(): void;
}

/** Quadros mais longos que isso (aba em segundo plano, travada) são truncados. */
const MAX_FRAME_SECONDS = 0.1;

/** Nitidez em telas de alta densidade, limitada a 2x para não estourar o custo de fill rate. */
const MAX_PIXEL_RATIO = 2;

const hardwareScalingLevel = () => 1 / Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);

export function isWebGLSupported(): boolean {
  return Engine.IsSupported;
}

/**
 * Cria engine, cena e loop de renderização sobre `canvas`. Quem cria é dono do ciclo de vida:
 * `dispose()` para o loop, solta os listeners e libera todos os recursos de GPU.
 * `onReady` é chamado quando shaders e texturas estão prontos (antes disso a tela fica vazia).
 */
export function createGame(canvas: HTMLCanvasElement, onReady: () => void): Game {
  const engine = new Engine(canvas, true, { stencil: true });
  engine.setHardwareScalingLevel(hardwareScalingLevel());

  const scene = new Scene(engine);
  const world = createWorld(scene);
  world.camera.camera.attachControl();
  scene.executeWhenReady(onReady);

  const keyboard = createKeyboardInput(window);

  engine.runRenderLoop(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, MAX_FRAME_SECONDS);
    world.update(dt, keyboard.axis());
    scene.render();
  });

  // Zoom do navegador muda o devicePixelRatio junto com o tamanho em CSS: recalcula a escala
  // (setHardwareScalingLevel já redimensiona o buffer).
  const resizeObserver = new ResizeObserver(() => {
    engine.setHardwareScalingLevel(hardwareScalingLevel());
  });
  resizeObserver.observe(canvas);

  return {
    dispose() {
      resizeObserver.disconnect();
      keyboard.dispose();
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    },
  };
}
