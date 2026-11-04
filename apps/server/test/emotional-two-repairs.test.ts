import {test} from 'node:test';import assert from 'node:assert/strict';
import {generateEmotional,newGenerationCheckpoint,type GenerationCheckpoint} from '../src/emotional-generation.js';
import {providerFixture,testProfile,response} from './emotional-fixtures.js';

function staged(cleanSecond=true,twoBlocks=false){
 const base=providerFixture(),requests:any[]=[];
 const fetcher=(async(url,init)=>{
  const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);requests.push(p);
  const res=await base(url,init);
  if((p.task==='block'||p.task==='repair')&&(p.block==='S1'||twoBlocks&&p.block==='F1')&&(!cleanSecond||p.repair_pass!==2)){
   const raw=await res.json(),wire=JSON.parse(raw.choices[0].message.content);wire.p01_text+=' This plot branch mentions schema.';return response(wire,req.model);
  }return res;
 })as typeof fetch;
 return {fetch:fetcher,requests};
}

test('new adventures may repair twice with separate paid-call keys and final block provenance',async()=>{
 const provider=staged(),keys:string[]=[],passes:number[]=[];
 const r=await generateEmotional(testProfile,{apiKey:'test',withArt:false,fetch:provider.fetch,onStart:s=>{keys.push(s.key);},onValidation:v=>{passes.push(v.pass);}});
 assert.equal(r.checkpoint.revision,'3c-54');assert.equal(r.checkpoint.repairPass,2);assert.deepEqual(r.validation.issues,{});
 assert.ok(keys.includes('repair:S1'));assert.ok(keys.includes('repair2:S1'));assert.equal(new Set(keys).size,keys.length);
 for(const id of ['S1','S2']){const requests=provider.requests.filter(p=>p.block===id);assert.ok(requests.every(p=>p.target_words===requests[0].target_words),'content repair preserves the requested volume: '+id);}
 assert.deepEqual(passes,[0,1,2]);assert.equal(r.checkpoint.blockPasses?.S1,2);
 assert.ok(r.checkpoint.completedRepairKeys?.includes('repair:S1'));assert.ok(r.checkpoint.completedRepairKeys?.includes('repair2:S1'));
 assert.ok(!r.canonical.includes('completedRepairKeys'));assert.ok(!r.canonical.includes('blockPasses'));assert.ok(!r.canonical.includes('requestedWords'));
 for(const id of Object.keys(r.checkpoint.requestedWords!)){const last=provider.requests.filter(p=>p.block===id).at(-1);assert.equal(r.checkpoint.requestedWords![id],last.target_words,id);}
});

test('a persistent failure is rejected after two repairs without a third call or seal',async()=>{
 const provider=staged(false),keys:string[]=[];let cp:GenerationCheckpoint|undefined;
 await assert.rejects(generateEmotional(testProfile,{apiKey:'test',withArt:false,fetch:provider.fetch,onStart:s=>{keys.push(s.key);},onCheckpoint:c=>{cp=structuredClone(c);}}),/validation failed/i);
 assert.equal(cp!.repairPass,2);assert.equal(keys.filter(k=>k==='repair:S1').length,1);assert.equal(keys.filter(k=>k==='repair2:S1').length,1);assert.ok(!keys.some(k=>k.startsWith('repair3:')));
});

test('revision47 still stops after one repair',async()=>{
 const provider=staged(false),keys:string[]=[];
 await assert.rejects(generateEmotional(testProfile,{apiKey:'test',withArt:false,checkpoint:{...newGenerationCheckpoint(),revision:'3c-47'},fetch:provider.fetch,onStart:s=>{keys.push(s.key);}}),/validation failed/i);
 assert.ok(keys.includes('repair:S1'));assert.ok(!keys.some(k=>k.startsWith('repair2:')));
});

test('a committed second-pass block resumes without repeating either earlier paid call',async()=>{
 const provider=staged(true,true),before:string[]=[],after:string[]=[];let cp:GenerationCheckpoint|undefined;const stop=new Error('simulated stop after checkpoint');
 await assert.rejects(generateEmotional(testProfile,{apiKey:'test',withArt:false,concurrency:1,fetch:provider.fetch,onStart:s=>{before.push(s.key);},onCheckpoint:c=>{cp=structuredClone(c);if(c.repairPass===2&&c.repairsComplete.length===1)throw stop;}}),e=>e===stop);
 assert.equal(cp!.repairPass,2);assert.equal(cp!.repairsComplete.length,1);
 const r=await generateEmotional(testProfile,{apiKey:'test',withArt:false,checkpoint:cp,concurrency:1,fetch:provider.fetch,onStart:s=>{after.push(s.key);}});
 assert.deepEqual(r.validation.issues,{});assert.equal(r.checkpoint.repairPass,2);assert.ok(after.length>0);assert.ok(after.every(k=>k.startsWith('repair2:')));assert.ok(after.every(k=>!before.includes(k)));assert.equal(new Set([...before,...after]).size,before.length+after.length);
});

