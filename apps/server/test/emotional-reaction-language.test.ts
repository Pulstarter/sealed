import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixtureWorld} from '../../../packages/engine/test/emotional-fixture.js';
import type {EmotionalWorld,EmotionalBlock,EmotionalPassage} from '../../../packages/engine/src/emotional-types.js';
import {ambiguousAuthorship} from '../src/emotional-3c.js';
import {dialogueIssues,renderPassages} from '../src/emotional-dialogue.js';
import {endingReactionIssues} from '../src/emotional-ending.js';
import {reflectionIssues} from '../src/emotional-reliability.js';
import {generateEmotional,validateEmotionalArtifact} from '../src/emotional-generation.js';
import {providerFixture,testProfile} from './emotional-fixtures.js';

function world():EmotionalWorld{
 return {...fixtureWorld(),player_name:'Jules',host:{...fixtureWorld().host,name:'Mara'},recipient:{...fixtureWorld().recipient,name:'Ellis'},
  narrationPolicy:'protagonist-camera-5',prosePolicy:'scene-prose-3',endingPolicy:'outcome-reactions-2',factualPolicy:'post-deposit-compact'};
}
function block(w:EmotionalWorld,text:string,speaker:EmotionalPassage['speaker']='NARRATOR',addressee:EmotionalPassage['addressee']='NONE'):EmotionalBlock{
 const passages=[{speaker,addressee,text,lead:'',tail:''}];return{passages,text:renderPassages(w,passages),claims:[]};
}

test('made no attempt does not attribute creation to the named protagonist',()=>{
 const w=world(),text='Their jaw tightened, then loosened, a brief reaction Jules made no attempt to tidy away.';
 assert.deepEqual(dialogueIssues(w,'D3A',block(w,text)),[]);
 for(const text of ['I made no attempt to tidy away.','You made no attempt to conceal it.','I made no attempt to paint it.'])assert.equal(ambiguousAuthorship(text),false,text);
});

test('an attempt idiom cannot exempt a separate actual creation claim',()=>{
 for(const text of ['I made no attempt at the drawing. I painted it.','I made no attempt to object, and I created the work.',
  'I made no attempt to hide and painted the work.','You made no attempt to object; then drew the drawing.','I made the drawing without attempting to hide.']){
  assert.equal(ambiguousAuthorship(text),true,text);
 }
});

test('a negated coordinated infinitive differs from a subsequent affirmed creation',()=>{
 assert.equal(ambiguousAuthorship('I made no attempt to hide and paint the drawing.'),false);
 for(const text of ['Jules made no attempt to hide, yet painted the drawing.','I made no attempt to hide, yet painted the drawing.',
  'I made no attempt to hide, however created the work.','I made no attempt to hide and painted the drawing.']){
  const w=world();assert.ok(text.startsWith('Jules')?dialogueIssues(w,'D3A',block(w,text)).length:ambiguousAuthorship(text),text);
 }
});

test('a semicolon vocative addresses the fixed listener rather than staging a new actor',()=>{
 const w=world();
 assert.deepEqual(endingReactionIssues(w,'F1',block(w,'I will not pretend I know what you will find in it, Mara; I only know my reading feels less certain now.','PLAYER','HOST')),[]);
 w.host.name='Mara Chen';assert.deepEqual(endingReactionIssues(w,'F1',block(w,'I feel uncertain, Mara Chen; you may read it differently.','PLAYER','HOST')),[]);
 assert.deepEqual(endingReactionIssues(w,'F1',block(w,'I feel uncertain, Mara; I have no easy answer.','PLAYER','HOST')),[]);
});

test('a vocative exemption never grants another actor, attribution or material request',()=>{
 const w=world();
 for(const text of ['Mara; Ellis opens the box.','I feel uncertain, Ellis; I have no answer.','I feel uncertain, Mara: I made this drawing.',
  'I feel uncertain, Mara; please move the work.','Mara; they opened the box.'])assert.ok(endingReactionIssues(w,'F1',block(w,text,'PLAYER','HOST')).length,text);
 assert.ok(endingReactionIssues(w,'F1',block(w,'Mara; I feel uncertain.')).length);
});

test('a singular parenthetic judgment about uncertainty is not a collective material choice',()=>{
 const w=world(),b=block(w,'Jules felt uncertainty rather than any clear sense of having protected its meaning.');
 b.passages!.push({speaker:'NARRATOR',addressee:'NONE',text:'That uncertainty, they decided, was honest enough to leave undisturbed.',lead:'',tail:''});
 b.text=renderPassages(w,b.passages!);assert.deepEqual(endingReactionIssues(w,'F5',b),[]);
 assert.deepEqual(endingReactionIssues(w,'F5',block(w,'This doubt, they decided, remained personal.')),[]);
});

