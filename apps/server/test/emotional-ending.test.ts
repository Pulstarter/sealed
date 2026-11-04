import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emotionalFixture} from '../../../packages/engine/test/emotional-fixture.js';
import {compileEmotionalFacts,emotionalRoutes,emotionalEnding,emotionalTrace} from '../../../packages/engine/src/emotional.js';
import {endingReactionIssues,endingReactionRequest} from '../src/emotional-ending.js';
import type {EmotionalBlock,EmotionalWorld} from '../../../packages/engine/src/emotional-types.js';
import {generateEmotional,validateEmotionalArtifact,newGenerationCheckpoint} from '../src/emotional-generation.js';
import {providerFixture,testProfile} from './emotional-fixtures.js';

function world(){const w=emotionalFixture().world;w.endingPolicy='present-reactions-1';return w;}
const block=(text:string):EmotionalBlock=>({text,claims:[],passages:[{speaker:'NARRATOR',addressee:'NONE',text}]});

test('all ending references come from the actual route, regardless of declared wishes',()=>{
 const w=world(),facts=compileEmotionalFacts(w);
 for(const route of emotionalRoutes){const id=emotionalEnding(route),text=facts[route]![id]!;assert.ok(text,route);assert.ok(text.includes(w.player_name),route);
  const place=emotionalTrace(route).s4.work;
  assert.equal(/chose to display/.test(text),place==='PUBLIC',route);
  assert.equal(/chose the private box/.test(text),place==='BOX',route);
  assert.equal(/without a response/.test(text),place==='PLAYER',route);
  assert.doesNotMatch(text,/agreed|approved|wanted|permission|consent/iu);
 }
 const other=structuredClone(w);other.host.public_wish='A wholly different preference';other.recipient.public_wish='The opposite preference';
 const changed=compileEmotionalFacts(other);for(const route of emotionalRoutes)assert.equal(changed[route]![emotionalEnding(route)],facts[route]![emotionalEnding(route)]);
});

test('an old world keeps its previously compiled ending paragraphs',()=>{
 const w=emotionalFixture().world,old=compileEmotionalFacts(w);assert.equal(old.TTT!.F6,undefined);
 const modern=compileEmotionalFacts({...w,endingPolicy:'present-reactions-1'});assert.ok(modern.TTT!.F6);
 assert.deepEqual(compileEmotionalFacts(w),old);assert.equal(w.endingPolicy,undefined);
});

test('the ending writer receives no wishes, approvals, private history or rejected prose, including repairs',()=>{
 const w=world();w.host.public_wish='WISH_HOST_CANARY';w.recipient.public_wish='WISH_RECIPIENT_CANARY';w.private_reason='PRIVATE_MOTIVE_CANARY';w.shared_past_memory='PUBLIC_MEMORY_CANARY';w.venue.name='VENUE_CANARY';w.work.name='WORK_CANARY';
 if(w.story)w.story.sealed_truth='SEALED_TRUTH_CANARY';
 for(const pass of [undefined,1,2]as const){const r=endingReactionRequest(w,'F1',{key:'test',words:180,plan:{p1:'NARRATOR>NONE',p2:'HOST>PLAYER'},intensity:'gentle',exclusions:[],repairPass:pass});const serialized=JSON.stringify(r);
  for(const canary of ['WISH_HOST_CANARY','WISH_RECIPIENT_CANARY','PRIVATE_MOTIVE_CANARY','PUBLIC_MEMORY_CANARY','SEALED_TRUTH_CANARY','VENUE_CANARY','WORK_CANARY'])assert.ok(!serialized.includes(canary),canary);
  const p=r.payload as Record<string,any>;assert.equal(p.reaction_contract,'present-reactions-1');assert.equal(p.rejected_text,undefined);assert.equal(p.projection,undefined);assert.equal(p.paragraph_plan.p2,'FIRST_PERSON');assert.equal(p.wire_plan.p02_text,'first-person present feeling');assert.doesNotMatch(serialized,/HOST>|RECIPIENT>/u);assert.equal(p.repair_pass,pass);
  const props=(r.schema as any).properties;assert.deepEqual(props.p02_lead.enum,['']);assert.deepEqual(props.p02_tail.enum,['']);
 }
});

test('retrospective approvals and invented public preferences cannot enter new emotional reactions',()=>{
 const w=world();for(const text of ['I will not apologise for the display you wanted.','I was not asking you to approve twice. I thought once should hold.','I did want people to be able to see it.','Everyone agreed to display it.','The creator chose the destination.'])assert.ok(endingReactionIssues(w,'F1',block(text)).length,text);
 const old={...w};delete old.endingPolicy;assert.deepEqual(endingReactionIssues(old,'F1',block('Everyone agreed to display it.')),[]);
});

test('self-only present reactions reject retrospective support in ordinary language',()=>{
 const w=world();for(const text of ['I remember giving my blessing.','I feel relieved that we authorised this together.','I feel grateful because you supported this from the beginning.','I recall a shared understanding.','I feel relief in our accord.']){
  const b:EmotionalBlock={text,claims:[],passages:[{speaker:'HOST',addressee:'PLAYER',text,lead:'',tail:''}]};assert.ok(endingReactionIssues(w,'F1',b).length,text);
 }
});

