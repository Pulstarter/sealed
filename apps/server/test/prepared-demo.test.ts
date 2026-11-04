import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createApp} from '../src/app.js';
import {EmotionalStore,type EmotionalRecord} from '../src/emotional-store.js';
import {emptyProfile} from '../src/emotional-chat.js';
import {newGenerationCheckpoint} from '../src/emotional-generation.js';
import {createEmotionalState,emotionalRoutes,emotionalEnding} from '../../../packages/engine/src/emotional.js';

const bundle=JSON.parse(readFileSync('apps/server/assets/reviewed-demo.json','utf8'));
const sha=(x:string|Buffer)=>createHash('sha256').update(x).digest('hex');
async function harness(demoLimits?:{total:number;perOwner:number}){
 const dir=mkdtempSync(join(tmpdir(),'sealed-prepared-')),file=join(dir,'sealed.sqlite');let now=1800000000000,providerCalls=0;
 const store=new EmotionalStore(file),cp=newGenerationCheckpoint(),artifact=JSON.parse(bundle.canonical);
 const old:EmotionalRecord={id:randomUUID(),ownerHash:sha('a'.repeat(64)),generation:1,createdAt:now,updatedAt:now,revision:0,status:'ready',confirmedAt:null,messages:[],profile:emptyProfile(),checkpoint:{...cp,world:artifact.world,blocks:artifact.blocks},canonical:bundle.canonical,seal:bundle.seal,state:createEmotionalState(now),lastRequestId:'old-preview',error:null};
 store.insert(old);store.close();
 const app=createApp({databasePath:file,now:()=>now,demoLimits,emotional:{apiKey:'never-forward-a-provider-call',fetch:async()=>{providerCalls++;throw Error('No generation permitted');}}});
 const origin=await app.listen(),cookies=new Map([['sealed_emotional_owner','a'.repeat(64)]]);let flow:any;
 async function request(path:string,body?:unknown,jar=cookies){
  const response=await fetch(origin+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),'If-Match':'"'+(flow?.revision??0)+'"'},...(body?{body:JSON.stringify(body)}:{})});
  for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0]!,i=pair.indexOf('=');jar.set(pair.slice(0,i),pair.slice(i+1));}
  assert.match(response.headers.get('content-type')??'',/application\/json/,'Demo API must return JSON, not the SPA fallback');
  const value=await response.json()as any;if(value.flow&&path.startsWith('/api/demo/'))flow=value.flow;return{response,value};
 }
 const demo=(path:string,body?:unknown)=>request('/api/demo/'+path,body);
 const action=async(kind:string,choice?:string,requestId=randomUUID())=>{const result=await demo('action',{id:flow.id,node:flow.adventure.scene.id,kind,...(choice?{choice}:{}),requestId});assert.equal(result.response.status,200,JSON.stringify(result.value));return result;};
 return{app,dir,file,old,origin,cookies,request,demo,action,get flow(){return flow;},get providerCalls(){return providerCalls;},tick:(ms:number)=>{now+=ms;},close:async(remove=true)=>{await app.close();if(remove)rmSync(dir,{recursive:true,force:true});}};
}

async function finish(h:Awaited<ReturnType<typeof harness>>){await h.action('start');for(let n=0;h.flow.status!=='finished';n++){assert.ok(n<35);if(h.flow.adventure.scene.decision){await h.action('begin');await h.action('choose','A');}else await h.action('continue');}}

test('prepared capacity is persistent, blocks fresh owners and keeps completed runs recoverable',async t=>{
 const h=await harness({total:1,perOwner:1});let closed=false;t.after(async()=>{if(!closed)await h.close();});
 await h.demo('current');const requestId=randomUUID();await h.demo('new',{requestId});await finish(h);const id=h.flow.id;
 assert.equal((await h.demo('new',{requestId})).value.flow.id,id);
 assert.equal((await h.demo('new',{requestId:randomUUID()})).response.status,429);
 assert.equal((await h.demo('reveal?id='+id)).response.status,200);assert.equal(h.providerCalls,0);
 await h.close(false);closed=true;
 const app=createApp({databasePath:h.file,now:()=>1800000000000,demoLimits:{total:1,perOwner:1}}),origin=await app.listen();
 try{
  const old=await fetch(origin+'/api/demo/current',{headers:{Cookie:[...h.cookies].map(([k,v])=>k+'='+v).join('; ')}});assert.equal((await old.json()as any).flow.id,id);
  const fresh=await fetch(origin+'/api/demo/current');const cookie=fresh.headers.getSetCookie()[0]!.split(';')[0]!;
  const blocked=await fetch(origin+'/api/demo/new',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({requestId:randomUUID()})});assert.equal(blocked.status,429);
 }finally{await app.close();rmSync(h.dir,{recursive:true,force:true});}
});

test('owner admission is separate from global capacity and does not affect preview limits',async()=>{
 const h=await harness({total:4,perOwner:1});try{
  await h.demo('current');await h.demo('new',{requestId:randomUUID()});await finish(h);
  assert.equal((await h.demo('new',{requestId:randomUUID()})).response.status,429);
  const fresh=new Map<string,string>();await h.request('/api/demo/current',undefined,fresh);
  assert.equal((await h.request('/api/demo/new',{requestId:randomUUID()},fresh)).response.status,201);
  assert.equal((await h.request('/api/emotional/current')).value.flow.id,h.old.id);assert.equal(h.providerCalls,0);
 }finally{await h.close();}
});