test('material, collective and prior decisions remain invalid beside an internal judgment',()=>{
 const w=world();for(const text of ['They decided to display the work.','They both decided to keep it.','Jules and Mara decided to display it.',
  'That uncertainty, they decided, was settled when everyone agreed.','The drawing, they decided, was public.',
  'That uncertainty, they decided, was honest; they chose the box together.'])assert.ok(endingReactionIssues(w,'F5',block(w,text)).length,text);
});

test('a parenthetic judgment cannot refer to a competing pair or justify a shared material action',()=>{
 const w=world();for(const text of ['The artist and the recipient felt doubt. That doubt, they decided, was personal.',
  'Jules and the artist felt doubt. That doubt, they decided, was personal.',
  'That uncertainty, they decided, was their shared reason for putting the drawing in the box.',
  'That uncertainty, they decided, was honest enough to put the drawing in the box.']){
  assert.ok(endingReactionIssues(w,'F5',block(w,text)).length,text);
 }
});

test('denying protagonist authorship while retaining responsibility adds no creation history',()=>{
 const w=world(),text="Jules remained responsible, the artist's drawing entrusted to them rather than made by them.";
 assert.deepEqual(endingReactionIssues(w,'F6',block(w,text)),[]);
});

test('an authorship denial cannot hide positive authorship, history, a new maker or a future task',()=>{
 const w=world();for(const text of ["Jules made the artist's drawing.","Jules remained responsible, the artist's drawing entrusted to them rather than made by them yesterday.",
  "Jules remained responsible, the artist's drawing entrusted to them rather than made by them. They created another work.",
  "Jules remained responsible, Ellis's drawing entrusted to them rather than made by them.",
  "Jules remained responsible, the artist's drawing entrusted to them rather than made by them; they will deliver it tomorrow."]){
  assert.ok(endingReactionIssues(w,'F6',block(w,text)).length,text);
 }
});

test('a nearby protagonist name does not bind another person custody to the protagonist',()=>{
 const w=world();for(const text of ["Jules felt calm. The recipient held the artist's drawing entrusted to them rather than made by them.",
  "Jules remained responsible. The recipient held the artist's drawing entrusted to them rather than made by them.",
  "Jules remained responsible, but the recipient held the artist's drawing entrusted to them rather than made by them."]){
  assert.ok(endingReactionIssues(w,'F6',block(w,text)).length,text);
 }
});

test('the fixed closed-box slot can be observed as opaque after D3B without inventing access',()=>{
 const w=world();for(const text of ['The one-way slot offered no view back.','The one-way slot offers no view back.']){
  assert.deepEqual(reflectionIssues(w,'D3B',text),[],text);
 }
});

test('the same slot observation is invalid before deposit or when the work is retained or displayed',()=>{
 const w=world();for(const id of ['S1','S2','D2A','D3A','D3T','F6'])assert.ok(reflectionIssues(w,id,'The one-way slot offered no view back.').length,id);
 for(const text of ['The slot opened.','The one-way slot offered access back.','The one-way slot offered no view back and opened.',
  'The one-way slot offered no view back. A second slot opened.','They slid the sheet through the slot.']){
  assert.ok(reflectionIssues(w,'D3B',text).length,text);
 }
});

test('full validation accepts the static observation while rejecting appended material actions',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'fixture-only',withArt:false,fetch:providerFixture()});
 const a=structuredClone(r.artifact),b=a.blocks.D3B!;
 b.passages![0]!.text+=' The one-way slot offered no view back.';b.text=renderPassages(a.world,b.passages!);
 assert.equal(validateEmotionalArtifact(a,testProfile).issues.D3B,undefined);
 for(const action of ['Jules opened the box.','They retrieved the drawing.','They slid it through the opening.','They read the explanation.',
  'They pulled the drawing out of the box.','Jules took the drawing back out of the box.','They take it back out.']){
  const changed=structuredClone(a),p=changed.blocks.D3B!;p.passages![0]!.text+=' '+action;p.text=renderPassages(changed.world,p.passages!);
  assert.ok(validateEmotionalArtifact(changed,testProfile).issues.D3B?.length,action);
 }
});

test('full validation rejects a shared-subject creator claim after a negated attempt',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'fixture-only',withArt:false,fetch:providerFixture()});
 const a=structuredClone(r.artifact),b=a.blocks.D3A!;
 b.passages![0]!.text=a.world.player_name+' made no attempt to hide, yet painted the drawing.';b.text=renderPassages(a.world,b.passages!);
 assert.ok(validateEmotionalArtifact(a,testProfile).issues.D3A?.some(s=>s.includes('creator')));
});
