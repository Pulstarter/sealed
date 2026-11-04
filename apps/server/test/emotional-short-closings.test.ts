import{test}from'node:test';import assert from'node:assert/strict';
import{fixtureWorld}from'../../../packages/engine/test/emotional-fixture.js';
import{endingReactionRequest,endingReactionIssues}from'../src/emotional-ending.js';
import{narrativeBudget}from'../src/emotional-reliability.js';
import{placesPersonHere}from'../src/emotional-3c.js';
import{generateEmotional}from'../src/emotional-generation.js';
import{providerFixture,testProfile}from'./emotional-fixtures.js';
const world=()=>({...fixtureWorld(),endingPolicy:'outcome-reactions-1'}as any);
const block=(text:string)=>({text,claims:[],passages:[{speaker:'NARRATOR' as const,addressee:'NONE' as const,text}]});
test('short ending requests use engine outcome only and retain exact bound voices',()=>{
 const w=world();w.private_reason='SECRET_CANARY';w.host.public_wish='WISH_CANARY';w.shared_past_memory='MEMORY_CANARY';
 for(const[id,placement]of[['F1','PUBLIC'],['F4','PUBLIC'],['F5','BOX'],['F6','PLAYER']])for(const pass of[undefined,1,2]as const){
  const req=endingReactionRequest(w,id!,{key:'test',words:240,plan:{p1:'NARRATOR>NONE',p2:'HOST>PLAYER',p3:'PLAYER>HOST'},intensity:'gentle',exclusions:[],repairPass:pass});const p=req.payload as any;
  assert.equal(p.reaction_contract,'outcome-reactions-1');assert.equal(p.current_outcome.placement,placement);assert.ok(p.target_words<=80);assert.match(req.instructions,/they\/them/);assert.match(p.wire_plan.p01_text,/third.person/iu);assert.equal(p.paragraph_plan.p2,'HOST>PLAYER');
  for(const canary of['SECRET_CANARY','WISH_CANARY','MEMORY_CANARY'])assert.ok(!JSON.stringify(req).includes(canary));assert.equal(p.rejected_text,undefined);
 }
 for(const id of['F1','F2','F3','F4','F5','F6'])assert.equal(narrativeBudget(w,id).target,80);
});
test('present inclination is allowed but historical consent, wrong voice and long padding reject',()=>{
 const w=world();assert.deepEqual(endingReactionIssues(w,'F4',block('Alex feels a wish for thoroughness, still uncertain how much care can accomplish.')),[]);
 for(const text of['Everyone agreed to display it.','I remember giving my blessing.','Alex had permission to display it.','I feel grateful because you supported this from the beginning.','Alex feels relief. '.repeat(45)])assert.ok(endingReactionIssues(w,'F4',block(text)).length,text);
 assert.ok(endingReactionIssues(w,'F3',block('Alex feels warm in his chest.')).length);
 assert.ok(endingReactionIssues(w,'F3',block('I feel close and unsettled.')).length);
 assert.ok(endingReactionIssues(w,'F5',block('The work is public on the board.')).length);
 assert.deepEqual(endingReactionIssues(w,'F5',block('Alex feels the relief of having finished, even though the closed box offers no answering look.')),[]);
});
test('relative public contribution is not current presence, but adjacent actions still are',()=>{
 const w=world(),n=w.recipient.name;
 assert.equal(placesPersonHere(w,'Quiet hides what '+n+' gave.',n),false);
 assert.equal(placesPersonHere(w,'Quiet hides what '+n+' gave; '+n+' stood beside Alex.',n),true);
 assert.equal(placesPersonHere(w,n+' gave Alex a reassuring nod.',n),true);
 assert.equal(placesPersonHere(w,'Alex saw what '+n+' gave them here tonight.',n),true);
});
test('new generation writes compact endings and feeds actual public S1 to S2 after a repair',async()=>{
 const provider=providerFixture({badBlock:'S1'}),requests:any[]=[];
 const r=await generateEmotional(testProfile,{apiKey:'test',withArt:false,concurrency:3,fetch:(async(url,init)=>{
  const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);requests.push(p);return provider(url,init);
 })as typeof fetch});
 assert.equal(r.checkpoint.revision,'3c-54');assert.equal(r.artifact.world.endingPolicy,'outcome-reactions-2');assert.deepEqual(r.validation.issues,{});
 for(const id of['F1','F2','F3','F4','F5','F6'])assert.equal(r.artifact.blocks[id]!.passages!.length,/^F[12]$/u.test(id)?3:2);
 const s2=requests.filter(p=>p.block==='S2');assert.ok(s2.length>=2);const last=s2.at(-1).projection.context.earlier_public_dialogue;
 assert.deepEqual(last,r.artifact.blocks.S1!.passages!.filter(p=>p.speaker!=='NARRATOR').map(p=>({speaker:p.speaker,addressee:p.addressee,text:p.text})));
 assert.ok(r.checkpoint.completedRepairKeys?.includes('repair:S2'));assert.ok(!JSON.stringify(last).includes(r.artifact.world.private_reason));
});