test('prepared demo starts without generation and preserves the preview cookie, session and counters',async()=>{
 const h=await harness();try{
  const initial=await h.demo('current');assert.equal(initial.response.status,200);assert.equal(initial.value.flow,null);assert.equal(initial.value.available,true);
  const started=await h.demo('new',{requestId:randomUUID()});assert.equal(started.response.status,201);assert.equal(h.flow.status,'ready');assert.equal(h.flow.seal,bundle.seal);
  assert.ok(h.cookies.has('sealed_demo_owner'));assert.equal(h.cookies.get('sealed_emotional_owner'),'a'.repeat(64));
  const prior=await h.request('/api/emotional/current');assert.equal(prior.value.flow.id,h.old.id);assert.equal(prior.value.flow.status,'ready');assert.equal(prior.value.flow.seal,bundle.seal);
  const db=new DatabaseSync(h.file,{readOnly:true});assert.equal(db.prepare('SELECT count(*) n FROM emotional_flows').get()!.n,1);assert.equal(db.prepare('SELECT count(*) n FROM emotional_calls').get()!.n,0);assert.equal(db.prepare('SELECT count(*) n FROM emotional_flows WHERE confirmed_at IS NOT NULL').get()!.n,0);db.close();
  assert.equal(h.providerCalls,0);
 }finally{await h.close();}
});

test('prepared demo rejects chat, confirmation and premature or foreign envelope access',async()=>{
 const h=await harness();try{
  await h.demo('current');await h.demo('new',{requestId:randomUUID()});
  for(const op of ['chat','confirm']){const r=await h.demo(op,{id:h.flow.id,requestId:randomUUID(),...(op==='chat'?{text:'Do not generate anything'}:{})});assert.equal(r.response.status,403);}
  assert.equal((await h.demo('reveal?id='+h.flow.id)).response.status,403);
  const foreign=new Map<string,string>();await h.request('/api/demo/current',undefined,foreign);const other=await h.request('/api/demo/current?id='+h.flow.id,undefined,foreign);assert.equal(other.response.status,404);
  const reveal=await h.request('/api/emotional/reveal?id='+h.flow.id);assert.equal(reveal.response.status,404);assert.equal(h.providerCalls,0);
 }finally{await h.close();}
});

test('duplicate prepared starts are idempotent and an unfinished run cannot be silently replaced',async()=>{
 const h=await harness();try{
  await h.demo('current');const id=randomUUID();const [a,b]=await Promise.all([h.demo('new',{requestId:id}),h.demo('new',{requestId:id})]);
  assert.equal(a.value.flow.id,b.value.flow.id);assert.equal(a.value.flow.seal,b.value.flow.seal);
  const next=await h.demo('new',{requestId:randomUUID()});assert.equal(next.response.status,409);assert.equal(h.providerCalls,0);
 }finally{await h.close();}
});

test('all 27 prepared routes keep the original seal and authoritative choices across reload and replay',async()=>{
 const h=await harness();try{
  await h.demo('current');
  for(const route of emotionalRoutes){
   const start=await h.demo('new',{requestId:randomUUID()});assert.equal(start.response.status,201);const id=h.flow.id;
   await h.action('start');let safety=0;
   while(h.flow.status!=='finished'){
    assert.ok(++safety<35,route);
    if(h.flow.adventure.scene.decision){const choice=route[h.flow.adventure.decisions.length]!;await h.action('begin');
     if(choice==='T'){h.tick(13000);await h.demo('current');}else await h.action('choose',choice);
    }else await h.action('continue');
   }
   assert.equal(h.flow.adventure.decisions.map((d:any)=>d.choice).join(''),route);assert.equal(h.flow.adventure.scene.id,emotionalEnding(route));
   const revealed=await h.demo('reveal?id='+id);assert.equal(revealed.response.status,200);assert.equal(revealed.value.canonical,bundle.canonical);assert.equal(revealed.value.hash,bundle.seal);assert.equal(sha(revealed.value.canonical),bundle.seal);
   await h.demo('current');assert.equal(h.flow.id,id);assert.equal(h.flow.status,'finished');assert.equal(h.flow.seal,bundle.seal);
  }
  const memories=await h.demo('memories');assert.equal(memories.value.memories.length,27);assert.equal(h.providerCalls,0);
  assert.equal((await h.request('/api/emotional/current')).value.flow.id,h.old.id);
 }finally{await h.close();}
});

test('prepared illustration bytes match the sealed references and no source bundle is served',async()=>{
 const h=await harness();try{
  await h.demo('current');await h.demo('new',{requestId:randomUUID()});
  for(const image of bundle.images){const r=await fetch(h.origin+'/api/demo/art/'+h.flow.id+'/'+image.ref.id,{headers:{Cookie:[...h.cookies].map(([k,v])=>k+'='+v).join('; ')}});assert.equal(r.status,200);assert.equal(sha(Buffer.from(await r.arrayBuffer())),image.ref.sha256);}
  const hidden=await fetch(h.origin+'/assets/reviewed-demo.json');assert.ok(!(await hidden.text()).includes(JSON.parse(bundle.canonical).world.story.sealed_truth));assert.equal(h.providerCalls,0);
 }finally{await h.close();}
});
