import{test}from'node:test';import assert from'node:assert/strict';
import{emotionalFixture}from'../../../packages/engine/test/emotional-fixture.js';import{story3c}from'../../../packages/engine/test/emotional-story-fixture.js';
import{validateEmotionalArtifact}from'../src/emotional-generation.js';import{reflectionIssues}from'../src/emotional-reliability.js';import{testProfile}from'./emotional-fixtures.js';
function fixture(){const a=emotionalFixture();a.world.player_name='Robin';a.world.host.name='Mara';a.world.recipient.name='June';a.world.story=story3c;a.world.narrationPolicy='protagonist-camera-5';a.world.reactionPolicy='public-only';a.world.prosePolicy='scene-prose-3';return a;}
const material=(text:string)=>{const a=fixture();a.blocks.D3B={text,claims:[]};return validateEmotionalArtifact(a,testProfile).issues.D3B??[];};
test('a denied future reading guarantee is not a performed reading',()=>{
 for(const text of ['Nothing here assures a later look, a collection, or a reading.','Nothing guarantees a reading.'])assert.deepEqual(material(text),[],text);
});
test('a future disclaimer does not hide an actual reading or other material action',()=>{
 for(const text of ['Robin completed a reading.','Robin began a reading of the explanation.','Nothing here assures a later look, a collection, or a reading; Robin read the letter.','Nothing guarantees a reading. Robin opened the envelope.','Nothing guarantees a reading, but Robin signed the document.'])assert.ok(material(text).some(x=>/Material actions|record status/.test(x)),text);
});
test('leaving uncertainty where it belongs does not reopen material placement',()=>{
 for(const text of ['Robin leaves that uncertainty where it belongs, with their seeing rather than with the work.','Their doubt stays where it belongs.'])assert.deepEqual(reflectionIssues(fixture().world,'F4',text),[],text);
});
test('an abstract belongs phrase never hides uncertainty about the actual work placement',()=>{
 const w=fixture().world;for(const text of ['Robin wonders where the work belongs.','Robin leaves that uncertainty where it belongs, but wonders where the work will go.','Perhaps the work will go elsewhere.'])assert.ok(reflectionIssues(w,'F4',text).some(x=>/settled material placement/.test(x)),text);
 w.work.name='Uncertainty';assert.ok(reflectionIssues(w,'F4','Robin wonders where Uncertainty belongs.').some(x=>/settled material placement/.test(x)));
});

test('the single length repair accounts for fixed route text and leaves margin on both sides',async()=>{
 const {generateEmotional,wordCount,emotionalRouteBlocks}=await import('../src/emotional-generation.js');const {providerFixture}=await import('./emotional-fixtures.js');
 const seed=await generateEmotional(testProfile,{apiKey:'test',withArt:false,fetch:providerFixture()});const cp=structuredClone(seed.checkpoint);cp.repairPass=0;delete cp.repairPlan;cp.repairsComplete=[];
 // Uneven long scenes and reactions exercise fixed text and shared/alternative blocks without private fiction.
 const sizes:Record<string,number>={S1:1000,S2:800,S3:400,ARRA:110,ARRB:110,ARRT:110,D1A:110,D1B:110,D1T:110,D2A:110,D2B:110,D2T:110,D3A:110,D3B:110,D3T:110,F1:300,F2:300,F3:300,F4:300,F5:300,F6:300};
 for(const [id,n]of Object.entries(sizes))cp.blocks[id]={text:Array.from({length:n},(_,i)=>id+'word'+i).join(' ')+'.',claims:[]};
 const stop=new Error('Repair plan captured before provider calls');let plan:any,artifact:any;
 await assert.rejects(generateEmotional(testProfile,{apiKey:'test',withArt:false,checkpoint:cp,fetch:(async()=>{throw Error('No paid or fake repair request before plan verification');})as typeof fetch,onCheckpoint(next){if(next.repairPass){plan=next.repairPlan;artifact={...seed.artifact,blocks:next.blocks};}},onRepair(){throw stop;}}),e=>e===stop);
 assert.ok(plan);assert.ok(plan.S2.paragraphs<22,'a long exchange must condense complete beats rather than demand the same 22 interventions in fewer words');const projected=Object.keys(seed.artifact.factualText!).map(route=>emotionalRouteBlocks(route).reduce((n,id)=>n+wordCount(seed.artifact.factualText![route]![id]??'')+(plan[id]?.targetWords??wordCount(artifact.blocks[id].text)),0));
 const min=Math.min(...projected),max=Math.max(...projected);assert.ok(min>=2100&&max<=2300,`${min}–${max} must leave margin inside 2000–2400`);assert.ok((min+max)/2>=2180&&(min+max)/2<=2220,`${min}–${max} must allow for the observed upward repair drift`);
});

