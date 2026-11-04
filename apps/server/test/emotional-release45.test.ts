import {test} from 'node:test';import assert from 'node:assert/strict';
import {ambiguousAuthorship} from '../src/emotional-3c.js';import {dialogueIssues,renderPassages} from '../src/emotional-dialogue.js';import {reflectionIssues} from '../src/emotional-reliability.js';import {validateEmotionalArtifact} from '../src/emotional-generation.js';import {emotionalFixture,fixtureWorld} from '../../../packages/engine/test/emotional-fixture.js';
const world=()=>({...fixtureWorld(),prosePolicy:'scene-prose-3' as const,narrationPolicy:'protagonist-camera-5' as const,reactionPolicy:'public-only' as const,dramaticPolicy:{version:'story-specific-3' as const,intensity:'gentle' as const}});
test('causative making a feeling does not assign creation, while making artwork still does',()=>{
 assert.equal(ambiguousAuthorship('I had made the keeping itself feel exposed.'),false);
 assert.equal(ambiguousAuthorship('I made the keeping itself feel exposed, and you made the drawing.'),true);
 assert.equal(ambiguousAuthorship('I made the drawing itself feel exposed.'),true);
});
test('a subordinate present reply is not a hidden speaker tag',()=>{
 const w=world(),check=(text:string)=>{const passages=[{speaker:'HOST' as const,addressee:'PLAYER' as const,text,lead:'',tail:''}];return dialogueIssues(w,'S1',{passages,text:renderPassages(w,passages),claims:[]});};
 assert.deepEqual(check('Alex, I feel exposed when Ren Cole answers.'),[]);
 assert.ok(check('Ren Cole answers: Alex must agree.').some(x=>x.includes('Speech text')));
 assert.ok(check('When Ren Cole answers: Alex must agree.').some(x=>x.includes('Speech text')));
});
test('a closed placement question does not reopen a final destination',()=>{
 const w=world();assert.ok(!reflectionIssues(w,'F4','Where watercolor belongs tonight is no longer in question.').some(x=>x.includes('settled material')));
 assert.ok(reflectionIssues(w,'F4','Where watercolor belongs tonight is no longer in question, but perhaps it belongs in the private box instead.').some(x=>x.includes('settled material')));
 assert.ok(reflectionIssues(w,'F4','Where watercolor belongs tonight is still in question.').some(x=>x.includes('settled material')));
});
test('interpreting a named person is distinct from reading that person’s document',()=>{
 const a=emotionalFixture();a.world=world();
 const issues=(text:string)=>{a.blocks.D2A={text,claims:[]};return validateEmotionalArtifact(a,{mood:'tired',direction:'accompany',experience:'quiet mystery',intensity:'gentle',exclusions:[]}).issues.D2A??[];};
 assert.ok(!issues('That now seems a narrow way to read Tessa Vale.').some(x=>x.includes('Material actions')));
 assert.ok(issues('Alex read Tessa Vale’s letter.').some(x=>x.includes('Material actions')));
 assert.ok(issues('That seems a narrow way to read Tessa Vale, who opened the explanation.').some(x=>x.includes('Material actions')));
});
test('new scenes reject unprovided past duration and an unmade invitation after D1A',()=>{
 const a=emotionalFixture();a.world={...world(),dramaticPolicy:{version:'story-specific-3',intensity:'gentle'}} as any;
 const issues=(id:string,text:string)=>{a.blocks[id]={text,claims:[]};return validateEmotionalArtifact(a,{mood:'tired',direction:'accompany',experience:'quiet mystery',intensity:'gentle',exclusions:[]}).issues[id]??[];};
 assert.ok(issues('F4','No answering sign would make the past weeks simpler.').some(x=>x.includes('past duration')));
 assert.ok(issues('D1A','Asking Tessa Vale outright would turn a private moment into an obligation.').some(x=>x.includes('invitation is already')));
 assert.ok(!issues('D1A','Having asked Tessa Vale outright felt awkward.').some(x=>x.includes('invitation is already')));
 delete a.world.dramaticPolicy;assert.ok(!issues('F4','No answering sign would make the past weeks simpler.').some(x=>x.includes('past duration')));
});

