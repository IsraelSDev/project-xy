/**
 * Política de texto da bio: nada de links nem contato/venda fora da plataforma. É um filtro
 * simples (não é moderação): pega o caso óbvio e deixa o resto para a denúncia.
 *
 * A checagem normaliza o texto (minúsculas, sem acentos, sem caracteres invisíveis) para não cair
 * com `Wha\u200btsApp` ou `WHATSÁPP`.
 */

/** Termos de contato/venda fora da plataforma (comparados com fronteira de palavra). */
const CONTACT_TERMS = [
  'whatsapp',
  'whats',
  'telegram',
  'discord',
  'instagram',
  'insta',
  'tiktok',
  'onlyfans',
  'snapchat',
  'pix',
  'vendo pack',
  'compro pack',
  'chama no',
  'chama na',
  'me chama',
  'pagamento fora',
  'assinatura',
];

/** Links e domínios comuns (o "ponto" já basta para separar de texto normal). */
const LINK_PATTERN =
  /https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|br|io|gg|me|xyz|link|app|tv|co|shop)\b/;

const INVISIBLE = /[\u200b-\u200d\u2060\ufeff]/g;

/** Texto comparável: sem acento, minúsculo, sem invisíveis e com espaços colapsados. */
export function normalizeBio(bio: string): string {
  return bio
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(INVISIBLE, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Motivo pronto para o usuário quando a bio é recusada; `null` quando está tudo bem. */
export function bioProblem(bio: string): string | null {
  const text = normalizeBio(bio);
  if (LINK_PATTERN.test(text)) {
    return 'A bio não pode conter links.';
  }
  if (CONTACT_TERMS.some((term) => new RegExp(`(^|[^a-z0-9])${term}($|[^a-z0-9])`).test(text))) {
    return 'A bio não pode divulgar contato ou venda fora da plataforma.';
  }
  return null;
}

/** Mesma política da bio para a localização (evita transformar o campo numa vitrine de contato). */
export function locationProblem(location: string): string | null {
  const text = normalizeBio(location);
  if (LINK_PATTERN.test(text)) {
    return 'A localização não pode conter links.';
  }
  if (CONTACT_TERMS.some((term) => new RegExp(`(^|[^a-z0-9])${term}($|[^a-z0-9])`).test(text))) {
    return 'A localização não pode divulgar contato ou venda fora da plataforma.';
  }
  return null;
}
