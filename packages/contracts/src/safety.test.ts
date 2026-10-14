import { describe, expect, it } from 'vitest';
import { MAX_SANCTION_HOURS, ReviewReportRequest } from './safety.ts';

describe('ReviewReportRequest', () => {
  it('aceita resolver com sanção', () => {
    for (const sanction of [
      { type: 'MUTE', hours: 24 },
      { type: 'SUSPEND', hours: 168 },
      { type: 'SUSPEND', hours: null },
    ]) {
      expect(ReviewReportRequest.safeParse({ status: 'RESOLVED', sanction }).success).toBe(true);
    }
  });

  it('recusa sanção ao descartar a denúncia', () => {
    const review = { status: 'DISMISSED', sanction: { type: 'MUTE', hours: 1 } };
    expect(ReviewReportRequest.safeParse(review).success).toBe(false);
  });

  it('silenciamento sempre tem prazo, dentro do limite', () => {
    for (const hours of [null, 0, 1.5, MAX_SANCTION_HOURS + 1]) {
      const review = { status: 'RESOLVED', sanction: { type: 'MUTE', hours } };
      expect(ReviewReportRequest.safeParse(review).success).toBe(false);
    }
  });
});
