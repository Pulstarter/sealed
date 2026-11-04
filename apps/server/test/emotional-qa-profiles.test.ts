import{test}from'node:test';import assert from'node:assert/strict';import{mkdtemp,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';import{randomUUID,createHash}from'node:crypto';import{DatabaseSync}from'node:sqlite';import{createApp}from'../src/app.js';import{providerFixture,response}from'./emotional-fixtures.js';
const profiles=[
 {answer:'I feel a little low today. I would like a gentle, quiet story with human connection. Keep the intensity low. Avoid death, illness, family crises and graphic violence. I do not need a forced happy ending.',mood:'a little low today',experience:'gentle, quiet story with human connection',intensity:'gentle',ending:'forced happy ending'},
 {answer:'I feel restless and would like a moderately tense story with uncomfortable but believable choices. Let the characters disagree without making anyone a villain. Avoid death, illness, family crises and graphic violence. Do not force a reassuring ending.',mood:'restless',experience:'moderately tense story with uncomfortable but believable choices. Let the characters disagree without making anyone a villain.',intensity:'moderate',ending:'force a reassuring ending'},
 {answer:'I feel calm and curious. I would like a reflective, bittersweet story about noticing another person differently. Keep it intimate, with some uncertainty. Avoid death, illness, family crises and graphic violence. Do not force a cheerful conclusion.',mood:'calm and curious',experience:'reflective, bittersweet story about noticing another person differently',intensity:'gentle',ending:'force a cheerful conclusion'}
]as const;
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
for(const [sample,profile]of profiles.entries())test('literal QA profile '+(sample+1)+' reaches a sealed story through HTTP chat, skip, proposal, generation and validation with synthetic provider replies',async t=>{
 const root=await mkdtemp(join(tmpdir(),'sealed-qa-profile-')),file=join(root,'flow.sqlite'),base=providerFixture(),tasks:string[]=[],injected:string[]=[];
 const provider=(async(url,init)=>{
  if(String(url).endsWith('/images/generations')){tasks.push('image');return new Response(JSON.stringify({output_format:'png',data:[{b64_json:png}]}));}
  const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);tasks.push(p.task+':'+(p.block??''));
  if(p.task==='intake'){
   const users=p.messages.filter((m:any)=>m.role==='user'),count=users.length,fields={direction:'unspecified',mood:profile.mood,experience:profile.experience,intensity:sample===2&&count<3?'unspecified':profile.intensity,exclusions:['death','illness','family crises','graphic violence',profile.ending]};
   // Profile2 deliberately repeats the omitted-villain boundary in2db88f67.
   return response({kind:count===1||sample===2&&count===2?'question':'proposal',message:count===1?'Stay with this feeling or change atmosphere?':'Gentle, moderate or tense?',profile:fields,evidence:[]},req.model);
  }
  if(p.task==='repair'&&p.block==='S2'){assert.equal(p.known_identity_pronouns.RECIPIENT.name,'Ren Cole');assert.ok(p.reference_repairs.some((r:any)=>r.source_field==='p01_text'&&r.disallowed_words.some((m:any)=>m.word==='her')));}
  const res=await base(url,init),raw=await res.json(),wire=JSON.parse(raw.choices[0].message.content);
  if(p.task==='world')wire.record.name='explanation';
  if(p.task==='block'&&p.block==='S2'){wire.p01_text='Alex recognised a personal cost: certainty had been doing quiet work for them, making one stated wish seem able to predict the other. Ren Cole wanted her gratitude acknowledged.';injected.push('relationship');injected.push('pronoun');}
  if(p.task==='block'&&p.block==='F2'){wire.p01_text='Alex faced the public drawing, however carefully they might have wished otherwise.';injected.push('conditional');}
  if(p.task==='block'&&p.block==='F6'){wire.p01_text='Alex felt a responsibility that sat closer than any explanation might have. No reading of tenderness in its lines eased that responsibility.';injected.push('comparison');}
  raw.choices[0].message.content=JSON.stringify(wire);return new Response(JSON.stringify(raw));
 })as typeof fetch;
 const app=createApp({databasePath:file,emotional:{apiKey:'fixture-only',fetch:provider}}),origin=await app.listen();t.after(async()=>{await app.close();await rm(root,{recursive:true,force:true});});
 const cookies=new Map<string,string>();let flow:any;
 async function request(path:string,data?:any){const res=await fetch(origin+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json',Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; '),'If-Match':'"'+(flow?.revision??0)+'"'},...(data?{body:JSON.stringify(data)}:{})});for(const h of res.headers.getSetCookie()){const pair=h.split(';')[0]!,i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1));}const value=await res.json()as any;assert.ok(res.ok,JSON.stringify(value));if(value.flow)flow=value.flow;return value;}
 async function wait(status:string){for(let n=0;n<1500;n++){await request('/api/emotional/current');if(flow.status===status)return;if(flow.status==='failed'){const db=new DatabaseSync(file,{readOnly:true});const error=db.prepare("SELECT details_json FROM emotional_events WHERE kind='operation_failed' ORDER BY id DESC LIMIT 1").get();db.close();assert.fail(JSON.stringify(error));}await new Promise(r=>setTimeout(r,2));}assert.fail('Expected '+status);}
 const initial=await request('/api/emotional/current');assert.equal(initial.flow,null);assert.equal(typeof initial.release,'string');
 await request('/api/emotional/new',{requestId:randomUUID()});const id=flow.id;
 await request('/api/emotional/chat',{id,text:profile.answer,requestId:randomUUID()});await wait('chat');
 await request('/api/emotional/chat',{id,text:'I would rather leave that unspecified. Please continue with what I have already said.',requestId:randomUUID()});await wait(sample===2?'chat':'proposal');
 if(sample===2){await request('/api/emotional/chat',{id,text:'Gentle',requestId:randomUUID()});await wait('proposal');}
 for(const topic of['death','illness','family crises','graphic violence'])assert.ok(flow.profile.exclusions.includes(topic),topic);
 if(sample===1)assert.ok(flow.profile.exclusions.includes('making anyone a villain'));assert.equal(flow.profile.intensity,profile.intensity);
 await request('/api/emotional/confirm',{id,requestId:randomUUID()});await wait('ready');assert.ok(flow.seal);assert.ok(tasks.includes('world:'));assert.ok(tasks.includes('block:S1'));assert.ok(tasks.includes('repair:S2'));assert.equal(tasks.filter(x=>x==='image').length,3);assert.deepEqual(injected.sort(),['comparison','conditional','pronoun','relationship']);
 const db=new DatabaseSync(file,{readOnly:true}),record=JSON.parse((db.prepare('SELECT payload FROM emotional_flows WHERE id=?').get(id)as any).payload);assert.equal(createHash('sha256').update(record.canonical).digest('hex'),record.seal);assert.ok(record.checkpoint.repairPass<=2);assert.equal(db.prepare("SELECT count(*) n FROM emotional_calls WHERE status='started'").get()!.n,0);db.close();
 // This proves the integrated contract with fixtures, not a fresh Meta generation.
});
