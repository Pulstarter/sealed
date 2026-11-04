import {emotionalProjection} from '../../../packages/engine/src/emotional.js';
import type {EmotionalWorld,EmotionalPassage,EmotionalSpeaker,EmotionalBlock} from '../../../packages/engine/src/emotional-types.js';
import {ambiguousAuthorship} from './emotional-3c.js';
import {firstNameIsUnambiguous} from './emotional-identities.js';
import {ambiguousRelationship,creationPurposeIssues} from './emotional-continuity.js';

const nameFor=(w:EmotionalWorld,role:Exclude<EmotionalSpeaker,'NARRATOR'>)=>role==='PLAYER'?w.player_name:role==='HOST'?w.host.name:w.recipient.name;

export function rawPassageText(block:EmotionalBlock){
 return block.passages?block.passages.map(p=>[p.lead,p.text,p.tail].filter(Boolean).join(' ')).join('\n\n'):block.text;
}

/** Speaker/recipient are data; the model never writes its own attribution. */
export function dialogueContract(w:EmotionalWorld,id:string){
 const present=emotionalProjection(w,id).allowed_named_current_actors;
 const silent=id==='ARRT'||/^D[123]T$/.test(id);
 return {speakers:['NARRATOR',...present.filter(role=>!silent||role!=='PLAYER')],addressees:['NONE',...present],identities:{PLAYER:w.player_name,HOST:w.host.name,RECIPIENT:w.recipient.name},creator:'HOST',custodian:'PLAYER',rule:'One paragraph is either narration or one utterance by its speaker to its addressee. NARRATOR uses NONE and third-person narration, and may recall established public remarks without direct I/you lines or quotations. Speech contains only the words spoken, no quotes, tags or gestures. Select an explicit addressee for you/your. Only HOST created the work; PLAYER merely holds it. I-creation requires speaker HOST; you-creation requires addressee HOST. Never attribute creation to PLAYER or RECIPIENT. Other people are absent from this exchange even if their names appear in a memory.'};
}

/** Display-only outer quotation marks never change stored model words. */
function boundSpeechText(w:EmotionalWorld,p:EmotionalPassage){
 if(w.endingPolicy!=='outcome-reactions-2'||p.speaker==='NARRATOR')return p.text;
 const m=p.text.trim().match(/^(?:"([\s\S]*)"|“([\s\S]*)”|'([\s\S]*)'|‘([\s\S]*)’)[.,;:!?]*$/u);
 return m?m.slice(1).find(part=>part!==undefined)!.trim():p.text;
}

export function renderPassages(w:EmotionalWorld,passages:EmotionalPassage[]){
 return passages.map(p=>{
  const spoken=boundSpeechText(w,p);
  if(p.speaker==='NARRATOR')return spoken.trim();
  let text=p.lead===undefined&&p.tail===undefined?spoken.trim():spoken.trim().replace(/\.$/u,',');
  if((w.prosePolicy==='scene-prose'||(w.prosePolicy==='scene-prose-2'||w.prosePolicy==='scene-prose-3'))){text=spoken.trim().replace(/\p{L}/u,c=>c.toLocaleUpperCase('en'));if(!/[?!…]$/u.test(text))text=text.replace(/[.,;:]?$/u,',');}
  return[p.lead?.trim(),`“${text}” ${nameFor(w,p.speaker)} said${p.addressee==='NONE'?'':' to '+nameFor(w,p.addressee)}.`,p.tail?.trim()].filter(Boolean).join(' ');
 }).join('\n\n');
}

