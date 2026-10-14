import type { LoungeState } from '@3dx/contracts';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { worldDirection } from '../movement/direction';
import { createKeyboardInput } from '../movement/keyboard';
import { connectToLounge, type ConnectionStatus } from '../network/lounge-connection';
import { createWorld } from './world';

export interface PlayerListEntry {
  id: string;
  name: string;
  connected: boolean;
  isLocal: boolean;
}

/** O que a interface (React) precisa saber do jogo. Muda raramente, não a cada quadro. */
export interface GameView {
  status: ConnectionStatus;
  players: PlayerListEntry[];
}

export interface GameOptions {
  realtimeUrl: string;
  /** Shaders e texturas prontos (antes disso a tela fica vazia). */
  onReady: () => void;
  onViewChange: (view: GameView) => void;
}

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

/** Lista para depuração: o jogador local primeiro, os demais por nome. */
export function playerList(state: LoungeState, localId: string): PlayerListEntry[] {
  return [...state.players.entries()]
    .map(([id, player]) => ({
      id,
      name: player.name,
      connected: player.connected,
      isLocal: id === localId,
    }))
    .sort((a, b) => Number(b.isLocal) - Number(a.isLocal) || a.name.localeCompare(b.name));
}

const sameList = (a: PlayerListEntry[], b: PlayerListEntry[]) =>
  a.length === b.length &&
  a.every((entry, index) => {
    const other = b[index];
    return (
      other !== undefined &&
      entry.id === other.id &&
      entry.name === other.name &&
      entry.connected === other.connected
    );
  });

/**
 * Cria engine, cena, loop de renderização e conexão com a sala sobre `canvas`. Quem cria é dono
 * do ciclo de vida: `dispose()` sai da sala, para o loop, solta os listeners e libera a GPU.
 */
export function createGame(canvas: HTMLCanvasElement, options: GameOptions): Game {
  const engine = new Engine(canvas, true, { stencil: true });
  engine.setHardwareScalingLevel(hardwareScalingLevel());

  const scene = new Scene(engine);
  const world = createWorld(scene);
  world.camera.camera.attachControl();
  scene.executeWhenReady(options.onReady);

  let view: GameView = { status: { state: 'connecting' }, players: [] };
  const publish = (next: GameView) => {
    view = next;
    options.onViewChange(view);
  };

  const connection = connectToLounge(options.realtimeUrl, {
    onStatus(status) {
      publish({ ...view, status });
    },
    onState(state, localId) {
      world.syncPlayers(state.players, localId, performance.now());
      const players = playerList(state, localId);
      if (!sameList(players, view.players)) publish({ ...view, players });
    },
    onSessionEnded() {
      world.clearPlayers();
      publish({ ...view, players: [] });
    },
  });

  const keyboard = createKeyboardInput(window);
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') connection.stop(performance.now());
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  engine.runRenderLoop(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, MAX_FRAME_SECONDS);
    const now = performance.now();
    connection.setDirection(worldDirection(keyboard.axis(), world.camera.forward()), now);
    world.update(dt, now);
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
      connection.dispose();
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      keyboard.dispose();
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    },
  };
}
