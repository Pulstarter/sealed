import type {EmotionalArtifact} from '../../../packages/engine/src/emotional-types.js';
import {emotionalBlockIds,emotionalRoutes,emotionalEnding} from '../../../packages/engine/src/emotional.js';
import {narrativeWords,narrativeBudget} from './emotional-reliability.js';

const blocks=(r:string)=>['S1','D1'+r[0],'S2','D2'+r[1],'ARR'+r[0],'S3','D3'+r[2],emotionalEnding(r)];

/** Plan one repair against the actual text that will remain on every route. */
export function measuredLengthRepairTargets(a:EmotionalArtifact,requested:Iterable<string>){
 const shortEnd=(id:string)=>(a.world.endingPolicy==='outcome-reactions-1'||a.world.endingPolicy==='outcome-reactions-2')&&/^F[1-6]$/u.test(id);
 const selected=new Set(requested),measured=Object.fromEntries(emotionalBlockIds.map(id=>[id,narrativeWords(a.blocks[id]?.text??'')]));
 let weights=measured;
 const paths=()=>emotionalRoutes.map(route=>blocks(route).reduce((p,id)=>{
  p.fixed+=narrativeWords(a.factualText?.[route]?.[id]??'');
  if(selected.has(id)&&shortEnd(id))p.fixed+=80;else if(selected.has(id))p.changing+=weights[id]!;else p.fixed+=measured[id]!;
  return p;
 },{fixed:0,changing:0}));
 const bounds=(routes:ReturnType<typeof paths>)=>({low:Math.max(0,...routes.map(p=>(2110-p.fixed)/Math.max(1,p.changing))),high:Math.min(...routes.map(p=>(2290-p.fixed)/Math.max(1,p.changing)))});
 let routes=paths(),interval=bounds(routes);
 // Expand only inside this same repair pass when the remaining text prevents
 // the requested margin. Never trim received prose or start another repair.
 if(interval.low>interval.high||interval.high<=0||routes.some(p=>!p.changing)){
  for(const id of emotionalBlockIds)selected.add(id);
  // Equal structural weights across alternative blocks remove the excessive
  // spread of a single outlier rather than shrinking every good route with it.
  weights=Object.fromEntries(emotionalBlockIds.map(id=>[id,narrativeBudget(a.world,id).target]));
  routes=paths();interval=bounds(routes);
 }
 const center=(factor:number)=>{const totals=routes.map(p=>p.fixed+p.changing*factor);return(Math.min(...totals)+Math.max(...totals))/2;};
 let low=0,high=1;while(center(high)<2200&&high<64)high*=2;
 for(let n=0;n<50;n++){const mid=(low+high)/2;if(center(mid)<2200)low=mid;else high=mid;}
 const ideal=(low+high)/2,factor=interval.low<=interval.high&&interval.high>0?Math.max(interval.low,Math.min(interval.high,ideal)):ideal;
 return Object.fromEntries([...selected].map(id=>[id,shortEnd(id)?80:Math.max(1,Math.round(weights[id]!*factor))]));
}

export function repairRawTarget(rawTarget:number,observedRatio:number,paragraphs:number,originalCount:number,voices?:readonly string[]){
 const target=paragraphs===originalCount?Math.round(rawTarget/Math.max(.65,Math.min(1.35,observedRatio))):Math.round(rawTarget);
 return Math.min(target,voices&&paragraphs!==originalCount?voices.reduce((sum,voice)=>sum+(voice==='NARRATOR>NONE'?45:35),0):Infinity);
}