/** The server plans every utterance; Meta supplies words, never its actor. */
export function plannedParagraphVoice(id:string,n:number):string{
 if(id==='S1')return n===5?'HOST>PLAYER':n===10?'PLAYER>HOST':n===14?'RECIPIENT>PLAYER':'NARRATOR>NONE';
 if(id==='S2')return n===5||n===15?'HOST>PLAYER':n===10?'PLAYER>HOST':'NARRATOR>NONE';
 if(id==='ARRA')return n===2?'HOST>PLAYER':'NARRATOR>NONE';
 if(id==='ARRB')return n===2?'RECIPIENT>PLAYER':'NARRATOR>NONE';
 if(/^D(?:1[AB]|2[ABT])$/.test(id))return n===2?'HOST>PLAYER':'NARRATOR>NONE';
 if(id==='F1')return n===3?'HOST>PLAYER':n===8?'PLAYER>HOST':'NARRATOR>NONE';
 if(id==='F2')return n===3?'RECIPIENT>PLAYER':n===8?'PLAYER>RECIPIENT':'NARRATOR>NONE';
 return 'NARRATOR>NONE';
}

/** The world’s public admission uses the same binding as its later paragraphs. */
export function bindHostAdmission(w:EmotionalWorld,text:string){
 const passages:EmotionalPassage[]=[{speaker:'HOST',addressee:'PLAYER',text,lead:'',tail:''}];
 const block={text:renderPassages(w,passages),claims:[],passages};
 return {text:block.text,issues:dialogueIssues(w,'S2',block)};
}

/** A complete nominal reference to a request is not a second speech tag.
 * Keep direct requests, colons and any subsequent attribution visible. */
function relativeRequest(text:string,index:number,verb:string,end:number){
 return /^(?:asked|asks)$/iu.test(verb)
  &&/\b(?:the|this|that|my|your|their|our)\s+(?:(?:slow|quiet|unhurried|open|careful|simple|private|public|plain|brief|steady)\s+){0,2}(?:noticing|looking|attention|quiet|silence|space|time|acknowledgement|acknowledgment|thanks|gratitude)(?:\s+that)?\s*$/iu.test(text.slice(0,index))
  &&/^\s+for(?=\s*(?:[,.;!?]|$))/iu.test(text.slice(end))
  &&!/^\s+for[^.!?]*\b(?:said|says|asked|asks|answered|answers|replied|replies|whispered|whispers|murmured|murmurs)\s*:/iu.test(text.slice(end));
}

