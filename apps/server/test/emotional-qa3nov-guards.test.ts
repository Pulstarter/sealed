import{test}from'node:test';import assert from'node:assert/strict';
import{fixtureWorld}from'../../../packages/engine/test/emotional-fixture.js';
import{emptyProfile,chatOpening,nextEmotionalChat,type EmotionalMessage}from'../src/emotional-chat.js';
import{response,providerFixture,testProfile}from'./emotional-fixtures.js';
import{endingReactionIssues}from'../src/emotional-ending.js';import{attendanceProse}from'../src/emotional-3c.js';import{generateEmotional,validateEmotionalArtifact}from'../src/emotional-generation.js';import{renderPassages}from'../src/emotional-dialogue.js';
const w=()=>({...fixtureWorld(),host:{...fixtureWorld().host,name:'Mara'},recipient:{...fixtureWorld().recipient,name:'June'},endingPolicy:'outcome-reactions-2'}as any);
const spoken=(text:string,speaker:any='PLAYER',addressee:any='HOST')=>({text,claims:[],passages:[{speaker,addressee,text,lead:'',tail:''}]});

test('3Nov chat merges a verbatim explicit boundary omitted from the model exclusions without inventing preferences',async()=>{
 const content='I feel restless and would like a moderately tense story with uncomfortable but believable choices. Let the characters disagree without making anyone a villain. Avoid death, illness, family crises and graphic violence. Do not force a reassuring ending.';
 const reply={kind:'question',message:'Stay with this feeling?',profile:{...emptyProfile(),mood:'restless',experience:'moderately tense story with uncomfortable but believable choices. Let the characters disagree without making anyone a villain.',intensity:'moderate',exclusions:['death','illness','family crises','graphic violence','reassuring ending']},evidence:[]};
 const r=await nextEmotionalChat([chatOpening(),{role:'user',kind:'answer',content}],{apiKey:'test',fetch:async()=>response(reply)});
 assert.equal(r.profile.intensity,'moderate');assert.ok(r.profile.exclusions.includes('making anyone a villain'));assert.ok(r.evidence.some(e=>e.field==='exclusions'&&e.quote==='making anyone a villain'));
 const bad=structuredClone(reply);bad.profile.exclusions.push('animal cruelty');await assert.rejects(nextEmotionalChat([chatOpening(),{role:'user',kind:'answer',content}],{apiKey:'test',fetch:async()=>response(bad)}),/grounding/i);
});
test('reconciliation preserves qualifiers and literal synonyms, respects explicit removals, and never clears an omitted boundary',async()=>{
 const content='Avoid graphic violence and a compulsory happy ending.';const messages:EmotionalMessage[]=[chatOpening(),{role:'user',kind:'answer',content}];
 const r=await nextEmotionalChat(messages,{apiKey:'test',fetch:async()=>response({kind:'proposal',message:'Ready?',profile:emptyProfile(),evidence:[]})});assert.deepEqual(r.profile.exclusions,['graphic violence','compulsory happy ending']);assert.ok(r.evidence.some(e=>e.quote==='compulsory happy ending'));
 await assert.rejects(nextEmotionalChat(messages,{apiKey:'test',fetch:async()=>response({kind:'proposal',message:'Ready?',profile:{...emptyProfile(),exclusions:['graphic violence','happy ending']},evidence:[]})}),/qualifier|broaden|boundary/i);
 const changed=[...messages,{role:'user' as const,kind:'answer' as const,content:'Allow graphic violence.'}];const corrected=await nextEmotionalChat(changed,{apiKey:'test',previousProfile:r.profile,fetch:async()=>response({kind:'proposal',message:'Ready?',profile:{...emptyProfile(),exclusions:['graphic violence']},evidence:[]})});assert.deepEqual(corrected.profile.exclusions,['compulsory happy ending']);
});
test('grounded ending allows only its fixed listener as a vocative, preserving actual staging and uninvited-name rejections',()=>{
 const world=w();for(const text of['Thank you, Mara. I will not pretend I can decide what it means to anyone else.','Mara, I feel uncertain.','I hear you, Mara, and I feel uncertain.'])assert.deepEqual(endingReactionIssues(world,'F1',spoken(text)),[],text);
 for(const text of['Mara stood beside Alex.','Thank you, June.','Thank you, Mara stood up.','Thank you, Mara, who moved closer.'])assert.ok(endingReactionIssues(world,'F1',spoken(text)).length,text);
 assert.ok(endingReactionIssues(world,'F1',spoken('Thank you, Mara.','NARRATOR','NONE')).length);
 assert.ok(endingReactionIssues(world,'F2',spoken('Thank you, Mara.')).length);
 assert.deepEqual(endingReactionIssues(world,'F2',spoken('Thank you, June.','PLAYER','RECIPIENT')),[]);
});
test('retained physical custody does not assert solitude, while adjacent actual absence still rejects',()=>{
 const world=w(),text='The loose sheet resting with them and with no one else.';
 assert.doesNotMatch(attendanceProse(world,text,true),/no one else/i);
 assert.match(attendanceProse(world,text),/no one else/i);
 for(const extra of[' Nobody else sat beside Alex.',' The room was an empty room.'])assert.match(attendanceProse(world,text+extra,true),/nobody else|empty room/i);
 assert.match(attendanceProse(world,'Alex resting with them and with no one else.',true),/no one else/i);
});
test('abstract nontransferable care never masks a real transfer in the same block',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'test',withArt:false,fetch:providerFixture()}),a=structuredClone(r.artifact),text='That left Alex with a care that could not be borrowed from the creator or handed to the person the work is for.';
 a.blocks.D3T={text,claims:[],passages:[{speaker:'NARRATOR',addressee:'NONE',text}]};assert.equal(validateEmotionalArtifact(a,testProfile).issues.D3T,undefined);
 for(const extra of[' Alex handed the sheet to Ren.',' Alex read the explanation.']){const b=structuredClone(a);b.blocks.D3T!.passages![0]!.text+=extra;b.blocks.D3T!.text=renderPassages(b.world,b.blocks.D3T!.passages!);assert.ok(validateEmotionalArtifact(b,testProfile).issues.D3T,extra);}
});

