import { test,type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer } from 'vue';
import { createApp } from '../../server/src/app.js';
import { useJourney } from '../src/composables/useJourney.js';

const config={role:'technician' as const,tone:'tension' as const,detail:'Snow at the shutters'};
const draft={title:'The Winter Ledger',reserve:'the emergency repair reserve',motive:'to conceal losses from a failed private business',coverStory:'payment for an urgent boiler replacement',recipient:'Northgate Repairs',documentTitle:'Emergency Boiler Invoice',cargoCode:'C42',commandCode:'R3'};
const reply=()=>Response.json({model:'muse-spark-1.3',choices:[{finish_reason:'stop',message:{content:JSON.stringify(draft)}}],usage:{prompt_tokens:200,completion_tokens:300,total_tokens:500}});
async function harness(t:TestContext,provider:typeof fetch,limits:object={}){
  const server=createApp({databasePath:':memory:',generation:{apiKey:'test-only-key',fetch:provider,...limits}});const url=await server.listen();const nativeFetch=globalThis.fetch;const jar=new Map<string,string>(),storage=new Map<string,string>();
  let lose='',loseBefore='';const inputs:object[]=[];
  t.mock.method(globalThis,'fetch',async(path:string,init?:RequestInit)=>{
    if(path==='/api/preparations')inputs.push(JSON.parse(init!.body as string));
    if(path===loseBefore){loseBefore='';throw new Error('Request did not reach the server');}
    const r=await nativeFetch(url+path,{...init,headers:{...init?.headers,Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; ')}});
    for(const cookie of r.headers.getSetCookie()){const pair=cookie.split(';')[0]!,at=pair.indexOf('=');jar.set(pair.slice(0,at),pair.slice(at+1));}
    if(path===lose){lose='';await r.text();throw new Error('Response lost after acceptance');}return r;
  });
  const globals={document:{hidden:false,addEventListener(){},removeEventListener(){}},window:{addEventListener(){},removeEventListener(){}},localStorage:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>{storage.set(key,value);},removeItem:(key:string)=>{storage.delete(key);}},EventSource:class{addEventListener(){}close(){}},navigator:{sendBeacon(){return true;}}};
  const restore:(()=>void)[]=[];for(const [name,value] of Object.entries(globals)){const prior=Object.getOwnPropertyDescriptor(globalThis,name);Object.defineProperty(globalThis,name,{value,configurable:true});restore.push(()=>{if(prior)Object.defineProperty(globalThis,name,prior);else Reflect.deleteProperty(globalThis,name);});}
  const renderer=createRenderer<object,object>({createElement:()=>({}),createText:()=>({}),createComment:()=>({}),insert(){},remove(){},setText(){},setElementText(){},patchProp(){},parentNode:()=>null,nextSibling:()=>null});
  let component:ReturnType<typeof renderer.createApp>,journey!:ReturnType<typeof useJourney>;
  async function mount(){component=renderer.createApp({setup(){journey=useJourney();return()=>null;}});component.mount({});while(journey.loading.value)await new Promise(resolve=>setImmediate(resolve));return journey;}
  t.after(async()=>{component.unmount();await server.close();for(const fn of restore)fn();});
  await mount();return {get journey(){return journey;},inputs,loseNext:(path:string)=>{lose=path;},loseBeforeNext:(path:string)=>{loseBefore=path;},remount:async()=>{component.unmount();return mount();}};
}

test('reloading while Meta prepares recovers the same job and seals before the clock starts',async t=>{
  let finish!:(r:Response)=>void,calls=0;const h=await harness(t,()=>{calls++;return new Promise(resolve=>{finish=resolve;});});
  assert.equal(await h.journey.createJourney(config,'meta'),true);assert.equal(h.journey.session.value,null);assert.equal(h.journey.preparing?.value,true);const id=h.journey.preparation?.value?.id;assert.ok(id);
  await h.remount();assert.equal(h.journey.preparation?.value?.id,id);assert.equal(calls,1);finish(reply());await h.journey.refresh();
  assert.equal(h.journey.session.value?.view.origin,'meta');assert.equal(h.journey.session.value?.phase,'sealed');assert.equal(h.journey.session.value?.clock.gameNow,0);assert.equal(h.journey.initialHash.value,h.journey.session.value?.hash);assert.equal(h.journey.preparing?.value,false);
});

test('a lost preparation response retries the same request rather than buying another case',async t=>{
  let finish!:(r:Response)=>void,calls=0;const h=await harness(t,()=>{calls++;return new Promise(resolve=>{finish=resolve;});});h.loseNext('/api/preparations');
  assert.equal(await h.journey.createJourney(config,'meta'),false);assert.ok(h.journey.error.value);assert.ok(h.journey.retryPreparationRequest?.value);
  await h.journey.retryPreparation();assert.equal(h.journey.preparing?.value,true);assert.equal(calls,1);assert.equal(h.inputs.length,1);finish(reply());await h.journey.refresh();assert.equal(h.journey.session.value?.view.origin,'meta');assert.equal(h.journey.error.value,'');
});

test('a lost claim response recovers the original envelope and retained commitment',async t=>{
  const h=await harness(t,async()=>reply());await h.journey.createJourney(config,'meta');const job=h.journey.preparation?.value;assert.ok(job);h.loseNext(`/api/preparations/${job.id}/claim`);
  await h.journey.refresh();assert.ok(h.journey.error.value);await h.journey.retryPreparation();const id=h.journey.session.value?.id,hash=h.journey.initialHash.value;assert.ok(id);assert.ok(hash);await h.remount();assert.equal(h.journey.session.value?.id,id);assert.equal(h.journey.initialHash.value,hash);assert.equal(h.inputs.length,1);
});

test('a provider failure remains a failure until an explicit new preparation and never becomes a prepared case',async t=>{
  let calls=0;const h=await harness(t,async()=>{calls++;return new Response('private provider details',{status:503});});await h.journey.createJourney(config,'meta');await h.journey.refresh();
  assert.equal(h.journey.preparation?.value?.status,'failed');assert.equal(h.journey.session.value,null);assert.equal(h.journey.preparing?.value,false);await h.journey.refresh();assert.equal(calls,1);
  await h.journey.createJourney(config,'meta');await h.journey.refresh();assert.equal(calls,2);assert.equal(h.journey.session.value,null);
  assert.equal(await h.journey.createJourney(config,'prepared'),true);assert.equal(h.journey.session.value?.view.origin,'prepared');
});

test('a request not accepted by the server keeps visible manual recovery after polling and reload',async t=>{
  const h=await harness(t,async()=>reply());h.loseBeforeNext('/api/preparations');assert.equal(await h.journey.createJourney(config,'meta'),false);const id=h.journey.retryPreparationRequest.value?.requestId;assert.ok(id);
  await new Promise(resolve=>setTimeout(resolve,1150));assert.ok(h.journey.error.value);assert.equal(h.journey.preparationNeedsRecovery?.value,true);assert.equal(h.journey.retryPreparationRequest.value?.requestId,id);
  await h.remount();assert.equal(h.journey.preparationNeedsRecovery?.value,true);await h.journey.retryPreparation();await h.journey.refresh();assert.equal(h.journey.session.value?.view.origin,'meta');assert.equal(h.inputs.length,2);assert.equal((h.inputs[0] as any).requestId,(h.inputs[1] as any).requestId);
});

for(const terminal of ['ready','failed'] as const)test(`an old ${terminal} preparation cannot replace a new unaccepted request`,async t=>{
  const h=await harness(t,async()=>terminal==='ready'?reply():new Response('',{status:503}));await h.journey.createJourney(config,'meta');await h.journey.refresh();const oldId=h.journey.preparation.value?.id;assert.ok(oldId);h.journey.newJourney();
  h.loseBeforeNext('/api/preparations');assert.equal(await h.journey.createJourney({...config,detail:'A new requested journey'},'meta'),false);const requestId=h.journey.retryPreparationRequest.value?.requestId;assert.ok(requestId);
  await new Promise(resolve=>setTimeout(resolve,1150));assert.equal(h.journey.retryPreparationRequest.value?.requestId,requestId);assert.equal(h.journey.preparation.value,null);assert.equal(h.journey.session.value,null);assert.equal(h.journey.preparationNeedsRecovery?.value,true);
  await h.journey.retryPreparation();assert.notEqual(h.journey.preparation.value?.id,oldId);assert.equal(h.journey.preparation.value?.requestId,requestId);
});

test('a definite quota rejection during recovery releases the form for the reference case',async t=>{
  const h=await harness(t,async()=>new Response('',{status:503}),{maxJobs:1});await h.journey.createJourney(config,'meta');await h.journey.refresh();h.journey.newJourney();h.loseBeforeNext('/api/preparations');await h.journey.createJourney(config,'meta');
  await h.journey.retryPreparation();assert.equal(h.journey.retryPreparationRequest.value,null);assert.equal(h.journey.preparing.value,false);assert.match(h.journey.error.value,/limit/i);assert.equal(await h.journey.createJourney(config,'prepared'),true);assert.equal(h.journey.session.value?.view.origin,'prepared');
});
