/**
 * Conteúdo das páginas legais (termos, privacidade e cookies).
 *
 * O texto parte do que o sistema realmente guarda (`docs/operations/privacidade.md`) e das decisões
 * registradas nos ADRs. **Não é parecer jurídico**: antes de abrir ao público, revisar com advogado
 * (LGPD/GDPR e regras de conteúdo adulto de cada país) e trocar o contato do encarregado pelo real.
 */

export type LegalPageId = 'terms' | 'privacy' | 'cookies';

export interface LegalSection {
  title: string;
  paragraphs?: string[];
  items?: string[];
}

export interface LegalPageContent {
  id: LegalPageId;
  path: string;
  title: string;
  summary: string;
  sections: LegalSection[];
}

/** Data da última revisão do texto (aparece no topo das páginas). */
export const LEGAL_UPDATED_AT = '2026-10-31';

/**
 * Contato do encarregado de dados (DPO) e do suporte. Configure `VITE_LEGAL_CONTACT` no deploy;
 * o valor padrão é um exemplo e **precisa ser trocado antes de publicar**.
 */
export const LEGAL_CONTACT =
  (import.meta.env.VITE_LEGAL_CONTACT as string | undefined) ?? 'privacidade@3dxchat.example';

const CONTACT_SECTION: LegalSection = {
  title: 'Contato',
  paragraphs: [
    `Dúvidas sobre estes termos, privacidade ou o exercício dos seus direitos: ${LEGAL_CONTACT}.`,
    'Respondemos no prazo legal aplicável. Se você estiver no Brasil e não ficar satisfeito com a resposta, pode procurar a Autoridade Nacional de Proteção de Dados (ANPD).',
  ],
};

const TERMS: LegalPageContent = {
  id: 'terms',
  path: '/termos-de-uso',
  title: 'Termos de Uso',
  summary:
    'As regras para usar o 3DXChat Web: quem pode entrar, como se comportar, o que acontece com o seu conteúdo e o que você pode esperar do serviço.',
  sections: [
    {
      title: '1. Aceitação e elegibilidade',
      paragraphs: [
        'Ao criar uma conta ou usar o 3DXChat Web, você concorda com estes Termos e com a Política de Privacidade. Se não concordar, não use o serviço.',
        'O serviço é destinado exclusivamente a pessoas com 18 anos ou mais. Ao se cadastrar, você declara ter essa idade; a idade pode ser verificada por um provedor de verificação (documento e/ou selfie) e contas não verificadas podem ter funcionalidades restringidas.',
      ],
    },
    {
      title: '2. Sua conta',
      items: [
        'Use dados verdadeiros e mantenha o e-mail atualizado: ele é o canal de contato e de recuperação.',
        'A conta é pessoal. Não compartilhe a senha nem permita que outra pessoa use a sua conta.',
        'Você é responsável pelas atividades feitas com a sua conta enquanto a sessão estiver ativa.',
        'Podemos encerrar ou suspender contas que violem estes Termos, com aviso e direito de contestação quando possível.',
      ],
    },
    {
      title: '3. Conduta',
      paragraphs: ['Para manter a casa segura e divertida, é proibido:'],
      items: [
        'Acessar o serviço sendo menor de 18 anos ou facilitar o acesso de menores.',
        'Assediar, ameaçar, perseguir, chantagear ou expor outra pessoa sem consentimento.',
        'Publicar conteúdo ilegal, violento, de abuso sexual, de ódio ou que viole direitos de terceiros.',
        'Divulgar dados pessoais de outras pessoas (endereço, telefone, redes sociais, documentos).',
        'Aplicar golpes, spam, propaganda não autorizada ou venda fora da plataforma.',
        'Contornar bloqueios, sanções, limites técnicos ou sistemas de moderação.',
        'Usar bots, automação ou ferramentas que prejudiquem a experiência dos demais.',
      ],
    },
    {
      title: '4. Conteúdo do usuário',
      paragraphs: [
        'Você mantém os direitos sobre o que cria e envia (avatar, fotos, textos). Ao publicar no serviço, você concede uma licença limitada para exibir esse conteúdo dentro da plataforma, pelo tempo em que ele estiver publicado.',
        'Você declara ter direito de usar as imagens e os textos que envia e responde por eles. Conteúdo denunciado pode ser removido e a conta pode ser sancionada.',
      ],
    },
    {
      title: '5. Interações e consentimento',
      paragraphs: [
        'Interações a dois (danças, abraços, beijos e poses de móvel) só começam com o aceite da outra pessoa. Qualquer participante pode encerrar a interação a qualquer momento.',
        'Bloqueios impedem novas interações e o envio de mensagens entre as partes. O assédio e a insistência após um "não" são violações destes Termos.',
      ],
    },
    {
      title: '6. Créditos e compras',
      paragraphs: [
        'Créditos são um saldo virtual usado dentro do serviço. Eles não são moeda, não rendem juros e não podem ser convertidos em dinheiro fora da plataforma.',
        'Compras de créditos e de itens seguem a legislação de defesa do consumidor aplicável. Pagamentos falhados não liberam itens nem debitam créditos indevidamente; pedidos de reembolso são analisados conforme a lei e as condições da compra.',
        'Itens e preços podem mudar. Itens já comprados permanecem na conta, salvo encerramento por violação destes Termos.',
      ],
    },
    {
      title: '7. Moderação',
      paragraphs: [
        'Podemos revisar denúncias, remover conteúdo, silenciar, suspender ou encerrar contas para proteger as pessoas e cumprir a lei. Sanções podem ser contestadas pelo canal indicado no aviso.',
        'Mensagens de chat e privadas podem ser registradas por até 90 dias para investigação de denúncias e segurança, conforme a Política de Privacidade.',
      ],
    },
    {
      title: '8. Disponibilidade e limitações',
      paragraphs: [
        'O serviço é oferecido "como está". Fazemos o possível para mantê-lo disponível, mas podem ocorrer manutenções, falhas de rede e indisponibilidades.',
        'Na medida permitida pela lei, não respondemos por danos indiretos decorrentes do uso ou da impossibilidade de usar o serviço. Nada aqui limita direitos que a lei do consumidor garanta.',
      ],
    },
    {
      title: '9. Encerramento',
      paragraphs: [
        'Você pode excluir a conta a qualquer momento em Conta. A exclusão apaga os dados pessoais e anonimiza o registro, como descrito na Política de Privacidade.',
        'Podemos encerrar o serviço ou uma conta por violação destes Termos, fraude ou exigência legal.',
      ],
    },
    {
      title: '10. Alterações e lei aplicável',
      paragraphs: [
        'Podemos atualizar estes Termos. Mudanças relevantes serão avisadas no site antes de valerem; continuar usando depois disso significa aceitar a nova versão.',
        'Estes Termos são regidos pelas leis do Brasil. Fica eleito o foro do domicílio do usuário consumidor, quando aplicável.',
      ],
    },
    CONTACT_SECTION,
  ],
};

