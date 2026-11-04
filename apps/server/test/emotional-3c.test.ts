import {narrativeBudget} from '../src/emotional-reliability.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateEmotional as generateCurrent,newGenerationCheckpoint,validateEmotionalArtifact} from '../src/emotional-generation.js';
import {providerFixture,testProfile,response} from './emotional-fixtures.js';
import {emotionalFixture} from '../../../packages/engine/test/emotional-fixture.js';
import {story3c} from '../../../packages/engine/test/emotional-story-fixture.js';

// Keep these regressions on the stored 3c-4 format; 3c-5 has dedicated speech tests.
const generateEmotional:typeof generateCurrent=(profile,options)=>generateCurrent(profile,{checkpoint:{...newGenerationCheckpoint(),revision:'3c-4'},...options});

test('new generation is versioned and repair receives rejected prose but never unauthorized truths',async()=>{
 const original=providerFixture();let bad=true,sawRepair=false;
 const fetcher=(async(url,init)=>{const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);if(p.block==='S3'&&bad){bad=false;return response({paragraphs:Object.fromEntries(Array.from({length:p.paragraphs},(_,i)=>['p'+(i+1),'The schema repeats: SECRET MOTIVE '+story3c.sealed_truth.toUpperCase()]))},req.model);}if(p.task==='repair'&&p.block==='S3'){sawRepair=true;assert.match(p.rejected_text,/schema/);assert.ok(!JSON.stringify(p).toLowerCase().includes('secret motive'));assert.ok(!JSON.stringify(p).toLowerCase().includes(story3c.sealed_truth.toLowerCase()));assert.ok(p.feedback.length);}return original(url,init);}) as typeof fetch;
 const r=await generateEmotional(testProfile,{apiKey:'test-key',fetch:fetcher,withArt:false});assert.equal(r.artifact.version,'emotional-2');assert.equal(r.checkpoint.revision,'3c-4');assert.ok(sawRepair);
 const cp=newGenerationCheckpoint();delete cp.revision;
 const old=await generateEmotional(testProfile,{apiKey:'test-key',fetch:original,checkpoint:cp,withArt:false});assert.equal(old.artifact.version,'emotional-1');
 const resumed=await generateEmotional(testProfile,{apiKey:'test-key',checkpoint:old.checkpoint,fetch:(async()=>{throw Error('No repeated call');})as typeof fetch,withArt:false});assert.equal(resumed.canonical,old.canonical);assert.equal(resumed.hash,old.hash);
});
test('long repetition is rejected on a shared route, while mutually exclusive reaction blocks can coincide',()=>{
 const a=emotionalFixture();a.version='emotional-2';a.world.story=story3c;
 const repeated='A narrow band of amber light ran across the ceiling while rain gathered against the window and a distant sound faded into the ordinary quiet of the room.';
 a.blocks.D1A!.text=repeated;a.blocks.D1B!.text=repeated;assert.ok(!validateEmotionalArtifact(a,testProfile).issues.D1B);
 a.blocks.S2!.text=repeated;assert.match(validateEmotionalArtifact(a,testProfile).issues.S2!.join(' '),/repeat/i);
 a.blocks.S2!.text=story3c.sealed_truth;assert.match(validateEmotionalArtifact(a,testProfile).issues.S2!.join(' '),/seal|revelation/i);
});
test('gestures involving tracked objects fail before paid prose, and truth cannot repeat the readable motive',async()=>{
 const original=providerFixture();for(const kind of ['gesture','truth']){let calls=0;await assert.rejects(generateEmotional(testProfile,{apiKey:'test-key',withArt:false,fetch:(async(url,init)=>{calls++;const res=await original(url,init),raw=await res.json();const value=JSON.parse(raw.choices[0].message.content);if(kind==='gesture')value.host.gesture='smooths the edge of the explanation';else value.story.sealed_truth=value.private_reason;return response(value);}) as typeof fetch}),/gesture|revelation|truth/i);assert.equal(calls,1);}
 assert.equal(newGenerationCheckpoint().revision,'3c-54');
});

