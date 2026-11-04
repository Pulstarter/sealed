import{emotionalScopes}from'../../../packages/engine/src/emotional.js';
import type{EmotionalWorld,EmotionalBlock}from'../../../packages/engine/src/emotional-types.js';
import type{MetaRequest}from'./emotional-meta.js';
import{flatParagraphPlan}from'./emotional-wire.js';
import{dramaticWriterInstruction}from'./emotional-dramaturgy.js';
import{firstNameIsUnambiguous}from'./emotional-identities.js';
import{redactRepairText}from'./emotional-3c.js';

function referenceRepairFields(w:EmotionalWorld,block:EmotionalBlock){
 const fields=(block.passages??[]).flatMap((passage,index)=>['lead','text','tail'].flatMap(part=>{
  const source=passage[part as 'lead'|'text'|'tail'];
  return source?[{source,source_field:'p'+String(index+1).padStart(2,'0')+'_'+part,speaker:passage.speaker,addressee:passage.addressee}]:[];
 }));
 const spans:{start:number;end:number}[]=[];let joined='';
 for(const field of fields){const start=joined.length;joined+=field.source;spans.push({start,end:joined.length});joined+='\n\n';}
 const withheld=new Set<number>();
 for(const secret of[w.private_reason,w.story?.sealed_truth]){
  if(!secret?.trim())continue;
  const literal=secret.trim().split(/\s+/u).map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s+');
  for(const match of joined.matchAll(new RegExp(literal,'giu'))){
   const crossed=spans.flatMap((span,index)=>span.start<match.index+match[0].length&&span.end>match.index?[index]:[]);
   // Individual redaction handles a secret wholly in one field. A secret
   // crossing fields must withhold every intersecting field, including halves
   // that would otherwise look harmless when inspected independently.
   if(crossed.length>1)for(const index of crossed)withheld.add(index);
  }
 }
 return fields.flatMap(({source,source_field,speaker,addressee},index)=>{
  if(withheld.has(index))return[];
  // A rejected paragraph is evidence, never permission to leak the sealed truth.
  const source_text=redactRepairText(source,w,false);
  const disallowed_words=[...source_text.matchAll(/\b(?:he|she|him|his|her|hers|himself|herself)\b/giu)].map(match=>({word:match[0],offset:match.index}));
  return disallowed_words.length?[{source_field,source_text,speaker,addressee,disallowed_words}]:[];
 });
}

