import test from 'node:test';
import assert from 'node:assert/strict';
import {generateEmotional,validateEmotionalArtifact,newGenerationCheckpoint} from '../src/emotional-generation.js';
import {declaredBoundaryIssues,ambiguousAuthorship} from '../src/emotional-3c.js';
import {providerFixture,testProfile} from './emotional-fixtures.js';
import {narrativeBudget} from '../src/emotional-reliability.js';
import {emotionalBlockIds} from '../../../packages/engine/src/emotional.js';
import {renderPassages} from '../src/emotional-dialogue.js';

async function sample(){return (await generateEmotional(testProfile,{apiKey:'test',fetch:providerFixture(),withArt:false,checkpoint:{...newGenerationCheckpoint(),revision:'3c-19'}})).artifact;}
const setText=(a:Awaited<ReturnType<typeof sample>>,id:string,text:string)=>{a.blocks[id]!.passages![0]={speaker:'NARRATOR',addressee:'NONE',lead:'',text,tail:''};a.blocks[id]!.text=renderPassages(a.world,a.blocks[id]!.passages!);};

test('excluded death includes recorded terminal-family euphemisms without banning exhibition dates',()=>{
 const profile={...testProfile,exclusions:['death']};
 for(const text of ["Mara missed Lena's mother's final weeks.",'They remembered the last days of her life.','They were grieving a parent who had passed away.'])assert.ok(declaredBoundaryIssues(text,profile).length,text);
 for(const text of ['The exhibition enters its final weeks.','They had missed an ordinary appointment.','The last moment passed without a response.'])assert.deepEqual(declaredBoundaryIssues(text,profile),[],text);
 assert.deepEqual(declaredBoundaryIssues("Mara missed Lena's mother's final weeks.",testProfile),[]);
});

test('the new reaction contract cannot invent a depicted pose or an unnamed viewing guest',async()=>{
 const a=await sample();(a.world as any).narrationPolicy='protagonist-camera-3';
 for(const [id,text]of [['F1','Exactly one human figure sat within the painting.'],['F4','Someone had shifted on the viewing bench, wood giving softly.'],['F4','The viewing bench stood empty behind Alex.'],['F5','The viewing bench held stacked mounts and a folded cloth.']]as const){setText(a,id,text);assert.ok(validateEmotionalArtifact(a,testProfile).issues[id]?.some(s=>/reaction|depict|seating|camera/i.test(s)),text);}
});

test('a depicted empty bench must not be mistaken for actual attendance in an old visual world',async()=>{
 const a=await sample();a.world.work.visual!.subject='A night bus shelter in rain.';a.world.work.appearance='A single empty bench glows in the painting.';setText(a,'S3','The image showed a single empty bench beneath a yellow shelter.');assert.ok(!(validateEmotionalArtifact(a,testProfile).issues.S3??[]).some(s=>/Attendance varies/.test(s)));
});

test('the reflection contract cannot reopen a material placement already resolved',async()=>{
 const a=await sample();(a.world as any).narrationPolicy='protagonist-camera-3';setText(a,'F4','Whether it would be kept close in private or noticed by strangers remained open.');assert.ok(validateEmotionalArtifact(a,testProfile).issues.F4?.some(s=>/settled|placement|custody/i.test(s)));
});

test('current participant references remain stable instead of changing he and she',async()=>{
 const a=await sample();(a.world as any).narrationPolicy='protagonist-camera-3';setText(a,'ARRB','Ren tilted his head, then she watched Alex.');assert.ok(validateEmotionalArtifact(a,testProfile).issues.ARRB?.some(s=>/pronoun|reference/i.test(s)));
});

test('a fresh world shows its full original depiction but does not expose it to independent reaction writers',async()=>{
 const fixture=providerFixture();let payload:any;
 const fetcher=(async(url,init)=>{const p=JSON.parse(JSON.parse(String(init?.body)).messages[1].content);if(p.block==='S3')payload=p;return fixture(url,init);})as typeof fetch;
 const r=await generateEmotional(testProfile,{apiKey:'test',fetch:fetcher,withArt:false});
 assert.equal(r.checkpoint.revision,'3c-54');assert.equal(payload.projection.context.work.visual,undefined);assert.equal(payload.projection.context.work.appearance,undefined);
 assert.ok(!JSON.stringify(payload).includes('white lighthouse'));
 assert.match(r.artifact.factualText.AAA!.S1!,/white lighthouse/);assert.match(r.artifact.factualText.AAA!.S1!,/square window/);
});

