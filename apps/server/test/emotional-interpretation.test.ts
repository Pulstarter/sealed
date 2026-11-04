import {test} from 'node:test';import assert from 'node:assert/strict';
import {emotionalFixture} from '../../../packages/engine/test/emotional-fixture.js';
import {story3c} from '../../../packages/engine/test/emotional-story-fixture.js';
import {compileEmotionalFacts} from '../../../packages/engine/src/emotional.js';
import {validateEmotionalArtifact} from '../src/emotional-generation.js';
import {reflectionIssues} from '../src/emotional-reliability.js';
import {dialogueIssues,renderPassages} from '../src/emotional-dialogue.js';
import {testProfile} from './emotional-fixtures.js';
function fixture(){const a=emotionalFixture();a.world.player_name='Robin';a.world.host.name='Mara';a.world.recipient.name='June';a.world.story=story3c;a.world.narrationPolicy='protagonist-camera-5';a.world.reactionPolicy='public-only';a.world.prosePolicy='scene-prose-3' as any;return a;}
const issues=(text:string)=>{const a=fixture();a.blocks.D2A={text,claims:[]};return validateEmotionalArtifact(a,testProfile).issues.D2A??[];};
test('reported old reading and that reading mean interpretation, not material reading',()=>{
 for(const s of ["Robin had walked in thinking Mara's cool manner meant indifference, and tonight that old reading no longer held.","That reading no longer fit the care still visible in Mara's manner.","Their earlier reading seemed too neat; Robin abandoned that interpretation."])assert.deepEqual(issues(s),[],s);
});
test('an interpretation phrase never masks an actual explanation-reading action',()=>{
 for(const s of ["Robin completed their first reading aloud.","Robin began an initial reading at once.","That old reading no longer held, so Robin read the explanation again.","Robin's old reading of the explanation left them certain.","Robin read the letter.","That reading of the note no longer fit."])assert.ok(issues(s).some(x=>/Material actions|record status/.test(x)),s);
});
test('all new route facts handle named originals with articles or possessives without doubled determiners',()=>{
 const a=fixture();for(const name of ['note','the envelope',"Mara's signed explanation",'a folded note']){
  a.world.record.name=name;const facts=compileEmotionalFacts(a.world) as Record<string,Record<string,string>>;
  for(const map of Object.values(facts))for(const text of Object.values(map))assert.doesNotMatch(text,/the (?:closed|open) (?:the|a|an|Mara['’]s)\b|The (?:the|a|an|Mara['’]s)\b/iu,name+': '+text);
  assert.match(facts.AAA!.D2A!,/opened the original/);assert.match(facts.AAA!.D3A!,/open original/);assert.doesNotMatch(facts.ABA!.D3A!,/open original/);assert.match(facts.BAA!.D3A!,/June[^.!?]*read/);
 }
});
test('new endings reject invented folding or restaging positions without banning mental idioms or looking',()=>{
 const w=fixture().world;
 assert.ok(reflectionIssues(w,'F4','It was no longer folded between their hands.').length);
 assert.deepEqual(reflectionIssues(w,'F6','Robin folded their attention around the unanswered thought.'),[]);
 assert.ok(reflectionIssues(w,'F1','Mara remained near the public display board.').length);
 assert.deepEqual(reflectionIssues(w,'F1',"Mara's concern remained unresolved."),[]);
 assert.deepEqual(reflectionIssues(w,'F1','Mara looked toward the public display board.'),[]);
 for(const text of ['Robin did not fold the work.',"Robin unfolded the work’s implications in thought.",'Robin stood by their decision about the display board.'])assert.deepEqual(reflectionIssues(w,'F1',text),[],text);
 w.work.name='Folded Paper';assert.deepEqual(reflectionIssues(w,'F6','Robin kept Folded Paper in mind.'),[]);assert.ok(reflectionIssues(w,'F4','Robin folded Folded Paper.').length);w.work.name='Evening [One]';assert.ok(reflectionIssues(w,'F4','Robin folded Evening [One].').length);
});
test('repair feedback identifies generic second person in narration precisely',()=>{
 const w=fixture().world;const passages=[{speaker:'NARRATOR' as const,addressee:'NONE' as const,text:'A response made in your hearing could still be careless.'}];const e=dialogueIssues(w,'S2',{passages,text:renderPassages(w,passages),claims:[]});assert.match(e.join(' '),/generic you\/your/);
});

test('new generation uses the existing prose model throughout and leaves ending staging empty',async()=>{
 const {generateEmotional}=await import('../src/emotional-generation.js');const {providerFixture}=await import('./emotional-fixtures.js');const provider=providerFixture();let ending=false;
 const r=await generateEmotional(testProfile,{apiKey:'test',withArt:false,fetch:(async(url,init)=>{
  const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);if(p.task!=='world'){
   assert.equal(req.model,'muse-wonder-1.0');
   if(p.block==='F1'){assert.deepEqual(req.response_format.json_schema.schema.properties.p02_lead.enum,['']);assert.deepEqual(req.response_format.json_schema.schema.properties.p02_tail.enum,['']);ending=true;}
  }return provider(url,init);
 })as typeof fetch});assert.ok(ending);assert.equal(r.checkpoint.revision,'3c-54');assert.equal(r.artifact.world.prosePolicy,'scene-prose-3');assert.deepEqual(r.validation.issues,{});
});
