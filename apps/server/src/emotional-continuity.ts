import type {EmotionalWorld} from '../../../packages/engine/src/emotional-types.js';
import {publicContainsSecret} from './emotional-3c.js';
import {maskCanonicalLabels,firstNameIsUnambiguous,containsIdentity} from './emotional-identities.js';

/** Private information is narrated by the committed facts, not reaction prose. */
export function publicReactionProjection(w:EmotionalWorld,projection:{context:Record<string,any>;permitted_claims:string[];notes:string}){
 const context=projection.context;
 for(const key of ['record','reason_subject','knowledge_field_meaning','knowledge_boundary','record_boundary'])delete context[key];
 for(const key of Object.keys(context.current_facts??{}))if(/knows|record/.test(key))delete context.current_facts[key];
 projection.permitted_claims=projection.permitted_claims.filter(claim=>! /^(?:record(?:_|=)|(?:player|recipient|host)_knows)/u.test(claim));
 projection.notes='Develop current public wishes and human reactions only. The engine supplies all handling, reading and knowledge separately; do not introduce a record or report knowledge of its contents.';
 context.knowledge_boundary='The engine has already narrated reading and the private explanation in the factual scene. This reaction receives only public preferences. Never introduce, recap or report the explanation, its contents, its open/closed status, its creation motive, or who knows/learns it. Public authorship and awareness of the artwork are still known.';
 const identity=(role:string)=>context.public_wishes?.find((wish:any)=>wish.owner===role)?.identity;
 context.relationship={creator:identity('HOST')??'the creator',recipient:identity('RECIPIENT')??'the intended recipient',custodian:w.player_name,rule:'The gift, gratitude and any wish for privacy concern the creator and intended recipient. The custodian is not one of that pair. Name the correct owners or use their explicit role descriptions. Do not use we/us/our, between them, or both of them for a wish or private relationship. I/you can describe the bound speaker and listener’s immediate feelings, never replace the gift’s two owners.'};
}

export function publicReactionIssues(w:EmotionalWorld,text:string){
 if(w.reactionPolicy!=='public-only')return [];
 const issues:string[]=[];
 if(publicContainsSecret(text,w.private_reason))issues.push('Reaction knowledge is engine-owned: do not repeat the private creation motive.');
 const labels=[w.work.name,w.venue.name].filter(label=>! /^(?:the\s+)?(?:note|letter|record|envelope|explanation)$/iu.test(label));
 const knowledgeText=maskCanonicalLabels(text,labels);
 const object='(?:note|explanation|envelope|record|letter)',state='(?:open|opened|closed|read|reread|known|understood|contents?|thanks)';
 if(new RegExp('\\b'+object+'\\b[^.!?]{0,110}\\b'+state+'\\b|\\b(?:opened|read|reread|closed)\\b[^.!?]{0,55}\\b'+object+'\\b','iu').test(knowledgeText)||/\b(?:private|creation)\s+(?:reason|motive)\b/iu.test(knowledgeText)||/\b(?:knew|knows?|known|understood|learned)\b[^.!?]{0,45}\bwhy\b[^.!?]{0,65}\b(?:made|created|painted|drew)\b/iu.test(knowledgeText))issues.push('Reaction knowledge and record status belong to the engine facts; use only public wishes and current reactions.');
 let typography=text;
 for(const label of [w.work.name,w.record.name,w.venue.name])typography=typography.replaceAll(label,'the known title');
 if(/\p{Ll}[.!?]\p{Lu}/u.test(typography))issues.push('A sentence boundary is missing its following space; return complete properly separated sentences.');
 return issues;
}

