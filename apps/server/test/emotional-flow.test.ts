import {test,type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createApp} from '../src/app.js';
import {providerFixture,response,testProfile} from './emotional-fixtures.js';

const playerAnswer='I am tired. Please accompany that with a gentle quiet mystery and no graphic violence.';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
function provider(){const text=providerFixture();return(async(url,init)=>{if(String(url).endsWith('/images/generations'))return new Response(JSON.stringify({output_format:'png',data:[{b64_json:png}]}));const req=JSON.parse(String(init?.body)),payload=JSON.parse(req.messages[1].content);if(payload.task==='intake')return response({kind:'proposal',message:'A gentle quiet mystery. Ready to create your adventure?',profile:testProfile,evidence:[{field:'mood',quote:'tired'},{field:'direction',quote:'accompany'},{field:'experience',quote:'quiet mystery'},{field:'exclusions',quote:'graphic violence'},{field:'intensity',quote:'gentle'}]});return text(url,init);}) as typeof fetch;}
async function fixture(t:TestContext,extra:Record<string,unknown>={}){
  const root=await mkdtemp(join(tmpdir(),'sealed-emotional-'));const databasePath=join(root,'qa.sqlite');let time=1000;
  const options={apiKey:'test-key',fetch:provider(),...extra};let app=createApp({databasePath,now:()=>time,emotional:options});let url=await app.listen();
  t.after(async()=>{await app.close();await rm(root,{recursive:true,force:true});});
  function client(){const jar=new Map<string,string>();async function request(route:string,data?:object,revision=snapshot?.revision??0){const r=await fetch(url+route,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json','If-Match':'"'+revision+'"',Cookie:[...jar].map(([k,v])=>k+'='+v).join('; ')},...(data?{body:JSON.stringify(data)}:{})});for(const item of r.headers.getSetCookie()){const pair=item.split(';')[0]!,i=pair.indexOf('=');jar.set(pair.slice(0,i),pair.slice(i+1));}return{status:r.status,cookies:r.headers.getSetCookie(),value:r.headers.get('content-type')?.startsWith('image/')?Buffer.from(await r.arrayBuffer()):await r.json() as any};}
    let snapshot:any;const refresh=async(id?:string)=>{const r=await request('/api/emotional/current'+(id?'?id='+id:''));assert.equal(r.status,200);snapshot=r.value.flow;return snapshot;};
    const wait=async(status:string)=>{for(let i=0;i<400;i++){await refresh();if(snapshot?.status===status)return snapshot;if(snapshot?.status==='failed')assert.fail(snapshot.error);await new Promise(r=>setTimeout(r,2));}assert.fail('Flow did not reach '+status);};
    async function setup(){await refresh();const n=await request('/api/emotional/new',{requestId:randomUUID()});assert.equal(n.status,201);snapshot=n.value.flow;const chat=await request('/api/emotional/chat',{id:snapshot.id,text:playerAnswer,requestId:randomUUID()});assert.equal(chat.status,202);await wait('proposal');return snapshot;}
    async function prepare(){await setup();const r=await request('/api/emotional/confirm',{id:snapshot.id,requestId:randomUUID()});assert.equal(r.status,202);return wait('ready');}
    async function action(kind:string,extra:object={}){const r=await request('/api/emotional/action',{id:snapshot.id,node:snapshot.adventure.scene.id,kind,requestId:randomUUID(),...extra});if(r.status===200)snapshot=r.value.flow;return r;}
    return{request,refresh,wait,setup,prepare,action,get snapshot(){return snapshot;}};
  }
  return{client,databasePath,setTime:(n:number)=>{time=n;},restart:async()=>{await app.close();app=createApp({databasePath,now:()=>time,emotional:options});url=await app.listen();}};
}
test('a confirmed Meta flow seals content before play and keeps secrets out of active snapshots',async t=>{
  const f=await fixture(t),c=f.client();await c.setup();assert.equal(c.snapshot.profile.mood,'tired');assert.equal(c.snapshot.adventure,null);
  await c.request('/api/emotional/confirm',{id:c.snapshot.id,requestId:randomUUID()});await c.wait('ready');
  assert.match(c.snapshot.seal,/^[a-f0-9]{64}$/);assert.equal(c.snapshot.adventure.phase,'sealed');assert.deepEqual(c.snapshot.adventure.scene.paragraphs,[]);
  assert.doesNotMatch(JSON.stringify(c.snapshot),/Secret motive|PRIVATE ONLY|block:S2|requestHash|apiKey|ownerHash/);
  assert.equal((await c.request('/api/emotional/reveal?id='+c.snapshot.id)).status,403);assert.equal((await c.action('start')).status,200);assert.equal(c.snapshot.adventure.scene.id,'S1');assert.equal(c.snapshot.adventure.deadline,null);
});
test('intake and confirmation retries never duplicate paid calls and conflicting reuse is rejected',async t=>{
  const f=await fixture(t),c=f.client();await c.refresh();const id=randomUUID(),first=await c.request('/api/emotional/new',{requestId:id});assert.equal((await c.request('/api/emotional/new',{requestId:id})).value.flow.id,first.value.flow.id);
  const input={id:first.value.flow.id,text:playerAnswer,requestId:randomUUID()};await c.request('/api/emotional/chat',input);await c.request('/api/emotional/chat',input);await c.wait('proposal');assert.equal((await c.request('/api/emotional/chat',{...input,text:'different'})).status,409);
  const confirm={id:c.snapshot.id,requestId:randomUUID()};await c.request('/api/emotional/confirm',confirm);await c.request('/api/emotional/confirm',confirm);await c.wait('ready');
  const db=new DatabaseSync(f.databasePath,{readOnly:true});assert.equal(db.prepare("SELECT count(*) AS n FROM emotional_calls WHERE call_key LIKE 'chat:%'").get()!.n,1);assert.equal(db.prepare("SELECT count(*) AS n FROM emotional_calls WHERE call_key='world'").get()!.n,1);db.close();
  const history=events(f.databasePath,c.snapshot.id);for(const kind of ['conversation_started','chat_submitted','preparation_confirmed','adventure_sealed'])assert.equal(history.filter(e=>e.kind===kind).length,1);
});
test('server deadlines survive restart and late or client-authored time cannot change the timeout branch',async t=>{
  const f=await fixture(t),c=f.client();await c.prepare();await c.action('start');await c.action('begin');const deadline=c.snapshot.adventure.deadline;assert.equal(deadline,13000);await f.restart();await c.refresh();assert.equal(c.snapshot.adventure.deadline,deadline);
  assert.equal((await c.action('choose',{choice:'A',actor:'p2',at:0,sequence:0})).status,400);f.setTime(deadline);assert.equal((await c.action('choose',{choice:'A'})).status,409);await c.refresh();assert.equal(c.snapshot.adventure.scene.id,'D1T');assert.equal(c.snapshot.adventure.decisions.length,1);
  const revision=c.snapshot.adventure.revision;await c.refresh();assert.equal(c.snapshot.adventure.revision,revision);
});
test('owners cannot read another envelope, art or memory and current legacy sessions retain their seal',async t=>{
  const f=await fixture(t),a=f.client(),b=f.client();const legacy=await a.request('/api/journeys',{role:'guest',tone:'melancholy',detail:''});await a.prepare();await b.refresh();
  assert.equal((await b.request('/api/emotional/current?id='+a.snapshot.id)).status,404);assert.equal((await b.request('/api/emotional/art/'+a.snapshot.id+'/scene')).status,404);assert.equal((await b.request('/api/emotional/reveal?id='+a.snapshot.id)).status,404);
  const history=events(f.databasePath,a.snapshot.id);assert.equal((await b.request('/api/emotional/action',{id:a.snapshot.id,node:'S1',kind:'start',requestId:randomUUID()})).status,404);assert.deepEqual(events(f.databasePath,a.snapshot.id),history);
  const image=await a.request('/api/emotional/art/'+a.snapshot.id+'/scene');assert.equal(image.status,200);assert.ok(Buffer.isBuffer(image.value));
  const unchanged=await a.request('/api/session');assert.equal(unchanged.value.session.hash,legacy.value.hash);assert.equal(unchanged.value.session.id,legacy.value.id);
});
test('one continuity reaches an openable exact envelope and completed memories remain rereadable',async t=>{
  const f=await fixture(t),c=f.client();await c.prepare();const original=c.snapshot.id,seal=c.snapshot.seal;await c.action('start');
  for(let guard=0;guard<20&&c.snapshot.status!=='finished';guard++){if(c.snapshot.adventure.scene.decision){await c.action('begin');await c.action('choose',{choice:'A'});}else await c.action('continue');}
  assert.equal(c.snapshot.status,'finished');assert.equal(c.snapshot.adventure.ending.id,'F1');const reveal=await c.request('/api/emotional/reveal?id='+original);assert.equal(reveal.status,200);assert.equal(createHash('sha256').update(reveal.value.canonical).digest('hex'),seal);assert.equal((await c.action('start')).status,409);
  const next=await c.request('/api/emotional/new',{requestId:randomUUID()});assert.equal(next.status,201);assert.notEqual(next.value.flow.id,original);await c.refresh(original);assert.equal(c.snapshot.status,'finished');assert.equal(c.snapshot.adventure.history.length,8);const memories=await c.request('/api/emotional/memories');assert.equal(memories.value.memories[0].id,original);
});
test('global preparation quotas still apply to a new browser cookie and expensive calls are reserved before transport',async t=>{
  const f=await fixture(t,{dailyJobs:1,maxJobs:1,ownerDailyJobs:1}),a=f.client(),b=f.client();await a.prepare();await b.setup();const rejected=await b.request('/api/emotional/confirm',{id:b.snapshot.id,requestId:randomUUID()});assert.equal(rejected.status,429);
  const db=new DatabaseSync(f.databasePath,{readOnly:true});assert.equal(db.prepare("SELECT count(*) AS n FROM emotional_calls WHERE call_key='world'").get()!.n,1);assert.equal(db.prepare("SELECT count(*) AS n FROM emotional_calls WHERE status='started'").get()!.n,0);db.close();
});
test('a process interruption during a paid call is recorded and never retried after restart',async t=>{
  const normal=provider();let worldCalls=0;
  const blocked=(async(url,init)=>{if(String(url).endsWith('/chat/completions')&&JSON.parse(JSON.parse(String(init?.body)).messages[1].content).task==='world'){worldCalls++;return new Promise<Response>((_resolve,reject)=>{const signal=init!.signal!;if(signal.aborted)reject(Error('aborted'));else signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true});});}return normal(url,init);}) as typeof fetch;
  const f=await fixture(t,{fetch:blocked}),c=f.client();await c.setup();await c.request('/api/emotional/confirm',{id:c.snapshot.id,requestId:randomUUID()});
  for(let i=0;i<100&&worldCalls===0;i++)await new Promise(r=>setTimeout(r,2));assert.equal(worldCalls,1);await f.restart();await c.refresh();assert.equal(c.snapshot.status,'failed');assert.equal(c.snapshot.error,'interrupted');await c.refresh();assert.equal(worldCalls,1);
  assert.equal(events(f.databasePath,c.snapshot.id).filter(e=>e.kind==='process_interrupted').length,1);
});
test('a rejected action ID remains rejected and cannot be reused after a later begin',async t=>{
  const f=await fixture(t),c=f.client();await c.prepare();await c.action('start');const input={id:c.snapshot.id,node:'S1',kind:'choose',choice:'A',requestId:randomUUID()};assert.equal((await c.request('/api/emotional/action',input)).status,409);await c.action('begin');assert.equal((await c.request('/api/emotional/action',input)).status,409);assert.equal((await c.request('/api/emotional/action',{...input,choice:'B'})).status,409);await c.refresh();assert.equal(c.snapshot.adventure.scene.id,'S1');assert.equal(c.snapshot.adventure.decisions.length,0);assert.equal((await c.action('choose',{choice:'A'})).status,200);
});
test('stale tabs cannot confirm an unseen proposal or answer a newer conversation turn',async t=>{
 for(const path of ['confirm','chat']){
  const f=await fixture(t),c=f.client();await c.setup();const stale=c.snapshot.revision;
  assert.equal((await c.request('/api/emotional/chat',{id:c.snapshot.id,text:playerAnswer,requestId:randomUUID()})).status,202);await c.wait('proposal');assert.ok(c.snapshot.revision>stale);
  const body={id:c.snapshot.id,requestId:randomUUID(),...(path==='chat'?{text:playerAnswer}:{})};
  assert.equal((await c.request('/api/emotional/'+path,body,stale)).status,409);
  const db=new DatabaseSync(f.databasePath,{readOnly:true});assert.equal(db.prepare("SELECT count(*) AS n FROM emotional_calls WHERE call_key='world'").get()!.n,0);db.close();
 }
});
test('returning owners keep a long-lived renewed access cookie and the same saved identity',async t=>{
 const f=await fixture(t),c=f.client();const first=await c.request('/api/emotional/current');const token=first.cookies[0]!.split(';')[0];
 assert.match(first.cookies[0]!,/Max-Age=31536000/);await c.setup();const id=c.snapshot.id;f.setTime(8*86400000);
 const later=await c.request('/api/emotional/current');assert.equal(later.cookies[0]?.split(';')[0],token);assert.match(later.cookies[0]!,/Max-Age=31536000/);assert.equal(later.value.flow.id,id);
});

