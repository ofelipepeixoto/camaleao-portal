import assert from 'node:assert/strict';
import test from 'node:test';
import { SupabaseGateway } from '../src/supabase-gateway.ts';

// SDK contract tests, not substitutes for database/RLS or remote Auth tests.
const actor = { id: '20000000-0000-4000-8000-000000000001', email: 'aurora@exemplo.test' };
const org = '10000000-0000-4000-8000-000000000001';
const foreignOrg = '10000000-0000-4000-8000-000000000002';
const requestId = '30000000-0000-4000-8000-000000000001';
const payload = {
  category: 'peca_social', goal: 'divulgar_servico', channel: 'instagram', format: 'post',
  context: 'Um contexto fictício de teste de contrato.', desiredDeadline: null, urgency: 'normal',
};
const row = {
  id: '40000000-0000-4000-8000-000000000001', protocol: 'CAM-FICTITIOUS',
  organization_id: org, created_by: actor.id, category: payload.category,
  goal: payload.goal, channel: payload.channel, format: payload.format, context: payload.context,
  desired_deadline: null, urgency: 'normal', status: 'recebido',
  created_at: '2026-10-11T00:00:00Z', updated_at: '2026-10-11T00:00:00Z',
};

function sdk(options = {}) {
  const calls = [];
  let authCallback;
  let unsubscribed = false;
  const client = {
    auth: {
      getUser: async () => {
        calls.push(['getUser']);
        return options.userResponse ?? { data: { user: actor }, error: null };
      },
      signInWithPassword: async (credentials) => {
        calls.push(['signIn', credentials]);
        return options.loginResponse ?? { data: { user: actor }, error: null };
      },
      signOut: async (settings) => {
        calls.push(['signOut', settings]);
        return settings?.scope === 'local' ? { error: null } : (options.logoutResponse ?? { error: null });
      },
      onAuthStateChange: (callback) => {
        authCallback = callback;
        return { data: { subscription: { unsubscribe: () => { unsubscribed = true; } } } };
      },
    },
    from: (table) => {
      calls.push(['from', table]);
      const result = table === 'camaleao_memberships'
        ? (options.membershipResponse ?? { data: [{ organization_id: org, role: 'client', camaleao_organizations: { name: 'Estúdio Aurora' } }], error: null })
        : (options.requestResponse ?? { data: [row], error: null });
      const chain = {
        select: (columns) => { calls.push(['select', table, columns]); return chain; },
        eq: (column, value) => { calls.push(['eq', table, column, value]); return chain; },
        order: (column, settings) => { calls.push(['order', table, column, settings]); return chain; },
        limit: (limit) => { calls.push(['limit', table, limit]); return chain; },
        then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
      };
      return chain;
    },
    rpc: async (name, args) => {
      calls.push(['rpc', name, args]);
      return options.rpcResponse ?? { data: row, error: null };
    },
  };
  return {
    gateway: new SupabaseGateway(client), calls,
    emit: (event, session) => authCallback(event, session),
    unsubscribed: () => unsubscribed,
  };
}

test('identidade vem de getUser verificado e falha não cria identidade fictícia', async () => {
  const good = sdk();
  assert.deepEqual(await good.gateway.init(), actor);
  const denied = sdk({ userResponse: { data: { user: null }, error: { status: 401 } } });
  assert.equal(await denied.gateway.init(), null);
  await assert.rejects(denied.gateway.memberships(), { code: 'access_denied' });
  await assert.rejects(denied.gateway.listRequests(org), { code: 'access_denied' });
  await assert.rejects(denied.gateway.createRequest(org, requestId, payload), { code: 'access_denied' });
  assert.equal(denied.calls.some(([name]) => name === 'from' || name === 'rpc'), false);
});

test('login não usa erro do servidor na mensagem nem retorna usuário na falha', async () => {
  const failing = sdk({ loginResponse: { data: { user: null }, error: { message: 'PRIVATE_SERVER_DETAIL' } } });
  await assert.rejects(failing.gateway.signIn('aurora@exemplo.test', 'fictional-only'), (error) => {
    assert.equal(error.code, 'login');
    assert.equal(error.message.includes('PRIVATE_SERVER_DETAIL'), false);
    return true;
  });
});

test('sessão notifica fora do callback bloqueado do SDK e unsubscribe é respeitado', async () => {
  const mock = sdk();
  const updates = [];
  const unsubscribe = mock.gateway.onSessionChanged((user) => updates.push(user));
  mock.emit('SIGNED_IN', { user: actor });
  assert.equal(updates.length, 0);
  await Promise.resolve();
  assert.deepEqual(updates, [actor]);
  mock.emit('SIGNED_OUT', null);
  await Promise.resolve();
  assert.deepEqual(updates, [actor, null]);
  unsubscribe();
  assert.equal(mock.unsubscribed(), true);
});