test('an overlong shared ending cannot bypass the complete-route duration check',async()=>{
 const a=await sample();(a.world as any).narrationPolicy='protagonist-camera-3';setText(a,'F6',Array.from({length:500},(_,i)=>'observation'+i).join(' ')+'.');assert.ok(validateEmotionalArtifact(a,testProfile).issues.$length);
});

test('illness and family-conflict exclusions include their concrete implied settings',()=>{
 assert.ok(declaredBoundaryIssues('They sat beside a hospital bed during treatment.',{...testProfile,exclusions:['illness']}).length);
 assert.ok(declaredBoundaryIssues('Their parents had argued for years, and their sibling would no longer speak to them.',{...testProfile,exclusions:['family drama']}).length);
 assert.deepEqual(declaredBoundaryIssues('Their mother once taught them to fold paper.',{...testProfile,exclusions:['family drama']}),[]);
 assert.deepEqual(declaredBoundaryIssues('The conflict concerned credit for their shared work.',{...testProfile,exclusions:['family drama']}),[]);
});

test('a literal custom exclusion is respected without applying it to other profiles',()=>{
 assert.ok(declaredBoundaryIssues('A spider crossed the table.',{...testProfile,exclusions:['spiders']}).length);
 assert.deepEqual(declaredBoundaryIssues('A spider crossed the table.',testProfile),[]);
});


test('legacy52 word-budget extremes keep every complete route within the unchanged duration bounds',async()=>{
 const a=(await generateEmotional(testProfile,{apiKey:'test',checkpoint:{revision:'3c-52',blocks:{},initialComplete:[],repairPass:0,repairsComplete:[],images:[],receipts:[]},fetch:providerFixture(),withArt:false})).artifact;
 for(const bound of ['min','max']as const){
  for(const id of emotionalBlockIds){const n=narrativeBudget(a.world,id)[bound],text=Array.from({length:n},(_,i)=>id+'term'+i).join(' ')+'.';a.blocks[id]={claims:[],text,passages:[{speaker:'NARRATOR',addressee:'NONE',lead:'',text,tail:''}]};}
  const v=validateEmotionalArtifact(a,testProfile);assert.equal(v.routes.length,27);assert.ok(v.wordRange[0]>=2000&&v.wordRange[1]<=2400,JSON.stringify(v.wordRange));assert.equal(v.issues.$length,undefined);
 }
});

test('revision 29 overlong ending is repaired once without rewriting all other blocks',async()=>{
 const fixture=providerFixture();let repairs:string[]=[];
 const fetcher=(async(url,init)=>{const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content),res=await fixture(url,init);if(p.block!=='F6'||p.task!=='block')return res;const raw=await res.json(),v=JSON.parse(raw.choices[0].message.content);v.p1.text+=' '+Array.from({length:500},(_,i)=>'extension'+i).join(' ');return new Response(JSON.stringify({...raw,choices:[{finish_reason:'stop',message:{content:JSON.stringify(v)}}]}),{status:200});})as typeof fetch;
 const r=await generateEmotional(testProfile,{apiKey:'test',fetch:fetcher,checkpoint:{revision:'3c-29',blocks:{},initialComplete:[],repairPass:0,repairsComplete:[],images:[],receipts:[]},withArt:false,onRepair:ids=>{repairs=ids;}});assert.deepEqual(repairs,['F6']);assert.equal(r.checkpoint.repairPass,1);assert.deepEqual(r.validation.issues,{});
});

test('a painting mentioned before a real empty bench never masks a missing actual guest',async()=>{
 const a=await sample();setText(a,'S3','The painting drew Alex’s attention while the empty bench beside them held no guest.');assert.ok(validateEmotionalArtifact(a,testProfile).issues.S3?.some(s=>/Attendance varies/.test(s)));
});

