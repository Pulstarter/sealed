import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateEmotional,validateEmotionalArtifact,wordCount} from '../src/emotional-generation.js';
import {dialogueIssues,renderPassages} from '../src/emotional-dialogue.js';
import {providerFixture,response,testProfile} from './emotional-fixtures.js';
import {emotionalFixture} from '../../../packages/engine/test/emotional-fixture.js';
import type {EmotionalPassage} from '../../../packages/engine/src/emotional-types.js';

test('reaction requests omit the private motive and its record, while the engine still reveals the original reason after reading',async()=>{
 const fixture=providerFixture(),requests:any[]=[];
 const r=await generateEmotional(testProfile,{apiKey:'test',withArt:false,fetch:(async(url,init)=>{
  const p=JSON.parse(JSON.parse(String(init?.body)).messages[1].content);if(p.task!=='world')requests.push(p);return fixture(url,init);
 }) as typeof fetch});
 for(const p of requests){
  if(p.reaction_contract){assert.equal(p.projection,undefined);assert.ok(!JSON.stringify(p).includes('Secret motive'));continue;}
  assert.ok(!JSON.stringify(p.projection).includes('Secret motive'),p.block);
  assert.equal(p.projection.context.record,undefined,p.block);
  assert.equal(p.projection.context.reason_subject,undefined,p.block);
  assert.ok(!Object.keys(p.projection.context.current_facts).some(k=>/knows|record/.test(k)),p.block);
  assert.equal(p.projection.permitted_claims.filter((claim:string)=>/record|knows/.test(claim)).length,0,p.block);
 }
 assert.match(r.artifact.factualText.AAA!.D2A!,/Secret motive/);
 assert.equal(r.artifact.world.private_reason,'Secret motive');
});

test('the reported note knowledge assertion is rejected without rejecting public authorship knowledge',async()=>{
 const a=(await generateEmotional(testProfile,{apiKey:'test',fetch:providerFixture(),withArt:false})).artifact;
 (a.world as any).reactionPolicy='public-only';
 const set=(text:string)=>{a.blocks.F3={text,claims:[]};};
 set('They recalled that the note nearby stood open, its thanks already known among the three adults.');
 assert.ok(validateEmotionalArtifact(a,testProfile).issues.F3?.some(s=>/knowledge|record|motive/i.test(s)));
 set('Alex knew who had made the work, and considered the two public wishes.');
 assert.ok(!(validateEmotionalArtifact(a,testProfile).issues.F3??[]).some(s=>/knowledge|record|motive/i.test(s)));
 delete (a.world as any).reactionPolicy;
 set('They recalled that the note nearby stood open, its thanks already known among the three adults.');
 assert.ok(!(validateEmotionalArtifact(a,testProfile).issues.F3??[]).some(s=>/Reaction knowledge|engine-owned knowledge/i.test(s)));
});

test('private relationships name their owners rather than moving them into the bound player exchange',()=>{
 const a=emotionalFixture();(a.world as any).reactionPolicy='public-only';
 const speech=(text:string)=>{const passages:EmotionalPassage[]=[{speaker:'RECIPIENT',addressee:'PLAYER',text,lead:'',tail:''}];return {text:renderPassages(a.world,passages),passages,claims:[]};};
 assert.ok(dialogueIssues(a.world,'ARRB',speech('I want it kept private, just between us alone.')).some(s=>/relationship|owners|ambiguous/i.test(s)));
 assert.deepEqual(dialogueIssues(a.world,'ARRB',speech('I want privacy between its creator and me.')),[]);
 assert.deepEqual(dialogueIssues(a.world,'ARRB',speech('Can we sit here a little longer?')),[]);
 assert.deepEqual(dialogueIssues(a.world,'ARRB',speech('Could we look at the gift for a moment?')),[]);
 assert.deepEqual(dialogueIssues(a.world,'ARRB',speech('We can talk about the public wishes, if that helps.')),[]);
 assert.deepEqual(dialogueIssues(a.world,'ARRB',speech('The creator and the recipient want privacy between them.')),[]);
 assert.deepEqual(dialogueIssues(a.world,'ARRB',speech('Tessa Vale and Ren Cole want privacy between them.')),[]);
 assert.deepEqual(dialogueIssues(a.world,'ARRB',speech('Tessa and Ren want privacy between them.')),[]);
});

