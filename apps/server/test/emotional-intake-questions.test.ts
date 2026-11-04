import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chatOpening,emptyProfile,nextEmotionalChat,type EmotionalMessage} from '../src/emotional-chat.js';
import {response} from './emotional-fixtures.js';

test('a repeated atmosphere question advances to an unanswered preference without another paid call',async()=>{
 const messages:EmotionalMessage[]=[chatOpening(),{role:'user',kind:'answer',content:'Curious. A change of atmosphere, please.'}];let calls=0;
 const result=await nextEmotionalChat(messages,{apiKey:'test',fetch:(async()=>{calls++;return response({kind:'question',message:'Stay with your feeling or change the atmosphere?',profile:{...emptyProfile(),mood:'Curious',direction:'shift'},evidence:[]});}) as typeof fetch});
 assert.equal(calls,1);assert.equal(result.kind,'question');assert.equal(result.profile.direction,'shift');assert.match(result.message,/gentle|moderate|tense/i);assert.doesNotMatch(result.message,/atmosphere|stay with/i);
});
test('a skipped boundary is an answer and is not asked again',async()=>{
 const messages:EmotionalMessage[]=[chatOpening(),{role:'user',kind:'answer',content:'Curious. A change of atmosphere. Gentle.'},{role:'assistant',kind:'question',content:'Is there anything you would like to leave out?'},{role:'user',kind:'answer',content:'None'}];
 const result=await nextEmotionalChat(messages,{apiKey:'test',fetch:(async()=>response({kind:'question',message:'Any boundaries?',profile:{...emptyProfile(),mood:'Curious',direction:'shift',intensity:'gentle'},evidence:[]})) as typeof fetch});
 assert.equal(result.kind,'proposal');assert.deepEqual(result.profile.exclusions,[]);
});
test('a short new answer cannot erase the direction already confirmed',async()=>{
 const messages:EmotionalMessage[]=[chatOpening(),{role:'user',kind:'answer',content:'A change of atmosphere'},{role:'assistant',kind:'question',content:'Gentle, moderate, or tense?'},{role:'user',kind:'answer',content:'Gentle'}];
 const result=await nextEmotionalChat(messages,{apiKey:'test',previousProfile:{...emptyProfile(),direction:'shift'},fetch:(async()=>response({kind:'question',message:'Stay with your feeling or change the atmosphere?',profile:{...emptyProfile(),intensity:'gentle'},evidence:[]})) as typeof fetch});
 assert.equal(result.profile.direction,'shift');assert.match(result.message,/leave out/i);assert.doesNotMatch(result.message,/atmosphere/i);
});
test('explicitly clearing preferences does not restore their earlier grounded values',async()=>{
 const messages:EmotionalMessage[]=[chatOpening(),{role:'user',kind:'answer',content:'I am tired. Please accompany this with a gentle quiet mystery.'},{role:'assistant',kind:'proposal',content:'A quiet mystery.'},{role:'user',kind:'answer',content:'Please clear my mood. Leave direction unspecified. Remove my experience preference. Leave intensity open.'}];
 const result=await nextEmotionalChat(messages,{apiKey:'test',previousProfile:{...emptyProfile(),mood:'tired',direction:'accompany',intensity:'gentle',experience:'quiet mystery'},fetch:(async()=>response({kind:'proposal',message:'Ready?',profile:emptyProfile(),evidence:[]})) as typeof fetch});
 assert.deepEqual(result.profile,emptyProfile());
});
test('natural proposal corrections are not overwritten by the short-answer preservation rule',async()=>{
 for(const content of ['Please leave my intensity preference unspecified.','Please remove my mood, direction, experience and intensity preferences; leave them unspecified.']){
  const messages:EmotionalMessage[]=[chatOpening(),{role:'user',kind:'answer',content:'I am tired. Please accompany this with a gentle quiet mystery.'},{role:'assistant',kind:'proposal',content:'A quiet mystery.'},{role:'user',kind:'answer',content}];
  const result=await nextEmotionalChat(messages,{apiKey:'test',previousProfile:{...emptyProfile(),mood:'tired',direction:'accompany',intensity:'gentle',experience:'quiet mystery'},fetch:(async()=>response({kind:'proposal',message:'Ready?',profile:emptyProfile(),evidence:[]})) as typeof fetch});
  assert.equal(result.profile.intensity,'unspecified');
 }
});

test('a mystery that stays with my mood is an explicit accompany request, including after rejected answers remain in history',async()=>{
 const initial="I'm tired, I'd like a gentle mystery that stays with my mood";
 const answers=[initial,'I feel tired. Please make it a gentle mystery with a soft tone, intensity Gentle.','I would rather leave that unspecified. Please continue with what I have already said.'];
 for(let n=1;n<=3;n++){
  const messages:EmotionalMessage[]=[chatOpening(),...answers.slice(0,n).map(content=>({role:'user' as const,kind:'answer' as const,content}))];
  const result=await nextEmotionalChat(messages,{apiKey:'test',previousProfile:emptyProfile(),fetch:(async()=>response({kind:'question',message:'Anything to leave out?',profile:{...emptyProfile(),mood:'tired',direction:'accompany',experience:'gentle mystery',intensity:'gentle'},evidence:[{field:'direction',quote:'stays with my mood'}]})) as typeof fetch});
  assert.equal(result.profile.direction,'accompany');assert.equal(result.profile.intensity,'gentle');assert.match(result.message,/leave out/i);
 }
});