test('a fact-heavy motive that cannot fit the shared budgets fails before paid prose',async()=>{
 const fixture=providerFixture();let prose=0;
 const fetcher=(async(url,init)=>{const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);if(p.task!=='world')prose++;const res=await fixture(url,init);if(p.task!=='world')return res;const raw=await res.json(),w=JSON.parse(raw.choices[0].message.content);w.private_reason=Array.from({length:390},()=> 'a').join(' ');raw.choices[0].message.content=JSON.stringify(w);return new Response(JSON.stringify(raw),{status:200});})as typeof fetch;
 await assert.rejects(generateEmotional(testProfile,{apiKey:'test',fetch:fetcher,withArt:false}),(e:any)=>e.stage==='world');assert.equal(prose,0);
});

test('a contradictory current-person pronoun in the source is rejected before prose',async()=>{
 const fixture=providerFixture();let prose=0;
 const fetcher=(async(url,init)=>{const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);if(p.task!=='world')prose++;const res=await fixture(url,init);if(p.task!=='world')return res;const raw=await res.json(),w=JSON.parse(raw.choices[0].message.content);w.recipient.gesture='tilts his head';w.recipient.public_wish='she hopes for open acknowledgment';raw.choices[0].message.content=JSON.stringify(w);return new Response(JSON.stringify(raw),{status:200});})as typeof fetch;
 await assert.rejects(generateEmotional(testProfile,{apiKey:'test',fetch:fetcher,withArt:false}),(e:any)=>e.stage==='world');assert.equal(prose,0);
});


test('redistributing unhurried paragraphs may change local budgets without changing complete-route duration',async()=>{
 const a=(await generateEmotional(testProfile,{apiKey:'test',fetch:providerFixture(),withArt:false})).artifact;
 const moved=a.blocks.S1!.passages!.splice(0,2);a.blocks.S2!.passages!.push(...moved);a.blocks.S1!.text=renderPassages(a.world,a.blocks.S1!.passages!);a.blocks.S2!.text=renderPassages(a.world,a.blocks.S2!.passages!);const v=validateEmotionalArtifact(a,testProfile);assert.ok(v.wordRange[0]>=2000&&v.wordRange[1]<=2400);assert.deepEqual(v.issues,{});
});

test('drawing sleeves over chilled hands is not authorship, while drawing a figure is',()=>{
 assert.equal(ambiguousAuthorship('I drew my sleeves over chilled hands.'),false);
 assert.equal(ambiguousAuthorship('You drew their sleeves over cold wrists.'),false);
 assert.equal(ambiguousAuthorship('I drew the figure inside the picture.'),true);
});

test('revision 31 consistently terse writer gets additional paragraphs in its single duration repair',async()=>{
 const fixture=providerFixture({paragraphWords:21}),initial:Record<string,number>={},repaired:Record<string,number>={};
 const fetcher=(async(url,init)=>{const p=JSON.parse(JSON.parse(String(init?.body)).messages[1].content);if(p.task==='block')initial[p.block]=p.paragraphs;if(p.task==='repair')repaired[p.block]=p.paragraphs;return fixture(url,init);})as typeof fetch;
 const r=await generateEmotional(testProfile,{apiKey:'test',checkpoint:{revision:'3c-31',blocks:{},initialComplete:[],repairPass:0,repairsComplete:[],images:[],receipts:[]},fetch:fetcher,withArt:false});assert.equal(r.checkpoint.repairPass,1);assert.ok(Object.entries(repaired).some(([id,n])=>n>initial[id]!));assert.ok(r.validation.wordRange[0]>=2000&&r.validation.wordRange[1]<=2400);assert.deepEqual(r.validation.issues,{});
});

test('a reaction cannot invent a closed deposit slot whose access is already fixed',async()=>{
 const a=await sample();(a.world as any).narrationPolicy='protagonist-camera-3';setText(a,'S2','Its narrow slot remained ordinary and closed, asking nothing.');assert.ok(validateEmotionalArtifact(a,testProfile).issues.S2?.some(s=>/mechanism|slot/i.test(s)));
});

