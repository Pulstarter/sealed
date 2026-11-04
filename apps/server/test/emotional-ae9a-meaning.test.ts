import{test}from'node:test';import assert from'node:assert/strict';
import{ambiguousRelationship}from'../src/emotional-continuity.js';import{endingReactionIssues}from'../src/emotional-ending.js';import{generateEmotional,validateEmotionalArtifact}from'../src/emotional-generation.js';import{providerFixture,testProfile}from'./emotional-fixtures.js';import{renderPassages}from'../src/emotional-dialogue.js';import{fixtureWorld}from'../../../packages/engine/test/emotional-fixture.js';
const w=()=>({...fixtureWorld(),endingPolicy:'outcome-reactions-2' as const});
const narration=(text:string)=>({text,claims:[],passages:[{speaker:'NARRATOR' as const,addressee:'NONE' as const,text,lead:'',tail:''}]});
test('certainty doing work for a protagonist does not create a private gift pair',()=>{
 assert.equal(ambiguousRelationship('Alex recognised a personal cost: certainty had been doing quiet work for them, making one stated wish seem able to predict the other.',['Mara','June'],['Alex'],true),false);
 for(const text of ['Certainty was doing quiet work for them.','Uncertainty was doing work for them.'])assert.equal(ambiguousRelationship(text,['Mara','June'],['Alex'],true),false,text);
 for(const text of ['The gift was for them, and no one else.','Our private gift remains between us.'])assert.equal(ambiguousRelationship(text,['Mara','June'],['Alex'],true),true,text);
});
test('a protagonist hypothetical wish otherwise is not a reconstructed earlier preference',()=>{
 assert.deepEqual(endingReactionIssues(w(),'F2',narration('Alex faced the public drawing, however carefully they might have wished otherwise.')),[]);
 for(const text of ['Alex had wished otherwise.','Mara might have wished otherwise.','Alex knew they had agreed to display it.','The recipient knew they might have wished otherwise.','Alex understood the recipient: they might have wished otherwise.','Alex watched a visitor, however carefully they might have wished otherwise.'])assert.ok(endingReactionIssues(w(),'F2',narration(text)).length,text);
});
test('a nonmaterial comparison to any explanation does not introduce the variable original',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'fixture-only',fetch:providerFixture(),withArt:false});const a=structuredClone(r.artifact);a.world.record.name='explanation';
 const b=a.blocks.F6!;b.passages![0]!.text='Alex felt a responsibility that sat closer than any explanation might have. No reading of tenderness in its lines eased that responsibility.';b.text=renderPassages(a.world,b.passages!);
 const issues=validateEmotionalArtifact(a,testProfile).issues.F6??[];assert.ok(!issues.some(s=>s.includes('omitted variable record')),issues.join(';'));
 for(const text of ['The explanation lay in the closed box.','Alex kept the explanation.','No explanation was on the table.','Closer than any explanation might have been after Alex read it.']){
  const bad=structuredClone(a);bad.blocks.F6!.passages![0]!.text=text;bad.blocks.F6!.text=renderPassages(a.world,bad.blocks.F6!.passages!);assert.ok(validateEmotionalArtifact(bad,testProfile).issues.F6?.some(s=>s.includes('omitted variable record')),text);
 }
});