test('a negated stays-with-my-mood request cannot ground accompany',async()=>{
 const messages:EmotionalMessage[]=[chatOpening(),{role:'user',kind:'answer',content:'I do not want a mystery that stays with my mood.'}];
 await assert.rejects(nextEmotionalChat(messages,{apiKey:'test',fetch:(async()=>response({kind:'question',message:'Anything to leave out?',profile:{...emptyProfile(),direction:'accompany'},evidence:[]})) as typeof fetch}),/grounding failed for direction/i);
});


test('moderately tense grounds moderate intensity, including both reported formulations',async()=>{
 for(const content of ["I feel restless. I'd like to shift toward warm curiosity through a moderately tense mystery. Avoid graphic violence and a compulsory happy ending.","I'm feeling restless and would like to move toward warm curiosity, with a mystery that is moderately tense. Please no graphic violence, and no forced happy ending."]){
  const messages:EmotionalMessage[]=[chatOpening(),{role:'user',kind:'answer',content}];
  const result=await nextEmotionalChat(messages,{apiKey:'recorded',fetch:(async()=>response({kind:'proposal',message:'Ready?',profile:{...emptyProfile(),intensity:'moderate',exclusions:content.includes('compulsory')?['graphic violence','compulsory happy ending']:['graphic violence','forced happy ending']},evidence:[{field:'intensity',quote:'moderately tense'},{field:'exclusions',quote:content}]}))as typeof fetch});
  assert.equal(result.profile.intensity,'moderate');assert.equal(result.kind,'proposal');
 }
});
test('a negated moderately tense request does not authorize moderate intensity',async()=>{
 const messages:EmotionalMessage[]=[chatOpening(),{role:'user',kind:'answer',content:'I do not want a moderately tense mystery.'}];
 await assert.rejects(nextEmotionalChat(messages,{apiKey:'recorded',fetch:(async()=>response({kind:'proposal',message:'Ready?',profile:{...emptyProfile(),intensity:'moderate'},evidence:[{field:'intensity',quote:'moderately tense'}]}))as typeof fetch}),/grounding failed for intensity/i);
});

test('compulsory and forced happy ending remain the same boundary after an article and reformulation',async()=>{
 const messages:EmotionalMessage[]=[chatOpening(),{role:'user',kind:'answer',content:'Avoid graphic violence and a compulsory happy ending.'},{role:'user',kind:'answer',content:'Please no graphic violence, and no forced happy ending.'}];
 const result=await nextEmotionalChat(messages,{apiKey:'recorded',fetch:(async()=>response({kind:'proposal',message:'Ready?',profile:{...emptyProfile(),exclusions:['graphic violence','forced happy ending']},evidence:[]}))as typeof fetch});assert.deepEqual(result.profile.exclusions,['graphic violence','forced happy ending']);
});
test('normalizing an article or forced-ending wording cannot omit another boundary or its qualifier',async()=>{
 const messages:EmotionalMessage[]=[chatOpening(),{role:'user',kind:'answer',content:'Avoid graphic violence and a compulsory happy ending.'}];
 const preserved=await nextEmotionalChat(messages,{apiKey:'recorded',fetch:(async()=>response({kind:'proposal',message:'Ready?',profile:{...emptyProfile(),exclusions:['compulsory happy ending']},evidence:[]}))as typeof fetch});assert.ok(preserved.profile.exclusions.includes('graphic violence'));
 await assert.rejects(nextEmotionalChat(messages,{apiKey:'recorded',fetch:(async()=>response({kind:'proposal',message:'Ready?',profile:{...emptyProfile(),exclusions:['graphic violence','happy ending']},evidence:[]}))as typeof fetch}),/qualifier|broadened/i);
});

test('an explicit allow correction can remove a boundary written with a or an',async()=>{
 for(const boundary of ['a compulsory happy ending','an animal death']){
  const messages:EmotionalMessage[]=[chatOpening(),{role:'user',kind:'answer',content:'Avoid '+boundary+'.'},{role:'assistant',kind:'proposal',content:'Ready?'},{role:'user',kind:'answer',content:'Allow '+boundary+'.'}];
  const result=await nextEmotionalChat(messages,{apiKey:'recorded',previousProfile:{...emptyProfile(),exclusions:[boundary]},fetch:(async()=>response({kind:'proposal',message:'Ready?',profile:emptyProfile(),evidence:[]}))as typeof fetch});assert.deepEqual(result.profile.exclusions,[]);
 }
});
test('do not allow with a or an does not remove the earlier boundary',async()=>{
 for(const boundary of ['a compulsory happy ending','an animal death']){
  const messages:EmotionalMessage[]=[chatOpening(),{role:'user',kind:'answer',content:'Avoid '+boundary+'.'},{role:'assistant',kind:'proposal',content:'Ready?'},{role:'user',kind:'answer',content:'Do not allow '+boundary+'.'}];
  const preserved=await nextEmotionalChat(messages,{apiKey:'recorded',previousProfile:{...emptyProfile(),exclusions:[boundary]},fetch:(async()=>response({kind:'proposal',message:'Ready?',profile:emptyProfile(),evidence:[]}))as typeof fetch});assert.deepEqual(preserved.profile.exclusions,[boundary.replace(/^(?:a|an) /,'')]);
 }
});