test('each public wish stays attached to its actual owner instead of an anonymous values list',async()=>{
 const fixture=providerFixture();let p:any;
 const fetcher=(async(url,init)=>{const v=JSON.parse(JSON.parse(String(init?.body)).messages[1].content);if(v.block==='S2')p=v;return fixture(url,init);})as typeof fetch;
 const r=await generateEmotional(testProfile,{apiKey:'test',fetch:fetcher,withArt:false});assert.equal(p.projection.context.reflection_values,undefined);assert.deepEqual(p.projection.context.public_wishes.map((x:any)=>x.owner),['HOST','RECIPIENT']);assert.equal(p.projection.context.public_wishes[0].wish,r.artifact.world.host.public_wish);assert.equal(p.projection.context.public_wishes[1].wish,r.artifact.world.recipient.public_wish);assert.match(r.artifact.world.story!.tension,/Tessa Vale/);assert.match(r.artifact.world.story!.tension,/Ren Cole/);
});

test('a loose flat work cannot become a frame or a stack during its reaction',async()=>{
 const a=await sample();(a.world as any).narrationPolicy='protagonist-camera-3';
 for(const text of ['Ellis adjusts the frame on their lap.','Ellis holds the frame carefully.']){setText(a,'ARRA',text);assert.ok(validateEmotionalArtifact(a,testProfile).issues.ARRA?.some(s=>/frame|flat work/i.test(s)),text);}
});

test('an unnamed visitor cannot pause, nod and leave a closed three-adult scene',async()=>{
 const a=await sample();(a.world as any).narrationPolicy='protagonist-camera-3';
 for(const text of ['Someone else paused beside the board, nodded briefly, and moved on.','The small crowd had thinned to murmurs in the hall.']){setText(a,'F3',text);assert.ok(validateEmotionalArtifact(a,testProfile).issues.F3?.some(s=>/participant|cast|crowd/i.test(s)),text);}
 setText(a,'F3','Ellis considered whether others might notice the care later.');assert.ok(!(validateEmotionalArtifact(a,testProfile).issues.F3??[]).some(s=>/participant|cast|crowd/i.test(s)));
});

test('before the explanation is opened the single work is not a stack of held pages',async()=>{
 const a=await sample();(a.world as any).narrationPolicy='protagonist-camera-3';setText(a,'S1','Rowan kept the pages settled on their lap.');assert.ok(validateEmotionalArtifact(a,testProfile).issues.S1?.some(s=>/single|piece|stack/i.test(s)));
});

test('new owner labels do not reintroduce an unguaranteed companion name into shared reactions',async()=>{
 const fixture=providerFixture();let p:any;
 const fetcher=(async(url,init)=>{const req=JSON.parse(String(init?.body)),v=JSON.parse(req.messages[1].content);if(v.block==='S3')p=v;const res=await fixture(url,init);if(v.task!=='world')return res;const raw=await res.json(),w=JSON.parse(raw.choices[0].message.content);w.host.public_wish='they hope Ren Cole can look slowly without answering';raw.choices[0].message.content=JSON.stringify(w);return new Response(JSON.stringify(raw),{status:200});})as typeof fetch;
 await generateEmotional(testProfile,{apiKey:'test',fetch:fetcher,withArt:false});assert.ok(!JSON.stringify(p).includes('Ren Cole'));
});

test('joining the viewing area cannot re-enter the room where the guest already was',async()=>{
 const a=await sample();(a.world as any).narrationPolicy='protagonist-camera-4';setText(a,'ARRA','Tessa entered the back room and took a place at the viewing bench.');assert.ok(validateEmotionalArtifact(a,testProfile).issues.ARRA?.some(s=>/re-entry|already|arrival/i.test(s)));
 setText(a,'ARRA','Tessa moved to the viewing area without leaving the room.');assert.ok(!(validateEmotionalArtifact(a,testProfile).issues.ARRA??[]).some(s=>/re-entry/.test(s)));
});

