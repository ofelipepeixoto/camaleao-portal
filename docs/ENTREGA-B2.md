# B2 — apresentar, aprovar e pedir ajustes

Base: feat/b1-decisoes (d5bb365). Revisar B1 antes de B2; não integrar B2
independentemente da migração. As PRs da entrega A continuam pendentes de revisão
humana; não foram reescritas. B2 contém adapter, demo, UI e testes dessa camada.

## Experimentar sem serviços reais

Na branch feat/b2-interface: npm ci, npm run demo. Escolha Cliente Aurora,
crie um pedido e saia. Entre como Equipe Camaleão; abra esse pedido e escolha
Entregas e decisões. Escreva um conteúdo fictício e clique Apresentar versão.
Saia e entre como Cliente Aurora. No mesmo pedido, confira número da versão,
texto e SHA-256 e escolha Aprovar ou Pedir ajustes. Somente o ajuste pede uma
explicação livre. A equipe pode apresentar uma nova versão; a decisão anterior
permanece no histórico e não vale como aprovação da nova.

O histórico completo por pedido fica em Entregas e decisões. Histórico na
navegação principal continua mostrando criação/última atualização de pedidos.
Os estados recebido/em_triagem continuam pertencendo à triagem A. Não são
aprovação nem estado de produção. Esta entrega não implementa responsável,
prazo de produção, cancelamento ou geração automática.

A demo guarda apenas dados fictícios no navegador. Não tem autenticação segura,
RLS, horário confiável do servidor ou concorrência entre abas garantida; tudo
isso pertence ao contrato SQL e à homologação real. Não inserir dados reais.
Uploads/Storage T11 permanecem ausentes; conteúdo apresentado é somente texto.

## Contrato e falhas

Adapter revalida associação e papel, lê versões/decisões com filtro explícito
por organização/pedido e pagina o histórico. O banco continua sendo a autoridade.
RPC envia o ID estável do clique, ID/hash da versão e resultado; não envia ator,
papel, horário ou número de versão escolhido pelo navegador.
Erro 40001 pede revisar o conteúdo novo: recarrega versões, sem aprovar sozinho.
23505 informa decisão/envio conflitante e recarrega o histórico. Resposta perdida
preserva ID/payload na memória e permite confirmar novamente, inclusive reabrindo
a janela na mesma sessão. Recarregar a página perde essa memória: conferir o
histórico antes de iniciar outra operação. O banco impede sobrescrever a decisão.
Nenhum briefing/ajuste privado real é persistido em localStorage por esse retry.

Trocar sessão/organização limpa a janela e IDs pendentes; respostas atrasadas são
ignoradas. Envios bloqueiam fechamento e ações enquanto pendentes. Ao redesenhar
a janela, foco fica dentro do dialog. Conteúdo é texto, sem HTML ou links remotos.

## Verificação executada

- npm test / PGlite: 61 passaram, nove ignorados (concorrência exige servidor).
- PostgreSQL 17.11, container novo isolado e banco camaleao_test_b2: 70 passaram,
  zero falhas/ignorados, inclusive cinco casos A e quatro B multi-conexão.
- npm run build e npm run build:demo: passaram.
- Playwright com Chromium 153 alternativo: 12 passaram (seis A + seis B).
- Axe: zero violações nos casos examinados; revisão de screenshots desktop/celular.
- B navegador: apresentação/aprovação/hash/histórico, decisão antiga não herdada,
  ajuste móvel, conteúdo como texto, nenhuma requisição externa, conflito de
  versão, separação entre clientes, resposta perdida e resposta atrasada após logout.
- B adapter: escopo/papéis, argumentos RPC exatos, conflitos/retry e respostas inválidas.

Primeira repetição PostgreSQL com outro banco no mesmo cluster encontrou papéis
fixture já existentes. Reexecução foi feita num container novo; não se alterou
migração para ocultar colisões. Runner exige banco vazio e loopback. Auth SQL é
fixture; SDK é mock. Não são testes Supabase Auth/PostgREST reais nem n8n real.
CI desta mudança não foi consultada/confirmada nesta sessão (API GitHub bloqueada).

## Revisão e homologação

Revisar model/adapter → delivery-ui/main → demo → testes e evidências.
Código é autoral; builds e screenshots em artifacts são gerados e ignorados.
Sem novas dependências ou alterações no lockfile. Reverter frontend preserva
histórico SQL. Não descartar decisões para desfazer uma versão de interface.
Ainda precisam de homologação C: Auth/JWT/sessões reais, RLS e RPC pela Data API,
quotas, migração/advisors revisados, backup/restauração e integração n8n restrita.
T11 depende de Storage privado/autorização real; não há upload demonstrado.
Não houve SQL remoto, contas/segredos, n8n ativo, VPS/DNS ou publicação.