test('an existing limited concession remains true and transcripts cannot carry hidden material',async()=>{
 const{sequentialDialogueProjection,sequentialDialogueIssues}=await import('../src/emotional-dramaturgy.js');
 const w=world(),opening={text:'',claims:[],passages:[{speaker:'HOST' as const,addressee:'PLAYER' as const,text:'I can yield on the words; say something brief if you need to.'}]};
 assert.ok(sequentialDialogueIssues(opening,block('Why hold to asking that gratitude not be voiced at all?')).length);
 assert.deepEqual(sequentialDialogueIssues(opening,block('Brief spoken thanks remain welcome. Public witnesses are the unresolved part.')),[]);
 opening.passages.push({speaker:'HOST',addressee:'PLAYER',text:w.private_reason});const c:any={scene_beats:{}};sequentialDialogueProjection('S2',c,opening,w);
 assert.ok(!JSON.stringify(c).includes(w.private_reason));assert.match(c.continuity_boundary,/never deny, reset/iu);
});
test('restart after repaired S1 writes only its dependent S2 with the new transcript',async()=>{
 const provider=providerFixture({badBlock:'S1'});let cp:any;const stop=new Error('stop after committed S1');
 await assert.rejects(generateEmotional(testProfile,{apiKey:'test',withArt:false,concurrency:3,fetch:provider,onCheckpoint:c=>{cp=structuredClone(c);if(c.repairPass===1&&c.repairsComplete.includes('S1'))throw stop;}}),e=>e===stop);
 const keys:string[]=[],seen:any[]=[];
 const r=await generateEmotional(testProfile,{apiKey:'test',withArt:false,checkpoint:cp,fetch:(async(u,i)=>{const q=JSON.parse(String(i?.body)),p=JSON.parse(q.messages[1].content);seen.push(p);return provider(u,i);})as typeof fetch,onStart:s=>{keys.push(s.key);}});
 assert.ok(keys.includes('repair:S2'));assert.ok(!keys.includes('repair:S1'));assert.equal(new Set(keys).size,keys.length);
 const p=seen.find(p=>p.block==='S2');assert.deepEqual(p.projection.context.earlier_public_dialogue,r.artifact.blocks.S1!.passages!.filter(p=>p.speaker!=='NARRATOR').map(p=>({speaker:p.speaker,addressee:p.addressee,text:p.text})));assert.deepEqual(r.validation.issues,{});
});


test('outcome assertions bind to the work, never a metaphor, and preserve all placements',()=>{
 const w=world();
 for(const [id,text]of[['F1','The work remains in Alex’s hands.'],['F4','The work remains in the closed private box.'],['F5','The work is public.'],['F6','The sheet rests on the public display board.'],['F1','The work is not public.']])assert.ok(endingReactionIssues(w,id!,block(text!)).length,id+':'+text);
 for(const[id,text]of[['F5','Alex senses that their vulnerability remains public despite the closed box.'],['F1','The work is already public. Alex feels a sharper sense of exposure.'],['F5','The work stays inside the closed box. Alex feels a wish for thoroughness.'],['F6','The work remains in Alex’s hands. Alex feels the weight of that responsibility.']])assert.deepEqual(endingReactionIssues(w,id!,block(text!)),[],id+':'+text);
 w.player_name='Drew';assert.deepEqual(endingReactionIssues(w,'F4',block('Drew feels a quiet relief.')),[]);
});


test('a placement clause does not absorb a comparison, metaphor or another negation',()=>{
 const w=world();
 for(const text of['The work remains inside the closed box, while Alex’s unease remains public.','The work is inside the box rather than on the public board.','The work is not public but inside the closed box.'])assert.deepEqual(endingReactionIssues(w,'F5',block(text)),[],text);
 for(const text of['The work is not in the box but on the public board.','The work is not in Alex’s hands but on the public board.','The work is inside the box and on the public board.'])assert.ok(endingReactionIssues(w,'F5',block(text)).length,text);
});

test('remembered speech inside an utterance and naming a recipient do not stage them here',async()=>{
 const{dialogueIssues,renderPassages}=await import('../src/emotional-dialogue.js');const w=world();w.endingPolicy='outcome-reactions-2';
 const speech=(text:string)=>{const passages=[{speaker:'RECIPIENT' as const,addressee:'PLAYER' as const,text,lead:'',tail:''}];return{text:renderPassages(w,passages),claims:[],passages};};
 assert.deepEqual(dialogueIssues(w,'S1',speech('Alex, you softened when '+w.host.name+' said that, as if it settled my side too.')),[]);
 assert.ok(dialogueIssues(w,'S1',speech(w.host.name+' said: I feel relieved.')).length);
 assert.ok(dialogueIssues(w,'S1',speech(w.host.name+' said the answer gently.')).length);
 const n=w.recipient.name;
 assert.equal(placesPersonHere(w,'What still feels too much when '+n+' is named and gratitude is witnessed?',n),false);
 assert.equal(placesPersonHere(w,n+' was mentioned in the conversation.',n),false);
 assert.equal(placesPersonHere(w,n+' is named; '+n+' stood beside Alex.',n),true);
 assert.equal(placesPersonHere(w,n+' is standing at the bench.',n),true);
});
