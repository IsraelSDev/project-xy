# 3DXChat Web — Especificação do Projeto para Claude Code

> **Objetivo:** construir uma plataforma social 3D multiplayer para adultos, acessível pelo navegador, com estética realista, câmera em terceira pessoa, avatares personalizáveis, ambientes compartilhados e comunicação em tempo real.
>
> **Instrução principal para o agente:** não tente implementar o produto inteiro de uma vez. Inspecione o repositório, apresente um plano curto, implemente uma etapa vertical funcional por vez, execute os testes e documente as decisões. Não afirme que algo funciona sem executar as verificações disponíveis.

---

## 1. Visão e escopo

Criar um mundo virtual social inspirado no gênero de plataformas como 3DXChat, sem copiar código, marca, modelos, texturas, animações ou outros materiais proprietários de terceiros.

### Experiência pretendida

- Aplicação executada no navegador, inicialmente com prioridade para desktop.
- Gráficos 3D realistas, dentro de limites adequados ao desempenho web.
- Câmera em terceira pessoa, acompanhando o avatar.
- Personagens humanos adultos, com possibilidade de personalização gradual.
- Ambientes sociais compartilhados, começando por um lounge moderno.
- Salas multiplayer com jogadores visíveis simultaneamente.
- Chat público e, posteriormente, mensagens privadas, amigos e convites.
- Animações sociais, gestos, poses e opções de interação introduzidas incrementalmente.
- Produto destinado exclusivamente a maiores de 18 anos, com requisitos de garantia de idade, segurança e moderação definidos antes do lançamento.

### Fora do primeiro MVP

Não implementar inicialmente:
- Mundo aberto contínuo.
- Editor completo de corpo e rosto.
- Economia virtual complexa ou marketplace.
- Voz/WebRTC.
- Grande quantidade de cenários.
- Sistema de criação de conteúdo por usuários.
- Arquitetura distribuída prematura.

---

## 2. Stack proposta

Usar TypeScript de ponta a ponta, preferencialmente com versões estáveis e compatíveis entre si. Antes de instalar dependências, conferir as versões atuais, os requisitos de Node.js e a compatibilidade entre bibliotecas.

### Frontend / jogo

- React
- TypeScript
- Vite
- Babylon.js para renderização 3D, câmera, materiais, luzes, carregamento de modelos e animações
- React para menus, HUD, login e telas de seleção
- Playwright para testes E2E, quando aplicável

### API de negócio

- Node.js
- TypeScript
- NestJS
- REST API
- Autenticação por sessão segura ou JWT de curta duração com estratégia de renovação segura
- Validação de DTOs e autorização no backend

### Multiplayer

- Colyseus
- WebSocket
- Estado autoritativo no servidor
- Salas isoladas com limite de jogadores configurável
- Validação de comandos de movimento no servidor

### Dados e infraestrutura

- PostgreSQL para dados persistentes
- ORM a definir após avaliar compatibilidade e necessidades do projeto (Prisma ou TypeORM)
- Docker Compose para desenvolvimento local
- Redis somente quando houver necessidade real de coordenação entre instâncias, presença distribuída ou filas
- Storage de objetos/CDN para assets em ambiente de produção
- HTTPS/WSS em ambientes publicados

### Assets 3D

- Blender para modelagem, rigging e ajustes
- glTF/GLB como formatos preferenciais para o navegador
- Materiais PBR
- Draco ou meshopt para geometria, conforme compatibilidade e medição
- KTX2/Basis para texturas, se o pipeline e os dispositivos-alvo suportarem
- Usar somente assets próprios ou com licença explícita compatível com o uso pretendido

### Princípio de arquitetura

Separar a renderização 3D da simulação multiplayer e da API de negócio. Não acoplar regras de domínio a componentes React ou ao ciclo de renderização do Babylon.js.

---

## 3. Arquitetura de alto nível

```text
Navegador
├── React + TypeScript
│   ├── Autenticação e telas
│   ├── HUD e chat
│   └── Integração com jogo
├── Babylon.js
│   ├── Mundo 3D
│   ├── Avatar e animações
│   ├── Câmera terceira pessoa
│   ├── Movimento e colisões
│   └── Carregamento de assets
├── REST/HTTPS ──────────────> API NestJS
│                              ├── Autenticação
│                              ├── Perfis e avatares
│                              ├── Amigos e bloqueios
│                              ├── Moderação
│                              └── PostgreSQL
└── WebSocket ───────────────> Colyseus
                               ├── Salas
                               ├── Presença
                               ├── Estado multiplayer
                               └── Simulação e validação
```

### Responsabilidades

