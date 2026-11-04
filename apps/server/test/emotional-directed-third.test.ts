import{test}from'node:test';import assert from'node:assert/strict';import{createHash}from'node:crypto';
import{generateEmotional,newGenerationCheckpoint,type GenerationCheckpoint}from'../src/emotional-generation.js';
import{renderPassages}from'../src/emotional-dialogue.js';
import{providerFixture,testProfile}from'./emotional-fixtures.js';
const sha=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
async function rejected(){let cp:GenerationCheckpoint|undefined;await assert.rejects(generateEmotional(testProfile,{apiKey:'test',withArt:false,fetch:providerFixture({badBlock:'S1',alwaysBad:true}),onCheckpoint:c=>{cp=structuredClone(c);}}),/validation failed/i);assert.equal(cp!.repairPass,2);return cp!;}

test('explicit directed third pass repairs selected blocks and dependencies, preserving original and other blocks',async()=>{
 const cp=await rejected(),original=structuredClone(cp),keys:string[]=[],requests:any[]=[];const provider=providerFixture();
 const r=await generateEmotional(testProfile,{apiKey:'test',checkpoint:cp,withArt:false,concurrency:3,directedThirdRepair:{sourceSha256:sha(cp),issues:{S1:['Repair the bound speaker own voice and preserve public concessions.']}},fetch:(async(u,i)=>{requests.push(JSON.parse(JSON.parse(String(i?.body)).messages[1].content));return provider(u,i);})as typeof fetch,onStart:s=>{keys.push(s.key);}});
 assert.deepEqual(cp,original);assert.equal(r.checkpoint.repairPass,3);assert.deepEqual(r.validation.issues,{});assert.deepEqual(new Set(keys),new Set(['S1','S2','ARRA','ARRB','D2A','D2B'].map(id=>'repair3:'+id)));
 for(const id of Object.keys(cp.blocks))if(!keys.includes('repair3:'+id))assert.deepEqual(r.checkpoint.blocks[id],cp.blocks[id]);
 assert.equal(r.checkpoint.directedThirdRepair!.sourceSha256,sha(cp));assert.equal(r.checkpoint.blockPasses!.S1,3);assert.ok(!r.canonical.includes('directedThirdRepair'));
 const s2=requests.find(p=>p.block==='S2');assert.deepEqual(s2.projection.context.earlier_public_dialogue,r.checkpoint.blocks.S1!.passages!.filter(p=>p.speaker!=='NARRATOR').map(p=>({speaker:p.speaker,addressee:p.addressee,text:p.text})));
 assert.doesNotMatch(s2.projection.context.continuity_boundary,/brief thanks|public audience/i);
 const d2=requests.find(p=>p.block==='D2A');assert.deepEqual(d2.projection.context.earlier_public_dialogue,r.checkpoint.blocks.S2!.passages!.filter(p=>p.speaker!=='NARRATOR').map(p=>({speaker:p.speaker,addressee:p.addressee,text:p.text})));assert.ok(!JSON.stringify(d2).includes(cp.world!.private_reason));
 assert.equal(new Set(keys).size,keys.length);
});
test('third repair rejects fresh, incomplete or mismatched source before any provider call',async()=>{
 const good=await rejected();for(const cp of[newGenerationCheckpoint(),{...good,revision:'3c-47'},{...good,initialComplete:[]}]){let calls=0;await assert.rejects(generateEmotional(testProfile,{apiKey:'test',checkpoint:cp as any,withArt:false,directedThirdRepair:{sourceSha256:sha(cp),issues:{S1:['voice']}},fetch:async()=>{calls++;throw Error('No call allowed');}}),/directed third/i);assert.equal(calls,0);}
 let calls=0;await assert.rejects(generateEmotional(testProfile,{apiKey:'test',checkpoint:good,withArt:false,directedThirdRepair:{sourceSha256:'0'.repeat(64),issues:{S1:['voice']}},onStart:()=>{calls++;}}),/source/i);assert.equal(calls,0);
});
test('third repair is bounded and a committed block resumes without repeating calls',async()=>{
 const cp=await rejected(),provider=providerFixture(),before:string[]=[],after:string[]=[];let partial:GenerationCheckpoint|undefined;const stop=Error('stop after third S1');
 await assert.rejects(generateEmotional(testProfile,{apiKey:'test',checkpoint:cp,withArt:false,concurrency:1,directedThirdRepair:{sourceSha256:sha(cp),issues:{S1:['voice']}},fetch:provider,onStart:s=>{before.push(s.key);},onCheckpoint:c=>{partial=structuredClone(c);if(c.repairPass===3&&c.repairsComplete.includes('S1'))throw stop;}}),e=>e===stop);
 const r=await generateEmotional(testProfile,{apiKey:'test',checkpoint:partial!,withArt:false,fetch:provider,onStart:s=>{after.push(s.key);}});assert.equal(r.checkpoint.repairPass,3);assert.ok(after.length);assert.ok(after.every(k=>k.startsWith('repair3:')&&!before.includes(k)));assert.deepEqual(r.validation.issues,{});
 let last:GenerationCheckpoint|undefined;await assert.rejects(generateEmotional(testProfile,{apiKey:'test',checkpoint:cp,withArt:false,directedThirdRepair:{sourceSha256:sha(cp),issues:{S1:['voice']}},fetch:providerFixture({badBlock:'S1',alwaysBad:true}),onCheckpoint:c=>{last=structuredClone(c);}}),/validation failed/i);assert.equal(last!.repairPass,3);assert.ok(last!.receipts.every(r=>!r.key.startsWith('repair4:')));
});

