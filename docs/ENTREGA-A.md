# Entrega A — pedido completo

Implementação iniciada em 11/10/2026, conforme plano da PR #6 de
ofelipepeixoto/radar-n8n-projetos. O pedido atual autoriza repositório público
separado: camaleao-portal. Datas antigas do plano não são prazo ou agendamento.

## Resultado

Cliente convidado entra, seleciona sua organização, envia um pedido guiado e
recebe protocolo. Pode acompanhar seus 100 pedidos mais recentes, filtrar e
consultar detalhes. A equipe consulta organizações com vínculo explícito.
Histórico inicial mostra criação e última atualização; não é o histórico completo
de decisões. Nenhuma entrega é gerada ou aprovada automaticamente.

Categorias: peça social, campanha, site e automação. Objetivo guiado, canal e
formato opcionais, contexto de 10–2.000 caracteres, prazo desejado e urgência.
Prazo desejado não é SLA; a equipe combina o compromisso e a prioridade.

## Fronteiras implementadas

- Supabase Auth no cliente real, somente login com email/senha; sem signup.
- Associação ativa usuário/organização/papel mantida no banco pela administração.
- SELECT sob RLS; cliente sem escrita direta, TRUNCATE, acesso à fila ou ao worker.
- RPC de criação autoriza sessão atual e associação, valida payload fechado,
  normaliza campos e grava pedido/job/evento em transação.
- ID por envio e organização; mesmo conteúdo retorna o existente, diferença
  gera conflito. Lock por organização serializa dedup e quota de 20 novos pedidos
  em janela de 24 horas; replay não consome quota extra.
- Fila privada: lote 1–10, lease de 5 minutos, token renovado na retomada, três
  tentativas máximas. Apenas erros transitórios permitidos são repetidos com atraso.
- n8n fixture sem I/O e workflow banco com db_enabled=false. Ativação independente
  não é necessária para executar manualmente, mas habilitar banco requer homologação.
- Resultado recebido/em_triagem com fila sugerida e revisão humana; não significa
  produção do conteúdo. Banco calcula fila a partir da categoria, sem confiar na UI.
- UI em português, celular/teclado, conteúdo renderizado como texto, dados antigos
  retirados em saída/erro de acesso e respostas atrasadas descartadas por sessão.
- Poll de leitura a cada 30 segundos com tela visível e sem formulário aberto;
  não executa n8n. Revogação não apaga instantaneamente texto já visto pelo usuário.

## O que não pertence à entrega A

Upload, versões de entrega, aprovar/pedir ajustes, mensagens, pagamentos e IA
generativa são etapas seguintes. Nenhum novo projeto Supabase, banco remoto,
conta Auth, alteração de SMTP, serviço VPS, DNS ou publicação foi executado em A.

## Aceite por evidência

| Caso | Evidência pretendida |
| --- | --- |
| Pedido válido, limites e rollback | SQL executado em motor PostgreSQL isolado |
| Repetição / payload diferente | SQL e testes de contrato da API |
| Dois clientes e tentativa de elevar papel | RLS/grants com identidades/claims fictícios distintos |
| Concorrência, quota e claim | Conexões independentes PostgreSQL 17 no CI |
| Sessão/associação revogadas | SQL com auth.sessions fixture e gateway mock |
| Fila preservada / lease vencido | SQL de retomada, limite e token antigo recusado |
| Celular, foco, formulário, XSS e logout | Playwright + axe; demo sinalizada |
| Importação n8n / Auth / PostgREST reais | Homologação C, ainda pendente |

Resultados efetivamente executados ficam em VERIFICACAO.md; esta tabela define
o método e não declara aprovação antecipada. Aprovações T06–08 e anexos T11 do
plano original serão testados na entrega B quando implementados.

## Revisão pequena

1. Dados, autorização e fila: migração, fixtures e testes SQL.
2. Adapter Supabase: modelo, gateway, validação e testes de contrato.
3. Interface: login, formulário, consulta, estilos e testes de navegador.
4. n8n: regras, gerador, dois JSONs inativos e testes.

Branches encadeadas terão dependência/base declarada. PRs posteriores estão
preparadas para revisão; nenhum merge humano é presumido por CI verde.
Arquivos gerados: package-lock.json e JSONs n8n. Fontes e comandos documentados.
