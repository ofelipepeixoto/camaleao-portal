import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { triageRows, fixtures } from '../workflows/triagem-camaleao/rules.mjs';

const directory = fileURLToPath(new URL('../workflows/triagem-camaleao/', import.meta.url));
const settings = {
  executionOrder: 'v1', timezone: 'America/Sao_Paulo', executionTimeout: 60,
  saveDataErrorExecution: 'none', saveDataSuccessExecution: 'none',
  saveManualExecutions: false, saveExecutionProgress: false,
};
const manual = () => ({ parameters: {}, id: 'camaleao-manual', name: 'Iniciar teste manual', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [180, 280] });
const code = (id, name, jsCode, position) => ({ parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode }, id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position });
const postgres = (id, name, query, queryReplacement, position) => ({
  parameters: { resource: 'database', operation: 'executeQuery', query,
    options: { queryReplacement, queryBatching: 'independently', connectionTimeout: 10, delayClosingIdleConnection: 0, replaceEmptyStrings: false } },
  id, name, type: 'n8n-nodes-base.postgres', typeVersion: 2.6, position,
  retryOnFail: false, onError: 'stopWorkflow',
});
const edge = (node) => ({ node, type: 'main', index: 0 });
const connection = (node) => ({ main: [[edge(node)]] });
const wrap = (name, nodes, connections) => ({ name, nodes, connections, settings, active: false, tags: [] });
const rules = `${triageRows.toString()}\n`;

export function buildWorkflows() {
  const fixture = wrap('Portal Camaleão A — triagem fictícia, sem banco', [
    manual(),
    code('camaleao-fixtures', 'Dois pedidos fictícios', `const rows = ${JSON.stringify(fixtures, null, 2)};\nreturn rows.map(json => ({ json }));`, [460, 280]),
    code('camaleao-triage-fixture', 'Prévia da triagem sem gravação', `${rules}return triageRows($input.all().map(item => item.json), true);`, [760, 280]),
  ], {
    'Iniciar teste manual': connection('Dois pedidos fictícios'),
    'Dois pedidos fictícios': connection('Prévia da triagem sem gravação'),
  });
  const database = wrap('Portal Camaleão A — fila manual, banco bloqueado', [
    manual(),
    code('camaleao-config', 'Configuração manual', 'const db_enabled = false;\nconst batch_limit = 10;\nreturn [{ json: { db_enabled, batch_limit } }];', [410, 280]),
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
          conditions: [{ id: 'camaleao-db-gate', leftValue: '={{ $json.db_enabled === true }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
          combinator: 'and',
        }, options: {},
      },
      id: 'camaleao-if', name: 'Banco liberado manualmente?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [660, 280],
    },
    // SQL date must cross the driver as text, without timezone or DateStyle conversion.
    postgres('camaleao-claim', 'Reivindicar lote com lease', `SELECT id, request_id, organization_id, lease_token, attempts,
  category, goal, channel, format, context,
  to_char(desired_deadline::timestamp without time zone, 'YYYY-MM-DD') AS desired_deadline, urgency
FROM camaleao_private.claim_jobs($1::integer);`, '={{ [$json.batch_limit] }}', [930, 180]),
    code('camaleao-triage-db', 'Validar e sugerir fila', `${rules}return triageRows($input.all().map(item => item.json));`, [1200, 180]),
    postgres('camaleao-finish', 'Concluir job com token do lease', 'SELECT camaleao_private.finish_job($1::uuid, $2::uuid, $3::text, $4::text) AS result;', '={{ [$json.id, $json.lease_token, $json.outcome, $json.error_code] }}', [1470, 180]),
    code('camaleao-blocked', 'Banco permanece bloqueado', "return [{ json: { status: 'DB_DISABLED', storage_mutated: false, paid_ai: false, mensagem: 'Teste manual bloqueado: o banco não foi consultado. Use a triagem fictícia para testar agora.' } }];", [930, 420]),
  ], {
    'Iniciar teste manual': connection('Configuração manual'),
    'Configuração manual': connection('Banco liberado manualmente?'),
    'Banco liberado manualmente?': { main: [[edge('Reivindicar lote com lease')], [edge('Banco permanece bloqueado')]] },
    'Reivindicar lote com lease': connection('Validar e sugerir fila'),
    'Validar e sugerir fila': connection('Concluir job com token do lease'),
  });
  return { 'triagem-camaleao.fixture.workflow.json': fixture, 'triagem-camaleao.database.workflow.json': database };
}

export async function generateWorkflows(check = false) {
  await mkdir(directory, { recursive: true });
  for (const [name, workflow] of Object.entries(buildWorkflows())) {
    const path = `${directory}${name}`;
    const content = `${JSON.stringify(workflow, null, 2)}\n`;
    if (check) {
      if (await readFile(path, 'utf8') !== content) throw new Error(`WORKFLOW_OUT_OF_DATE: ${name}`);
    } else await writeFile(path, content, 'utf8');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await generateWorkflows(process.argv.includes('--check'));
  console.log(process.argv.includes('--check') ? 'Workflows reproduzíveis: OK' : 'Dois workflows manuais inativos gerados.');
}
