import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { openDatabase, ids, validPayload, createRequest, asActor, asWorker, assertLocalTestUrl } from '../scripts/test-db.mjs';

let db;
before(async () => { db=await openDatabase(); console.log(`SQL engine: ${db.kind}; Auth contract is a local fixture, not Supabase Auth.`); });
after(async () => { if(db) await db.close(); });
beforeEach(async () => {
  await db.exec('truncate public.camaleao_organizations,auth.users cascade');
  await db.exec(await readFile(new URL('../supabase/local-fixtures/seed.sql',import.meta.url),'utf8'));
});
const rejectsCode = (operation,code) => assert.rejects(operation,error => error.code===code);
const count = async table => (await db.query(`select count(*)::int n from ${table}`)).rows[0].n;
const claim = (connection=db,limit=10) => asWorker(connection,'select * from camaleao_private.claim_jobs($1)',[limit]);
const finish = (job,outcome='success',error=null) => asWorker(db,
  'select camaleao_private.finish_job($1::uuid,$2::uuid,$3,$4) as result',[job.id,job.lease_token,outcome,error]);

test('test harness rejects production/remote/non-test database URLs', () => {
  for(const url of ['postgres://x@project.supabase.co/camaleao_test_one','postgres://x@localhost/postgres','postgres://x@localhost/camaleao_test_one?sslmode=disable'])
    assert.throws(() => assertLocalTestUrl(url));
  assert.match(assertLocalTestUrl('postgres://x@127.0.0.1/camaleao_test_one'),/127\.0\.0\.1/);
});
test('T01 valid request persists request, job and minimal event together',async () => {
  const request=await createRequest(db,randomUUID());
  assert.equal(request.status,'recebido'); assert.equal(request.created_by,ids.alice);
  assert.equal(request.organization_id,ids.orgA); assert.match(request.protocol,/^CAM-[A-F0-9]{32}$/);
  for(const table of ['public.camaleao_requests','camaleao_private.jobs','camaleao_private.events']) assert.equal(await count(table),1);
  const event=(await db.query('select * from camaleao_private.events')).rows[0];
  assert.equal(event.kind,'request_received'); assert.equal('context' in event,false);
});
test('T02 invalid fields, forged status/role and invalid date write nothing',async () => {
  for(const change of [{category:'outro'},{goal:''},{context:'curto'},{context:'a'.repeat(2001)},{channel:'a'.repeat(81)},
    {desired_deadline:'2026-02-30'},{desired_deadline:9},{urgency:'alta'},{status:'em_triagem'},{role:'operator'},{goal:9},{format:{value:'Feed'}}])
    await rejectsCode(() => createRequest(db,randomUUID(),{...validPayload,...change}),'22023');
  assert.equal(await count('public.camaleao_requests'),0); assert.equal(await count('camaleao_private.jobs'),0);
});
test('T03 equivalent replay returns one request and changed payload conflicts',async () => {
  const key=randomUUID(), first=await createRequest(db,key);
  const repeat=await createRequest(db,key,{...validPayload,context:` ${validPayload.context} `});
  assert.equal(first.id,repeat.id); assert.equal(await count('public.camaleao_requests'),1);
  await rejectsCode(() => createRequest(db,key,{...validPayload,goal:'Outro objetivo'}),'23505');
});
test('T04 clients read only their organization; operator has explicit membership in both',async () => {
  await createRequest(db,randomUUID());
  await createRequest(db,randomUUID(),validPayload,ids.bob,ids.orgB,ids.sessionB);
  const read=(user,session) => asActor(db,user,session,'select organization_id from public.camaleao_requests');
  assert.deepEqual((await read(ids.alice,ids.sessionA)).rows.map(r=>r.organization_id),[ids.orgA]);
  assert.deepEqual((await read(ids.bob,ids.sessionB)).rows.map(r=>r.organization_id),[ids.orgB]);
  assert.equal((await read(ids.operator,ids.sessionOperator)).rows.length,2);
  await rejectsCode(() => createRequest(db,randomUUID(),validPayload,ids.bob,ids.orgA,ids.sessionB),'42501');
});
test('T05 no direct client mutation, worker access or elevated user_metadata permission',async () => {
  const request=await createRequest(db,randomUUID());
  for(const sql of [
    "update public.camaleao_requests set status='em_triagem'",
    `update public.camaleao_requests set organization_id='${ids.orgB}'`,
    "update public.camaleao_memberships set role='operator'",
    'delete from public.camaleao_requests',
    'truncate public.camaleao_requests',
    'select * from camaleao_private.jobs',
    'select * from camaleao_private.claim_jobs(10)',
  ]) await rejectsCode(() => asActor(db,ids.alice,ids.sessionA,sql),'42501');
  const result=await asActor(db,ids.bob,ids.sessionB,
    'select * from public.camaleao_requests where id=$1',[request.id],
    {user_metadata:{role:'operator',organization_id:ids.orgA}});
  assert.equal(result.rows.length,0);
});
test('composite foreign key prevents request/job organization mismatch',async () => {
  const request=await createRequest(db,randomUUID());
  await rejectsCode(() => db.query('update camaleao_private.jobs set organization_id=$1 where request_id=$2',[ids.orgB,request.id]),'23503');
});
test('rate limit is serialized per organization and replay remains allowed',async () => {
  const key=randomUUID(); await createRequest(db,key);
  for(let i=1;i<20;i++) await createRequest(db,randomUUID());
  await rejectsCode(() => createRequest(db,randomUUID()),'54000');
  await createRequest(db,key); assert.equal(await count('public.camaleao_requests'),20);
  await createRequest(db,randomUUID(),validPayload,ids.bob,ids.orgB,ids.sessionB);
});
test('T10 injected job failure rolls back request and event',async () => {
  await db.exec("create function camaleao_private.test_failure() returns trigger language plpgsql as $$begin raise exception 'SIMULATED_FAILURE'; end;$$; create trigger test_fail before insert on camaleao_private.jobs for each row execute function camaleao_private.test_failure();");
  try {
    await rejectsCode(() => createRequest(db,randomUUID()),'P0001');
    assert.equal(await count('public.camaleao_requests'),0); assert.equal(await count('camaleao_private.events'),0);
  } finally { await db.exec('drop trigger test_fail on camaleao_private.jobs; drop function camaleao_private.test_failure();'); }
});
test('T12 membership revocation immediately blocks read and create',async () => {
  await createRequest(db,randomUUID());
  await db.query('update public.camaleao_memberships set active=false where user_id=$1',[ids.alice]);
  assert.equal((await asActor(db,ids.alice,ids.sessionA,'select * from public.camaleao_requests')).rows.length,0);
  await rejectsCode(() => createRequest(db,randomUUID()),'42501');
});
test('T12 expired/missing JWT expiry, anonymous identity and revoked session fail closed',async () => {
  await createRequest(db,randomUUID());
  for(const claims of [{exp:1},{exp:null},{session_id:null},{session_id:ids.sessionB},{is_anonymous:true}]) {
    assert.equal((await asActor(db,ids.alice,ids.sessionA,'select * from public.camaleao_requests',[],claims)).rows.length,0);
    await rejectsCode(() => asActor(db,ids.alice,ids.sessionA,
      'select public.camaleao_create_request($1,$2,$3::jsonb)',[ids.orgA,randomUUID(),JSON.stringify(validPayload)],claims),'42501');
  }
  await db.query('delete from auth.sessions where id=$1',[ids.sessionA]);
  await rejectsCode(() => createRequest(db,randomUUID()),'42501');
});
test('anon has no table read or creator execution grants; worker cannot read tables',async () => {
  await db.query('begin');
  try { await db.query('set local role anon'); await rejectsCode(() => db.query('select * from public.camaleao_requests'),'42501'); }
  finally { await db.query('rollback'); }
  await rejectsCode(() => asWorker(db,'select * from public.camaleao_requests'),'42501');
  const privileges=await db.query("select has_function_privilege('anon','public.camaleao_create_request(uuid,uuid,jsonb)','EXECUTE') allowed, rolcanlogin,rolbypassrls from pg_roles where rolname='camaleao_worker'");
  assert.equal(privileges.rows[0].allowed,false); assert.equal(privileges.rows[0].rolcanlogin,false); assert.equal(privileges.rows[0].rolbypassrls,false);
});
test('queue claims bounded batch and successful finish is atomic and idempotent',async () => {
  for(let i=0;i<12;i++) await createRequest(db,randomUUID());
  await rejectsCode(() => claim(db,11),'22023');
  const jobs=(await claim()).rows; assert.equal(jobs.length,10); assert.equal(jobs[0].attempts,1);
  const first=jobs[0]; const result=(await finish(first)).rows[0].result;
  assert.equal(result.state,'completed'); assert.equal(result.status,'em_triagem');
  const request=(await db.query('select * from public.camaleao_requests where id=$1',[first.request_id])).rows[0];
  assert.equal(request.status,'em_triagem'); assert.equal(request.triage_queue,'design_social'); assert.equal(request.version,2);
  assert.equal((await finish(first)).rows[0].result.replayed,true);
  assert.equal((await db.query("select count(*)::int n from camaleao_private.events where request_id=$1 and kind='request_triaged'",[first.request_id])).rows[0].n,1);
  assert.equal((await claim()).rows.length,2);
});
test('T09 lease expiry/restart replaces token; stale worker cannot finish',async () => {
  await createRequest(db,randomUUID());
  const first=(await claim()).rows[0];
  assert.equal((await claim()).rows.length,0);
  await db.query("update camaleao_private.jobs set lease_expires_at=now()-interval '1 second' where id=$1",[first.id]);
  await rejectsCode(() => finish(first),'23505');
  const resumed=(await claim()).rows[0]; assert.equal(resumed.attempts,2); assert.notEqual(resumed.lease_token,first.lease_token);
  await rejectsCode(() => finish(first),'23505'); await finish(resumed);
});
test('only allowlisted transient failures retry, with bounded delay/max three attempts',async () => {
  await createRequest(db,randomUUID()); let job=(await claim()).rows[0];
  await rejectsCode(() => finish(job,'transient_error','RANDOM_EXCEPTION'),'22023');
  for(let attempt=1;attempt<=3;attempt++) {
    const result=(await finish(job,'transient_error','NETWORK_TIMEOUT')).rows[0].result;
    assert.equal(result.state,attempt<3?'pending':'failed');
    if(attempt<3) {
      assert.equal((await claim()).rows.length,0);
      await db.query("update camaleao_private.jobs set available_at=now()-interval '1 second' where id=$1",[job.id]);
      job=(await claim()).rows[0]; assert.equal(job.attempts,attempt+1);
    }
  }
  assert.equal((await claim()).rows.length,0);
});
test('validation failure never retries and does not imply approval/production',async () => {
  await createRequest(db,randomUUID()); const job=(await claim()).rows[0];
  assert.equal((await finish(job,'validation_error','INVALID_REQUEST')).rows[0].result.state,'failed');
  assert.equal((await claim()).rows.length,0);
  assert.equal((await db.query('select status from public.camaleao_requests')).rows[0].status,'recebido');
});
test('T10 finish event failure rolls back status and completed job together',async () => {
  await createRequest(db,randomUUID()); const job=(await claim()).rows[0];
  await db.exec("create function camaleao_private.test_finish_failure() returns trigger language plpgsql as $$begin raise exception 'SIMULATED_FAILURE'; end;$$; create trigger test_finish_fail before insert on camaleao_private.events for each row execute function camaleao_private.test_finish_failure();");
  try {
    await rejectsCode(() => finish(job),'P0001');
    assert.equal((await db.query('select status from public.camaleao_requests')).rows[0].status,'recebido');
    assert.equal((await db.query('select state from camaleao_private.jobs')).rows[0].state,'running');
  } finally { await db.exec('drop trigger test_finish_fail on camaleao_private.events; drop function camaleao_private.test_finish_failure();'); }
  await finish(job);
});
test('three crashed workers exhaust lease attempts and preserve request',async () => {
  await createRequest(db,randomUUID());
  for(let attempt=1;attempt<=3;attempt++) {
    const job=(await claim()).rows[0]; assert.equal(job.attempts,attempt);
    await db.query("update camaleao_private.jobs set lease_expires_at=now()-interval '1 second' where id=$1",[job.id]);
  }
  assert.equal((await claim()).rows.length,0);
  assert.equal((await db.query('select state,error_code from camaleao_private.jobs')).rows[0].error_code,'ATTEMPTS_EXHAUSTED');
  assert.equal(await count('public.camaleao_requests'),1);
});
test('expired exhausted-job cleanup is bounded and does not scan/mutate an unlimited batch',async () => {
  for(let i=0;i<12;i++) await createRequest(db,randomUUID());
  await claim(); await claim();
  await db.query("update camaleao_private.jobs set attempts=3,lease_expires_at=now()-interval '1 second'");
  assert.equal((await claim(db,3)).rows.length,0);
  assert.equal((await db.query("select count(*)::int n from camaleao_private.jobs where state='failed'")).rows[0].n,3);
  assert.equal((await db.query("select count(*)::int n from camaleao_private.events where kind='job_failed'")).rows[0].n,3);
});
test('concurrent connections create one idempotent request (server PostgreSQL only)',{skip:!process.env.DB_TEST_URL},async () => {
  const other=await db.connect(), key=randomUUID();
  try {
    const [a,b]=await Promise.all([createRequest(db,key),createRequest(other,key)]);
    assert.equal(a.id,b.id); assert.equal(await count('public.camaleao_requests'),1);
  } finally { await other.close(); }
});
test('concurrent workers never claim the same leased job (server PostgreSQL only)',{skip:!process.env.DB_TEST_URL},async () => {
  for(let i=0;i<12;i++) await createRequest(db,randomUUID());
  const other=await db.connect();
  try {
    const [a,b]=await Promise.all([claim(db,10),claim(other,10)]);
    const all=[...a.rows,...b.rows]; assert.equal(all.length,12); assert.equal(new Set(all.map(j=>j.id)).size,12);
  } finally { await other.close(); }
});
test('two authenticated actors cannot share another actor idempotency key (server PostgreSQL only)',{skip:!process.env.DB_TEST_URL},async () => {
  await db.query("insert into public.camaleao_memberships(organization_id,user_id,role) values ($1,$2,'client')",[ids.orgA,ids.bob]);
  const other=await db.connect(),key=randomUUID();
  try {
    const results=await Promise.allSettled([createRequest(db,key),createRequest(other,key,validPayload,ids.bob,ids.orgA,ids.sessionB)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(results.find(r=>r.status==='rejected').reason.code,'23505');
    assert.equal(await count('public.camaleao_requests'),1);
  } finally { await other.close(); }
});
test('concurrent changed payload conflicts instead of silently returning different content (server PostgreSQL only)',{skip:!process.env.DB_TEST_URL},async () => {
  const other=await db.connect(),key=randomUUID();
  try {
    const results=await Promise.allSettled([createRequest(db,key),createRequest(other,key,{...validPayload,goal:'Objetivo concorrente'})]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(results.find(r=>r.status==='rejected').reason.code,'23505');
    assert.equal(await count('public.camaleao_requests'),1);
  } finally { await other.close(); }
});
test('concurrent submissions cannot overrun organization daily quota (server PostgreSQL only)',{skip:!process.env.DB_TEST_URL},async () => {
  for(let i=0;i<19;i++) await createRequest(db,randomUUID());
  const other=await db.connect();
  try {
    const results=await Promise.allSettled([createRequest(db,randomUUID()),createRequest(other,randomUUID())]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(results.find(r=>r.status==='rejected').reason.code,'54000');
    assert.equal(await count('public.camaleao_requests'),20);
  } finally { await other.close(); }
});
