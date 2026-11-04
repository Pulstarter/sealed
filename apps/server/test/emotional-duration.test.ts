import {test} from 'node:test';import assert from 'node:assert/strict';
import {generateEmotional,newGenerationCheckpoint} from '../src/emotional-generation.js';
import {providerFixture,testProfile,response} from './emotional-fixtures.js';

test('each narrator paragraph retains both linked sentences so short single-sentence output cannot silently lose half its development',async()=>{
 const provider=providerFixture();let paired=false;
 const r=await generateEmotional(testProfile,{apiKey:'test',withArt:false,checkpoint:{...newGenerationCheckpoint(),revision:'3c-33'},fetch:(async(url,init)=>{
  const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);
  if(p.task==='world')return provider(url,init);
  if(!req.response_format.json_schema.schema.properties.p01_observation)return provider(url,init);
  const wire:Record<string,string>={};
  for(let i=0;i<p.paragraphs;i++){
   const k='p'+String(i+1).padStart(2,'0'),voice=p.paragraph_plan['p'+(i+1)];
   if(voice==='NARRATOR>NONE'){
    wire[k+'_observation']='Rain softened the light while Alex kept their attention on the quiet room '+p.block+'-'+i+'-a.';
    wire[k+'_response']='The familiar stillness felt different now, asking for care without making any promise '+p.block+'-'+i+'-b.';
   }else{wire[k+'_lead']='Alex listened carefully in the quiet room '+p.block+'-'+i+'.';wire[k+'_text']='That blue looks different in this light '+p.block+'-'+i+'-speech.';wire[k+'_tail']='';}
  }
  paired=true;return response(wire,req.model);
 })as typeof fetch});
 assert.ok(paired,'narrator development must have two required fields');assert.deepEqual(r.validation.issues,{});assert.equal(r.validation.routes.length,27);assert.ok(r.validation.wordRange[0]>=2000&&r.validation.wordRange[1]<=2400);
 const passage=r.artifact.blocks.S1!.passages![0]!;
 assert.equal(passage.text,'Rain softened the light while Alex kept their attention on the quiet room S1-0-a. The familiar stillness felt different now, asking for care without making any promise S1-0-b.');
});

test('revision32 recovery still requests a single narrator field and does not rewrite its received text',async()=>{
 const provider=providerFixture();let single=false;
 const r=await generateEmotional(testProfile,{apiKey:'test',withArt:false,checkpoint:{...newGenerationCheckpoint(),revision:'3c-32'},fetch:(async(url,init)=>{
  const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);
  if(p.task!=='world'){assert.ok(req.response_format.json_schema.schema.properties.p01_text);assert.equal(req.response_format.json_schema.schema.properties.p01_observation,undefined);single=true;}
  return provider(url,init);
 })as typeof fetch});assert.ok(single);assert.deepEqual(r.validation.issues,{});
});

test('a rejected secret-scope paragraph cannot reintroduce the private reason into revision33 repair context',async()=>{
 const provider=providerFixture();let rejectedText='';
 const r=await generateEmotional(testProfile,{apiKey:'test',withArt:false,checkpoint:{...newGenerationCheckpoint(),revision:'3c-33'},fetch:(async(url,init)=>{
  const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content),res=await provider(url,init);
  if(p.task==='repair'&&p.block==='D2A')rejectedText=p.rejected_text;
  if(p.task==='block'&&p.block==='D2A'){const raw=await res.json(),wire=JSON.parse(raw.choices[0].message.content);wire.p01_observation+=' Secret motive.';return response(wire,req.model);}
  return res;
 })as typeof fetch});
 assert.ok(rejectedText);assert.ok(!rejectedText.includes('Secret motive'));assert.deepEqual(r.validation.issues,{});
});

test('a future until clause inside speech is not a speaker tag, while actual tags around it still fail',async()=>{
 const {emotionalFixture}=await import('../../../packages/engine/test/emotional-fixture.js');
 const {dialogueIssues,renderPassages}=await import('../src/emotional-dialogue.js');
 const a=emotionalFixture();a.world.player_name='Robin';a.world.host.name='Mara';a.world.recipient.name='June';
 const issues=(text:string)=>{const passages=[{speaker:'PLAYER' as const,addressee:'HOST' as const,lead:'',text,tail:''}];return dialogueIssues(a.world,'S1',{passages,text:renderPassages(a.world,passages),claims:[]});};
 assert.deepEqual(issues('Do you want me to wait until June asks to see it, Mara, or until you tell me otherwise.'),[]);
 for(const s of ['Do you want me to wait, June asked, while Mara looked away.','I can wait until June asks to see it, Mara said.','June asks, and Mara tells them to wait.'])assert.ok(issues(s).some(x=>x.includes('speaker tags')),s);
});
