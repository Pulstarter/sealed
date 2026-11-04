import test from 'node:test';
import assert from 'node:assert/strict';
import {generateEmotional as generateCurrent,validateEmotionalArtifact,newGenerationCheckpoint} from '../src/emotional-generation.js';
import {providerFixture,testProfile,response} from './emotional-fixtures.js';
import {emotionalProjection} from '../../../packages/engine/src/emotional.js';
import {renderPassages} from '../src/emotional-dialogue.js';

const visual={material:'flat watercolor on thick paper',subject:'A blue shoreline and a white lighthouse.',figures:'none',detail_one:'A blue band follows the lower edge.',detail_two:'A grey cloud hangs above the lighthouse.',detail_three:'The white tower has a square window.'};

// Stored revision19 remains covered with its original prose contract.
const generateEmotional:typeof generateCurrent=(profile,options)=>generateCurrent(profile,{checkpoint:{...newGenerationCheckpoint(),revision:'3c-19'},...options});

test('visible scenes share one visual catalogue rather than inventing the depicted people',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'test',fetch:providerFixture(),withArt:false});
 assert.deepEqual((r.artifact.world.work as any).visual,visual);
 for(const id of ['S1','S2','S3','ARRA','ARRB','ARRT','D3A','F1','F2','F3','F4','F6'])assert.deepEqual((emotionalProjection(r.artifact.world,id).context.work as any).visual,visual,id);
 assert.equal(r.artifact.world.story!.scene_three,'A grey cloud hangs above the lighthouse.');
 assert.match(r.artifact.factualText.AAA!.S1!,/image depicts no people/);
});

test('the recorded rendered-figure contradiction is rejected but actual room companions remain valid',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'test',fetch:providerFixture(),withArt:false});
 (r.artifact.world.work as any).visual=visual;
 for(const [text,rejected]of [
  ['Alex studied each rendered figure in turn. One figure stared at an unmarked doorway.',true],
  ['The painting showed two passengers waiting under the lighthouse.',true],
  ['No figures waited in the painting. The white tower remained clear.',false],
  ['Tessa sat beside Alex and looked at the painting on the board.',false],
 ]as const){
  const a=structuredClone(r.artifact);a.blocks.F1!.passages![0]={speaker:'NARRATOR',addressee:'NONE',text};a.blocks.F1!.text=renderPassages(a.world,a.blocks.F1!.passages!);
  assert.equal((validateEmotionalArtifact(a,testProfile).issues.F1??[]).some(s=>/depict|visual|figure/i.test(s)),rejected,text);
 }
});

test('visual counts distinguish observers, negated people and explicit count contradictions',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'test',fetch:providerFixture(),withArt:false});
 const cases=[
  ['none','The woman beside Alex looked at the colors in the painting.',false],
  ['none','The painting shows no woman or child.',false],
  ['none','A figure stood inside the painting.',true],
  ['one','The painting depicts no people.',true],
  ['one','The painting shows no woman or child.',false],
  ['one','The painting shows two passengers.',true],
  ['two','The painting shows three people.',true],
  ['two','The painting shows exactly one human figure.',true],
  ['two','One figure stands at the left in the painting.',false],
  ['two','The three women beside Alex studied the colors in the painting.',false],
 ]as const;
 for(const [figures,text,rejected]of cases){const a=structuredClone(r.artifact);a.world.work.visual!.figures=figures;a.blocks.F1!.passages![0]={speaker:'NARRATOR',addressee:'NONE',text};a.blocks.F1!.text=renderPassages(a.world,a.blocks.F1!.passages!);assert.equal((validateEmotionalArtifact(a,testProfile).issues.F1??[]).some(s=>/immutable visual/i.test(s)),rejected,text);}
});

test('a deposited work does not expose its catalogue as a visible scene',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'test',fetch:providerFixture(),withArt:false});
 for(const id of ['D3B','F5']){
  const p=emotionalProjection(r.artifact.world,id);assert.equal((p.context.work as any).visual,undefined);assert.match((p.context.work as any).visibility,/not visible/);
 }
});