test('a rejected D2A cannot leak its private reason into the new public-only repair request',async()=>{
 const {generateEmotional,newGenerationCheckpoint}=await import('../src/emotional-generation.js');
 const {providerFixture,testProfile,response}=await import('./emotional-fixtures.js');
 const provider=providerFixture();let rejectedText='';
 const r=await generateEmotional(testProfile,{apiKey:'test',withArt:false,checkpoint:{...newGenerationCheckpoint(),revision:'3c-45'},fetch:(async(url,init)=>{
  const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content),res=await provider(url,init);
  if(p.task==='repair'&&p.block==='D2A')rejectedText=p.rejected_text;
  if(p.task==='block'&&p.block==='D2A'){const raw=await res.json(),wire=JSON.parse(raw.choices[0].message.content);wire.p01_text+=' Secret motive.';return response(wire,req.model);}
  return res;
 }) as typeof fetch});
 assert.ok(rejectedText);assert.ok(!rejectedText.includes('Secret motive'));assert.deepEqual(r.validation.issues,{});
});

test('invitation-completed context is present only after a chosen D1A',async()=>{
 const {dramaticProjection}=await import('../src/emotional-dramaturgy.js');
 const w={...world(),dramaticPolicy:{version:'story-specific-3' as const,intensity:'gentle' as const}};
 for(const id of ['S1','S2','D1T','D1A']){const context:Record<string,any>={};dramaticProjection(w,id,context);assert.equal(/invitation has already been sent/.test(context.time_boundary),id==='D1A',id);}
});

test('public reactions cannot invent a creation purpose while known authorship and beneficiary remain public',async()=>{
 const {creationPurposeIssues}=await import('../src/emotional-continuity.js');const w=world();w.work.name='Evening Platform';
 for(const text of ['I drew Evening Platform for the pleasure of making it.','Tessa Vale made it to repay an old favour.','I made the work because I was lonely.'])assert.ok(creationPurposeIssues(w,text).some(x=>x.includes('creation purpose')),text);
 for(const text of ['Tessa Vale made Evening Platform for Ren.', 'Tessa Vale made Evening Platform for Ren Cole.','The creator made it for the person the work is for.','I made Evening Platform, and I feel exposed.'])assert.ok(!creationPurposeIssues(w,text).some(x=>x.includes('creation purpose')),text);
});

test('creation beneficiary you uses the bound listener rather than another name in a paragraph',async()=>{
 const {creationPurposeIssues}=await import('../src/emotional-continuity.js');const w=world();
 assert.deepEqual(creationPurposeIssues(w,'I made it for you.','RECIPIENT'),[]);
 assert.ok(creationPurposeIssues(w,'I made it for you.','PLAYER').length);
 assert.ok(creationPurposeIssues(w,'I made it for Ren Cole, and because I was guilty.').length);
});

test('a named beneficiary cannot hide a second purpose, and made-it-to a destination is arrival',async()=>{
 const {creationPurposeIssues}=await import('../src/emotional-continuity.js');const w=world();
 for(const s of ['I made it for Ren Cole, for the pleasure of making it.','I made it for Ren Cole, to repay an old favour.','I made it for the person the work is for, but only to settle an old debt.'])assert.ok(creationPurposeIssues(w,s).length,s);
 assert.deepEqual(creationPurposeIssues(w,'Tessa made it to the viewing bench.'),[]);
 assert.deepEqual(creationPurposeIssues(w,'Tessa made it to the viewing bench tonight, and felt awkward.'),[]);
 assert.ok(creationPurposeIssues(w,'I made it to thank Ren Cole.').length);
});

