import {createHash,randomUUID} from 'node:crypto';
import {realpathSync} from 'node:fs';
import {basename} from 'node:path';
import {createEmotionalState,projectEmotional,stepEmotional,syncEmotional} from '../../../packages/engine/src/emotional.js';
import type {EmotionalArtifact,EmotionalInput} from '../../../packages/engine/src/emotional-types.js';
import {chatOpening,emptyProfile,nextEmotionalChat} from './emotional-chat.js';
import {generateEmotional,newGenerationCheckpoint} from './emotional-generation.js';
import {EmotionalStore,type EmotionalRecord} from './emotional-store.js';
import type {MetaRequest,ImageRequest,MetaOptions} from './emotional-meta.js';
import {emotionalFailure,type EmotionalEventKind} from './emotional-diagnostic.js';
import type {PreparedAdventure} from './demo-prepared.js';

export interface EmotionalOptions {apiKey:string;fetch?:typeof fetch;maxJobs?:number;dailyJobs?:number;ownerDailyJobs?:number;dailyEstimateUsd?:number;prepared?:PreparedAdventure;preparedLimits?:{total:number;perOwner:number}}
export class EmotionalError extends Error {constructor(readonly status:number,message:string){super(message);}}
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const day=(at:number)=>Math.floor(at/86400000)*86400000;
export class EmotionalService {
  readonly store:EmotionalStore;readonly available:boolean;readonly release:string;private stopped=false;private running:Promise<void>|null=null;private abort=new AbortController();
  private limits:{maxJobs:number;dailyJobs:number;ownerDailyJobs:number;dailyEstimateUsd:number};
  private preparedLimits:{total:number;perOwner:number};
  constructor(file:string,private now:()=>number,private options?:EmotionalOptions){
    const directory=basename(realpathSync(process.cwd()));
    this.release=/^\d{8}T\d{6}Z-[a-f0-9]{12}$/.test(directory)?directory:'development';
    this.store=new EmotionalStore(file,this.release);this.available=!!options?.prepared||!!options?.apiKey.trim()&&!/[\r\n]/.test(options.apiKey);
    this.limits={maxJobs:options?.maxJobs??20,dailyJobs:options?.dailyJobs??5,ownerDailyJobs:options?.ownerDailyJobs??3,dailyEstimateUsd:options?.dailyEstimateUsd??5};
    this.preparedLimits=options?.preparedLimits??{total:2000,perOwner:50};
    if(options?.prepared&&Object.values(this.preparedLimits).some(n=>!Number.isSafeInteger(n)||n<=0))throw Error('Invalid demo admission limits.');
    if(Object.values(this.limits).some(x=>!Number.isFinite(x)||x<=0))throw new Error('Invalid emotional preparation limits.');
    for(const r of this.store.unfinished()){
      const calls=this.store.calls(r.id);const stored=new Set(['world',...r.checkpoint.initialComplete.map(x=>'block:'+x),...(r.checkpoint.completedRepairKeys??r.checkpoint.repairsComplete.map(x=>'repair:'+x)),...r.checkpoint.images.map(x=>'art:'+x.ref.id)]);
      if(calls.some(c=>c.status!=='complete'||!c.key.startsWith('chat:')&&!stored.has(c.key))||r.status==='chatting'){
        this.store.transaction(()=>{r.error='interrupted';r.status=r.confirmedAt===null?'chat':'failed';r.updatedAt=now();this.store.save(r);this.trace(r,'process_interrupted',{calls:calls.filter(c=>c.status!=='complete'||!c.key.startsWith('chat:')&&!stored.has(c.key)).map(c=>({key:c.key,status:c.status})),code:'interrupted'},'interrupted:'+r.lastRequestId);});
      }else if(r.status==='generating'){this.store.transaction(()=>{r.status='queued';this.store.save(r);this.trace(r,'generation_resumed',{completedBlocks:r.checkpoint.initialComplete.length,completedRepairs:r.checkpoint.repairsComplete.length,images:r.checkpoint.images.length});});}
    }
    this.kick();
  }
  private trace(r:EmotionalRecord,kind:EmotionalEventKind,details:Record<string,unknown>={},dedupeKey:string|null=null,requestId=r.lastRequestId){this.store.event(r.id,this.now(),kind,{status:r.status,revision:r.revision,...details},requestId,dedupeKey);}
  rejected(owner:string,id:string,requestId:string,operation:'chat'|'confirm'|'action',reason:unknown){
    const r=this.store.owned(owner,id);if(!r)return;
    const kind=operation==='action'?'action_rejected':'request_rejected';
    this.trace(r,kind,{operation,...(reason instanceof EmotionalError?{code:'request_rejected',httpStatus:reason.status,message:reason.message}:emotionalFailure(reason))},kind+':'+requestId,requestId);
  }
  private artifact(r:EmotionalRecord):EmotionalArtifact{if(!r.canonical||sha(r.canonical)!==r.seal)throw new EmotionalError(409,'This envelope could not be verified.');return JSON.parse(r.canonical) as EmotionalArtifact;}
  private sync(r:EmotionalRecord){if(r.state){const previous=r.state,s=syncEmotional(previous,this.now());if(s.revision!==previous.revision){this.store.transaction(()=>{r.state=s;r.updatedAt=this.now();this.store.save(r);for(const p of s.players){const before=previous.players.find(x=>x.id===p.id)!.decisions.length;for(const decision of p.decisions.slice(before))this.trace(r,'decision_timed_out',{...decision},'timeout:'+decision.actor+':'+decision.sequence);}});}}}
  snapshot(r:EmotionalRecord){
    this.sync(r);const cp=r.checkpoint;const progress=r.status==='queued'||r.status==='generating'?{done:cp.initialComplete.length+(cp.completedRepairKeys?.length??cp.repairsComplete.length)+cp.images.length,total:24+Math.max(0,(cp.completedRepairKeys?.length??cp.repairsComplete.length)-cp.repairsComplete.length)+Object.keys(cp.repairPlan??{}).length,label:!cp.world?'Creating the world':cp.images.length?'Illustrating your adventure':cp.repairPass?'Checking and refining the story':'Writing your adventure'}:null;
    return{id:r.id,generation:r.generation,createdAt:r.createdAt,revision:r.revision,serverNow:this.now(),status:r.status,messages:structuredClone(r.messages),profile:structuredClone(r.profile),seal:r.seal,progress,error:r.error,lastRequestId:r.lastRequestId,adventure:r.state?projectEmotional(this.artifact(r),r.state,r.state.players[0]!.id):null};
  }
  current(owner:string,id?:string){const r=id?this.store.owned(owner,id):this.store.current(owner);if(id&&!r)throw new EmotionalError(404,'Adventure not found.');return r?this.snapshot(r):null;}
  memories(owner:string){return this.store.memories(owner).map(r=>({id:r.id,title:this.artifact(r).world.title,createdAt:r.createdAt}));}
  private cached(owner:string,requestId:string,payload:unknown){const prior=this.store.request(owner,requestId);if(!prior)return null;if(prior.payloadHash!==sha(JSON.stringify(payload)))throw new EmotionalError(409,'This request ID belongs to another action.');if(prior.status!==200)throw new EmotionalError(prior.status,'This action was already rejected. Recover your current scene.');const r=this.store.owned(owner,prior.flowId);if(!r)throw new EmotionalError(404,'Adventure not found.');return r;}
  private active(owner:string,id:string){const r=this.store.owned(owner,id);if(!r)throw new EmotionalError(404,'Adventure not found.');if(this.store.current(owner)?.id!==id)throw new EmotionalError(409,'Recover the most recent adventure to continue.');return r;}
  private configured(){if(!this.available)throw new EmotionalError(503,'New adventures are temporarily unavailable. Your existing adventure is still saved.');}
  newConversation(owner:string,requestId:string){
    if(this.options?.prepared)return this.preparedConversation(owner,requestId);
    this.configured();const r=this.store.transaction(()=>{const cached=this.cached(owner,requestId,{kind:'new'});if(cached)return cached;const prior=this.store.current(owner);if(prior&&['queued','generating','ready','playing','chatting'].includes(prior.status))throw new EmotionalError(409,'Continue your current adventure before creating another.');const at=this.now(),counts=this.store.counts(owner,day(at));if(counts.conversations>=200||counts.ownerConversations>=10)throw new EmotionalError(429,'The conversation limit has been reached for today.');
      const flow:EmotionalRecord={id:randomUUID(),ownerHash:owner,generation:(prior?.generation??0)+1,createdAt:at,updatedAt:at,revision:0,status:'chat',confirmedAt:null,messages:[chatOpening()],profile:emptyProfile(),checkpoint:newGenerationCheckpoint(),canonical:null,seal:null,state:null,lastRequestId:requestId,error:null};this.store.insert(flow);this.store.cache(owner,requestId,sha(JSON.stringify({kind:'new'})),flow.id);this.trace(flow,'conversation_started');return flow;});return this.snapshot(r);
  }
  chat(owner:string,id:string,text:string,requestId:string,revision:number){
    if(this.options?.prepared)throw new EmotionalError(403,'This reviewed demo does not generate new content.');
    this.configured();const payload={kind:'chat',id,text,revision};const r=this.store.transaction(()=>{const cached=this.cached(owner,requestId,payload);if(cached)return cached;const flow=this.active(owner,id);if(flow.revision!==revision)throw new EmotionalError(409,'This conversation changed in another tab. Review the current message before continuing.');if(!['chat','proposal'].includes(flow.status))throw new EmotionalError(409,'Your last answer is still being prepared.');if(flow.messages.filter(m=>m.role==='user').length>=8)throw new EmotionalError(429,'The conversation limit has been reached.');flow.messages.push({role:'user',kind:'answer',content:text});flow.status='chatting';flow.error=null;flow.lastRequestId=requestId;flow.updatedAt=this.now();this.store.save(flow);this.store.cache(owner,requestId,sha(JSON.stringify(payload)),id);this.trace(flow,'chat_submitted',{messageIndex:flow.messages.length-1});return flow;});this.kick();return this.snapshot(r);
  }
  confirm(owner:string,id:string,requestId:string,revision:number){
    if(this.options?.prepared)throw new EmotionalError(403,'This reviewed demo is already sealed.');
    this.configured();const payload={kind:'confirm',id,revision};const r=this.store.transaction(()=>{const cached=this.cached(owner,requestId,payload);if(cached)return cached;const flow=this.active(owner,id);if(flow.revision!==revision)throw new EmotionalError(409,'This proposal changed in another tab. Review the current proposal before creating it.');if(flow.status!=='proposal')throw new EmotionalError(409,'Confirm the current story proposal first.');const at=this.now(),c=this.store.counts(owner,day(at));if(c.jobs>=this.limits.maxJobs||c.daily>=this.limits.dailyJobs||c.ownerDaily>=this.limits.ownerDailyJobs||this.store.chargedSince(day(at))>=this.limits.dailyEstimateUsd)throw new EmotionalError(429,'The adventure preparation limit has been reached. Try again tomorrow.');flow.status='queued';flow.confirmedAt=at;flow.updatedAt=at;flow.lastRequestId=requestId;flow.error=null;this.store.save(flow);this.store.cache(owner,requestId,sha(JSON.stringify(payload)),id);this.trace(flow,'preparation_confirmed',{profile:structuredClone(flow.profile)});return flow;});this.kick();return this.snapshot(r);
  }
  action(owner:string,input:{id:string;node:string;kind:EmotionalInput['kind'];choice?:'A'|'B';requestId:string}){
    const payload={kind:input.kind,id:input.id,node:input.node,choice:input.choice??null};
    const result=this.store.transaction(()=>{const flow=this.active(owner,input.id);this.sync(flow);const cached=this.cached(owner,input.requestId,payload);if(cached)return{flow:cached,ok:true};if(!flow.state||!['ready','playing'].includes(flow.status))throw new EmotionalError(409,'This adventure cannot be restarted or changed.');
      const actor=flow.state.players[0]!.id;
      const out=stepEmotional(this.artifact(flow),flow.state,{actor,node:input.node,kind:input.kind,choice:input.choice,requestId:input.requestId,at:this.now(),sequence:flow.state.lastSequence+1});flow.state=out.state;flow.updatedAt=this.now();if(out.ok){flow.lastRequestId=input.requestId;flow.status=flow.state.players[0]!.phase==='finished'?'finished':'playing';}this.store.cache(owner,input.requestId,sha(JSON.stringify(payload)),flow.id,out.ok?200:409);this.store.save(flow);this.trace(flow,out.ok?'action_accepted':'action_rejected',{operation:input.kind,actor,node:input.node,choice:input.choice??null,at:flow.updatedAt,sequence:flow.state.lastSequence,resultingNode:flow.state.players[0]!.node,phase:flow.state.players[0]!.phase,...(!out.ok?{code:'moment_changed'}:{})},(out.ok?'action_accepted:':'action_rejected:')+input.requestId,input.requestId);return{flow,ok:out.ok};});
    if(!result.ok)throw new EmotionalError(409,'The decision has passed. Recover the consequence already saved for you.');return this.snapshot(result.flow);
  }
  reveal(owner:string,id:string){const r=this.store.owned(owner,id);if(!r)throw new EmotionalError(404,'Adventure not found.');this.sync(r);if(r.status!=='finished')throw new EmotionalError(403,'The envelope stays sealed until this adventure ends.');this.artifact(r);return{canonical:r.canonical!,hash:r.seal!,decisions:r.state!.players[0]!.decisions};}
  art(owner:string,id:string,asset:string){const r=this.store.owned(owner,id);if(!r||!['ready','playing','finished'].includes(r.status))throw new EmotionalError(404,'Illustration not found.');const prepared=this.options?.prepared?.images.find(image=>image.ref.id===asset);const image=prepared?{...prepared.ref,bytes:prepared.bytes}:this.store.art(id,asset);if(!image)throw new EmotionalError(404,'Illustration not found.');if(createHash('sha256').update(image.bytes).digest('hex')!==image.sha256)throw new EmotionalError(409,'Illustration could not be verified.');return image;}
  private hooks(r:EmotionalRecord):MetaOptions{return{apiKey:this.options!.apiKey,fetch:this.options?.fetch,signal:this.abort.signal,onStart:(spec:MetaRequest|ImageRequest,reservation:number)=>{this.store.transaction(()=>{if(this.store.calls(r.id).some(c=>c.key===spec.key))throw new EmotionalError(409,'A prior provider call cannot be replayed.');if(this.store.chargedSince(day(this.now()))+reservation>this.limits.dailyEstimateUsd)throw new EmotionalError(429,'The preparation allowance has been reached.');this.store.startCall(r.id,this.now(),spec,reservation);this.trace(r,'provider_started',{callKey:spec.key,model:spec.model,reservedCostUsd:reservation},'provider_started:'+spec.key);});},onFinish:(receipt,raw)=>{this.store.transaction(()=>{this.store.finishCall(r.id,receipt,raw);this.trace(r,'provider_finished',{callKey:receipt.key,model:receipt.model,outcome:receipt.status,latencyMs:receipt.latencyMs,inputTokens:receipt.inputTokens,outputTokens:receipt.outputTokens,estimatedCostUsd:receipt.estimatedCostUsd,...(receipt.issue?{message:receipt.issue}:{})},'provider_finished:'+receipt.key);});}};}
  private preparedConversation(owner:string,requestId:string){
    const prepared=this.options!.prepared!;
    const flow=this.store.transaction(()=>{
      const cached=this.cached(owner,requestId,{kind:'prepared'});if(cached)return cached;
      const prior=this.store.current(owner);if(prior&&['ready','playing'].includes(prior.status))throw new EmotionalError(409,'Continue your current demo before replaying it.');
      const counts=this.store.counts(owner,day(this.now()));
      if(counts.conversations>=this.preparedLimits.total||counts.ownerConversations>=this.preparedLimits.perOwner)throw new EmotionalError(429,'The demo capacity has been reached. Your existing runs remain saved and can still be continued or reread.');
      const at=this.now(),artifact=JSON.parse(prepared.canonical)as EmotionalArtifact;
      const record:EmotionalRecord={id:randomUUID(),ownerHash:owner,generation:(prior?.generation??0)+1,createdAt:at,updatedAt:at,revision:0,status:'ready',confirmedAt:null,messages:[],profile:emptyProfile(),checkpoint:{...newGenerationCheckpoint(),world:artifact.world,blocks:artifact.blocks,initialComplete:Object.keys(artifact.blocks)},canonical:prepared.canonical,seal:prepared.seal,state:createEmotionalState(at,artifact.players),lastRequestId:requestId,error:null};
      this.store.insert(record);this.store.cache(owner,requestId,sha(JSON.stringify({kind:'prepared'})),record.id);
      this.trace(record,'adventure_sealed',{seal:prepared.seal,source:'reviewed-pre-generated',newContent:false});return record;
    });return this.snapshot(flow);
  }
  private kick(){if(this.options?.prepared||this.running||this.stopped||!this.available)return;this.running=Promise.resolve().then(()=>this.drain()).finally(()=>{this.running=null;});}
  private async drain(){while(!this.stopped){const r=this.store.unfinished()[0];if(!r)return;try{
      if(r.status==='chatting'){
        const reply=await nextEmotionalChat(r.messages,{...this.hooks(r),key:'chat:'+r.lastRequestId,previousProfile:r.profile});if(this.stopped)return;this.store.transaction(()=>{r.messages.push({role:'assistant',kind:reply.kind,content:reply.message});r.profile=reply.profile;r.status=reply.kind==='proposal'?'proposal':'chat';r.error=null;r.updatedAt=this.now();this.store.save(r);this.trace(r,'chat_accepted',{kind:reply.kind,messageIndex:r.messages.length-1,profile:structuredClone(reply.profile),evidence:reply.evidence});});
      }else{
        this.store.transaction(()=>{r.status='generating';this.store.save(r);this.trace(r,'generation_started',{completedBlocks:r.checkpoint.initialComplete.length});});const result=await generateEmotional(r.profile,{...this.hooks(r),checkpoint:r.checkpoint,withArt:true,onCheckpoint:cp=>{r.checkpoint=cp;r.updatedAt=this.now();this.store.save(r);},onValidation:report=>{this.trace(r,'validation_completed',report,'validation:'+report.pass);},onRepair:blocks=>{this.trace(r,'repair_planned',{blocks,...(r.checkpoint.repairPass===2?{pass:2}:{})},r.checkpoint.repairPass===2?'repair_planned:2':'repair_planned');}});if(this.stopped)return;
        this.store.transaction(()=>{for(const image of result.checkpoint.images)this.store.storeArt(r.id,image.ref,Buffer.from(image.base64,'base64'));r.checkpoint=result.checkpoint;r.canonical=result.canonical;r.seal=result.hash;r.state=createEmotionalState(this.now(),result.artifact.players);r.status='ready';r.updatedAt=this.now();r.error=null;this.store.save(r);this.trace(r,'adventure_sealed',{seal:r.seal,wordRange:result.validation.wordRange,routeCount:result.validation.routes.length,images:result.checkpoint.images.length});});
      }
    }catch(reason){if(this.stopped)return;this.store.transaction(()=>{r.status=r.confirmedAt===null?'chat':'failed';r.error=r.confirmedAt===null?'chat_response_rejected':'generation_failed';r.updatedAt=this.now();this.store.save(r);this.trace(r,'operation_failed',reason instanceof EmotionalError?{stage:'runtime',code:'operation_blocked',httpStatus:reason.status,message:reason.message}:emotionalFailure(reason));});}
  }}
  async close(){this.stopped=true;this.abort.abort();await this.running;this.store.close();}
}