**Frontend**
- Renderizar o ambiente e os avatares.
- Ler os controles do usuário.
- Enviar comandos de movimento ao servidor.
- Interpolar atualizações remotas para movimento visual suave.
- Exibir estados de conexão, erros e feedback de interação.

**NestJS**
- Gerenciar identidade, perfis, dados persistentes e regras de negócio.
- Emitir e validar credenciais de acesso.
- Aplicar autorização em todas as operações protegidas.
- Persistir dados duráveis no PostgreSQL.

**Colyseus**
- Gerenciar salas e conexões em tempo real.
- Manter o estado temporário dos jogadores conectados.
- Validar comandos e calcular movimento permitido.
- Difundir mudanças de estado aos participantes da sala.
- Impedir que o cliente seja autoridade final sobre posições, permissões ou ações sensíveis.

**PostgreSQL**
- Guardar contas, perfis, preferências, configurações de avatar, amizades, bloqueios e registros de moderação necessários.
- Não persistir cada frame ou cada atualização de posição.

**Storage/CDN**
- Distribuir modelos, texturas, animações e áudio.
- Não guardar segredos ou credenciais no cliente.

---

## 4. Estrutura inicial do monorepo

Usar `pnpm` workspaces. Manter a estrutura simples; não criar abstrações ou pacotes sem necessidade demonstrada.

```text
3dxchat-web/
├── apps/
│   ├── web/
│   │   └── src/
│   │       ├── app/
│   │       ├── features/
│   │       │   ├── auth/
│   │       │   ├── character/
│   │       │   ├── world/
│   │       │   ├── rooms/
│   │       │   ├── chat/
│   │       │   └── friends/
│   │       ├── game/
│   │       │   ├── engine/
│   │       │   ├── camera/
│   │       │   ├── movement/
│   │       │   ├── characters/
│   │       │   ├── animation/
│   │       │   ├── physics/
│   │       │   └── rendering/
│   │       └── ui/
│   ├── api/
│   │   └── src/modules/
│   │       ├── auth/
│   │       ├── users/
│   │       ├── profiles/
│   │       ├── avatars/
│   │       ├── friends/
│   │       ├── moderation/
│   │       └── admin/
│   └── realtime/
│       └── src/
│           ├── rooms/
│           ├── state/
│           ├── simulation/
│           ├── movement/
│           ├── interactions/
│           └── validation/
├── packages/
│   ├── contracts/
│   ├── game-core/
│   └── config/
├── assets/
│   ├── characters/
│   ├── animations/
│   ├── environments/
│   ├── materials/
│   └── audio/
├── infra/
│   ├── docker/
│   └── deployment/
├── pnpm-workspace.yaml
├── package.json
├── .env.example
└── README.md
```

A estrutura pode ser ajustada se o repositório existente já possuir convenções válidas. Não apagar nem reescrever arquivos existentes sem inspeção.

---

## 5. Fases de implementação

### Fase 0 — Inspeção e fundação

1. Inspecionar os arquivos, scripts, dependências e documentação existentes.
2. Se o repositório estiver vazio, criar o monorepo com `pnpm`.
3. Configurar TypeScript, lint, formatação e testes.
4. Criar aplicações web, API e servidor realtime com health checks.
5. Criar Docker Compose para dependências locais, incluindo PostgreSQL.
6. Criar `.env.example` sem segredos.
7. Documentar comandos de instalação, desenvolvimento e testes.

**Critérios de aceite**
- Aplicações iniciam localmente.
- Health checks funcionam.
- Configurações sensíveis vêm de variáveis de ambiente.
- README permite que outra pessoa reproduza a instalação.
- Lint e testes básicos passam.

### Fase 1 — Primeiro ambiente 3D jogável

1. Inicializar Babylon.js dentro da aplicação React, com ciclo de vida seguro.
2. Criar um lounge simples usando geometria provisória quando não houver assets licenciados disponíveis.
3. Implementar um avatar placeholder ou modelo licenciado com rig compatível.
4. Implementar câmera em terceira pessoa.
5. Implementar controles de teclado e movimento básico.
6. Adicionar colisões básicas e limites navegáveis.
7. Adicionar animações idle e caminhada, se houver assets adequados.
8. Garantir limpeza correta de recursos GPU ao desmontar a cena.

**Critérios de aceite**
- Cena abre sem erros no navegador.
- Avatar pode caminhar e girar.
- Câmera acompanha o avatar sem movimentos bruscos.
- Personagem não atravessa as principais paredes do cenário.
- Redimensionar a janela não quebra o canvas.
- Não há vazamentos óbvios por inicialização repetida da cena.

### Fase 2 — Multiplayer

