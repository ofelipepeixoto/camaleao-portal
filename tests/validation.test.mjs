import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePayload } from '../src/validation.ts';

const payload = {
  category: 'peca_social', goal: 'divulgar_servico', channel: '', format: '',
  context: 'Um contexto fictício para o teste.', desiredDeadline: null, urgency: 'normal',
};

test('quatro categorias e opcionais vazios são aceitos', () => {
  for (const category of ['peca_social', 'campanha', 'site', 'automacao']) {
    assert.doesNotThrow(() => validatePayload({ ...payload, category }));
  }
  assert.doesNotThrow(() => validatePayload({ ...payload, urgency: 'urgente' }));
});

test('campos obrigatórios, tipos e limites não aceitam dados inválidos', () => {
  for (const [field, value] of [
    ['category', 'admin'], ['category', null], ['goal', ''], ['goal', '   '], ['goal', 'x'.repeat(121)],
    ['goal', 1], ['channel', 'x'.repeat(81)], ['channel', {}], ['format', 'x'.repeat(81)],
    ['format', false], ['context', 'curto'], ['context', ' '.repeat(10)], ['context', 'x'.repeat(2001)],
    ['context', null], ['urgency', 'alta'], ['urgency', null],
  ]) {
    assert.throws(() => validatePayload({ ...payload, [field]: value }), undefined, `${field}:${JSON.stringify(value)}`);
  }
});

test('datas inválidas ou com hora são recusadas antes de enviar', () => {
  for (const desiredDeadline of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-00-01',
    '2026-10-11T00:00:00Z', '0000-01-01', '2026-1-1', '', 20261011]) {
    assert.throws(() => validatePayload({ ...payload, desiredDeadline }), undefined, String(desiredDeadline));
  }
});

test('data válida e ano bissexto são aceitos sem mudança de timezone', () => {
  for (const desiredDeadline of ['2026-10-11', '2028-02-29', '2000-02-29', '9999-12-31']) {
    assert.doesNotThrow(() => validatePayload({ ...payload, desiredDeadline }));
  }
});

test('conteúdo textual não é reinterpretado ou executado pela validação', () => {
  const maliciousLooking = '<img src=x onerror=alert("fictional")> & <script>test</script>';
  const input = { ...payload, context: maliciousLooking };
  assert.doesNotThrow(() => validatePayload(input));
  assert.equal(input.context, maliciousLooking);
});
