import {emotionalScopes} from '../../../packages/engine/src/emotional.js';
import {narrativeWords} from './emotional-reliability.js';
import type {EmotionalBlock,EmotionalWorld,EmotionalProfile,EmotionalPassage} from '../../../packages/engine/src/emotional-types.js';
import {containsIdentity,firstNameIsUnambiguous} from './emotional-identities.js';
import {flatParagraphPlan} from './emotional-wire.js';
import {objectSchema,stringSchema,type MetaRequest} from './emotional-meta.js';

export const isPresentEnding=(w:EmotionalWorld,id:string)=>(w.endingPolicy==='present-reactions-1'||(w.endingPolicy==='outcome-reactions-1'||w.endingPolicy==='outcome-reactions-2'))&&/^F[1-6]$/u.test(id);

const directions:Record<string,string>={
 F1:'Exposure and relief coexist in a candid present exchange.',
 F2:'Being noticed feels complicated; let the two present feelings differ.',
 F3:'Closeness and uncertainty coexist without a tidy personal answer.',
 F4:'Diligence and incomplete understanding coexist.',
 F5:'A feeling of release coexists with an unfinished personal response.',
 F6:'A remaining personal weight coexists with steady uncertainty.'
};
const beats=[
 'An immediate personal feeling belongs to the protagonist, without an event or object.',
 'The fixed voice describes a present feeling, not what anyone wanted or did.',
 'A second feeling complicates the first; no interpretation of another person motives.',
 'The fixed voice responds with a present personal feeling, without a request or claim.',
 'The protagonist tolerates that tension without turning it into reassurance.',
 'Leave a present personal uncertainty open, with no task, promise or future event.'
];

/** A separate request: even repair cannot carry rejected history back to the writer. */
export function endingReactionRequest(w:EmotionalWorld,id:string,options:{key:string;words:number;plan:Record<string,string>;intensity:EmotionalProfile['intensity'];exclusions:string[];repairPass?:1|2|3;repairFeedback?:readonly string[]}):MetaRequest{
 if((w.endingPolicy==='outcome-reactions-1'||w.endingPolicy==='outcome-reactions-2'))return outcomeReactionRequest(w,id,options);
 if(!isPresentEnding(w,id))throw new Error('Present ending policy required.');
 const wire=flatParagraphPlan(options.plan),properties=Object.fromEntries(Object.keys(wire).map(key=>[key,/_(?:lead|tail)$/u.test(key)?{type:'string',enum:['']}:stringSchema]));
 const focus=/gratitude/iu.test(w.future_question)?'gratitude':/care/iu.test(w.future_question)?'care':'attention';
 return {key:options.key,model:'muse-wonder-1.0',maxTokens:3600,schema:objectSchema(properties),
  instructions:'Write literary English about present personal feelings only, as declarative statements; no questions. The surrounding story supplies its own factual ending. Never reconstruct a past conversation, approval, wish or event. Do not refer to decisions, destinations, objects, authorship or the material outcome. Do not introduce other people. This is emotional prose, not therapy or advice. Follow the fixed voices and return only the requested JSON fields.',
  payload:{task:options.repairPass?'repair':'block',block:id,reaction_contract:'present-reactions-1',...(options.repairPass?{repair_pass:options.repairPass}:{}),profile:{intensity:options.intensity,exclusions:[...options.exclusions]},protagonist:w.player_name,interpretive_focus:focus,emotional_direction:directions[id],paragraphs:Object.keys(options.plan).length,target_words:options.words,
   paragraph_plan:Object.fromEntries(Object.entries(options.plan).map(([key,voice])=>[key,voice==='NARRATOR>NONE'?voice:'FIRST_PERSON'])),wire_plan:Object.fromEntries(Object.entries(wire).map(([key,value])=>[key,/_(?:lead|tail)$/u.test(key)?'empty string':value==='third-person narration'?'third-person present personal feeling':'first-person present feeling'])),
   scene_beats:Object.fromEntries(Object.keys(options.plan).map((key,i)=>[key,beats[i]??beats.at(-1)!])),
   instruction:'Use third-person present narration for the protagonist. Spoken text starts with I feel, I am, I remain, I sense, I notice or I find and describes only the speaker own present feeling; no you/we/our or references to another person; no names or staging in speech. Lead and tail are empty. Aim for the total target_words across all text fields; spoken fields stay at most 35 words. Develop contrasting feelings rather than repeating a moral. No past tense, requests, future predictions, public/private placement, wishes, agreements or permissions. Do not use object or event vocabulary such as work, drawing, display, choice, wanted, agreed, approved or chose. Do not pad to meet the target.'}
 };
}

