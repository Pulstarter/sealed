import {test} from 'node:test';import assert from 'node:assert/strict';
import {sceneParagraphCount,sceneParagraphVoice,sceneBeatPlan} from '../src/emotional-beats.js';
import {story3c} from '../../../packages/engine/test/emotional-story-fixture.js';
import {emotionalFixture} from '../../../packages/engine/test/emotional-fixture.js';
import {compileEmotionalFacts,emotionalRoutes} from '../../../packages/engine/src/emotional.js';
import {narrativeBudget} from '../src/emotional-reliability.js';
import {renderPassages} from '../src/emotional-dialogue.js';

test('scene prose puts public exchanges in the opening and keeps reflection and endings shorter',()=>{
 assert.equal(sceneParagraphCount('S1'),12);assert.equal(sceneParagraphCount('S2'),14);assert.equal(sceneParagraphCount('S3'),6);assert.equal(sceneParagraphCount('F1'),5);
 const voices=(id:string)=>Array.from({length:sceneParagraphCount(id)},(_,i)=>sceneParagraphVoice(id,i+1));
 assert.equal(voices('S1').filter(v=>v!=='NARRATOR>NONE').length,7);assert.equal(voices('S2').filter(v=>v!=='NARRATOR>NONE').length,8);
 assert.ok(voices('S2').every(v=>v==='NARRATOR>NONE'||['HOST>PLAYER','PLAYER>HOST'].includes(v)));
 for(const id of ['S3','D1T','ARRT','F3','F4','F5','F6'])assert.ok(voices(id).every(v=>v==='NARRATOR>NONE'));
 const plan=sceneBeatPlan('S2');assert.equal(Object.keys(plan).length,14);assert.match(JSON.stringify(plan),/answer|respond/i);
 const w=emotionalFixture().world;w.prosePolicy='scene-prose';
 assert.ok(narrativeBudget(w,'S1').target>2*narrativeBudget(w,'S3').target);
 assert.ok(narrativeBudget(w,'S2').target>2*narrativeBudget(w,'F1').target);
});
test('new factual prose preserves every route consequence, names, clue and wishes; old prose stays exact',()=>{
 const w=emotionalFixture().world;w.story=story3c;w.prosePolicy='story-facts';const before=compileEmotionalFacts(w);w.prosePolicy='scene-prose';const after=compileEmotionalFacts(w);
 for(const r of emotionalRoutes)for(const id of Object.keys(before[r]!))if(!['S1','S2','S3'].includes(id))assert.equal((after[r] as Record<string,string>)[id],(before[r] as Record<string,string>)[id]);
 const opening=after.AAA!.S1!;assert.doesNotMatch(opening,/has made a wish known/);for(const value of [w.host.name,w.recipient.name,w.host.public_wish,w.recipient.public_wish])assert.ok(opening.includes(value));
 assert.match(after.BAA!.S2!,/before.*viewing|not.*viewing|yet/i);
 w.prosePolicy='story-facts';assert.deepEqual(compileEmotionalFacts(w),before);
});
test('new speech rendering capitalizes and separates attribution without changing stored fragments or old rendering',()=>{
 const w=emotionalFixture().world;const passages=[{speaker:'HOST' as const,addressee:'PLAYER' as const,lead:'',text:'would that be enough?',tail:''},{speaker:'PLAYER' as const,addressee:'HOST' as const,lead:'',text:'perhaps',tail:''}];const before=structuredClone(passages),legacy=renderPassages(w,passages);
 w.prosePolicy='scene-prose';const text=renderPassages(w,passages);assert.match(text,/“Would that be enough\?”/);assert.match(text,/“Perhaps,”/);assert.deepEqual(passages,before);
 delete w.prosePolicy;assert.equal(renderPassages(w,passages),legacy);
});

test('revision34 free prose and dialogue beats are requested and bound without modifying raw paragraphs',async()=>{
 const {generateEmotional,newGenerationCheckpoint}=await import('../src/emotional-generation.js');const {providerFixture,testProfile}=await import('./emotional-fixtures.js');const provider=providerFixture();let checked=false;
 const r=await generateEmotional(testProfile,{apiKey:'test',withArt:false,checkpoint:{...newGenerationCheckpoint(),revision:'3c-34'},fetch:(async(url,init)=>{
  const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);if(p.task!=='world'){
   assert.ok(req.response_format.json_schema.schema.properties.p01_text);assert.equal(req.response_format.json_schema.schema.properties.p01_observation,undefined);
   assert.equal(p.paragraphs,sceneParagraphCount(p.block));assert.equal(Object.keys(p.projection.context.scene_beats).length,p.paragraphs);
   if(p.block==='S1'){assert.equal(p.paragraph_plan.p3,'RECIPIENT>HOST');checked=true;}
  }return provider(url,init);
 })as typeof fetch});assert.ok(checked);assert.equal(r.checkpoint.revision,'3c-34');assert.equal(r.artifact.world.prosePolicy,'scene-prose');assert.deepEqual(r.validation.issues,{});assert.equal(r.validation.routes.length,27);
});
