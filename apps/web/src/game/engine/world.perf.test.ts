import {
  ACCESSORIES,
  BOTTOMS,
  DEFAULT_AVATAR,
  HAIR_STYLES,
  PALETTE,
  TOPS,
  type AvatarConfig,
} from '@3dx/contracts';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { describe, expect, it } from 'vitest';
import type { PlayerSnapshot } from '../characters/avatars';
import { createWorld } from './world';

/**
 * Custo de CPU por quadro com a sala cheia (16 avatares variados andando). NullEngine: sem GPU,
 * então mede simulação de cena, interpolação, animação e preparação do render, não o desenho.
 * O resultado vai para o log do teste; o limite só pega regressões graves (máquinas variam).
 */
const PLAYERS = 16;

const pick = <T>(items: readonly T[], index: number): T => items[index % items.length] as T;
const avatarFor = (index: number): AvatarConfig => ({
  ...DEFAULT_AVATAR,
  hair: pick(HAIR_STYLES, index).id,
  top: pick(TOPS, index).id,
  topColor: pick(PALETTE, index).id,
  bottom: pick(BOTTOMS, index).id,
  accessory: pick(ACCESSORIES, index).id,
});

const engine = new NullEngine();
const scene = new Scene(engine);
const world = createWorld(scene);
let now = 0;

const stateAt = (time: number) =>
  new Map<string, PlayerSnapshot>(
    Array.from({ length: PLAYERS }, (_, index) => [
      `p${index}`,
      {
        x: Math.cos(time / 1000 + index) * 4,
        z: Math.sin(time / 1000 + index) * 4,
        heading: time / 1000 + index,
        connected: true,
        avatar: JSON.stringify(avatarFor(index)),
        action: index % 3 === 0 ? 'dance' : '',
      },
    ]),
  );

const shadowCasters = () =>
  scene.lights.reduce(
    (total, light) => total + (light.getShadowGenerator()?.getShadowMap()?.renderList?.length ?? 0),
    0,
  );

world.syncPlayers(stateAt(0), 'p0', 0);
scene.render();
console.log(
  `cena com ${PLAYERS} avatares: ${scene.meshes.length} malhas no total, ` +
    `${world.avatarMeshCount()} de avatares, ${scene.materials.length} materiais, ` +
    `${shadowCasters()} malhas na passada de sombra`,
);

const FRAMES = 300;

describe(`desempenho com ${PLAYERS} avatares`, () => {
  it('quadro (estado a 20 Hz + interpolação + animação + render) cabe com folga em 60 fps', () => {
    const frame = () => {
      now += 16;
      if (now % 50 < 16) world.syncPlayers(stateAt(now), 'p0', now);
      world.update(0.016, now);
      scene.render();
    };
    for (let index = 0; index < 30; index++) frame(); // aquecimento

    const started = performance.now();
    for (let index = 0; index < FRAMES; index++) frame();
    const average = (performance.now() - started) / FRAMES;

    console.log(`custo médio de CPU por quadro: ${average.toFixed(2)} ms (${FRAMES} quadros)`);
    expect(average).toBeLessThan(16);
  });
});
