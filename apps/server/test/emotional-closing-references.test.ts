import{test}from'node:test';import assert from'node:assert/strict';
import{fixtureWorld}from'../../../packages/engine/test/emotional-fixture.js';
import{endingReactionRequest}from'../src/emotional-ending.js';
import{generateEmotional}from'../src/emotional-generation.js';
import{providerFixture,response,testProfile}from'./emotional-fixtures.js';
const world=()=>({...fixtureWorld(),endingPolicy:'outcome-reactions-2'}as any);
const referenceError='Use fictional names or natural references, never state-ledger role labels.';
const pastError='Outcome closing: no reconstructed history, agreement, motive or new actor.';
function request(id='F6',repairPass?:1|2,feedback:string[]=[]){return endingReactionRequest(world(),id,{key:'test',words:80,plan:{p1:'NARRATOR>NONE',p2:'NARRATOR>NONE'},intensity:'gentle',exclusions:[],repairPass,repairFeedback:feedback}as any);}

test('closing prose references are resolved without naming a person outside its camera',()=>{
 const w=world();for(const id of['F5','F6']){const r=request(id),p=r.payload as any;
  assert.deepEqual(p.authorship,{creator:'the artist',recipient:'the intended recipient',custodian:w.player_name,boundary:p.authorship.boundary});
  assert.equal(p.current_outcome.actor,w.player_name);assert.ok(!p.current_outcome.consequence.includes('PLAYER'));
  assert.ok(!r.instructions.includes('HOST is its creator'));assert.match(r.instructions,/never.*(?:role|schema).*label/iu);
  assert.ok(!JSON.stringify(r).includes(w.host.name));assert.ok(!JSON.stringify(r).includes(w.recipient.name));
 }
});

test('repair carries only fixed guidance codes, never rejected text, wishes, history or unknown messages',()=>{
 const w=world();w.private_reason='PRIVATE_SECRET';w.host.public_wish='WISH_CANARY';w.story={sealed_truth:'SEALED_PAST'}as any;
 for(const repairPass of[1,2]as const){const r=endingReactionRequest(w,'F6',{key:'repair',words:80,plan:{p1:'NARRATOR>NONE',p2:'NARRATOR>NONE'},intensity:'gentle',exclusions:[],repairPass,repairFeedback:[referenceError,pastError,'Unknown PRIVATE_SECRET WISH_CANARY SEALED_PAST',referenceError+' PRIVATE_SECRET']}as any),p=r.payload as any;
  assert.deepEqual(p.repair_guidance.codes,['resolved_references','present_reaction']);assert.ok(p.repair_guidance.instructions.length===2);assert.equal(p.rejected_text,undefined);assert.equal(p.feedback,undefined);
  assert.ok(!JSON.stringify(r).includes('PRIVATE_SECRET'));assert.ok(!JSON.stringify(r).includes('WISH_CANARY'));assert.ok(!JSON.stringify(r).includes('SEALED_PAST'));
 }
 assert.equal((request().payload as any).repair_guidance,undefined);
});

for(const permanent of[false,true])test(permanent?'persisting closing role codes still fail after two directed repairs':'actual generation forwards closing repair failures and preserves bound after a corrected fixture',async()=>{
 const base=providerFixture(),repairs:any[]=[],keys:string[]=[];let cp:any;
 const options={apiKey:'fixture-only',withArt:false,onStart:(s:any)=>{keys.push(s.key);},onCheckpoint:(c:any)=>{cp=structuredClone(c);},fetch:(async(url,init)=>{
  const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content),res=await base(url,init);if(p.block!=='F5')return res;
  if(p.task==='repair'){repairs.push(p);assert.ok(p.repair_guidance.codes.includes('resolved_references'));assert.equal(p.authorship.recipient,'the intended recipient');assert.equal(p.rejected_text,undefined);}
  const raw=await res.json(),wire=JSON.parse(raw.choices[0].message.content);if(permanent||p.repair_pass!==2)wire.p01_text+=' HOST feels uncertain.';return response(wire,req.model);
 })as typeof fetch};
 if(permanent)await assert.rejects(generateEmotional(testProfile,options),/validation failed/iu);else{const r=await generateEmotional(testProfile,options);assert.deepEqual(r.validation.issues,{});assert.ok(r.canonical);}
 assert.equal(cp.repairPass,2);assert.deepEqual(repairs.map(r=>r.repair_pass),[1,2]);assert.ok(keys.includes('repair:F5')&&keys.includes('repair2:F5'));assert.ok(!keys.some(k=>k.startsWith('repair3:')));
});

test('fully wrapped legacy directed closing repair cannot reintroduce unknown editorial history',async()=>{
 const{directedRepairRequest}=await import('../src/emotional-directed-repair.js');const w=world(),unknown='Unknown diagnostic: the artist previously wished for applause. REJECTED_HISTORY_CANARY';
 const spec=endingReactionRequest(w,'F6',{key:'repair3:F6',words:80,plan:{p1:'NARRATOR>NONE',p2:'NARRATOR>NONE'},intensity:'gentle',exclusions:[],repairPass:3,repairFeedback:[referenceError,unknown]});
 const cp:any={revision:'3c-54',authoringPolicy:'grounded-continuity-3',world:w,directedThirdRepair:{sourceSha256:'0'.repeat(64),blocks:['F6']},repairPlan:{F6:{feedback:[unknown],paragraphs:2}}};
 const r=directedRepairRequest(cp,'F6',spec),p=r.payload as any;assert.equal(p.editorial_constraints,undefined);assert.ok(!JSON.stringify(r).includes('REJECTED_HISTORY_CANARY'));assert.deepEqual(p.repair_guidance.codes,['resolved_references']);
});

test('actual narrator and pronoun failures receive fixed voice guidance without diagnostic suffixes',async()=>{
 const{endingReactionIssues}=await import('../src/emotional-ending.js');const w=world();
 for(const text of['I feel uncertain.','Alex feels uncertain in her response.']){
  const failures=endingReactionIssues(w,'F6',{text,claims:[],passages:[{speaker:'NARRATOR',addressee:'NONE',text}]});assert.ok(failures.length);
  const r=request('F6',1,failures.map(x=>x+' VOICE_CANARY')),p=r.payload as any;assert.ok(p.repair_guidance.codes.includes('fixed_voices'));assert.match(p.repair_guidance.instructions.join(' '),/third.person/iu);assert.match(p.repair_guidance.instructions.join(' '),/singular they\/them/iu);assert.ok(!JSON.stringify(r).includes('VOICE_CANARY'));
 }
});
