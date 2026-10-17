import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Scene } from '@babylonjs/core/scene';
import './gltf-loaders';
import { describe, expect, it } from 'vitest';
import { applyMorphs, extractMorphs, morphLibraryOf } from './morph-bake';

/**
 * Shape keys do GoE aplicadas na CPU (`morph-bake.ts`), com o corpo masculino real: a chave `BodyPregnant` empurra a
 * barriga para a frente, cada avatar tem a sua geometria quando usa uma forma, e zerar volta ao original.
 */
const file = fileURLToPath(new URL('../../../public/assets/goe/GoE_Male.glb', import.meta.url));

describe('morph-bake', () => {
  it('aplica a influência por nome, isola cada avatar e volta ao original', async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const container = await LoadAssetContainerAsync(new Uint8Array(readFileSync(file)), scene, {
      pluginExtension: '.glb',
    });
    const library = extractMorphs(container);
    expect(morphLibraryOf(container)).toBe(library);
    // O container perde os gerenciadores: as cópias nascem sem a textura de morph (100 MB por avatar).
    expect(container.meshes.every((mesh) => mesh.morphTargetManager === null)).toBe(true);

    const body = [...library.keys()].find((name) => /_Body/.test(name));
    expect(body, 'malha do corpo na biblioteca').toBeDefined();
    const names = library.get(body!)!.targets.map((target) => target.name);
    expect(names).toContain('BodyPregnant');
    expect(names).toContain('jawOpen');

    const first = container.instantiateModelsToScene(undefined, false);
    const second = container.instantiateModelsToScene(undefined, false);
    const meshOf = (entries: typeof first) =>
      entries.rootNodes
        .flatMap((node) => node.getChildMeshes(false))
        .filter((mesh) => /_Body/.test(mesh.name));
    const [mine] = meshOf(first);
    const [other] = meshOf(second);
    const positions = (mesh: typeof mine) => [...mesh!.getVerticesData(VertexBuffer.PositionKind)!];
    const original = positions(mine);
    expect(positions(other)).toEqual(original);

    applyMorphs(meshOf(first), library, { BodyPregnant: 1 });
    const changed = positions(mine);
    const moved = changed.filter(
      (value, index) => Math.abs(value - original[index]!) > 1e-4,
    ).length;
    expect(moved, 'vértices da barriga se mexem').toBeGreaterThan(100);
    expect(positions(other), 'outro avatar não é afetado').toEqual(original);

    // Meia influência fica entre o original e o total.
    applyMorphs(meshOf(first), library, { BodyPregnant: 0.5 });
    const half = positions(mine);
    const index = changed.findIndex((value, i) => Math.abs(value - original[i]!) > 0.02);
    expect(Math.abs(half[index]! - original[index]!)).toBeCloseTo(
      Math.abs(changed[index]! - original[index]!) / 2,
      3,
    );

    // Chave sem efeito na malha (e nome desconhecido) não mexe em nada; zerar restaura.
    applyMorphs(meshOf(first), library, { chaveInexistente: 1 });
    expect(positions(mine)).toEqual(original);

    const normals = mine!.getVerticesData(VertexBuffer.NormalKind)!;
    applyMorphs(meshOf(first), library, { BodyPregnant: 1 });
    const length = Math.hypot(normals[0]!, normals[1]!, normals[2]!);
    expect(length).toBeCloseTo(1, 3);

    container.dispose();
    engine.dispose();
  }, 120000);
});