test('quoted and multiline secrets cannot hide inside JSON-escaped public fields',async()=>{
 const original=providerFixture();for(const which of ['truth','motive']){let calls=0;await assert.rejects(generateEmotional(testProfile,{apiKey:'test-key',withArt:false,fetch:(async(url,init)=>{calls++;const res=await original(url,init),raw=await res.json(),v=JSON.parse(raw.choices[0].message.content);if(which==='truth'){v.story.sealed_truth=v.story.sealed_truth.replace('blue square','"blue square"\n');v.story.anchor=v.story.sealed_truth;}else{v.private_reason='A private "reason"\nkept quiet';v.title=v.private_reason;}return response(v);}) as typeof fetch}),/private|revelation|leak/i);assert.equal(calls,1);}
});

test('3C repetition gate includes the compiled facts visible on the same route',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'test-key',fetch:providerFixture(),withArt:false});r.artifact.blocks.S2!.text+='\n\n'+r.artifact.factualText.AAA!.S2!;
 assert.match(validateEmotionalArtifact(r.artifact,testProfile).issues.S2!.join(' '),/repeat/i);
});

test('multiline secret in prose is rejected and redacted from the single repair',async()=>{
 const original=providerFixture();let bad=true,sawRepair=false;
 const fetcher=(async(url,init)=>{const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);if(p.block==='S3'&&bad){bad=false;return response({paragraphs:Object.fromEntries(Array.from({length:p.paragraphs},(_,i)=>['p'+(i+1),story3c.sealed_truth.replaceAll(' ','\n\n')]))},req.model);}if(p.block==='S3'&&p.task==='repair'){sawRepair=true;assert.ok(!p.rejected_text.toLowerCase().replace(/\s+/g,' ').includes(story3c.sealed_truth.toLowerCase()));}return original(url,init);}) as typeof fetch;
 const r=await generateEmotional(testProfile,{apiKey:'test-key',withArt:false,fetch:fetcher});assert.ok(sawRepair);assert.deepEqual(r.validation.issues,{});
});

test('a single long ending repairs that ending, instead of charging to rewrite all twenty-one blocks',async()=>{
 const fixture=providerFixture();const fetcher=(async(url,init)=>{const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content),res=await fixture(url,init);if(p.block!=='F2'||p.task!=='block')return res;const raw=await res.json(),v=JSON.parse(raw.choices[0].message.content);for(const [k,text] of Object.entries(v.paragraphs??v))(v.paragraphs??v)[k]=text+' '+Array.from({length:50},(_,i)=>'distinct-'+k+'-'+i).join(' ');return response(v,req.model);}) as typeof fetch;
 const r=await generateEmotional(testProfile,{apiKey:'test-key',fetch:fetcher,withArt:false});assert.deepEqual(r.checkpoint.repairsComplete,['F2']);assert.deepEqual(r.validation.issues,{});
});

test('reading an expression is not opening the explanation; literal reading still fails',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'test-key',fetch:providerFixture(),withArt:false});
 r.artifact.blocks.D1B!.text+=' Her expression was easy to read.';assert.ok(!validateEmotionalArtifact(r.artifact,testProfile).issues.D1B);
 r.artifact.blocks.D1B!.text+=' They read the explanation.';assert.ok(validateEmotionalArtifact(r.artifact,testProfile).issues.D1B);
});

test('new writer has one simple prose object; causal claims stay server-side and endings are concise',async()=>{
 const fixture=providerFixture();let seen=false;
 const fetcher=(async(url,init)=>{const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);if(p.task==='block'){seen=true;assert.equal(req.model,'muse-wonder-1.0');assert.equal(req.response_format.json_schema.schema.properties.paragraphs,undefined);assert.ok(req.response_format.json_schema.schema.properties.p1);assert.equal(req.response_format.json_schema.schema.properties.claims,undefined);assert.equal(p.paragraphs,p.block==='S1'||p.block==='S2'?12:p.block.startsWith('F')?6:p.block==='S3'?10:3);}return fixture(url,init);}) as typeof fetch;
 const r=await generateEmotional(testProfile,{apiKey:'test-key',fetch:fetcher,withArt:false});assert.ok(seen);assert.deepEqual(r.validation.issues,{});
});