export function resolveSceneRequest(w:EmotionalWorld|undefined,spec:MetaRequest,revision?:string,previousBlock?:EmotionalBlock):MetaRequest{
 if(revision!=='3c-54')return spec;
 const p=spec.payload as Record<string,any>;
 if(p.task==='world'){
  p.admission_contract={...p.admission_contract,player_has_no_public_wish:true,own_voice:'HOST admits a limit of their OWN preference to PLAYER. Use I/my/me, never you/your/we/our or another person words. PLAYER is not RECIPIENT and owns neither public wish.'};
  p.instruction+=' The scene_two admission is spoken by HOST to PLAYER, NOT to RECIPIENT. It must express HOST own present limitation using I/my/me, without you/your/we/our: never assign quiet, publicity or gratitude wishes to PLAYER. The visual subject is an environmental topic only; do not call it empty, deserted or unoccupied when figures is one or two.';
  return spec;
 }
 if(!w)return spec;
 // Main scenes discuss both public wish owners, including the absent recipient
 // in S2. Shared reactions must keep their existing anonymous camera instead.
 const visibleIdentities=new Set(p.block==='S1'||p.block==='S2'?['PLAYER','HOST','RECIPIENT']:['PLAYER',...(p.projection?.allowed_named_current_actors??[]),...Object.values(p.paragraph_plan??{}).flatMap(voice=>String(voice).split('>'))]);
 p.known_identity_pronouns=Object.fromEntries([['PLAYER',w.player_name],['HOST',w.host.name],['RECIPIENT',w.recipient.name]].filter(([role])=>visibleIdentities.has(role)).map(([role,name])=>[role,{name,pronouns:'they/them/their/theirs/themself'}]));
 p.identity_reference_boundary='These are known identities, not current attendance. Every reference uses the supplied name or singular they/them/their/theirs/themself, even when that person is absent or only mentioned. Do not infer gender from a name. Only the existing scene camera and dialogue contract permit speech, gestures or presence.';
 spec.instructions+=' All three known identities use names or singular they/them/their, including absent people mentioned in speech or narration. Never infer she/her or he/him from a name. The identity catalogue does not permit anyone to enter, speak or act outside the scene camera and dialogue contract.';
 // Closings deliberately exclude rejected prose: do not reintroduce invented
 // history or wishes through a diagnostic meant for the main scene writer.
 if(p.task==='repair'&&previousBlock&&!p.reaction_contract){
  const fields=referenceRepairFields(w,previousBlock);
  if(fields.length){
   p.reference_repairs=fields;
   p.reference_repair_boundary='Each source_field identifies a field in the rejected draft, not a new output schema. Correct every listed disallowed word in its sentence using the existing intended identity and the known pronouns. Do not guess an ambiguous referent: use the correct supplied name from the existing context. Preserve unrelated statements and facts; never introduce another actor, action, agreement or wish. Return all fields required by the current wire_plan, which remains authoritative.';
  }
 }
 if(!p.paragraph_plan||p.reaction_contract)return spec;
 const names:Record<string,string>={PLAYER:w.player_name,HOST:w.host.name,RECIPIENT:w.recipient.name},plan=p.paragraph_plan as Record<string,string>;
 p.wire_plan=Object.fromEntries(Object.entries(flatParagraphPlan(plan)).map(([key])=>{
  const n=Number(key.slice(1,3)),voice=Object.values(plan)[n-1]!,[speaker,listener]=voice.split('>');
  return[key,/_(?:lead|tail)$/u.test(key)?'Optional independent third-person staging sentence, or empty.':speaker==='NARRATOR'?'Third-person narration about '+w.player_name+'; they/them. No I/we/you.':names[speaker!]+' speaks directly to '+names[listener!]+'. Return ONLY '+names[speaker!]+' own words. I/me means '+names[speaker!]+'; you means '+names[listener!]+'. Never address '+names[speaker!]+' by their own name or narrate their gestures. Maximum35 words.'];
 }));
 if(p.block==='S1'||p.block==='S2')p.known_public_roles={PLAYER:{name:w.player_name,role:'entrusted custodian, never the creator; PLAYER owns the destination decision'},HOST:{name:w.host.name,role:'creator',public_wish:w.host.public_wish},RECIPIENT:{name:w.recipient.name,role:'intended recipient',public_wish:w.recipient.public_wish}};
 if(/^D3[ABT]$/u.test(p.block))p.completed_decision={source:'engine',placement:emotionalScopes[p.block]!.facts.work,remaining_material_choice:false,boundary:'The final moment has already resolved. React to its completed custody; never say the destination choice is still to be made. Only personal interpretation remains open.'};
 if(p.block==='S2'&&p.projection?.context){
  const c=p.projection.context;delete c.public_tension;
  for(const role of['host','recipient','guest'])if(c[role])delete c[role].public_wish;
  // Keep one labelled owner/wish catalogue; known_public_roles still resolves
  // the identities, without repeating each wish in two separate catalogues.
  for(const role of['HOST','RECIPIENT'])delete p.known_public_roles[role].public_wish;
 }
 if(p.known_public_roles)p.public_role_boundary='This catalogue labels existing public identities/wishes, not current attendance. Never swap wish owners, attribute either wish to PLAYER, or invent speech/actions by a role excluded from projection.allowed_named_current_actors. Follow the exact named speaker/listener in each field.';
 if(p.block==='S1'||p.block==='S2')p.instruction=dramaticWriterInstruction(p.target_words,p.block)+'\nUse the resolved field speaker and listener literally; no self-address or NAME or I duplication. Public role ownership is immutable; a concession changes a limitation, never transfers the wish to another person. The earlier_public_dialogue is reference data, not a script to copy.';
 return spec;
}
export function sceneVoiceIssues(w:EmotionalWorld,b:EmotionalBlock,id?:string){
 if(w.endingPolicy!=='outcome-reactions-2')return[];
 const settled=id==='D3T'&&/\b(?:choice|decision)\s+(?:(?:still|remains|is)\s+)*(?:to be made|unmade|ahead)\b/iu.test(b.text);
 const people=[w.player_name,w.host.name,w.recipient.name],names:Record<string,string>={PLAYER:w.player_name,HOST:w.host.name,RECIPIENT:w.recipient.name},issues:string[]=settled?['The last choice has already resolved as retaining the work; leave only interpretation open.']:[];
 for(const p of b.passages??[]){if(p.speaker==='NARRATOR')continue;const full=names[p.speaker]!,aliases=[full,...(firstNameIsUnambiguous(full,people)?[full.split(' ')[0]!]:[])];
  for(const name of new Set(aliases)){const escaped=name.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
   if(new RegExp('^\\s*'+escaped+'\\s*,|(?:^|[^\\p{L}])'+escaped+'\\s+(?:or|and)\\s+(?:I|me)\\b|\\b(?:I|me)\\s+(?:or|and)\\s+'+escaped+'(?![\\p{L}])','iu').test(p.text))issues.push('Bound voice: I is the named speaker, never a second person beside that speaker. Address only the fixed listener, not the speaker themself.');
  }
 }
 return[...new Set(issues)];
}

export function admissionVoiceIssues(text:string){return /\b(?:you|your|yours|we|us|our|ours)\b/iu.test(text)?['The admission addresses PLAYER, who owns neither public wish. State only HOST own limitation using I/my/me, without assigning a recipient preference to you.']:[];}
