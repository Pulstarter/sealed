import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../src/app.js';
import { buildCaseWorld } from '../../../packages/engine/src/case-template.js';
import { canonicalizeWorld } from '../../../packages/engine/src/index.js';

const config={role:'technician',tone:'tension',detail:'Snow at the shutters'};
const draft={title:'The Winter Ledger',reserve:'the emergency repair reserve',motive:'to conceal losses from a failed private business',coverStory:'payment for an urgent boiler replacement',recipient:'Northgate Repairs',documentTitle:'Emergency Boiler Invoice',cargoCode:'C42',commandCode:'R3'};
const response=()=>Response.json({model:'muse-spark-1.3',choices:[{finish_reason:'stop',message:{content:JSON.stringify(draft)}}],usage:{prompt_tokens:200,completion_tokens:300,total_tokens:500}});
async function client(url:string){
  const jar=new Map<string,string>();
  async function request(path:string,value?:object){
    const r=await fetch(url+path,{method:value===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; ')},...(value===undefined?{}:{body:JSON.stringify(value)})});
    for(const cookie of r.headers.getSetCookie()){const pair=cookie.split(';')[0]!;const split=pair.indexOf('=');jar.set(pair.slice(0,split),pair.slice(split+1));}
    return {status:r.status,value:await r.json() as any};
  }
  const setup=await request('/api/setup');assert.equal(setup.status,200);
  return {request,jar};
}
async function waitFor(request:Awaited<ReturnType<typeof client>>['request'],status:string){
  for(let i=0;i<100;i++){const r=await request('/api/preparations/current');if(r.value.preparation?.status===status)return r.value.preparation;await delay(10);}
  assert.fail(`Preparation did not reach ${status}`);
}
async function fixture(t:TestContext,transport:typeof fetch,limits:object={}){
  const root=await mkdtemp(join(tmpdir(),'sealed-preparations-'));const path=join(root,'test.sqlite');let time=Date.UTC(2026,9,28,12);
  const options={databasePath:path,now:()=>time,generation:{apiKey:'test-only-key',fetch:transport,maxJobs:100,dailyJobs:20,ownerDailyJobs:3,...limits}};
  let app=createApp(options);let url=await app.listen();
  t.after(async()=>{await app.close();await rm(root,{recursive:true,force:true});});
  return {path,app:()=>app,url:()=>url,setTime:(next:number)=>{time=next;},restart:async()=>{await app.close();app=createApp(options);url=await app.listen();}};
}

test('a Meta preparation publishes one sealed authorized session only after validation',async t=>{
  let finish!:(r:Response)=>void;const f=await fixture(t,()=>new Promise(resolve=>{finish=resolve;}));const a=await client(f.url());
  const health=await a.request('/health');assert.equal(health.value.stage,'H2');assert.equal(health.value.content,'meta-and-prepared');
  const created=await a.request('/api/preparations',{...config,requestId:'prepare-one'});assert.equal(created.status,202);assert.equal(created.value.preparation.requestId,'prepare-one');
  const running=await waitFor(a.request,'generating');assert.equal((await a.request('/api/session')).value.session,null);
  assert.equal(running.hash,undefined);assert.equal(running.canonical,undefined);assert.ok(!JSON.stringify(running).includes(draft.recipient));
  assert.notEqual((await a.request(`/api/preparations/${running.id}/claim`,{})).status,200);
  finish(response());const ready=await waitFor(a.request,'ready');
  const sealed=await a.request(`/api/preparations/${ready.id}/claim`,{});assert.equal(sealed.status,200);assert.equal(sealed.value.phase,'sealed');assert.equal(sealed.value.view.origin,'meta');assert.equal(sealed.value.clock.gameNow,0);assert.equal(sealed.value.clock.paused,true);
  assert.ok(!JSON.stringify(sealed.value).includes(draft.recipient));assert.equal(sealed.value.canonical,undefined);assert.equal((await a.request('/api/session/reveal')).status,403);
  const repeated=await a.request(`/api/preparations/${ready.id}/claim`,{});assert.equal(repeated.value.id,sealed.value.id);assert.equal(repeated.value.hash,sealed.value.hash);
  const db=new DatabaseSync(f.path,{readOnly:true});const rows=db.prepare('SELECT canonical,hash FROM sessions').all();assert.equal(rows.length,1);assert.equal(createHash('sha256').update(String(rows[0]!.canonical)).digest('hex'),sealed.value.hash);db.close();
});

test('duplicate preparation submissions share a job and a paid request; conflicting input is rejected',async t=>{
  let finish!:(r:Response)=>void;let calls=0;const f=await fixture(t,()=>{calls++;return new Promise(resolve=>{finish=resolve;});});const a=await client(f.url());
  const first=await a.request('/api/preparations',{...config,requestId:'same-request'});assert.equal(first.status,202);await waitFor(a.request,'generating');
  const again=await a.request('/api/preparations',{...config,requestId:'same-request'});assert.equal(again.value.preparation.id,first.value.preparation.id);
  assert.equal((await a.request('/api/preparations',{...config,tone:'melancholy',requestId:'same-request'})).status,409);
  assert.equal((await a.request('/api/preparations',{...config,requestId:'different-request'})).status,409);
  assert.equal((await a.request('/api/journeys',config)).status,409);finish(response());await waitFor(a.request,'ready');assert.equal(calls,1);
});

test('generation jobs are isolated by owner and never expose private receipts or provider messages',async t=>{
  let finish!:(r:Response)=>void;const f=await fixture(t,()=>new Promise(resolve=>{finish=resolve;}));const a=await client(f.url()),b=await client(f.url());
  const first=await a.request('/api/preparations',{...config,requestId:'owner-a'});assert.equal(first.status,202);await waitFor(a.request,'generating');
  assert.equal((await b.request('/api/preparations/current')).value.preparation,null);assert.equal((await b.request(`/api/preparations/${first.value.preparation.id}/claim`,{})).status,404);
  assert.equal((await b.request('/api/preparations',{...config,requestId:'owner-b',model:'other'})).status,400);
  finish(new Response('private provider data test-only-key',{status:503}));const failed=await waitFor(a.request,'failed');assert.equal(failed.errorCode,'generation_failed');assert.ok(!JSON.stringify(failed).includes('test-only-key'));assert.ok(!JSON.stringify(failed).includes('503'));
  assert.equal((await a.request('/api/session')).value.session,null);
});

test('a restart recovers the same seal and enforces the persisted total generation quota',async t=>{
  let calls=0;const f=await fixture(t,async()=>{calls++;return response();},{maxJobs:1});let a=await client(f.url());
  assert.equal((await a.request('/api/preparations',{...config,requestId:'quota-one'})).status,202);const ready=await waitFor(a.request,'ready');const before=await a.request(`/api/preparations/${ready.id}/claim`,{});const cookies=[...a.jar];
  await f.restart();a=await client(f.url());for(const [k,v] of cookies)a.jar.set(k,v);
  const after=await a.request(`/api/preparations/${ready.id}/claim`,{});assert.equal(after.value.id,before.value.id);assert.equal(after.value.hash,before.value.hash);assert.equal(calls,1);
  assert.equal((await a.request('/api/preparations',{...config,requestId:'quota-two'})).status,429);assert.equal((await a.request('/api/preparations',{...config,requestId:'quota-one'})).value.preparation.id,ready.id);assert.equal(calls,1);
});

test('daily limits include failures and are separate for an owner and the whole demo',async t=>{
  let calls=0;const f=await fixture(t,async()=>{calls++;return new Response('',{status:503});},{dailyJobs:2,ownerDailyJobs:1,maxJobs:5});const a=await client(f.url()),b=await client(f.url()),c=await client(f.url());
  assert.equal((await a.request('/api/preparations',{...config,requestId:'daily-a'})).status,202);await waitFor(a.request,'failed');assert.equal((await a.request('/api/preparations',{...config,requestId:'daily-a-two'})).status,429);
  assert.equal((await b.request('/api/preparations',{...config,requestId:'daily-b'})).status,202);await waitFor(b.request,'failed');assert.equal((await c.request('/api/preparations',{...config,requestId:'daily-c'})).status,429);assert.equal(calls,2);
  f.setTime(Date.UTC(2026,9,29,0));assert.equal((await a.request('/api/preparations',{...config,requestId:'next-day'})).status,202);await waitFor(a.request,'failed');assert.equal(calls,3);
});

test('an interrupted provider request is not replayed after a restart',async t=>{
  let calls=0;const f=await fixture(t,(_url,init)=>{calls++;return new Promise((_resolve,reject)=>{init!.signal!.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});});});let a=await client(f.url());
  assert.equal((await a.request('/api/preparations',{...config,requestId:'interrupted'})).status,202);await waitFor(a.request,'generating');const cookies=[...a.jar];
  await f.restart();a=await client(f.url());for(const [k,v] of cookies)a.jar.set(k,v);
  const failed=await waitFor(a.request,'failed');assert.equal(failed.errorCode,'interrupted');assert.equal(calls,1);assert.equal((await a.request('/api/preparations',{...config,requestId:'interrupted'})).value.preparation.id,failed.id);assert.equal((await a.request('/api/session')).value.session,null);
});

