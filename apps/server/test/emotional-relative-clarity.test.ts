import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixtureWorld} from '../../../packages/engine/test/emotional-fixture.js';
import {ambiguousAuthorship} from '../src/emotional-3c.js';
import {dialogueIssues,renderPassages} from '../src/emotional-dialogue.js';
import {generateEmotional} from '../src/emotional-generation.js';
import {providerFixture,response,testProfile} from './emotional-fixtures.js';
import type {EmotionalWorld,EmotionalBlock,EmotionalPassage} from '../../../packages/engine/src/emotional-types.js';
const world=():EmotionalWorld=>({...fixtureWorld(),player_name:'Ellis',host:{...fixtureWorld().host,name:'Mara'},recipient:{...fixtureWorld().recipient,name:'Jonah'},endingPolicy:'outcome-reactions-2'});
function speech(w:EmotionalWorld,text:string,speaker:EmotionalPassage['speaker']='PLAYER',addressee:EmotionalPassage['addressee']='RECIPIENT'):EmotionalBlock{
 const passages=[{speaker,addressee,text,lead:'',tail:''}];return{text:renderPassages(w,passages),claims:[],passages};
}

test('the recorded nominal request is not another speaker tag',()=>{
 const w=world();for(const text of [
  'Jonah, I hear the difference, but I do not agree that open acknowledgement settles it. If thanks becomes visible too soon, Mara still loses the slow noticing Mara asked for.',
  'That is the quiet Mara asked for, without making your thanks smaller.',
  'I understand the time Mara asked for.',
 ])assert.deepEqual(dialogueIssues(w,'S1',speech(w,text)),[],text);
});

test('a direct speaker tag, quoted answer or actual request cannot hide behind a nominal reference',()=>{
 const w=world();for(const text of [
  'Mara asked for the drawing.',
  'The quiet Mara asked for: hand me the drawing.',
  'The quiet Mara asked for, Mara said the answer softly.',
  'I understand the quiet. Mara asked for a place at the table.',
  'The slow noticing Mara asked for, Mara said: I painted it.',
  'The quiet Mara asked for, then said: I feel fine.',
 ])assert.ok(dialogueIssues(w,'S1',speech(w,text)).length,text);
});

test('the recorded reflexive clarity statement does not attribute artwork creation',()=>{
 const w=world(),text='I thought I had made myself clear to you, Ellis, but sitting here I can hear I sounded firmer than I felt, and I would rather you heard my uncertainty too.';
 assert.deepEqual(dialogueIssues(w,'ARRB',speech(w,text,'RECIPIENT','PLAYER')),[]);
 for(const text of ["I had made myself clear.","I'd made myself clear to you.",'You made yourself clear.'])assert.equal(ambiguousAuthorship(text),false,text);
});

test('clarity does not exempt an artwork claim, a different reflexive or a creative continuation',()=>{
 for(const text of [
  'I made myself the drawing.',
  'I made myself clear by painting the sheet.',
  'I made myself clear, drawing the sheet.',
  'I made myself clear, and I painted the drawing.',
  'I made myself clear: I created the work.',
  'I made myself clear to you, Ellis, by repainting the drawing.',
  'I made yourself clear.',
  'You made myself clear.',
  'I made myself clear, and I will paint the work.',
 ])assert.equal(ambiguousAuthorship(text),true,text);
});

test('only the bound creator can still claim actual creation beside a clarity idiom',()=>{
 const w=world();assert.ok(dialogueIssues(w,'ARRB',speech(w,'I made myself clear, and I made this drawing.','RECIPIENT','PLAYER')).length);
 assert.deepEqual(dialogueIssues(w,'S1',speech(w,'I made this drawing.','HOST','PLAYER')),[]);
});

