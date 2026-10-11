# Banco da entrega A

Migração **preparada, não aplicada a um projeto remoto**. Gerada com
`npx --yes --package supabase@2.120.0 supabase migration new portal_delivery_a`.
O banco é aditivo: três tabelas públicas com RLS, fila/eventos no schema
`camaleao_private`, sem alteração de Auth, Storage ou objetos Radar existentes.

## Operação do cliente

Frontend usa somente a chave publicável e uma sessão Supabase Auth autenticada.
Não há cadastro público no portal. As associações são administradas por operador
autorizado, fora da interface cliente; `user_metadata` não concede acesso.

`public.camaleao_create_request(p_organization_id uuid, p_request_id uuid,
p_payload jsonb)` recebe um identificador de envio estável, retorna um objeto de
`camaleao_requests`, grava pedido/fila/evento na mesma transação e aceita reenvio
igual. O identificador é único por organização. Conteúdo ou autor diferente
gera conflito `23505`; não muda o pedido existente. Limite: 20 novos pedidos
por organização em 24 horas, serializado pelo bloqueio da organização.

Payload fechado:

| Campo | Regra |
| --- | --- |
| category | `peca_social`, `campanha`, `site`, `automacao` |
| goal | Texto obrigatório, 1–120 caracteres após trim |
| context | Texto obrigatório, 10–2000 caracteres após trim |
| channel / format | Texto opcional até 80 caracteres; vazio vira NULL |
| desired_deadline | Data `YYYY-MM-DD` válida ou NULL; não representa SLA |
| urgency | `normal` ou `urgente`; padrão `normal` |

Papéis, status, organização e campos desconhecidos dentro do payload são
recusados. Organização vem do argumento e exige associação ativa no banco.
Entrada total limitada a 16000 bytes. Os erros não repetem conteúdo do pedido.
SQL limita caracteres Unicode; a interface usa limite conservador UTF-16.

Clientes podem ler organizações/pedidos de suas associações ativas e apenas
suas próprias associações. Não possuem INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES.
Operador também precisa de associação explícita por organização.
RLS e criação consultam expiração do JWT e a sessão atual em `auth.sessions`.
A assinatura é validada pelo gateway Supabase, nunca por um JWT fornecido
diretamente a uma conexão de banco do cliente. Revogar associação ou excluir
a sessão bloqueia novas operações. Estes checks não apagam dados já vistos.

## Operação interna n8n

`camaleao_worker` é uma capacidade **NOLOGIN**, sem senha, sem BYPASSRLS,
sem acesso direto às tabelas. Somente duas funções privadas são executáveis:

| Função | Contrato |
| --- | --- |
| `claim_jobs(p_limit integer default 10)` | Lote 1–10; claim com SKIP LOCKED, lease de 5 minutos, máximo 3 tentativas; retorna id do job, request_id, organização, token e campos de briefing |
| `finish_job(p_job_id uuid, p_lease_token uuid, p_outcome text, p_error_code text default null)` | Valida token/lease, conclui job e status/evento na mesma transação; retorno sem briefing ou token |

Resultado `success` muda somente `recebido` para `em_triagem`, incrementa versão
e define fila pela categoria. Repetir o mesmo sucesso/token é idempotente.
`validation_error` + `INVALID_REQUEST` termina sem repetir.
`transient_error` aceita apenas `DB_UNAVAILABLE`, `NETWORK_TIMEOUT` ou
`WORKER_INTERRUPTED`, com atrasos 30/60 segundos; a terceira tentativa falha.
Lease vencido permite nova tentativa com novo token; após três claims falha.
Um worker antigo não confirma o trabalho reivindicado por outro worker.
Não há promessa de exactly-once nem reprocessamento de efeito externo.

Nenhuma credencial está provisionada nesta entrega. Na homologação C, preparar
login exclusivo com associação a essa capacidade e conferir TLS/pooler,
privilégios efetivos e rotação. Não reutilizar credencial WhatsApp, `postgres`
ou service_role; nunca inserir senha na migração/GitHub.
Não expor o schema privado pela Data API ou o editor n8n a clientes.

## Privilégio e revisão

A função pública é SECURITY INVOKER. Os núcleos privilegiados ficam no schema
privado, com `search_path=pg_catalog`, nomes completos, sem SQL dinâmico e
EXECUTE revogado de PUBLIC/anon. Criar pedido tem autorização interna porque
o núcleo proprietário passa por cima de RLS. Worker exige capacidade dedicada.
As tabelas privadas também têm RLS e nenhum grant direto a cliente/worker.

Antes de aplicar: auditar o projeto existente, privilégios padrões/Auth/cotas,
confirmar que os nomes/schema/papel não existem, executar advisors numa cópia
isolada e revisar funções com privilégio. Esta migração falha em colisão de
nomes; não substitui silenciosamente objetos existentes.
Não foi executado `supabase db advisors` nesta sessão: a stack Docker completa
não estava disponível. Os testes locais verificam grants, RLS e constraints;
não substituem advisors nem homologação Supabase/PostgREST reais.

## Testes sem tocar a produção

`node --test tests/db.test.mjs` aplica SQL em PGlite efêmero (PostgreSQL WASM)
com contrato Auth fictício. Testa RLS, rejeição de campos, duplicatas, quota,
falha/rollback, revogação de acesso e recuperação de jobs. Cinco casos de
concorrência multi-conexão são pulados neste modo: WASM não prova essa fronteira.

A CI usa PostgreSQL 17 descartável e `DB_TEST_URL` loopback com nome
`camaleao_test_*`, habilitando os cinco casos multi-conexão. O runner recusa
hosts externos, outros nomes, query parameters e banco já preenchido. Não
imprime senha/URL nem remove dados de um banco existente.

`local-fixtures/auth-contract.sql` e `seed.sql` são exclusivamente locais:
duas organizações, dois clientes e operador fictícios. **Não são migrações**,
não geram contas reais e não devem ser executados no SQL Editor Supabase.
Auth real, assinatura/renovação de JWT, HTTP PostgREST, pooler/n8n e efeitos em
um projeto compartilhado continuam a exigir homologação C.

Referências verificadas em 11/10/2026: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[funções](https://supabase.com/docs/guides/database/functions),
[changelog](https://supabase.com/changelog).
