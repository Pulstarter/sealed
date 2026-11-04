import {redactRepairText} from './emotional-3c.js';
import {maskCanonicalLabels,replaceIdentityReference} from './emotional-identities.js';
import type {EmotionalWorld,EmotionalBlock} from '../../../packages/engine/src/emotional-types.js';
import {authoringInstruction} from './emotional-scene-authoring.js';

// These beats bind voices and progression, never prescribe the same questions.
const opening=[
 'PLAYER reacts to being entrusted with THIS work and these two people, not to a general ethical problem.',
 'HOST states one particular desire from their supplied public wish in ordinary speech. Do not repeat the whole wish.',
 'RECIPIENT answers HOST with the specific personal cost of that desire, grounded in their own supplied wish.',
 'PLAYER catches one concrete mismatch between the two replies. Name the mismatch, not a lesson about attention.',
 'HOST answers RECIPIENT and yields one small point while holding onto the part that matters personally.',
 'PLAYER asks HOST one pointed question about the exact answer just given. Derive the question from this work and wish.',
 'HOST answers that question candidly, with a specific present feeling or limitation, never a general principle.',
 'PLAYER revises the assumption behind their question because of that answer. Do not paraphrase the answer.',
 'RECIPIENT addresses PLAYER about one thing in this particular exchange that PLAYER has misjudged.',
 'PLAYER answers RECIPIENT plainly; allow disagreement rather than another question or a tidy reconciliation.',
 'Use the supplied public memory once as a contrast. Explicitly name PLAYER as the one remembering it; add no person or past event.',
 'RECIPIENT raises a second specific edge of the current disagreement with HOST, without repeating their first wish.',
 'HOST responds to that edge in a personal voice. No request, promise, new material fact or explanation of the private motive.',
 'PLAYER notices how this response changes the personal cost of choosing company, without listing options.',
 'PLAYER tells HOST what is difficult about the answer in THIS exchange; prefer a candid statement to a philosophical question.',
 'HOST responds to that statement and admits a limit of their own preference, not a theory about responsibility.',
 'Let the unresolved disagreement affect PLAYER in a way particular to the two supplied public wishes.',
 'RECIPIENT addresses PLAYER with a short honest response to the exchange. No instruction, verdict or invitation.',
 'PLAYER recognises what their first impression missed about these people; do not announce a moral.',
 'Stop at the immediate social hesitation. The invitation has not happened yet; no recap.'
];
const confrontation=[
 'Acknowledge the actual S1 concession once, then let the new admission disturb PLAYER own confidence rather than restating who pays for the wish.',
 'HOST develops the supplied admission with one current personal feeling, not another recap of the public preference.',
 'PLAYER notices their own first impulse in response and why that impulse is uncomfortable now.',
 'PLAYER tells HOST that specific impulse frankly. A candid statement, not a question about responsible custody.',
 'HOST answers the actual statement and challenges one assumption inside it without speaking for RECIPIENT.',
 'PLAYER recognises the feeling behind their own assumption, not another flaw in HOST public wish.',
 'PLAYER admits what they personally wanted from being trusted in this moment. No history, action or instruction.',
 'HOST reacts to that admission in their own voice; do not re-explain the apology or the cost to RECIPIENT.',
 'Let this reply change what PLAYER is prepared to admit about themself, without adding a new event.',
 'PLAYER tests one precise implication of that reply with HOST, using at most one question.',
 'HOST gives an individual answer to that implication, not an agreed principle, reassurance or moral.',
 'PLAYER distinguishes their own wish for an easy answer from what the current exchange actually permits.',
 'PLAYER states one uncomfortable present limit of their own, without diminishing either established wish.',
 'HOST responds to that limit directly, preserving their earlier concession rather than announcing it again.',
 'Show the personal cost of PLAYER having said this plainly. Do not compare the two public wishes again.',
 'PLAYER answers the specific discomfort with one new present observation, not another statement that both people cannot be satisfied.',
 'HOST gives a short response that changes the emotional emphasis rather than closing the disagreement.',
 'PLAYER registers the difference between being trusted and being certain, grounded in the words just exchanged, not a general lesson.',
 'PLAYER offers one honest present sentence about their changed stance. No decision, promise, request or future task.',
 'HOST answers that sentence once, without repeating the concession, blessing a choice or settling what the work means.',
 'End with a changed PLAYER stance toward the coming uncertainty, without returning to the opening comparison of wishes.',
 'Leave one specific personal hesitation unresolved before D2. No recap, list of feelings, moral or explanation mechanics.'
];
export function dramaticProjection(w:EmotionalWorld,id:string,c:Record<string,any>){
 if(!w.dramaticPolicy)return;
 const intensity=w.dramaticPolicy.intensity;
 c.authority_boundary='Only PLAYER has WORK custody before D3 and chooses its destination at D3. HOST authorship and RECIPIENT intended ownership never assign PLAYER destination responsibility back to that pair. Public wishes are not permission or prior approval of the eventual display.';
 if(w.dramaticPolicy.version==='story-specific-3')c.time_boundary='No invented earlier weeks, months or years. Use only the exact supplied public memory in S1. Avoid any mention of a private reason, even a generic one; the engine supplies knowledge separately.'+(id==='D1A'?' The D1A invitation has already been sent: react to having asked, never describe asking as hypothetical or still unmade.':'');
 c.dramatic_tone=intensity==='moderate'||intensity==='tense'
  ?'Direct friction: pointed objections, shorter answers, a defensive response and a concession that costs pride. Let an answer alter the balance. No danger, outside deadline, aggressive threat or invented event.'
  :'Unhurried intimacy: a particular misunderstanding, a gently awkward correction and an honest concession. Allow ordinary warmth or bittersweet discomfort without forced reassurance or a happy resolution.';
 c.language_boundary='Use the people\'s names in present dialogue. Do not call someone the intended recipient or explain the custodian role to them. For a gift owner deliberately absent from this projection, use a static phrase such as the person the work is for, without staging or naming an absent actor.';
 if(id==='S1'||id==='S2'){
  c.focus='Develop the specific public disagreement and the human cost of this phase, grounded in the supplied facts.';
  c.scene_beats=Object.fromEntries((id==='S1'?opening:confrontation).map((beat,i)=>['p'+(i+1),beat]));
  c.scene_specificity='Every exchange must answer the preceding line and change a particular objection, feeling or assumption. Do not use the same questions with new names. At most one abstract reflection; develop the rest through these supplied public wishes. No generic seminar about attention, responsibility, intention, ownership or uncertainty.';
  if(id==='S2'){
   c.creator_concession=w.story?.scene_two;
   c.scene_arc=['acknowledge once','challenge player assumption','personal admission','changed stance'];
   c.focus='S1 established the competing wishes. S2 changes PLAYER own stance through the new admission and its replies, not through another review of those wishes.';
   c.scene_specificity='Do not recap or paraphrase the S1 concession after the opening acknowledgment. Each exchange must add a distinct player admission, challenge, reply or change of stance. Preserve the public wishes as known facts, not recurring speech topics. No invented history, private knowledge or material event.';
   if(w.dramaticPolicy.version!=='story-specific-1'){
    c.decision_phase='D2 concerns the original EXPLANATION, not where WORK goes. WORK remains held until D3. Do not frame the end of this scene as choosing archive/private/public placement for WORK. Do not describe or perform a reading or report contents.';
    c.scene_beats.p21='PLAYER faces the next moment with a changed personal stance, not another conclusion about whose public wish is costly. No destinations or completed choice.';
    c.scene_beats.p22='End with the specific remaining human difficulty. Do not summarize options or frame a work-placement decision: that is a later phase.';
   }
  }
 }else{
  if(w.dramaticPolicy.version!=='story-specific-1'&&/^ARR[AB]$/.test(id))c.first_exchange='This is the first exchange since joining the viewing area. Respond to the present moment; do not apologize for an unprovided earlier line or invent offscreen speech.';
  if(/^F[12]$/u.test(id))c.closing_exchange='This is a present exchange after PLAYER chose the display. No earlier HOST approval event is supplied: do not invent having approved once, being asked to approve twice, or a past consent to this display. No unanimous prior agreement, permission, previous promised response, unprovided quotation or apology for earlier speech. Neither guest claims to have chosen PLAYER material decision. React to the current feeling and settled facts only; do not reconstruct absent conversation. Stay aligned with this speaker public_wish: never blame PLAYER for granting the visibility this speaker explicitly wanted. Ambivalence is allowed only as an acknowledged difference between that wish and the current feeling, not as an unexplained reversal.';
  c.scene_specificity='React once to this settled outcome. Keep the supplied phase and camera; no wish recap, philosophical lecture or alternative material outcome. Leave a personal interpretation open.';
 }
}
export const dramaticWorldInstruction='The public wishes must produce a particular human disagreement rather than interchangeable requests for slow attention. scene_two is a specific present concession by HOST about the personal cost or limitation of their own stated preference, in 5–20 spoken words. Do not repeat an invitation to stay or look longer, reveal the private motive, invent a past event or tell PLAYER what to choose. For moderate or tense profiles make the public disagreement sharper and emotionally costly; for gentle profiles allow a small candid misunderstanding. No external danger, countdown or new mechanics. Use natural names in wishes rather than the creator/intended recipient when unambiguous.';
export function dramaticWriterInstruction(words:number,id:string){
 return authoringInstruction(words,false)+'\nWrite this specific scene rather than variations of a philosophical questionnaire. The grounded scene_beats and dramatic_tone replace any generic duty-of-care discussion. Prefer direct statements, objections and replies over a chain of questions. At most two genuine questions per main scene. Do not ask how failing to understand differs from disregarding, what a custodian can answer for, or whether responsible acts may feel uncomfortable. Name actual people in dialogue. The concession changes the disagreement, without new facts, material actions or private knowledge. '+(id==='S1'?'Only the supplied public memory may be recalled; explicitly identify PLAYER as its rememberer.':'Do not invent or recall another past event.');
}

