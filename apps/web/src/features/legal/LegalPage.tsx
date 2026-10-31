import { useEffect } from 'react';
import { LEGAL_PAGES, LEGAL_UPDATED_AT, type LegalPageContent } from './legal-content';

const LINKS = [LEGAL_PAGES.terms, LEGAL_PAGES.privacy, LEGAL_PAGES.cookies];

const updatedLabel = new Date(`${LEGAL_UPDATED_AT}T12:00:00Z`).toLocaleDateString('pt-BR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Página pública de termos/privacidade/cookies (abre deslogado e com o tema do site). */
export function LegalPage({ page }: { page: LegalPageContent }) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${page.title} · 3DXChat Web`;
    return () => {
      document.title = previous;
    };
  }, [page.title]);

  return (
    <main className="legal">
      <header className="legal-top">
        <a className="legal-brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            3DX
          </span>
          <span>3DXChat Web</span>
        </a>
        <a className="ghost legal-back" href="/">
          ← Voltar ao início
        </a>
      </header>

      <article className="hud-panel legal-page">
        <p className="legal-kicker">Documento legal</p>
        <h1>{page.title}</h1>
        <p className="legal-summary">{page.summary}</p>
        <p className="legal-updated">Atualizado em {updatedLabel}</p>

        <nav className="legal-nav" aria-label="Documentos legais">
          {LINKS.map((link) => (
            <a
              key={link.id}
              href={link.path}
              className={link.id === page.id ? 'is-active' : undefined}
              aria-current={link.id === page.id ? 'page' : undefined}
            >
              {link.title}
            </a>
          ))}
        </nav>

        {page.sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {section.items && (
              <ul>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </article>
    </main>
  );
}
