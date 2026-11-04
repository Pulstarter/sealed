import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {generateEmotional,type GenerationCheckpoint} from './emotional-generation.js';
import {nextEmotionalChat,chatOpening} from './emotional-chat.js';
import type {MetaReceipt,MetaRequest,ImageRequest} from './emotional-meta.js';
import type {EmotionalProfile} from '../../../packages/engine/src/emotional-types.js';

// Private bounded experiment. No test fixture, hand-edited story or prepared fallback.
process.umask(0o077);
if(!process.env.MODEL_API_KEY)throw new Error('Configure MODEL_API_KEY privately before running.');
const base=path.resolve(process.argv[2]??'data/chat/phase2-final-2026-10-29');
if(!base.startsWith(path.resolve('data/chat')+path.sep))throw new Error('Evidence must remain under private data/chat.');
await fs.mkdir(base,{recursive:true,mode:0o700});
await fs.writeFile(path.join(base,'run-started.json'),JSON.stringify({startedAt:new Date().toISOString(),maxEstimatedUsd:8,noTransportRetries:true})+'\n',{flag:'wx',mode:0o600});
const profiles:Record<string,EmotionalProfile>={
  P1:{mood:'flat and tired',direction:'accompany',experience:'restrained melancholy, a small concrete mystery and an ordinary human connection',exclusions:['no deaths','no illness','no family drama'],intensity:'gentle'},
  P2:{mood:'restless and frustrated',direction:'shift',experience:'playful wonder and an odd little mystery, without a lesson',exclusions:['no humiliation','no graphic violence','no animal harm'],intensity:'moderate'},
  P3:{mood:'sad because a close friend is moving away',direction:'accompany',experience:'bittersweet distance and an unfinished shared activity; not forced reconciliation',exclusions:['no child death','no abuse','no graphic violence'],intensity:'gentle'},
};
await fs.writeFile(path.join(base,'profiles.json'),JSON.stringify(profiles,null,2)+'\n',{mode:0o600});
type Call={profile:string;key:string;model:string;status:'started'|'complete'|'rejected'|'uncertain';reservedCostUsd:number;receipt?:MetaReceipt};
const calls:Call[]=[],summaries:unknown[]=[];let serial=Promise.resolve();
let priorCostUsd=0,priorCalls=0;
for(const sibling of await fs.readdir(path.dirname(base))){if(!sibling.startsWith('phase2-final-2026-10-29')||path.resolve(path.dirname(base),sibling)===base)continue;try{const earlier=JSON.parse(await fs.readFile(path.join(path.dirname(base),sibling,'calls.json'),'utf8')) as Call[];priorCalls+=earlier.length;priorCostUsd+=earlier.reduce((n,c)=>n+(c.receipt?.estimatedCostUsd??c.reservedCostUsd),0);}catch{/* An empty interrupted run contains no provider calls. */}}
function save(name:string,value:unknown){const contents=JSON.stringify(value,null,2)+'\n';serial=serial.then(()=>fs.writeFile(path.join(base,name+'.tmp'),contents,{mode:0o600})).then(()=>fs.rename(path.join(base,name+'.tmp'),path.join(base,name)));return serial;}
const cost=()=>calls.reduce((n,c)=>n+(c.receipt?.estimatedCostUsd??c.reservedCostUsd),0);
const filename=(p:string,k:string)=>p+'-'+k.replaceAll(':','_');
function hooks(p:string){return{
  apiKey:process.env.MODEL_API_KEY!,
  onStart:async(spec:MetaRequest|ImageRequest,reservation:number)=>{
    if(calls.some(c=>c.profile===p&&c.key===spec.key))throw new Error('Duplicate provider request refused.');
    if(calls.length+priorCalls>=220||cost()+priorCostUsd+reservation>8)throw new Error('Bounded experiment allowance reached.');
    calls.push({profile:p,key:spec.key,model:spec.model,status:'started',reservedCostUsd:reservation});await save(filename(p,spec.key)+'-request.json',spec);await save('calls.json',calls);
  },
  onFinish:async(receipt:MetaReceipt,raw?:unknown)=>{const c=calls.find(c=>c.profile===p&&c.key===receipt.key)!;c.status=receipt.status;c.receipt=receipt;await save(filename(p,receipt.key)+'-response.json',raw??null);await save('calls.json',calls);console.log(JSON.stringify({profile:p,key:receipt.key,status:receipt.status,latencyMs:receipt.latencyMs,estimatedCostUsd:receipt.estimatedCostUsd,cumulativeEstimateUsd:Number(cost().toFixed(6))}));},
};}
await fs.mkdir(path.join(base,'source'),{mode:0o700});
const sourceManifest:Record<string,string>={};
for(const file of ['apps/server/src/emotional-generation.ts','apps/server/src/emotional-chat.ts','apps/server/src/emotional-meta.ts','apps/server/src/emotional-prompts.ts','packages/engine/src/emotional.ts','packages/engine/src/emotional-types.ts']){const text=await fs.readFile(file,'utf8');sourceManifest[file]=createHash('sha256').update(text).digest('hex');await fs.writeFile(path.join(base,'source',file.replaceAll('/','_')),text,{mode:0o600});}
await save('source-manifest.json',sourceManifest);
try{
  const started=Date.now();const answer='I feel tired and flat. Please accompany that with a gentle quiet mystery. No deaths, illness or family drama. I want a small human connection, not a lesson.';
  const chat=await nextEmotionalChat([chatOpening(),{role:'user',kind:'answer',content:answer}],{...hooks('CHAT'),key:'chat'});
  await save('chat.json',{reply:chat,sourceAnswer:answer});console.log(JSON.stringify({chatKind:chat.kind}));
  for(const[p,profile]of Object.entries(profiles)){
    const start=Date.now();let last:GenerationCheckpoint|undefined;
    const result=await generateEmotional(profile,{...hooks(p),withArt:true,concurrency:3,onCheckpoint:async cp=>{last=cp;await save(p+'-checkpoint.json',cp);}});
    for(const image of result.checkpoint.images)await fs.writeFile(path.join(base,p+'-'+image.ref.id+'.'+image.ref.mime.split('/')[1]!),Buffer.from(image.base64,'base64'),{mode:0o600});
    await save(p+'-artifact.json',result.artifact);await save(p+'-canonical.json',{canonicalUtf8:result.canonical,sha256:result.hash});await save(p+'-validation.json',result.validation);
    const summary={profile:p,title:result.artifact.world.title,preparationMs:Date.now()-start,wordRange:result.validation.wordRange,routes:result.validation.routes.length,repairPass:result.checkpoint.repairPass,repairedBlocks:result.checkpoint.repairsComplete.length,images:result.checkpoint.images.length,estimatedCostUsd:result.receipts.reduce((n,c)=>n+(c.estimatedCostUsd??c.reservedCostUsd),0),seal:result.hash,canonicalMatches:createHash('sha256').update(result.canonical).digest('hex')===result.hash,editorialReview:'pending'};summaries.push(summary);await save('summary.json',{profiles:summaries,elapsedMs:Date.now()-started,calls:calls.length,estimatedCostUsd:cost()});console.log(JSON.stringify(summary));
  }
  await save('run-complete.json',{calls:calls.length,priorCalls,estimatedCostUsd:cost(),priorCostUsd,cumulativeNewEstimateUsd:cost()+priorCostUsd,profiles:summaries,finishedAt:new Date().toISOString()});
}catch(reason){await save('run-failed.json',{message:reason instanceof Error?reason.message:'Experiment failed',calls:calls.length,estimatedCostUsd:cost(),completedProfiles:summaries});console.log(JSON.stringify({status:'rejected',reason:reason instanceof Error?reason.message:'Experiment failed',calls:calls.length,estimatedCostUsd:cost()}));process.exitCode=1;}
await serial;