export const accessibleWishInstruction='Public wishes describe current attention, privacy or recognition, not a destination or delivery mechanism. Neither wish may mention archive, box, slot or compartment. ARCHIVE accepts only the original explanation and never displays WORK. BOX remains closed: nobody can view, receive, collect or answer the work inside it tonight. Do not promise future access in a wish. Keep the two wishes emotionally distinct without adding mechanics.';
export function dramaticWorldIssues(w:EmotionalWorld){
 if((!w.dramaticPolicy||w.dramaticPolicy.version==='story-specific-1'))return [];
 const labels=[w.work.name,w.venue.name].filter(label=>label.trim().split(/\s+/u).length>=2&&!/^(?:the\s+)?(?:archive|(?:private\s+)?box|slot|compartment)$/iu.test(label.trim()));
 return [w.host.public_wish,w.recipient.public_wish].filter(wish=>/\b(?:archive|box|slot|compartment)\b/iu.test(maskCanonicalLabels(wish,labels))).map(()=>'A public wish requires an inaccessible mechanism rather than a current human response.');
}

/** Reject the observed chronology errors before the one bounded repair. */
export function dramaticProseIssues(w:EmotionalWorld,id:string,text:string,passages?:EmotionalBlock['passages']){
 if(w.dramaticPolicy?.version!=='story-specific-3')return [];
 const issues:string[]=[],comparison=id==='S1'?text.replace(w.shared_past_memory,'known public memory'):text;
 const giftPair=replaceIdentityReference(replaceIdentityReference(text,w.host.name,[w.player_name,w.host.name,w.recipient.name],'KNOWN_HOST'),w.recipient.name,[w.player_name,w.host.name,w.recipient.name],'KNOWN_RECIPIENT');
 if(id==='D1B'&&/\b(?:did not|does not|had not|has not)\s+move\s+responsibility\b[^.!?]{0,90}\bdestination\b[^.!?]{0,35}\baway from KNOWN_HOST\s+and\s+(?:KNOWN_RECIPIENT|the intended recipient|the person the work is for)\b/iu.test(giftPair))issues.push('PLAYER retains destination responsibility. Authorship and intended recipient status do not assign custody or the destination choice to the gift pair.');
 if(/^F[12]$/u.test(id))for(const p of passages??[])if(p.speaker==='PLAYER'&&p.addressee==='HOST'&&/\bapprove twice\b/iu.test(p.text)&&/\bI thought once should hold\b/iu.test(p.text))issues.push('No prior approval event is supplied. Do not invent an earlier HOST approval of this display.');

 if(id==='F2'&&/\bcould\s+be\s+studied\s+openly\b/iu.test(w.recipient.public_wish))for(const p of passages??[]){
  if(p.speaker!=='RECIPIENT')continue;
  const speech=replaceIdentityReference(p.text,w.player_name,[w.player_name,w.host.name,w.recipient.name],'ACTOR_PLAYER');
  const acknowledgesWish=/(?:^|[.!?;,]\s*|\b(?:though|although|but|and)\s+)I\s+(?:wanted|want)\s+(?:it|this|the work)\s+public\b/iu.test(speech);
  if(!acknowledgesWish&&/^(?:ACTOR_PLAYER[,\s]+)?you\s+(?:did not|didn[’']t)\s+have to make\s+(?:it|this|the work)\s+(?:this|so)\s+public\b/iu.test(speech))issues.push('The recipient public wish explicitly asks for open study. Do not blame PLAYER for fulfilling it; express a present reaction without reversing that wish unannounced.');
 }
 if(/\b(?:past|previous|last)\s+(?:few\s+)?(?:weeks?|months?|years?)\b|\b(?:weeks?|months?|years?)\s+(?:ago|earlier|before)\b/iu.test(comparison))issues.push('Unprovided past duration: do not invent previous weeks, months or years outside the exact supplied public memory.');
 const invitationText=replaceIdentityReference(text,w.player_name,[w.player_name,w.host.name,w.recipient.name],'ACTOR_PLAYER').replace(/(^|[.!?]\s+)ACTOR_PLAYER\s+(?:had|has)\s+asked,\s+and\s+the\s+asking(?=\s+would\b)/giu,'$1The completed request');
 if(id==='D1A'&&/\b(?:asking|to ask)\b[^.!?]{0,100}\bwould\b/iu.test(invitationText))issues.push('The invitation is already sent. React to having asked, never describe asking as an unmade hypothetical choice.');
 if(/^F[1-4]$/u.test(id)){
  const consensus=text.replace(/\b(?:not|if|unless|whether)\s+(?:(?:everyone|everybody)\s+(?:had\s+)?agreed|(?:they|we)\s+(?:had\s+)?all\s+agreed)\b/giu,'unestablished agreement');
  if(/\b(?:(?:everyone|everybody)\s+(?:had\s+)?agreed|(?:they|we)\s+(?:had\s+)?all\s+agreed)\b[^.!?;]{0,100}\b(?:display|public|board|seen)\b/iu.test(consensus))issues.push('Unprovided consensus: PLAYER chose the public placement; do not invent everyone agreeing to display it.');
  const resolved=replaceIdentityReference(text,w.player_name,[w.player_name,w.host.name,w.recipient.name],'ACTOR_PLAYER');
  if(/\bACTOR_PLAYER\s+(?:had not made (?:the work|it),\s+)?(?:had not chosen|did not choose|has not chosen)\s+(?:its|the|the work[’']s)\s+destination(?=\s*[,;.!?]|$)/iu.test(resolved))issues.push('PLAYER chose the public destination. Do not deny their completed placement decision.');
 }
 return issues;
}


export function sequentialDialogueProjection(id:string,c:Record<string,any>,opening?:EmotionalBlock,world?:EmotionalWorld){
 const arrival=world?.endingPolicy==='outcome-reactions-2'&&/^ARR[AB]$/u.test(id);
 if(id!=='S2'&&!arrival)return;
 if(!opening?.passages)throw Error('S2 requires the completed public S1 dialogue.');
 c.earlier_public_dialogue=opening.passages.filter(p=>p.speaker!=='NARRATOR').map(p=>({speaker:p.speaker,addressee:p.addressee,text:world?redactRepairText(p.text,world,false):p.text}));
 if(arrival){const guest=id==='ARRA'?'HOST':'RECIPIENT';c.earlier_public_dialogue=c.earlier_public_dialogue.filter((p:any)=>p.speaker===guest||p.speaker==='PLAYER'&&p.addressee===guest);c.scene_beats={p1:'React to sharing the viewing now, consistent with the actual earlier dialogue. Do not invent reserve, distance or a first impression already corrected in S1.',p2:'The fixed guest replies once to this present moment, without repeating, reversing or rediscovering their already stated wish. No earlier apology, secret or invitation.'};c.continuity_boundary='These public statements already happened. Do not contradict or rediscover them; the guest is already alongside PLAYER. No repeated arrival, invitation or invented prior speech.';return;}
 c.continuity_boundary='The earlier_public_dialogue actually happened in S1. Continue its specific concessions and stated limits; never deny, reset or newly discover them. The supplied creator_concession is additional, not a retraction. A concession exists only if it is explicitly present in the supplied dialogue. Preserve its actual content and scope; do not infer an agreement or replace it with an example. These quoted public speakers are NOT currently staged here; only HOST and PLAYER may speak now. Never quote the transcript or repeat its questions. Develop one remaining difficulty, not the same revelation again.';
 c.scene_beats.p1='Acknowledge one actual S1 concession once. Then the new admission turns PLAYER attention toward their own response; do not rediscover or restate the concession.';
 c.scene_beats.p6='PLAYER recognises the feeling behind their own assumption in this new reply; keep the actual S1 concessions settled and do not restate their cost.';
 c.scene_beats.p9='Show how this reply changes what PLAYER admits about themself, not the same discovery about HOST already made in S1.';
}
export function sequentialDialogueIssues(opening?:EmotionalBlock,conversation?:EmotionalBlock){
 const speech=opening?.passages?.filter(p=>p.speaker==='HOST').map(p=>p.text).join(' ')??'',next=conversation?.text??'';
 const limitedThanks=/\b(?:yield on the words|say something brief|brief thanks (?:are|is) (?:fine|welcome|allowed))\b/iu.test(speech);
 const blanket=/\b(?:asking for no voiced thanks|gratitude not be voiced at all|thanks not be voiced at all)\b/iu.test(next);
 const acknowledges=/\b(?:brief|short|private)\s+(?:spoken\s+)?(?:thanks|gratitude)\b|\b(?:yielded|conceded|allowed|allowing|permitted)\b[^.!?]{0,50}\b(?:thanks|words|gratitude)\b/iu.test(next);
 return limitedThanks&&blanket&&!acknowledges?['Continuity: S1 already allowed brief thanks. Continue that concession; do not restart a blanket ban or discover the same limit again.']:[];
}
