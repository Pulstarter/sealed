import {test} from 'node:test';import assert from 'node:assert/strict';
import {generateEmotional,newGenerationCheckpoint} from '../src/emotional-generation.js';
import {providerFixture,testProfile} from './emotional-fixtures.js';
import {fixtureWorld} from '../../../packages/engine/test/emotional-fixture.js';
import {compileEmotionalFacts} from '../../../packages/engine/src/emotional.js';

test('fresh stories request specific dramatic progression and distinct intensity without changing41 requests',async()=>{
 const provider=providerFixture();let opening:any,conversation:any,world:any,timeout:any,ending:any;
 const r=await generateEmotional({...testProfile,intensity:'moderate'},{apiKey:'test',withArt:false,fetch:(async(url,init)=>{
  const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);
  if(p.task==='world')world=p;else if(p.block==='S1')opening=p;else if(p.block==='S2')conversation=p;else if(p.block==='D2T')timeout=p;else if(p.block==='F5')ending=p;
  return provider(url,init);
 })as typeof fetch});
 assert.equal(r.checkpoint.revision,'3c-54');assert.deepEqual(r.artifact.world.dramaticPolicy,{version:'story-specific-3',intensity:'moderate'});
 assert.match(world.instruction,/concession|specific.*admission/i);
 assert.match(JSON.stringify(conversation.projection.context.scene_beats),/concession|objection/i);
 assert.doesNotMatch(JSON.stringify(conversation.projection.context.scene_beats),/how much understanding a custodian|failing to understand another person differs|being impartial would spare/i);
 assert.match(conversation.projection.context.decision_phase,/EXPLANATION/);assert.match(conversation.projection.context.dramatic_tone,/direct|interrupt|friction/i);
 assert.match(timeout.projection.context.focus,/explanation decision/);assert.equal(ending.projection,undefined);assert.equal(ending.reaction_contract,'outcome-reactions-2');assert.match(ending.scene_beats.p1,/completed outcome/);assert.match(opening.instruction,/specific|concrete/i);assert.deepEqual(r.validation.issues,{});
});
test('natural factual text is opt-in and disambiguates explanation, preserving old bytes and all outcomes',()=>{
 const w=fixtureWorld();w.prosePolicy='scene-prose-3';w.factualPolicy='post-deposit-compact';const old=compileEmotionalFacts(w);
 w.dramaticPolicy={version:'story-specific-1',intensity:'gentle'};const next=compileEmotionalFacts(w) as Record<string,Record<string,string>>;
 assert.doesNotMatch(next.AAB!.S1!,/drawing contains|known hope:|contrasting hope:|work uses/);
 assert.match(next.AAB!.D2A!,/read the explanation/);assert.match(next.BBA!.D2B!,/unopened explanation/);
 assert.match(next.AAB!.D3B!,/open explanation/);assert.match(next.AAB!.D3B!,/Nothing was retrieved or read afterward/);
 delete w.dramaticPolicy;assert.deepEqual(compileEmotionalFacts(w),old);
});

test('a modest length correction keeps complete dramatic exchanges instead of double shrinking them',async()=>{
 const{authoringRepairIndices}=await import('../src/emotional-scene-authoring.js');
 assert.equal(authoringRepairIndices('S1',589,696,true).length,20);
 assert.equal(authoringRepairIndices('S2',668,790,true).length,22);
 assert.ok(authoringRepairIndices('S1',589,696).length<20);
});
test('explicit inference and gift-owner comparisons do not become invented private pairs or placements',async()=>{
 const{ambiguousRelationship}=await import('../src/emotional-continuity.js');
 const{reflectionIssues}=await import('../src/emotional-reliability.js');
 assert.equal(ambiguousRelationship('The work turned an impression into a conclusion without earning the step between the two.',['Mara','June'],['Ellis'],true),false);
 assert.equal(ambiguousRelationship('The work turned an impression into a conclusion without earning the step between the two; this gift is between you and me.',['Mara','June'],['Ellis'],true),true);
 const w=fixtureWorld();w.prosePolicy='scene-prose-3';w.reactionPolicy='public-only';w.narrationPolicy='protagonist-camera-5';
 assert.ok(!reflectionIssues(w,'F6','Forcing an ending would not repair what belongs to its creator and the person the work is for.').some(s=>s.includes('settled material placement')));
 for(const text of ['Perhaps the work belongs in the private box instead.','Perhaps the work belongs to its creator and the person the work is for, in the private box instead.','Forcing an ending would not repair what belongs to its creator and the person the work is for, on the public display board instead.'])assert.ok(reflectionIssues(w,'F6',text).some(s=>s.includes('settled material placement')),text);
});

test('new dramatic wishes cannot promise inaccessible work viewing or private-box access',async()=>{
 const{dramaticWorldIssues}=await import('../src/emotional-dramaturgy.js');const w=fixtureWorld();w.dramaticPolicy={version:'story-specific-2',intensity:'gentle'};
 w.host.public_wish='Tessa wants the work looked at slowly in the archive.';assert.ok(dramaticWorldIssues(w).length);
 w.host.public_wish='Tessa wants the work noticed slowly.';w.recipient.public_wish='Ren wants it kept in the private box where Ren can answer it directly.';assert.ok(dramaticWorldIssues(w).length);
 w.recipient.public_wish='Ren wants their response to stay private.';assert.deepEqual(dramaticWorldIssues(w),[]);
 w.work.name='box';w.host.public_wish='Tessa wants the work viewed in the private box.';assert.ok(dramaticWorldIssues(w).length);
 w.work.name='art';w.host.public_wish='Tessa wants the work viewed inside the compartment.';assert.ok(dramaticWorldIssues(w).length);
 w.work.name='Box at Dusk';w.host.public_wish='Tessa wants Box at Dusk noticed quietly.';assert.deepEqual(dramaticWorldIssues(w),[]);
 w.host.public_wish='Tessa wants Box at Dusk viewed in the private box.';assert.ok(dramaticWorldIssues(w).length);
});
