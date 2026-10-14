import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_MOVEMENT, ROOM, SPAWN } from '@3dx/game-core';
import { createWorld } from './world';

// NullEngine roda o Babylon sem GPU: valida montagem da cena, simulação e liberação de recursos.
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

  it('monta lounge, avatar placeholder e câmera', () => {
    const { scene } = setup();

    expect(scene.getMeshByName('placeholder-floor')).not.toBeNull();
    expect(scene.getTransformNodeByName('placeholder-mannequin')).not.toBeNull();
    expect(scene.activeCamera?.name).toBe('third-person-camera');
  });

  it('o avatar anda para a frente da câmera', () => {
    const { scene, world } = setup();
    scene.render();

    for (let frame = 0; frame < 30; frame++) world.update(1 / 60, { x: 0, z: 1 });

    expect(world.avatar.position.z).toBeGreaterThan(SPAWN.position.z + 0.5);
    expect(scene.getTransformNodeByName('placeholder-mannequin')?.position.z).toBeCloseTo(
      world.avatar.position.z,
    );
  });

  it('"frente" acompanha a rotação da câmera, mesmo sem render entre os passos', () => {
    const { world } = setup();
    // alpha = 0: câmera no lado +X do avatar, olhando para -X.
    world.camera.camera.alpha = 0;

    for (let frame = 0; frame < 30; frame++) world.update(1 / 60, { x: 0, z: 1 });

    expect(world.avatar.position.x).toBeCloseTo(SPAWN.position.x - 1);
    expect(world.avatar.position.z).toBeCloseTo(SPAWN.position.z);
  });

  it('o avatar não atravessa a parede sul', () => {
    const { scene, world } = setup();
    scene.render();

    for (let frame = 0; frame < 600; frame++) world.update(1 / 60, { x: 0, z: -1 });

    expect(world.avatar.position.z).toBeGreaterThanOrEqual(
      -ROOM.halfDepth + DEFAULT_MOVEMENT.radius - 1e-6,
    );
  });

  it('dispose da cena libera malhas, materiais e texturas', () => {
    const { scene } = setup();
    scene.render();

    scene.dispose();

    expect(scene.meshes).toHaveLength(0);
    expect(scene.materials).toHaveLength(0);
    expect(scene.textures).toHaveLength(0);
    expect(engine.scenes).toHaveLength(0);
  });
});