test('complete generation accepts the two meanings without repairing or rewriting their words',async()=>{
 const base=providerFixture(),w=fixtureWorld(),starts:string[]=[];
 const lines={S1:`You lose the slow noticing ${w.host.name} asked for.`,ARRB:`I thought I had made myself clear to you, ${w.player_name}, but I sounded firmer than I felt.`};
 const r=await generateEmotional(testProfile,{apiKey:'fixture-only',withArt:false,onStart:s=>{starts.push(s.key);},fetch:(async(url,init)=>{
  const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content),res=await base(url,init);
  if(!(p.block in lines))return res;
  const raw=await res.json(),wire=JSON.parse(raw.choices[0].message.content);wire[p.block==='S1'?'p10_text':'p02_text']=lines[p.block as keyof typeof lines];return response(wire,req.model);
 })as typeof fetch});
 assert.deepEqual(r.validation.issues,{});assert.ok(!starts.some(k=>/^repair\d*:(?:S1|ARRB)$/u.test(k)));
 assert.equal(r.artifact.blocks.S1!.passages![9]!.text,lines.S1);assert.equal(r.artifact.blocks.ARRB!.passages![1]!.text,lines.ARRB);
});

for(const [id,field,text]of [['S1','p10_text','Mara Chen said: I painted this.'],['ARRB','p02_text','I made myself clear, and I painted this drawing.']])test('complete generation still refuses a persistent real violation in '+id,async()=>{
 const base=providerFixture();let last:any;
 await assert.rejects(generateEmotional(testProfile,{apiKey:'fixture-only',withArt:false,onCheckpoint:c=>{last=c;},fetch:(async(url,init)=>{
  const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content),res=await base(url,init);if(p.block!==id)return res;
  const raw=await res.json(),wire=JSON.parse(raw.choices[0].message.content);wire[field!]=text;return response(wire,req.model);
 })as typeof fetch}),/validation failed/iu);assert.equal(last.repairPass,2);
});

test('clarity may be followed by a noun or a correctly attributed creator statement',()=>{
 const w=world();assert.deepEqual(dialogueIssues(w,'ARRB',speech(w,'I made myself clear, but the drawing still feels unfinished.','RECIPIENT','PLAYER')),[]);
 assert.deepEqual(dialogueIssues(w,'S1',speech(w,'I made myself clear, but you painted something quieter than I expected.','RECIPIENT','HOST')),[]);
 assert.equal(ambiguousAuthorship('I made myself clear, and drew a slow breath.'),false);
});

test('a clarity addressee can use a known full name or unique first name',()=>{
 const w=world();assert.deepEqual(dialogueIssues(w,'ARRB',speech(w,'I made myself clear to Ellis.','RECIPIENT','PLAYER')),[]);
 for(const name of ['Ellis','Ellis Cole','Élodie Martin','赵明',"O'Neill"]){assert.equal(ambiguousAuthorship('I made myself clear to '+name+'.',undefined,[name]),false,name);}
 assert.equal(ambiguousAuthorship('I made myself clear to Ellis.',undefined,['Ellis Cole','Ellis Vega']),true);
 assert.equal(ambiguousAuthorship('I made myself clear to A Stranger.',undefined,['Ellis']),true);
});

test('a second explicitly attributed voice cannot hide in the next sentence after a relative',async()=>{
 const w=world(),text='That is the quiet Mara asked for. They said: I need time.';assert.ok(dialogueIssues(w,'S1',speech(w,text)).length);
 const base=providerFixture();await assert.rejects(generateEmotional(testProfile,{apiKey:'fixture-only',withArt:false,fetch:(async(url,init)=>{
  const q=JSON.parse(String(init?.body)),p=JSON.parse(q.messages[1].content),res=await base(url,init);if(p.block!=='S1')return res;
  const raw=await res.json(),wire=JSON.parse(raw.choices[0].message.content);wire.p10_text='That is the quiet '+fixtureWorld().host.name+' asked for. They said: I need time.';return response(wire,q.model);
 })as typeof fetch}),/validation failed/iu);
});

test('the explicit relative marker that keeps the same nominal request meaning',()=>{
 const w=world();assert.deepEqual(dialogueIssues(w,'S1',speech(w,'That is the quiet that Mara asked for.')),[]);
 assert.ok(dialogueIssues(w,'S1',speech(w,'That is the quiet that Mara asked for. They said: I need time.')).length);
});
