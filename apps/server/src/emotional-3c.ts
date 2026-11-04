import type {EmotionalArtifact,EmotionalWorld,EmotionalProfile} from '../../../packages/engine/src/emotional-types.js';
import {firstNameIsUnambiguous} from './emotional-identities.js';

export const storyInstruction='For this new revision add story: tension is two compatible-but-conflicting public wishes (not a rule); anchor is a small concrete detail of WORK visibly described in S1, with no explanation; scene_two and scene_three are one sentence each of new present emotional understanding, not physical actions, past events, new knowledge of the hidden note, variable attendance or custody. sealed_truth is 60–85 words about one concrete past fact between HOST and RECIPIENT, distinct from private_reason and shared_past_memory, that recontextualizes the anchor without solving its interpretation. It is not in the note and must appear in no other field. It concerns only their past, never what happens tonight, a new actor, a promised meeting, a secret mechanism or a diagnosis. HOST and RECIPIENT public_wish must concern this artwork and how its attention or gratitude is received, not a generic wish about the room. scene_two must be a specific short spoken admission by HOST that develops that public wish without disclosing the private reason. scene_three draws attention to another concrete visible feature of WORK and the competing wishes; no self-help maxim. sealed_truth must explicitly refer to the distinctive anchor (use its concrete words) and explain the past circumstance behind that mark, so its new significance is understandable rather than an unrelated anecdote. The closing question is interpretive, not a new task or proposed appointment. Gestures are small BODY-ONLY habits, without objects (no paper, mug, envelope, work or clothing handling). Public wishes and developments must not quote the secret. Keep other fields concise: motives <=60 words, public memory <=35 words, developments <=25 words each. Let the reader infer the feeling; no moral verdict on any choice.';