/** Deliberately narrow language domain; the separate factual reference owns events. */
export function endingReactionIssues(w:EmotionalWorld,id:string,b:EmotionalBlock){
 if((w.endingPolicy==='outcome-reactions-1'||w.endingPolicy==='outcome-reactions-2'))return outcomeReactionIssues(w,id,b);
 if(!isPresentEnding(w,id))return [];
 const issues:string[]=b.passages?[]:['Present-reaction contract: bound passages are required.'],parts=b.passages?.flatMap(p=>[p.lead??'',p.text,p.tail??''].map(text=>({text,narrator:p.speaker==='NARRATOR'})))??[{text:b.text,narrator:false}];
 const forbidden=/\b(?:remember(?:s|ed|ing)?|recall(?:s|ed|ing)?|recollect(?:s|ed|ion)?|memories|authori[sz](?:e|ed|ation)|blessing|assent|accord|sanction(?:ed)?|backing|agree(?:d|ment|s|ing)?|approv(?:e|ed|al|es|ing)|consent(?:ed|s)?|permission|permit(?:s|ted)?|promis(?:e|ed|es)|want(?:s|ed)?|wish(?:ed|es)?|hop(?:e|ed|es)|ask(?:ed|s)?|cho(?:se|sen|ice|ices|ose|oses)|decid(?:e|ed|es)|decisions?|destinations?|display(?:ed|s|ing)?|public(?:ly)?|private(?:ly)?|boards?|box(?:es)?|deposit(?:ed|s)?|archive(?:d|s)?|custod(?:y|ian)|creat(?:or|ed|e)|recipients?|made|drew|drawn|paint(?:ed|ing)|drawings?|pictures?|sheet|work|paper|table|bench|room|window|lamp|door|envelope|explanation|note|record|read|reading|invit(?:e|ed|ation)|handed|sent|received|collected|retrieved|opened|closed|placed|posted|pinned|signed|thank(?:s|ed|ing)?|was|were|had|did|felt|thought|said|spoke|meant|expected|imagined|earlier|previous|before|after|yesterday|tomorrow|later|soon|will|shall|should|must|please|everyone|nobody|somebody|someone|others)\b|\b(?:didn|wasn|weren|hadn)[’']t\b|\b(?:I|you|they|we)[’']d\b/iu;
 const people=[w.player_name,w.host.name,w.recipient.name];
 for(const {text,narrator} of parts){
  const domainText=endingDomainText(w,text,narrator);
  if(text.includes('?'))issues.push('Present-reaction contract: use present declarative reactions, not questions or future speculation.');
  if(forbidden.test(domainText)||/\b(?:hold|holds|keep|keeps)\s+(?:it|this|that)\b/iu.test(text))issues.push('Present-reaction contract: events, retrospective wishes, permissions and material references belong to the engine ending, not emotional prose.');
  if([w.host.name,w.recipient.name].some(name=>containsIdentity(text,name)||firstNameIsUnambiguous(name,people)&&containsIdentity(text,name.split(' ')[0]!)))issues.push('Present-reaction contract: use only the protagonist in narration and first-person feelings in speech; the server names the speakers.');
 }
 if(b.passages?.some(p=>p.lead||p.tail))issues.push('Present-reaction contract: staging fields must stay empty.');
 if(b.passages?.some(p=>p.speaker!=='NARRATOR'&&(!/^I(?: (?:feel|am|remain|sense|notice|find)|[’']m)\b/u.test(p.text)||/\b(?:you|your|yours|yourself|we|us|our|ours|ourselves|they|them|their|theirs|he|him|his|she|her|hers)\b/iu.test(p.text))))issues.push('Present-reaction contract: speech expresses only the speaker own present feeling, starting with I and a present emotional predicate.');
 return [...new Set(issues)];
}


/** New stories end in one grounded beat, not six variations on a feeling. */
export const outcomeParagraphCount=(id:string)=>/^F[12]$/u.test(id)?3:2;
export function outcomeVoice(id:string,n:number){return /^F[12]$/u.test(id)&&n>1?(n===2?(id==='F1'?'HOST':'RECIPIENT')+'>PLAYER':'PLAYER>'+(id==='F1'?'HOST':'RECIPIENT')):'NARRATOR>NONE';}
function outcomeReactionRequest(w:EmotionalWorld,id:string,options:Parameters<typeof endingReactionRequest>[2]):MetaRequest{
 const placement=emotionalScopes[id]?.facts.work;if(!/^F[1-6]$/u.test(id)||!['PUBLIC','BOX','PLAYER'].includes(String(placement)))throw Error('An engine ending outcome is required.');
 const wire=flatParagraphPlan(options.plan),properties=Object.fromEntries(Object.keys(wire).map(key=>[key,/_(?:lead|tail)$/u.test(key)?{type:'string',enum:['']}:stringSchema]));
 const consequence=placement==='PUBLIC'?'The work is already public. PLAYER no longer controls its audience.':placement==='BOX'?'The work is out of sight inside the closed private box; there is no retrieval or delivery tonight.':'PLAYER still holds the work and retains its responsibility. No public display or deposit occurred.';
 const request:MetaRequest={key:options.key,model:'muse-wonder-1.0',maxTokens:1200,schema:objectSchema(properties),
  instructions:'Write a brief literary English closing reaction grounded in the supplied engine result. All participants use singular they/them/their, never he/him/she/her. Every NARRATOR field is third-person narration about the named protagonist, NEVER I/we/you. Only bound speech may use I. No invented approval, past conversation, motive, memory or wish belonging to another person. Do not change or replay the outcome. No other people, new action, future task or prediction. No therapy, advice or emotional synonym lists. Follow the exact field voices and stop naturally.',
  payload:{task:options.repairPass?'repair':'block',block:id,reaction_contract:w.endingPolicy,...(options.repairPass?{repair_pass:options.repairPass}:{}),profile:{intensity:options.intensity,exclusions:[...options.exclusions]},protagonist:w.player_name,current_outcome:{source:'engine',placement,actor:'PLAYER',consequence},paragraphs:Object.keys(options.plan).length,target_words:Math.max(1,Math.min(80,options.words)),paragraph_plan:options.plan,
   wire_plan:Object.fromEntries(Object.entries(wire).map(([key,value])=>[key,/_(?:lead|tail)$/u.test(key)?'empty string':value==='third-person narration'?w.player_name+' / they: THIRD PERSON narration; never I/we/you. One concrete response to the completed outcome.':value+'; this speaker own short present response only, at most35 words. No tag or quotation marks.'])),
   scene_beats:Object.fromEntries(Object.keys(options.plan).map((key,i)=>[key,i===0?'Notice one human cost of THIS completed outcome, without restating its action.':i===1?'Respond once to that specific cost. Keep the fixed voice; do not add a second list of feelings.':'A brief honest reply leaves one personal interpretation open, without explaining it again.'])),
   instruction:'Aim for about60–80 words TOTAL, including all paragraphs; never expand to meet a minimum. The assembled ending must remain at most110 words including server attribution. Lead/tail are empty. Ground the feeling in the consequence, not in an imagined history. Do not paraphrase the same feeling twice, add balancing synonyms or phrases like today still / in this moment / quietly unresolved merely for length. Public outcome is not prior consent; closed-box outcome is not delivery; keeping is not someone else responsibility. Narrator: third-person they/them ONLY. Speech: the fixed speaker own present response, no commands or questions.'}
 };
 if(w.endingPolicy==='outcome-reactions-2'){
  const p=request.payload as Record<string,any>,names:Record<string,string>={PLAYER:w.player_name,HOST:w.host.name,RECIPIENT:w.recipient.name};
  p.physical_scene={medium:'one physical unframed drawing on a single loose sheet',material:w.work.visual?.material??'paper',venue:'one indoor physical room',public_display:'a static physical pinboard inside this room, never online or electronic',private_box:'a closed physical deposit box; no retrieval or delivery tonight',camera:'No phone, screen, page refresh, posts, metrics, authored sentences, extra pages, new positions or object handling. Do not add actions or past work.'};
  p.authorship={creator:'the artist',recipient:'the intended recipient',custodian:w.player_name,boundary:'These refer to the established people, not additional participants. The protagonist is entrusted with another person drawing, never its author. This identifies roles only: do not retell its creation or add any motive, wish or history.'};
  p.current_outcome.actor=w.player_name;
  p.current_outcome.consequence=consequence.replaceAll('PLAYER',w.player_name);
  if(placement==='PUBLIC')p.audience_boundary={first_reader:'NOT_SUPPLIED',order:'NOT_SUPPLIED',activity:'NOT_SUPPLIED',instruction:'Public is the placement, not an audience event. Do not add a viewer, arrival, first reading, or claim that one person interprets or names the drawing before another. React to the protagonist not controlling meaning, without inventing who looks or speaks first.'};
  p.wire_plan=Object.fromEntries(Object.entries(wire).map(([key])=>{const n=Number(key.slice(1,3)),[speaker,listener]=Object.values(options.plan)[n-1]!.split('>');return[key,/_(?:lead|tail)$/u.test(key)?'empty string':speaker==='NARRATOR'?'Third-person narration about '+w.player_name+' using they/them; one internal response to the physical outcome, no I/we/you, no new action.':names[speaker!]+' speaks to '+names[listener!]+'. ONLY '+names[speaker!]+' own words: I/me means '+names[speaker!]+'; you means '+names[listener!]+'. No self-address or narration, maximum35 words.'];}));
  request.instructions='Write a short literary English closing in the SAME PHYSICAL ROOM as the supplied outcome. The work is one drawing on paper, never a text, book, phone, screen or online publication. The named protagonist is entrusted with the drawing, never its author. Use the resolved authorship terms when a reference is necessary, without retelling creation. Never print role or schema labels in fiction: those belong only to the structured voice plan. Follow the exact field speaker/listener. Narrator is third person they/them; never I/we/you or he/she. Natural bound speech may address its listener as you. Describe one human consequence of the settled outcome, not new movement, handling, audience activity or history. No prior agreement, approval, remembered wish, motive or creation story. Do not invent objects, positions, digital metrics or a next task. An unresolved interpretation of the drawing is allowed; a promised or predicted material event is not. Stop naturally, no emotional synonym lists or padding.';
  if(placement==='PUBLIC')request.instructions+=' No audience order is supplied. Do not invent first viewers, strangers interpreting ahead of the recipient, or anyone getting to name the work first. A public drawing does not establish who has or has not seen or interpreted it.';
  p.instruction='About60–80 words TOTAL, maximum110 including server attribution; no minimum to fill. Narrator may use ordinary literary past or present to describe this current reaction. A present resolve such as I will not pretend is not a future task. An explicitly hypothetical alternative may belong only to the named protagonist; never infer what the creator or recipient wished. Meaning may remain open: what a reader will find or see IN THE DRAWING is interpretation, never a forecast of finding an object. Prefer uncertainty over predictions or guaranteed emotional effects. Keep the material outcome fixed. No invented earlier approval, motive, memory or dialogue. No future tasks, requests, promises, scene/object/body handling, new audience or positions, including with contractions or going to. Write one specific internal consequence, then one brief reply or changed thought. Do not restate the engine action or balance lists of feelings.';
  if(id==='F6'&&w.retainedVisibility==='unchanged'){
   Object.assign(p.current_outcome,{visibility:'VARIES_WITH_ROUTE',companion:'VARIES_WITH_ROUTE'});
   p.retention_boundary='Retaining the work does not conceal it. The sheet is not hidden or made unseen by this outcome. Earlier viewing and an invited companion may already exist, but neither current attention nor its absence is guaranteed across these routes. Do not claim other eyes are absent or present. The personal consequence is still being answerable for the work, not preventing others from seeing it.';
   request.instructions+=' Retaining custody does not change visibility. Do not turn keeping into hiding, privacy, an unseen work, withheld viewing or absence of other readers. React only to the protagonist remaining responsibility without inventing what others currently see.';
  }
  if(options.repairPass)p.repair_guidance=closingRepairGuidance(options.repairFeedback??[]);
 }
 return request;
}

/** Only a closed vocabulary crosses the repair boundary. Never echo a failed
 * paragraph or an unrecognised diagnostic, even if it contains a known prefix. */
function closingRepairGuidance(feedback:readonly string[]){
 const rules=[
  {code:'resolved_references',prefixes:['Use fictional names or natural references, never state-ledger role labels.'],instruction:'A role identifier leaked into prose. Use the resolved authorship terms or the named protagonist, never identifiers from the structured plan. Do not add an absent name, actor or speech.'},
  {code:'audience_boundary',prefixes:['The engine supplies no audience order, first reader or new viewer activity.'],instruction:'Remove the invented audience chronology. Public placement supplies no first viewer, priority of interpretation, arrival or new audience activity. Do not claim someone sees, reads, names or interprets the work before anyone else. React only to the protagonist current loss of control over meaning.'},
  {code:'present_reaction',prefixes:['Outcome closing: no reconstructed history','Invented creation purpose:','No previous support, settlement, preference or dialogue is supplied.'],instruction:'The closing reconstructed history or a creation account. Do not explain who made the drawing or why. Write one current personal reaction to the settled outcome, without earlier words, agreement, motive or wishes.'},
  {code:'settled_outcome',prefixes:['Outcome closing contradicts the engine placement.','Outcome closing: do not invent a future event','Retaining custody does not hide the work','The outcome concerns one physical drawing','Only PLAYER chose the material outcome'],instruction:'Preserve exactly the supplied current outcome. Only the protagonist chose it. Do not add movement, handling, delivery, visibility, attendance, digital publication, a promise or a future task. Personal interpretation may remain uncertain.'},
  {code:'fixed_voices',prefixes:['Outcome closing: the server names the fixed speakers','Outcome closing narrator is third person','Outcome closing: use stable singular they/them/their.','Outcome closing staging fields must stay empty.','Keep the spoken line short.','Bound voice:'],instruction:'Narration is third-person about the named protagonist, using singular they/them/their, never I/we/you or gendered pronouns. Speech contains only the fixed speaker own words, at most35 words. Keep staging fields empty; do not name or stage another person.'},
  {code:'public_reaction_only',prefixes:['An omitted variable record was introduced.','Reaction knowledge and record status belong to the engine facts','The reaction cannot add depicted content or a pose.'],instruction:'Remove any reference to an explanation, envelope or its contents, reading, status or knowledge. Do not add or describe depicted details. This closing receives only its current material outcome and the protagonist reaction.'},
  {code:'compact_closing',prefixes:['Keep the closing at most110 words'],instruction:'Shorten the whole closing to one distinct personal response. Do not restate feelings or expand to reach a minimum; keep the supplied word ceiling.'}
 ];
 const selected=rules.filter(rule=>feedback.some(message=>rule.prefixes.some(prefix=>message.startsWith(prefix))));
 const safe=selected.length?selected:[rules.find(rule=>rule.code==='present_reaction')!];
 return{codes:safe.map(rule=>rule.code),instructions:safe.map(rule=>rule.instruction)};
}
function internalJudgmentText(w:EmotionalWorld,id:string,b:EmotionalBlock,p:EmotionalPassage,text:string){
 if(id!=='F5'||p.speaker!=='NARRATOR')return text;
 const prior=(b.passages??[]).slice(0,b.passages!.indexOf(p)).map(p=>[p.lead??'',p.text,p.tail??''].join(' ')).join(' ');
 const people=[w.player_name,w.host.name,w.recipient.name];
 const others=[w.host.name,w.recipient.name].flatMap(name=>[name,...(firstNameIsUnambiguous(name,people)?[name.split(' ')[0]!]:[])]);
 return text.replace(/\b((?:that|this|the)\s+(?:uncertainty|doubt|unease|feeling|thought|hesitation|openness))\s*,\s*they\s+decided\s*,(?=\s*(?:was|is|seemed|seems|felt|feels|remained|remains)\s+(?:(?:still|entirely|quite)\s+){0,2}(?:personal|honest|uncomfortable|real|unresolved|tolerable|uncertain)(?:\s+enough\s+to\s+leave\s+undisturbed)?\s*(?:[.!?;]|$))/giu,(match,subject:string,offset:number)=>{
  const before=endingDomainText(w,prior+' '+text.slice(0,offset),true),last=before.lastIndexOf('PROTAGONIST'),binding=last<0?before:before.slice(last);
  const competing=/\b(?:artist|creator|maker|recipient|guest|we|us|our)\b/iu.test(binding)||others.some(name=>containsIdentity(binding,name));
  const coordinated=last>=0&&/\b(?:and|with)\s*$/iu.test(before.slice(0,last));
  return competing||coordinated?match:subject+', in their judgment,';
 });
}

function outcomeReactionIssues(w:EmotionalWorld,id:string,b:EmotionalBlock){
 if(!/^F[1-6]$/u.test(id))return[];
 const issues:string[]=[];if(!b.passages)issues.push('Outcome closing requires bound passages.');
 if(id==='F6'&&w.retainedVisibility==='unchanged'&&unsupportedRetainedVisibility(w,b.text))issues.push('Retaining custody does not hide the work or establish an absence of viewers. Leave visibility and attendance unspecified.');
 if(w.endingPolicy==='outcome-reactions-2'&&unsupportedAudienceOrder(w,b.text))issues.push('The engine supplies no audience order, first reader or new viewer activity.');
 if(narrativeWords(b.text)>110)issues.push('Keep the closing at most110 words including attribution; remove repeated feelings rather than padding.');
 const strictPast=/\b(?:remember(?:s|ed|ing)?|recall(?:s|ed)?|recollect(?:s|ed|ion)?|blessing|assent|accord|authori[sz](?:e|ed|ation)|approv(?:e|ed|al)|agreed|agreement|consent|permission|promised|wanted|wished|asked|was|were|had|did|felt|thought|said|spoke|meant|expected|imagined|earlier|previous|yesterday|tomorrow|later|soon|shall|should|must|please|everyone|nobody|somebody|someone|others|made|drew|created)\b/iu;
 const grounded=w.endingPolicy==='outcome-reactions-2',past=grounded?/\b(?:remember(?:s|ed|ing)?|recall(?:s|ed)?|recollect(?:s|ed|ion)?|blessing|assent|accord|authori[sz](?:e|ed|ation)|approv(?:e|ed|al)|agreed|agreement|consent|permission|promised|wanted|wished|asked|earlier|previous|yesterday|tomorrow|later|soon|shall|should|must|please|everyone|nobody|somebody|someone|made|drew|created)\b/iu:strictPast;
 for(const p of b.passages??[]){const text=[p.lead??'',p.text,p.tail??''].join(' ');
  if(p.lead||p.tail)issues.push('Outcome closing staging fields must stay empty.');
  // A parenthetic judgment about an internal feeling does not choose a
  // material outcome. Keep the original text for all other checks/rendering.
  const choiceText=grounded?internalJudgmentText(w,id,b,p,text):text;
  let comparison=endingDomainText(w,choiceText,p.speaker==='NARRATOR').replace(grounded?/\bwill not pretend\b/giu:/$^/u,'refuses to pretend');
  if(grounded){
   // The narrator may imagine PLAYER's own alternative, never infer an
   // omitted person's preference. An explicit protagonist and no competing
   // human referent are required before interpreting "they" as PLAYER.
   if(p.speaker==='NARRATOR'&&/^\s*PROTAGONIST\b/u.test(comparison)&&! /\b(?:recipient|creator|maker|person|friend|guest|visitor|stranger|adult|audience|reader|viewer|someone|somebody)\b/iu.test(comparison))comparison=comparison.replace(/\bthey\s+might\s+have\s+wished\s+otherwise\b/giu,'their own hypothetical alternative');
   comparison=comparison.replace(/\bmade\s+(?:the|this|that)\s+(?:work|drawing|sheet|piece|trust|care|responsibility)\s+feel\b/giu,'changed the feeling');
   if(p.speaker==='NARRATOR')comparison=comparison.replace(/\b(?:the\s+)?(?:artist|creator|maker)[’']s\s+(?:drawing|work|piece|sheet)\s+entrusted\s+to\s+them\s+rather\s+than\s+(?:made|drawn|painted|created)\s+by\s+them(?=\s*(?:[,.;!?]|$))/giu,(match,offset:number)=>{
    const clause=comparison.slice(0,offset).split(/[.!?;]/u).at(-1)!;
    return /\bPROTAGONIST[’']s\s+responsibility\s*,\s*$|\bPROTAGONIST\s+(?:remained|remains|stayed|stays|is|was)\s+responsible\s*,\s*$/u.test(clause)?'the existing work in their care':match;
   });
   if(p.speaker==='HOST')comparison=comparison.replace(/\b(?:the|this|that)\s+(?:work|drawing|sheet|piece)\s+I\s+(?:made|drew|created)\b(?!\s*[,;:]?\s*(?:because|to|for|when|after|before|while|during)\b)/giu,'the existing artwork');
  }
  if(grounded){
   comparison=comparison.replace(/\b(I|you|we|they)[’'](ve|d)\b/giu,(_all,person:string,aux:string)=>person+(aux.toLowerCase()==='ve'?' have':' had'));
   comparison=interpretivePermissionText(comparison,(b.passages??[]).map(part=>[part.lead??'',part.text,part.tail??''].join(' ')).join(' '));
  }
  if(past.test(comparison)||text.includes('?'))issues.push('Outcome closing: no reconstructed history, agreement, motive or new actor.');
  const listenerAliases=grounded?closingListenerAliases(w,id,p.speaker,p.addressee):[];
  if(grounded?hasOutcomeFutureEvent(comparison,listenerAliases):/\bwill\b/u.test(comparison))issues.push('Outcome closing: do not invent a future event, task, promise or predicted emotional result; only interpretation may remain open.');
  if(/\b(?:he|she|him|his|her|hers|himself|herself)\b/iu.test(text))issues.push('Outcome closing: use stable singular they/them/their.');
  if(p.speaker==='NARRATOR'&&/\b(?:I|we|us|our|you|your)\b/iu.test(p.text))issues.push('Outcome closing narrator is third person, never first-person or generic you.');
  if(!grounded&&p.speaker!=='NARRATOR'&&/\b(?:you|your|we|us|our|they|them|their|he|she)\b/iu.test(p.text))issues.push('Outcome closing speech describes only its speaker own present response.');
  let namedText=text;
  for(const alias of listenerAliases){const name=alias.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
    // Strip only an unmistakable vocative in speech, never narration or a
    // named subject followed by an action or relative clause.
    namedText=namedText.replace(new RegExp('(^[“"\\s]*|,\\s*)'+name+'(?=\\s*[.!?…](?:[”"]?)(?:\\s|$)|\\s*[,;]\\s*(?:(?:and|but)\\s+)?(?:I|you|my|your|we|thank)\\b)','giu'),'$1the listener');
  }
  if([w.host.name,w.recipient.name].some(name=>containsIdentity(namedText,name)))issues.push('Outcome closing: the server names the fixed speakers; do not stage other people.');
  if(grounded&&(/\b(?:you|we|they|I|PROTAGONIST)\s+(?:(?:had|have|already|once|both|all)\s+){0,3}(?:supported|endorsed|blessed|assured|promised|approved|agreed|hoped|wanted|wished)\b|\b(?:we|they)\s+(?:(?:had|have|already|once|both|all)\s+){0,3}(?:settled|chose|decided)\b|\b(?:you|we|they|I|PROTAGONIST)\s+(?:(?:had|have|already|once|both|all)\s+){0,3}(?:said|told)\b(?!\s+(?:nothing|no more)\b)|\b(?:did|used to)\s+(?:want|hope|wish)\b/iu.test(comparison)||/\b(?:the creator|the recipient|HOST|RECIPIENT)\s+(?:(?:had|has)\s+)?(?:chose|decided)\b/iu.test(comparison)||p.speaker!=='PLAYER'&&/\bI\s+(?:(?:had|have|already)\s+)?(?:chose|decided|displayed|deposited)\b/iu.test(p.text)))issues.push('No previous support, settlement, preference or dialogue is supplied. Only PLAYER resolved the engine outcome.');
  if(grounded&&/\b(?:screens?|phones?|online|digital|refresh(?:es|ed|ing)?|finished pages|own sentences|numbers (?:climb|rise|gather))\b/iu.test(text))issues.push('The outcome concerns one physical drawing, not digital publication, text pages or screen activity.');
  if(grounded&&/\b(?:we|they)\s+(?:(?:both|all)\s+)?(?:chose|decided)\b/iu.test(choiceText))issues.push('Only PLAYER chose the material outcome; no collective decision is supplied.');
  if(contradictsOutcome(w,id,text))issues.push('Outcome closing contradicts the engine placement.');
 }
 return[...new Set(issues)];
}

/** Recognised interpretive clauses remove only their future auxiliary from
 * comparison. Adjacent actions and the rest of the clause remain checked.
 * This is a bounded language guard, not a proof of literary coherence. */
function hasOutcomeFutureEvent(text:string,listeners:readonly string[]=[]){
 const normalized=text.replace(/\bI[’']ll have to let that stand\b/giu,'I accept that').replace(/\bwon[’']t\s+pretend\b/giu,'refuses to pretend').replace(/\b(I|you|we|they|he|she|it)[’']ll\b/giu,'$1 will');
 const meaning=/\b(?:it|(?:the|this|that|your|my|their)\s+(?:drawing|work|artwork|piece))\s+will\s+mean\s+what\s+it\s+means\b/giu;
 // Only an explicitly uncertain reading of the drawing can be open. A colon
 // or copula that supplies a finding is not uncertainty. If a container is
 // named, "it" cannot safely be assumed to mean the drawing.
 const vocative=listeners.length?'(?:,\\s*(?:'+listeners.map(name=>name.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&')).join('|')+'))?':'';
 const reading=new RegExp('\\b(?:refuses? to pretend(?: I know)?|cannot (?:decide|know|say|tell)|do not know|can[’\']t (?:decide|know|say|tell))\\s+what\\s+(?:I|you|they)\\s+will\\s+(?:find|see|notice)\\s+in\\s+(?:it|(?:the|this|that|your|my|their)\\s+(?:drawing|work|artwork|piece))\\b'+vocative+'(?=\\s*(?:[.!?;]|$))','giu');
 const meaningText=normalized.replace(meaning,clause=>clause.replace(/\bwill\b/u,'may'));
 const interpretation=/\b(?:box|archive|envelope|container|package)\b/iu.test(text)?meaningText:meaningText.replace(reading,clause=>clause.replace(/\bwill\b/u,'may'));
 const comparison=interpretation.replace(/\bI[’']ll have to let that stand\b/giu,'I accept that');
 return /\bwill\b/u.test(comparison)||/\b(?:I|we|you|they|PROTAGONIST)\s+(?:do\s+)?promis(?:e|es)\b(?!\s+(?:nothing|no)\b)|\b(?:I|you|we|they|he|she|it)[’']ll\b|\b(?:(?:I|you|we|they|he|she|it)\s+(?:am|are|is)|I[’']m|(?:you|we|they)[’']re|(?:he|she|it)[’']s)\s+(?:going|about)\s+to\b/iu.test(comparison);
}

function closingListenerAliases(w:EmotionalWorld,id:string,speaker:string,addressee:string){
 const fixed=id==='F1'?['PLAYER','HOST']:id==='F2'?['PLAYER','RECIPIENT']:[];
 if(!fixed.includes(speaker)||!fixed.includes(addressee)||speaker===addressee)return[];
 const listener=addressee==='HOST'?w.host.name:addressee==='RECIPIENT'?w.recipient.name:w.player_name;
 const people=[w.player_name,w.host.name,w.recipient.name];
 return[...new Set([listener,...(firstNameIsUnambiguous(listener,people)?[listener.split(' ')[0]!]:[])])];
}

/** Recognise the independent interpretive clause, never an attributed rule.
 * The recorded neutral continuation is bounded to its sentence. Other prose,
 * instructions, permission holders and adjacent actions retain their tokens. */
function interpretivePermissionText(text:string,context:string){
 if(/\b(?:confirmed|confirmation|instructed|instructions?|directed|told|said|explained|suggested|insisted|requested|specified|asserted|stated|declared|assured|authori[sz]ed|approved|agreed|promised)\b/iu.test(context))return text;
 const neutral=',\\s+and\\s+the\\s+intended\\s+recipient\\s+might\\s+be\\s+imagined\\s+through\\s+marks\\s+that\\s+had\\s+never\\s+claimed\\s+to\\s+reveal\\s+a\\s+private\\s+mind';
 const clause=new RegExp('(?:^\\s*|(?<=[.!?;])\\s+)(?:any|a|another|each)\\s+(?:reading|interpretation)\\s+(?:may|might|could|can)\\s+(?:settle|sit|stand)\\s+(?:beside|alongside)\\s+the\\s+(?:artist|creator)[’\']s\\s+(?:lines|marks)\\s+without\\s+permission\\b(?=\\s*(?:[.!?;]|$)|'+neutral+'\\s*(?:[.!?;]|$))','giu');
 return text.replace(clause,match=>match.replace(/permission$/u,'control'));
}

/** A public placement establishes no first reader or sequence of viewers. */
function unsupportedAudienceOrder(w:EmotionalWorld,text:string){
 const names=[w.player_name,w.host.name,w.recipient.name].map(name=>name.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&'));
 const ranked='(?:the )?(?:next|first|last) (?:reader|viewer)';
 const human='(?:strangers?|someone(?: else)?|anyone(?: else)?|others|other (?:readers?|viewers?|people)|'+ranked+'|the (?:artist|creator|intended recipient|recipient)|you|I|they|'+names.join('|')+')';
 const auxiliary='(?:(?:can|could|may|might|will|would|gets?|got|to|already|still|now|ever)\\s+){0,5}';
 const read='(?:see|sees|saw|view|views|viewed|read|reads|interpret(?:s|ed)?|name(?:s|d)?|decid(?:e|es|ed)|look(?:s|ed)?(?: at)?)';
 const object='(?:(?:the|this|that|your|my|their)\\s+(?:drawing|work|artwork|sheet|piece)|it|'+w.work.name.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&')+')';
 const work='(?:'+object+'|what\\s+'+object+'\\s+(?:means?|meant))';
 // Bind the reading to its object: "I can see that costs you the last say"
 // describes a feeling, not a last reader. Never scan blindly to an ordinal.
 return new RegExp('\\b'+human+'\\s+'+auxiliary+read+'\\s+'+work+'(?:\\s+(?:first|last|next)\\b|[^.!?;]{0,70}\\b(?:before|after|ahead of)\\s+'+human+'\\b)','iu').test(text)
  ||new RegExp('\\b'+human+'\\s+'+auxiliary+'(?:first|last|next)\\s+'+read+'\\s+'+work+'\\b','iu').test(text)
  ||new RegExp('\\b'+ranked+'\\s+'+auxiliary+read+'\\s+'+work+'\\b','iu').test(text);
}

function endingDomainText(w:EmotionalWorld,text:string,narrator:boolean){
 const people=[w.player_name,w.host.name,w.recipient.name];
  // Canonical names are identities, regardless of the intervening adverbs.
  // A capitalized future question must not masquerade as protagonist Will.
  const identities=[w.player_name,...(firstNameIsUnambiguous(w.player_name,people)?[w.player_name.split(' ')[0]!]:[])];
  let domainText=text;
  if(narrator)for(const name of new Set(identities)){
   const escaped=name.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
   const input=domainText;domainText=input.replace(new RegExp('(?<![\\p{L}\\p{N}_])'+escaped+'(?![\\p{L}\\p{N}_])','gu'),(identity:string,offset:number)=>{
    const following=input.slice(offset+identity.length);
    return identity==='Will'&&/^\s+(?:I|you|he|she|it|we|they|there|the|a|an|this|that|these|those|his|her|our|your|their|[A-Z][a-z]+)\b/u.test(following)?identity:'PROTAGONIST';
   });
  }
 return domainText;
}

/** A retained sheet has no new visibility state. This guard recognises direct
 * assertions, not a person's unseen feeling or uncertainty about attention. */
function unsupportedRetainedVisibility(w:EmotionalWorld,text:string){
 const title=w.work.name.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
 const work='(?:(?:the|this|that)\\s+)?(?:drawing|work|sheet|artwork|piece|'+title+')';
 const hidden=new RegExp('^'+work+'\\s+(?:(?:still|now)\\s+)?(?:is|was|remains?|remained|stays?|stayed|lies?|lay)\\s+(?:(?:still|now)\\s+)?(?:unseen|hidden|concealed|out of sight|unwatched|unviewed)\\b','iu');
 const without=new RegExp('^without\\s+(?:any\\s+)?(?:other eyes|other viewers|an audience|other readers)\\s+(?:on|for)\\s+'+work+'\\b','iu');
 const nobody=new RegExp('^(?:no (?:other )?(?:eyes|viewers|readers)|no one|nobody)\\s+(?:(?:can|could)\\s+)?(?:see|sees|saw|view|views|viewed)\\s+'+work+'\\b','iu');
 const people=[w.player_name,w.host.name,w.recipient.name],aliases=[w.player_name,...(firstNameIsUnambiguous(w.player_name,people)?[w.player_name.split(' ')[0]!]:[])].map(name=>name.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&'));
 const personalReading=new RegExp('^\\s+(?:(?:quite|exactly)\\s+)?as\\s+(?:'+aliases.join('|')+')\\s+(?:does|can)\\s*[.!?]?$','iu');
 return text.split(/(?<=[.!?;])\s+/u).some(sentence=>{
  const direct=sentence.replace(/^[“"\s]+/u,'');if(hidden.test(direct)||without.test(direct))return true;
  const absence=nobody.exec(direct);
  // "Nobody sees it quite as PLAYER does" concerns personal interpretation.
  // The complete tail must be that comparison: no colon or extra material
  // clause can turn it into permission for an invisible or hidden drawing.
  return !!absence&&!personalReading.test(direct.slice(absence[0].length));
 });
}

/** Only assertions about the work carry placement; a feeling can be public. */
function contradictsOutcome(w:EmotionalWorld,id:string,text:string){
 const expected=emotionalScopes[id]?.facts.work;
 const title=w.work.name.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
 const subject='(?:(?:the|this|that)\\s+)?(?:work|sheet|drawing|artwork|piece|'+title+')';
 const claims=new RegExp('(?:^|(?<=[^\\p{L}]))'+subject+'\\s+(?:(?:still|already|now)\\s+)?(?:is|stays|remains|rests|lies|sits)\\s+([^.!?;]+)','giu');
 for(const m of text.matchAll(claims)){
  // Comparisons do not assert another destination. Shared-subject "but/and"
  // clauses do, with their own negation; a new human subject is not the work.
  const asserted=m[1]!.split(/\b(?:rather than|instead of)\b/iu)[0]!;
  for(const clause of asserted.split(/,|\b(?:but|and|while|whereas|although|though|yet)\b/iu)){
   const complement=clause.trim().replace(/^(?:(?:still|already|now)\s+)+/iu,''),negative=/^(?:not|never|no longer)\b/iu.test(complement);
   const positive=complement.replace(/^(?:not|never|no longer)\s+/iu,'');
   const place=/^(?:public|displayed|on (?:the )?(?:public )?(?:display )?board)\b/iu.test(positive)?'PUBLIC':/^(?:in|inside|within)\s+(?:(?:the|a|closed|private)\s+)*box\b/iu.test(positive)?'BOX':/^(?:in|within)\s+[^.!?;]{0,45}\b(?:hands|keeping|custody)\b/iu.test(positive)?'PLAYER':null;
   if(place&&(negative?place===expected:place!==expected))return true;
  }
 }
 return false;
}
