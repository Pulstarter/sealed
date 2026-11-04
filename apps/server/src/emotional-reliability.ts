import {authoringProjection} from './emotional-scene-authoring.js';
import type {EmotionalWorld} from '../../../packages/engine/src/emotional-types.js';
import {replaceIdentityReference,maskCanonicalLabels,firstNameIsUnambiguous} from './emotional-identities.js';
import {compileEmotionalFacts,emotionalRoutes,emotionalScopes,emotionalProjection} from '../../../packages/engine/src/emotional.js';

export const narrativeWords=(s:string)=>(s.match(/\b[\p{L}\p{N}]+(?:[’'\-][\p{L}\p{N}]+)*\b/gu)??[]).length;
const routeBlocks=(r:string)=>['S1','D1'+r[0],'S2','D2'+r[1],'ARR'+r[0],'S3','D3'+r[2],r[2]==='B'?'F5':r[2]==='T'?'F6':r[1]!=='A'?'F4':r[0]==='A'?'F1':r[0]==='B'?'F2':'F3'];

/** Each route has 72 paragraph units; reserve room for its actual compiled facts. */
export function narrativeBudget(w:EmotionalWorld,id:string){
 if((w.endingPolicy==='outcome-reactions-1'||w.endingPolicy==='outcome-reactions-2')&&/^F[1-6]$/u.test(id))return {target:80,min:0,max:110};
 const facts:Record<string,Record<string,string|undefined>>=compileEmotionalFacts(w),sizes=emotionalRoutes.map(r=>routeBlocks(r).reduce((n,b)=>n+narrativeWords(facts[r]![b]??''),0));
 const min=Math.min(...sizes),max=Math.max(...sizes),total=((w.prosePolicy==='scene-prose-2'||w.prosePolicy==='scene-prose-3')?2250:2200)-(min+max)/2;
 const tolerance=Math.max(.01,Math.min(.065,(((w.prosePolicy==='scene-prose-2'||w.prosePolicy==='scene-prose-3')?140:180)-(max-min)/2)/total));
 const units=(w.prosePolicy==='scene-prose'||(w.prosePolicy==='scene-prose-2'||w.prosePolicy==='scene-prose-3'))?(id==='S1'||id==='S2'?22:id==='S3'||id.startsWith('F')?8:3):id==='S1'||id==='S2'?17:id==='S3'?15:id.startsWith('F')?11:3;
 const target=Math.round(total*units/72);
 return {target,min:Math.ceil(target*(1-tolerance)),max:Math.floor(target*(1+tolerance))};
}

export function reflectionProjection(w:EmotionalWorld,id:string,projection:{context:Record<string,any>;allowed_named_current_actors:string[]}){
 const c=projection.context;
 if(c.place){delete c.place.archive;delete c.place.private_box;}
 if(c.current_facts)for(const key of ['box_access','archive_access','box_door','archive_door'])delete c.current_facts[key];
 c.work={name:(c.work as Record<string,unknown>).name,material:w.work.visual?.material??'flat material',physical_contract:'One loose unframed flat piece, never a frame, glass, stack of pages or copies.',...(emotionalScopes[id]!.facts.work==='BOX'?{visibility:'Not visible inside the closed private box.'}:{visibility:'Already described in the factual scene; reactions may consider it, not describe its depicted contents.'})};

 delete c.reflection_values;
 const identities=[w.player_name,w.host.name,w.recipient.name];
 const knownWish=(wish:string)=>[['HOST',w.host.name,'the creator'],['RECIPIENT',w.recipient.name,'the intended recipient']].filter(([role])=>!projection.allowed_named_current_actors.includes(role!)).reduce((text,[,name,label])=>replaceIdentityReference(text,name!,identities,label!),wish);
 c.public_wishes=[{owner:'HOST',identity:projection.allowed_named_current_actors.includes('HOST')?w.host.name:'the creator',wish:knownWish(w.host.public_wish)},{owner:'RECIPIENT',identity:projection.allowed_named_current_actors.includes('RECIPIENT')?w.recipient.name:'the intended recipient',wish:knownWish(w.recipient.public_wish)}];
 if(w.narrationPolicy==='protagonist-camera-5'){
  const facts=emotionalScopes[id]!.facts;
  c.scene_logistics={
   invariant:'All three established adults are already inside this SAME ROOM for the whole adventure. Only compiled engine facts move them between its zones. An omitted identity is not outside, elsewhere in the building, upstairs or gone.',
   actors:Object.fromEntries(['HOST','RECIPIENT'].map(role=>[role,{at:facts[role==='HOST'?'host_at':'recipient_at']??'VARIES_INSIDE_ROOM',may_participate:projection.allowed_named_current_actors.includes(role)}])),
   invitation:{initiator:facts.invited==='NONE'?'NONE':facts.invited===undefined?'PLAYER_IF_ANY':'PLAYER',target:facts.invited??'VARIES_OR_NONE',rule:'Only the protagonist can initiate the viewing invitation; HOST may relay it to RECIPIENT. HOST never invited the protagonist. Do not invent, recall, reverse or replay an invitation in a reaction.'},
   camera:'Only allowed_named_current_actors can have current dialogue or body gestures. The other roles are static owners of known wishes, not background activities. This applies to names, pronouns, aliases and anonymous people. No anonymous crossing, movement or departure. Discuss wishes without staging their owner.'
  };
 }
 if(id==='ARRT')c.arrival_boundary='No invitation was sent. No guest moved to the viewing area. Both other adults remain in their original areas within the venue. Follow the protagonist’s reaction without claiming an empty room or staging a new arrival.';
 else if(id==='ARRA'||id==='ARRB')c.arrival_boundary='The engine has ALREADY moved the invited person from their previous area to the viewing bench WITHIN THIS SAME ROOM. They were already inside. Do not enter/re-enter the venue, leave through a door, or replay the arrival.';
 c.wish_presentation='These are known public preferences, never written notices, cards or labels on the board. Only the actual work and its original explanation can be displayed by the game.';
 c.wish_boundary='Each wish belongs ONLY to its labelled owner. Never swap them or invent a past remark or remembered wish for another owner. Reactions may compare these wishes without claiming they were spoken by someone else.';
 c.cast_boundary='Only the three established adults exist in the scene. Do not add a crowd, visitor, stranger, passer-by, or an anonymous encounter. Nobody new pauses, nods, enters or leaves.';
 c.visible_arrangement=emotionalScopes[id]!.facts.work==='BOX'?'The work is inside the closed private box.':emotionalScopes[id]!.facts.work==='PUBLIC'?'The work is already on the public display board.':'The protagonist retains the work.';
 delete c.visual_boundary;if(id==='S3')delete c.development;
 const solo=projection.allowed_named_current_actors.length===1;
 if(solo&&c.place)delete c.place.viewing;
 if(id.startsWith('F')&&c.place){delete c.place.private_box;if(emotionalScopes[id]!.facts.work!=='PUBLIC')delete c.place.public_display;}
 c.reaction_boundary='The complete depiction, actions, custody and attendance have ALREADY been narrated by the factual scene. Write present human reactions and the planned dialogue, never a description of depicted objects/figures, their pose, color or geometry. Do not invent physical events, objects, past meetings or new witnesses. Do not describe deposit mechanisms or slots. Use the actual room atmosphere and the known public wishes. No claim of current solitude or unprovided company. All three current participants use singular they/them/their; names disambiguate them. Never he/she/his/her for a participant.';
 if(solo)c.camera_boundary='Follow only the protagonist’s own sensations, attention and interpretation. Do not stage anyone else, named or unnamed; do not mention benches, seats or chairs, even as empty or occupied. This camera says nothing about who is actually nearby.';
 if(id.startsWith('F'))c.ending_boundary='The material placement is final and is stated just before this reaction. Do not reopen private/public/keeping as possibilities or ask where the work belongs or will go. Only the supplied interpretive question and a human response may remain open. Do not create written versions of spoken public wishes.';
 c.focus=id==='S1'?'The entrusted relationship and the competing public wishes; listening and small disagreement.':id==='S2'?'The creator’s admission: what attention asks of another person, without solving the private motive.':id==='S3'?'The protagonist weighs attention, exposure and restraint after the viewing; no pictured details or companion staging.':id.startsWith('F')?'One human closing beat in the settled present; develop its interpretive question without recapping options.':'A short present reaction to the completed choice, never replaying its material action.';
 if((w.prosePolicy==='scene-prose-2'||w.prosePolicy==='scene-prose-3'))authoringProjection(w,id,c);
}

function inventedFold(w:EmotionalWorld,text:string){
 const title=w.work.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const generic=/\bno longer folded between (?:their|the|both) hands\b|\b(?:fold(?:s|ed|ing)?|unfold(?:s|ed|ing)?|roll(?:s|ed|ing)?)\s+(?:(?:the|this|that|loose|flat|single)\s+){0,3}(?:sheet|paper|work|piece)\b/giu;
 const named=new RegExp('\\b(?:fold(?:s|ed|ing)?|unfold(?:s|ed|ing)?|roll(?:s|ed|ing)?)\\s+(?:(?:the|this|that)\\s+)?'+title+'(?![\\p{L}])','giu');
 const asserted=(source:string,pattern:RegExp)=>[...source.matchAll(pattern)].some(m=>{
  const before=source.slice(Math.max(0,m.index!-60),m.index!);
  if(/\b(?:not|never|didn[’']t)\s+(?:(?:ever|even|really|actually)\s+){0,2}$/iu.test(before))return false;
  return !/^[’']s\s+(?:implications?|meaning|significance|possibilities)\b/iu.test(source.slice(m.index!+m[0].length));
 });
 return asserted(text,named)||asserted(maskCanonicalLabels(text,[w.work.name,w.record.name,w.venue.name]),generic);
}

/** A static view of the engine's closed BOX after D3B supplies no operation.
 * Normalize only this complete observation for checks; never stored prose. */
export function reactionMaterialComparison(w:EmotionalWorld,id:string,text:string){
 if(id!=='D3B'||w.narrationPolicy!=='protagonist-camera-5'||w.factualPolicy!=='post-deposit-compact'||emotionalScopes[id]!.facts.work!=='BOX')return text;
 return text.replace(/\bthe\s+one(?:-|\s+)way\s+slot\s+(?:offered|offers)\s+no\s+view\s+back(?=\s*[.!?]|$)/giu,'the fixed closed surface was opaque');
}

export function reflectionIssues(w:EmotionalWorld,id:string,text:string){
 if(w.narrationPolicy!=='protagonist-camera-3'&&w.narrationPolicy!=='protagonist-camera-4'&&w.narrationPolicy!=='protagonist-camera-5')return[];
 const issues:string[]=w.narrationPolicy==='protagonist-camera-5'?continuityIssues(w,id,text):[];
 if(/\b(?:wishes|hopes|preferences)\s+(?:(?:were|are|lay|now|stood)\s+){0,2}(?:pinned|written|printed|posted)\b/iu.test(text))issues.push('Public preferences are not written notices or pinned cards. Do not invent a physical version.');
 if(/\b(?:pictured|rendered)\s+(?:(?:a|the|one|two|small|human)\s+){0,3}(?:figure|person|people)\b/iu.test(text))issues.push('The reaction cannot add depicted content or a pose.');
 if(/\b(?:figures?|persons?|people|subjects?)\b[^.!?]{0,35}\b(?:is|are|was|were)\s+(?:pictured|rendered)\b/iu.test(text))issues.push('The reaction cannot add depicted content or a pose.');
 if(/\b(?:holds?|held|keeps?|kept|adjusts?|adjusted|lifted)\s+(?:(?:a|the|their|small)\s+){0,3}frame\b|\bframe\b[^.!?]{0,24}\b(?:lap|knees?)\b/iu.test(text))issues.push('The flat work is unframed; do not hold or adjust an invented frame.');
 if((id==='S1'||id==='S2'||id.startsWith('D1'))&&/\b(?:pages|sheets)\b[^.!?]{0,40}\b(?:lap|knees?|keeping)\b/iu.test(text))issues.push('The work is one single piece, not a stack of pages.');
 for(const match of text.matchAll(/\b(?:someone else|somebody else|a visitor|a stranger|a passer-by|(?:the|a)\s+(?:small\s+)?crowd)\b[^.!?]{0,70}\b(?:paused|nodded|sat|stood|stepped|entered|arrived|moved|thinned|gathered|murmured|were|was|is|are)\b/giu))if(!/\b(?:might|could|may|would)\b/iu.test(match[0]))issues.push('The closed cast has no additional current participant or crowd.');
 if(/\bslots?\b/iu.test(reactionMaterialComparison(w,id,text)))issues.push('Deposit mechanisms and slot access are fixed by the factual scene, never invented in a reaction.');
 if(/\b(?:depicts?|depicted|human figure|figures?\s+(?:sat|sits|stood|stands|waited|waits)|(?:image|painting|drawing|picture|print)\s+(?:show(?:s|ed)?|held|contained|contains|depicted))\b/iu.test(text))issues.push('The reaction cannot add depicted content or a pose. The immutable depiction is already in the factual scene.');
 const solo=emotionalScopes[id]!.facts.guest_at_VIEWING===undefined||['D1T','ARRT','F3'].includes(id);
 const seatingText=maskCanonicalLabels(text,[w.work.name,w.record.name,w.venue.name,w.player_name,w.host.name,w.recipient.name]);
 if(solo&&/\b(?:bench(?:es)?|seats?|seating|chairs?)\b/iu.test(seatingText))issues.push('The reaction camera cannot stage seating or anonymous company; attendance varies or belongs to the factual scene.');
 if(solo&&/\b(?:someone|somebody|another person|others?)\s+(?:had\s+)?(?:sat|stood|shifted|moved|spoke|leaned|stepped|watched|waited)\b/iu.test(text))issues.push('The reaction camera cannot stage an unguaranteed anonymous participant.');
 if(/\b(?:he|she|him|his|her|hers|himself|herself)\b/iu.test(text))issues.push('Keep current participant references stable: use names and singular they/them/their pronouns.');
 const ownershipText=text.replace(/\brepair what belongs to (?:its|the) creator and the person the work is for\b/giu,(match,at:number)=>{
  const sentence=text.slice(0,at).split(/[.!?]/u).at(-1)!+match+text.slice(at+match.length).split(/[.!?]/u)[0];
  return /\b(?:in|on|inside|into|onto|at)\s+(?:(?:the|a|public|private|closed|display)\s+){0,3}(?:box|board|table|bench|archive|slot|display)\b|\b(?:displayed|deposited|will go|would go|be left)\b/iu.test(sentence)?match:'restore the existing gift relationship';
 });
 const people=[w.player_name,w.host.name,w.recipient.name];
 const emotionalActors=[...new Set(people.flatMap(name=>[name,...(firstNameIsUnambiguous(name,people)?[name.split(' ')[0]!]:[])]))].filter(name=>name.toLowerCase()!==w.work.name.toLowerCase()).map(name=>name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
 const emotionalExposure=emotionalActors.length?ownershipText.replace(new RegExp('(?:^|(?<=[^\\p{L}]))(?:'+emotionalActors.join('|')+')\\s+(?:feels?|felt)\\s+(?:(?:thanked|seen|exposed)\\s*,\\s*){0,3}displayed\\b','giu'),'a person felt exposed'):ownershipText;
 const workLabel=w.work.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const placementText=emotionalExposure.replace(new RegExp('\\bwhere\\s+(?:the\\s+)?'+workLabel+'\\s+belongs(?: tonight)? is (?:no longer|not) (?:in question|uncertain|unsettled)\\b','giu'),'The present destination is settled').replace(/\b(uncertainty|doubt|unease|feeling|thought|question|understanding|interpretation)\s+(?:(?:stays|remains)\s+)?where\s+it\s+belongs\b/giu,(match,noun:string)=>[w.work.name,w.record.name].some(title=>new RegExp('\\b'+noun+'\\b','iu').test(title))?match:'unresolved inward thought');
 if(id.startsWith('F')&&/\b(?:whether|where|might|would|could|perhaps)\b[^.!?]{0,130}\b(?:kept close in private|kept privately|displayed|posted|be left|will go|would go|belongs|noticed by strangers)\b/iu.test(placementText))issues.push('The ending must preserve settled material placement and custody; leave only interpretation open.');
 if((w.prosePolicy==='scene-prose-2'||w.prosePolicy==='scene-prose-3')){
  if((id==='F1'||id==='F2')&&[...text.matchAll(/\b(?:hands?|fingers?|elbows?)\b[^.!?]{0,35}\b(?:rest(?:ed|ing|s)?|lean(?:ed|ing|s)?)\b[^.!?]{0,35}\btable\b/giu)].some(m=>! /\b(?:never|not|didn[’']t)\b/iu.test(m[0])))issues.push('Closing position: the invited guest remains at VIEWING, never resting at the work table.');
  if(id==='F6'&&/\b(?:creator|maker|recipient)[’']?s?\s+(?:wish|hope)\b|\b(?:wish|hope)\b[^.!?]{0,40}\b(?:creator|maker|recipient)\b/iu.test(text))issues.push('Retaining the work does not honor public display; close retained responsibility without recapping either owner wish.');
 }
 if(w.prosePolicy==='scene-prose-3'&&inventedFold(w,text))issues.push('The work has always been one flat loose sheet. Do not invent present or earlier folding or rolling.');
 if(w.prosePolicy==='scene-prose-3'&&id==='D2T'&&/\b(?:invitation|invit(?:e|ed|ing)|meeting|guest|companion)\b/iu.test(text))issues.push('This is the response to D2, not D1. Develop the uncommitted internal uncertainty, never an invitation, meeting or companion.');
 return issues;
}

/** Literal assertions supplement the engine-derived contract and editorial reading. */
function continuityIssues(w:EmotionalWorld,id:string,text:string){
 const issues:string[]=[],scope=emotionalScopes[id]!,present=emotionalProjection(w,id).allowed_named_current_actors,identities=[w.player_name,w.host.name,w.recipient.name];
 // A permitted exact recap of the established past is not current staging.
 if(scope.secret)text=text.replace(w.private_reason,'known past motive');
 if(id==='S1')text=text.replace(w.shared_past_memory,'known public memory');
 text=text.replace(/\b(?:wasn|weren|isn|aren|didn|hadn|hasn|haven|doesn|don|couldn|wouldn|shouldn|mustn)[’']t\b/giu,contraction=>contraction.slice(0,-3)+' not');
 for(const [role,name]of [['PLAYER',w.player_name],['HOST',w.host.name],['RECIPIENT',w.recipient.name]])text=replaceIdentityReference(text,name!,identities,'ACTOR_'+role);
 text=text.replace(/\b(?:the\s+)?intended recipient\b|\bthe recipient\b/giu,'ACTOR_RECIPIENT').replace(/\bthe (?:creator|maker)\b/giu,'ACTOR_HOST');
 const asserted=(pattern:RegExp)=>[...text.matchAll(pattern)].some(m=>{
  const before=text.slice(0,m.index).split(/[.!?;\n]|\b(?:but|while|then|and)\b/iu).at(-1)??'';
  if(/\b(?:not|never|didn[’']t|hadn[’']t)\s+(?:(?:been|being|actually|really)\s+){0,2}$/iu.test(before))return false;
  return !/\b(?:if|might|could|would|perhaps|maybe|imagined|imagines|wondered|wonders)\b/iu.test(before);
 });
 if(w.prosePolicy==='scene-prose-3'&&id.startsWith('F')&&asserted(/\b(?:ACTOR_(?:HOST|RECIPIENT|PLAYER)|they)\s+(?:(?:still|already|quietly|now)\s+){0,2}(?:sat|sits|stood|stands|stayed|stays|remained|remains|settled|settles|waited|waits|leaned|leans|moved|moves|walked|walks|stepped|steps)\s+(?:(?:a little|a bit|slightly|further)\s+)?(?:at|by|beside|near|before|toward|towards|from|against)\s+(?:(?:the|a|an|that|this|viewing|public|display|work|closed|private|nearby|wooden|far|same|small|long)\s+){0,5}(?:bench|board|table|wall|door|box)\b/giu))issues.push('Endings must not restage people or assign them positions. Their current positions are already supplied by the factual scene; write their response or the bound dialogue only.');
 if(asserted(/\binvited\s+by\s+ACTOR_(?:HOST|RECIPIENT)\b|\bACTOR_(?:HOST|RECIPIENT)\s+(?:had\s+)?invited\b[^.!?]{0,40}\bACTOR_PLAYER\b/giu))issues.push('The viewing invitation has PLAYER as its only initiator; never reverse who invited whom.');
 for(const role of ['HOST','RECIPIENT'])if(!present.includes(role)){
  const activity='(?:sat|sits|stood|stands|settled|settles|shifted|shifts|walked|walks|crossed|crosses|stepped|steps|waited|waits|leaned|leans|watched|watches|turned|turns|continued\\s+their\\s+(?:own\\s+)?evening)';
  if(asserted(new RegExp('\\bACTOR_'+role+'\\s+(?:(?:had|has|still|already|quietly|now)\\s+){0,2}'+activity+'\\b','giu')))issues.push('Scene logistics: an omitted role is a static reference to a known wish, never a current background activity or position.');
 }
 if(present.length===1&&asserted(/\b(?:someone|somebody|someone else|somebody else|another person|others?)\s+(?:(?:had|has|quietly|already|now)\s+){0,2}(?:crossed|crosses|entered|arrived|returned|left|moved|walked|stepped|stood|sat|waited|shifted)\b/giu))issues.push('The protagonist camera cannot add anonymous current movement or a crossing of the room.');
 if(asserted(/\bACTOR_(?:HOST|RECIPIENT)\s+(?:(?:had|has|quietly|already|now)\s+){0,2}(?:left|went|walked|moved|stepped|headed|returned)\s+(?:[\p{L}-]+\s+){0,4}(?:outside|upstairs|downstairs|out of the room|into another room|through the door)\b/giu))issues.push('Scene logistics keep all three adults inside the same room; no actor leaves the venue.');
 return issues;
}


export function venueEntryIssue(text:string){
 const entry=/\b(?:entered|enters|re-entered|re-enters|stepped into|steps into|came into(?!\s+focus\b)|comes into(?!\s+focus\b)|walked into|walks into)\b[^.!?]{0,50}\b(?:room|annex|venue|shop)\b/giu;
 return [...text.matchAll(entry)].some(m=>!/\b(?:not|never|didn[’']t|hadn[’']t|no one|nobody)\s*$/iu.test(text.slice(Math.max(0,m.index!-70),m.index!)));
}
