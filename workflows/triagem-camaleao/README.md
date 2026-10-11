# Triagem manual do Portal Camaleão — entrega A

Dois workflows novos, separados e inativos. O teste fictício funciona sem banco,
WhatsApp, HTTP, IA ou credenciais. O segundo JSON prepara o processamento da fila
privada no banco, mas vem com `db_enabled = false`.

| Arquivo | Uso | Efeito padrão |
| --- | --- | --- |
| `triagem-camaleao.fixture.workflow.json` | Testar duas solicitações fictícias | Duas prévias; nenhuma gravação |
| `triagem-camaleao.database.workflow.json` | Homologar a fila manual após preparar banco/credencial | Rota de banco bloqueada |
| `rules.mjs` | Fonte autoral das regras, embutida nos Code nodes | Sem I/O ou dependências |
| `../../scripts/generate-workflow.mjs` | Reproduzir os JSONs | Somente arquivos locais |

## Testar agora, sem configuração

1. Baixe **triagem-camaleao.fixture.workflow.json**.
2. No n8n, crie um **workflow novo**. Abra o menu de três pontos e escolha
   **Import from file / Importar de arquivo**. Selecione o JSON.
3. Mantenha o workflow inativo, sem publicar. Não há agenda neste fluxo.
4. Clique em **Execute workflow / Executar workflow**.
5. Dê dois cliques no nó **Prévia da triagem sem gravação**. Abra **Output / Saída**
   e selecione **JSON**.

Resultado esperado: dois itens com `simulation: true`, `status: em_triagem`,
`requer_revisao_humana: true`, `storage_mutated: false` e `paid_ai: false`.
A primeira fila é `design_social`; a segunda, `automacoes`. Esse status é uma
prévia fictícia: não houve alteração no status de um pedido real.

Para ver os nós maiores, use o zoom do editor. Arraste o nó pelo título; para
ler o resultado, abra o nó com dois cliques. As posições dos nós já estão espaçadas.

## Contrato de entrada e saída

O worker recebe as linhas de `camaleao_private.claim_jobs`:

| Campo | Regra |
| --- | --- |
| `id`, `request_id`, `organization_id`, `lease_token` | UUIDs; `id` identifica o job |
| `attempts` | Inteiro entre 1 e 3 |
| `category` | `peca_social`, `campanha`, `site` ou `automacao` |
| `goal` | Texto, 1–120 caracteres depois de remover espaços das pontas |
| `channel`, `format` | Opcionais, até 80 caracteres; aceitam `null` |
| `context` | Texto obrigatório, 10–2.000 caracteres |
| `desired_deadline` | Data válida `YYYY-MM-DD` ou `null`; não promete prazo de entrega |
| `urgency` | `normal` ou `urgente`; não define prioridade da equipe |

O limite é de dez jobs por execução. Semântica de tamanho acompanha caracteres
Unicode do banco. Lote com ID de job repetido ou envelope sem token válido é
interrompido antes de concluir qualquer job; o lease permite recuperação posterior.
Uma regra de negócio inválida produz `validation_error` / `INVALID_REQUEST`;
esse job é concluído como falha de validação, sem retry transitório.

| Categoria | Fila sugerida |
| --- | --- |
| Peça social | `design_social` |
| Campanha | `estrategia_campanha` |
| Site | `web` |
| Automação | `automacoes` |

A triagem organiza a fila e exige revisão humana. Não cria arte, não aprova
entrega, não muda papéis e não atribui prioridade ou responsável automaticamente.
Os campos `role`, `status` e `prioridade` recebidos são ignorados. O banco decide
a transição permitida e aplica o mesmo mapeamento de fila em sua própria função.

A saída do Code node de banco preserva IDs, tentativa e token para concluir o job,
mas remove contexto, objetivo e demais textos. A saída fictícia também remove o
token. O resultado final do Postgres vem da função; não contém o briefing completo.

## Preparado para homologação, ainda sem conectar

Esta entrega não aplica a migração no Supabase remoto, não cria senha de banco,
não muda Auth e não importa ou executa workflows na instância real.

Quando a migração estiver revisada e a homologação autorizada:

1. Prepare um banco isolado com a migração deste repositório e pedidos fictícios.
2. Crie uma credencial **Postgres** no n8n para um login dedicado com somente o
   papel `camaleao_worker`. Esse papel não tem login próprio; um administrador
   cria o login protegido e concede o papel. Não use `postgres`, `service_role`
   nem a conta existente de notificações WhatsApp.
3. Informe host, porta, banco e usuário provenientes da conexão conferida para
   aquele ambiente. Configure **SSL Require** e deixe **Ignore SSL Issues / Ignorar
   erros SSL** desligado. Use poucas conexões (por exemplo, duas no piloto).
   Cadastre a senha somente na credencial protegida do n8n.