test('an existing 13 checkpoint keeps its old visual description and resumes without a call',async()=>{
 const cp={...newGenerationCheckpoint(),revision:'3c-13' as const};
 const r=await generateEmotional(testProfile,{apiKey:'test',checkpoint:cp,fetch:providerFixture(),withArt:false});
 assert.equal((r.artifact.world.work as any).visual,undefined);
 let calls=0;const again=await generateEmotional(testProfile,{apiKey:'test',checkpoint:r.checkpoint,withArt:false,fetch:(async()=>{calls++;throw Error('No call allowed');})as typeof fetch});
 assert.equal(calls,0);assert.equal(again.canonical,r.canonical);assert.equal(again.hash,r.hash);
});

test('an internally contradictory visual catalogue fails before any prose is purchased',async()=>{
 const fixture=providerFixture();let proseCalls=0;
 const fetcher=(async(url,init)=>{const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);if(p.task!=='world')proseCalls++;const res=await fixture(url,init);if(p.task!=='world')return res;const raw=await res.json(),w=JSON.parse(raw.choices[0].message.content);w.work.visual.subject='Two passengers wait beneath a white lighthouse.';return response(w,req.model);})as typeof fetch;
 await assert.rejects(generateEmotional(testProfile,{apiKey:'test',fetch:fetcher,withArt:false}),/visual catalogue/i);assert.equal(proseCalls,0);
});

test('a two-figure catalogue rejects a subject with three people before prose',async()=>{
 const fixture=providerFixture();let proseCalls=0;
 const fetcher=(async(url,init)=>{const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);if(p.task!=='world')proseCalls++;const res=await fixture(url,init);if(p.task!=='world')return res;const raw=await res.json(),w=JSON.parse(raw.choices[0].message.content);w.work.visual.figures='two';w.work.visual.subject='Three people stand by a lighthouse.';return response(w,req.model);})as typeof fetch;
 await assert.rejects(generateEmotional(testProfile,{apiKey:'test',fetch:fetcher,withArt:false}),/visual catalogue/i);assert.equal(proseCalls,0);
});

test('a populated catalogue cannot describe its subject as an empty shelter',async()=>{
 const fixture=providerFixture();let proseCalls=0;
 const fetcher=(async(url,init)=>{const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);if(p.task!=='world')proseCalls++;const res=await fixture(url,init);if(p.task!=='world')return res;const raw=await res.json(),w=JSON.parse(raw.choices[0].message.content);w.work.visual.figures='one';w.work.visual.subject='An empty night bus shelter under a streetlamp.';w.work.visual.detail_one='A lone figure waits in a yellow coat.';return response(w,req.model);})as typeof fetch;
 await assert.rejects(generateEmotional(testProfile,{apiKey:'test',fetch:fetcher,withArt:false}),/visual catalogue/i);assert.equal(proseCalls,0);
});

test('a private deposit cannot promise later physical receipt but may leave a wish unanswered',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'test',fetch:providerFixture(),withArt:false});
 for(const [text,rejected]of [['One had given something private; the other would receive it later.',true],['Ren will collect the drawing tomorrow.',true],['Alex did not speak, but Ren would receive it tomorrow.',true],['Alex wondered about the silence, but Ren would receive it later.',true],['Alex wondered whether Ren would ever receive it.',false],['Ren hoped to receive the drawing one day.',false],['Alex thought about the wish to receive thanks.',false]]as const){
  const a=structuredClone(r.artifact);a.blocks.F5!.passages![0]={speaker:'NARRATOR',addressee:'NONE',text};a.blocks.F5!.text=renderPassages(a.world,a.blocks.F5!.passages!);assert.equal((validateEmotionalArtifact(a,testProfile).issues.F5??[]).some(s=>/future|receipt|delivery/i.test(s)),rejected,text);
 }
});

test('a reaction making slowness easy does not claim creation of the artwork',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'test',fetch:providerFixture(),withArt:false});const a=structuredClone(r.artifact);a.blocks.S2!.passages![0]={speaker:'NARRATOR',addressee:'NONE',text:'The tiredness in Alex made slowness easy to accept.'};a.blocks.S2!.text=renderPassages(a.world,a.blocks.S2!.passages!);assert.ok(!(validateEmotionalArtifact(a,testProfile).issues.S2??[]).some(s=>/created the work/.test(s)));
});

