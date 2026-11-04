import{test}from'node:test';import assert from'node:assert/strict';
import{fixtureWorld}from'../../../packages/engine/test/emotional-fixture.js';import{compileEmotionalFacts,emotionalRoutes}from'../../../packages/engine/src/emotional.js';import{visualWorldIssues}from'../src/emotional-visual.js';
function world(){const w=fixtureWorld();w.work.visual={material:'flat paper',subject:'an empty-seeming night platform with one traveler',figures:'one',detail_one:'a mustard bench under a pale canopy',detail_two:'a single standing figure in a blue coat',detail_three:'thin timetable lines crossing the upper edge'};w.prosePolicy='scene-prose-3';return w;}
test('the reported empty-seeming platform remains compatible with its one depicted traveler',()=>{const w=world(),before=JSON.stringify(w);assert.deepEqual(visualWorldIssues(w),[]);assert.equal(JSON.stringify(w),before);});
test('figurative emptiness does not hide literal emptiness or incompatible figure counts',()=>{
 for(const subject of ['an empty night platform with one traveler','a deserted night platform','an empty-seeming but unoccupied platform','an empty-seeming platform with no people','an empty-seeming platform with two travelers']){const w=world();w.work.visual!.subject=subject;assert.ok(visualWorldIssues(w).length,subject);}
 const w=world();w.work.visual!.figures='none';assert.ok(visualWorldIssues(w).length);
});
test('a new deposit account limits the absence of reading to after the deposit',()=>{
 const w=world();(w as any).factualPolicy='post-deposit';const facts=compileEmotionalFacts(w)as Record<string,Record<string,string>>;
 for(const route of emotionalRoutes.filter(r=>r.endsWith('B'))){assert.match(facts[route]!.D3B!,/After the deposit, nothing was retrieved from the box or read inside it\./);assert.doesNotMatch(facts[route]!.D3B!,/No retrieval or reading happened tonight/);if(route[1]==='A')assert.match(facts[route]!.D2A!,/read the explanation/);}
});
test('worlds without the new deposit policy retain every original factual paragraph',()=>{
 const w=world(),old=compileEmotionalFacts(w)as Record<string,Record<string,string>>,before=JSON.stringify(w);assert.match(old.AAB!.D3B!,/No retrieval or reading happened tonight\./);
 const next=compileEmotionalFacts({...w,...({factualPolicy:'post-deposit'}as any)})as Record<string,Record<string,string>>;
 for(const route of emotionalRoutes)for(const[id,text]of Object.entries(old[route]!))if(id!=='D3B')assert.equal(next[route]![id],text,route+':'+id);
 assert.equal(JSON.stringify(compileEmotionalFacts(w)),JSON.stringify(old));assert.equal(JSON.stringify(w),before);
});

test('only new generation opts into the scoped deposit copy while an older checkpoint keeps its text',async()=>{
 const{generateEmotional,newGenerationCheckpoint}=await import('../src/emotional-generation.js');const{providerFixture,testProfile}=await import('./emotional-fixtures.js');
 const next=await generateEmotional(testProfile,{apiKey:'test',fetch:providerFixture(),withArt:false});assert.equal(next.artifact.world.factualPolicy,'post-deposit-compact');assert.match(next.artifact.factualText.AAB!.D2A!,/read the explanation/);assert.match(next.artifact.factualText.AAB!.D3B!,/Nothing was retrieved or read afterward/);
 const old=await generateEmotional(testProfile,{apiKey:'test',checkpoint:{...newGenerationCheckpoint(),revision:'3c-39'},fetch:providerFixture(),withArt:false});assert.equal(old.artifact.world.factualPolicy,undefined);assert.match(old.artifact.factualText.AAB!.D3B!,/No retrieval or reading happened tonight/);
});

test('a concise post-deposit account preserves its older sealed wording and earlier reading',()=>{
 const w=world(),old=compileEmotionalFacts({...w,...({factualPolicy:'post-deposit'}as any)})as Record<string,Record<string,string>>,next=compileEmotionalFacts({...w,...({factualPolicy:'post-deposit-compact'}as any)})as Record<string,Record<string,string>>;
 for(const route of emotionalRoutes.filter(r=>r.endsWith('B'))){assert.match(old[route]!.D3B!,/After the deposit, nothing was retrieved/);assert.match(next[route]!.D3B!,/Nothing was retrieved or read afterward\./);if(route[1]==='A')assert.match(next[route]!.D2A!,/read the explanation/);}
});

test('made that reading feel too convenient is an interpretation, not handling',async()=>{
 const{emotionalFixture}=await import('../../../packages/engine/test/emotional-fixture.js');const{story3c}=await import('../../../packages/engine/test/emotional-story-fixture.js');const{validateEmotionalArtifact}=await import('../src/emotional-generation.js');const{testProfile}=await import('./emotional-fixtures.js');
 const a=emotionalFixture();a.world.story=story3c;a.world.narrationPolicy='protagonist-camera-5';a.world.prosePolicy='scene-prose-3';
 for(const text of ['Watching the creator made that reading feel too convenient.','Nothing had been displayed or deposited; the work stayed in their keeping.']){const id=text.startsWith('Nothing')?'D3T':'D2A';a.blocks[id]={text,claims:[]};assert.deepEqual(validateEmotionalArtifact(a,testProfile).issues[id]??[],[],text);}
 for(const text of ['Watching made that reading of the explanation feel too convenient.','Nothing had been displayed or deposited; Alex deposited the letter.','Nothing had been displayed or deposited, except the sheet.']){a.blocks.D3T={text,claims:[]};assert.ok((validateEmotionalArtifact(a,testProfile).issues.D3T??[]).some(x=>/Material actions/.test(x)),text);}
});

test('the timeout negation exemption never permits denying an actual private deposit',async()=>{
 const{emotionalFixture}=await import('../../../packages/engine/test/emotional-fixture.js');const{story3c}=await import('../../../packages/engine/test/emotional-story-fixture.js');const{validateEmotionalArtifact}=await import('../src/emotional-generation.js');const{testProfile}=await import('./emotional-fixtures.js');
 const a=emotionalFixture();a.world.story=story3c;a.world.prosePolicy='scene-prose-3';a.world.narrationPolicy='protagonist-camera-5';a.blocks.D3B={text:'Nothing had been displayed or deposited; the work stayed in their keeping.',claims:[]};assert.ok((validateEmotionalArtifact(a,testProfile).issues.D3B??[]).some(x=>/Material actions/.test(x)));
});

test('a timeout disclaimer cannot hide a subsequent display or an exception',async()=>{
 const{emotionalFixture}=await import('../../../packages/engine/test/emotional-fixture.js');const{story3c}=await import('../../../packages/engine/test/emotional-story-fixture.js');const{validateEmotionalArtifact}=await import('../src/emotional-generation.js');const{testProfile}=await import('./emotional-fixtures.js');const a=emotionalFixture();a.world.story=story3c;a.world.prosePolicy='scene-prose-3';a.world.narrationPolicy='protagonist-camera-5';
 for(const text of ['Nothing had been displayed or deposited; Alex displayed the sheet.','Nothing had been displayed or deposited. Except the work.','Nothing had been displayed or deposited; except for the work itself, that was true.','Nothing had been displayed or deposited; Alex placed the sheet on the board.']){a.blocks.D3T={text,claims:[]};assert.ok((validateEmotionalArtifact(a,testProfile).issues.D3T??[]).some(x=>/Material actions/.test(x)),text);}
});
