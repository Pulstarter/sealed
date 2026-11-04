import{test}from'node:test';import assert from'node:assert/strict';
import{fixtureWorld}from'../../../packages/engine/test/emotional-fixture.js';
import{resolveSceneRequest}from'../src/emotional-scene-context.js';
import{generateEmotional}from'../src/emotional-generation.js';
import{providerFixture,testProfile,response}from'./emotional-fixtures.js';
import type{EmotionalBlock}from'../../../packages/engine/src/emotional-types.js';
const world=()=>{const w=fixtureWorld();w.player_name='Jules';w.host.name='Lin';w.recipient.name='Mara';return w;};
const request=(task='block')=>({key:task==='block'?'block:S2':'repair:S2',model:'muse-wonder-1.0' as const,maxTokens:6400,schema:{},instructions:'base',payload:{task,block:'S2',target_words:550,paragraph_plan:{p1:'NARRATOR>NONE',p2:'PLAYER>HOST'},projection:{allowed_named_current_actors:['PLAYER','HOST'],context:{current_actor_pronouns:{Jules:'they/them/their',Lin:'they/them/their'}}},instruction:'base',...(task==='repair'?{feedback:['Keep current participant references stable: use names and singular they/them/their pronouns.']}:{} )}});

test('known identity pronouns include a referenced recipient without making them present',()=>{
 const w=world(),spec=request(),p=resolveSceneRequest(w,spec,'3c-54').payload as any;
 assert.deepEqual(p.known_identity_pronouns,{PLAYER:{name:'Jules',pronouns:'they/them/their/theirs/themself'},HOST:{name:'Lin',pronouns:'they/them/their/theirs/themself'},RECIPIENT:{name:'Mara',pronouns:'they/them/their/theirs/themself'}});
 assert.deepEqual(p.projection.allowed_named_current_actors,['PLAYER','HOST']);assert.deepEqual(Object.keys(p.projection.context.current_actor_pronouns),['Jules','Lin']);
 assert.match(spec.instructions,/including.*absent|whether.*present/iu);assert.match(p.identity_reference_boundary,/not.*attendance|not.*present/iu);
 assert.ok(!JSON.stringify(p).includes(w.private_reason));
});

test('pronoun repair points to exact source fields, words and voices without guessing the referent or leaking secrets',()=>{
 const w=world();w.private_reason='PRIVATE_REASON she';(w as any).story={sealed_truth:'SEALED_TRUTH her'};
 const b:EmotionalBlock={claims:[],text:'rejected',passages:[{speaker:'NARRATOR',addressee:'NONE',lead:'',text:'Mara offered her thanks. PRIVATE_REASON she SEALED_TRUTH her',tail:''},{speaker:'PLAYER',addressee:'HOST',lead:'Jules listened to her.',text:'Mara has said her gratitude is not meant to make you perform pleasure, Lin.',tail:'She seemed uncertain.'}]};
 const before=structuredClone(b),p=resolveSceneRequest(w,request('repair'),'3c-54',b).payload as any;
 assert.equal(p.reference_repairs.length,4);
 assert.deepEqual(p.reference_repairs.map((x:any)=>x.source_field),['p01_text','p02_lead','p02_text','p02_tail']);
 const hit=p.reference_repairs.find((x:any)=>x.source_field==='p02_text');assert.equal(hit.source_text,b.passages![1]!.text);assert.deepEqual(hit.disallowed_words,[{word:'her',offset:14}]);assert.equal(hit.speaker,'PLAYER');assert.equal(hit.addressee,'HOST');
 assert.ok(!JSON.stringify(p.reference_repairs).includes('PRIVATE_REASON'));assert.ok(!JSON.stringify(p.reference_repairs).includes('SEALED_TRUTH'));
 assert.match(p.reference_repair_boundary,/do not guess/iu);assert.deepEqual(b,before);
});

