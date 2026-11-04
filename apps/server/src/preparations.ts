import { createHash,randomUUID } from 'node:crypto';
import { canonicalizeWorld,createState } from '../../../packages/engine/src/index.js';
import { certifyCaseWorld } from '../../../packages/engine/src/case-template.js';
import type { JourneyConfig,PreparationSnapshot,WorldDefinition } from '../../../packages/engine/src/types.js';
import { generateMetaCase,META_MODEL } from './meta-generation.js';
import { Store,type PreparationRecord } from './store.js';

export interface GenerationOptions {apiKey:string;fetch?:typeof fetch;maxJobs?:number;dailyJobs?:number;ownerDailyJobs?:number}
export class PreparationError extends Error {constructor(readonly status:number,message:string){super(message);}}
export const publicPreparation=(p:PreparationRecord):PreparationSnapshot=>({id:p.id,requestId:p.requestId,status:p.status,config:p.config,model:META_MODEL,...(p.sessionId?{sessionId:p.sessionId}:{}),...(p.errorCode?{errorCode:p.errorCode}:{})});
const active=(p:PreparationRecord)=>!['ready','failed'].includes(p.status);

// One queue in the authoritative Node service. No transaction spans a provider request.
export class Preparations {
  private running:Promise<void>|null=null;
  private stopped=false;
  private abort=new AbortController();
  readonly available:boolean;
  private limits:{maxJobs:number;dailyJobs:number;ownerDailyJobs:number};
  constructor(private store:Store,private now:()=>number,private options?:GenerationOptions){
    this.limits={maxJobs:options?.maxJobs??100,dailyJobs:options?.dailyJobs??20,ownerDailyJobs:options?.ownerDailyJobs??3};
    if(Object.values(this.limits).some(n=>!Number.isSafeInteger(n)||n<1))throw new Error('Invalid generation limits.');
    this.available=!!options?.apiKey.trim()&&!/[\r\n]/.test(options.apiKey);
    this.store.transaction(()=>{for(const p of store.unfinishedPreparations()){
      if(p.status!=='queued'&&!p.canonical){p.status='failed';p.errorCode='interrupted';store.savePreparation(p);}
    }});
    this.kick();
  }
  current(ownerHash:string):PreparationRecord|null{return this.store.ownerPreparations(ownerHash)[0]??null;}
  hasActive(ownerHash:string):boolean{return this.store.ownerPreparations(ownerHash).some(active);}
  enqueue(ownerHash:string,requestId:string,config:JourneyConfig,tokenHash:(id:string)=>string,hasPlaying:boolean):PreparationRecord {
    const payloadHash=createHash('sha256').update(JSON.stringify(config)).digest('hex');
    const p=this.store.transaction(()=>{
      const existing=this.store.ownerPreparations(ownerHash).find(p=>p.requestId===requestId);
      if(existing){if(existing.payloadHash!==payloadHash)throw new PreparationError(409,'This preparation ID already belongs to different settings.');return existing;}
      if(hasPlaying)throw new PreparationError(409,'Finish your current journey before preparing another.');
      if(this.hasActive(ownerHash))throw new PreparationError(409,'Your envelope is already being prepared. Recover it instead of starting another.');
      if(!this.available)throw new PreparationError(503,'Meta preparation is unavailable. You can choose the prepared reference.');
      const now=this.now();const counts=this.store.preparationCounts(ownerHash,Math.floor(now/86_400_000)*86_400_000);
      if(counts.total>=this.limits.maxJobs||counts.daily>=this.limits.dailyJobs||counts.ownerDaily>=this.limits.ownerDailyJobs)throw new PreparationError(429,'The demo preparation limit has been reached. You can choose the prepared reference.');
      const id=randomUUID();const job:PreparationRecord={id,ownerHash,tokenHash:tokenHash(id),requestId,payloadHash,config,status:'queued',createdAt:now,attempts:[],canonical:null,hash:null,sessionId:null,errorCode:null};
      this.store.insertPreparation(job);return job;
    });
    this.kick();return p;
  }
  private kick(){if(this.running||this.stopped)return;this.running=Promise.resolve().then(()=>this.drain()).finally(()=>{this.running=null;});}
  private async drain(){
    while(!this.stopped){
      const p=this.store.unfinishedPreparations().find(p=>p.status==='queued'||p.canonical);
      if(!p)return;
      try{
        if(!p.canonical){
          if(!this.available){p.status='failed';p.errorCode='unavailable';this.store.savePreparation(p);continue;}
          p.status='generating';this.store.savePreparation(p);
          const result=await generateMetaCase(p.config,{apiKey:this.options!.apiKey,fetch:this.options?.fetch,signal:this.abort.signal,onAttempt:attempt=>{
            if(this.stopped)return;
            p.attempts.push({...attempt});p.status=attempt.accepted?'validating':attempt.issue?.startsWith('Invalid')||attempt.issue?.startsWith('Case')?'repairing':'generating';
            this.store.savePreparation(p);
          }});
          if(this.stopped)return;
          p.canonical=result.canonical;p.hash=result.hash;p.status='validating';this.store.savePreparation(p);
        }
        if(this.stopped)return;
        const world=JSON.parse(p.canonical) as WorldDefinition;
        if(world.origin!=='meta'||world.config?.role!==p.config.role||world.config.tone!==p.config.tone||world.config.detail!==p.config.detail||canonicalizeWorld(world)!==p.canonical||createHash('sha256').update(p.canonical).digest('hex')!==p.hash)throw new Error('Invalid generation checkpoint.');
        certifyCaseWorld(world);
        this.store.transaction(()=>{
          const at=this.now();const sessionId=randomUUID();
          this.store.insert({id:sessionId,tokenHash:p.tokenHash,world,canonical:p.canonical!,hash:p.hash!,state:createState(world),phase:'sealed',paused:true,anchorReal:at,presenceUntil:at,sequence:0});
          p.sessionId=sessionId;p.status='ready';p.canonical=null;p.hash=null;this.store.savePreparation(p);
        });
      }catch{
        if(this.stopped)return;
        p.status='failed';p.errorCode='generation_failed';p.canonical=null;p.hash=null;this.store.savePreparation(p);
      }
    }
  }
  async close(){this.stopped=true;this.abort.abort();await this.running;}
}
