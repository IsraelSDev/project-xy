import { describe, expect, it } from 'vitest';
import { CONSENT_VERSION, parseConsent } from './cookies';
import { LEGAL_PAGES, legalPageFor } from './legal-content';

describe('consentimento de cookies', () => {
  it('lê um registro da versão atual', () => {
    expect(
      parseConsent(JSON.stringify({ version: CONSENT_VERSION, analytics: true, at: 'x' })),
    ).toEqual({ version: CONSENT_VERSION, analytics: true, at: 'x' });
  });

  it('ignora lixo, versão antiga e campo faltando', () => {
    expect(parseConsent(null)).toBeUndefined();
    expect(parseConsent('nada')).toBeUndefined();
    expect(parseConsent(JSON.stringify({ version: 0, analytics: true, at: 'x' }))).toBeUndefined();
    expect(parseConsent(JSON.stringify({ version: CONSENT_VERSION, at: 'x' }))).toBeUndefined();
    expect(
      parseConsent(JSON.stringify({ version: CONSENT_VERSION, analytics: 'sim', at: 'x' })),
    ).toBeUndefined();
  });
});

describe('páginas legais', () => {
  it('encontra pelo caminho, com ou sem barra final', () => {
    expect(legalPageFor('/termos-de-uso')?.id).toBe('terms');
    expect(legalPageFor('/termos-de-uso/')?.id).toBe('terms');
    expect(legalPageFor('/politica-de-privacidade')?.id).toBe('privacy');
    expect(legalPageFor('/politica-de-cookies')?.id).toBe('cookies');
    expect(legalPageFor('/')).toBeUndefined();
    expect(legalPageFor('/outra-coisa')).toBeUndefined();
  });

  it('tem título, resumo e seções em todas', () => {
    for (const page of Object.values(LEGAL_PAGES)) {
      expect(page.title.length).toBeGreaterThan(4);
      expect(page.summary.length).toBeGreaterThan(20);
      expect(page.sections.length).toBeGreaterThanOrEqual(5);
      for (const section of page.sections) {
        expect(section.title.length).toBeGreaterThan(2);
        expect((section.paragraphs?.length ?? 0) + (section.items?.length ?? 0)).toBeGreaterThan(0);
      }
    }
  });

  it('cobre idade, cookies, retenção e direitos', () => {
    const terms = JSON.stringify(LEGAL_PAGES.terms);
    const privacy = JSON.stringify(LEGAL_PAGES.privacy);
    const cookies = JSON.stringify(LEGAL_PAGES.cookies);
    expect(terms).toContain('18 anos');
    expect(terms).toContain('consentimento');
    expect(privacy).toContain('90 dias');
    expect(privacy).toContain('ANPD');
    expect(privacy).toContain('exportar');
    expect(cookies).toContain('sid');
    expect(cookies).toContain('7 dias');
  });
});
