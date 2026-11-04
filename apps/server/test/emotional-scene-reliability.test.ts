import {test} from 'node:test';import assert from 'node:assert/strict';
import {ambiguousRelationship} from '../src/emotional-continuity.js';
import {reflectionIssues,reflectionProjection} from '../src/emotional-reliability.js';
import {emotionalFixture} from '../../../packages/engine/test/emotional-fixture.js';
import {story3c} from '../../../packages/engine/test/emotional-story-fixture.js';
import {emotionalProjection,compileEmotionalFacts} from '../../../packages/engine/src/emotional.js';
const world=()=>{const w=emotionalFixture().world;w.story=story3c;w.narrationPolicy='protagonist-camera-5';w.prosePolicy='scene-prose-2' as any;return w;};
test('singular explicitly identified recipient is not an unnamed gift pair',()=>{
 const check=(s:string)=>ambiguousRelationship(s,['Mara','June'],['Robin'],true);
 assert.equal(check('Mara wants the recipient to look long at the work in private and notice every careful mark the creator left for them.'),false);
 for(const s of ['The recipient wants Robin to keep the work the creator made for them.','The recipient tells the custodian to cherish every mark of the work the creator left for them.','Keep the gift private for them.','The creator wants the recipient to notice each mark, but keep the gift between them.','The creator wants the gift private for just them.','The recipient and creator matter, but keep our gift between us.'])assert.equal(check(s),true,s);
});
test('new ending guards reject the actual wrong table position and false wish recap after timeout',()=>{
 const w=world();assert.ok(reflectionIssues(w,'F1','Their hands rested still on the table edge.').length);
 assert.deepEqual(reflectionIssues(w,'F1','Their hands rested loosely together.'),[]);
 assert.deepEqual(reflectionIssues(w,'F1','Their hands never rested on the table.'),[]);
 assert.ok(reflectionIssues(w,'F6',"To let the creator's wish for open resting stand meant setting aside the recipient's wish for quiet, private thanks.").length);
 assert.deepEqual(reflectionIssues(w,'F6','The paper remained in their keeping, with no answer demanded.'),[]);
});
test('new reactions do not repeatedly receive the opening atmosphere and both wishes; closing knows actual custody',()=>{
 const w=world();const p:any=emotionalProjection(w,'D3B');reflectionProjection(w,'D3B',p);
 assert.equal(p.context.public_wishes,undefined);assert.equal(p.context.sensory_detail,undefined);assert.equal(p.context.place.atmosphere,undefined);assert.equal(p.context.past_memory,undefined);
 const f:any=emotionalProjection(w,'F6');reflectionProjection(w,'F6',f);assert.equal(f.context.public_wishes,undefined);assert.match(f.context.visible_arrangement,/retains|remains with/i);assert.match(f.context.focus,/keep|retain/i);
 const opening:any=emotionalProjection(w,'S1');reflectionProjection(w,'S1',opening);assert.ok(opening.context.public_wishes&&opening.context.past_memory&&opening.context.place.atmosphere);
});
test('new opening compiles lowercase catalogue fragments into grammatical prose and preserves old bytes',()=>{
 const w=world();w.work.visual={material:'flat paper',subject:'a night bus stop',figures:'none',detail_one:'a yellow lamp',detail_two:'a red scarf',detail_three:'rain across the sky'};w.record.name='note';
 const text=compileEmotionalFacts(w).AAA!.S1!;assert.match(text,/The note lies/);assert.match(text,/On flat paper appears a night bus stop/);assert.doesNotMatch(text,/[.!?] [a-z]/);for(const value of ['yellow lamp','red scarf','rain across the sky',w.story!.anchor])assert.ok(text.includes(value));
 w.prosePolicy='scene-prose';const old=compileEmotionalFacts(w);delete w.prosePolicy;assert.notDeepEqual(compileEmotionalFacts(w),old);
});