test('a length repair has one raw word budget across its structured target and feedback',async()=>{
 const {generateEmotional}=await import('../src/emotional-generation.js');const {providerFixture,testProfile}=await import('./emotional-fixtures.js');const provider=providerFixture({badBlock:'S1'}),repairs:any[]=[];
 try{await generateEmotional(testProfile,{apiKey:'test',withArt:false,fetch:(async(url,init)=>{const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);if(p.task==='repair')repairs.push(p);return provider(url,init);})as typeof fetch});}catch{}
 assert.ok(repairs.length);let goals=0;for(const p of repairs)for(const line of p.feedback??[]){const m=line.match(/(?:Rewrite around|Raw fields budget:)\s*(\d+) words/);if(m){goals++;assert.equal(Number(m[1]),p.target_words,p.block);}}assert.ok(goals);
});
test('a public ending cannot deny that the custodian chose its destination',()=>{
 const a=emotionalFixture();a.world=world();a.world.player_name='Ellis';
 const check=(text:string)=>{a.blocks.F3={text,claims:[]};return validateEmotionalArtifact(a,{mood:'tired',direction:'accompany',experience:'quiet mystery',intensity:'gentle',exclusions:[]}).issues.F3??[];};
 assert.ok(check('Ellis had not made the work, had not chosen its destination, and had carried out the public outcome.').some(x=>x.includes('PLAYER chose')));
 assert.ok(!check('Tessa Vale had not chosen its destination.').some(x=>x.includes('PLAYER chose')));
 assert.ok(!check('Ellis had not chosen its destination casually.').some(x=>x.includes('PLAYER chose')));
});

test('repair removes the closest complete exchanges without over-condensing a modest reduction',async()=>{
 const {authoringRepairIndices}=await import('../src/emotional-scene-authoring.js');
 assert.equal(authoringRepairIndices('S1',589,696,true,true).length,17);
 assert.equal(authoringRepairIndices('S2',668,790,true,true).length,19);
 assert.equal(authoringRepairIndices('S1',589,696,true).length,20);
 assert.equal(authoringRepairIndices('S2',668,790,true).length,22);
});

test('changing the exchange count does not also apply the old full-scene overshoot ratio',async()=>{
 const {repairRawTarget}=await import('../src/emotional-length.js');
 assert.equal(repairRawTarget(538,1.19,14,20),538);
 assert.equal(repairRawTarget(628,1.35,16,22),628);
 assert.equal(repairRawTarget(538,1.19,20,20),452);
});
test('a shortcut doing the looking for a singular observer is not the gift’s private pair',async()=>{
 const {ambiguousRelationship}=await import('../src/emotional-continuity.js');
 assert.equal(ambiguousRelationship('It explains the work neatly, as if a single impression could finish the looking for them.',['Mara','Ellis'],['Rowan'],true),false);
 assert.equal(ambiguousRelationship('It explains the work neatly, as if a single impression could finish the looking for them; this gift is private for them.',['Mara','Ellis'],['Rowan'],true),true);
});

test('a reduced scene budgets narration and speech separately instead of capping every paragraph as speech',async()=>{
 const {repairRawTarget}=await import('../src/emotional-length.js');const voices=[...Array(7).fill('NARRATOR>NONE'),...Array(7).fill('HOST>PLAYER')];
 assert.equal(repairRawTarget(538,1.19,14,20,voices),538);
 assert.equal(repairRawTarget(600,1.19,14,20,voices),560);
});

test('the existing same-count calibration is preserved even with a mixed voice plan',async()=>{
 const {repairRawTarget}=await import('../src/emotional-length.js');
 assert.equal(repairRawTarget(350,1.35,6,6,[...Array(4).fill('NARRATOR>NONE'),...Array(2).fill('HOST>PLAYER')]),259);
});

test('making a hasty connection is interpretation, while making a drawing remains authorship',()=>{
 assert.equal(ambiguousAuthorship('I made that connection too quickly.'),false);
 assert.equal(ambiguousAuthorship('I made that connection too quickly, but you made the drawing.'),true);
});
test('an explicit completed invitation is not undone by unease about the asking',()=>{
 const a=emotionalFixture();a.world=world();a.world.player_name='Alexis';a.blocks.D1A={text:'Alexis had asked, and the asking would not settle neatly into the room.',claims:[]};
 assert.ok(!(validateEmotionalArtifact(a,{mood:'tired',direction:'accompany',experience:'quiet mystery',intensity:'gentle',exclusions:[]}).issues.D1A??[]).some(x=>x.includes('invitation is already')));
});

test('a completed unrelated question cannot hide an unmade viewing invitation',async()=>{
 const {dramaticProseIssues}=await import('../src/emotional-dramaturgy.js');const w=world();w.player_name='Alexis';
 for(const text of ['If Alexis had asked, and the asking would make it awkward, the request would remain unmade.','Alexis had asked about the light. Asking Tessa Vale to join would be an imposition, so Alexis left the invitation unmade.','Alexis had asked. Asking Tessa Vale to join would make the evening too awkward.'])assert.ok(dramaticProseIssues(w,'D1A',text).some(x=>x.includes('invitation is already')),text);
});


