import {test,type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRenderer} from 'vue';
import {createApp} from '../../server/src/app.js';
import {providerFixture,response,testProfile} from '../../server/test/emotional-fixtures.js';
import {useEmotional} from '../src/composables/useEmotional.js';
import {acceptEmotionalSnapshot,verifyEmotionalSeal} from '../src/lib/emotional-presentation.js';
import {paginateStory} from '../src/lib/story-presentation.js';
import type {EmotionalFlowSnapshot} from '../../../packages/engine/src/emotional-types.js';

const answer='I am tired. Please accompany that with a gentle quiet mystery and no graphic violence.';
async function harness(t:TestContext,limits:{dailyJobs?:number}={},prepared=false){
  let clientTime=0;t.mock.method(performance,'now',()=>clientTime);
  let time=1000;const provider=providerFixture();const app=createApp({databasePath:':memory:',now:()=>time,emotional:{...limits,apiKey:'test-key',fetch:(async(url,init)=>{if(String(url).endsWith('/images/generations'))return new Response(JSON.stringify({output_format:'png',data:[{b64_json:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='}]}));const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);if(p.task==='intake')return response({kind:'proposal',message:'A quiet mystery. Ready?',profile:testProfile,evidence:[{field:'mood',quote:'tired'},{field:'direction',quote:'accompany'},{field:'experience',quote:'quiet mystery'},{field:'exclusions',quote:'graphic violence'},{field:'intensity',quote:'gentle'}]});return provider(url,init);}) as typeof fetch}});const url=await app.listen();
  const nativeFetch=globalThis.fetch,jar=new Map<string,string>(),storage=new Map<string,string>();let lose='',replacement:string|null=null;const sent:{path:string;body:any}[]=[];
  t.mock.method(globalThis,'fetch',async(p:string,init?:RequestInit)=>{if(init?.body)sent.push({path:p,body:JSON.parse(String(init.body))});const r=await nativeFetch(url+p,{...init,headers:{...init?.headers,Cookie:[...jar].map(([k,v])=>k+'='+v).join('; ')}});for(const item of r.headers.getSetCookie()){const pair=item.split(';')[0]!,i=pair.indexOf('=');jar.set(pair.slice(0,i),pair.slice(i+1));}if(p===lose){lose='';await r.text();throw Error('lost response');}if(replacement&&p.startsWith('/api/emotional/current')){const data=await r.json() as any;data.flow.seal=createHash('sha256').update(replacement).digest('hex');return new Response(JSON.stringify(data));}if(replacement&&p.startsWith('/api/emotional/reveal'))return new Response(JSON.stringify({canonical:replacement,hash:createHash('sha256').update(replacement).digest('hex')}));return r;});
  const restore:(()=>void)[]=[];for(const[key,value]of Object.entries({document:{hidden:false,addEventListener(){},removeEventListener(){}},window:{location:{search:''},addEventListener(){},removeEventListener(){}},sessionStorage:{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>{storage.set(k,v);}},localStorage:{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>{storage.set(k,v);}},EventSource:class{addEventListener(){}close(){}}})){const old=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{value,configurable:true});restore.push(()=>{if(old)Object.defineProperty(globalThis,key,old);else Reflect.deleteProperty(globalThis,key);});}
  const renderer=createRenderer<object,object>({createElement:()=>({}),createText:()=>({}),createComment:()=>({}),insert(){},remove(){},setText(){},setElementText(){},patchProp(){},parentNode:()=>null,nextSibling:()=>null});let component:ReturnType<typeof renderer.createApp>,ui!:ReturnType<typeof useEmotional>;
  async function mount(){component=renderer.createApp({setup(){ui=useEmotional(prepared);return()=>null;}});component.mount({});while(ui.loading.value)await new Promise(r=>setImmediate(r));}
  await mount();t.after(async()=>{component.unmount();await app.close();for(const fn of restore)fn();});
  async function wait(status:string){for(let i=0;i<200;i++){await ui.refresh();if(ui.flow.value?.status===status)return;await new Promise(r=>setImmediate(r));}assert.fail('Status '+status+' not reached.');}
  async function prepare(){await ui.newAdventure();await ui.answer(answer);await wait('proposal');await ui.confirm();await wait('ready');await ui.act('start');}
  return{get ui(){return ui;},prepare,wait,sent,storage,replaceEnvelope:(text:string)=>{replacement=text;},loseNext:(path:string)=>{lose=path;},setTime:(at:number)=>{time=at;},setClientTime:(at:number)=>{clientTime=at;},remount:async()=>{component.unmount();await mount();}};
}
test('prepared mode isolates pending preview actions and starts the sealed example directly',async t=>{
 const h=await harness(t,{},true),pending=JSON.stringify({kind:'new',requestId:'preview-only-pending'});
 h.storage.set('sealed-emotional-pending-v1',pending);await h.remount();assert.equal(h.ui.pending.value,null);
 await h.ui.newAdventure();assert.equal(h.ui.flow.value?.status,'ready');assert.equal(h.ui.flow.value?.adventure?.title,'The Shelter Sheet');
 assert.equal(h.storage.get('sealed-emotional-pending-v1'),pending);assert.equal(h.sent.filter(s=>s.path==='/api/demo/new').length,1);assert.equal(h.sent.filter(s=>s.path.startsWith('/api/emotional/')).length,0);
 await h.remount();assert.equal(h.ui.flow.value?.status,'ready');assert.ok(h.ui.commitmentStored.value);
});
test('a lost intake response is recovered without posting the answer or charging a second call',async t=>{
  const h=await harness(t);await h.ui.newAdventure();h.loseNext('/api/emotional/chat');await h.ui.answer(answer);assert.ok(h.ui.pending.value);assert.equal(h.ui.quotaLimited.value,false);await h.ui.refresh();assert.equal(h.ui.pending.value,null);await h.wait('proposal');assert.equal(h.sent.filter(x=>x.path==='/api/emotional/chat').length,1);
});
test('reading page and one running deadline survive remount after losing the begin response',async t=>{
  const h=await harness(t);await h.prepare();h.ui.nextPage();const page=h.ui.pageIndex.value;assert.ok(page>0);await h.remount();assert.equal(h.ui.pageIndex.value,page);assert.equal(h.ui.flow.value!.adventure!.deadline,null);
  h.loseNext('/api/emotional/action');await h.ui.act('begin');assert.ok(h.ui.pending.value);await h.remount();assert.equal(h.ui.pending.value,null);assert.equal(h.ui.flow.value!.adventure!.deadline,13000);assert.equal(h.ui.flow.value!.adventure!.phase,'deciding');assert.equal(h.sent.filter(x=>x.body.kind==='begin').length,1);
});
test('reconnection displays the server timeout and a lost choice never enables a second decision',async t=>{
  const h=await harness(t);await h.prepare();await h.ui.act('begin');h.setTime(13000);await h.ui.refresh();assert.equal(h.ui.flow.value!.adventure!.scene.id,'D1T');assert.ok(h.ui.notice.value);await h.ui.act('continue');await h.ui.act('begin');h.loseNext('/api/emotional/action');await h.ui.act('choose','B');await h.remount();assert.equal(h.ui.pending.value,null);assert.equal(h.ui.flow.value!.adventure!.scene.id,'D2B');assert.equal(h.ui.flow.value!.adventure!.decisions.length,2);assert.equal(h.sent.filter(x=>x.body.kind==='choose').length,1);
});
test('late snapshots cannot overwrite a newer choice or switch back to an older adventure',()=>{
  const old={id:'old',generation:1,createdAt:100,revision:4,serverNow:1000} as EmotionalFlowSnapshot;
  assert.equal(acceptEmotionalSnapshot(old,{...old,revision:3,serverNow:1001}),false);assert.equal(acceptEmotionalSnapshot(old,{...old,revision:4,serverNow:999}),false);assert.equal(acceptEmotionalSnapshot(old,{...old,id:'new',generation:2,createdAt:100,revision:0}),true);assert.equal(acceptEmotionalSnapshot({...old,id:'new',generation:2,createdAt:100},old),false);
});
test('browser verification hashes the exact sealed bytes and detects changed text',async()=>{
  const canonical='{"story":"a quiet mystery"}',hash=createHash('sha256').update(canonical).digest('hex');assert.equal(await verifyEmotionalSeal(canonical,hash),true);assert.equal(await verifyEmotionalSeal(canonical+' ',hash),false);
});
test('verification retains the pre-play commitment across reload and rejects a replacement envelope with its own valid hash',async t=>{
  const h=await harness(t);await h.prepare();const original=h.ui.flow.value!.seal;
  while(h.ui.flow.value!.status!=='finished'){if(h.ui.flow.value!.adventure!.scene.decision){await h.ui.act('begin');await h.ui.act('choose','A');}else await h.ui.act('continue');}
  await h.remount();h.replaceEnvelope('{"changed":"after play"}');await h.ui.refresh();await h.ui.openEnvelope();
  assert.equal(h.ui.sealVerified.value,false);assert.equal(h.ui.initialSeal.value,original);
});
test('delayed clock updates cannot add seconds to the same decision and the next decision starts fresh',async t=>{
 const h=await harness(t);await h.prepare();await h.ui.act('begin');const deadline=h.ui.flow.value!.adventure!.deadline;
 h.setClientTime(3000);h.setTime(4000);await h.ui.refresh();assert.equal(h.ui.remaining.value,9000);
 h.setClientTime(4000);await h.ui.refresh();assert.equal(h.ui.remaining.value,8000);assert.equal(h.ui.flow.value!.adventure!.deadline,deadline);
 await h.ui.act('choose','A');await h.ui.act('continue');h.setTime(5000);await h.ui.act('begin');assert.equal(h.ui.remaining.value,12000);assert.equal(h.ui.flow.value!.adventure!.deadline,17000);
});
test('a timeout notice is shown once, clears with page navigation and stays dismissed after remount',async t=>{
 const h=await harness(t);await h.prepare();await h.ui.act('begin');h.setTime(13000);await h.ui.refresh();assert.ok(h.ui.notice.value);
 h.ui.nextPage();assert.equal(h.ui.notice.value,'');await h.ui.refresh();assert.equal(h.ui.notice.value,'');await h.remount();assert.equal(h.ui.notice.value,'');assert.equal(h.ui.flow.value!.adventure!.decisions.length,1);
});
test('reloading immediately after a timeout snapshot cannot lose the notice before navigation acknowledges it',async t=>{
 const h=await harness(t);await h.prepare();await h.ui.act('begin');h.setTime(13000);await h.ui.refresh();assert.ok(h.ui.notice.value);await h.remount();assert.ok(h.ui.notice.value);
 h.ui.nextPage();await h.remount();assert.equal(h.ui.notice.value,'');
});
test('new page layouts preserve a word anchor and migrate the old reader position without starting a clock',async t=>{
 const h=await harness(t);await h.prepare();const f=h.ui.flow.value!,paragraphs=f.adventure!.scene.paragraphs;
 const oldPages=paginateStory(paragraphs),oldOffset=oldPages.slice(0,3).flat().join(' ').trim().split(/\s+/).length;
 h.storage.set('sealed-emotional-page:'+f.id+':S1','3');h.storage.delete('sealed-emotional-position:'+f.id+':S1');await h.remount();
 const ui=h.ui as ReturnType<typeof useEmotional>&{layoutReading:(pages:string[][])=>void};assert.equal(typeof ui.layoutReading,'function');
 ui.layoutReading([paragraphs.slice(0,3),paragraphs.slice(3)]);
 const before=paragraphs.slice(0,3).join(' ').trim().split(/\s+/).length;assert.equal(ui.pageIndex.value,oldOffset<before?0:1);
 assert.equal(h.storage.get('sealed-emotional-position:'+f.id+':S1'),String(oldOffset));assert.equal(ui.flow.value!.adventure!.deadline,null);assert.equal(h.sent.filter(r=>r.body.kind==='begin').length,0);
 await h.remount();assert.equal(h.storage.get('sealed-emotional-position:'+f.id+':S1'),String(oldOffset));
});
test('starting another adventure after finishing preserves the old envelope and exposes no old ending in the new intake',async t=>{
 const h=await harness(t);await h.prepare();const first=h.ui.flow.value!.id,seal=h.ui.flow.value!.seal;
 while(h.ui.flow.value!.status!=='finished'){if(h.ui.flow.value!.adventure!.scene.decision){await h.ui.act('begin');await h.ui.act('choose','B');}else await h.ui.act('continue');}
 await h.ui.openEnvelope();const bytes=h.ui.reveal.value!.canonical;
 await h.ui.newAdventure();assert.equal(h.ui.flow.value!.status,'chat');assert.notEqual(h.ui.flow.value!.id,first);assert.equal(h.ui.flow.value!.adventure,null);assert.equal(h.ui.reveal.value,null);
 await h.ui.loadMemories();assert.ok(h.ui.memories.value.some(m=>m.id===first));assert.equal(h.storage.get('sealed-emotional-seal:'+first),seal);assert.equal(createHash('sha256').update(bytes).digest('hex'),seal);
});

test('a preparation quota rejection can be dismissed without reconnecting or resubmitting the saved proposal',async t=>{
 const h=await harness(t,{dailyJobs:1});await h.prepare();
 while(h.ui.flow.value!.status!=='finished'){if(h.ui.flow.value!.adventure!.scene.decision){await h.ui.act('begin');await h.ui.act('choose','A');}else await h.ui.act('continue');}
 await h.ui.newAdventure();await h.ui.answer(answer);await h.wait('proposal');
 const saved=JSON.parse(JSON.stringify(h.ui.flow.value!.profile)),id=h.ui.flow.value!.id;
 await h.ui.confirm();assert.equal(h.ui.flow.value!.status,'proposal');assert.equal(h.ui.pending.value,null);assert.equal(h.ui.connected.value,true);
 assert.match(h.ui.error.value,/preparation limit has been reached/);assert.equal(h.ui.quotaLimited.value,true);
 const confirms=h.sent.filter(x=>x.path==='/api/emotional/confirm').length;
 h.ui.dismissError();assert.equal(h.ui.error.value,'');assert.equal(h.ui.quotaLimited.value,false);
 assert.equal(h.ui.flow.value!.id,id);assert.deepEqual(h.ui.flow.value!.profile,saved);assert.equal(h.sent.filter(x=>x.path==='/api/emotional/confirm').length,confirms);
});