test('new generation distributes development over exchanges and removes repeated mood cues from later calls',async()=>{
 const {generateEmotional}=await import('../src/emotional-generation.js');const {providerFixture,testProfile}=await import('./emotional-fixtures.js');const fixture=providerFixture();let first=0,second=0;
 const r=await generateEmotional(testProfile,{apiKey:'test',withArt:false,fetch:(async(url,init)=>{
  const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);if(p.task!=='world'){
   if(p.block==='S1'){assert.equal(req.model,'muse-wonder-1.0');first=p.paragraphs;assert.ok(p.profile.mood);assert.match(p.wire_plan.p02_lead,/optional|empty/i);}
   else{assert.equal(p.profile.mood,undefined);assert.deepEqual(p.profile.exclusions,['graphic violence']);}
   if(p.block==='S2')second=p.paragraphs;
   for(const v of Object.values(p.paragraph_plan)){const voice=String(v);if(p.reaction_contract)assert.ok(p.reaction_contract==='present-reactions-1'?voice==='FIRST_PERSON'||voice==='NARRATOR>NONE':['NARRATOR>NONE','HOST>PLAYER','RECIPIENT>PLAYER','PLAYER>HOST','PLAYER>RECIPIENT'].includes(voice));else assert.ok(p.dialogue_contract.speakers.includes(voice.split('>')[0]));}
  }return fixture(url,init);
 })as typeof fetch});
 assert.equal(r.checkpoint.revision,'3c-54');assert.equal(first,20);assert.equal(second,22);assert.equal(r.artifact.world.prosePolicy,'scene-prose-3');assert.deepEqual(r.validation.issues,{});assert.ok(r.validation.wordRange[0]>=2000&&r.validation.wordRange[1]<=2400);
});

test('local word budgets keep every assembled route within acceptance even with a sixty-word readable motive',async()=>{
 const {narrativeBudget,narrativeWords}=await import('../src/emotional-reliability.js');const {emotionalRoutes,emotionalEnding}=await import('../../../packages/engine/src/emotional.js');const w=world();w.private_reason=Array.from({length:60},(_,i)=>'memory'+i).join(' ');const facts=compileEmotionalFacts(w);
 for(const route of emotionalRoutes){const ids=['S1','D1'+route[0],'S2','D2'+route[1],'ARR'+route[0],'S3','D3'+route[2],emotionalEnding(route)];const maximum=ids.reduce((n,id)=>n+narrativeBudget(w,id).max+narrativeWords((facts[route] as Record<string,string>)[id]??''),0);assert.ok(maximum<=2400,route+': '+maximum);}
});
test('complete visual sentences and existing note articles remain grammatical in new facts',()=>{
 const w=world();w.record.name='the folded note';w.work.visual={material:'flat paper',subject:'a harbour at dusk',figures:'none',detail_one:'A blue band follows the lower edge.',detail_two:'A grey cloud hangs over the harbour.',detail_three:'The white tower has a square window.'};const text=compileEmotionalFacts(w).AAA!.S1!;
 assert.doesNotMatch(text,/The the|include a blue band follows/);assert.match(text,/blue band follows the lower edge/);assert.match(text,/grey cloud hangs over the harbour/);
});

test('only the custodian can claim to hold the work in a bound utterance',async()=>{
 const {dialogueIssues,renderPassages}=await import('../src/emotional-dialogue.js');const w=world();const passages=[{speaker:'RECIPIENT' as const,addressee:'PLAYER' as const,lead:'',text:'I am still holding the sheet while the disagreement goes on.',tail:''}];
 assert.ok(dialogueIssues(w,'S1',{text:renderPassages(w,passages),passages,claims:[]}).length);
 passages[0]!.text='I am keeping my hands together while the disagreement goes on.';assert.deepEqual(dialogueIssues(w,'S1',{text:renderPassages(w,passages),passages,claims:[]}),[]);
 for(const text of ['I hold the work in high regard.','I keep the work in mind.','I hold the work dear.']){passages[0]!.text=text;assert.deepEqual(dialogueIssues(w,'S1',{text:renderPassages(w,passages),passages,claims:[]}),[],text);}
});
