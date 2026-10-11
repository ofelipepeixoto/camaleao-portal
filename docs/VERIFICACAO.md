# Verificação da entrega A

11/10/2026 UTC. Implementação preparada em camadas dependentes; revisão humana,
merge e homologação de serviços continuam distintos dos resultados abaixo.

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
Os cinco ignorados só contam como aprovados após CI/PostgreSQL real.

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
Consultar o resultado do commit/PR; preparar CI não é afirmar execução aprovada.

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
