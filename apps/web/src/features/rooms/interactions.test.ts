import { describe, expect, it } from 'vitest';
import { interactionOptions, pairScenes, seatPairOptions } from './interactions';

describe('interações oferecidas para alguém do mundo', () => {
  it('em pé: sem pares de móvel/parede, só o que combina com os corpos', () => {
    const options = interactionOptions({
      localModel: '3dx-male',
      targetModel: '3dx-female',
      localAction: '',
    });
    expect(options).toContain('hug');
    expect(options).toContain('kiss');
    expect(options).not.toContain('sofa-1'); // exige o iniciador sentado
    expect(options).not.toContain('wall-1'); // exige o estúdio
    expect(options).not.toContain('ff-hug'); // composição M/F
  });

  it('sentado: libera os pares de móvel da composição', () => {
    const options = interactionOptions({
      localModel: '3dx-female',
      targetModel: '3dx-female',
      localAction: 'sit',
    });
    // A composição F/F usa as metades `ff_*`; `sofa-1` é o par M/F.
    expect(options).toContain('ff-sofa-1');
    expect(options).toContain('ff-hug');
    expect(options).not.toContain('sofa-1');
    expect(options).not.toContain('mm-hug');
  });

  it('pares de parede só no estúdio', () => {
    const base = { localModel: '3dx-male', targetModel: '3dx-female', localAction: '' } as const;
    expect(interactionOptions({ ...base, scene: 'studio' })).toContain('wall-1');
    expect(interactionOptions({ ...base, scene: 'club' })).not.toContain('wall-1');
  });
});

describe('menu do móvel', () => {
  it('lista os pares do tipo do móvel, sem exigir estar sentado', () => {
    const sofa = seatPairOptions('sofa', '3dx-male', '3dx-female');
    expect(sofa[0]).toBe('sofa-1');
    expect(sofa).not.toContain('chair-1');
    expect(seatPairOptions('chair', '3dx-male', '3dx-female')[0]).toBe('chair-1');
    expect(seatPairOptions('bed', '3dx-male', '3dx-female')[0]).toBe('bed-1');
  });

  it('usa a metade do mesmo gênero', () => {
    expect(seatPairOptions('sofa', '3dx-female', '3dx-female')[0]).toBe('ff-sofa-1');
    expect(seatPairOptions('chair', '3dx-male', '3dx-male')[0]).toBe('mm-chair-1');
    expect(seatPairOptions('sofa', '3dx-male', '3dx-male')).not.toContain('sofa-1');
  });
});

describe('painel de poses do par ativo', () => {
  it('lista as cenas do mesmo móvel', () => {
    const scenes = pairScenes('sofa-1', '3dx-male', '3dx-female');
    expect(scenes[0]).toBe('sofa-1');
    expect(scenes).toContain('sofa-2');
    expect(scenes).not.toContain('bed-1');
  });

  it('par social alterna só entre pares sem móvel', () => {
    const scenes = pairScenes('hug', '3dx-male', '3dx-female');
    expect(scenes).toContain('kiss');
    expect(scenes).toContain('slow-dance-2');
    expect(scenes).not.toContain('sofa-1');
  });

  it('respeita a composição do casal', () => {
    expect(pairScenes('ff-sofa-1', '3dx-female', '3dx-female')).toContain('ff-sofa-2');
    expect(pairScenes('mm-sofa-1', '3dx-male', '3dx-male')).not.toContain('sofa-1');
  });
});
