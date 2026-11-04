import test from 'node:test';
import assert from 'node:assert/strict';
import {generateEmotional as generateCurrent,validateEmotionalArtifact,newGenerationCheckpoint} from '../src/emotional-generation.js';
import {providerFixture,response,testProfile} from './emotional-fixtures.js';
import {renderPassages} from '../src/emotional-dialogue.js';
import {story3c} from '../../../packages/engine/test/emotional-story-fixture.js';
import {compileEmotionalFacts} from '../../../packages/engine/src/emotional.js';

// Stored revision19 remains covered with its original prose contract.
const generateEmotional:typeof generateCurrent=(profile,options)=>generateCurrent(profile,{checkpoint:{...newGenerationCheckpoint(),revision:'3c-19'},...options});

test('new prose binds speaker and listener before compiling dialogue, without exposing the sealed past',async()=>{
 const fixture=providerFixture();let checked=false;
 const fetcher=(async(url,init)=>{
  const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);
  if(p.task==='block'){
   assert.equal(req.model,'muse-spark-1.3');
   assert.equal(req.response_format.json_schema.schema.properties.p1.type,'object');
   assert.ok(p.dialogue_contract);
   assert.ok(!JSON.stringify(p).includes(story3c.sealed_truth));
   checked=true;
  }
  return fixture(url,init);
 })as typeof fetch;
 const r=await generateEmotional(testProfile,{apiKey:'test-key',fetch:fetcher,withArt:false});
 assert.ok(checked);assert.equal(r.checkpoint.revision,'3c-19');
 assert.equal(r.artifact.blocks.S1!.passages?.length,17);
});

test('typed dialogue rejects the reproduced player-authorship errors and misattributed narration',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'test-key',fetch:providerFixture(),withArt:false});
 const cases=[
  {speaker:'RECIPIENT',addressee:'PLAYER',text:'You have drawn nobody coming.'},
  {speaker:'HOST',addressee:'PLAYER',text:'You have made the rooftops almost black.'},
  {speaker:'PLAYER',addressee:'HOST',text:'I painted this work for Ren.'},
  {speaker:'NARRATOR',addressee:'NONE',text:'"I drew the work," Alex said.'},
  {speaker:'NARRATOR',addressee:'NONE',text:'Alex painted the watercolor for Ren.'},
  {speaker:'NARRATOR',addressee:'NONE',text:'Alex has painted this watercolor for Ren.'},
  {speaker:'NARRATOR',addressee:'NONE',text:'Ren has created the work.'},
  {speaker:'HOST',addressee:'PLAYER',text:"You've made the rooftops almost black."},
  {speaker:'RECIPIENT',addressee:'PLAYER',text:'You’ve drawn nobody coming.'},
  {speaker:'PLAYER',addressee:'HOST',text:"I've painted this watercolor for Ren."},
  {speaker:'NARRATOR',addressee:'NONE',text:'‘Your painting feels patient,’ Ren said to Alex.'},
  {speaker:'NARRATOR',addressee:'NONE',text:'Ren said: You should be proud of your painting, Alex.'},
  {speaker:'NARRATOR',addressee:'NONE',text:'The blue still feels patient to me, Tessa said to Alex.'},
  {speaker:'NARRATOR',addressee:'NONE',text:'Tessa said, You can take your time with that question.'},
  {speaker:'NARRATOR',addressee:'NONE',text:'I can wait here and keep looking at the blue until the light changes.'},
 ];
 for(const passage of cases){
  const a=structuredClone(r.artifact);
  a.blocks.S1!.passages=[passage]as any;
  a.blocks.S1!.text=renderPassages(a.world,a.blocks.S1!.passages!);
  assert.match(validateEmotionalArtifact(a,testProfile).issues.S1?.join(' ')??'',/author|creator|hide dialogue/i,passage.text);
 }
});

test('a typed speech paragraph is compiled from its actual named creator and listener',async()=>{
 const fixture=providerFixture();
 const fetcher=(async(url,init)=>{
  const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content),res=await fixture(url,init);
  if(p.block!=='ARRA')return res;
  const raw=await res.json(),v=JSON.parse(raw.choices[0].message.content);
  v.p2={lead:'Tessa kept her hands still.',text:'I drew the work. I hoped the colors could make a small pause feel different.',tail:'Alex looked at the blue.'};
  return response(v,req.model);
 })as typeof fetch;
 const r=await generateEmotional(testProfile,{apiKey:'test-key',fetch:fetcher,withArt:false});
 assert.match(r.artifact.blocks.ARRA!.text,/Tessa Vale said to Alex/);
 assert.match(r.artifact.blocks.ARRA!.text,/Tessa kept her hands still\. “I drew the work\./);
 assert.ok(!r.artifact.blocks.ARRA!.text.includes('“Tessa kept her hands still.'));
 assert.equal(r.artifact.blocks.ARRA!.passages![1]!.tail,'Alex looked at the blue.');
 assert.deepEqual(r.validation.issues,{});
 const tampered=structuredClone(r.artifact);tampered.blocks.ARRA!.text+=' A different attribution.';
 assert.ok(validateEmotionalArtifact(tampered,testProfile).issues.ARRA);
});

