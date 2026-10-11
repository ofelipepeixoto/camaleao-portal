// Regras autorais do Portal Camaleão; a fila persistente e as permissões são do banco.
// Esta função também é embutida pelo gerador no Code node, sem imports externos.
export function triageRows(rows, fixture = false) {
  if (!Array.isArray(rows) || rows.length > 10) throw new Error('INVALID_BATCH');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const queues = {
    peca_social: 'design_social', campanha: 'estrategia_campanha',
    site: 'web', automacao: 'automacoes',
  };
  const ids = new Set();
  // Sem um envelope válido, não usar nem devolver um lease arbitrário ao banco.
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)
      || !['id', 'request_id', 'organization_id', 'lease_token'].every((key) => typeof row[key] === 'string' && uuid.test(row[key]))
      || !Number.isInteger(row.attempts) || row.attempts < 1 || row.attempts > 3
      || ids.has(row.id)) throw new Error('INVALID_JOB_ENVELOPE');
    ids.add(row.id);
  }
  function text(value, minimum, maximum, optional = false) {
    if (optional && (value === null || value === undefined)) return true;
    if (typeof value !== 'string') return false;
    const size = Array.from(value.trim()).length;
    return size >= minimum && size <= maximum;
  }
  function date(value) {
    if (value === null || value === undefined) return true;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
  }
  return rows.map((row, index) => {
    const problems = [];
    if (!Object.hasOwn(queues, row.category)) problems.push('category');
    if (!text(row.goal, 1, 120)) problems.push('goal');
    if (!text(row.channel, 0, 80, true)) problems.push('channel');
    if (!text(row.format, 0, 80, true)) problems.push('format');
    if (!text(row.context, 10, 2000)) problems.push('context');
    if (!date(row.desired_deadline)) problems.push('desired_deadline');
    if (!['normal', 'urgente'].includes(row.urgency)) problems.push('urgency');
    const valid = problems.length === 0;
    const output = {
      id: row.id, request_id: row.request_id, organization_id: row.organization_id,
      attempts: row.attempts, category: row.category,
      outcome: valid ? 'success' : 'validation_error',
      error_code: valid ? null : 'INVALID_REQUEST',
      status: valid ? 'em_triagem' : 'revisar_dados',
      fila_sugerida: valid ? queues[row.category] : null,
      requer_revisao_humana: true,
      problemas: problems,
    };
    if (fixture) Object.assign(output, { simulation: true, storage_mutated: false, paid_ai: false });
    else output.lease_token = row.lease_token;
    return { json: output, pairedItem: { item: index } };
  });
}

export const fixtures = [
  {
    id: '71000000-0000-4000-8000-000000000001',
    request_id: '72000000-0000-4000-8000-000000000001',
    organization_id: '73000000-0000-4000-8000-000000000001',
    lease_token: '74000000-0000-4000-8000-000000000001', attempts: 1,
    category: 'peca_social', goal: 'Divulgar um serviço fictício',
    channel: 'Instagram', format: 'Post estático',
    context: 'Pedido fictício da organização A para verificar a fila de design.',
    desired_deadline: null, urgency: 'normal',
  },
  {
    id: '71000000-0000-4000-8000-000000000002',
    request_id: '72000000-0000-4000-8000-000000000002',
    organization_id: '73000000-0000-4000-8000-000000000002',
    lease_token: '74000000-0000-4000-8000-000000000002', attempts: 1,
    category: 'automacao', goal: 'Organizar solicitações fictícias',
    channel: null, format: null,
    context: 'Pedido fictício da organização B para verificar a fila de automações.',
    desired_deadline: null, urgency: 'urgente',
  },
];
