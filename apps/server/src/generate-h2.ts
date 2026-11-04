import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateMetaCase, GenerationError, type GenerationAttempt } from './meta-generation.js';

// Private offline H2 increment. It does not load or modify any H1 session database.
const apiKey=process.env.MODEL_API_KEY;
if(!apiKey)throw new Error('MODEL_API_KEY is not configured.');
const root=resolve('data/h2',randomUUID());mkdirSync(root,{recursive:true,mode:0o700});
function save(name:string,value:unknown){const path=resolve(root,name);writeFileSync(path+'.tmp',JSON.stringify(value,null,2),{mode:0o600});renameSync(path+'.tmp',path);}
const settings=[{role:'technician' as const,tone:'tension' as const,detail:'Snow tapping the shutters'},
  {role:'guest' as const,tone:'melancholy' as const,detail:'A fading fire and distant wind'}];
const summary:{case:number;hash:string;contentFingerprint:string;model:string;attempts:GenerationAttempt[];validation:unknown}[]=[];
const startedAt=new Date().toISOString();
save('job.json',{stage:'H2',status:'generating',startedAt,chargeStatus:'unknown until usage is returned',maxCalls:4});
try{
  for(const [index,config] of settings.entries()){
    const prefix=`case-${index+1}`;const attempts:GenerationAttempt[]=[];
    save(prefix+'-receipt.json',{status:'requesting',config,attempts,chargeStatus:'unknown'});
    const result=await generateMetaCase(config,{apiKey,onAttempt:attempt=>{
      attempts.push({...attempt});save(prefix+'-receipt.json',{status:attempt.accepted?'validated':'attempt finished',config,attempts});
    }});
    const {reserve,motive,coverStory,recipient,documentTitle}=result.draft;
    const contentFingerprint=createHash('sha256').update(JSON.stringify([reserve,motive,coverStory,recipient,documentTitle])).digest('hex');
    if(summary.some(item=>item.contentFingerprint===contentFingerprint))throw new Error('Two distinct case contents are required.');
    save(prefix+'-world.json',result.world);save(prefix+'-draft.json',result.draft);
    save(prefix+'-receipt.json',{status:'sealed',config,hash:result.hash,contentFingerprint,attempts,validation:result.validation});
    summary.push({case:index+1,hash:result.hash,contentFingerprint,model:result.attempts.at(-1)!.model!,attempts,validation:result.validation});
  }
  const attempts=summary.flatMap(item=>item.attempts);
  const inputTokens=attempts.every(item=>item.inputTokens!==null)?attempts.reduce((sum,item)=>sum+item.inputTokens!,0):null;
  const outputTokens=attempts.every(item=>item.outputTokens!==null)?attempts.reduce((sum,item)=>sum+item.outputTokens!,0):null;
  const estimatedUncachedCostUsd=inputTokens===null||outputTokens===null?null:(inputTokens*1.25+outputTokens*4.25)/1_000_000;
  const receipt={stage:'H2',status:'two cases generated and validated',startedAt,finishedAt:new Date().toISOString(),cases:summary,
    calls:attempts.length,inputTokens,outputTokens,estimatedUncachedCostUsd,
    pricing:{checkedOn:'2026-10-28',source:'https://dev.meta.ai/docs/pricing-rate-limits',inputPerMillionUsd:1.25,outputPerMillionUsd:4.25,note:'Estimate treats all input as uncached; not a billing receipt.'}};
  save('job.json',receipt);
  console.log(JSON.stringify({privateDirectory:root,...receipt},null,2));
}catch(error){
  save('job.json',{stage:'H2',status:'failed',startedAt,finishedAt:new Date().toISOString(),completedCases:summary,
    message:error instanceof GenerationError?error.message:'Private generation job failed.',attempts:error instanceof GenerationError?error.attempts:undefined});
  console.error(error instanceof GenerationError?error.message:'Private generation job failed. See the private job receipt.');process.exitCode=1;
}
