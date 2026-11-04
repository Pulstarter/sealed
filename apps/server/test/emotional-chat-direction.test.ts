import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chatOpening,emptyProfile,nextEmotionalChat,type EmotionalMessage} from '../src/emotional-chat.js';
import {response} from './emotional-fixtures.js';

const preferences="I feel mentally tired. I'd like a gentle, quiet mystery with a small human connection, keeping this calm mood. Please leave out death, illness, family crises and graphic violence.";
const profile={...emptyProfile(),mood:'mentally tired',direction:'accompany' as const,experience:'a gentle, quiet mystery with a small human connection',exclusions:['death','illness','family crises','graphic violence'],intensity:'gentle' as const};
const messages=(content:string):EmotionalMessage[]=>[chatOpening(),{role:'user',kind:'answer',content}];

test('the reported keeping-this-calm-mood profile reaches a proposal with all boundaries',async()=>{
 const result=await nextEmotionalChat(messages(preferences),{apiKey:'test',fetch:(async()=>response({kind:'proposal',message:'A gentle mystery. Shall we prepare it?',profile,evidence:[{field:'direction',quote:'keeping this calm mood'}]}))as typeof fetch});
 assert.equal(result.kind,'proposal');assert.deepEqual(result.profile,profile);assert.ok(result.evidence.some(e=>e.field==='direction'&&e.quote.includes('keeping this calm mood')));
});

test('keeping a mood does not authorize accompany when negated',async()=>{
 for(const text of ['I do not want a story keeping this calm mood.','Please avoid keeping this calm mood.','I would like a mystery without keeping this calm mood.']){
  await assert.rejects(nextEmotionalChat(messages(text),{apiKey:'test',fetch:(async()=>response({kind:'proposal',message:'Ready?',profile:{...emptyProfile(),direction:'accompany'},evidence:[]}))as typeof fetch}),/grounding failed for direction/i);
 }
});

test('keeping something other than the mood does not authorize accompany',async()=>{
 for(const text of ['I feel calm. Keep the story in one room.','I would like a mystery about keeping an old painting.','I would like calm fiction, keeping this character company.']){
  await assert.rejects(nextEmotionalChat(messages(text),{apiKey:'test',fetch:(async()=>response({kind:'proposal',message:'Ready?',profile:{...emptyProfile(),direction:'accompany'},evidence:[]}))as typeof fetch}),/grounding failed for direction/i);
 }
});

test('keeping or changing the mood leaves the direction unchosen',async()=>{
 const text='A mystery keeping this calm mood or changing it could work.';
 await assert.rejects(nextEmotionalChat(messages(text),{apiKey:'test',fetch:(async()=>response({kind:'proposal',message:'Ready?',profile:{...emptyProfile(),direction:'accompany'},evidence:[]}))as typeof fetch}),/grounding failed for direction/i);
});

test('the second QA profile changes the atmosphere without losing moderate intensity or exclusions',async()=>{
 const text="I'm curious and restless. I'd like a moderately tense mystery that changes the atmosphere, with meaningful choices and an uncertain outcome. Please leave out death, illness, family crises and graphic violence.";
 const result=await nextEmotionalChat(messages(text),{apiKey:'test',fetch:(async()=>response({kind:'proposal',message:'Ready?',profile:{...emptyProfile(),mood:'curious and restless',direction:'shift',intensity:'moderate',experience:'meaningful choices and an uncertain outcome',exclusions:['death','illness','family crises','graphic violence']},evidence:[]}))as typeof fetch});
 assert.equal(result.kind,'proposal');assert.equal(result.profile.direction,'shift');assert.equal(result.profile.intensity,'moderate');assert.deepEqual(result.profile.exclusions,['death','illness','family crises','graphic violence']);
});

test('negated atmosphere changes and changes to other things do not authorize a shift',async()=>{
 for(const text of ['I do not want a story that changes the atmosphere.','Please avoid a mystery that changes the atmosphere.','I want a mystery about small changes to a painting.']){
  await assert.rejects(nextEmotionalChat(messages(text),{apiKey:'test',fetch:(async()=>response({kind:'proposal',message:'Ready?',profile:{...emptyProfile(),direction:'shift'},evidence:[]}))as typeof fetch}),/grounding failed for direction/i);
 }
});

test('the third QA profile accompanies sadness without imposing a happy ending',async()=>{
 const text="I feel a little sad. I'd like a bittersweet mystery that stays with this feeling, with gentle human connection and no forced happy ending. Please leave out death, illness, family crises and graphic violence.";
 const result=await nextEmotionalChat(messages(text),{apiKey:'test',fetch:(async()=>response({kind:'proposal',message:'Ready?',profile:{...emptyProfile(),mood:'a little sad',direction:'accompany',intensity:'gentle',experience:'a bittersweet mystery',exclusions:['forced happy ending','death','illness','family crises','graphic violence']},evidence:[]}))as typeof fetch});
 assert.equal(result.kind,'proposal');assert.equal(result.profile.direction,'accompany');assert.equal(result.profile.intensity,'gentle');assert.deepEqual(result.profile.exclusions,['forced happy ending','death','illness','family crises','graphic violence']);
});

test('a boundary mentioned only in experience is recovered literally into exclusions',async()=>{
 const text="I feel a little sad. I'd like a bittersweet mystery that stays with this feeling, with gentle human connection and no forced happy ending. Please leave out death, illness, family crises and graphic violence.";
 const recovered=await nextEmotionalChat(messages(text),{apiKey:'test',fetch:(async()=>response({kind:'question',message:'What intensity?',profile:{...emptyProfile(),mood:'a little sad',direction:'accompany',experience:'bittersweet mystery that stays with this feeling, with gentle human connection and no forced happy ending',exclusions:['death','illness','family crises','graphic violence']},evidence:[]}))as typeof fetch});assert.ok(recovered.profile.exclusions.includes('forced happy ending'));
});