test('excluded death in the hidden motive or envelope is rejected before any prose or art',async()=>{
 const fixture=providerFixture();for(const field of ['private_reason','sealed_truth']){let calls=0;await assert.rejects(generateEmotional({...testProfile,exclusions:['death']},{apiKey:'test-key',withArt:false,fetch:(async(url,init)=>{calls++;const res=await fixture(url,init),raw=await res.json(),v=JSON.parse(raw.choices[0].message.content);if(field==='private_reason')v.private_reason='Her friend died.';else v.story.sealed_truth+=' Her friend died.';return response(v);}) as typeof fetch}),/exclu|death|boundar/i);assert.equal(calls,1);}
});

test('shared prose cannot invent an uninvited guest, a solitary viewer, note absence or unknown motive',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'test-key',fetch:providerFixture(),withArt:false});
 for(const [id,text] of [['ARRA','Ren sat beside Tessa on the viewing bench.'],['S3','The solitude felt shared.'],['D3B','Letting the drawing go unaccompanied felt plain.'],['D3T','What stayed was not certainty about why it had been made.']]){const a=structuredClone(r.artifact);a.blocks[id!]!.text+=' '+text;assert.ok(validateEmotionalArtifact(a,testProfile).issues[id!],id!);}
});

test('prose cannot replace the sealed origin of the anchor with an invented accident',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'test-key',fetch:providerFixture(),withArt:false});r.artifact.blocks.D2B!.text+=' The blue square was only where my sleeve caught it.';
 assert.match(validateEmotionalArtifact(r.artifact,testProfile).issues.D2B!.join(' '),/anchor|origin/i);
});

test('rain can slide down glass while a modeled work transfer still triggers repair',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'test-key',fetch:providerFixture(),withArt:false});r.artifact.blocks.D3B!.text+=' Drops merged and slid in lines down the glass.';assert.ok(!validateEmotionalArtifact(r.artifact,testProfile).issues.D3B);
 r.artifact.blocks.D3B!.text+=' They slid the painting into the box.';assert.ok(validateEmotionalArtifact(r.artifact,testProfile).issues.D3B);
});

test('all literal slide transfers stay blocked, and arrival can refer to an absent person without placing them there',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'test-key',fetch:providerFixture(),withArt:false});
 for(const [id,text] of [['D3B','Alex slid the watercolor across the table.'],['D2B','Alex slid the note back across the table.'],['D2T','Alex slid the explanation across the table.']] as const){const a=structuredClone(r.artifact);a.blocks[id]!.text+=' '+text;assert.ok(validateEmotionalArtifact(a,testProfile).issues[id]);}
 const a=structuredClone(r.artifact);a.world.host.name='Tessa Vale';a.world.recipient.name='Tessa Cole';a.blocks.ARRA!.text='Tessa Vale sat beside Alex.';assert.ok(!validateEmotionalArtifact(a,testProfile).issues.ARRA);
 a.blocks.ARRA!.text='Tessa Vale hoped Tessa Cole would keep the drawing nearby.';assert.ok(!validateEmotionalArtifact(a,testProfile).issues.ARRA);
 a.blocks.ARRA!.text='Tessa Cole sat beside Tessa Vale.';assert.ok(validateEmotionalArtifact(a,testProfile).issues.ARRA);
});

test('length repair adjusts paragraph count using observed word density, instead of repeating the same short block',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'test-key',fetch:providerFixture({shortParagraphs:true}),withArt:false});
 assert.equal(r.checkpoint.repairPass,1);assert.ok(Object.values(r.checkpoint.repairPlan!).some(p=>p.paragraphs>14));assert.ok(r.validation.wordRange[0]>=2000);assert.ok(r.validation.wordRange[1]<=2400);
});

test('the open question cannot promise a future public audience for a work that may stay private',async()=>{
 const fixture=providerFixture();let calls=0;await assert.rejects(generateEmotional(testProfile,{apiKey:'test-key',withArt:false,fetch:(async(url,init)=>{calls++;const res=await fixture(url,init),raw=await res.json(),v=JSON.parse(raw.choices[0].message.content);v.future_question='When strangers linger in front of it next week, will you tell them why?';return response(v);})as typeof fetch}),/question|future|custody/i);assert.equal(calls,1);
});