export function dialogueIssues(w:EmotionalWorld,id:string,block:EmotionalBlock){
 if(!block.passages)return [];
 const contract=dialogueContract(w,id),issues:string[]=[];
 if(renderPassages(w,block.passages)!==block.text)issues.push('Rendered prose does not match its bound speakers and listeners.');
 const parts=block.passages.flatMap(p=>[...(p.lead?[{speaker:'NARRATOR' as const,addressee:'NONE' as const,text:p.lead}]:[]),p,...(p.tail?[{speaker:'NARRATOR' as const,addressee:'NONE' as const,text:p.tail}]:[])]).map(p=>p.speaker==='NARRATOR'?p:{...p,text:boundSpeechText(w,p)});
 for(const p of parts){
  // A nominal "an immediate thank you" is a third-person reference to
  // gratitude, not an unattributed utterance. Actual quoted/direct lines
  // still use the original text for every other dialogue check.
  issues.push(...creationPurposeIssues(w,p.text,p.addressee,p.speaker));
  const narrationText=p.text.replace(/\b(?:a|an|the|their)\s+(?:(?:immediate|quick|clear|spoken|sincere|small|quiet|public|simple|short|brief|plain|gentle|polite|formal)\s+){0,2}thank[\s\-\u2010-\u2015]you\b/giu,'gratitude');
  if(w.reactionPolicy==='public-only'&&ambiguousRelationship(p.text,[w.host.name,w.recipient.name],[w.player_name],w.referencePolicy==='wish-pairs'))issues.push('Ambiguous relationship owners: name the creator and intended recipient; the player exchange must not replace their pair.');
  if(!contract.speakers.includes(p.speaker)||!contract.addressees.includes(p.addressee)||p.speaker===p.addressee)issues.push('Speaker or listener is not present for this block, or PLAYER speaks on an inaction branch.');
  if(/["“”]|(?:^|[\s(])[‘']/u.test(p.text)||/\b(?:said|says|asked|asks|answered|answers|replied|replies|told|tells|whispered|whispers|murmured|murmurs)\s*:/iu.test(p.text)||(p.speaker==='NARRATOR'&&/\b(?:I|me|my|mine|we|us|our|ours|you|your|yours)\b/iu.test(narrationText)))issues.push('Do not hide dialogue or a second speaker inside a paragraph. Return speech without quotation marks; the server attributes it.'+(w.prosePolicy==='scene-prose-3'&&p.speaker==='NARRATOR'?' Narration, including staging, must use names or third-person they/them. Do not use generic you/your or first-person I/we/us/our.':''));
  if(p.speaker!=='NARRATOR'&&[w.player_name,w.host.name,w.recipient.name].some(name=>{const pattern=[name,name.split(' ')[0]!].map(n=>n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');return [...p.text.matchAll(new RegExp('(?:^|[^\\p{L}])(?:'+pattern+')\\s+(said|says|asked|asks|answered|answers|replied|replies|whispered|whispers|murmured|murmurs)\\b','giu'))].some(m=>!((/\b(?:until|when|once|if|while)\s*$/iu.test(p.text.slice(0,m.index))&&!/^\s*:/u.test(p.text.slice(m.index!+m[0].length)))||relativeRequest(p.text,m.index!,m[1]!,m.index!+m[0].length)));}))issues.push('Speech text must contain only the bound speaker’s words, without speaker tags or stage directions.');
  if(p.speaker==='NARRATOR'&&p.addressee!=='NONE')issues.push('Narration has no addressee.');
  if(p.speaker!=='NARRATOR'&&p.addressee==='NONE'&&/\byou(?:r|rs|rself|rselves)?\b/iu.test(p.text))issues.push('Dialogue using you/your needs an explicit present listener.');
  if(p.speaker!=='NARRATOR'&&('lead' in p||'tail' in p)&&(p.text.match(/[\p{L}\p{N}]+/gu)?.length??0)>35)issues.push('Keep the spoken line short. Put third-person staging in lead/tail, never inside the utterance.');
  if((w.prosePolicy==='scene-prose-2'||w.prosePolicy==='scene-prose-3')&&p.speaker!=='PLAYER'&&p.speaker!=='NARRATOR'&&[...p.text.matchAll(/\bI\s+(?:(?:am|still|now|currently)\s+)*(?:hold|holding|keep|keeping)\s+(?:the|this|that)\s+(?:loose\s+)?(?:sheet|paper|work|piece)\b/giu)].some(m=>!/^\s+(?:in (?:high regard|mind)|dear)\b/iu.test(p.text.slice(m.index!+m[0].length))))issues.push('Only PLAYER has custody of the work in this exchange; another bound speaker cannot claim to hold it.');
  // Resolve pronouns by the declared exchange, not by a name elsewhere in prose.
  const creationText=p.text.replace(/\bI\b/giu,match=>p.speaker==='HOST'?'the creator':match).replace(/\byou\b/giu,match=>p.addressee==='HOST'?'the creator':match).replace(/\bwe\b/giu,'I');
  if(ambiguousAuthorship(creationText,undefined,[w.player_name,w.host.name,w.recipient.name]))issues.push('Authorship contradicts the bound speaker/listener: only HOST created the work.');
  for(const name of [w.player_name,w.recipient.name]){
   const names=[name,...(firstNameIsUnambiguous(name,[w.player_name,w.host.name,w.recipient.name])?[name.split(' ')[0]!]:[])];
   const pattern=names.map(n=>n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
   for(const claim of p.text.matchAll(new RegExp('(?:^|[^\\p{L}])(?:'+pattern+')\\s+((?:(?:has|had)\\s+)?(?:drew|drawn|painted|sketched|created|made)\\b)','giu'))){
    const clauseTail=p.text.slice(claim.index!+claim[0].length).split(/[.!?]/u)[0]!;
    if(ambiguousAuthorship('I '+claim[1]!.replace(/^has\b/iu,'have')+clauseTail,undefined,[w.player_name,w.host.name,w.recipient.name]))issues.push('Only the named HOST created the work; PLAYER and RECIPIENT are not its creators.');
   }
  }
 }
 return [...new Set(issues)];
}
