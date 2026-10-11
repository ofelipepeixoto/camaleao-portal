import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildWorkflows, generateWorkflows } from '../scripts/generate-workflow.mjs';
import { fixtures, triageRows } from '../workflows/triagem-camaleao/rules.mjs';

const jsons = buildWorkflows();
const clone = (value) => structuredClone(value);
function runCode(node, rows = []) {
  return new Function('$input', node.parameters.jsCode)({ all: () => rows.map(json => ({ json })) });
}
test('os JSONs gerados correspondem às fontes revisáveis', async () => {
  await generateWorkflows(true);
  for (const [name, expected] of Object.entries(jsons)) {
    const path = new URL(`../workflows/triagem-camaleao/${name}`, import.meta.url);
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), expected);
  }
});
test('cada workflow é manual, inativo e tem conexões válidas', () => {
  for (const workflow of Object.values(jsons)) {
    assert.equal(workflow.active, false);
    assert.equal(workflow.nodes.filter(node => node.type === 'n8n-nodes-base.manualTrigger').length, 1);
    const names = new Set(workflow.nodes.map(node => node.name));
    assert.equal(names.size, workflow.nodes.length);
    assert.equal(new Set(workflow.nodes.map(node => node.id)).size, workflow.nodes.length);
    for (const [source, branches] of Object.entries(workflow.connections)) {
      assert.ok(names.has(source));
      for (const branch of branches.main) for (const destination of branch) assert.ok(names.has(destination.node));
    }
    for (const node of workflow.nodes) {
      assert.ok(['n8n-nodes-base.manualTrigger', 'n8n-nodes-base.code', 'n8n-nodes-base.postgres', 'n8n-nodes-base.if'].includes(node.type));
      assert.equal(Object.hasOwn(node, 'credentials'), false);
    }
    assert.equal(Object.hasOwn(workflow, 'pinData'), false);
    assert.equal(workflow.settings.saveDataErrorExecution, 'none');
    assert.equal(workflow.settings.saveDataSuccessExecution, 'none');
    assert.equal(workflow.settings.saveManualExecutions, false);
    assert.equal(workflow.settings.executionTimeout, 60);
  }
});
test('fixture executa o JavaScript embutido e devolve duas prévias fictícias', () => {
  const workflow = jsons['triagem-camaleao.fixture.workflow.json'];
  assert.ok(workflow.nodes.every(node => node.type !== 'n8n-nodes-base.postgres'));
  const fixtureRows = runCode(workflow.nodes[1]).map(item => item.json);
  assert.deepEqual(fixtureRows.map(row => row.desired_deadline), ['2026-10-20', null]);
  const outputs = runCode(workflow.nodes[2], fixtureRows);
  assert.equal(outputs.length, 2);
  assert.deepEqual(outputs.map(item => item.json.fila_sugerida), ['design_social', 'automacoes']);
  for (const output of outputs) {
    assert.equal(output.json.status, 'em_triagem');
    assert.equal(output.json.simulation, true);
    assert.equal(output.json.storage_mutated, false);
    assert.equal(output.json.paid_ai, false);
    assert.equal(output.json.requer_revisao_humana, true);
    assert.equal(Object.hasOwn(output.json, 'lease_token'), false);
    assert.equal(Object.hasOwn(output.json, 'context'), false);
  }
});
test('a configuração de banco vem bloqueada e a saída falsa informa ausência de gravação', () => {
  const workflow = jsons['triagem-camaleao.database.workflow.json'];
  const configuration = runCode(workflow.nodes.find(node => node.name === 'Configuração manual'));
  assert.equal(configuration[0].json.db_enabled, false);
  assert.equal(configuration[0].json.batch_limit, 10);
  const gate = workflow.nodes.find(node => node.type === 'n8n-nodes-base.if');
  assert.equal(gate.parameters.conditions.options.typeValidation, 'strict');
  assert.equal(gate.parameters.conditions.conditions[0].leftValue, '={{ $json.db_enabled === true }}');
  assert.equal(workflow.connections[gate.name].main[1][0].node, 'Banco permanece bloqueado');
  const result = runCode(workflow.nodes.find(node => node.name === 'Banco permanece bloqueado'));
  assert.equal(result[0].json.status, 'DB_DISABLED');
  assert.equal(result[0].json.storage_mutated, false);
});
test('SQL usa somente funções restritas e parâmetros, sem interpolar conteúdo', () => {
  const nodes = jsons['triagem-camaleao.database.workflow.json'].nodes.filter(node => node.type === 'n8n-nodes-base.postgres');
  assert.equal(nodes.length, 2);
  assert.match(nodes[0].parameters.query, /FROM camaleao_private\.claim_jobs\(\$1::integer\);$/);
  assert.equal(nodes[0].parameters.options.queryReplacement, '={{ [$json.batch_limit] }}');
  assert.equal(nodes[1].parameters.query, 'SELECT camaleao_private.finish_job($1::uuid, $2::uuid, $3::text, $4::text) AS result;');
  assert.equal(nodes[1].parameters.options.queryReplacement, '={{ [$json.id, $json.lease_token, $json.outcome, $json.error_code] }}');
  for (const node of nodes) {
    assert.equal(node.retryOnFail, false);
    assert.equal(node.onError, 'stopWorkflow');
    assert.equal(node.parameters.query.includes('{{'), false);
    assert.equal(node.parameters.options.queryBatching, 'independently');
    assert.equal(node.parameters.options.connectionTimeout, 10);
    assert.ok(node.parameters.options.queryReplacement.startsWith('={{ ['));
  }
});
test('o worker mantém o token para a conclusão e remove o conteúdo do pedido', () => {
  const workflow = jsons['triagem-camaleao.database.workflow.json'];
  const node = workflow.nodes.find(item => item.name === 'Validar e sugerir fila');
  const results = runCode(node, fixtures);
  for (let index = 0; index < results.length; index++) {
    assert.equal(results[index].json.lease_token, fixtures[index].lease_token);
    assert.equal(results[index].json.outcome, 'success');
    assert.equal(results[index].json.error_code, null);
    for (const field of ['goal', 'context', 'channel', 'format', 'desired_deadline', 'urgency']) assert.equal(Object.hasOwn(results[index].json, field), false);
    assert.deepEqual(results[index].pairedItem, { item: index });
  }
});
test('todas as categorias sugerem a fila esperada e mantêm revisão humana', () => {
  const queues = { peca_social: 'design_social', campanha: 'estrategia_campanha', site: 'web', automacao: 'automacoes' };
  for (const [category, queue] of Object.entries(queues)) {
    const row = { ...fixtures[0], category };
    const result = triageRows([row])[0].json;
    assert.equal(result.fila_sugerida, queue);
    assert.equal(result.requer_revisao_humana, true);
  }
});
test('validação inválida não retorna sucesso nem pede retry transitório', () => {
  const invalidCases = [
    ['category', 'outro'], ['goal', ''], ['goal', 'g'.repeat(121)],
    ['channel', 'c'.repeat(81)], ['format', true], ['context', 'curto'],
    ['context', 'c'.repeat(2001)], ['urgency', 'alta'],
    ['desired_deadline', '2026-02-29'], ['desired_deadline', '0000-01-01'],
    ['desired_deadline', '2026-10-11T00:00:00Z'],
  ];
  for (const [field, value] of invalidCases) {
    const result = triageRows([{ ...fixtures[0], [field]: value }])[0].json;
    assert.equal(result.outcome, 'validation_error', field);
    assert.equal(result.error_code, 'INVALID_REQUEST', field);
    assert.equal(result.status, 'revisar_dados', field);
    assert.equal(result.fila_sugerida, null, field);
    assert.ok(result.problemas.includes(field));
  }
});
test('campos opcionais, texto Unicode e ano bissexto seguem o contrato SQL', () => {
  const row = { ...fixtures[0], channel: null, format: '', context: '😀'.repeat(2000), desired_deadline: '2028-02-29' };
  assert.equal(triageRows([row])[0].json.outcome, 'success');
});
test('a regra exige data civil: Date e ISO serializado continuam inválidos', () => {
  for (const desired_deadline of [null, '2026-10-20', '0001-01-01', '9999-12-31', '2000-02-29', '2100-02-28']) {
    assert.equal(triageRows([{ ...fixtures[0], desired_deadline }])[0].json.outcome, 'success');
  }
  for (const desired_deadline of [new Date('2026-10-20T00:00:00.000Z'),
    '2026-10-20T00:00:00.000Z', '2026-10-20T00:00:00+14:00', '2100-02-29']) {
    const result = triageRows([{ ...fixtures[0], desired_deadline }])[0].json;
    assert.equal(result.outcome, 'validation_error');
    assert.equal(result.error_code, 'INVALID_REQUEST');
    assert.deepEqual(result.problemas, ['desired_deadline']);
  }
});
test('status e papel recebidos são ignorados; cliente não define transição ou prioridade', () => {
  const row = { ...fixtures[0], status: 'aprovado', role: 'admin', prioridade: 'alta' };
  const result = triageRows([row])[0].json;
  assert.equal(result.status, 'em_triagem');
  assert.equal(Object.hasOwn(result, 'role'), false);
  assert.equal(Object.hasOwn(result, 'prioridade'), false);
});
test('envelope sem identidade ou token de lease para antes de concluir jobs', () => {
  for (const field of ['id', 'request_id', 'organization_id', 'lease_token']) {
    const row = clone(fixtures[0]);
    row[field] = 'invalido';
    assert.throws(() => triageRows([row]), /INVALID_JOB_ENVELOPE/);
  }
  assert.throws(() => triageRows([null]), /INVALID_JOB_ENVELOPE/);
  assert.throws(() => triageRows([[]]), /INVALID_JOB_ENVELOPE/);
});
test('lote repetido por job é recusado e tentativas fora de 1–3 são recusadas', () => {
  assert.throws(() => triageRows([fixtures[0], fixtures[0]]), /INVALID_JOB_ENVELOPE/);
  for (const attempts of [0, 4, '1', 1.5]) {
    assert.throws(() => triageRows([{ ...fixtures[0], attempts }]), /INVALID_JOB_ENVELOPE/);
  }
});
test('lotes maiores que dez são recusados e fila vazia não produz escrita', () => {
  assert.throws(() => triageRows(Array(11).fill(fixtures[0])), /INVALID_BATCH/);
  assert.throws(() => triageRows({}), /INVALID_BATCH/);
  assert.deepEqual(triageRows([]), []);
});
