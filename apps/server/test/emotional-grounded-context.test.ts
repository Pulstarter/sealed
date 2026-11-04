import{test}from'node:test';import assert from'node:assert/strict';
import{fixtureWorld}from'../../../packages/engine/test/emotional-fixture.js';
import{endingReactionRequest,endingReactionIssues}from'../src/emotional-ending.js';
import{ambiguousRelationship}from'../src/emotional-continuity.js';
const world=()=>({...fixtureWorld(),endingPolicy:'outcome-reactions-2'}as any);
const block=(text:string,speaker:any='NARRATOR',addressee:any='NONE')=>({text,claims:[],passages:[{speaker,addressee,text}]});
test('final closing preserves physical medium and custodian authorship boundaries without history',()=>{
 const w=world();w.private_reason='PRIVATE_CANARY';w.host.public_wish='WISH_CANARY';
 const r=endingReactionRequest(w,'F1',{key:'test',words:80,plan:{p1:'NARRATOR>NONE',p2:'HOST>PLAYER',p3:'PLAYER>HOST'},intensity:'gentle',exclusions:[]});const p=r.payload as any;
 assert.equal(p.physical_scene.medium,'one physical unframed drawing on a single loose sheet');assert.equal(p.authorship.creator,'the artist');assert.equal(p.authorship.recipient,'the intended recipient');assert.equal(p.authorship.custodian,w.player_name);assert.match(p.physical_scene.public_display,/physical.*pinboard/iu);
 assert.match(p.wire_plan.p02_text,new RegExp(w.host.name));assert.match(p.wire_plan.p02_text,new RegExp(w.player_name));assert.ok(!JSON.stringify(r).includes('PRIVATE_CANARY'));assert.ok(!JSON.stringify(r).includes('WISH_CANARY'));
});
test('ordinary bound you and present resolve are not fabricated approval; digital changes are',()=>{
 const w=world();
 assert.deepEqual(endingReactionIssues(w,'F1',block('I cannot call it back, and I will not pretend that losing that reach leaves me untouched.','PLAYER','HOST')),[]);
 assert.deepEqual(endingReactionIssues(w,'F2',block('I can see that costs you the last say in how it is met.','RECIPIENT','PLAYER')),[]);
 assert.deepEqual(endingReactionIssues(w,'F4',block('Alex felt the loss of control, while the work remained public.')),[]);
 for(const text of['Alex refreshes the page on their phone.','Alex stands before the finished pages.','Alex watches numbers climb beside their own sentences.','Everyone agreed to display it.','Alex remembers the earlier promise.'])assert.ok(endingReactionIssues(w,'F1',block(text)).length,text);
});
test('invitation closeness does not redefine the gift pair',()=>{
 const text='Having asked Mara to join a private moment left Ellis uneasy, as if a simple request might presume a closeness Ellis had no reason to assume between them tonight.';
 assert.equal(ambiguousRelationship(text,['Mara','June'],['Ellis'],true),false);
 assert.equal(ambiguousRelationship(text+' The gift belongs between you and me.',['Mara','June'],['Ellis'],true),true);
});
test('scene field instructions resolve actual speaker and listener, without cloning contradictory legacy prose',async()=>{
 const{resolveSceneRequest,sceneVoiceIssues}=await import('../src/emotional-scene-context.js');const w=world();
 const p:any=resolveSceneRequest(w,{key:'block:S2',model:'muse-wonder-1.0',maxTokens:6400,schema:{},instructions:'old',payload:{block:'S2',target_words:550,paragraph_plan:{p1:'NARRATOR>NONE',p2:'HOST>PLAYER'},projection:{context:{}},instruction:'LEGACY_CONTRADICTORY'}},'3c-54').payload;
 assert.ok(!p.instruction.includes('LEGACY_CONTRADICTORY'));assert.match(p.wire_plan.p02_text,new RegExp(w.host.name));assert.match(p.wire_plan.p02_text,new RegExp(w.player_name));assert.equal(p.known_public_roles.RECIPIENT.name,w.recipient.name);
 assert.ok(sceneVoiceIssues(w,block('What are you afraid Alex or I would say?','PLAYER','HOST')).length);
 assert.ok(sceneVoiceIssues(w,block(w.host.name+', I can hear that concern.','HOST','PLAYER')).length);
 assert.deepEqual(sceneVoiceIssues(w,block('What are you afraid '+w.recipient.name+' or I would say?','PLAYER','HOST')),[]);
});
test('the last timeout settles custody while leaving interpretation open',async()=>{
 const{resolveSceneRequest,sceneVoiceIssues}=await import('../src/emotional-scene-context.js');const w=world();
 const r=resolveSceneRequest(w,{key:'block:D3T',model:'muse-wonder-1.0',maxTokens:3600,schema:{},instructions:'old',payload:{block:'D3T',paragraph_plan:{p1:'NARRATOR>NONE'},projection:{context:{}}}},'3c-54');
 assert.equal((r.payload as any).completed_decision.remaining_material_choice,false);
 assert.ok(sceneVoiceIssues(w,block('The work remained with Alex, along with the choice still to be made.'),'D3T').length);
 assert.deepEqual(sceneVoiceIssues(w,block('What that retained responsibility meant remained unresolved.'),'D3T'),[]);
});
test('the world admission cannot assign a recipient wish to the player it addresses',async()=>{
 const{resolveSceneRequest,admissionVoiceIssues}=await import('../src/emotional-scene-context.js');
 const p=resolveSceneRequest(undefined,{key:'world',model:'muse-spark-1.3',maxTokens:4200,schema:{},instructions:'old',payload:{task:'world',instruction:'base',admission_contract:{speaker:'HOST',addressee:'PLAYER'}}},'3c-54').payload as any;
 assert.equal(p.admission_contract.player_has_no_public_wish,true);assert.match(p.instruction,/you\/your/);
 assert.ok(admissionVoiceIssues('I wanted it seen, though I know that ask costs you quiet.').length);
 assert.deepEqual(admissionVoiceIssues('I know my preference can make quiet feel lonely.'),[]);
});
test('allowing natural dialogue does not admit previous support, settlement or remembered preferences',async()=>{
 const{generateEmotional,validateEmotionalArtifact}=await import('../src/emotional-generation.js');const{providerFixture,testProfile}=await import('./emotional-fixtures.js');const{renderPassages}=await import('../src/emotional-dialogue.js');
 const r=await generateEmotional(testProfile,{apiKey:'test',withArt:false,fetch:providerFixture()});
 for(const text of['I feel grateful because you supported this from the beginning.',"You’ve supported this from the beginning.","We’d settled this together before the viewing.",'I feel relief because we settled this together before the viewing.','You said this was what you hoped for, and that steadies me.','I did want people to be able to see it.','The creator chose the destination.']){
  const a=structuredClone(r.artifact);a.blocks.F1!.passages![1]!.text=text;a.blocks.F1!.text=renderPassages(a.world,a.blocks.F1!.passages!);assert.ok(validateEmotionalArtifact(a,testProfile).issues.F1?.length,text);
 }
});
test('a named recipient is the singular beneficiary, without licensing a player-owned gift pair',()=>{
 const text='June wishes the riverside sheet be openly named as made for them, so their gratitude for it can be seen';
 assert.equal(ambiguousRelationship(text,['Mara','June'],['Robin'],true),false);
 for(const bad of['Robin wishes the sheet be named as made for them.',text+'; this gift is between you and me.'])assert.equal(ambiguousRelationship(bad,['Mara','June'],['Robin'],true),true,bad);
});
test('outer quotes are presentation for a bound speaker; raw words and hidden-tag checks survive',async()=>{
 const{renderPassages,dialogueIssues}=await import('../src/emotional-dialogue.js');const w=world(),raw='"I know the work I made asks that of you.",';
 const p:any={speaker:'HOST',addressee:'PLAYER',lead:'',text:raw,tail:''},text=renderPassages(w,[p]);assert.equal(p.text,raw);assert.equal((text.match(/["“”]/gu)??[]).length,2);
 assert.deepEqual(dialogueIssues(w,'F1',{text,passages:[p],claims:[]}),[]);assert.deepEqual(endingReactionIssues(w,'F1',{text,passages:[p],claims:[]}),[]);
 p.text='"I know", '+w.host.name+' said.';assert.ok(dialogueIssues(w,'F1',{text:renderPassages(w,[p]),passages:[p],claims:[]}).length);
 for(const line of['the work I made because I wanted applause','the work I made to win approval'])assert.ok(endingReactionIssues(w,'F1',block(line,'HOST','PLAYER')).length,line);
});
test('causative feeling and inability to absolve do not invent authorship or literal solitude',async()=>{
 const{attendanceProse}=await import('../src/emotional-3c.js');const w=world();
 assert.deepEqual(endingReactionIssues(w,'F6',block('That fact made the drawing feel unfinished to Alex.')),[]);
 assert.doesNotMatch(attendanceProse(w,'There was no one else to absolve the hesitation.'),/no one else/iu);
 assert.match(attendanceProse(w,'There was no one else to absolve the hesitation, and no one else was in the room.'),/no one else was in the room/iu);
});
