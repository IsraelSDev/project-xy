import { describe, expect, it } from 'vitest';
import { ClipPlayer, clipDuration, type Clip, type ClipLibrary } from './goe-clips';

const identity = [0, 0, 0, 1];

/** Osso que sobe 1 m em x ao longo de 4 quadros, sem rotação. */
const slide = (): Clip => ({
  frames: 4,
  stride: 0,
  bones: {
    hip: [0, 0, 0, ...identity, 1, 0, 0, ...identity, 2, 0, 0, ...identity, 3, 0, 0, ...identity],
  },
});

const library = (clips: Record<string, Clip>): ClipLibrary => ({
  fps: 4,
  clips: new Map(Object.entries(clips)),
});

describe('ClipPlayer', () => {
  it('avança pelo relógio e dá a volta no ciclo', () => {
    const player = new ClipPlayer(library({ idle: slide() }));
    expect(player.update({ clip: 'idle', distance: 0 }, 0).bones.hip?.[0]).toBeCloseTo(0);
    expect(player.update({ clip: 'idle', distance: 0 }, 0.5).bones.hip?.[0]).toBeCloseTo(2);
    // 0,5 s + 0,5 s = 1 s = um ciclo inteiro (4 quadros a 4 fps): volta ao começo.
    expect(player.update({ clip: 'idle', distance: 0 }, 0.5).bones.hip?.[0]).toBeCloseTo(0);
  });

  it('interpola entre quadros', () => {
    const player = new ClipPlayer(library({ idle: slide() }));
    expect(player.update({ clip: 'idle', distance: 0 }, 0.125).bones.hip?.[0]).toBeCloseTo(0.5);
  });

  it('o último quadro interpola de volta para o primeiro', () => {
    const player = new ClipPlayer(library({ idle: slide() }));
    expect(player.update({ clip: 'idle', distance: 0 }, 0.875).bones.hip?.[0]).toBeCloseTo(1.5);
  });

  it('locomoção avança pela distância andada, não pelo relógio', () => {
    const walk: Clip = { ...slide(), stride: 2 };
    const player = new ClipPlayer(library({ idle: slide(), walk }));
    player.update({ clip: 'walk', distance: 0 }, 0);
    player.update({ clip: 'walk', distance: 0.5 }, 1); // 1/4 do ciclo (2 m) = 1 quadro
    const x = player.update({ clip: 'walk', distance: 0 }, 99).bones.hip?.[0];
    expect(x).toBeCloseTo(1);
  });

  it('clipe forçado anda pelo relógio, mesmo sendo de locomoção', () => {
    const walk: Clip = { ...slide(), stride: 2 };
    const player = new ClipPlayer(library({ walk }));
    player.update({ clip: 'walk', distance: 0, forced: true }, 0);
    // 0,5 s a 4 fps = 2 quadros, mesmo sem andar (o ciclo aparece com o avatar parado).
    expect(
      player.update({ clip: 'walk', distance: 0, forced: true }, 0.5).bones.hip?.[0],
    ).toBeCloseTo(2);
  });

  it('mistura o clipe anterior com o novo e termina no novo', () => {
    const still: Clip = { frames: 1, stride: 0, bones: { hip: [10, 0, 0, ...identity] } };
    const player = new ClipPlayer(library({ idle: slide(), still }));
    player.update({ clip: 'idle', distance: 0 }, 0);
    const mid = player.update({ clip: 'still', distance: 0 }, 0.125).bones.hip?.[0] ?? 0;
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(9);
    expect(player.update({ clip: 'still', distance: 0 }, 1).bones.hip?.[0]).toBeCloseTo(10);
    expect(player.playing).toBe('still');
  });

  it('rotação sai normalizada e pelo lado curto', () => {
    const turn: Clip = {
      frames: 2,
      stride: 0,
      bones: { hip: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, -1] },
    };
    const player = new ClipPlayer(library({ idle: turn }));
    const q = player.update({ clip: 'idle', distance: 0 }, 0.125).bones.hip ?? [];
    expect(Math.hypot(q[3] ?? 0, q[4] ?? 0, q[5] ?? 0, q[6] ?? 0)).toBeCloseTo(1);
    expect(Math.abs(q[6] ?? 0)).toBeCloseTo(1);
  });

  it('clipe que não existe cai no idle', () => {
    const player = new ClipPlayer(library({ idle: slide() }));
    player.update({ clip: 'dance', distance: 0 }, 0);
    expect(player.playing).toBe('idle');
    expect(player.has('dance')).toBe(false);
  });

  it('duração = quadros / fps', () => {
    const lib = library({ idle: slide() });
    expect(clipDuration(lib, slide())).toBe(1);
  });
});
