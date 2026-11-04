import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixtureWorld} from '../../../packages/engine/test/emotional-fixture.js';
import {endingReactionIssues,endingReactionRequest} from '../src/emotional-ending.js';
import {generateEmotional} from '../src/emotional-generation.js';
import {providerFixture,response,testProfile} from './emotional-fixtures.js';
import type {EmotionalBlock,EmotionalWorld} from '../../../packages/engine/src/emotional-types.js';

const world=():EmotionalWorld=>({...fixtureWorld(),endingPolicy:'outcome-reactions-2'});
const narrator=(text:string):EmotionalBlock=>({text,claims:[],passages:[{speaker:'NARRATOR',addressee:'NONE',text}]});
const speech=(text:string):EmotionalBlock=>({text,claims:[],passages:[{speaker:'PLAYER',addressee:'RECIPIENT',text}]});
const audienceError='The engine supplies no audience order, first reader or new viewer activity.';

test('the recorded F4 reading without permission concerns interpretation rather than consent',()=>{
 const text="Alex remained aware that the drawing on the pinboard was no longer theirs to shelter from interpretation. Any reading could settle beside the artist's lines without permission, and the intended recipient might be imagined through marks that had never claimed to reveal a private mind.";
 assert.deepEqual(endingReactionIssues(world(),'F4',narrator(text)),[]);
 assert.deepEqual(endingReactionIssues(world(),'F4',narrator("A reading can sit alongside the artist’s marks without permission.")),[]);
});

test('an interpretive permission clause cannot authorize action, consent or an appended promise',()=>{
 for(const text of [
  'Alex had permission to display it.',
  'The artist gave permission for another reading.',
  "Any reading could settle beside the artist's lines without permission from the artist.",
  "Any reading could settle beside the artist's lines without permission to display the drawing.",
  "Any reading could settle beside the artist's lines without permission; we agreed to display it.",
  "Any reading could settle beside the artist's lines without permission, and I will move the drawing.",
  "The sheet can sit alongside the artist's marks without permission.",
 ])assert.ok(endingReactionIssues(world(),'F4',narrator(text)).length,text);
 const legacy={...world(),endingPolicy:'outcome-reactions-1' as const};
 assert.ok(endingReactionIssues(legacy,'F4',narrator("Any reading could settle beside the artist's lines without permission.")).length);
});

test('a contracted uncertain reading with its actual vocative keeps the same meaning as an explicit future',()=>{
 const w=world(),name=w.recipient.name;
 for(const text of [
  `I won't pretend I know what you'll find in it, ${name}. I only know it isn't mine to explain.`,
  `I won’t pretend I know what you’ll see in the drawing, ${name}.`,
  `I cannot know what you'll notice in the drawing.`,
 ])assert.deepEqual(endingReactionIssues(w,'F2',speech(text)),[],text);
});

test('contracted interpretation cannot swallow a forecast, container, wrong listener or next action',()=>{
 const w=world(),name=w.recipient.name;
 for(const text of [
  `I won't pretend I know what you'll find in it, ${name}; I'll move the drawing.`,
  `I won't pretend I know what you'll find in it, ${name}: the original sheet.`,
  `I won't pretend I know what you'll find in the box, ${name}.`,
  `The box is closed. I won't pretend I know what you'll find in it, ${name}.`,
  `I won't pretend I know what you'll find in it, ${w.host.name}.`,
  `You’ll find comfort in the drawing.`,
 ])assert.ok(endingReactionIssues(w,'F2',speech(text)).length,text);
});

test('audience chronology is rejected even when it uses no cast name or future auxiliary',()=>{
 for(const text of [
  'Strangers could decide what it meant before the intended recipient ever could.',
  'Someone else gets to name it first, and that lands hard.',
  'Other readers may interpret the drawing first.',
  'The next viewer reads it before the artist.',
 ])assert.ok(endingReactionIssues(world(),'F2',narrator(text)).includes(audienceError),text);
});

test('public interpretability and the protagonist first feeling do not assert an audience order',()=>{
 for(const text of [
  'Alex feels the loss of control over how the drawing might be understood.',
  'Alex notices their first response was relief, not certainty.',
  'The drawing belongs to the artist, yet the questions attached to it find Alex first.',
  'Alex cannot settle what any reading means.',
 ])assert.deepEqual(endingReactionIssues(world(),'F4',narrator(text)),[],text);
});

test('seeing the human cost and losing the last say are not an order of readers',()=>{
 for(const text of ['I can see that costs you the last say in how it is met.','I can see it costs you the last say in what it means.']){
  const b:EmotionalBlock={text,claims:[],passages:[{speaker:'RECIPIENT',addressee:'PLAYER',text}]};
  assert.deepEqual(endingReactionIssues(world(),'F2',b),[]);
 }
});