test('holding a tilted head and folding arms remain allowed body habits',async()=>{
 const fixture=providerFixture();const fetcher=(async(url,init)=>{const req=JSON.parse(String(init?.body)),res=await fixture(url,init);if(JSON.parse(req.messages[1].content).task!=='world')return res;const raw=await res.json(),v=JSON.parse(raw.choices[0].message.content);v.host.gesture='folds their arms';v.recipient.gesture='tilts their head left and holds it';return response(v,req.model);})as typeof fetch;
 const r=await generateEmotional(testProfile,{apiKey:'test-key',fetch:fetcher,withArt:false});assert.deepEqual(r.validation.issues,{});
});

test('an empty bench depicted in the known artwork does not assert an absent viewing guest',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'test-key',fetch:providerFixture(),withArt:false});r.artifact.world.work.appearance='a flat ink drawing of an empty bench';
 for(const text of ['Its flat ink drawing of an empty bench caught the light.','An empty bench drawn with care held their attention.']){const a=structuredClone(r.artifact);a.blocks.S3!.text+=' '+text;assert.ok(!validateEmotionalArtifact(a,testProfile).issues.S3);}
 r.artifact.blocks.S3!.text+=' The empty bench beside them held no guest.';assert.ok(validateEmotionalArtifact(r.artifact,testProfile).issues.S3);
});

test('a recipient cannot attribute authorship to the player in the viewing scene',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'test-key',fetch:providerFixture(),withArt:false});r.artifact.blocks.ARRB!.text+=' "You have drawn nobody coming," the recipient said.';
 assert.match(validateEmotionalArtifact(r.artifact,testProfile).issues.ARRB!.join(' '),/author|creator/i);
});

test('planned word budget and repair request agree when initial paragraphs were short',async()=>{
 const normal=providerFixture(),short=providerFixture({shortParagraphs:true,paragraphWords:18});
 const fetcher=(async(url,init)=>{const p=JSON.parse(JSON.parse(String(init?.body)).messages[1].content);if(p.task==='block'&&['S1','S2'].includes(p.block))return short(url,init);if(p.task==='repair')return normal(url,init);return normal(url,init);})as typeof fetch;
 const r=await generateEmotional(testProfile,{apiKey:'test-key',fetch:fetcher,withArt:false,checkpoint:{revision:'3c-33',blocks:{},initialComplete:[],repairPass:0,repairsComplete:[],images:[],receipts:[]}});assert.deepEqual(r.validation.issues,{});assert.ok(r.checkpoint.repairPlan);for(const [id,plan]of Object.entries(r.checkpoint.repairPlan))assert.equal(plan.targetWords,narrativeBudget(r.artifact.world,id).target);
});
test('figurative breath and a mistake remain allowed; ambiguous authorship with the creator present is rejected',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'test-key',fetch:providerFixture(),withArt:false});r.artifact.blocks.ARRB!.text+=' "I drew a breath. I made a mistake," Ren said.';assert.ok(!validateEmotionalArtifact(r.artifact,testProfile).issues.ARRB);
 for(const [id,claim] of [['S1','"I drew the work," Alex said.'],['ARRA','"I painted the watercolor," Alex said.'],['S1','"I created the work," Ren said.']]as const){const a=structuredClone(r.artifact);a.blocks[id]!.text+='\n\n'+claim;assert.ok(validateEmotionalArtifact(a,testProfile).issues[id]);}
 r.artifact.blocks.ARRA!.text+=' "I drew the work," Tessa said.';assert.ok(!validateEmotionalArtifact(r.artifact,testProfile).issues.ARRA);
 r.artifact.blocks.ARRA!.text+=' "You made me check the blue," Tessa said.';assert.ok(!validateEmotionalArtifact(r.artifact,testProfile).issues.ARRA);
 r.artifact.blocks.ARRA!.text+=' "You have made the rooftops almost black," Tessa said.';assert.ok(validateEmotionalArtifact(r.artifact,testProfile).issues.ARRA);
});

test('standalone artifact validation checks the world as well as prose',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'test-key',fetch:providerFixture(),withArt:false});r.artifact.world.future_question='When strangers linger in front of it next week, will you tell them why?';assert.ok(validateEmotionalArtifact(r.artifact,testProfile).issues.$world);
});