test('private-motive ignorance cannot become ignorance that the artwork exists',async()=>{
 const fixture=providerFixture();let projected:any;
 const fetcher=(async(url,init)=>{const p=JSON.parse(JSON.parse(String(init?.body)).messages[1].content);if(p.block==='F1')projected=p.projection.context;return fixture(url,init);})as typeof fetch;
 const r=await generateEmotional(testProfile,{apiKey:'test',fetch:fetcher,withArt:false});
 assert.equal(projected.current_facts.recipient_knows,undefined);assert.equal(projected.current_facts.recipient_knows_private_motive,false);assert.equal(projected.work_awareness,'All three adults know this work exists and who made it.');
 for(const [text,rejected]of [['Ren remained unaware of the picture or note.',true],['Ren does not know the private reason.',false],["Ren remained unaware of the picture’s private meaning.",false],["Ren remained unaware of the picture’s existence.",true]]as const){const a=structuredClone(r.artifact);a.blocks.F1!.passages![0]={speaker:'NARRATOR',addressee:'NONE',text};a.blocks.F1!.text=renderPassages(a.world,a.blocks.F1!.passages!);assert.equal((validateEmotionalArtifact(a,testProfile).issues.F1??[]).some(s=>/awareness/i.test(s)),rejected,text);}
});

test('a shared reaction cannot stage both possible companions or expose their identities to its writer',async()=>{
 const fixture=providerFixture();let projected:any;
 const fetcher=(async(url,init)=>{const p=JSON.parse(JSON.parse(String(init?.body)).messages[1].content);if(p.block==='D3B')projected={projection:p.projection,dialogue:p.dialogue_contract};return fixture(url,init);})as typeof fetch;
 const r=await generateEmotional(testProfile,{apiKey:'test',fetch:fetcher,withArt:false});
 assert.ok(!JSON.stringify(projected).includes('Tessa'));assert.ok(!JSON.stringify(projected).includes('Ren Cole'));
 const a=structuredClone(r.artifact);a.blocks.D3B!.passages![0]={speaker:'NARRATOR',addressee:'NONE',text:'Tessa lingered near the public display board. Ren stayed by the far wall.'};a.blocks.D3B!.text=renderPassages(a.world,a.blocks.D3B!.passages!);assert.match(validateEmotionalArtifact(a,testProfile).issues.D3B?.join(' ')??'',/protagonist camera/i);
});

test('a companion named Mark does not forbid an ordinary blue mark in the image',async()=>{
 const fixture=providerFixture();
 const fetcher=(async(url,init)=>{const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);const res=await fixture(url,init);if(p.task!=='world')return res;const raw=await res.json();const w=JSON.parse(raw.choices[0].message.content.replaceAll('Tessa Vale','Mark Ellis').replaceAll('Tessa','Mark'));return response(w,req.model);})as typeof fetch;
 const r=await generateEmotional(testProfile,{apiKey:'test',fetch:fetcher,withArt:false});
 for(const [text,rejected]of [['A blue mark stayed in Alex’s memory.',false],['Mark lingered near the public display board.',true],['MARK ELLIS stayed by the far wall.',true]]as const){const a=structuredClone(r.artifact);a.blocks.D3B!.passages![0]={speaker:'NARRATOR',addressee:'NONE',text};a.blocks.D3B!.text=renderPassages(a.world,a.blocks.D3B!.passages!);assert.equal((validateEmotionalArtifact(a,testProfile).issues.D3B??[]).some(s=>/protagonist camera/i.test(s)),rejected,text);}
});

test('an uncertain future viewer is not a claim that the current room is empty',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'test',fetch:providerFixture(),withArt:false});
 for(const [id,text,rejected]of [['F5','Alex wondered what care means for a gift no one else may ever see.',false],['F6','What remains is a gift nobody else might ever view.',false],['F6','No one else sat at the viewing bench.',true]]as const){const a=structuredClone(r.artifact);a.blocks[id]!.passages![0]={speaker:'NARRATOR',addressee:'NONE',text};a.blocks[id]!.text=renderPassages(a.world,a.blocks[id]!.passages!);assert.equal((validateEmotionalArtifact(a,testProfile).issues[id]??[]).some(s=>/Attendance varies/i.test(s)),rejected,text);}
});