test('service restart recognizes both committed repair rounds and counts their progress',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {EmotionalStore}=await import('../src/emotional-store.js');const {EmotionalService}=await import('../src/emotional-service.js');
 const folder=await mkdtemp(join(tmpdir(),'sealed-two-rounds-')),file=join(folder,'test.sqlite');const provider=staged(true,true),specs:any[]=[];
 const result=await generateEmotional(testProfile,{apiKey:'test',withArt:false,concurrency:1,fetch:provider.fetch,onStart:s=>{specs.push(structuredClone(s));}});
 const id='11111111-1111-4111-8111-111111111111',owner='a'.repeat(64),store=new EmotionalStore(file);
 store.insert({id,ownerHash:owner,generation:1,createdAt:100,updatedAt:100,revision:0,status:'generating',confirmedAt:100,messages:[],profile:testProfile,checkpoint:result.checkpoint,canonical:null,seal:null,state:null,lastRequestId:'seed',error:null});
 for(const spec of specs){store.startCall(id,100,spec,1);store.finishCall(id,result.receipts.find(r=>r.key===spec.key)!,{fixture:true});}store.close();
 const service=new EmotionalService(file,()=>200);
 try{assert.equal(service.store.current(owner)!.status,'queued');assert.equal(service.store.calls(id).length,specs.length);const view=service.current(owner)!;assert.equal(view.progress!.done,specs.filter(s=>s.key!=='world').length);assert.equal(view.progress!.total,specs.filter(s=>s.key!=='world').length+3);}
 finally{await service.close();await rm(folder,{recursive:true,force:true});}
});


test('a second length correction expands from the observed complete exchanges without restoring the whole draft',async()=>{
 const {authoringRepairIndices}=await import('../src/emotional-scene-authoring.js');
 for(const [id,count]of [['S1',14],['S2',16]]as const){const indices=authoringRepairIndices(id,600,500,true,true,count);assert.equal(indices.length,count+3);assert.equal(indices[0],1);assert.equal(indices.at(-1),id==='S1'?20:22);}
});

test('both repair requests redact a rejected private motive before sending it back to the public writer',async()=>{
 const base=providerFixture(),seen:number[]=[];
 const r=await generateEmotional(testProfile,{apiKey:'test',withArt:false,fetch:(async(url,init)=>{
  const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content),res=await base(url,init);
  if(p.task==='repair'&&p.block==='D2A'){seen.push(p.repair_pass);assert.ok(!p.rejected_text.includes('Secret motive'));assert.ok(!JSON.stringify(p.projection).includes('Secret motive'));}
  if(p.block==='D2A'&&p.repair_pass!==2){const raw=await res.json(),wire=JSON.parse(raw.choices[0].message.content);wire.p01_text+=' Secret motive.';return response(wire,req.model);}return res;
 })as typeof fetch});
 assert.deepEqual(seen,[1,2]);assert.equal(r.checkpoint.repairPass,2);assert.deepEqual(r.validation.issues,{});
});


test('a completed but uncommitted second-pass response fails closed after restart',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {EmotionalStore}=await import('../src/emotional-store.js');const {EmotionalService}=await import('../src/emotional-service.js');
 const folder=await mkdtemp(join(tmpdir(),'sealed-orphan-round-')),file=join(folder,'test.sqlite'),provider=staged(true,true),specs:any[]=[];
 const result=await generateEmotional(testProfile,{apiKey:'test',withArt:false,concurrency:1,fetch:provider.fetch,onStart:s=>{specs.push(structuredClone(s));}});
 const checkpoint=structuredClone(result.checkpoint),orphan=checkpoint.completedRepairKeys!.find(k=>k.startsWith('repair2:'))!;assert.ok(orphan);
 checkpoint.completedRepairKeys=checkpoint.completedRepairKeys!.filter(k=>k!==orphan);checkpoint.repairsComplete=checkpoint.repairsComplete.filter(id=>'repair2:'+id!==orphan);
 const id='22222222-2222-4222-8222-222222222222',owner='b'.repeat(64),store=new EmotionalStore(file);
 store.insert({id,ownerHash:owner,generation:1,createdAt:100,updatedAt:100,revision:0,status:'generating',confirmedAt:100,messages:[],profile:testProfile,checkpoint,canonical:null,seal:null,state:null,lastRequestId:'seed',error:null});
 for(const spec of specs){store.startCall(id,100,spec,1);store.finishCall(id,result.receipts.find(r=>r.key===spec.key)!,{fixture:true});}store.close();
 const service=new EmotionalService(file,()=>200);
 try{const saved=service.store.current(owner)!;assert.equal(saved.status,'failed');assert.equal(saved.error,'interrupted');assert.equal(saved.seal,null);assert.equal(service.store.calls(id).length,specs.length);}
 finally{await service.close();await rm(folder,{recursive:true,force:true});}
});


test('unchanged responsibility is not solitude and cannot erase actual attendance in the same sentence',async()=>{
 const {attendanceProse}=await import('../src/emotional-3c.js');const {emotionalFixture}=await import('../../../packages/engine/test/emotional-fixture.js');const w=emotionalFixture().world;
 const flagged=(text:string)=>/\b(?:no one else|nobody else|empty bench|empty room)\b/iu.test(attendanceProse(w,text));
 for(const text of ['Practical responsibility for it had passed to no one else.','Responsibility had passed to nobody else.','No one else had lifted that obligation.','No one else has taken over responsibility for it.'])assert.equal(flagged(text),false,text);
 for(const text of ['No one else has taken over responsibility for it, and nobody else is present.','No one else sat beside Robin.','Practical responsibility for it had passed to no one else, and no one else sat at the bench.','No one else had lifted that obligation; the room was an empty room.'])assert.equal(flagged(text),true,text);
});
