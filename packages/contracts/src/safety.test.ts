import { describe, expect, it } from 'vitest';
import { CreateReportRequest, MAX_SANCTION_HOURS, ReviewReportRequest } from './safety.ts';

describe('CreateReportRequest', () => {
  const base = {
    reportedUserId: '0b9a2a52-5f3c-4c1e-9d3b-2f1f6c0e8a11',
    reason: 'SPAM',
  };

  it('contexto padrão é USER e PROFILE é aceito', () => {
    expect(CreateReportRequest.parse(base).context).toBe('USER');
    expect(CreateReportRequest.parse({ ...base, context: 'PROFILE' }).context).toBe('PROFILE');
  });

  it('recusa contexto ou motivo fora da lista', () => {
    expect(CreateReportRequest.safeParse({ ...base, context: 'CHAT' }).success).toBe(false);
    expect(CreateReportRequest.safeParse({ ...base, reason: 'BULLYING' }).success).toBe(false);
  });
});

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
