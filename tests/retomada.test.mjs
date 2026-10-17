import test from 'node:test';
import assert from 'node:assert/strict';
import { RequestDrafts } from '../src/request-drafts.ts';
import { allowedView, hashFromView, viewFromHash } from '../src/routes.ts';
function fixture() {
  const data=new Map();
  const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k),key:i=>[...data.keys()][i],get length(){return data.size;}};
  return {data,drafts:new RequestDrafts(storage)};
}
const payload={category:'site',goal:'fortalecer_marca',channel:'',format:'',context:'Pedido fictício',desiredDeadline:null,urgency:'normal'};
test('rascunho retoma, separa usuário/organização e limpa só a conta que saiu',()=>{
  const {drafts}=fixture();drafts.write('a','org1',payload);drafts.write('b','org1',payload);
  assert.deepEqual(drafts.read('a','org1'),payload);assert.equal(drafts.read('a','org2'),null);
  drafts.clear('a');assert.equal(drafts.read('a','org1'),null);assert.deepEqual(drafts.read('b','org1'),payload);
});
test('rascunho expira, rejeita corrupção e preserva identificador do envio incerto',()=>{
  const {drafts,data}=fixture();const id='30000000-0000-4000-8000-000000000001';
  drafts.write('a','o',payload,id);assert.equal(drafts.pendingId('a','o'),id);
  const key=[...data.keys()][0];data.set(key,JSON.stringify({at:Date.now()-86400001,payload}));
  assert.equal(drafts.read('a','o'),null);data.set(key,'broken');assert.equal(drafts.read('a','o'),null);
});
test('storage indisponível não informa salvamento bem-sucedido',()=>{
  const drafts=new RequestDrafts({getItem(){throw Error();},setItem(){throw Error();},removeItem(){},key(){return null;},length:0});
  assert.equal(drafts.write('a','o',payload),false);assert.equal(drafts.read('a','o'),null);
});
test('rotas são enumeradas e triagem não concede papel de operador',()=>{
  for(const v of ['requests','history','queue'])assert.equal(viewFromHash(hashFromView(v)),v);
  assert.equal(viewFromHash('#/admin?token=foo'),'requests');
  assert.equal(allowedView('queue',false),'requests');assert.equal(allowedView('queue',true),'queue');
});

import { awaitingReview } from '../src/review-state.ts';
import { DemoGateway } from '../src/demo-gateway.ts';
test('somente versão mais recente sem decisão correspondente está pendente',()=>{
  const a={id:'v1',requestId:'p1',version:1,contentHash:'h1'};
  const b={id:'v2',requestId:'p1',version:2,contentHash:'h2'};
  assert.deepEqual(awaitingReview([a],[{deliveryId:'v1',contentHash:'h1'}]),[]);
  assert.deepEqual(awaitingReview([b,a],[{deliveryId:'v1',contentHash:'h1'}]),['p1']);
  assert.deepEqual(awaitingReview([a,b],[{deliveryId:'v2',contentHash:'outro'}]),['p1']);
  assert.deepEqual(awaitingReview([b,a],[{deliveryId:'v2',contentHash:'h2'}]),[]);
});
test('resumo demo restringe organização e pedidos acessíveis',async()=>{
  const data=new Map();const gateway=new DemoGateway({getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)});
  await gateway.prepareExample();await gateway.signIn('aurora@exemplo.test','demo-only');
  const org='10000000-0000-4000-8000-000000000001';const rows=await gateway.listRequests(org);
  assert.deepEqual(await gateway.pendingReviews(org,rows.map(r=>r.id)),rows.map(r=>r.id));
  assert.deepEqual(await gateway.pendingReviews(org,['inexistente']),[]);
  await assert.rejects(gateway.pendingReviews('10000000-0000-4000-8000-000000000002',[]));
});

import { SupabaseGateway } from '../src/supabase-gateway.ts';
test('resumo real consulta só metadados autorizados e propaga falha',async()=>{
  const calls=[];let denied=false;let unavailable=false;
  const client={auth:{getUser:async()=>({data:{user:{id:'a',email:'a@test.invalid'}},error:null})},from(table){
    const q={select(fields){calls.push([table,fields]);return q;},eq(){return q;},in(_key,ids){assert.deepEqual(ids,['p1']);return q;},order(){return q;},
      range:async()=>({data:table==='camaleao_deliveries'?[{id:'v1',request_id:'p1',version:1,content_hash:'h1'}]:[],error:unavailable?{code:'network'}:null}),
      then(resolve,reject){return Promise.resolve({data:denied?[]:[{organization_id:'org',role:'client',camaleao_organizations:{name:'Fictícia'}}],error:null}).then(resolve,reject);}};
    return q;
  }};
  const gateway=new SupabaseGateway(client);
  assert.deepEqual(await gateway.pendingReviews('org',['p1']),['p1']);
  for(const [table,fields] of calls)if(table!=='camaleao_memberships')assert.ok(!fields.split(',').includes('content'));
  denied=true;await assert.rejects(gateway.pendingReviews('org',['p1']),{code:'access_denied'});
  denied=false;unavailable=true;await assert.rejects(gateway.pendingReviews('org',['p1']),{code:'unavailable'});
});