test('an artwork title does not become the private note in the knowledge guard',async()=>{
 const a=(await generateEmotional(testProfile,{apiKey:'test',fetch:providerFixture(),withArt:false})).artifact;
 a.world.work.name='Open Letter';
 a.blocks.F3={text:'Open Letter was known to all three adults as Tessa’s work.',claims:[]};
 assert.ok(!(validateEmotionalArtifact(a,testProfile).issues.F3??[]).some(s=>/Reaction knowledge/.test(s)));
 a.blocks.F3.text='Open Letter was familiar, but the explanation nearby was read by everyone.';
 assert.ok(validateEmotionalArtifact(a,testProfile).issues.F3?.some(s=>/Reaction knowledge/.test(s)));
});

test('an explicit you-and-me pair cannot substitute the player for a gift owner',()=>{
 const a=emotionalFixture();(a.world as any).reactionPolicy='public-only';
 const passages:EmotionalPassage[]=[{speaker:'RECIPIENT',addressee:'PLAYER',text:'I want the gift kept private between you and me.',lead:'',tail:''}];
 assert.ok(dialogueIssues(a.world,'ARRB',{text:renderPassages(a.world,passages),passages,claims:[]}).some(s=>/relationship|owners|ambiguous/i.test(s)));
});

test('a player surname is not an alias for another gift owner',()=>{
 const a=emotionalFixture();a.world.player_name='Alex Ren';(a.world as any).reactionPolicy='public-only';
 const passages:EmotionalPassage[]=[{speaker:'RECIPIENT',addressee:'PLAYER',text:'Alex Ren and Tessa Vale want privacy between them.',lead:'',tail:''}];
 assert.ok(dialogueIssues(a.world,'ARRB',{text:renderPassages(a.world,passages),passages,claims:[]}).some(s=>/relationship|owners|ambiguous/i.test(s)));
});

test('an ambiguous world wish fails before any prose is requested',async()=>{
 const fixture=providerFixture();let calls=0;
 await assert.rejects(generateEmotional(testProfile,{apiKey:'test',withArt:false,fetch:(async(url,init)=>{
  calls++;const res=await fixture(url,init),raw=await res.json() as any,value=JSON.parse(raw.choices[0].message.content);value.recipient.public_wish='I want the gift kept private, just between us.';return response(value);
 }) as typeof fetch}),/relationship|owners|wish/i);
 assert.equal(calls,1);
});

test('nominal thank-you spelling is not treated as an unbound speaker',()=>{
 const a=emotionalFixture();
 for(const text of ['June wanted a clear thank-you, gently held and quickly accepted.','A short thank-you soothed, but it also turned away.','The recipient wanted a clear thank‑you without long scrutiny.']){
  const passages:EmotionalPassage[]=[{speaker:'NARRATOR',addressee:'NONE',text}];
  assert.deepEqual(dialogueIssues(a.world,'S1',{text:renderPassages(a.world,passages),passages,claims:[]}),[],text);
 }
 const passages:EmotionalPassage[]=[{speaker:'NARRATOR',addressee:'NONE',text:'Thank you, Alex.'}];
 assert.ok(dialogueIssues(a.world,'S1',{text:renderPassages(a.world,passages),passages,claims:[]}).length);
});

test('revision 29 semantic repair preserves its original calibrated request budget',async()=>{
 const fixture=providerFixture();let initialTarget=0,repairTarget=0;let beforeWords:number[]=[];
 const r=await generateEmotional(testProfile,{apiKey:'test',checkpoint:{revision:'3c-29',blocks:{},initialComplete:[],repairPass:0,repairsComplete:[],images:[],receipts:[]},withArt:false,onValidation:v=>{if(v.pass===0)beforeWords=v.wordRange;},fetch:(async(url,init)=>{
  const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content),res=await fixture(url,init);
  if(p.block!=='S1')return res;
  if(p.task==='repair'){repairTarget=p.target_words;return res;}
  initialTarget=p.target_words;const raw=await res.json() as any,value=JSON.parse(raw.choices[0].message.content);
  const before=wordCount(value.p1.text);value.p1.text=value.p1.text.replace('Rain','schema');assert.equal(wordCount(value.p1.text),before);
  return response(value,req.model);
 }) as typeof fetch});
 assert.ok(beforeWords[0]!>=2000&&beforeWords[1]!<=2400);
 assert.equal(repairTarget,initialTarget);
 assert.deepEqual(r.checkpoint.repairsComplete,['S1']);assert.deepEqual(r.validation.issues,{});
});
