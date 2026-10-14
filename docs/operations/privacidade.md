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
| Sessões (hash do token)        | `Session`                    | manter o login (7 dias)      | **expiradas não são apagadas** |
| Bloqueios                      | `Block`                      | segurança entre usuários     | enquanto a conta existir       |
| Denúncias e ações de moderação | `Report`, `ModerationAction` | segurança e auditoria        | sem prazo definido             |
| Mensagens de chat              | **não guardadas**            | só trafegam pela sala        | —                              |
| Posição nas salas              | só em memória no realtime    | multiplayer                  | até a sala acabar              |
| Logs do realtime               | saída do processo            | operação                     | depende da plataforma          |

Os logs do realtime têm `sessionId`, `roomId` e contagem de jogadores. Não têm e-mail, nome nem IP.
Os dumps de `pnpm db:backup` têm todos os dados acima e ficam fora do Git.

## Pendências antes do lançamento

- [ ] **Verificação de idade real.** Hoje a idade é só declarada
      ([ADR 0005](../decisions/0005-identidade-e-seguranca-fase-3.md)). Definir fornecedor e método
      conforme a lei de cada país atendido.
- [ ] **Termos de uso e política de privacidade** publicados, com aceite registrado (versão e data).
- [ ] **Base legal e finalidade** de cada dado da tabela acima (LGPD art. 7º). Data de nascimento
      pode ser substituída por "maior de idade verificado" depois da verificação, para minimizar.
- [ ] **Direitos do titular:** exportar e excluir conta. Não existem ainda. Excluir conta precisa
      decidir o que acontece com denúncias feitas e recebidas (guardar para segurança, anonimizar?).
- [ ] **Retenção:** prazo para denúncias, ações de moderação, logs e backups; rotina que apaga
      sessões expiradas.
- [ ] **Encarregado (DPO)** e canal de contato.
- [ ] **Incidentes:** procedimento de resposta e comunicação à ANPD e aos titulares.
- [ ] **Conteúdo e moderação:** política de conduta, canal para denúncias graves (ex.: suspeita de
      menor) e procedimento de preservação e encaminhamento às autoridades quando a lei exigir.
- [ ] **Cookies:** hoje só o cookie de sessão `sid` (essencial). Analytics ou marketing exigiriam
      consentimento.

## Fornecedores

Nenhum serviço externo processa dados hoje: tudo roda localmente. Antes de contratar cada um
(hospedagem, banco gerenciado, CDN, e-mail, verificação de idade, monitoramento), revisar:

- [ ] Política de uso aceitável: **muitas plataformas proíbem ou restringem conteúdo adulto.**
- [ ] Contrato de tratamento de dados (DPA) e local de armazenamento (transferência internacional).
- [ ] Sub-processadores e certificações.
- [ ] Licenças de assets 3D (modelos, texturas, animações): uso comercial, conteúdo adulto e
      distribuição por CDN.