test('canonical names are not future verbs, but an actual future statement remains invalid',()=>{
 const w=world();w.player_name='Will';
 for(const text of ['Will feels uncertain and quietly relieved.','Relief remains unexpectedly awkward for Will.','Will tolerates the tension without reassurance.','Will accepts the uncertainty without an easy answer.','Will quietly accepts the uncertainty.','Will still feels uncertain.','Will perhaps tolerates the uncertainty.'])assert.deepEqual(endingReactionIssues(w,'F6',block(text)),[],text);
 for(const text of ['Will will feel relieved.','Will feels relieved but will return tomorrow.','Will they feel relieved?','Will James feel relieved?','Will his concern ease?','Will uncertainty fade?','Will they feel relieved.','Will the tension ease.' ])assert.ok(endingReactionIssues(w,'F6',block(text)).length,text);
});

test('present emotional prose stays free, while staging cannot hide a factual claim',()=>{
 const w=world(),text=w.player_name+' feels relief and unease together, neither feeling cancelling the other. The uncertainty remains personal and oddly tender.';
 assert.deepEqual(endingReactionIssues(w,'F6',block(text)),[]);
 const b:EmotionalBlock={text,claims:[],passages:[{speaker:'HOST',addressee:'PLAYER',text:'I feel exposed and strangely relieved.',lead:'Everyone agreed to display it.',tail:''}]};assert.ok(endingReactionIssues(w,'F1',b).length);
 for(const line of [w.host.name+' seems satisfied.', 'Someone else watches quietly.', 'The box opens.'])assert.ok(endingReactionIssues(w,'F6',block(line)).length,line);
});

test('a rejected ending repairs through the reduced request without copying its invented approval',async()=>{
 const provider=providerFixture(),requests:any[]=[];let injected=false;
 const r=await generateEmotional(testProfile,{apiKey:'test',checkpoint:{...newGenerationCheckpoint(),revision:'3c-52'},withArt:false,fetch:(async(url,init)=>{
  const req=JSON.parse(String(init?.body)),payload=JSON.parse(req.messages[1].content);if(payload.block==='F1')requests.push(payload);
  const response=await provider(url,init);
  if(payload.block==='F1'&&!injected){injected=true;const raw=await response.json(),wire=JSON.parse(raw.choices[0].message.content);wire.p01_text='Everyone agreed to display it. APPROVAL_CANARY';raw.choices[0].message.content=JSON.stringify(wire);return new Response(JSON.stringify(raw));}return response;
 })as typeof fetch});
 assert.equal(r.checkpoint.revision,'3c-52');assert.equal(r.artifact.world.endingPolicy,'present-reactions-1');assert.deepEqual(r.validation.issues,{});
 assert.ok(requests.length>=2);for(const p of requests){assert.equal(p.reaction_contract,'present-reactions-1');assert.equal(p.projection,undefined);assert.equal(p.rejected_text,undefined);assert.ok(!JSON.stringify(p).includes('APPROVAL_CANARY'));}
 assert.ok(r.checkpoint.completedRepairKeys?.includes('repair:F1'));
 assert.ok(!r.canonical.includes('APPROVAL_CANARY'));
});

test('a factual ending cannot be replaced with a model claim, and saved52 resumes byte-identically',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'test',checkpoint:{...newGenerationCheckpoint(),revision:'3c-52'},withArt:false,fetch:providerFixture()});
 const changed=structuredClone(r.artifact);changed.factualText.AAA!.F1='Everyone approved the display.';
 assert.ok(validateEmotionalArtifact(changed,testProfile).issues.$ending_facts?.some(x=>x.includes('AAA')));
 let calls=0;const resumed=await generateEmotional(testProfile,{apiKey:'test',withArt:false,checkpoint:r.checkpoint,fetch:(async()=>{calls++;throw Error('No request during saved recovery');})as typeof fetch});
 assert.equal(calls,0);assert.equal(resumed.canonical,r.canonical);assert.equal(resumed.hash,r.hash);
 const bad=structuredClone(r.checkpoint);delete bad.world!.endingPolicy;
 await assert.rejects(generateEmotional(testProfile,{apiKey:'test',withArt:false,checkpoint:bad,fetch:(async()=>{calls++;throw Error('No call for a corrupt policy');})as typeof fetch}),/ending.*policy|policy.*ending/iu);assert.equal(calls,0);
});


test('a protagonist named Will completes without spending an ending repair',async()=>{
 const provider=providerFixture(),endingRepairs:string[]=[];
 const r=await generateEmotional(testProfile,{apiKey:'test',checkpoint:{...newGenerationCheckpoint(),revision:'3c-52'},withArt:false,fetch:(async(url,init)=>{
  const req=JSON.parse(String(init?.body)),payload=JSON.parse(req.messages[1].content);
  if(payload.reaction_contract&&payload.repair_pass)endingRepairs.push(payload.block);
  const response=await provider(url,init);
  if(payload.task==='world'){const raw=await response.json(),w=JSON.parse(raw.choices[0].message.content);w.player_name='Will';raw.choices[0].message.content=JSON.stringify(w);return new Response(JSON.stringify(raw));}
  return response;
 })as typeof fetch});
 assert.equal(r.artifact.world.player_name,'Will');assert.deepEqual(r.validation.issues,{});assert.deepEqual(endingRepairs,[]);
});
