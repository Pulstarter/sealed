import { createPreparedWorld } from './nieve.js';
import { referenceRoute } from './nieve.js';
import { advance, canonicalizeWorld, createState, step, validateWorld } from './index.js';
import type { Role, WorldDefinition } from './types.js';
export interface CaseDraft { title:string; reserve:string; motive:string; coverStory:string; recipient:string; documentTitle:string; cargoCode:string; commandCode:string }
export interface CaseConfig { role:Role; tone:'tension'|'melancholy'; detail:string }
const bounds:Record<keyof CaseDraft,number>={title:80,reserve:90,motive:180,coverStory:160,recipient:60,documentTitle:80,cargoCode:3,commandCode:2};
const forbidden=/\b(war|warfare|politics|political|guerra|pol[ií]tica|military)\b/i;
export const caseSchema={type:'object',additionalProperties:false,required:Object.keys(bounds),properties:Object.fromEntries(
  Object.entries(bounds).map(([key,maxLength])=>[key,{type:'string',minLength:2,maxLength}]))};

export function parseCaseDraft(value:unknown):CaseDraft {
  if(!value||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype)throw new Error('Case must be a plain object.');
  if(Object.keys(value).some(key=>!Object.hasOwn(bounds,key)))throw new Error('Unexpected case fields.');
  const result={} as CaseDraft;
  for(const key of Object.keys(bounds) as (keyof CaseDraft)[]){
    const item=(value as Record<string,unknown>)[key];
    if(typeof item!=='string'||item.trim().length<2||item.length>bounds[key]||/[\x00-\x1f<>]|https?:\/\//i.test(item)||forbidden.test(item))throw new Error(`Invalid case field: ${key}.`);
    result[key]=item.trim();
  }
  if(!/^C[2-9][0-9]$/.test(result.cargoCode)||!/^R[1-9]$/.test(result.commandCode))throw new Error('Invalid cargo or command code.');
  for(const key of Object.keys(bounds) as (keyof CaseDraft)[]){
    if(key==='cargoCode'||key==='commandCode')continue;
    if(/\b\d{1,2}:\d{2}\b/.test(result[key]))throw new Error('Case prose cannot change the schedule.');
    const codes=result[key].match(/\b[CR]\d+\b/gi)??[];
    if(codes.some(code=>code.toUpperCase()!==result.cargoCode&&code.toUpperCase()!==result.commandCode))throw new Error('Inconsistent case code.');
  }
  const title=result.title.toLowerCase();
  if(/\b(Vera|Bruno|Ada|Leo)\b/i.test(result.title)||title.includes(result.cargoCode.toLowerCase())||title.includes(result.commandCode.toLowerCase()))throw new Error('Public title contains a hidden case reference.');
  if([result.reserve,result.motive,result.coverStory,result.recipient,result.documentTitle].some(secret=>result.title.toLowerCase().includes(secret.toLowerCase())))throw new Error('Public title contains hidden case content.');
  return result;
}

export function buildCaseWorld(input:CaseDraft,config:CaseConfig):WorldDefinition {
  const draft=parseCaseDraft(input);
  const replace=(value:unknown):unknown=>{
    if(typeof value==='string')return value.replace(/\bC17\b/g,draft.cargoCode).replace(/\bR7\b/g,draft.commandCode);
    if(Array.isArray(value))return value.map(replace);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,replace(item)]));
    return value;
  };
  const world=replace(createPreparedWorld(config.role)) as WorldDefinition;
  world.id=`nieve-meta-${draft.cargoCode}-${draft.commandCode}`;world.origin='meta';world.title=draft.title;
  world.seed='sealed-case-template-1';world.config={...config};
  const admission=`Vera orders Bruno to divert money from ${draft.reserve} to ${draft.recipient}, ${draft.motive}. The cover story is ${draft.coverStory}.`;
  const document=`The document "${draft.documentTitle}", signed by Vera, sends money from ${draft.reserve} to ${draft.recipient} under the cover of ${draft.coverStory}.`;
  const fact=(id:string,text:string)=>{world.facts.find(item=>item.id===id)!.text=text;};
  const action=(id:string,text:string)=>{world.actions.find(item=>item.id===id)!.text=text;};
  fact('saw_coercion',`You personally heard this: ${admission}`);
  fact('photo_seen',`You saw Ada photograph this: ${document}`);
  fact('plan_statement',`Bruno signed a statement confirming: ${admission}`);
  fact('plan_photo',`Ada supplied a photograph: ${document}`);
  action('witness_coercion',`You hear the conversation in full. ${admission}`);
  action('statement',`Bruno signs your record of the conversation. ${admission}`);
  action('witness_photo',`You watch Ada photograph the order. ${document}`);
  action('copy_photo',`Ada gives you a copy. ${document}`);
  world.scheduledEvents.find(event=>event.id==='welcome')!.text='Generated mystery. Departure is at 22:00; investigate and keep the lodge money safe.';
  world.closure!.truth+=` The money came from ${draft.reserve}. Vera's motive was ${draft.motive}. The intended recipient was ${draft.recipient}; the cover story was ${draft.coverStory}. The signed document was titled "${draft.documentTitle}".`;
  return world;
}

export function certifyCaseWorld(world:WorldDefinition) {
  const errors=validateWorld(world);if(errors.length)throw new Error(`World validation failed: ${errors.join(' ')}`);
  const bytes=canonicalizeWorld(world);const actor=world.players[0]!.id;
  function run(route:readonly(string|number)[]){
    let state=createState(world),waiting=0;
    for(const item of route){
      if(typeof item==='number'){if(item<state.now)throw new Error('Case route misses its schedule.');waiting+=item-state.now;state=advance(world,state,item);}
      else {const out=step(world,state,{actor,actionId:item,submittedAtGame:state.now,serverSequence:state.lastSequence+1,requestId:`certify-${state.lastSequence+1}`,confirmed:true});
        if(!out.ok)throw new Error(`Case route failed at ${item}.`);state=out.state;
        const busy=state.players[actor]!.busy;if(busy)state=advance(world,state,busy.endsAt);}
    }
    if(!state.finished||state.results[actor]!=='success')throw new Error('Case route does not succeed.');
    return waiting/world.window.durationMs;
  }
  for(const technical of ['relay','radio'])for(const plan of ['statement','photo'])run([
    ...(technical==='relay'?['move:generator']:[]),1_200_000,technical==='relay'?'observe_relay':'observe_radio',
    ...(technical==='relay'?['move:reception']:[]),'move:lounge','materials',
    ...(plan==='statement'?['move:kitchen']:['move:reception','move:office']),2_100_000,
    ...(plan==='statement'?['witness_coercion','statement','move:lounge','move:reception']:['witness_photo','copy_photo','move:reception']),
    2_640_000,'manifest','correlate','brief_leo',3_000_000,'inspect_case','seal_case','check_seal','custody',3_600_000]);
  const referenceWaitingRatio=run(referenceRoute);
  if(referenceWaitingRatio>=0.2)throw new Error('Case route spends too much time waiting.');
  const inactive=advance(world,createState(world),world.window.durationMs);
  if(inactive.results[actor]!=='failure')throw new Error('Inaction must fail.');
  if(canonicalizeWorld(world)!==bytes)throw new Error('Case changed during validation.');
  return {successRoutes:4,inaction:'failure' as const,referenceWaitingRatio};
}