test('dialogue cannot assign an absent speaker, an ambiguous you, or speech to an inaction branch',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'test-key',fetch:providerFixture(),withArt:false});
 for(const [id,passage]of[
  ['ARRA',{speaker:'RECIPIENT',addressee:'PLAYER',text:'I would like to listen.'}],
  ['D1T',{speaker:'PLAYER',addressee:'NONE',text:'I would like to listen.'}],
  ['ARRA',{speaker:'HOST',addressee:'NONE',text:'You need no answer.'}],
 ]as const){const a=structuredClone(r.artifact);a.blocks[id]!.passages=[passage];a.blocks[id]!.text=renderPassages(a.world,[passage]);assert.match(validateEmotionalArtifact(a,testProfile).issues[id]?.join(' ')??'',/present|inaction|listener/i,id);}
});

test('an authorship error gets exactly one targeted repair; a persistent error never seals',async()=>{
 for(const persistent of [false,true]){
  const fixture=providerFixture(),keys:string[]=[];
  const fetcher=(async(url,init)=>{
   const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);
   keys.push(p.task+':'+(p.block??''));const res=await fixture(url,init);
   if(p.block!=='S1'||(!persistent&&p.task==='repair'))return res;
   const raw=await res.json(),v=JSON.parse(raw.choices[0].message.content);
   v.p5={lead:'Tessa kept her hands still.',text:"You've made the roofs almost black.",tail:'Alex kept looking at the dark windows.'};
   return response(v,req.model);
  })as typeof fetch;
  const attempt=generateEmotional(testProfile,{apiKey:'test-key',fetch:fetcher,withArt:false});
  if(persistent)await assert.rejects(attempt,/validation failed/i);
  else{const r=await attempt;assert.deepEqual(r.checkpoint.repairsComplete,['S1']);assert.deepEqual(r.validation.issues,{});}
  assert.deepEqual(keys.filter(k=>k.startsWith('repair:')),['repair:S1']);
 }
});

test('a known creator can be addressed as you without falsely accusing the custodian of authorship',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'test-key',fetch:providerFixture(),withArt:false});
 const a=structuredClone(r.artifact),p=a.blocks.S1!.passages!;
 p[0]={speaker:'PLAYER',addressee:'HOST',text:"You've painted this watercolor for Ren. I would like to understand the way the blue sits beside the darker line, although I can wait for that answer while we look at the work together tonight."};
 a.blocks.S1!.text=renderPassages(a.world,p);assert.deepEqual(validateEmotionalArtifact(a,testProfile).issues,{});
});

test('an existing 3c-5 checkpoint stays on Wonder and resumes without another call',async()=>{
 const fixture=providerFixture();let proseCalls=0;
 const cp={revision:'3c-5' as const,blocks:{},initialComplete:[],repairPass:0 as const,repairsComplete:[],images:[],receipts:[]};
 const fetcher=(async(url,init)=>{const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);if(p.block){assert.equal(req.model,'muse-wonder-1.0');proseCalls++;}return fixture(url,init);})as typeof fetch;
 const r=await generateEmotional(testProfile,{apiKey:'test-key',fetch:fetcher,checkpoint:cp,withArt:false});assert.equal(proseCalls,21);
 const resumed=await generateEmotional(testProfile,{apiKey:'test-key',fetch:(async()=>{throw Error('No new charge');})as typeof fetch,checkpoint:r.checkpoint,withArt:false});
 assert.equal(resumed.canonical,r.canonical);assert.equal(resumed.hash,r.hash);
});