export function ambiguousRelationship(text:string,owners?:readonly [string,string],otherIdentities:readonly string[]=[],wishPairs=false){
 const escape=(name:string)=>name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const identities=[...(owners??[]),...otherIdentities];
 const names=owners?.map(name=>'(?:'+[...new Set([name,...(firstNameIsUnambiguous(name,identities)?[name.split(' ')[0]!]:[])])].map(escape).join('|')+')');
 const namedPair=names?new RegExp('(?:^|[^\\p{L}])(?:'+names[0]+'\\s+and\\s+'+names[1]+'|'+names[1]+'\\s+and\\s+'+names[0]+')(?![\\p{L}])','iu'):null;
 return text.split(/(?<=[.!?])\s+/u).some(original=>{
  // An abstract assumption serving its thinker is not a gift shared by an
  // unnamed pair. Preserve every other beneficiary/pair in the sentence.
  if(wishPairs)original=original.replace(/\b(?:certainty|uncertainty|an assumption|the assumption)\s+(?:had been|has been|was|is)\s+doing\s+(?:quiet\s+)?work\s+for them\b/giu,'an assumption serving its thinker');
  if(wishPairs&&/\b(?:asked|asking|invitation|request)\b/iu.test(original)&&/\bcloseness\b/iu.test(original)&&! /\b(?:gift|work|piece|drawing|gratitude|thanks|wishes?|hopes?)\b/iu.test(original))original=original.replace(/\bcloseness\b[^.!?;]{0,120}\bbetween them\b/giu,'a possible social closeness');
  let sentence=wishPairs?original.replace(/\bfinish the looking for them\b/giu,'complete the observer’s looking').replace(/\ban impression into a conclusion without earning the step between the two\b/giu,'an impression becoming a conclusion without a justified inference').replace(/\bbetween them (?:lay|stood|were) (?:the )?two (?:known |public )?(?:wishes|hopes|preferences)\b/giu,'contrasting wishes').replace(/\b(?:between|among|for) (?:the two|both) (?:public )?(?:wishes|hopes|preferences)\b/giu,'regarding preferences').replace(/\b(?:friction|tension|pull|difference|contrast) between them\b/giu,'contrasting preferences'):original;
  if(wishPairs&&owners&&names&&new RegExp('^\\s*'+names[1]+'\\s+(?:wants|wishes|hopes)\\b','iu').test(sentence)&&!containsIdentity(sentence,owners[0])&&!otherIdentities.some(name=>containsIdentity(sentence,name)||firstNameIsUnambiguous(name,identities)&&containsIdentity(sentence,name.split(' ')[0]!)))sentence=sentence.replace(/\b(?:made|created|drawn|painted)\s+for them\b/giu,'made for the intended recipient');
  // A singular intended recipient can be the beneficiary of the creator's marks.
  // This does not license an unnamed private pair or a separate between-them clause.
  const beneficiary=sentence.match(/\bthe (?:intended )?recipient\b[^.!?]*\bthe (?:creator|maker)\s+(?:left|made|created|included)\s+for them\b/iu);
  const singularBeneficiary=!!beneficiary&&!/\b(?:custodian|protagonist|PLAYER|you|me|us)\b/iu.test(beneficiary[0])&&!otherIdentities.some(name=>containsIdentity(beneficiary[0],name)||firstNameIsUnambiguous(name,identities)&&containsIdentity(beneficiary[0],name.split(' ')[0]!));
  const pairSentence=singularBeneficiary?sentence.replace(/\b(?:creator|maker)\s+(?:left|made|created|included)\s+for them\b/giu,'creator made for the intended recipient'):sentence;
  const topic=/\b(?:private|privacy|gratitude|thanks|thank[\s\-\u2010-\u2015]you|wishes?|hopes?|gift|work|piece)\b/iu.test(sentence);
  const explicitOwners=!!namedPair?.test(sentence)||/\b(?:creator|maker)\s+and\s+(?:(?:the|its)\s+)?(?:intended\s+)?recipient\b|\b(?:intended\s+)?recipient\s+and\s+(?:(?:the|its)\s+)?(?:creator|maker)\b/iu.test(sentence);
  const firstPersonPair=/\b(?:between|among|for)\s+(?:just\s+)?(?:us|you and me|me and you|the two of us|both of us)\b/iu.test(sentence);
  const thirdPersonPair=!explicitOwners&&/\b(?:between|among|for)\s+(?:just\s+)?(?:them|the two|both of them)\b/iu.test(pairSentence);
  const possession=/\bour\s+(?:(?:private|shared|quiet|little)\s+){0,2}(?:gift|work|piece|gratitude|thanks|privacy|wish|hope|relationship)\b|\bours\b/iu.test(sentence);
  return topic&&(firstPersonPair||thirdPersonPair||possession);
 });
}

export function creationPurposeIssues(w:EmotionalWorld,text:string,addressee?:string,speaker?:string){
 if(w.reactionPolicy!=='public-only'||w.dramaticPolicy?.version!=='story-specific-3')return [];
 const issues:string[]=[];
 // Creation is public; an explanation of its purpose is never reaction prose.
 const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const creationObject='(?:it|this|that|(?:the\\s+)?(?:work|drawing|sheet|piece|painting|'+escape(w.work.name)+'))';
 const purpose=new RegExp('\\b(?:made|created|drew|painted|sketched)\\s+'+creationObject+'\\s+(?:only\\s+)?(because|to|for)\\s+([^.!?]+)','giu');
 const identities=[w.player_name,w.host.name,w.recipient.name],names=[w.recipient.name,...(firstNameIsUnambiguous(w.recipient.name,identities)?[w.recipient.name.split(' ')[0]!]:[])];
 const beneficiary=new RegExp('^(?:'+[...new Set(names)].map(escape).join('|')+(addressee==='RECIPIENT'?'|you':'')+(speaker==='RECIPIENT'?'|me':'')+'|the (?:intended )?recipient|the person the work is for)(?=\\s*(?:[,;]|$|and\\b|but\\b|yet\\b))','iu');
 for(const match of text.matchAll(purpose)){
  const destinations=[w.venue.VIEWING,w.venue.TABLE,'the viewing bench','the work table'].map(escape).join('|');
  if(new RegExp('^made\\s+it\\s+to\\s+(?:'+destinations+')(?=\\s|[.!?,;]|$)','iu').test(match[0]))continue;
  const known=beneficiary.exec(match[2]!),suffix=known?match[2]!.slice(known[0].length):'';
  const extraPurpose=/^[,;\s]*(?:(?:and|but|yet|though|although)\s+)?(?:(?:not|only|also|really|just|partly)\s+)*(?:for|to|because)\b/iu.test(suffix);
  if(match[1]!.toLowerCase()!=='for'||!known||extraPurpose)issues.push('Invented creation purpose: reactions may name authorship and the intended beneficiary, never why the work was made.');
 }

 return issues;
}
