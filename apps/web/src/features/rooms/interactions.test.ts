import { describe, expect, it } from 'vitest';
import { interactionOptions } from './interactions';

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
