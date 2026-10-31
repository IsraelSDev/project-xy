import { VOICE_FULL_VOLUME_DISTANCE_M as NEAR, VOICE_HEAR_DISTANCE_M as FAR } from '@3dx/contracts';
import { describe, expect, it } from 'vitest';
import { isSpeaking, panFor, voiceGain } from './proximity';

describe('ganho da voz por distância', () => {
  it('fica no máximo de perto e zera a partir do alcance', () => {
    expect(voiceGain(0)).toBe(1);
    expect(voiceGain(NEAR)).toBe(1);
    expect(voiceGain(FAR)).toBe(0);
    expect(voiceGain(FAR + 20)).toBe(0);
  });

  it('cai suavemente no meio do caminho', () => {
    const middle = voiceGain((NEAR + FAR) / 2);
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(1);
  });

  it('é monotônica: mais longe nunca é mais alto', () => {
    let previous = 1;
    for (let distance = 0; distance <= FAR + 5; distance += 0.5) {
      const gain = voiceGain(distance);
      expect(gain).toBeLessThanOrEqual(previous + 1e-9);
      previous = gain;
    }
  });
});

describe('panorama estéreo', () => {
  it('quem está à direita pende para a direita (olhando para -z)', () => {
    expect(panFor({ x: 1, z: 0 }, { x: 0, z: -1 })).toBeCloseTo(1, 5);
    expect(panFor({ x: -1, z: 0 }, { x: 0, z: -1 })).toBeCloseTo(-1, 5);
  });

  it('quem está à frente ou atrás fica no centro', () => {
    expect(panFor({ x: 0, z: -1 }, { x: 0, z: -1 })).toBeCloseTo(0, 5);
    expect(panFor({ x: 0, z: 1 }, { x: 0, z: -1 })).toBeCloseTo(0, 5);
  });
});

describe('detecção de fala', () => {
  it('silêncio (128) não é fala', () => {
    expect(isSpeaking(new Uint8Array(64).fill(128))).toBe(false);
    expect(isSpeaking(new Uint8Array(0))).toBe(false);
  });

  it('onda cheia conta como fala', () => {
    const loud = new Uint8Array(64);
    for (let i = 0; i < loud.length; i += 1) loud[i] = i % 2 === 0 ? 0 : 255;
    expect(isSpeaking(loud)).toBe(true);
  });

  it('ruído baixo fica abaixo do limiar', () => {
    const soft = new Uint8Array(64).fill(130);
    expect(isSpeaking(soft)).toBe(false);
  });
});