test('narration may refer to prior speech without impersonating a speaker',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'test-key',fetch:providerFixture(),withArt:false});
 for(const text of [
  'The question had not yet been said. Tessa waited to see what Alex made of it. Rain made the room feel smaller while Alex remembered the public wish Tessa had expressed earlier that evening.',
  'Earlier that evening, Tessa said that she hoped the colors could be seen without ceremony.',
  'Tessa had said, earlier that evening, that she hoped the colors could be seen without ceremony.',
  'Alex followed the wash where the pigment lifted and caught the lamp. The blue held steady, they said, while the pale edge looked rubbed away. Tessa listened without correcting them, her hands suddenly still.',
 ]){const a=structuredClone(r.artifact),p=a.blocks.S1!.passages!;p[0]={speaker:'NARRATOR',addressee:'NONE',text};a.blocks.S1!.text=renderPassages(a.world,p);assert.deepEqual(validateEmotionalArtifact(a,testProfile).issues,{},text);}
});

test('the paired voice contract cannot request a self-listener or a listener for narration',async()=>{
 const fixture=providerFixture();let seen=false;
 const fetcher=(async(url,init)=>{const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);if(p.block==='S1'){
  assert.equal(req.response_format.json_schema.schema.properties.p1.properties.voice,undefined);
  assert.equal(req.response_format.json_schema.schema.properties.p1.properties.speaker,undefined);
  assert.deepEqual(req.response_format.json_schema.schema.properties.p1.properties.lead.enum,['']);
  assert.equal(p.paragraph_plan.p5,'HOST>PLAYER');assert.equal(p.paragraph_plan.p10,'PLAYER>HOST');seen=true;
 }return fixture(url,init);})as typeof fetch;
 await generateEmotional(testProfile,{apiKey:'test-key',fetch:fetcher,withArt:false});assert.ok(seen);
});

test('a short Spark first pass calibrates the single repair without increasing paragraph count or weakening route length',async()=>{
 const counts=new Map<string,number>(),repairs:string[]=[];
 const fetcher=(async(url,init)=>{
  const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);
  if(!p.block)return providerFixture()(url,init);
  const dense=['S1','S2','S3'].includes(p.block),ratio=(dense?20:28)/35;
  if(p.task==='block')counts.set(p.block,p.paragraphs);
  else{repairs.push(p.block);assert.equal(p.paragraphs,counts.get(p.block));}
  return providerFixture({paragraphWords:p.task==='repair'?Math.floor(p.target_words/p.paragraphs*ratio):dense?20:28})(url,init);
 })as typeof fetch;
 const r=await generateEmotional(testProfile,{apiKey:'test-key',fetch:fetcher,withArt:false});
 assert.equal(r.checkpoint.repairPass,1);assert.ok(repairs.length>0&&repairs.length<21);
 assert.ok(r.validation.wordRange[0]>=2000&&r.validation.wordRange[1]<=2400);
});

test('editorial regressions: absent guests, a digital display and speech tags inside a spoken line reject',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'test-key',fetch:providerFixture(),withArt:false});
 for(const [id,passage,reason]of[
  ['D3T',{speaker:'NARRATOR',addressee:'NONE',text:'Tessa shifted nearby, arms folded. Ren glanced between the work and the board.'},/present|guest|actor/i],
  ['S3',{speaker:'NARRATOR',addressee:'NONE',text:'Across the room the public display board cycled through notices, its letters refreshing in pale green.'},/physical|static|electronic|board/i],
  ['S2',{speaker:'HOST',addressee:'PLAYER',text:'I keep thinking about the blue, Tessa says softly, and how it holds.'},/tag|dialogue|speaker/i],
 ]as const){const a=structuredClone(r.artifact);a.blocks[id]!.passages![0]=passage;a.blocks[id]!.text=renderPassages(a.world,a.blocks[id]!.passages!);assert.match(validateEmotionalArtifact(a,testProfile).issues[id]?.join(' ')??'',reason);}
});

test('an ending can recall the authorized private past without placing the recipient in the present',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'test-key',fetch:providerFixture(),withArt:false});
 const a=structuredClone(r.artifact);a.world.private_reason='Tessa made the work to thank Ren for sitting awake through a long fearful night last spring.';a.world.record.inside=a.world.private_reason;a.factualText=compileEmotionalFacts(a.world);
 const p=a.blocks.F1!.passages!;p[0]={speaker:'NARRATOR',addressee:'NONE',text:'Last spring Ren sat awake with Tessa through a long fearful night, and Tessa had made the drawing afterward to thank them and to say she had not forgotten.'};a.blocks.F1!.text=renderPassages(a.world,p);assert.deepEqual(validateEmotionalArtifact(a,testProfile).issues,{});
 const past=p[0].text;
 for(const current of [' Now Ren shifted beside Tessa and glanced at the drawing.','; at this moment Ren smiles beside Tessa at the viewing bench.','; in the present Ren stood beside Tessa at the viewing bench.',', but at this moment Ren smiles beside Tessa at the viewing bench.','; Ren is beside Tessa at the viewing bench in the present.']){p[0].text=past+current;a.blocks.F1!.text=renderPassages(a.world,p);assert.match(validateEmotionalArtifact(a,testProfile).issues.F1?.join(' ')??'',/present|actor|guest/i,current);}
 const b=structuredClone(a);b.blocks.S3!.passages![0]={speaker:'NARRATOR',addressee:'NONE',text:'Last spring Ren sat awake with Tessa through a long fearful night.'};b.blocks.S3!.text=renderPassages(b.world,b.blocks.S3!.passages!);assert.ok(validateEmotionalArtifact(b,testProfile).issues.S3);
});

