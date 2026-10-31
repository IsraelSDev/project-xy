# Checklist de privacidade, requisitos legais e fornecedores

**Isto não é parecer jurídico.** É o levantamento técnico do que o sistema guarda e do que falta
decidir antes de abrir para o público. Cada item "pendente" precisa de responsável e revisão
jurídica (LGPD e regras de conteúdo adulto de cada país onde o serviço for oferecido).

## Dados pessoais guardados hoje

| Dado                           | Onde                         | Por quê                      | Retenção hoje                  |
| ------------------------------ | ---------------------------- | ---------------------------- | ------------------------------ |
| E-mail                         | `User.email`                 | login                        | enquanto a conta existir       |
| Hash da senha (scrypt)         | `User.passwordHash`          | login                        | idem                           |
| Data de nascimento             | `User.birthDate`             | barrar menores de 18         | idem                           |
| Nome de exibição e avatar      | `User`                       | identidade pública nas salas | idem                           |
| Sessões (hash do token)        | `Session`                    | manter o login (7 dias)      | vencidas apagadas a cada login |
| Bloqueios                      | `Block`                      | segurança entre usuários     | enquanto a conta existir       |
| Amizades e pedidos             | `Friendship`                 | rede de amigos               | enquanto a conta existir       |
| Denúncias e ações de moderação | `Report`, `ModerationAction` | segurança e auditoria        | sem prazo definido             |
| Sanções (silenciar, suspender) | `Sanction`                   | segurança e auditoria        | sem prazo definido             |
| Contestações (texto da pessoa) | `Appeal`                     | revisão de sanções           | sem prazo definido             |
| Mensagens de chat (sala)       | `MessageLog`                 | leitura pela administração   | 90 dias                        |
| Mensagens privadas             | `MessageLog`                 | leitura pela administração   | 90 dias                        |
| Posição nas salas              | só em memória no realtime    | multiplayer                  | até a sala acabar              |
| Logs do realtime               | saída do processo            | operação                     | depende da plataforma          |
| IP ou id + rota (rate limit)   | `RateLimitBucket`            | limitar abuso                | até o fim da janela (≤ 1 h)    |

Os logs do realtime têm `sessionId`, `roomId` e contagem de jogadores. Não têm e-mail, nome nem IP.
O rate limit guarda o IP (ou o id da conta) só enquanto a janela de contagem dura; a API apaga as
linhas vencidas.
As conversas (`MessageLog`) guardam **texto puro**, só com id de quem enviou/recebeu (sem nomes), por
90 dias. Só o papel `ADMIN` lê, e cada leitura entra na auditoria. Ver
[ADR 0015](../decisions/0015-leitura-de-conversas-pela-administracao.md). **Pendente:** base legal e
transparência (aviso na política de privacidade) para a leitura de mensagens privadas.
Os dumps de `pnpm db:backup` têm todos os dados acima e ficam fora do Git.

## Pendências antes do lançamento

- [ ] **Verificação de idade real.** Hoje a idade é só declarada
      ([ADR 0005](../decisions/0005-identidade-e-seguranca-fase-3.md)). Fornecedor **decidido e
      contratado em 2026-10-29 (verify-id)**; a integração técnica espera as credenciais. Falta
      revisar contrato/DPA e a lista de países atendidos pelo provedor.
- [ ] **Termos de uso e política de privacidade** publicados, com aceite registrado (versão e data).
- [ ] **Base legal e finalidade** de cada dado da tabela acima (LGPD art. 7º). Data de nascimento
      pode ser substituída por "maior de idade verificado" depois da verificação, para minimizar.
- [x] **Direitos do titular:** em **Conta** no site, a pessoa exporta os próprios dados (JSON) e
      exclui a conta com a senha atual
      ([ADR 0010](../decisions/0010-exclusao-de-conta-e-retencao.md)). A exclusão **anonimiza**
      (apaga e-mail, senha, data de nascimento, avatar, sessões, bloqueios e as mensagens de
      chat/MP) e mantém denúncias, sanções e auditoria ligadas ao registro anônimo. A exportação
      inclui as próprias mensagens. Pendente: revisão jurídica da base legal para manter esses
      registros e do que fica fora da exportação (denúncias recebidas, para proteger quem denunciou).
- [ ] **Retenção:** prazo para denúncias, ações de moderação, logs e backups. Sessões vencidas já
      são apagadas a cada login.
- [ ] **Encarregado (DPO)** e canal de contato.
- [ ] **Incidentes:** procedimento de resposta e comunicação à ANPD e aos titulares.
- [ ] **Conteúdo e moderação:** política de conduta, canal para denúncias graves (ex.: suspeita de
      menor) e procedimento de preservação e encaminhamento às autoridades quando a lei exigir.
- [ ] **Cookies:** hoje só o cookie de sessão `sid` (essencial). Analytics ou marketing exigiriam
      consentimento.

## Fornecedores

Nenhum serviço externo processa dados hoje: tudo roda localmente. O **verify-id** está contratado
para a verificação de idade e passa a receber documento/selfie quando a integração entrar. Antes de
contratar cada um
(hospedagem, banco gerenciado, CDN, e-mail, verificação de idade, monitoramento), revisar:

- [ ] Política de uso aceitável: **muitas plataformas proíbem ou restringem conteúdo adulto.**
- [ ] Contrato de tratamento de dados (DPA) e local de armazenamento (transferência internacional).
- [ ] Sub-processadores e certificações.
- [ ] Licenças de assets 3D (modelos, texturas, animações): uso comercial, conteúdo adulto e
      distribuição por CDN.