4. Importe **triagem-camaleao.database.workflow.json** como outro workflow novo,
   inativo. Selecione essa credencial nos dois nós Postgres:
   **Reivindicar lote com lease** e **Concluir job com token do lease**.
5. Em **Configuração manual**, mude somente `const db_enabled = false;` para
   `const db_enabled = true;`. Preserve `batch_limit = 10` e o gatilho manual.
6. Execute uma vez. Verifique o resultado de **Concluir job com token do lease**
   e consulte o pedido no portal: de `recebido` para `em_triagem`.
7. Execute novamente: um job concluído não deve ser reivindicado de novo.
   Fila vazia pode deixar o nó Postgres sem itens de saída; isso não é um erro.
8. Volte `db_enabled` para `false` ao encerrar a homologação e preserve o fluxo
   inativo. Não acrescente agenda nem publique nesta etapa.

Importar o segundo JSON não libera acesso ao banco. Antes de conectar a credencial,
a instância pode indicar que os nós Postgres estão incompletos. Use o primeiro
JSON para um teste que não depende de qualquer credencial.

## Falhas, repetição e privacidade

O banco faz o claim atômico e entrega um lease de cinco minutos com token novo.
A conclusão exige o token corrente e um lease ainda válido. Um worker antigo
não pode concluir uma nova tentativa. Estado do pedido, evento e confirmação
do job são gravados na mesma transação da função `finish_job`.

Não há `retryOnFail` no n8n nem loop automático. Se a conexão falhar ou o processo
parar depois do claim, a execução para. Na próxima execução manual, a fila pode
retomar o lease vencido dentro do teto de três tentativas. Erros transitórios
classificados pelo contrato têm atraso limitado; o workflow não transforma
qualquer erro em retry. Duplicidade de criação e conflitos de conteúdo pertencem
à operação transacional do banco, não à memória JavaScript. Não se promete
processamento exatamente uma vez.

Os JSONs desabilitam a retenção de dados de execuções concluídas, com erro e
manuais, além de impor timeout de execução de 60 segundos. Na homologação,
verifique essa configuração na versão instalada e o acesso dos operadores
à saída manual. A configuração não elimina logs externos da instância.
Não fixe dados com **Pin data**, não registre briefings ou tokens em console
e não exporte credenciais. O JSON público contém apenas exemplos inventados.

Pausa: mantenha o workflow inativo e `db_enabled = false`. Preserve pedidos e
fila; nenhum volume ou tabela precisa ser apagado. Um lease em andamento vence
no banco; retomar exige outra execução manual válida.

## Verificações locais

```sh
node scripts/generate-workflow.mjs --check
node --test tests/workflow.test.mjs
```

Os testes executam o JavaScript embutido nos JSONs e verificam enumerações,
limites, datas, lote, duplicatas de job, tentativas, tokens e campos privados.
Também conferem o gate de banco, SQL parametrizado, conexões estruturais,
ausência de credenciais e reprodutibilidade dos arquivos gerados.
Esses testes não executam o engine n8n ou sua conexão Postgres. Testes do banco
estão separados no repositório. Importação, configuração de credencial e execução
real no n8n continuam pendentes de homologação.

## Origem e compatibilidade

Adaptamos a ideia de validação e organização do workflow autoral
`workflows/01-triagem-solicitacoes` do `ofelipepeixoto/radar-n8n-projetos`, consultado
em `main` em 11/10/2026 (blob `476f2f1c2553820483b958b28b79e621dad4b311`).
As regras aqui foram reimplementadas para o contrato persistente do portal;
o workflow original não foi alterado nem incorporado com suas categorias antigas.

Tipos e parâmetros conferidos no código oficial da tag `n8n@2.41.6`:
Manual Trigger 1, Code 2, If 2.2 e Postgres 2.6. Essa é a versão histórica
informada para a VPS, sem nova confirmação da versão instalada nesta entrega.
As consultas usam `options.queryReplacement` com array de valores e
`queryBatching: independently`. Não interpolam texto de pedido no SQL.

Fontes oficiais consultadas em 11/10/2026:

- [Manual Trigger](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.manualworkflowtrigger/)
- [Code](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.code/)
- [Postgres e parâmetros](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.postgres/)
- [Versões Postgres na tag 2.41.6](https://github.com/n8n-io/n8n/blob/n8n%402.41.6/packages/nodes-base/nodes/Postgres/v2/actions/versionDescription.ts)
- [Execute Query na tag 2.41.6](https://github.com/n8n-io/n8n/blob/n8n%402.41.6/packages/nodes-base/nodes/Postgres/v2/actions/database/executeQuery.operation.ts)
- [If na tag 2.41.6](https://github.com/n8n-io/n8n/blob/n8n%402.41.6/packages/nodes-base/nodes/If/V2/IfV2.node.ts)

O código autoral do portal não relicencia o runtime n8n. Sua licença e seus
componentes continuam sendo responsabilidade dos respectivos autores.