1. Criar sala Colyseus com estado tipado.
2. Definir mensagens e contratos compartilhados no pacote `contracts`.
3. Implementar entrada, saída e desconexão de jogadores.
4. Implementar comandos de movimento validados pelo servidor.
5. Replicar posição, rotação e estado básico de animação.
6. Interpolar avatares remotos.
7. Tratar reconexão e falhas de rede.
8. Exibir lista de jogadores presentes para depuração.

**Critérios de aceite**
- Dois navegadores conseguem entrar na mesma sala.
- Cada navegador vê o avatar remoto se movimentar.
- Saída e desconexão removem ou atualizam corretamente a presença.
- Cliente não consegue definir livremente posições arbitrárias no servidor.
- Erros de rede têm feedback compreensível.

**Parâmetros iniciais para teste**
- Começar com 8–16 jogadores por sala como meta de teste, não como capacidade garantida.
- Medir frequência de atualização, tráfego, latência e uso de CPU antes de elevar o limite.
- Avaliar 10–20 atualizações por segundo para estado de movimento, ajustando conforme os resultados.
- Renderização e sincronização devem ter frequências independentes.

### Fase 3 — Identidade e recursos sociais

1. Implementar cadastro e login.
2. Implementar perfis públicos com campos mínimos.
3. Relacionar a identidade autenticada com a conexão Colyseus.
4. Implementar chat público na sala com limites de tamanho e frequência.
5. Implementar bloqueio e denúncia.
6. Criar registros mínimos e protegidos para ações de moderação.
7. Planejar mensagens privadas e amizades após validar o fluxo social básico.

**Critérios de aceite**
- Usuário autenticado é identificado de forma confiável no realtime.
- Mensagens são validadas no servidor.
- Rate limits e limites de tamanho estão ativos.
- Usuários bloqueados não conseguem contornar o bloqueio pelo cliente.
- Denúncias podem ser consultadas por funções administrativas autorizadas.

### Fase 4 — Avatares personalizáveis

1. Definir um formato canônico de avatar e convenções de esqueleto.
2. Criar seleção de personagem-base.
3. Implementar opções básicas de cabelo, roupas e acessórios.
4. Salvar a configuração do avatar no backend.
5. Implementar biblioteca de animações compatível.
6. Otimizar modelos e texturas.
7. Adicionar variações visuais gradualmente.

**Critérios de aceite**
- Configuração é persistida e recuperada.
- Equipamentos compatíveis podem ser trocados sem corromper o rig.
- Assets inválidos ou não autorizados não podem ser carregados arbitrariamente.
- Desempenho é medido com vários avatares visíveis.

### Fase 5 — Ambientes e interações

1. Adicionar seleção de salas.
2. Implementar ambientes públicos e privados.
3. Implementar convites e permissões de entrada.
4. Adicionar interações contextuais, como sentar e executar gestos.
5. Adicionar mais cenários somente após validar desempenho e fluxo de produção.
6. Preparar carregamento assíncrono e descarte de assets.

### Fase 6 — Preparação para produção

1. Testes unitários, integração, E2E e testes de carga.
2. Monitoramento de latência, desconexões, memória, CPU e erros.
3. Backups e teste de restauração do banco.
4. Rate limiting, proteção contra abuso e auditoria administrativa.
5. HTTPS/WSS, política de CORS e cabeçalhos de segurança.
6. CDN e cache de assets.
7. Procedimentos de deploy, rollback e migração.
8. Revisão de requisitos legais, privacidade e políticas de fornecedores.

---

## 6. Regras do multiplayer

### Estado mínimo por jogador

O estado transitório pode conter:
- Identificador público do jogador.
- Identificador do avatar selecionado.
- Posição e rotação validadas pelo servidor.
- Estado de movimento/animação.
- Metadados mínimos de presença necessários à sala.

Não transmitir e-mail, tokens, documentos ou dados privados aos outros participantes.

### Movimento

- Cliente envia intenção de movimento e comandos de entrada.
- Servidor valida frequência, magnitude, permissões e limites.
- Servidor calcula ou valida a posição permitida.
- Cliente usa interpolação para suavizar estados remotos.
- Previsão local e reconciliação são melhorias posteriores, caso necessárias.
- A simulação não deve depender de componentes React ou de frames do renderizador.

### Contratos

- Compartilhar tipos de mensagens e DTOs por `packages/contracts`.
- Validar mensagens em runtime no servidor; tipos TypeScript não substituem validação.
- Versionar contratos quando houver mudanças incompatíveis.
- Rejeitar mensagens desconhecidas ou inválidas com segurança.
- Não aceitar do cliente decisões de compra, autorização ou moderação.

---

## 7. Assets e desempenho 3D

### Pipeline de produção

1. Escolher um modelo-base com licença adequada.
2. Conferir rig, escala, orientação, materiais e animações.
3. Exportar em glTF/GLB.
4. Validar no navegador em diferentes GPUs e navegadores.
5. Medir custo de geometria, materiais, luzes e texturas.
6. Aplicar compressão e LODs somente após medir.
7. Manter metadados de origem, licença e versão dos assets.