test('vínculos consultados são do ator e precisam estar ativos', async () => {
  const mock = sdk();
  assert.deepEqual(await mock.gateway.memberships(), [{ organizationId: org, organizationName: 'Estúdio Aurora', role: 'client' }]);
  assert.ok(mock.calls.some((call) => JSON.stringify(call) === JSON.stringify(['eq', 'camaleao_memberships', 'user_id', actor.id])));
  assert.ok(mock.calls.some((call) => JSON.stringify(call) === JSON.stringify(['eq', 'camaleao_memberships', 'active', true])));
});

test('organização removida ou externa não dispara consulta de pedidos', async () => {
  for (const settings of [{}, { membershipResponse: { data: [], error: null } }]) {
    const mock = sdk(settings);
    await assert.rejects(mock.gateway.listRequests(foreignOrg), { code: 'access_denied' });
    assert.equal(mock.calls.some(([name, table]) => name === 'from' && table === 'camaleao_requests'), false);
  }
});

test('listagem é filtrada por organização, limitada e ordenada no servidor', async () => {
  const mock = sdk();
  const rows = await mock.gateway.listRequests(org);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].organizationId, org);
  assert.equal(rows[0].context, payload.context);
  assert.ok(mock.calls.some((call) => JSON.stringify(call) === JSON.stringify(['eq', 'camaleao_requests', 'organization_id', org])));
  assert.ok(mock.calls.some((call) => JSON.stringify(call) === JSON.stringify(['limit', 'camaleao_requests', 100])));
  assert.ok(mock.calls.some((call) => JSON.stringify(call) === JSON.stringify(['order', 'camaleao_requests', 'created_at', { ascending: false }])));
});

test('criação usa RPC atômica e não envia papel, status ou organização de payload alterado', async () => {
  const mock = sdk();
  const saved = await mock.gateway.createRequest(org, requestId, { ...payload, status: 'aprovado', role: 'operator', organization_id: foreignOrg });
  assert.equal(saved.protocol, 'CAM-FICTITIOUS');
  const rpc = mock.calls.find(([name]) => name === 'rpc');
  assert.deepEqual(rpc, ['rpc', 'camaleao_create_request', {
    p_organization_id: org, p_request_id: requestId,
    p_payload: { category: payload.category, goal: payload.goal, channel: payload.channel, format: payload.format,
      context: payload.context, desired_deadline: null, urgency: 'normal' },
  }]);
  assert.equal(mock.calls.some(([name]) => name === 'from'), false);
});

test('mesmo identificador é preservado em reenvios; client não faz escrita alternativa', async () => {
  const mock = sdk({ rpcResponse: { data: null, error: { code: '23505', message: 'PRIVATE_DUPLICATE_DETAIL' } } });
  for (let attempt = 0; attempt < 2; attempt++) {
    await assert.rejects(mock.gateway.createRequest(org, requestId, payload), (error) => {
      assert.equal(error.code, 'conflict');
      assert.equal(error.message.includes('PRIVATE_DUPLICATE_DETAIL'), false);
      return true;
    });
  }
  assert.deepEqual(mock.calls.filter(([name]) => name === 'rpc').map((call) => call[2].p_request_id), [requestId, requestId]);
  assert.equal(mock.calls.some(([name]) => name === 'from'), false);
});

test('campos inválidos não chegam à autenticação nem ao RPC', async () => {
  const mock = sdk();
  await assert.rejects(mock.gateway.createRequest(org, requestId, { ...payload, context: 'curto' }));
  assert.deepEqual(mock.calls, []);
});

test('erros de acesso, validação e transporte têm códigos sem expor detalhes privados', async () => {
  for (const [serverError, expectedCode] of [
    [{ code: '42501' }, 'access_denied'], [{ status: 401 }, 'access_denied'],
    [{ status: 403 }, 'access_denied'], [{ code: '22023' }, 'validation'],
    [{ code: '54000' }, 'limit'], [{ code: 'P0001' }, 'unavailable'],
    [{ code: '08006' }, 'unavailable'],
  ]) {
    const mock = sdk({ rpcResponse: { data: null, error: { ...serverError, message: 'PRIVATE_DATABASE_DETAIL' } } });
    await assert.rejects(mock.gateway.createRequest(org, requestId, payload), (error) => {
      assert.equal(error.code, expectedCode, JSON.stringify(serverError));
      assert.equal(error.message.includes('PRIVATE_DATABASE_DETAIL'), false);
      return true;
    });
  }
});

test('resposta sem objeto de pedido não vira sucesso nem fallback de demonstração', async () => {
  for (const data of [null, [], 'unexpected']) {
    const mock = sdk({ rpcResponse: { data, error: null } });
    await assert.rejects(mock.gateway.createRequest(org, requestId, payload), { code: 'unavailable' });
    assert.equal(mock.calls.filter(([name]) => name === 'rpc').length, 1);
  }
});

test('falha de saída global tenta remover sessão local e informa a limitação', async () => {
  const mock = sdk({ logoutResponse: { error: { message: 'PRIVATE_LOGOUT_DETAIL' } } });
  await assert.rejects(mock.gateway.signOut(), { code: 'logout' });
  assert.deepEqual(mock.calls, [['signOut', undefined], ['signOut', { scope: 'local' }]]);
});
