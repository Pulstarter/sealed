import{test}from'node:test';import assert from'node:assert/strict';
import{fixtureWorld}from'../../../packages/engine/test/emotional-fixture.js';
import{endingReactionRequest,endingReactionIssues}from'../src/emotional-ending.js';
import{generateEmotional,validateEmotionalArtifact}from'../src/emotional-generation.js';
import{providerFixture,testProfile}from'./emotional-fixtures.js';
const world=()=>({...fixtureWorld(),endingPolicy:'outcome-reactions-2',retainedVisibility:'unchanged'}as any);
const block=(text:string)=>({text,claims:[],passages:[{speaker:'NARRATOR' as const,addressee:'NONE' as const,text}]});
test('retained ending rejects unsupported invisibility but not an unseen feeling or an open question',()=>{
 const w=world();
 for(const text of['Alex felt the quiet weight of being the only person answerable for what remained unseen. Without other eyes on the drawing, its meaning stayed unsettled.','The drawing remains unseen.','The work is hidden from view.','No other eyes can see the drawing.'])assert.ok(endingReactionIssues(w,'F6',block(text)).length,text);
 for(const text of['Alex felt unseen despite holding the drawing.','The work is not hidden. Alex feels uncertain.','Alex cannot know whether another person notices the drawing.','Without a simple answer, Alex feels responsible for the drawing.','Alex holds the work without deciding what anyone else sees in it.'])assert.deepEqual(endingReactionIssues(w,'F6',block(text)),[],text);
 assert.deepEqual(endingReactionIssues(w,'F5',block('The drawing remains unseen inside the closed box.')),[]);
 delete w.retainedVisibility;assert.deepEqual(endingReactionIssues(w,'F6',block('The drawing remains unseen.')),[],'old sealed policy stays recoverable');
});
test('F6 request explicitly separates custody from visibility and never guesses attendance, including repair',()=>{
 const w=world();for(const repairPass of[undefined,1,2]as const){const r=endingReactionRequest(w,'F6',{key:'test',words:80,plan:{p1:'NARRATOR>NONE',p2:'NARRATOR>NONE'},intensity:'gentle',exclusions:[],repairPass}),p=r.payload as any;
  assert.equal(p.current_outcome.visibility,'VARIES_WITH_ROUTE');assert.equal(p.current_outcome.companion,'VARIES_WITH_ROUTE');assert.match(p.retention_boundary,/not.*conceal|not.*hidden/iu);assert.match(r.instructions,/retaining.*not.*hid|custody.*not.*visib/iu);
 }
});
test('fresh generated world opts in while S2 advances the player perspective and preserves its voices and duration',async()=>{
 const base=providerFixture(),requests:any[]=[];const r=await generateEmotional(testProfile,{apiKey:'fixture',withArt:false,fetch:async(u,i)=>{const req=JSON.parse(String(i?.body)),p=JSON.parse(req.messages[1].content);requests.push(p);return base(u,i);}});
 assert.equal(r.artifact.world.retainedVisibility,'unchanged');const p=requests.find(p=>p.block==='S2'),c=p.projection.context;
 assert.deepEqual(c.scene_arc,['acknowledge once','challenge player assumption','personal admission','changed stance']);assert.deepEqual(c.public_wishes.map((x:any)=>x.owner),['HOST','RECIPIENT']);assert.equal(c.public_tension,undefined);
 assert.equal(c.host.public_wish,undefined);assert.equal(p.known_public_roles.HOST.public_wish,undefined);assert.equal(p.known_public_roles.RECIPIENT.public_wish,undefined);assert.equal(c.public_wishes[0].wish,r.artifact.world.host.public_wish);assert.equal(c.public_wishes[1].wish,r.artifact.world.recipient.public_wish);
 assert.equal(Object.keys(c.scene_beats).length,22);assert.match(c.scene_beats.p12,/PLAYER/);assert.match(c.scene_specificity,/not.*recap|never.*recap/iu);assert.ok(c.earlier_public_dialogue.length>0);
 assert.equal(Object.keys(p.paragraph_plan).length,22);assert.deepEqual(r.validation.issues,{});assert.ok(r.validation.wordRange[0]>=2000&&r.validation.wordRange[1]<=2400);assert.ok(r.checkpoint.repairPass<=2);
 const bad=structuredClone(r.artifact);bad.blocks.F6=block('Without other eyes on the drawing, its meaning stayed unsettled.');assert.ok(validateEmotionalArtifact(bad,testProfile).issues.F6?.length);
});

test('a named personal reading stays interpretive without licensing a hidden work in the rest of the clause',()=>{
 const w=world();assert.deepEqual(endingReactionIssues(w,'F6',block('No other eyes can see the drawing quite as Alex does.')),[]);
 for(const text of['No other eyes can see the drawing quite as Alex does: the work is hidden.','No other eyes can see the drawing because it is hidden.'])assert.ok(endingReactionIssues(w,'F6',block(text)).length,text);
});
test('ordinary adverb order never changes a positive or negative invisibility assertion',()=>{
 const w=world();
 for(const text of['The drawing is still not hidden.','The work is now not unseen.'])assert.deepEqual(endingReactionIssues(w,'F6',block(text)),[],text);
 for(const text of['The drawing is still hidden.','The drawing is now unseen.','The drawing still is hidden.'])assert.ok(endingReactionIssues(w,'F6',block(text)).length,text);
});
