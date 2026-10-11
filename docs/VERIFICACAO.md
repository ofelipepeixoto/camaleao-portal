# Verificação da entrega A

11/10/2026 UTC. Implementação preparada em camadas dependentes; revisão humana,
merge e homologação de serviços continuam distintos dos resultados abaixo.

## Correção do contrato de data na PR #4

11/10/2026 UTC, após o commit `34ed29e`. Antes da correção, a consulta gerada
foi executada em PostgreSQL 17.11 local com `pg`: prazo `2026-10-20` chegou como
`Date`, e também foi testado após serialização ISO. Nos dois caminhos o Code
embutido produziu `INVALID_REQUEST` e a função de conclusão gravou job `failed`.
Isso reproduz o contrato de transporte; não é uma execução do engine n8n.

A projeção do claim agora usa
`to_char(desired_deadline::timestamp without time zone, 'YYYY-MM-DD')`, mantendo
`null`. O cast evita mudança de dia por fuso; `to_char(date, ...)` sozinho mudou
`2011-12-30` para `2011-12-31` em `Pacific/Apia` na reprodução local. A fixture
passa a conter um prazo preenchido e outro nulo. JSONs regenerados pelo gerador.
Nenhuma migração, grant, RLS ou regra de produto foi alterada.

| Verificação desta correção | Resultado local |
| --- | --- |
| Instalação limpa (`npm ci`, Node 24.19.0) | Aprovada, lockfile preservado |
| `npm test` / PGlite | 70 aprovados; cinco casos multi-conexão ignorados |
| `npm test` / PostgreSQL 17.11 descartável | 75 aprovados; zero ignorados; processo Node com `TZ=Pacific/Kiritimati` |
| Regressão SQL → driver → Code → conclusão | 20 combinações, dez prazos por combinação; aprovadas nos dois motores |
| Regressão com Node em `TZ=America/Los_Angeles` / PGlite | 20 combinações aprovadas |
| `npm run build` e `npm run build:demo` | Aprovados |
| Playwright / Chromium 154.0.8037.57 do ambiente | Seis aprovados, incluindo axe |
| Gerador `--check`, manifesto público e `git diff --check` | Aprovados |
| `npm audit --audit-level=high` | Zero vulnerabilidades reportadas |

A matriz combina cinco fusos SQL (UTC, São Paulo, Los Angeles, Kiritimati e
Apia), dois `DateStyle` e linhas diretas/serializadas em JSON. Cobre `null`, prazo
usual, bissexto secular, século não bissexto, virada do ano, anos 0001/9999 e
transições de calendário. Confere OID texto, valor exato, job `completed`, pedido
`em_triagem`, uma tentativa, evento único e ausência de novo claim. O teste novo
falhou no código anterior com OID 1082 (`date`) no lugar de 25 (`text`).

Os 75 testes Node incluem os 20 cenários novos, 14 testes de workflow e os demais
contratos existentes. Os seis casos de navegador são adicionais; execuções em
motores/fusos distintos se sobrepõem. PostgreSQL real aqui é um serviço local
descartável com Auth fictício. A primeira tentativa de suíte reutilizou papéis
da reprodução anterior e falhou no setup; a execução aprovada usou cluster novo.
Importação e execução real no engine n8n continuam não realizadas. A CI do novo
SHA deve ser consultada na PR; os resultados históricos abaixo não a substituem.

## Execuções locais confirmadas

| Verificação | Resultado |
| --- | --- |
| npm test | 49 passaram, 5 ignorados específicos de PostgreSQL multi-conexão |
| SQL PGlite 0.5.8 | 19 passaram, RLS/grants/RPC/transações executados; Auth é fixture local |
| Contratos gateway/validação | 17 passaram, SDK simulado e entrada validada |
| Workflow n8n / JS embutido | 13 passaram, JSON reproduzido; não importado na instância |
| TypeScript e build real/desconectado | Aprovados; sem configuração, portal informa preparação |
| Build demo | Aprovado, sinalização fictícia explícita, sem conexão remota |
| Playwright | 6 passaram em Chromium 153; desktop 1440px e celular 390px |
| axe nos casos de navegador | Zero violações detectadas nas telas/formulário examinados |
| npm audit | Zero vulnerabilidades reportadas nessa consulta, dev e produção incluídos |