test('a clean block needs no reference repair, old protocols and closing isolation remain intact',()=>{
 const w=world(),old=request('repair'),before=structuredClone(old);assert.deepEqual(resolveSceneRequest(w,old,'3c-53'),before);
 const clean:EmotionalBlock={claims:[],text:'Jules listened.',passages:[{speaker:'NARRATOR',addressee:'NONE',text:'Jules listened.'}]};
 const p=resolveSceneRequest(w,request('repair'),'3c-54',clean).payload as any;assert.equal(p.reference_repairs,undefined);
 const end=request('repair');Object.assign(end.payload,{reaction_contract:'outcome-reactions-2',block:'F6',paragraph_plan:{p1:'NARRATOR>NONE'},projection:{allowed_named_current_actors:['PLAYER'],context:{}}});
 const q=resolveSceneRequest(w,end,'3c-54',{...clean,passages:[{speaker:'NARRATOR',addressee:'NONE',text:'She remembered a prior promise.'}]}).payload as any;
 assert.deepEqual(Object.keys(q.known_identity_pronouns),['PLAYER']);assert.equal(q.reference_repairs,undefined);assert.ok(!JSON.stringify(q).includes('prior promise'));
});

for(const permanent of[false,true])test(permanent?'persistent gendered references still fail after two targeted repairs without a third pass':'both repair passes receive exact bad fields and identities before a synthetic corrected answer',async()=>{
 const base=providerFixture(),keys:string[]=[],repairs:any[]=[];let checkpoint:any;
 const provider=(async(url,init)=>{const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content),res=await base(url,init);
  if(p.block!=='S2')return res;
  if(p.task==='repair'){
   repairs.push(p);assert.equal(p.known_identity_pronouns.RECIPIENT.name,'Ren Cole');
   const target=p.reference_repairs.find((x:any)=>x.source_field==='p01_text');assert.ok(target);assert.equal(target.source_text,'Alex considered Ren Cole and her thanks.');assert.equal(target.disallowed_words[0].word,'her');
  }
  const raw=await res.json(),wire=JSON.parse(raw.choices[0].message.content);
  if(permanent||p.repair_pass!==2)wire.p01_text='Alex considered Ren Cole and her thanks.';
  return response(wire,req.model);
 })as typeof fetch;
 const options={apiKey:'fixture-only',fetch:provider,withArt:false,onStart:(s:any)=>{keys.push(s.key);},onCheckpoint:(cp:any)=>{checkpoint=structuredClone(cp);}};
 if(permanent)await assert.rejects(generateEmotional(testProfile,options),/validation failed/iu);
 else{const r=await generateEmotional(testProfile,options);assert.deepEqual(r.validation.issues,{});assert.ok(r.canonical);}
 assert.equal(checkpoint.repairPass,2);assert.deepEqual(repairs.map(p=>p.repair_pass),[1,2]);assert.equal(keys.filter(k=>k==='repair:S2').length,1);assert.equal(keys.filter(k=>k==='repair2:S2').length,1);assert.ok(!keys.some(k=>k.startsWith('repair3:')));
});

test('repair diagnostics never reassemble a canonical secret split across source fields',()=>{
 for(const secretKind of['private_reason','sealed_truth'])for(const split of[false,true]){
  const w=world(),secret='Lin kept an ordinary promise. Mara saved a seat.';
  if(secretKind==='private_reason')w.private_reason=secret;else(w as any).story={sealed_truth:secret};
  const passages:any[]=split?[{speaker:'NARRATOR',addressee:'NONE',text:'She watched. Lin kept an ordinary promise.'},{speaker:'NARRATOR',addressee:'NONE',text:'Mara saved a seat. Her hands were still.'}]:[{speaker:'NARRATOR',addressee:'NONE',text:'She watched. '+secret+' Her hands were still.'}];
  const b:EmotionalBlock={claims:[],text:'rejected',passages},before=structuredClone(b),p=resolveSceneRequest(w,request('repair'),'3c-54',b).payload as any;
  const diagnostics=JSON.stringify(p.reference_repairs??[]);
  assert.ok(!diagnostics.includes('Lin kept an ordinary promise.'),secretKind+' split='+split);
  assert.ok(!diagnostics.includes('Mara saved a seat.'),secretKind+' split='+split);
  assert.deepEqual(b,before);
 }
});
