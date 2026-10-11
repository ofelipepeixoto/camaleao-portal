import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export const ids = {
  alice: '10000000-0000-4000-8000-000000000001',
  bob: '10000000-0000-4000-8000-000000000002',
  operator: '10000000-0000-4000-8000-000000000003',
  sessionA: '20000000-0000-4000-8000-000000000001',
  sessionB: '20000000-0000-4000-8000-000000000002',
  sessionOperator: '20000000-0000-4000-8000-000000000003',
  orgA: '30000000-0000-4000-8000-000000000001',
  orgB: '30000000-0000-4000-8000-000000000002',
};
export const validPayload = {
  category: 'peca_social', goal: 'Divulgar serviço', channel: 'Instagram',
  format: 'Feed', context: 'Contexto de exemplo fictício para o teste do pedido.',
  desired_deadline: '2026-12-10', urgency: 'normal',
};

export function assertLocalTestUrl(value) {
  const url = new URL(value);
  if (!['postgres:','postgresql:'].includes(url.protocol) ||
      !['localhost','127.0.0.1','[::1]'].includes(url.hostname) ||
      !/^\/camaleao_test_[a-z0-9_]+$/.test(url.pathname) || url.search) {
    throw new Error('DB_TEST_URL precisa ser PostgreSQL loopback, banco camaleao_test_* e sem parâmetros.');
  }
  return url.toString();
}

export async function openDatabase() {
  let db;
  if (process.env.DB_TEST_URL) {
    const { default: pg } = await import('pg');
    const connectionString = assertLocalTestUrl(process.env.DB_TEST_URL);
    const client = new pg.Client({ connectionString });
    await client.connect();
    db = { kind: 'postgres-server', query: (sql,params=[]) => client.query(sql,params),
      exec: sql => client.query(sql), close: () => client.end(),
      connect: async () => {
        const other = new pg.Client({ connectionString }); await other.connect();
        return { query: (sql,params=[]) => other.query(sql,params), close: () => other.end() };
      } };
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const engine = new PGlite(); await engine.waitReady;
    db = { kind: 'pglite', query: (sql,params=[]) => engine.query(sql,params),
      exec: sql => engine.exec(sql), close: () => engine.close() };
  }
  const { rows } = await db.query("select count(*)::int n from pg_tables where schemaname in ('public','auth','camaleao_private')");
  if (rows[0].n !== 0) { await db.close(); throw new Error('Teste recusado: banco não está vazio. Nenhum objeto foi removido.'); }
  const read = path => readFile(`${root}${path}`,'utf8');
  await db.exec(await read('supabase/local-fixtures/auth-contract.sql'));
  const migrations = (await readdir(`${root}supabase/migrations`)).filter(n => n.endsWith('.sql')).sort();
  for (const migration of migrations) await db.exec(await read(`supabase/migrations/${migration}`));
  await db.exec(await read('supabase/local-fixtures/seed.sql'));
  return db;
}

export async function asActor(db,userId,sessionId,sql,params=[],extraClaims={}) {
  await db.query('begin');
  try {
    await db.query('set local role authenticated');
    await db.query("select set_config('request.jwt.claims',$1,true)",[
      JSON.stringify({ sub:userId, session_id:sessionId, exp:Math.floor(Date.now()/1000)+3600,
        role:'authenticated',...extraClaims }),
    ]);
    const result = await db.query(sql,params);
    await db.query('commit');
    return result;
  } catch (error) { await db.query('rollback'); throw error; }
}
export async function asWorker(db,sql,params=[]) {
  await db.query('begin');
  try {
    await db.query('set local role camaleao_worker');
    const result=await db.query(sql,params); await db.query('commit'); return result;
  } catch (error) { await db.query('rollback'); throw error; }
}
export async function createRequest(db,key,payload=validPayload,user=ids.alice,org=ids.orgA,session=ids.sessionA) {
  const result=await asActor(db,user,session,
    'select public.camaleao_create_request($1::uuid,$2::uuid,$3::jsonb) as request',[org,key,JSON.stringify(payload)]);
  return result.rows[0].request;
}
