import {test} from 'node:test';
import assert from 'node:assert/strict';
import {repeatedPassages} from '../src/emotional-3c.js';
import {emotionalFixture} from '../../../packages/engine/test/emotional-fixture.js';
import {generateEmotional} from '../src/emotional-generation.js';
import {providerFixture,testProfile} from './emotional-fixtures.js';

test('the reported thirteen-word Ellis gesture is rejected when it recurs on one route',()=>{
 const a=emotionalFixture();(a.world as any).choicePolicy='two-buttons-and-timeout';
 const line='Ellis tilted their head slowly and held eye contact a moment too long.';
 a.blocks.S1!.text=line;a.blocks.S2!.text=line;a.blocks.S3!.text=line;
 const issues=repeatedPassages(a,[{route:'AAA',blocks:['S1','S2','S3']}]);
 assert.match((issues.S2??[]).join(' '),/repeat/i);assert.match((issues.S3??[]).join(' '),/repeat/i);
});
test('the same brief spoken line is rejected along a route but allowed in incompatible alternatives',()=>{
 const a=emotionalFixture();(a.world as any).choicePolicy='two-buttons-and-timeout';
 a.blocks.D1A!.passages=[{speaker:'HOST',addressee:'PLAYER',text:'Please stay for a moment.'}];a.blocks.D1B!.passages=structuredClone(a.blocks.D1A!.passages);a.blocks.S2!.passages=structuredClone(a.blocks.D1A!.passages);
 assert.match((repeatedPassages(a,[{route:'AAA',blocks:['D1A','S2']}]).S2??[]).join(' '),/repeat/i);
 assert.deepEqual(repeatedPassages(a,[{route:'AAA',blocks:['D1A']},{route:'BAA',blocks:['D1B']}]),{});
});
test('the canonical motive may be recalled once but not twice inside an ending',()=>{
 const a=emotionalFixture();(a.world as any).choicePolicy='two-buttons-and-timeout';
 const reason='The old blue shape recalled an ordinary afternoon they had almost forgotten.';a.world.private_reason=reason;
 a.blocks.D2A!.text=reason;a.blocks.F1!.text=reason+' '+reason;
 assert.match((repeatedPassages(a,[{route:'AAA',blocks:['D2A','F1']}]).F1??[]).join(' '),/repeat/i);
 a.blocks.F1!.text=reason;assert.deepEqual(repeatedPassages(a,[{route:'AAA',blocks:['D2A','F1']}]),{});
});
test('the recurring gesture is introduced once rather than supplied as a repeated writing cue',async()=>{
 const fixture=providerFixture();let opening=false;const later:{block:string;role:string;gesture:unknown}[]=[];
 const fetcher=(async(url,init)=>{const payload=JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
  if(payload.reaction_contract){assert.equal(payload.projection,undefined);assert.equal(payload.host,undefined);assert.equal(payload.recipient,undefined);}
  else if(payload.task!=='world')for(const role of ['host','recipient','guest']){const actor=payload.projection.context[role];if(!actor)continue;if(payload.block==='S1'){opening ||=typeof actor.gesture==='string';}else later.push({block:payload.block,role,gesture:actor.gesture});}
  return fixture(url,init);
 }) as typeof fetch;
 await generateEmotional(testProfile,{apiKey:'test',fetch:fetcher,withArt:false});assert.ok(opening&&later.length);for(const row of later)assert.equal(row.gesture,undefined,row.block+' '+row.role);
});
