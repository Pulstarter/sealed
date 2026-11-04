import{createHash}from'node:crypto';
import{emotionalBlockIds}from'../../../packages/engine/src/emotional.js';
import type{GenerationCheckpoint}from'./emotional-generation.js';
import{authoringParagraphCount,authoringRepairIndices,authoringVoice}from'./emotional-scene-authoring.js';
import{outcomeVoice}from'./emotional-ending.js';
import{redactRepairText}from'./emotional-3c.js';
import type{MetaRequest}from'./emotional-meta.js';
export interface DirectedThirdRepair{sourceSha256:string;issues:Record<string,string[]>}

/** Trusted operator option only: never accepted from the player API or inferred from a failed check. */
export function prepareDirectedThirdRepair(cp:GenerationCheckpoint,request?:DirectedThirdRepair){
 if(cp.directedThirdRepair&&cp.repairPass!==3)throw Error('Directed third repair marker is only valid in its own pass.');
 if(request){
  if(cp.revision!=='3c-54'||cp.world?.endingPolicy!=='outcome-reactions-2'||cp.repairPass!==2||Object.keys(cp.repairPlan??{}).some(id=>!cp.repairsComplete.includes(id))||emotionalBlockIds.some(id=>!cp.initialComplete.includes(id)||!cp.blocks[id]))throw Error('Directed third repair requires a complete revision54 manuscript after two passes.');
  if(createHash('sha256').update(JSON.stringify(cp)).digest('hex')!==request.sourceSha256)throw Error('Directed third repair source does not match its preserved checkpoint.');
  const selected=new Set(Object.keys(request.issues));if(!selected.size||[...selected].some(id=>!emotionalBlockIds.includes(id as any)||!request.issues[id]?.length))throw Error('Directed third repair requires explicit known blocks and feedback.');
  if(selected.has('S1')){selected.add('S2');selected.add('ARRA');selected.add('ARRB');}
  if(selected.has('S2')){selected.add('ARRA');selected.add('D2A');selected.add('D2B');}
  const plan:NonNullable<GenerationCheckpoint['repairPlan']>={};
  for(const id of emotionalBlockIds){if(!selected.has(id))continue;const parts=cp.blocks[id]!.passages!;if(!parts?.length)throw Error('Directed third repair requires bound passages.');
   const indices=/^F/u.test(id)?Array.from({length:parts.length},(_,i)=>i+1):authoringRepairIndices(id,parts.length,authoringParagraphCount(id),true,true,authoringParagraphCount(id));
   if(indices.length!==parts.length||parts.some((p,i)=>(/^F/u.test(id)?outcomeVoice(id,indices[i]!):authoringVoice(id,indices[i]!))!==p.speaker+'>'+p.addressee))throw Error('Directed third repair cannot change an existing voice plan.');
   plan[id]={paragraphs:parts.length,beatIndices:indices,targetWords:parts.reduce((n,p)=>n+(p.text.match(/[\p{L}\p{N}]+/gu)?.length??0),0),feedback:request.issues[id]??['Continue the newly repaired earlier public exchange. Preserve all established concessions and speaker ownership; add no previous objection, agreement or material event.']};
  }
  cp.directedThirdRepair={sourceSha256:request.sourceSha256,blocks:Object.keys(plan)};cp.repairPlan=plan;cp.repairsComplete=[];cp.repairPass=3;
 }
 if(cp.repairPass===3){
  const marker=cp.directedThirdRepair;if(cp.revision!=='3c-54'||!marker||!marker.blocks.length||marker.blocks.some(id=>!emotionalBlockIds.includes(id as any))||!/^[a-f0-9]{64}$/u.test(marker.sourceSha256)||JSON.stringify(marker.blocks)!==JSON.stringify(Object.keys(cp.repairPlan??{})))throw Error('Directed third repair checkpoint has no matching authorization plan.');
  if(marker.startedKeys?.some(key=>!cp.completedRepairKeys?.includes(key)))throw Error('Directed third repair start was not committed with a response; no automatic paid retry.');
  for(const receipt of cp.receipts)if(receipt.key.startsWith('repair3:')&&!cp.completedRepairKeys?.includes(receipt.key))throw Error('Directed third repair response was not committed; no automatic paid retry.');
 }
}

/** Public dialogue is source data, not proof of who is present or who heard it. */
export function directedRepairRequest(cp:GenerationCheckpoint,id:string,spec:MetaRequest):MetaRequest{
 if(cp.revision!=='3c-54'||!cp.directedThirdRepair&&cp.authoringPolicy!=='grounded-continuity-3')return spec;
 const p=spec.payload as Record<string,any>,w=cp.world!;
 if(p.reaction_contract){p.instruction+=' Public visibility concerns the physical drawing and other people interpretations only. Do not claim it discloses anyone private thoughts.';return spec;}
 if(cp.directedThirdRepair)p.editorial_constraints=(cp.repairPlan?.[id]?.feedback??[]).map(text=>redactRepairText(text,w,false));
 p.instruction+=' In every bound utterance use I/me/my for its speaker; never refer to the speaker as their own name or as a separate third person. Preserve the direction and meaning of the supplied admission exactly, but do not repeat its already compiled quotation. No unprovided prior objections, agreements or corrections. Acknowledged misunderstandings stay acknowledged.';
 const c=p.projection.context;
 if(id==='S2')c.admission_boundary='The supplied creator_concession is already spoken in the engine text. Develop its consequence without quoting it again, reversing its subject, or inventing any further agreement. Only concessions actually stated in earlier_public_dialogue exist.';
 if(id==='D2A'||id==='D2B'||id==='ARRA')c.earlier_public_dialogue=[...(c.earlier_public_dialogue??[]),...(cp.blocks.S2?.passages??[]).filter(x=>x.speaker!=='NARRATOR').map(x=>({speaker:x.speaker,addressee:x.addressee,text:redactRepairText(x.text,w,false)}))];
 if(c.earlier_public_dialogue)c.transcript_boundary='These are previously spoken public words. They establish only their explicit content, not a new objection or an inferred agreement. No quoted person joins this scene unless the projection allows them. Do not reset an already corrected first impression.';
 return spec;
}
