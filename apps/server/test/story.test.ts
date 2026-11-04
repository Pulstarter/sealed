import { test,type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';

async function fixture(t:TestContext){
  const root=await mkdtemp(join(tmpdir(),'sealed-story-'));const path=join(root,'qa.sqlite');let time=1000;let app=createApp({databasePath:path,now:()=>time});let url=await app.listen();
  t.after(async()=>{await app.close();await rm(root,{recursive:true,force:true});});
  function client(){
    const jar=new Map<string,string>();
    async function request(route:string,body?:object){const r=await fetch(url+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; ')},...(body===undefined?{}:{body:JSON.stringify(body)})});for(const item of r.headers.getSetCookie()){const pair=item.split(';')[0]!,at=pair.indexOf('=');jar.set(pair.slice(0,at),pair.slice(at+1));}return {status:r.status,value:await r.json() as any};}
    let snapshot:any;
    async function refresh(){const r=await request('/api/story');assert.equal(r.status,200);snapshot=r.value.session;return snapshot;}
    async function start(restart=false,requestId=randomUUID()){await refresh();const r=await request('/api/story/start',{requestId,restart});assert.equal(r.status,201);snapshot=r.value;return snapshot;}
    async function action(kind:string,extra:object={}){const r=await request('/api/story/action',{id:snapshot.id,node:snapshot.scene.id,kind,requestId:randomUUID(),...extra});if(r.status===200)snapshot=r.value;return r;}
    return {request,refresh,start,action,get snapshot(){return snapshot;}};
  }
  return {client,path,setTime:(at:number)=>{time=at;},restart:async()=>{await app.close();app=createApp({databasePath:path,now:()=>time});url=await app.listen();}};
}
async function crisis(c:ReturnType<Awaited<ReturnType<typeof fixture>>['client']>,id:string){for(let i=0;i<15;i++){if(c.snapshot.scene.decision?.id===id)return;assert.equal((await c.action('continue')).status,200);}assert.fail('Crisis not reached');}

test('the story starts with a clear goal and free reading never starts a countdown',async t=>{
  const f=await fixture(t),c=f.client();const s=await c.start();assert.equal(s.scene.id,'S1');assert.match(s.goal,/Inés/);assert.equal(s.phase,'reading');assert.equal(s.deadline,null);assert.ok(!JSON.stringify(s).includes('El mensaje sin respuesta'));assert.ok(!JSON.stringify(s).includes('No grabaste a Vidal'));f.setTime(90000000);const later=await c.refresh();assert.equal(later.scene.id,'S1');assert.equal(later.revision,s.revision);
});
test('a decision gets a server deadline once and a reconnect resolves timeout exactly once',async t=>{
  const f=await fixture(t),c=f.client();await c.start();await crisis(c,'D1');assert.equal(c.snapshot.deadline,null);f.setTime(5000);const begun=await c.action('begin');assert.equal(begun.status,200);assert.equal(c.snapshot.deadline,17000);assert.equal(c.snapshot.scene.decision.options.length,2);f.setTime(12000);assert.equal((await c.action('begin')).status,200);assert.equal(c.snapshot.deadline,17000);f.setTime(17000);const expired=await c.refresh();assert.equal(expired.scene.id,'R1T');assert.equal(expired.lastDecision.choice,'T');assert.equal(expired.lastDecision.at,17000);assert.equal((await c.refresh()).revision,expired.revision);
});
test('late choices are rejected after applying the timeout branch and client time authority is refused',async t=>{
  const f=await fixture(t),c=f.client();await c.start();await crisis(c,'D1');await c.action('begin');assert.equal((await c.action('choose',{choice:'A',actor:'p2',at:0})).status,400);f.setTime(c.snapshot.deadline);assert.equal((await c.action('choose',{choice:'A'})).status,409);assert.equal((await c.refresh()).scene.id,'R1T');
});
test('all 27 paths follow the manuscript endings and project only their own readable passages',async t=>{
  const f=await fixture(t);const expected=[['A','A',['F2','F2','F2']],['A','B',['F1','F1','F2']],['A','T',['F2','F2','F2']],['B','A',['F1','F1','F1']],['B','B',['F1','F3','F3']],['B','T',['F1','F3','F3']],['T','A',['F2','F2','F2']],['T','B',['F1','F3','F4']],['T','T',['F2','F4','F4']]] as const;
  for(const [a,b,endings] of expected)for(const [i,d] of ['A','B','T'].entries()){
    f.setTime(1000);const c=f.client();await c.start();let next=0;const chosen=[a,b,d];let guard=0;
    while(c.snapshot.phase!=='finished'){
      assert.ok(++guard<30);const prose=c.snapshot.scene.paragraphs.join('\n');assert.doesNotMatch(prose,/Continúa en S|Lee F\d|Si detuviste|Si lo detuviste|Si conservas|si está contigo|las fotografías, la grabación o ambas/);
      if(c.snapshot.scene.decision){await c.action('begin');const choice=chosen[next++];if(choice==='T'){f.setTime(c.snapshot.deadline);await c.refresh();}else assert.equal((await c.action('choose',{choice})).status,200);}
      else assert.equal((await c.action('continue')).status,200);
    }
    assert.equal(c.snapshot.ending.id,endings[i]);assert.equal(c.snapshot.decisions.length,3);assert.equal(c.snapshot.scene.chapter,10);assert.ok(c.snapshot.scene.paragraphs.length>3);assert.equal(c.snapshot.ending.explanation.length,3);
  }
});
test('actions and restarts are idempotent, old tabs cannot mutate a new story, and owners are isolated',async t=>{
  const f=await fixture(t),a=f.client(),b=f.client();const first=await a.start();await b.start();assert.equal((await b.request('/api/story/action',{id:first.id,node:'S1',kind:'continue',requestId:randomUUID()})).status,404);
  const request={id:first.id,node:'S1',kind:'continue',requestId:randomUUID()};const accepted=await a.request('/api/story/action',request);assert.equal(accepted.value.scene.id,'S2');assert.equal((await a.request('/api/story/action',request)).value.scene.id,'S2');assert.equal((await a.request('/api/story/action',{...request,kind:'begin'})).status,409);
  const restartId=randomUUID();const next=await a.start(true,restartId);assert.notEqual(next.id,first.id);assert.ok(next.generation>first.generation);assert.equal((await a.start(true,restartId)).id,next.id);assert.equal((await a.request('/api/story/action',{...request,requestId:randomUUID()})).status,409);
  const db=new DatabaseSync(f.path,{readOnly:true});assert.equal(db.prepare('SELECT count(*) AS n FROM story_sessions').get()!.n,3);db.close();
});
test('restarting the server preserves reading state and the active decision deadline',async t=>{
  const f=await fixture(t),c=f.client();const initial=await c.start();await crisis(c,'D1');await c.action('begin');const deadline=c.snapshot.deadline;await f.restart();const s=await c.refresh();assert.equal(s.id,initial.id);assert.equal(s.deadline,deadline);f.setTime(deadline+5000);assert.equal((await c.refresh()).scene.id,'R1T');
});
test('a story in the same browser does not replace a legacy journey or its seal',async t=>{
  const f=await fixture(t),c=f.client();const old=await c.request('/api/journeys',{role:'technician',tone:'tension',detail:''});assert.equal(old.status,201);await c.start();const after=await c.request('/api/session');assert.equal(after.value.session.id,old.value.id);assert.equal(after.value.session.hash,old.value.hash);assert.equal(after.value.session.phase,'sealed');
});