test('third pass refuses unfinished second-pass work or an authorization marker in the wrong pass',async()=>{
 const cp=await rejected();for(const malformed of [{...cp,repairsComplete:[]},{...cp,directedThirdRepair:{sourceSha256:sha(cp),blocks:['S1']}}]){let calls=0;await assert.rejects(generateEmotional(testProfile,{apiKey:'test',checkpoint:malformed,withArt:false,fetch:async()=>{calls++;throw Error('forbidden');},...(malformed.directedThirdRepair?{}:{directedThirdRepair:{sourceSha256:sha(malformed),issues:{S1:['voice']}}})}),/directed third/i);assert.equal(calls,0);}
});

test('derived candidate refreshes display-only outer quotes without changing stored words or source',async()=>{
 const cp=await rejected(),parts=cp.blocks.F1!.passages!,speech=parts.find(p=>p.speaker!=='NARRATOR')!;speech.text='“'+speech.text+'”';cp.blocks.F1!.text=renderPassages({...cp.world!,endingPolicy:'outcome-reactions-1'},parts);
 const original=structuredClone(cp),r=await generateEmotional(testProfile,{apiKey:'test',checkpoint:cp,withArt:false,directedThirdRepair:{sourceSha256:sha(cp),issues:{S1:['voice']}},fetch:providerFixture()});
 assert.deepEqual(cp,original);assert.deepEqual(r.checkpoint.blocks.F1!.passages,original.blocks.F1!.passages);assert.deepEqual(r.validation.issues,{});
});

test('third-pass start is durably committed so a lost response cannot start again after restart',async()=>{
 const source=await rejected();let persisted:GenerationCheckpoint|undefined,starts=0;
 await assert.rejects(generateEmotional(testProfile,{apiKey:'test',checkpoint:source,withArt:false,directedThirdRepair:{sourceSha256:sha(source),issues:{S1:['voice']}},onCheckpoint:c=>{persisted=structuredClone(c);},onStart:()=>{starts++;},fetch:async()=>{throw Error('lost response');}}),/transport|response/i);
 assert.equal(starts,1);let after=0;await assert.rejects(generateEmotional(testProfile,{apiKey:'test',checkpoint:persisted!,withArt:false,onStart:()=>{after++;},fetch:providerFixture()}),/not committed|uncommitted/i);assert.equal(after,0);
});

test('new games receive grounded continuity without enabling a third repair',async()=>{
 const provider=providerFixture(),requests:any[]=[];const r=await generateEmotional(testProfile,{apiKey:'test',withArt:false,concurrency:3,fetch:(async(u,i)=>{requests.push(JSON.parse(JSON.parse(String(i?.body)).messages[1].content));return provider(u,i);})as typeof fetch});
 const expected=r.checkpoint.blocks.S2!.passages!.filter(p=>p.speaker!=='NARRATOR').map(p=>({speaker:p.speaker,addressee:p.addressee,text:p.text}));
 for(const id of['D2A','D2B']){const p=requests.find(p=>p.block===id);assert.deepEqual(p.projection.context.earlier_public_dialogue,expected);assert.equal(p.editorial_constraints,undefined);assert.match(p.instruction,/I\/me\/my/);}
 assert.equal(r.checkpoint.directedThirdRepair,undefined);assert.ok(r.checkpoint.repairPass<=2);
});