test('public endings cannot invent unanimous permission for PLAYER placement',async()=>{
 const {dramaticProseIssues}=await import('../src/emotional-dramaturgy.js');const w={...world(),dramaticPolicy:{version:'story-specific-3' as const,intensity:'gentle' as const}};
 for(const text of ['I thought putting it where everyone agreed it could be seen would settle something.','They had all agreed to display the work.'])assert.ok(dramaticProseIssues(w,'F1',text).some(x=>x.includes('consensus')),text);
 for(const text of ['Not everyone agreed to display the work.','If everyone agreed to display the work, it might feel easier.','If they had all agreed to display the work, it might feel easier.','Unless we all agreed to display it, Robin would feel exposed.','We had all agreed to disagree; the board remained visible.','The work is publicly displayed, and its meaning remains open.'])assert.ok(!dramaticProseIssues(w,'F1',text).some(x=>x.includes('consensus')),text);
});


test('an explicitly settled named destination is not reopened by where, including no longer uncertain',()=>{
 const w=world();w.work.name='Night Bench';
 for(const text of ['Where Night Bench belongs is no longer uncertain, and neither is its maker.','Where Night Bench belongs is not in question.'])assert.ok(!reflectionIssues(w,'F4',text).some(x=>x.includes('settled material')),text);
 for(const text of ['Where Night Bench belongs is still uncertain.','Where Night Bench belongs is no longer uncertain, but perhaps the work will go elsewhere.','Where Night Bench belongs is no longer uncertain. Where it belongs later is still undecided.'])assert.ok(reflectionIssues(w,'F4',text).some(x=>x.includes('settled material')),text);
});


test('a recipient who explicitly asks for open study cannot blame PLAYER for that visibility without a change of stance',async()=>{
 const {dramaticProseIssues}=await import('../src/emotional-dramaturgy.js');const w={...world(),dramaticPolicy:{version:'story-specific-3' as const,intensity:'moderate' as const}};w.recipient.public_wish='Ren wishes the work could be studied openly and named aloud.';
 const accusation='You did not have to make it this public, Robin. I know the choice is made, but I am not going to pretend I am easy about it.';
 const check=(line:string)=>dramaticProseIssues(w,'F2',line,[{speaker:'RECIPIENT',addressee:'PLAYER',text:line}]);
 assert.ok(check(accusation).some(x=>x.includes('public wish')));assert.ok(check(accusation+' If I wanted it public, I would have said so.').some(x=>x.includes('public wish')));
 for(const line of ['I wanted it public, and being seen now feels harder than I expected.','You did not have to make it this public, Robin, though I wanted it public and still do; being seen now feels harder than I expected.','If you did not have to make it this public, would I still have asked?'])assert.ok(!check(line).some(x=>x.includes('public wish')),line);
 w.recipient.public_wish='Ren wishes the work could stay nearby in quiet.';assert.ok(!check(accusation).some(x=>x.includes('public wish')));
});


test('making a named person carry discomfort is causative, while making the artwork remains authorship',()=>{
 const w=world();w.player_name='Robin';w.host.name='Mara';w.recipient.name='June';
 const text='By pressing Mara for a cleaner justification, Robin had made Mara carry the whole discomfort of incompatible wishes.';
 const check=(text:string)=>{const passages=[{speaker:'NARRATOR' as const,addressee:'NONE' as const,text}];return dialogueIssues(w,'S2',{text:renderPassages(w,passages),passages,claims:[]});};
 assert.ok(!check(text).some(x=>/created|Authorship/.test(x)));
 for(const ending of [' Robin had made the drawing.',', and Robin had made the drawing.',', but June had painted the work.'])assert.ok(check(text.replace(/\.$/u,'')+ending).some(x=>/created|Authorship/.test(x)),ending);
});