const PRIVACY: LegalPageContent = {
  id: 'privacy',
  path: '/politica-de-privacidade',
  title: 'Política de Privacidade',
  summary:
    'O que guardamos, por quê, por quanto tempo e como você pode acessar, corrigir ou apagar os seus dados.',
  sections: [
    {
      title: '1. Quem trata os seus dados',
      paragraphs: [
        'O 3DXChat Web é o controlador dos dados pessoais descritos abaixo. O encarregado de dados (DPO) pode ser contatado em ' +
          LEGAL_CONTACT +
          '.',
      ],
    },
    {
      title: '2. Dados que coletamos',
      items: [
        'Conta: e-mail, hash da senha (nunca a senha), nome público e data de nascimento (para barrar menores de 18).',
        'Perfil: foto, bio, localização, status, interesses, idiomas, pronomes e aniversário (dia e mês, só se você escolher mostrar).',
        'Aparência: configuração do avatar (modelo, roupas, cabelo, cores e tatuagens).',
        'Vida social: amizades, pedidos, bloqueios e interações consentidas.',
        'Mensagens: chat da sala e mensagens privadas, com remetente/destinatário e horário, guardadas por até 90 dias para segurança e moderação.',
        'Moderação: denúncias, sanções, contestações e auditoria das ações da equipe.',
        'Técnicos: IP (apenas para limitar abuso, por até 1 hora), logs do servidor em tempo real (sessão, sala e contagem de jogadores, sem e-mail/nome) e medição de audiência, se você consentir.',
      ],
    },
    {
      title: '3. Por que usamos e com qual base legal',
      items: [
        'Executar o contrato: criar a conta, manter a sessão, exibir o avatar, entregar o chat e as interações.',
        'Cumprir obrigação legal: impedir menores de 18 anos, atender autoridades e manter registros exigidos.',
        'Legítimo interesse: segurança, prevenção de fraude/abuso, moderação e melhoria do serviço, sempre com salvaguardas.',
        'Consentimento: medição de audiência e cookies opcionais. Você pode revogar a qualquer momento nas preferências de cookies.',
      ],
    },
    {
      title: '4. Cookies e armazenamento local',
      paragraphs: [
        'Usamos um cookie essencial de sessão (`sid`), httpOnly, SameSite=Lax e Secure em produção, válido por 7 dias, para manter você conectado. Sem ele, o login não funciona.',
        'A medição de audiência (Vercel) é opcional e só é ativada com o seu consentimento. Não usamos cookies de publicidade nem vendemos dados para terceiros.',
        'Veja a Política de Cookies para a lista completa e para mudar a sua escolha.',
      ],
    },
    {
      title: '5. Com quem compartilhamos',
      paragraphs: [
        'Não vendemos dados pessoais. Compartilhamos apenas o necessário com fornecedores que operam o serviço:',
      ],
      items: [
        'Hospedagem e banco de dados (Vercel e Render).',
        'Armazenamento de fotos de perfil (Supabase), quando configurado; sem ele, a foto fica no banco do serviço.',
        'Verificação de idade (verify-id), quando você optar por verificar; o provedor recebe documento/selfie e devolve apenas a confirmação.',
        'Medição de audiência (Vercel), somente com consentimento.',
        'Autoridades, quando houver obrigação legal ou ordem válida.',
      ],
    },
    {
      title: '6. Transferência internacional',
      paragraphs: [
        'Alguns fornecedores podem processar dados fora do Brasil. Quando isso ocorre, usamos as salvaguardas contratuais e técnicas exigidas pela LGPD para a transferência internacional.',
      ],
    },
    {
      title: '7. Por quanto tempo guardamos',
      items: [
        'Conta e perfil: enquanto a conta existir. A exclusão anonimiza o registro e apaga os dados pessoais.',
        'Sessões: 7 dias; as vencidas são apagadas a cada login.',
        'Mensagens de chat e privadas: até 90 dias.',
        'Limite de abuso (IP): até 1 hora.',
        'Denúncias, sanções, contestações e auditoria: pelo tempo necessário para segurança e cumprimento de obrigações legais, ligados a um registro anônimo após a exclusão da conta.',
      ],
    },
    {
      title: '8. Segurança',
      paragraphs: [
        'A senha é guardada como hash scrypt com sal. A sessão usa cookie httpOnly e conexões HTTPS. O acesso às mensagens é restrito à administração e auditado. Nenhum sistema é perfeitamente seguro; se ocorrer um incidente relevante, comunicamos você e a ANPD conforme a lei.',
      ],
    },
    {
      title: '9. Seus direitos',
      paragraphs: [
        'Você pode, a qualquer momento: confirmar se tratamos seus dados, acessar e exportar uma cópia (em Conta → Exportar dados), corrigir informações do perfil, excluir a conta com a senha atual, revogar o consentimento de cookies e pedir informações sobre compartilhamentos.',
        `Para exercer um direito que não esteja disponível no site, escreva para ${LEGAL_CONTACT}. Podemos pedir uma confirmação de identidade para proteger a sua conta.`,
      ],
    },
    {
      title: '10. Menores de 18 anos',
      paragraphs: [
        'O serviço não é destinado a menores de 18 anos. Se identificarmos uma conta de menor, ela é encerrada e os dados são tratados conforme a lei. Pais ou responsáveis podem entrar em contato pelo canal acima.',
      ],
    },
    {
      title: '11. Alterações',
      paragraphs: [
        'Podemos atualizar esta política. Mudanças relevantes serão avisadas no site; a data de revisão no topo indica a versão em vigor.',
      ],
    },
    CONTACT_SECTION,
  ],
};

