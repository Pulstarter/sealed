import type {EmotionalFlowSnapshot} from '../../../../packages/engine/src/emotional-types.js';

/** A saved preparation remains available, without presenting an old failure
 * as a new attempt. Pending operations must recover their actual result. */
export function showEmotionalRecoveryHome(flow:EmotionalFlowSnapshot|null,pending:boolean,memoryId:string){
 return !pending&&!memoryId&&!!flow&&(flow.status==='failed'||flow.status==='chat'&&!!flow.error);
}
/** Presentation only: never rewrite the preference or its grounding evidence. */
export function emotionalProposalSummary(experience:string){
 const text=experience.trim().replace(/^(?:I would like|I[’']d like|I want|I[’']m looking for)\s+/iu,'').replace(/[.!]+$/u,'');
 if(!text)return 'A short, illustrated mystery with a small human connection.';
 return /^(?:a|an)\s/iu.test(text)?'We’ll prepare '+text[0]!.toLowerCase()+text.slice(1)+'.':'Your adventure: '+text+'.';
}

/** Compact labels only. The original preference and its evidence stay intact. */
export function boundaryLabel(value:string){
  const text=value.trim().replace(/^(?:nothing|no|without|avoid|leave out)\s+/iu,'').replace(/,?\s+please[.!]?$/iu,'').replace(/[.!]$/u,'').trim();
  if(!text)return value;
  return /^violent$/iu.test(text)?'Violence':text[0]!.toUpperCase()+text.slice(1);
}
export function typographicQuotes(text:string){return text.replace(/"([^"\n]+)"/gu,'“$1”').replace(/(^|[\s([—])'([^'\n]+)'(?=[\s.,!?;:)\]]|$)/gu,'$1‘$2’');}

export function acceptEmotionalSnapshot(prior:EmotionalFlowSnapshot|null,next:EmotionalFlowSnapshot){
  if(!prior)return true;if(prior.id!==next.id)return next.generation>prior.generation;
  return next.revision>=prior.revision&&next.serverNow>=prior.serverNow;
}
export async function verifyEmotionalSeal(canonical:string,hash:string){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical));const computed=[...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');return computed===hash;
}
const wordCount=(paragraphs:string[])=>paragraphs.reduce((n,p)=>n+(p.trim().match(/\S+/g)?.length??0),0);
/** Only layout changes. Paragraph bytes and their order remain untouched. */
export function paginateEmotionalScene(paragraphs:string[],fits:(paragraphs:string[])=>boolean=p=>wordCount(p)<=120):string[][]{
  const source=paragraphs.filter(p=>p.trim()),pages:string[][]=[];let page:string[]=[];
  for(let i=0;i<source.length;i++){
    const unit=[source[i]!],next=source[i+1];
    if(next&&/^[\s]*[“"«—–]/u.test(next)&&(wordCount(unit)<=20||fits([...unit,next]))){unit.push(next);i++;}
    if(page.length&&!fits([...page,...unit])){pages.push(page);page=[];}
    // A single oversized paragraph/attribution stays whole and can scroll
    // locally. Never omit words to make a viewport appear to fit.
    page.push(...unit);
  }
  if(page.length)pages.push(page);return pages;
}
export function readingOffset(pages:string[][],page:number){return wordCount(pages.slice(0,Math.max(0,Math.trunc(page))).flat());}
export function pageAtOffset(pages:string[][],offset:number){
  const target=Number.isFinite(offset)?Math.max(0,Math.trunc(offset)):0;let end=0;
  for(let i=0;i<pages.length;i++){end+=wordCount(pages[i]!);if(target<end)return i;}
  return Math.max(0,pages.length-1);
}

/** Read exclusively from the record returned by the finished-only reveal endpoint. */
export function emotionalEnvelopeTruth(canonical:string|undefined):{anchor:string;truth:string}|null{
 if(!canonical)return null;
 try{const a=JSON.parse(canonical);const s=a?.world?.story;return a.version==='emotional-2'&&typeof s?.anchor==='string'&&typeof s?.sealed_truth==='string'?{anchor:s.anchor,truth:s.sealed_truth}:null;}catch{return null;}
}
