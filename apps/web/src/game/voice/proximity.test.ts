import { VOICE_FULL_VOLUME_DISTANCE_M as NEAR, VOICE_HEAR_DISTANCE_M as FAR } from '@3dx/contracts';
import { describe, expect, it } from 'vitest';
import { voiceGain } from './proximity';

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