### Requisitos de desempenho

- Carregar assets sob demanda.
- Evitar reconstruir a cena a cada renderização React.
- Usar instancing para objetos repetidos quando apropriado.
- Limitar materiais e luzes caras.
- Usar sombras com parcimônia.
- Liberar texturas, geometria, materiais e observables quando não forem mais necessários.
- Testar com múltiplos avatares simultâneos, não apenas com a cena vazia.
- Definir metas de FPS depois de escolher os dispositivos-alvo e medir o protótipo.

Não baixar nem incorporar modelos de sites de terceiros sem confirmar a licença de redistribuição e uso comercial.

---

## 8. Segurança e público adulto

O produto é destinado a maiores de 18 anos. Isso exige planejamento de produto e operação além de um simples campo de data de nascimento.

- Definir método de garantia de idade adequado aos países atendidos.
- Evitar coletar e manter documentos de identidade sem necessidade.
- Não tratar uma caixa “tenho 18 anos” como garantia suficiente.
- Implementar bloqueio, denúncia, silenciamento e sanções.
- Restringir ferramentas administrativas por função e auditar ações sensíveis.
- Proteger APIs, salas privadas e convites no servidor.
- Implementar rate limits e proteção contra spam.
- Definir política de privacidade, retenção e exclusão de dados.
- Revisar políticas de hospedagem, pagamentos e fornecedores antes de habilitar funcionalidades sensíveis.
- Não implementar conteúdo ou funcionalidades proibidos por lei ou pelos fornecedores utilizados.

---

## 9. Qualidade e convenções de código

- TypeScript com `strict` habilitado.
- Preferir funções e módulos pequenos com responsabilidades claras.
- Validar dados externos em runtime.
- Evitar `any`; justificar exceções.
- Não colocar regras de negócio em componentes visuais.
- Não acessar o banco diretamente a partir do cliente.
- Nunca incluir segredos em variáveis `VITE_*`, bundles ou assets públicos.
- Criar testes para regras críticas e para o fluxo principal.
- Registrar decisões arquiteturais relevantes em `docs/decisions/`.
- Não adicionar dependências sem explicar a necessidade.
- Não introduzir microserviços adicionais antes de haver motivo operacional.
- Não simular funcionalidades incompletas como se fossem reais.
- Usar assets placeholder claramente identificados quando o asset final não estiver disponível.

---

## 10. Instruções de execução para Claude Code

Ao iniciar o trabalho:

1. Inspecione o repositório e identifique o que já existe.
2. Não sobrescreva arquivos sem entender seu propósito.
3. Apresente um resumo da estrutura atual e um plano de implementação da próxima etapa.
4. Implemente **somente a Fase 0**, a menos que o usuário solicite explicitamente outra fase.
5. Execute os comandos de lint, testes e build que estiverem disponíveis.
6. Corrija erros introduzidos pela implementação.
7. Informe quais arquivos foram criados ou alterados, quais comandos foram executados e seus resultados.
8. Liste limitações, decisões pendentes e próximos passos.
9. Não invente resultados de testes nem afirme que o sistema foi executado se não foi.
10. Mantenha o README atualizado.

### Ao terminar a Fase 0

Pare e apresente:
- Arquitetura e estrutura criadas.
- Comandos para iniciar cada aplicação.
- Resultado real de lint, testes e build.
- Problemas encontrados.
- Plano curto para a Fase 1.

Só avance para a fase seguinte depois de confirmar que a etapa atual está funcional ou de receber autorização para continuar.

---

## 11. Definição de pronto do MVP social

O MVP será considerado funcional quando:

- [ ] O usuário consegue autenticar-se.
- [ ] O fluxo de acesso para adultos está definido e implementado de acordo com a estratégia aprovada.
- [ ] O avatar aparece em um ambiente 3D navegável.
- [ ] A câmera funciona em terceira pessoa.
- [ ] Dois ou mais usuários se veem e se movimentam na mesma sala.
- [ ] O servidor valida os comandos de movimento.
- [ ] O chat público funciona em tempo real.
- [ ] O usuário consegue bloquear e denunciar outro usuário.
- [ ] A configuração básica do avatar é persistida.
- [ ] Desconexões são tratadas sem deixar presença incorreta indefinidamente.
- [ ] Build, testes críticos e procedimentos de implantação estão documentados.
- [ ] O desempenho foi medido com vários avatares e em navegadores desktop-alvo.

**Prioridade imediata:** concluir a Fase 0; depois, construir a primeira experiência vertical 3D da Fase 1 antes de ampliar o escopo.