test('a protagonist surname cannot be mistaken for another character’s first name',async()=>{
 const fixture=providerFixture({paragraphWords:25});
 // Unique openings keep expanded names from turning synthetic boilerplate
 // into a repeated 22-word span; the real production guards remain active.
 const fetcher=(async(url,init)=>{const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);const res=await fixture(url,init),raw=await res.json();const value=JSON.parse(raw.choices[0].message.content.replaceAll('Tessa Vale','Ellis Crane').replaceAll('Tessa','Ellis').replaceAll('Alex','Rowan Ellis'));if(p.task!=='world')for(const [key,unit]of Object.entries(value)as [string,{text:string}][])unit.text=p.block+'-'+key+' '+unit.text;return response(value,req.model);})as typeof fetch;
 const r=await generateEmotional(testProfile,{apiKey:'test',fetch:fetcher,withArt:false});
 for(const id of ['S3','F3']){const a=structuredClone(r.artifact);a.blocks[id]!.passages![0]={speaker:'NARRATOR',addressee:'NONE',text:'Rowan Ellis sat studying the grey cloud.'};a.blocks[id]!.text=renderPassages(a.world,a.blocks[id]!.passages!);assert.ok(!validateEmotionalArtifact(a,testProfile).issues[id],id);}
});

test('the no-invitation ending also keeps absent-character identities out of the reaction writer',async()=>{
 const fixture=providerFixture();let projected:any;
 const fetcher=(async(url,init)=>{const p=JSON.parse(JSON.parse(String(init?.body)).messages[1].content);if(p.block==='F3')projected=p;return fixture(url,init);})as typeof fetch;
 const r=await generateEmotional(testProfile,{apiKey:'test',fetch:fetcher,withArt:false});assert.ok(!JSON.stringify(projected).includes('Tessa'));assert.ok(!JSON.stringify(projected).includes('Ren Cole'));assert.ok(r.artifact.factualText.TAA!.D2A!.includes('Tessa')||r.artifact.factualText.TAA!.S1!.includes('Tessa'));
});

test('a final interpretive lens cannot return a predicted material outcome',async()=>{
 const fixture=providerFixture();let proseCalls=0;
 const fetcher=(async(url,init)=>{const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);if(p.task!=='world')proseCalls++;const res=await fixture(url,init);if(p.task!=='world')return res;const raw=await res.json(),w=JSON.parse(raw.choices[0].message.content);w.future_question='What does care mean for a gift no one else will ever see?';return response(w,req.model);})as typeof fetch;
 await assert.rejects(generateEmotional(testProfile,{apiKey:'test',fetch:fetcher,withArt:false}),/contract/i);assert.equal(proseCalls,0);
});

test('an entire actor identity inside another full name is rejected before prose',async()=>{
 const fixture=providerFixture();let proseCalls=0;
 const fetcher=(async(url,init)=>{const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);if(p.task!=='world')proseCalls++;const res=await fixture(url,init);if(p.task!=='world')return res;const raw=await res.json(),w=JSON.parse(raw.choices[0].message.content);w.player_name='Rowan Mara';w.host.name='Mara';return response(w,req.model);})as typeof fetch;
 await assert.rejects(generateEmotional(testProfile,{apiKey:'test',fetch:fetcher,withArt:false}),/identit/i);assert.equal(proseCalls,0);
});

test('visual catalogue fields cannot become another public channel for the hidden motive',async()=>{
 const fixture=providerFixture();let proseCalls=0;
 const fetcher=(async(url,init)=>{const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);if(p.task!=='world')proseCalls++;const res=await fixture(url,init);if(p.task!=='world')return res;const raw=await res.json(),w=JSON.parse(raw.choices[0].message.content);w.work.visual.detail_one=w.private_reason;return response(w,req.model);})as typeof fetch;
 await assert.rejects(generateEmotional(testProfile,{apiKey:'test',fetch:fetcher,withArt:false}),/private|leak/i);assert.equal(proseCalls,0);
});

for(const persistent of [false,true])test(`a contradictory depicted person ${persistent?'never seals after one repair':'gets one bounded repair'}`,async()=>{
 const fixture=providerFixture();let repairs=0;
 const fetcher=(async(url,init)=>{const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);if(p.task==='repair')repairs++;const res=await fixture(url,init);if(p.block!=='F4'||p.task==='repair'&&!persistent)return res;const raw=await res.json(),block=JSON.parse(raw.choices[0].message.content);block.p1.text='The painting shows two passengers waiting beneath the lighthouse.';return response(block,req.model);})as typeof fetch;
 const run=generateEmotional(testProfile,{apiKey:'test',fetch:fetcher,withArt:false});
 if(persistent)await assert.rejects(run,/validation failed/i);else{const r=await run;assert.deepEqual(r.checkpoint.repairsComplete,['F4']);assert.deepEqual(r.validation.issues,{});}
 assert.equal(repairs,1);
});