test('public preferences are not invented written notices pinned on the board',async()=>{
 const a=await sample();(a.world as any).narrationPolicy='protagonist-camera-3';setText(a,'D3B','They thought about the two public wishes pinned to the board.');assert.ok(validateEmotionalArtifact(a,testProfile).issues.D3B?.some(s=>/written|preferences/i.test(s)));
});

test('picturing a possible placement is not describing the immutable depiction',async()=>{
 const a=await sample();(a.world as any).narrationPolicy='protagonist-camera-3';setText(a,'S3','Ellis pictured keeping it nearer, sheltered from general notice.');assert.ok(!(validateEmotionalArtifact(a,testProfile).issues.S3??[]).some(s=>/depicted content/.test(s)));
 setText(a,'S3','A rendered human figure stood within the painting.');assert.ok(validateEmotionalArtifact(a,testProfile).issues.S3?.some(s=>/depicted content/.test(s)));
});

test('a fresh arrival is stated by the engine before the reaction without changing prior formats',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'test',fetch:providerFixture(),withArt:false});assert.match(r.artifact.factualText.AAA!.ARRA!,/already inside/i);assert.match(r.artifact.factualText.BAA!.ARRB!,/already inside/i);assert.match(r.artifact.factualText.TAA!.ARRT!,/no invitation/i);
 const old=await sample();assert.equal(old.factualText.AAA!.ARRA,undefined);
});

test('image requests inherit confirmed exclusions without receiving the hidden reason or sealed past',async()=>{
 const profile={...testProfile,exclusions:['death','spiders']};const r=await generateEmotional(profile,{apiKey:'test',fetch:providerFixture(),withArt:false});let checked=false;
 await assert.rejects(generateEmotional(profile,{apiKey:'test',checkpoint:r.checkpoint,withArt:true,onStart:request=>{if(request.model==='muse-image-1.0'){assert.ok(request.prompt.includes(JSON.stringify(profile.exclusions)));assert.ok(!request.prompt.includes(r.artifact.world.private_reason));assert.ok(!request.prompt.includes(r.artifact.world.story!.sealed_truth));checked=true;throw Error('image profile inspected');}},fetch:(async()=>{throw Error('No actual image call');})as typeof fetch}),/image profile inspected/);assert.equal(checked,true);
});

test('drawing an already-held sheet nearer is physical handling rather than authoring it',()=>{
 assert.equal(ambiguousAuthorship('I drew the sheet nearer on my lap.'),false);assert.equal(ambiguousAuthorship('You drew the paper closer to your knees.'),false);assert.equal(ambiguousAuthorship('I drew the figure nearer the painted window.'),true);
});

test('the no-invitation arrival never tells the writer that a guest already moved',async()=>{
 const fixture=providerFixture();let p:any;
 const fetcher=(async(url,init)=>{const v=JSON.parse(JSON.parse(String(init?.body)).messages[1].content);if(v.block==='ARRT')p=v;return fixture(url,init);})as typeof fetch;
 await generateEmotional(testProfile,{apiKey:'test',fetch:fetcher,withArt:false});assert.equal(p.projection.context.current_facts.guest_at_VIEWING,'NONE');assert.ok(!/already moved the invited person/i.test(p.projection.context.arrival_boundary));assert.match(p.projection.context.arrival_boundary,/no invitation/i);
});

test('coming into focus inside a dim room is not entering that room',async()=>{
 const a=await sample();a.world.narrationPolicy='protagonist-camera-4';setText(a,'ARRA','Tessa came into focus as Alex’s eyes adjusted to the dim room.');assert.ok(!(validateEmotionalArtifact(a,testProfile).issues.ARRA??[]).some(s=>/re-entry/.test(s)));
});

test('a passively pictured figure cannot introduce an immutable pose',async()=>{
 const a=await sample();a.world.narrationPolicy='protagonist-camera-4';setText(a,'ARRA','The single figure was pictured seated beneath a white arch.');assert.ok(validateEmotionalArtifact(a,testProfile).issues.ARRA?.some(s=>/depicted content/.test(s)));
});