const COOKIES: LegalPageContent = {
  id: 'cookies',
  path: '/politica-de-cookies',
  title: 'Política de Cookies',
  summary:
    'Quais cookies o 3DXChat Web usa, para que servem e como você pode aceitar, recusar ou mudar a sua escolha.',
  sections: [
    {
      title: '1. O que são cookies',
      paragraphs: [
        'Cookies são pequenos arquivos que o navegador guarda quando você visita um site. Usamos cookies e armazenamento local para manter a sessão e lembrar a sua escolha de consentimento.',
      ],
    },
    {
      title: '2. Essenciais',
      paragraphs: [
        'O cookie `sid` mantém você conectado. Ele é httpOnly (o JavaScript da página não lê), SameSite=Lax, Secure em produção e dura 7 dias. Sem ele, não é possível entrar na conta. Esses cookies não dependem de consentimento porque são necessários para o serviço.',
      ],
    },
    {
      title: '3. Medição de audiência (opcional)',
      paragraphs: [
        'Com o seu consentimento, usamos a medição de audiência da Vercel para saber quantas pessoas visitam o site e quais páginas são mais usadas. Os dados são agregados e não são usados para publicidade. Se você recusar, essa medição não é ativada.',
        'A sua escolha fica salva no armazenamento local do navegador (`3dx:cookie-consent`), com a versão do aviso e a data.',
      ],
    },
    {
      title: '4. Como mudar a sua escolha',
      items: [
        'Use o botão "Preferências de cookies" no rodapé do site para reabrir o aviso e trocar a escolha.',
        'Você também pode apagar os cookies e o armazenamento local nas configurações do navegador; isso encerra a sessão.',
        'Recusar a medição de audiência não impede o uso do lounge.',
      ],
    },
    {
      title: '5. Resumo',
      items: [
        '`sid` — essencial — mantém a sessão — 7 dias.',
        'Medição de audiência (Vercel) — opcional — estatísticas agregadas de uso — enquanto o consentimento estiver ativo.',
        'Não usamos cookies de publicidade nem de rastreamento entre sites.',
      ],
    },
    CONTACT_SECTION,
  ],
};

export const LEGAL_PAGES: Record<LegalPageId, LegalPageContent> = {
  terms: TERMS,
  privacy: PRIVACY,
  cookies: COOKIES,
};

/** Página legal correspondente ao caminho (com ou sem barra final), se houver. */
export function legalPageFor(pathname: string): LegalPageContent | undefined {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return Object.values(LEGAL_PAGES).find((page) => page.path === normalized);
}
