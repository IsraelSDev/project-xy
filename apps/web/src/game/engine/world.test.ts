import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { afterEach, describe, expect, it } from 'vitest';
import type { PlayerSnapshot } from '../characters/avatars';
import { worldDirection } from '../movement/direction';
import { createWorld, INTERPOLATION_DELAY_MS } from './world';

const player = (x: number, z = 0, connected = true): PlayerSnapshot => ({
  x,
  z,
  heading: 0,
  connected,
});

// NullEngine roda o Babylon sem GPU: valida montagem da cena, avatares e liberação de recursos.
describe('createWorld', () => {
  let engine: NullEngine;

  afterEach(() => {
    engine.dispose();
  });

  const setup = () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    return { scene, world: createWorld(scene) };
  };

  it('monta lounge e câmera; avatares só aparecem com o estado do servidor', () => {
    const { scene } = setup();

    expect(scene.getMeshByName('placeholder-floor')).not.toBeNull();
    expect(scene.activeCamera?.name).toBe('third-person-camera');
    expect(scene.getTransformNodeByName('placeholder-mannequin-local')).toBeNull();
  });

  it('cria quem entrou e remove (liberando malhas e material) quem saiu', () => {
    const { scene, world } = setup();
    world.syncPlayers(new Map([['local', player(0)]]), 'local', 0);
    const baseline = { meshes: scene.meshes.length, materials: scene.materials.length };

    world.syncPlayers(
      new Map([
        ['local', player(0)],
        ['other', player(2)],
      ]),
      'local',
      50,
    );
    expect(scene.getTransformNodeByName('placeholder-mannequin-other')).not.toBeNull();
    expect(scene.meshes.length).toBeGreaterThan(baseline.meshes);

    world.syncPlayers(new Map([['local', player(0)]]), 'local', 100);
    expect(scene.getTransformNodeByName('placeholder-mannequin-other')).toBeNull();
    expect(scene.meshes).toHaveLength(baseline.meshes);
    expect(scene.materials).toHaveLength(baseline.materials);
  });

  it('exibe os avatares interpolados, com atraso fixo em relação ao servidor', () => {
    const { scene, world } = setup();
    world.syncPlayers(new Map([['other', player(0)]]), 'local', 0);
    world.syncPlayers(new Map([['other', player(1)]]), 'local', 50);

    world.update(1 / 60, 25 + INTERPOLATION_DELAY_MS);

    const root = scene.getTransformNodeByName('placeholder-mannequin-other');
    expect(root?.position.x).toBeCloseTo(0.5);
  });

  it('a câmera acompanha o avatar local', () => {
    const { world } = setup();
    world.syncPlayers(new Map([['local', player(3, 2)]]), 'local', 0);

    for (let frame = 0; frame < 120; frame++) world.update(1 / 60, 1000 + frame * 16);

    expect(world.camera.camera.target.x).toBeCloseTo(3, 1);
    expect(world.camera.camera.target.z).toBeCloseTo(2, 1);
  });

  it('"frente" acompanha a rotação da câmera, mesmo sem render', () => {
    const { world } = setup();
    // alpha = 0: câmera no lado +X do alvo, olhando para -X.
    world.camera.camera.alpha = 0;

    const direction = worldDirection({ x: 0, z: 1 }, world.camera.forward());

    expect(direction.x).toBeCloseTo(-1);
    expect(direction.z).toBeCloseTo(0);
  });

  it('jogador desconectado fica translúcido', () => {
    const { scene, world } = setup();
    world.syncPlayers(new Map([['other', player(0, 0, false)]]), 'local', 0);

    expect(scene.getMaterialByName('placeholder-mannequin-material-other')?.alpha).toBeLessThan(1);
  });

  it('dispose da cena libera malhas, materiais e texturas', () => {
    const { scene, world } = setup();
    world.syncPlayers(new Map([['local', player(0)]]), 'local', 0);
    scene.render();

    scene.dispose();

    expect(scene.meshes).toHaveLength(0);
    expect(scene.materials).toHaveLength(0);
    expect(scene.textures).toHaveLength(0);
    expect(engine.scenes).toHaveLength(0);
  });
});