test('drawing a breath accepts ordinary adjectives without permitting a drawn figure',()=>{
 for(const text of ['I drew a shallow breath.','You drew a soft breath.','I had drawn a short uneven breath.'])assert.equal(ambiguousAuthorship(text),false,text);
 assert.equal(ambiguousAuthorship('I drew a shallow blue figure.'),true);
});

test('an established ledger title is not a new task but a second signing ledger is',async()=>{
 const a=await sample();a.world.record.name='Ledger of Keeping';
 for(const text of ['The plain gray ledger lay closed upon the table, waiting.','Earlier reading in the Ledger of Keeping had stayed with Alex.']){setText(a,'S1',text);assert.ok(!(validateEmotionalArtifact(a,testProfile).issues.S1??[]).some(s=>/signing task/.test(s)),text);}
 setText(a,'S1','A second ledger waited for everyone to sign.');assert.ok(validateEmotionalArtifact(a,testProfile).issues.S1?.some(s=>/signing task/.test(s)));
});

test('the viewing invitation cannot be reassigned from protagonist to creator',async()=>{
 const a=await sample();(a.world as any).narrationPolicy='protagonist-camera-5';setText(a,'F1','Something about being invited by Tessa Vale made staying easier.');assert.ok(validateEmotionalArtifact(a,testProfile).issues.F1?.some(s=>/invitation|initiator/.test(s)));
 setText(a,'F1','Alex recalled inviting Tessa Vale to share this moment.');assert.ok(!(validateEmotionalArtifact(a,testProfile).issues.F1??[]).some(s=>/invitation|initiator/.test(s)));
});

test('an omitted role cannot acquire current activity elsewhere in the building',async()=>{
 const a=await sample();(a.world as any).narrationPolicy='protagonist-camera-5';setText(a,'S2','Farther off in the building, the intended recipient continued their own evening.');assert.ok(validateEmotionalArtifact(a,testProfile).issues.S2?.some(s=>/logistics|omitted role|position/.test(s)));
 setText(a,'S2','Alex considered the intended recipient’s wish for privacy.');assert.ok(!(validateEmotionalArtifact(a,testProfile).issues.S2??[]).some(s=>/logistics|omitted role|position/.test(s)));
});

test('an anonymous crossing is not added to the protagonist camera',async()=>{
 const a=await sample();(a.world as any).narrationPolicy='protagonist-camera-5';setText(a,'F3','The edge lifted faintly when someone crossed the room.');assert.ok(validateEmotionalArtifact(a,testProfile).issues.F3?.some(s=>/anonymous|logistics|camera/.test(s)));
 setText(a,'F3','Alex wondered whether someone might cross the room later.');assert.ok(!(validateEmotionalArtifact(a,testProfile).issues.F3??[]).some(s=>/anonymous|logistics|camera/.test(s)));
});

test('the writer retains known positions without promoting omitted roles into participants',async()=>{
 const fixture=providerFixture(),payloads:Record<string,any>={};const fetcher=(async(url,init)=>{const p=JSON.parse(JSON.parse(String(init?.body)).messages[1].content);if(p.block)payloads[p.block]=p;return fixture(url,init);})as typeof fetch;
 const generated=await generateEmotional(testProfile,{apiKey:'test',fetch:fetcher,withArt:false});
 const s2=payloads.S2.projection;assert.ok(s2.context.scene_logistics,'Known positions must survive identity filtering');assert.equal(s2.context.scene_logistics.actors.RECIPIENT.at,'WORK_AREA');assert.equal(s2.context.scene_logistics.actors.RECIPIENT.may_participate,false);assert.ok(!s2.allowed_named_current_actors.includes('RECIPIENT'));
 assert.equal(payloads.F1.projection,undefined);assert.equal(payloads.F4.projection,undefined);
 assert.ok(generated.artifact.factualText.AAA!.F1!.includes(generated.artifact.world.host.name+' remains at the viewing bench.'));
 for(const id of ['F1','F4']){assert.equal(payloads[id].reaction_contract,'outcome-reactions-2');assert.equal(payloads[id].host,undefined);assert.equal(payloads[id].recipient,undefined);}
});