test('public closing and repair describe the boundary without a fabricated audience or leaked diagnostic',()=>{
 const w=world();w.private_reason='SECRET_REASON';w.host.public_wish='SECRET_WISH';
 for(const pass of [undefined,1,2] as const){
  const r=endingReactionRequest(w,'F2',{key:'test',words:80,plan:{p1:'NARRATOR>NONE',p2:'RECIPIENT>PLAYER',p3:'PLAYER>RECIPIENT'},intensity:'moderate',exclusions:[],repairPass:pass,repairFeedback:[audienceError+' SECRET_REASON SECRET_WISH']});
  const p=r.payload as any;
  assert.equal(p.audience_boundary.first_reader,'NOT_SUPPLIED');
  assert.equal(p.audience_boundary.order,'NOT_SUPPLIED');
  assert.match(p.audience_boundary.instruction,/first|before/iu);
  if(pass)assert.ok(p.repair_guidance.codes.includes('audience_boundary'));
  assert.ok(!JSON.stringify(r).includes('SECRET_REASON'));assert.ok(!JSON.stringify(r).includes('SECRET_WISH'));
 }
});

test('real generation repairs an unsupported anonymous audience order with safe guidance',async()=>{
 const base=providerFixture(),repairs:any[]=[];
 const r=await generateEmotional(testProfile,{apiKey:'fixture-only',withArt:false,fetch:(async(url,init)=>{
  const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content),res=await base(url,init);
  if(p.block!=='F2')return res;
  if(p.task==='repair'){repairs.push(p);assert.ok(p.repair_guidance.codes.includes('audience_boundary'));}
  const raw=await res.json(),wire=JSON.parse(raw.choices[0].message.content);
  if(p.task!=='repair')wire.p01_text='Other readers could interpret the drawing first.';
  return response(wire,req.model);
 })as typeof fetch});
 assert.deepEqual(r.validation.issues,{});assert.equal(repairs.length,1);assert.equal(r.checkpoint.repairPass,1);
});

async function inject(block:string,field:string,text:string){
 const base=providerFixture();return generateEmotional(testProfile,{apiKey:'fixture-only',withArt:false,fetch:(async(url,init)=>{
  const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content),res=await base(url,init);
  if(p.block!==block)return res;
  const raw=await res.json(),wire=JSON.parse(raw.choices[0].message.content);wire[field]=text;return response(wire,req.model);
 })as typeof fetch});
}

test('a changed reading or perceived cost after reflection is not a comparison to another viewer',async()=>{
 for(const text of ['I see it differently after accepting that its meaning is open.','I can see it costs you certainty after such a difficult choice.']){
  assert.deepEqual(endingReactionIssues(world(),'F2',speech(text)),[]);
  const r=await inject('F2','p03_text',text);assert.deepEqual(r.validation.issues,{});
 }
});

test('ranked readers and explicit artwork objects cannot bypass chronology in a complete adventure',async()=>{
 for(const text of ['Other readers could interpret the artwork first.','The first reader interprets the drawing.','Strangers could decide what the drawing meant before the intended recipient.']){
  assert.ok(endingReactionIssues(world(),'F4',narrator(text)).includes(audienceError),text);
  await assert.rejects(inject('F4','p01_text',text),/validation failed/iu);
 }
});

test('an independent interpretation never licenses introductory, appended or adjacent prior instructions',async()=>{
 for(const text of [
  "The artist confirmed that any reading could settle beside the artist's lines without permission.",
  "Any reading could settle beside the artist's lines without permission, as the artist had instructed.",
  "Any reading could settle beside the artist's lines without permission. The artist had instructed this.",
  "Any reading could settle beside the artist's lines without permission, and the intended recipient might be imagined through marks that had never claimed to reveal a private mind, as the artist instructed.",
 ]){
  assert.ok(endingReactionIssues(world(),'F4',narrator(text)).length,text);
  await assert.rejects(inject('F4','p01_text',text),/validation failed/iu);
 }
});

test('future interpretation shares unambiguous listener aliases with ordinary bound speech',async()=>{
 const w=world(),first=w.recipient.name.split(' ')[0]!;const text=`I won’t pretend I know what you’ll see in the drawing, ${first}.`;
 assert.deepEqual(endingReactionIssues(w,'F2',speech(text)),[]);
 const r=await inject('F2','p03_text',text);assert.deepEqual(r.validation.issues,{});
 const ambiguous=world();ambiguous.host.name=first+' Vega';assert.ok(endingReactionIssues(ambiguous,'F2',speech(text)).length);
 const wrong=w.host.name.split(' ')[0]!;assert.ok(endingReactionIssues(w,'F2',speech(`I won’t pretend I know what you’ll see in the drawing, ${wrong}.`)).length);
});

test('a permission exception cannot hide authorization placed in another passage',()=>{
 const texts=["Any reading could settle beside the artist's lines without permission.",'The artist had instructed this.'];
 const b:EmotionalBlock={text:texts.join('\n\n'),claims:[],passages:texts.map(text=>({speaker:'NARRATOR',addressee:'NONE',text}))};
 assert.ok(endingReactionIssues(world(),'F4',b).length);
});