test('speech punctuation or fragment boundaries cannot conceal a raw private motive',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'test-key',fetch:providerFixture(),withArt:false});
 const motive='An ordinary color recalled a promise kept after a long difficult afternoon.';
 for(const split of [false,true]){
  const a=structuredClone(r.artifact);a.world.private_reason=motive;a.world.record.inside=motive;a.factualText=compileEmotionalFacts(a.world);
  const passage=a.blocks.S1!.passages![4]!;
  passage.lead=split?'An ordinary color recalled':'';passage.text=split?'a promise kept after a long difficult afternoon.':motive;passage.tail='';a.blocks.S1!.text=renderPassages(a.world,a.blocks.S1!.passages!);
  assert.match(validateEmotionalArtifact(a,testProfile).issues.S1?.join(' ')??'',/private|leak|motive/i);
 }
});

test('a planned repair receives raw fragments with the forbidden motive redacted before punctuation formatting',async()=>{
 const fixture=providerFixture(),motive='An ordinary color recalled a promise kept after a long difficult afternoon.';let repaired=false;
 const fetcher=(async(url,init)=>{const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content),res=await fixture(url,init),raw=await res.json(),v=JSON.parse(raw.choices[0].message.content);
  if(p.task==='world')v.private_reason=motive;
  if(p.block==='S1'&&p.task==='block')v.p5={lead:'An ordinary color recalled',text:'a promise kept after a long difficult afternoon.',tail:''};
  if(p.block==='S1'&&p.task==='repair'){repaired=true;assert.ok(!JSON.stringify(p).includes(motive));assert.match(p.rejected_text,/withheld/);}
  return response(v,req.model);
 })as typeof fetch;
 const r=await generateEmotional(testProfile,{apiKey:'test-key',fetch:fetcher,withArt:false});assert.ok(repaired);assert.deepEqual(r.validation.issues,{});
});

test('making room is not creating the work, and a generic reading room is not reading the note',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'test-key',fetch:providerFixture(),withArt:false});
 const a=structuredClone(r.artifact);a.world.venue.name='Harbor Light Reading Room';
 a.blocks.D3B!.passages![0]={speaker:'NARRATOR',addressee:'NONE',text:'Alex made room beside the chair. The reading room stayed warm around them.'};a.blocks.D3B!.text=renderPassages(a.world,a.blocks.D3B!.passages!);assert.ok(!validateEmotionalArtifact(a,testProfile).issues.D3B);
 a.blocks.D3B!.passages![0]!.text+=' Alex read the explanation in the reading room.';a.blocks.D3B!.text=renderPassages(a.world,a.blocks.D3B!.passages!);assert.match(validateEmotionalArtifact(a,testProfile).issues.D3B?.join(' ')??'',/handling|reading|actions/i);
});

test('one brief canonical-note recap in a known ending is allowed; duplicated filler and public leaks still reject',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'test-key',fetch:providerFixture(),withArt:false});
 const a=structuredClone(r.artifact),reason='Tessa made the drawing to apologize for missing the last winter ferry ride with Ren and a friend, which she had promised to take while the lamps were still bright.';
 a.world.private_reason=reason;a.world.record.inside=reason;a.factualText=compileEmotionalFacts(a.world);
 a.blocks.F2!.passages![0]={speaker:'NARRATOR',addressee:'NONE',text:reason};a.blocks.F2!.text=renderPassages(a.world,a.blocks.F2!.passages!);assert.ok(!validateEmotionalArtifact(a,testProfile).issues.F2);
 a.blocks.F2!.passages![1]={speaker:'NARRATOR',addressee:'NONE',text:reason};a.blocks.F2!.text=renderPassages(a.world,a.blocks.F2!.passages!);assert.match(validateEmotionalArtifact(a,testProfile).issues.F2?.join(' ')??'',/repeat/i);
 a.blocks.S3!.passages![0]={speaker:'NARRATOR',addressee:'NONE',text:reason};a.blocks.S3!.text=renderPassages(a.world,a.blocks.S3!.passages!);assert.match(validateEmotionalArtifact(a,testProfile).issues.S3?.join(' ')??'',/private|leak/i);
});