test('a canonical ledger name cannot conceal a new signing task or a second original',async()=>{
 const a=await sample();a.world.record.name='Ledger of Keeping';
 for(const text of ['Alex prepared to sign the Ledger of Keeping.','A second Ledger of Keeping waited beside the original.']){setText(a,'S1',text);assert.ok(validateEmotionalArtifact(a,testProfile).issues.S1?.some(s=>/signing task/.test(s)),text);}
});

test('a contracted denial of a reversed invitation is not an actual invitation',async()=>{
 const a=await sample();a.world.narrationPolicy='protagonist-camera-5';for(const contraction of ["wasn't",'wasn’t']){setText(a,'F1',`Alex ${contraction} invited by Tessa Vale; the decision had been their own.`);assert.ok(!(validateEmotionalArtifact(a,testProfile).issues.F1??[]).some(s=>/invitation|initiator/.test(s)),contraction);}
});

test('drawing a figure taking breath is authorship rather than the breathing idiom',()=>{
 assert.equal(ambiguousAuthorship('You drew a figure taking breath.'),true);assert.equal(ambiguousAuthorship('I drew a person holding breath.'),true);
});

test('a named Night Bench work is not physical seating in a shared ending',async()=>{
 const a=await sample();a.world.narrationPolicy='protagonist-camera-5';a.world.work.name='Night Bench';
 setText(a,'F4','Alex felt glad Night Bench was public now.');assert.ok(!(validateEmotionalArtifact(a,testProfile).issues.F4??[]).some(s=>/seating|camera/.test(s)));
 setText(a,'F4','Night Bench was public now, and the empty bench beside Alex held no guest.');assert.ok(validateEmotionalArtifact(a,testProfile).issues.F4?.some(s=>/seating|camera/.test(s)));
});

test('a nominal thank you is narration while an unattributed spoken line is rejected',async()=>{
 const a=await sample();setText(a,'F4','Alex remembered the creator wished for slow looking, without an immediate thank you.');assert.ok(!(validateEmotionalArtifact(a,testProfile).issues.F4??[]).some(s=>/hide dialogue/.test(s)));
 setText(a,'F4','Thank you, Tessa Vale.');assert.ok(validateEmotionalArtifact(a,testProfile).issues.F4?.some(s=>/hide dialogue/.test(s)));
});

test('a generic seating title never hides an actual seat assertion',async()=>{
 const a=await sample();a.world.narrationPolicy='protagonist-camera-5';
 for(const [name,text]of [['bench','The bench creaked faintly behind Alex.'],['Bench','The Bench stood empty beside Alex.'],['The bench','The bench creaked faintly behind Alex.']]as const){a.world.work.name=name;setText(a,'F4',text);assert.ok(validateEmotionalArtifact(a,testProfile).issues.F4?.some(s=>/seating|camera/.test(s)),name);}
});

test('an Empty Bench title is not a claim that the actual viewing area is empty',async()=>{
 const a=await sample();a.world.narrationPolicy='protagonist-camera-5';a.world.work.name='Empty Bench';setText(a,'F4','Alex felt glad Empty Bench was public now.');assert.ok(!(validateEmotionalArtifact(a,testProfile).issues.F4??[]).some(s=>/Attendance varies|seating|camera/.test(s)));
 setText(a,'F4','Empty Bench was public now, but the empty bench beside Alex held no guest.');assert.ok(validateEmotionalArtifact(a,testProfile).issues.F4?.some(s=>/Attendance varies|seating|camera/.test(s)));
});

test('directing focus inward is mental attention rather than drawing a depicted subject',()=>{
 for(const text of ['I drew their focus inward.','You drew your attention back to the room.','I drew their gaze toward the edge.'])assert.equal(ambiguousAuthorship(text),false,text);
 assert.equal(ambiguousAuthorship('You drew a focused figure taking breath.'),true);
});

test('a named protagonist directing focus inward is not reassigned artwork authorship',async()=>{
 const a=await sample();a.world.narrationPolicy='protagonist-camera-5';setText(a,'S3','Alex drew their focus inward and let the options wait.');assert.ok(!(validateEmotionalArtifact(a,testProfile).issues.S3??[]).some(s=>/author|created the work/.test(s)));
});