Os totais não devem ser somados novamente: os 19+17+13 compõem os 49 testes
Node. Mais seis casos de navegador resultam em 55 casos locais aprovados.
Os cinco ignorados localmente passaram posteriormente no PostgreSQL real da CI.
Os testes locais e remotos se sobrepõem; não representam 115 testes diferentes.

## Evidência e limites

- RLS recusou leitura/escrita de outra organização, mudança de status/papel,
  TRUNCATE, acesso ao worker e elevação por user_metadata.
- Revogar associação/sessão e expirar claims bloqueou leitura/criação no contrato
  Auth local. Não foi testada assinatura real de JWT, Auth ou PostgREST em nuvem.
- Falha injetada durante criação ou conclusão fez rollback. Replay igual produziu
  um pedido; payload diferente gerou conflito. Quota de 20/24h foi aplicada.
- Lease vencido e token antigo não puderam concluir; retomada renovou token;
  três tentativas esgotadas preservaram o pedido. Validação não foi repetida.
- Navegador testou pedido/detalhes/filtros, persistência fictícia, logout, duas
  identidades fictícias, equipe por organização, foco/teclado e largura móvel.
- Contexto com HTML malicioso apareceu literalmente, sem criar imagem/script.
  Demo não fez requisições externas. Isso não comprova sessão real ou RLS da nuvem.
- Autorrevisão e revisão independente de segurança/SQL realizadas. Não são
  aprovação humana, teste de invasão ou certificação de conformidade.
- Scanner do manifesto é limitado a padrões conhecidos, com revisão independente
  do conteúdo público. Não é prova de ausência de qualquer tipo de segredo.

O download padrão de Chromium no ambiente local foi bloqueado pelo acesso de
rede. Usamos binário temporário @sparticuz/chromium153, sem alterar produção nem
desabilitar segurança web. CI usa o Chromium correspondente ao Playwright1.64.0.

## Concorrência no PostgreSQL real

CI configura PostgreSQL 17.11 descartável, banco vazio camaleao_test_ci, conexões
independentes e senha fictícia usada apenas pelo service local do job.
Cinco testes: replay simultâneo, claims sem duplicidade, dois autores com mesma
chave, conteúdo diferente simultâneo e limite diário sob duas submissões.
Execução confirmada: [run 38110486740](https://github.com/ofelipepeixoto/camaleao-portal/actions/runs/38110486740),
commit `cd49eecd80e421cc8415e399040f2398bd4bb82c`, tentativa 1.

| Evidência remota | Resultado |
| --- | --- |
| Job banco-e-contratos 114384831137 | 54 Node aprovados, zero falhas e zero ignorados |
| SQL | PostgreSQL 17.11, conexões independentes; cinco casos concorrentes aprovados |
| Job interface 114384831286 | Seis casos Playwright aprovados |
| Builds | Real/desconectado e demo aprovados |
| npm audit | Zero vulnerabilidades reportadas |
| Scanner do manifesto | 42 arquivos examinados, sem padrões de segredo conhecidos |

Total dessa execução: 60 casos aprovados (54 Node + seis navegador). Logs dos
dois jobs foram lidos, além do status geral. A CI usa Auth de contrato e SDK
simulado nos testes de adapter; não conecta aos projetos Supabase existentes.
As PRs #1, #2 e #3 também tiveram sua CI aprovada para suas respectivas camadas.
Este registro documenta o commit de código citado; commits posteriores de
documentação devem consultar seu próprio check, sem herdar aprovação por suposição.

## Pendências concretas

Supabase escolhido e quotas/Auth compartilhados; migração/advisors remotos;
contas por convite/associações; chave publicável do frontend; credencial n8n
restrita; importação e execução manual real; backup/restauração; acesso/capacidade
VPS; domínio/HTTPS; homologação e publicação. Nada disso foi modificado em A.
Uploads, versões e decisões de aprovação pertencem à entrega B.

## Limitação do envio incerto

O navegador preserva ID e payload ao tentar novamente ou reabrir o formulário,
enquanto a mesma sessão/página está viva. Recarregar fecha esse contexto: conferir
a lista antes de criar outro pedido. Não guardar briefing privado em localStorage
na aplicação real. Não prometemos exactly-once entre recargas/dispositivos.