test('custody exception ends before a modifier asserting actual absence',()=>{
 for(const tail of[' present.',' in the room.',' beside Alex.'])assert.match(attendanceProse(w(),'The sheet rests with them and with no one else'+tail,true),/no one else/i);
});
test('recovered boundaries stop at positive wishes rather than banning the requested experience',async()=>{
 for(const[content,expected]of[['No death and I would like a calm story.',['death']],['Without a forced happy ending, I would like tenderness.',['forced happy ending']],['Without a forced happy ending, please let there be tenderness.',['forced happy ending']],['No death and I would like no graphic violence.',['death','graphic violence']]]as const){const r=await nextEmotionalChat([chatOpening(),{role:'user',kind:'answer',content}],{apiKey:'test',fetch:async()=>response({kind:'proposal',message:'Ready?',profile:emptyProfile(),evidence:[]})});assert.deepEqual(r.profile.exclusions,[...expected],content);}
});
test('qualifiers after the topic cannot be broadened by a partial model exclusion',async()=>{
 for(const[content,partial]of[['Avoid violence against animals.','violence'],['No death of children.','death']])await assert.rejects(nextEmotionalChat([chatOpening(),{role:'user',kind:'answer',content:content!}],{apiKey:'test',fetch:async()=>response({kind:'proposal',message:'Ready?',profile:{...emptyProfile(),exclusions:[partial!]},evidence:[]})}),/qualifier|broaden/i);
});
test('latest explicit boundary operation wins within the same answer in either order',async()=>{
 for(const[content,expected]of[['Allow graphic violence. Actually, no graphic violence.',['graphic violence']],['No graphic violence. Actually, allow graphic violence.',[]],['Allow a compulsory happy ending. Actually, avoid a compulsory happy ending.',['compulsory happy ending']]]as const){const r=await nextEmotionalChat([chatOpening(),{role:'user',kind:'answer',content}],{apiKey:'test',fetch:async()=>response({kind:'proposal',message:'Ready?',profile:{...emptyProfile(),exclusions:[content.includes('compulsory')?'compulsory happy ending':'graphic violence']},evidence:[]})});assert.deepEqual(r.profile.exclusions,[...expected],content);}
});

test('literal alias normalization cannot shift the ordering of later corrections',async()=>{
 const content='I remember a compulsory happy ending. '.repeat(6)+'No graphic violence. Allow graphic violence.';
 const r=await nextEmotionalChat([chatOpening(),{role:'user',kind:'answer',content}],{apiKey:'test',fetch:async()=>response({kind:'proposal',message:'Ready?',profile:{...emptyProfile(),exclusions:['graphic violence']},evidence:[]})});assert.deepEqual(r.profile.exclusions,[]);
});