test('a possible interpretation becoming the whole meaning is not a performed reading',()=>{
 const a=emotionalFixture();a.world=world();const profile={mood:'tired',direction:'accompany' as const,experience:'quiet mystery',intensity:'gentle' as const,exclusions:[]};
 const text='Robin refuses to let that possible reading become the whole meaning of an outcome.';
 const check=(line:string)=>{a.blocks.D3T={text:line,claims:[]};return validateEmotionalArtifact(a,profile).issues.D3T??[];};
 assert.ok(!check(text).some(x=>x.includes('Material actions')));
 for(const line of [text+' Robin read the explanation.','Robin began a possible reading of the explanation.'])assert.ok(check(line).some(x=>x.includes('Material actions')),line);
});


test('a named person remaining harder to read is not reading their explanation',()=>{
 const a=emotionalFixture();a.world=world();a.world.host.name='Mara';const profile={mood:'tired',direction:'accompany' as const,experience:'quiet mystery',intensity:'gentle' as const,exclusions:[]};
 const text='Alex let Mara remain harder to read than Alex had first allowed themselves to admit.';
 const check=(line:string)=>{a.blocks.D2A={text:line,claims:[]};return validateEmotionalArtifact(a,profile).issues.D2A??[];};
 assert.ok(!check(text).some(x=>x.includes('Material actions')));
 for(const line of [text+' Alex read the explanation.',"Mara’s letter remained harder to read."])assert.ok(check(line).some(x=>x.includes('Material actions')),line);
});


test('an invitation reaction cannot give PLAYER destination responsibility back to the gift pair',async()=>{
 const {dramaticProseIssues}=await import('../src/emotional-dramaturgy.js');const w=world();
 const bad='The concession did not move responsibility for the work or its destination away from Tessa Vale and the intended recipient.';
 assert.ok(dramaticProseIssues(w,'D1B',bad).some(x=>x.includes('PLAYER')));
 for(const text of ['The meaning of the gift still belongs to Tessa Vale and the intended recipient.','Responsibility for deciding its destination stays with Alex.'])assert.ok(!dramaticProseIssues(w,'D1B',text).some(x=>x.includes('destination responsibility')),text);
});

test('a closing exchange cannot invent a prior approval of the display',async()=>{
 const {dramaticProseIssues}=await import('../src/emotional-dramaturgy.js');const w=world();
 const bad='I was not asking you to approve twice, Tessa. I thought once should hold, and it does, even if neither of us finds that comfortable.';
 assert.ok(dramaticProseIssues(w,'F1',bad,[{speaker:'PLAYER',addressee:'HOST',text:bad}]).some(x=>x.includes('approval')));
 const ordinary='I hoped you would approve, Tessa, but I chose the display myself.';assert.ok(!dramaticProseIssues(w,'F1',ordinary,[{speaker:'PLAYER',addressee:'HOST',text:ordinary}]).some(x=>x.includes('approval')));
});


test('for me names the declared recipient only when that recipient is the bound speaker',async()=>{
 const{creationPurposeIssues}=await import('../src/emotional-continuity.js');const w=world();
 const text='You were right here and had made it for me.';
 assert.deepEqual(creationPurposeIssues(w,text,'HOST','RECIPIENT'),[]);
 for(const speaker of ['PLAYER','HOST','NARRATOR'])assert.ok(creationPurposeIssues(w,text,'HOST',speaker).length,speaker);
 assert.ok(creationPurposeIssues(w,text.replace(/\.$/u,'')+', but only because you felt guilty.','HOST','RECIPIENT').length);
});

test('a known recipient feeling displayed is emotional exposure, not uncertain artwork placement',()=>{
 const w=world();w.recipient.name='June';const text='Ellis could not know whether June felt thanked, displayed, or quietly expected to respond.';
 assert.ok(!reflectionIssues(w,'F2',text).some(x=>x.includes('settled material')));
 assert.ok(!reflectionIssues(w,'F2','Ellis wondered whether June felt displayed.').some(x=>x.includes('settled material')));
 for(const line of [text+' Perhaps the work will go elsewhere.','Ellis wondered whether the work was displayed.'])assert.ok(reflectionIssues(w,'F2',line).some(x=>x.includes('settled material')),line);
});


test('making trust feel less simple is a causative feeling rather than creating the work',()=>{
 assert.equal(ambiguousAuthorship('I made that trust feel less simple.'),false);
 assert.equal(ambiguousAuthorship('I made that trust feel less simple, and you made the drawing.'),true);
 assert.equal(ambiguousAuthorship('I made the drawing itself feel exposed.'),true);
});