test('a relative clause reporting a completed reading never becomes a future disclaimer',()=>{
 for(const text of ['Nothing guarantees a reading of the letter, which Robin has just completed.','Nothing guarantees a reading, which Robin nevertheless completes.'])assert.ok(material(text).some(x=>/Material actions/.test(x)),text);
});

test('a title that is also a modal or question word cannot erase placement uncertainty',()=>{
 for(const [name,text]of [['Perhaps','Perhaps the work will go elsewhere.'],['Where','Where will the work be left?'],['Could','Could the work be displayed elsewhere?'],['Might','Might the work be posted somewhere else?']]){const w=fixture().world;w.work.name=name!;assert.ok(reflectionIssues(w,'F4',text!).some(x=>/settled material placement/.test(x)),text!);}
});

test('repairing an outlying alternative does not preserve its excessive spread by a common factor',async()=>{
 const{measuredLengthRepairTargets}=await import('../src/emotional-length.js');const{generateEmotional,emotionalRouteBlocks,wordCount}=await import('../src/emotional-generation.js');const{providerFixture}=await import('./emotional-fixtures.js');
 const seed=await generateEmotional(testProfile,{apiKey:'test',withArt:false,fetch:providerFixture()});
 for(const outlier of [580,880]){const a=structuredClone(seed.artifact);for(const id of Object.keys(a.blocks)){const n=id==='S1'||id==='S2'?600:id==='S3'?200:id==='F5'?outlier:id.startsWith('F')?180:80;a.blocks[id]={text:Array.from({length:n},(_,i)=>id+'word'+i).join(' ')+'.',claims:[]};}
 const before=JSON.stringify(a),targets=measuredLengthRepairTargets(a,['S1','S2']);const totals=Object.keys(a.factualText!).map(route=>emotionalRouteBlocks(route).reduce((n,id)=>n+wordCount(a.factualText![route]![id]??'')+(targets[id]??wordCount(a.blocks[id]!.text)),0));
 assert.equal(JSON.stringify(a),before);assert.ok(Math.min(...totals)>=2100&&Math.max(...totals)<=2300,`${outlier}: ${Math.min(...totals)}–${Math.max(...totals)}`);}
});

test('condensing an exchange preserves each question with its answer and the final beat',async()=>{
 const{authoringRepairIndices}=await import('../src/emotional-scene-authoring.js');const selected=authoringRepairIndices('S2',564,683),keep=new Set(selected);
 assert.ok(selected.length<22);assert.equal(selected[0],1);assert.equal(selected.at(-1),22);
 for(const [q,a]of [[4,5],[7,8],[10,11],[13,14],[16,17],[19,20]])assert.equal(keep.has(q!),keep.has(a!),`question${q}/answer${a}`);
 for(const id of ['F1','F2']){const closing=authoringRepairIndices(id,150,300);for(const n of [1,2,4,6])assert.ok(closing.includes(n),'closing keeps both speakers and the settled ending');}
 assert.equal(authoringRepairIndices('S2',800,600).length,22,'expansion develops the existing beats, never adds filler paragraphs');
});