for(const paragraphWords of [12,24])test(`a semantic-only repair preserves its original word budget for ${paragraphWords}-word paragraphs when the complete routes already fit`,async()=>{
 const normal=providerFixture(),short=providerFixture({paragraphWords});let originalTarget=0,sawRepair=false;
 const fetcher=(async(url,init)=>{const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);if(p.block!=='S3')return normal(url,init);if(p.task==='block'){originalTarget=p.target_words;const res=await short(url,init),raw=await res.json(),v=JSON.parse(raw.choices[0].message.content);v.p1.text='The schema. '+v.p1.text;return response(v,req.model);}sawRepair=true;assert.equal(p.target_words,originalTarget);return short(url,init);})as typeof fetch;
 const r=await generateEmotional(testProfile,{apiKey:'test-key',fetch:fetcher,withArt:false});assert.ok(sawRepair);assert.deepEqual(r.checkpoint.repairsComplete,['S3']);assert.deepEqual(r.validation.issues,{});
});

test('taking a slow breath does not attribute creation, while drawing a line still does',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'test-key',fetch:providerFixture(),withArt:false});
 for(const [text,rejected]of [['Alex drew a slow breath and let their shoulders drop.',false],['Alex drew a long breath.',false],['Alex drew a slow line along the lower edge.',true]]as const){
  const a=structuredClone(r.artifact);a.blocks.F3!.passages![0]={speaker:'NARRATOR',addressee:'NONE',text};a.blocks.F3!.text=renderPassages(a.world,a.blocks.F3!.passages!);
  assert.equal((validateEmotionalArtifact(a,testProfile).issues.F3??[]).some(s=>/created the work/.test(s)),rejected,text);
 }
});

test('the world admission also gets its HOST attribution before sealing',async()=>{
 const fixture=providerFixture();
 const fetcher=(async(url,init)=>{const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);const res=await fixture(url,init);if(p.task!=='world')return res;const raw=await res.json(),w=JSON.parse(raw.choices[0].message.content);w.story.scene_two='I wanted someone to stay with it a minute, not to tell me it is good.';return response(w,req.model);})as typeof fetch;
 const r=await generateEmotional(testProfile,{apiKey:'test-key',fetch:fetcher,withArt:false});
 assert.match(r.artifact.world.story!.scene_two,/Tessa Vale said to Alex/);
 assert.ok(r.artifact.factualText.AAA!.S2!.includes(r.artifact.world.story!.scene_two));
});

test('a public world admission cannot make PLAYER its creator or conceal a second voice',async()=>{
 for(const line of ['You drew the blue square for Ren.','Tessa says, I want it seen.','I opened the folded grey card.']){
  const fixture=providerFixture();let proseCalls=0;
  const fetcher=(async(url,init)=>{const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);if(p.task!=='world')proseCalls++;const res=await fixture(url,init);if(p.task!=='world')return res;const raw=await res.json(),w=JSON.parse(raw.choices[0].message.content);w.story.scene_two=line;return response(w,req.model);})as typeof fetch;
  await assert.rejects(generateEmotional(testProfile,{apiKey:'test-key',fetch:fetcher,withArt:false}),/admission/i);assert.equal(proseCalls,0);
 }
});

test('the raw world admission is checked for secrets before punctuation is compiled',async()=>{
 const fixture=providerFixture();let proseCalls=0;
 const fetcher=(async(url,init)=>{const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);if(p.task!=='world')proseCalls++;const res=await fixture(url,init);if(p.task!=='world')return res;const raw=await res.json(),w=JSON.parse(raw.choices[0].message.content);w.private_reason='Tessa made the watercolor to thank Ren for waiting beside her last winter.';w.story.scene_two=w.private_reason;return response(w,req.model);})as typeof fetch;
 await assert.rejects(generateEmotional(testProfile,{apiKey:'test-key',fetch:fetcher,withArt:false}),/private|leak/i);assert.equal(proseCalls,0);
});

test('a shared scene cannot declare the maker and recipient absent',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'test-key',fetch:providerFixture(),withArt:false});
 const a=structuredClone(r.artifact);a.blocks.S3!.passages![0]={speaker:'NARRATOR',addressee:'NONE',text:'The people this was made between were not here.'};a.blocks.S3!.text=renderPassages(a.world,a.blocks.S3!.passages!);
 assert.match(validateEmotionalArtifact(a,testProfile).issues.S3?.join(' ')??'',/attendance|absent/i);
});