const words=(s:string):string[]=>s.toLowerCase().match(/[\p{L}\p{N}]+/gu)??[];
export function repeatedPassages(a:EmotionalArtifact,paths:{route:string;blocks:string[]}[]){
 const issues:Record<string,string[]>={},size=22;
 const spans=new Map<string,Set<string>>(),reasonWords=words(a.world.private_reason),noteSpans=new Set<string>();
 if(reasonWords.length<=80)for(let i=0;i<=reasonWords.length-size;i++)noteSpans.add(reasonWords.slice(i,i+size).join(' '));
 for(const [id,b] of Object.entries(a.blocks)){const tokens=words(b.text),seen=new Set<string>();for(let i=0;i<=tokens.length-size;i++){const span=tokens.slice(i,i+size).join(' ');if(seen.has(span))issues[id]=['Repeated long passage within this block; replace repetition with a new permitted observation or reaction.'];seen.add(span);}spans.set(id,seen);}
 for(const {route,blocks:path} of paths){const seen=new Map<string,string>();for(const [id,text] of Object.entries(a.factualText[route]??{})){const tokens=words(text);for(let i=0;i<=tokens.length-size;i++)seen.set(tokens.slice(i,i+size).join(' '),'compiled '+id);}for(const id of path){for(const span of spans.get(id)??[]){if(/^F[123]$/.test(id)&&noteSpans.has(span))continue;const previous=seen.get(span);if(previous&&previous!==id){issues[id]=[`Repeated long passage also occurs in ${previous} on this route. Develop this moment without repeating that passage.`];break;}seen.set(span,id);}}}
 if(a.world.choicePolicy==='two-buttons-and-timeout')for(const {route,blocks:path} of paths){
  const seen=new Map<string,string>();
  // Whole short sentences and bound utterances complement the long-span
  // check. Compare only coexisting blocks, never alternative branches.
  for(const id of path){
   const block=a.blocks[id]!;
   const units=[...block.text.split(/(?<=[.!?])\s+/u).filter(s=>words(s).length>=8),...(block.passages??[]).filter(p=>p.speaker!=='NARRATOR'&&words(p.text).length>=4).map(p=>p.text)];
   const knownReason=words(a.world.private_reason).join(' ');
   const within=new Set<string>();
   for(const unit of units.map(s=>words(s).join(' '))){
    if(/^F[123]$/.test(id)&&knownReason.includes(unit)&&!within.has(unit)){within.add(unit);continue;}
    const previous=within.has(unit)?id:seen.get(unit);
    if(previous){const issue=`Repeated sentence or dialogue also occurs in ${previous}; develop a new permitted reaction.`;if(!issues[id]?.includes(issue))issues[id]=[...(issues[id]??[]),issue];}
    within.add(unit);
    seen.set(unit,id);
   }
  }
 }
 return issues;
}
export function redactRepairText(text:string,w:EmotionalWorld,secretAllowed:boolean){
 let safe=text;
 for(const secret of [w.story?.sealed_truth,...(secretAllowed?[]:[w.private_reason])])if(secret){const literal=secret.trim().split(/\s+/u).map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s+');safe=safe.replace(new RegExp(literal,'giu'),'[withheld: outside this block]');}
 return safe;
}
export function publicContainsSecret(value:unknown,secret:string):boolean{
 const normalize=(s:string)=>s.toLowerCase().replace(/\s+/gu,' ').trim();
 if(typeof value==='string')return normalize(value).includes(normalize(secret));
 if(value&&typeof value==='object')return Object.values(value).some(v=>publicContainsSecret(v,secret));
 return false;
}
export function storyWorldIssue(w:EmotionalWorld):string|null{
 const s=w.story;if(!s)return null;
 if(Object.values(s).some(v=>typeof v!=='string'||!v.trim()||v.length>1600))return 'The sealed revelation and public developments must be concise nonempty text.';
 if(words(s.sealed_truth).length<45||words(s.sealed_truth).length>110||s.sealed_truth.toLowerCase().includes(w.private_reason.toLowerCase())||w.private_reason.toLowerCase().includes(s.sealed_truth.toLowerCase()))return 'The sealed truth must add a distinct past revelation, not repeat the readable motive.';
 const {sealed_truth,...publicStory}=s;
 if(publicContainsSecret({...publicStory,host:w.host,recipient:w.recipient,work:w.work,record:w.record,title:w.title,venue:w.venue,memory:w.shared_past_memory,one:w.public_motif_one,two:w.public_motif_two,question:w.future_question},sealed_truth))return 'The sealed revelation leaked into public fields.';
 if([w.host.gesture,w.recipient.gesture].some(g=>/\b(?:paper|edge|record|explanation|envelope|card|note|work|painting|mug|cup|map|cloth|sleeve|pocket|object)\b/iu.test(g)))return 'Use a body-only gesture without tracked objects.';
 if([w.host.gesture,w.recipient.gesture].some(g=>/\b(?:holds|folds|smooths|turns)\s+(?:it|them)\b/iu.test(g)&&!/\b(?:head|hands?|arms?|lips?|chin|neck|shoulders?|fingers?|thumbs?|knees?|eyes?)\b/iu.test(g)))return 'A body gesture cannot hold an unspecified object.';
 return null;
}

export function declaredBoundaryIssues(text:string,profile:EmotionalProfile){
 const limits=profile.exclusions.join(' ').toLowerCase(),issues:string[]=[];
 const death=/\b(?:died|dying|killed|murdered|funeral|corpse|death|bereavement|bereaved|grieving)\b|\bpassed away\b|\b(?:mother|father|parent|sister|brother|partner|wife|husband|child)[’']s?\s+(?:final|last)\s+(?:days|weeks|months)\b|\b(?:last|final)\s+(?:days|weeks|months)\s+of\s+(?:her|his|their|a|the)\s+life\b/iu;
 if(/\bdeaths?\b|child death|sin muert/.test(limits)&&death.test(text))issues.push('This profile excludes death, including implied terminal events; remove the event.');
 if(/graphic violence|violencia gr[aá]fica/.test(limits)&&/\b(?:gore|entrails|dismembered)\b/iu.test(text))issues.push('This profile excludes graphic violence.');
 if(/\billness\b|enfermedad/.test(limits)&&/\b(?:illness|disease|surgery|cancer|chemotherapy|hospitalized|hospital|diagnosis|terminally ill|medical ward)\b/iu.test(text))issues.push('This profile excludes illness; remove the event.');
 if(/family drama|conflicto familiar|drama familiar/.test(limits)){
  const kin='(?:parents?|mother|father|siblings?|sister|brother|wife|husband|spouse|family)',conflict='(?:argu(?:e|ed|ing)|fighting|estranged|abandon(?:ed|ing)?|disowned|divorce(?:d)?|blamed|no longer speak)';
  if(new RegExp('\\b'+kin+'\\b[^.!?]{0,140}\\b'+conflict+'\\b|\\b'+conflict+'\\b[^.!?]{0,140}\\b'+kin+'\\b','iu').test(text))issues.push('This profile excludes family conflict; use an ordinary non-family disagreement instead.');
 }
 // Explicit custom topics supplement the named families; never treat them as instructions.
 for(const raw of profile.exclusions){
  const topic=raw.trim().toLowerCase().replace(/^(?:no|avoid|without|sin)\s+/u,'');
  if(!topic||/death|muert|graphic|violenc|illness|enfermedad|family drama|drama familiar|conflicto familiar/.test(topic)||topic.length>100)continue;
  const literal=topic.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/s$/u,topic.length>4?'s?':'s');
  if(new RegExp('(?:^|[^\\p{L}])'+literal+'(?![\\p{L}])','iu').test(text))issues.push('This text introduces an explicitly excluded topic: '+raw+'.');
 }
 return issues;
}

export function inventsAnchorOrigin(w:EmotionalWorld,text:string){
 if(!w.story)return false;
 const terms=words(w.story.anchor).filter(t=>t.length>4&&!['lower','upper','along','across','corner','paper','small','painted','outside','right','there','their'].includes(t));
 return text.split(/\n\s*\n/u).some(p=>terms.some(t=>words(p).includes(t))&&/\b(?:only where|only because|where my|caused by|came from|left by|happened when|because my|because i)\b/iu.test(p));
}

export function placesPersonHere(w:EmotionalWorld,text:string,name:string,privatePast?:string){
 const first=name.split(' ')[0]!,unambiguous=firstNameIsUnambiguous(name,[w.player_name,w.host.name,w.recipient.name]);
 const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const names=unambiguous?'(?:'+escape(name)+'|'+escape(first)+')':escape(name);
 const verbs='sat|sits|stood|stands|settled|settles|joined|joins|arrived|arrives|came|comes|leaned|leans|laughed|laughs|pointed|points|gave|gives|answered|answers|replied|replies|said|says|smiled|smiles|nodded|nods|shifted|shifts|glanced|glances|watched|watches|moved|moves|waited|waits|folded|folds|pressed|presses|looked|looks|turned|turns|reached|reaches|held|holds|studied|studies|sighed|sighs|stepped|steps|blinked|blinks|shook|shakes|is|was';
 const matches=[...text.matchAll(new RegExp('(?:^|[^\\p{L}])'+names+'\\s+(?<activity>'+verbs+')\\b|\\bbeside\\s+'+names+'(?![\\p{L}])','giu'))].filter(match=>{
  // Being named in a conversation is not bodily presence. Inspect each match
  // so a second, actual arrival in the same sentence still rejects.
  if(/^(?:is|was)$/iu.test(match.groups?.activity??'')&&/^\s+(?:named|unnamed|mentioned)\b/iu.test(text.slice(match.index!+match[0].length)))return false;
  if(match.groups?.activity?.toLowerCase()!=='gave'||! /\bwhat\s*$/iu.test(text.slice(0,match.index!)))return true;
  const clause=text.slice(0,match.index!).split(/[.!?;\n]/u).at(-1)!+text.slice(match.index!).split(/[.!?;\n]/u)[0];
  return /\b(?:now|tonight|currently|today|here|this evening|at this moment)\b/iu.test(clause);
 });
 if(!privatePast)return matches.length>0;
 const known=new Set(words(privatePast).filter(word=>word.length>4));
 const isPast=/^(?:sat|stood|settled|joined|arrived|came|leaned|laughed|pointed|gave|answered|replied|said|smiled|nodded|shifted|glanced|watched|moved|waited|folded|pressed|looked|turned|reached|held|studied|sighed|stepped|blinked|shook|was)$/iu;
 // Judge each mention in its own clause. A prior event must never erase a
 // second actor mention in the same sentence, especially a current clause.
 return matches.some(match=>{
  let start=0,end=text.length;
  const boundaries=[...text.matchAll(/[.!?;\n]|\s+(?:and|but|while|then)\s+/giu)];
  for(const boundary of boundaries){if(boundary.index!<match.index!)start=boundary.index!+boundary[0].length;else{end=boundary.index!;break;}}
  const clause=text.slice(start,end),before=text.slice(start,match.index!);
  const framed=/\b(?:last (?:spring|summer|autumn|fall|winter|year|month|week|night)|years? ago|months? ago|winters? ago|summers? ago)\b/iu.test(before);
  const current=/\b(?:now|tonight|currently|today|here|this evening|at this moment|in the present)\b/iu.test(clause);
  const pastVerb=match.groups?.activity?isPast.test(match.groups.activity):/\b(?:sat|stood|settled|leaned|waited|was)\b/iu.test(before);
  const overlap=new Set(words(clause).filter(word=>known.has(word))).size;
  return !(framed&&!current&&pastVerb&&overlap>=3);
 });
}

export function attendanceProse(w:EmotionalWorld,text:string,retainedWork=false){
 // A possible future reader says nothing about who is in the room now.
 const custody=retainedWork?text.replace(/\b(?:the|this|that)\s+(?:loose\s+)?(?:sheet|work|drawing)\s+(?:resting|rests|remaining|remains)\s+with\s+them\s+and\s+with\s+(?:no one else|nobody else)\b(?=\s*(?:[.!?;]|$))/giu,'the work remains exclusively in player custody'):text;
 const spatial=custody
  .replace(/\b(?:there\s+(?:was|is)\s+)?(?:no one else|nobody else)\s+to\s+absolve\s+(?:(?:the|that|their|a)\s+)?(?:hesitation|responsibility|choice|decision)\b/giu,'responsibility cannot be transferred')
  .replace(/\b(?:no one else|nobody else)\s+(?:may|might|could)\s+(?:ever\s+)?(?:see|view|read|open)\b/giu,'an uncertain future viewer')
  // Custody can stay unchanged with company present. Mask only the bounded
  // responsibility clause, retaining any neighbouring claim about attendance.
  .replace(/\b(?:(?:practical|the|that)\s+){0,2}responsibility\s+(?:for\s+(?:it|the work|the picture)\s+)?(?:(?:had|has)\s+)?passed\s+to\s+(?:no one else|nobody else)\b/giu,'responsibility stayed unchanged')
  .replace(/\b(?:no one else|nobody else)\s+(?:(?:has|had)\s+)?taken\s+over\s+(?:(?:the|that|this|practical)\s+){0,2}responsibility\b/giu,'responsibility stayed unchanged')
  .replace(/\b(?:no one else|nobody else)\s+(?:(?:had|has)\s+)?lifted\s+(?:(?:the|that|this)\s+)?obligation\b/giu,'the obligation stayed unchanged');
 if(!/\bempty bench\b/iu.test(w.work.appearance))return spatial;
 // Attribute the seat itself to the depiction, never the whole sentence:
 // "painting ... while the empty bench beside them" is actual attendance.
 return spatial
  .replace(/\b(?:flat ink )?(?:drawing|picture|print|image|study)\s+of\s+an?\s+empty bench\b/giu,'depicted seating')
  .replace(/\ban?\s+empty bench\s+(?:drawn|depicted)\b/giu,'depicted seating')
  .replace(/\b(?:image|painting|drawing|picture|print)\s+(?:show(?:s|ed)?|depicts?|depicted|contains?)\s+(?:(?:a|an|single|one)\s+){0,2}empty bench\b/giu,'depicted seating');
}

export function ambiguousAuthorship(text:string,creatorName?:string,otherNames:string[]=[]){
 text=text.replace(/\b(I|you)[’'](ve|d)\b/giu,(_all,person:string,aux:string)=>person+(aux.toLowerCase()==='ve'?' have':' had'));
 const knownPeople=[...(creatorName?[creatorName]:[]),...otherNames];
 const personObjects=[...new Set(knownPeople.flatMap(name=>[name,...(firstNameIsUnambiguous(name,knownPeople)?[name.split(' ')[0]!]:[])]))].map(name=>name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
 const namedCausative=personObjects.length?new RegExp('^\\s+(?:'+personObjects.join('|')+')\\s+(?:carry|bear|feel|think|look|stay|wait|hope|realise|realize|check|see|understand|notice|read|listen|believe|wonder)\\b','iu'):null;
 const claims=/\b(I|you)\s+(?:(?:have|had)\s+)?(drew|drawn|painted|sketched|created|made)\b/giu;
 return [...text.matchAll(claims)].some(match=>{
  if(creatorName&&/^I$/iu.test(match[1]!)&&namedCreatorSpeaks(text,match.index!,creatorName,otherNames))return false;
  const tail=text.slice(match.index!+match[0].length);
  if(/^made$/iu.test(match[2]!)&&namedCausative?.test(tail))return false;
  if(/^made$/iu.test(match[2]!)){
    const attempt=/^\s+no\s+attempt(?:\s+to\s+[^,;.!?]+)?(?=\s*(?:[,;.!?]|$))/iu.exec(tail);
    if(attempt){
     // Coordinated infinitives remain under the negation (to hide and
     // paint). A finite past claim or a new clause does not.
     const finite=[...attempt[0].matchAll(/\b(?:and|but|yet|then|however|still)\s+(?:(?:now|also|actually)\s+){0,2}(?:drew|drawn|painted|sketched|created|made)\b/giu)]
      .some(m=>clarityContinuationCreates(attempt[0].slice(m.index!),match[1]!,knownPeople,personObjects));
     if(!finite&&!clarityContinuationCreates(tail.slice(attempt[0].length),match[1]!,knownPeople,personObjects))return false;
    }
   const reflexive=/^I$/iu.test(match[1]!)?'myself':'yourself';
   const listeners=['you','me','us','them','the creator',...personObjects].join('|');
   const clear=new RegExp('^\\s+'+reflexive+'\\s+clear(?:\\s+to\\s+(?:'+listeners+'))?(?=\\s*[,.;!?]|$)','iu').exec(tail);
   // The communication idiom cannot swallow a creative continuation, even
   // if that continuation shares its subject instead of repeating "I".
   if(clear&&!clarityContinuationCreates(tail.slice(clear[0].length),match[1]!,knownPeople,personObjects))return false;
  }
  if(/^(?:drew|drawn)$/iu.test(match[2]!)&&/^\s+(?:(?:my|your|their|his|her|the)\s+)?(?:focus|attention|gaze)\s+(?:inward|inwards|back|away|toward|towards|to|onto)\b/iu.test(tail))return false;
  if(/^(?:drew|drawn)$/iu.test(match[2]!)&&/^\s+(?:(?:the|this|that|my|your|their|a)\s+)?(?:sheet|paper|piece|work)\s+(?:nearer|closer|toward|towards|against)\b/iu.test(tail))return false;
  if(/^(?:drew|drawn)$/iu.test(match[2]!)&&/^\s+(?:my|your|their|his|her)\s+sleeves?\s+(?:over|across|down|up)\b/iu.test(tail))return false;
  // A bounded breathing idiom. Arbitrary words could instead be a depicted
  // subject ("a figure taking breath"), so only breathing qualities qualify.
  if(/^(?:drew|drawn)$/iu.test(match[2]!)&&/^\s+(?:(?:(?:a|an|one|the|another)\s+)?(?:(?:slow|long|deep|steady|sharp|single|shallow|soft|short|uneven)\s+){0,3}breath\b|back\b|closer\b|nearer\b|apart\b|aback\b)/iu.test(tail))return false;
  if(/^made$/iu.test(match[2]!)&&/^\s+(?:(?:the|that|this|their)\s+)?(?:keeping|holding|looking|waiting|silence|breathing|staying|leaving|attention|trust)\s+(?:itself\s+)?(?:feel|seem|look)\b/iu.test(tail))return false;
  if(/^made$/iu.test(match[2]!)&&/^\s+(?:(?:slowness|looking|waiting|silence|breathing|staying|leaving|attention)\s+(?:feel\s+|seem\s+)?(?:easy|easier|hard|harder|possible|comfortable|difficult)\b|of\b|(?:room|space|way)\b|(?:a|the|one|this|that)\s+(?:mistake|promise|choice|decision|difference|mess|point|claim|connection)\b|(?:me|her|him|them|us)\s+(?:feel|think|look|stay|wait|hope|realise|realize|check|see|understand|notice|read|listen|believe|wonder)\b|it\s+(?:clear|possible|easy|easier|hard|harder|worse|better)\b)/iu.test(tail))return false;
  return true;
 });
}

/** Classify only a creative continuation of this unprivileged I/you. A noun
 * such as "the drawing" or an explicitly bound creator is not such a claim.
 * Synthetic comparisons stay internal; model prose is never rewritten. */
function clarityContinuationCreates(text:string,actor:string,people:string[],escapedNames:string[]){
 const forms='(?:re)?(?:draw(?:s|n|ing)?|paint(?:s|ed|ing)?|sketch(?:es|ed|ing)?|creat(?:e|es|ed|ing))|mak(?:e|es|ing)|drew|made';
 const past=(verb:string)=>{const root=verb.toLowerCase().replace(/^re/u,'');return root.startsWith('draw')||root==='drew'?'drew':root.startsWith('paint')?'painted':root.startsWith('sketch')?'sketched':root.startsWith('creat')?'created':'made';};
 const vocative=escapedNames.length?new RegExp('^\\s*,\\s*(?:'+escapedNames.join('|')+')\\s*,','iu'):/$^/u;
 const afterVocative=text.replace(vocative,', ').replace(/^\s*,\s*\p{Lu}[\p{L}'’. -]{0,60},\s*(?=(?:by|through|while|after|before)\b)/u,', ');
  const implicit=new RegExp('^\\s*[,;.]?\\s*(?:(?:and|but|yet|then|however|still|by|through|while|after|before|\\p{L}+ly)\\s+){0,3}('+forms+')\\b','iu').exec(afterVocative);
 if(implicit&&ambiguousAuthorship(actor+' '+past(implicit[1]!)+afterVocative.slice(implicit[0].length),undefined,people))return true;
 const expanded=text.replace(/\b(I|you)[’']ll\b/giu,'$1 will').replace(/\bI[’']m\b/giu,'I am').replace(/\byou[’']re\b/giu,'you are');
 const future=new RegExp('\\b(I|you)\\s+(?:(?:will|would|have|had)\\s+|(?:am|are|was|were)\\s+(?:(?:going|about)\\s+to\\s+)?)(?:be\\s+)?('+forms+')\\b','giu');
 for(const claim of expanded.matchAll(future))if(ambiguousAuthorship(claim[1]+' '+past(claim[2]!)+expanded.slice(claim.index!+claim[0].length),undefined,people))return true;
 return false;
}

/** Deliberately conservative: first-person creation needs one explicit named speaker in its paragraph. */
function namedCreatorSpeaks(text:string,offset:number,creator:string,others:string[]){
 const boundary=text.lastIndexOf('\n\n',offset),start=boundary<0?0:boundary+2,end=text.indexOf('\n\n',offset);
 const paragraph=text.slice(start,end<0?undefined:end),local=offset-start;
 if(![...paragraph.matchAll(/["“]([^"“”]*)["”]/gu)].some(q=>q.index!<local&&q.index!+q[0].length>local))return false;
 const all=[creator,...others],escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const attributed=(name:string)=>{
  const first=name.split(' ')[0]!,unique=firstNameIsUnambiguous(name,all);
  const names=unique?'(?:'+escape(name)+'|'+escape(first)+')':escape(name),verb='(?:said|says|asked|asks|answered|answers|replied|replies|murmured|murmurs|whispered|whispers|added|adds)';
  return new RegExp('(?:^|[^\\p{L}])'+names+'\\s+'+verb+'\\b|\\b'+verb+'\\s+'+names+'(?![\\p{L}])','iu').test(paragraph);
 };
 return attributed(creator)&&!others.some(attributed);
}