test('a durable validation checkpoint resumes without another provider call and seals atomically',async t=>{
  const f=await fixture(t,(_url,init)=>new Promise((_resolve,reject)=>{init!.signal!.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});}));let a=await client(f.url());
  const created=await a.request('/api/preparations',{...config,requestId:'checkpoint'});assert.equal(created.status,202);await waitFor(a.request,'generating');await f.app().close();
  const world=buildCaseWorld(draft,{role:'technician',tone:'tension',detail:config.detail});const canonical=canonicalizeWorld(world),hash=createHash('sha256').update(canonical).digest('hex');
  const db=new DatabaseSync(f.path);db.prepare("UPDATE preparations SET status='validating',canonical=?,hash=? WHERE id=?").run(canonical,hash,created.value.preparation.id);db.close();const cookies=[...a.jar];await f.restart();a=await client(f.url());for(const [k,v] of cookies)a.jar.set(k,v);
  const ready=await waitFor(a.request,'ready');const claimed=await a.request(`/api/preparations/${ready.id}/claim`,{});assert.equal(claimed.value.hash,hash);assert.equal(claimed.value.clock.gameNow,0);assert.equal(claimed.value.phase,'sealed');
});

test('Meta generation stays disabled without credentials while the prepared reference still works',async t=>{
  const app=createApp({databasePath:':memory:'});t.after(()=>app.close());const a=await client(await app.listen());assert.equal((await a.request('/api/setup')).value.meta.available,false);assert.equal((await a.request('/api/preparations',{...config,requestId:'disabled'})).status,503);assert.equal((await a.request('/api/journeys',config)).value.view.origin,'prepared');
});
