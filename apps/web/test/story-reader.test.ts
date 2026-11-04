import { test,type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer } from 'vue';
import { createApp } from '../../server/src/app.js';
import { useStory } from '../src/composables/useStory.js';
import { paginateStory } from '../src/lib/story-presentation.js';

async function harness(t:TestContext){
  let time=1000;const app=createApp({databasePath:':memory:',now:()=>time});const url=await app.listen();const nativeFetch=globalThis.fetch;const jar=new Map<string,string>(),storage=new Map<string,string>();let lose='',before='',hold='';let release=()=>{},held=false;const requests:{path:string;body:any}[]=[];
  t.mock.method(globalThis,'fetch',async(path:string,init?:RequestInit)=>{if(init?.body)requests.push({path,body:JSON.parse(init.body as string)});if(path===before){before='';throw new Error('Not delivered');}const r=await nativeFetch(url+path,{...init,headers:{...init?.headers,Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; ')}});for(const item of r.headers.getSetCookie()){const pair=item.split(';')[0]!,at=pair.indexOf('=');jar.set(pair.slice(0,at),pair.slice(at+1));}if(path===lose){lose='';await r.text();throw new Error('Response lost');}if(path===hold){hold='';held=true;await new Promise<void>(resolve=>{release=resolve;});}return r;});
  const restore:(()=>void)[]=[];const globals={document:{hidden:false,addEventListener(){},removeEventListener(){}},window:{addEventListener(){},removeEventListener(){}},localStorage:{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>{storage.set(k,v);}},EventSource:class{addEventListener(){}close(){}}};for(const [key,value] of Object.entries(globals)){const prior=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{value,configurable:true});restore.push(()=>{if(prior)Object.defineProperty(globalThis,key,prior);else Reflect.deleteProperty(globalThis,key);});}
  const renderer=createRenderer<object,object>({createElement:()=>({}),createText:()=>({}),createComment:()=>({}),insert(){},remove(){},setText(){},setElementText(){},patchProp(){},parentNode:()=>null,nextSibling:()=>null});let component:ReturnType<typeof renderer.createApp>,story!:ReturnType<typeof useStory>;
  async function mount(){component=renderer.createApp({setup(){story=useStory();return()=>null;}});component.mount({});while(story.loading?.value)await new Promise(resolve=>setImmediate(resolve));}
  await mount();t.after(async()=>{release();component.unmount();await app.close();for(const fn of restore)fn();});return {get story(){return story;},requests,setTime:(at:number)=>{time=at;},loseNext:(p:string)=>{lose=p;},loseBeforeNext:(p:string)=>{before=p;},holdNext:(p:string)=>{hold=p;held=false;},waitHeld:async()=>{while(!held)await new Promise(resolve=>setImmediate(resolve));},release:()=>release(),remount:async()=>{component.unmount();await mount();}};
}

test('story pagination preserves every word and caps long passages without empty pages',()=>{
  const text=['Uno dos tres cuatro cinco seis.','—¿Vienes?','—Voy contigo.'];const pages=paginateStory(text,5);assert.ok(pages.length>1);assert.equal(pages.flatMap(p=>p).join(' ').replace(/\s+/g,' '),text.join(' '));assert.ok(pages.every(p=>p.length>0&&p.join(' ').split(/\s+/).length<=5));assert.deepEqual(paginateStory([],5),[]);
});
test('a reading page survives refresh and reload without starting any decision',async t=>{
  const h=await harness(t);assert.equal(h.story.session?.value,null);await h.story.start();assert.equal(h.story.session.value.scene.id,'S1');assert.ok(h.story.pages.value.length>1);h.story.nextPage();const page=h.story.pageIndex.value;assert.ok(page>0);await h.story.refresh();assert.equal(h.story.pageIndex.value,page);await h.remount();assert.equal(h.story.pageIndex.value,page);assert.equal(h.story.session.value.deadline,null);
});
test('a lost begin response recovers the same running deadline and cannot restart the timer',async t=>{
  const h=await harness(t);await h.story.start();await h.story.act('continue');h.loseNext('/api/story/action');await h.story.act('begin');assert.ok(h.story.pending.value);await h.story.refresh();assert.equal(h.story.session.value.phase,'deciding');assert.equal(h.story.pending.value,null);const end=h.story.session.value.deadline;h.setTime(5000);await h.story.act('begin');assert.equal(h.story.session.value.deadline,end);
});
test('a lost choice response restores its branch on reload without making another choice',async t=>{
  const h=await harness(t);await h.story.start();await h.story.act('continue');await h.story.act('begin');h.loseNext('/api/story/action');await h.story.act('choose','A');assert.ok(h.story.pending.value);await h.remount();assert.equal(h.story.session.value.scene.id,'R1A');assert.equal(h.story.session.value.decisions.length,1);assert.equal(h.story.pending.value,null);const choices=h.requests.filter(r=>r.body.kind==='choose');assert.equal(choices.length,1);
});
test('reconnecting after the deadline displays the server timeout branch',async t=>{
  const h=await harness(t);await h.story.start();await h.story.act('continue');await h.story.act('begin');h.setTime(h.story.session.value.deadline+5000);await h.story.refresh();assert.equal(h.story.session.value.scene.id,'R1T');assert.equal(h.story.session.value.lastDecision.choice,'T');assert.ok(h.story.notice.value);assert.equal(h.story.session.value.deadline,null);
});
test('a start not received by the server retains manual recovery through refresh',async t=>{
  const h=await harness(t);h.loseBeforeNext('/api/story/start');await h.story.start();const id=h.story.pending.value.requestId;await h.story.refresh();assert.ok(h.story.canRecover.value);assert.ok(h.story.error.value);await h.story.retry();assert.equal(h.story.pending.value,null);assert.equal(h.story.session.value.scene.id,'S1');const starts=h.requests.filter(r=>r.path==='/api/story/start');assert.equal(starts[0]!.body.requestId,id);assert.equal(starts[1]!.body.requestId,id);
});
test('server confirmation releases a held begin response so a choice remains possible',async t=>{
  const h=await harness(t);await h.story.start();await h.story.act('continue');h.holdNext('/api/story/action');const request=h.story.act('begin');await h.waitHeld();await h.story.refresh();assert.equal(h.story.session.value.phase,'deciding');assert.equal(h.story.pending.value,null);assert.equal(h.story.working.value,false);await h.story.act('choose','A');h.release();await request;assert.equal(h.story.session.value.scene.id,'R1A');assert.equal(h.story.working.value,false);assert.equal(h.story.error.value,'');
});
test('a pending restart from another tab cannot block the newer adventure',async t=>{
  const h=await harness(t);await h.story.start();h.loseNext('/api/story/start');await h.story.start(true);assert.ok(h.story.pending.value);const other=await fetch('/api/story/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:'another-tab-start',restart:true})});assert.equal(other.status,201);const newer=await other.json();await h.remount();assert.equal(h.story.session.value.id,newer.id);assert.equal(h.story.pending.value,null);await h.story.act('continue');assert.equal(h.story.session.value.scene.id,'S2');
});