function events(file:string,id:string){
  const db=new DatabaseSync(file,{readOnly:true});
  try{return (db.prepare('SELECT * FROM emotional_events WHERE flow_id=? ORDER BY id').all(id) as {kind:string;request_id:string|null;details_json:string}[]).map(r=>({...r,details:JSON.parse(r.details_json)}));}finally{db.close();}
}
test('private history retains the rejected chat field and source call across restart without exposing diagnostics',async t=>{
  const bad=(async()=>response({kind:'proposal',message:'Shall we create it?',profile:{...testProfile,intensity:'tense'},evidence:[{field:'mood',quote:'tired'},{field:'direction',quote:'accompany'},{field:'experience',quote:'quiet mystery'},{field:'exclusions',quote:'graphic violence'},{field:'intensity',quote:'gentle'}]})) as typeof fetch;
  const f=await fixture(t,{fetch:bad,apiKey:'private-provider-secret'}),c=f.client();await c.refresh();
  const created=await c.request('/api/emotional/new',{requestId:randomUUID()}),id=created.value.flow.id;
  const input={id,text:playerAnswer,requestId:randomUUID()};await c.request('/api/emotional/chat',input);await c.wait('chat');
  assert.equal(c.snapshot.error,'chat_response_rejected');
  const history=events(f.databasePath,id),failure=history.find(e=>e.kind==='operation_failed')!;
  assert.equal(failure.request_id,input.requestId);assert.equal(failure.details.stage,'chat');assert.equal(failure.details.code,'preference_not_grounded');assert.equal(failure.details.field,'intensity');
  assert.equal(history.filter(e=>e.kind==='chat_submitted').length,1);assert.equal(history.filter(e=>e.kind==='provider_finished').length,1);
  assert.doesNotMatch(JSON.stringify(history),/private-provider-secret|Authorization|Bearer|owner_hash/);
  assert.doesNotMatch(JSON.stringify(c.snapshot),/preference_not_grounded|details_json|provider_finished|evidence/);
  assert.equal((await c.request('/api/emotional/diagnostics?id='+id)).status,404);
  await f.restart();assert.deepEqual(events(f.databasePath,id),history);
  const db=new DatabaseSync(f.databasePath,{readOnly:true});const saved=JSON.parse(String(db.prepare('SELECT payload FROM emotional_flows WHERE id=?').get(id)!.payload));
  assert.equal(saved.messages[1].content,playerAnswer);assert.equal(db.prepare('SELECT count(*) AS n FROM emotional_calls WHERE flow_id=?').get(id)!.n,1);db.close();
});
test('each validation pass and its exact block reasons survive a failed bounded repair',async t=>{
  const intake=provider(),prose=providerFixture({badBlock:'S3',alwaysBad:true});
  const bad=(async(url,init)=>{const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);return p.task==='intake'?intake(url,init):prose(url,init);}) as typeof fetch;
  const f=await fixture(t,{fetch:bad}),c=f.client();await c.setup();await c.request('/api/emotional/confirm',{id:c.snapshot.id,requestId:randomUUID()});
  for(let i=0;i<400;i++){await c.refresh();if(c.snapshot.status==='failed')break;await new Promise(r=>setTimeout(r,2));}
  assert.equal(c.snapshot.status,'failed');assert.equal(c.snapshot.seal,null);
  const history=events(f.databasePath,c.snapshot.id),checks=history.filter(e=>e.kind==='validation_completed');
  assert.deepEqual(checks.map(e=>e.details.pass),[0,1,2]);assert.match(checks[0]!.details.issues.S3.join(' '),/metatext/);assert.match(checks[1]!.details.issues.S3.join(' '),/metatext/);
  assert.equal(history.find(e=>e.kind==='operation_failed')!.details.code,'adventure_validation_failed');assert.equal(history.filter(e=>e.kind==='repair_planned').length,2);
  assert.equal(history.some(e=>e.kind==='adventure_sealed'),false);
});
test('private history records timeout once and deduplicates repeated rejected requests',async t=>{
  const f=await fixture(t),c=f.client();await c.prepare();const id=c.snapshot.id;await c.action('start');await c.action('begin');f.setTime(c.snapshot.adventure.deadline);
  const late={id,node:'S1',kind:'choose',choice:'A',requestId:randomUUID()};assert.equal((await c.request('/api/emotional/action',late)).status,409);assert.equal((await c.request('/api/emotional/action',late)).status,409);
  await c.refresh();await c.refresh();await f.restart();await c.refresh();
  const history=events(f.databasePath,id),timeouts=history.filter(e=>e.kind==='decision_timed_out');
  assert.equal(timeouts.length,1);assert.equal(timeouts[0]!.details.choice,'T');assert.equal(timeouts[0]!.details.actor,'p1');assert.equal(timeouts[0]!.details.at,13000);
  assert.equal(history.filter(e=>e.kind==='action_rejected').length,1);assert.equal(c.snapshot.adventure.decisions.length,1);
  assert.equal(history.filter(e=>e.kind==='adventure_sealed').length,1);
});
test('provider failures retain the call and receipt without persisting arbitrary transport secrets',async t=>{
  const f=await fixture(t,{apiKey:'private-api-secret',fetch:(async()=>{throw Error('Authorization: private-api-secret; Cookie=private-cookie');}) as typeof fetch}),c=f.client();await c.refresh();
  const created=await c.request('/api/emotional/new',{requestId:randomUUID()}),id=created.value.flow.id;
  await c.request('/api/emotional/chat',{id,text:playerAnswer,requestId:randomUUID()});await c.wait('chat');
  const history=events(f.databasePath,id),failure=history.find(e=>e.kind==='operation_failed')!;assert.equal(failure.details.code,'provider_uncertain');assert.match(failure.details.callKey,/^chat:/);
  assert.doesNotMatch(JSON.stringify(history),/private-api-secret|private-cookie|Authorization/);
  const db=new DatabaseSync(f.databasePath,{readOnly:true});assert.equal(db.prepare('SELECT count(*) AS n FROM emotional_calls WHERE flow_id=?').get(id)!.n,1);db.close();
});
