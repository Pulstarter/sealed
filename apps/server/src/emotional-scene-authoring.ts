import type {EmotionalWorld} from '../../../packages/engine/src/emotional-types.js';
const N='NARRATOR>NONE';
const opening=[N,'HOST>PLAYER','RECIPIENT>HOST',N,'HOST>RECIPIENT','PLAYER>HOST','HOST>PLAYER',N,'RECIPIENT>PLAYER','PLAYER>RECIPIENT',N,'RECIPIENT>HOST','HOST>RECIPIENT',N,'PLAYER>HOST','HOST>PLAYER',N,'RECIPIENT>PLAYER',N,N];
const conversation=[N,'HOST>PLAYER',N,'PLAYER>HOST','HOST>PLAYER',N,'PLAYER>HOST','HOST>PLAYER',N,'PLAYER>HOST','HOST>PLAYER',N,'PLAYER>HOST','HOST>PLAYER',N,'PLAYER>HOST','HOST>PLAYER',N,'PLAYER>HOST','HOST>PLAYER',N,N];
export function authoringParagraphCount(id:string){return id==='S1'?20:id==='S2'?22:id==='S3'||id.startsWith('F')?6:2;}
/** Remove optional complete exchanges, never one side of a dialogue or the closing beat. */
export function authoringRepairIndices(id:string,target:number,observed:number,stableExchanges=false,closestExchanges=false,observedParagraphs?:number){
 const count=authoringParagraphCount(id),indices=Array.from({length:count},(_,i)=>i+1);
 if((observedParagraphs??count)===count&&target>=observed*(closestExchanges?.95:stableExchanges?.75:.95))return indices;
 const minimum=id==='S1'?14:id==='S2'?16:id==='S3'?4:id==='F1'||id==='F2'?5:id.startsWith('F')?4:2;
 const wanted=Math.max(minimum,Math.floor((observedParagraphs??count)*target/Math.max(1,observed)));
 const optional=id==='S1'?[[12,13,14],[15,16,17]]:id==='S2'?[[13,14,15],[10,11,12]]:id==='S3'?[[5],[3]]:id==='F1'||id==='F2'?[[5]]:id.startsWith('F')?[[5],[2]]:[];
 for(const group of optional){if(indices.length<=wanted)break;if(indices.length-group.length<minimum)continue;if(closestExchanges&&Math.abs(indices.length-group.length-wanted)>=Math.abs(indices.length-wanted))continue;for(const n of group)indices.splice(indices.indexOf(n),1);}
 return indices;
}
export function authoringVoice(id:string,n:number){
 if(id==='S1')return opening[n-1]??N;if(id==='S2')return conversation[n-1]??N;
 if(id==='ARRA'||id==='ARRB')return n===2?(id==='ARRA'?'HOST':'RECIPIENT')+'>PLAYER':N;
 if(id==='F1'||id==='F2'){const role=id==='F1'?'HOST':'RECIPIENT';return n===2?role+'>PLAYER':n===4?'PLAYER>'+role:N;}
 return N;
}
const openingBeats=[
 'PLAYER hesitates socially while holding the work. Start with the interpersonal problem, not weather or the catalogue.',
 'HOST addresses PLAYER about one specific difficulty in their public hope; use a full thought, not a slogan.',
 'RECIPIENT answers HOST directly with the real point of disagreement, not a recital of their wish.',
 'PLAYER notices which word in that answer has changed the conversation.',
 'HOST answers RECIPIENT actual objection and concedes one limited point.',
 'PLAYER asks HOST what would distinguish a freely given response from an obligation.',
 'HOST answers the question concretely, without a private history or a new material action.',
 'PLAYER registers a flaw in that answer rather than explaining the gesture that precedes it.',
 'RECIPIENT questions PLAYER assumption about what thanks owes to a maker.',
 'PLAYER replies with a tentative distinction, without appropriating the creator-recipient relationship.',
 'Recall the supplied public memory once as a contrast; no invented detail or extra past event.',
 'RECIPIENT asks HOST whether making a gift gives its creator a claim on a response.',
 'HOST answers directly and resists one part of that formulation.',
 'PLAYER notices how the disagreement has become less polite and more precise.',
 'PLAYER asks HOST whether disagreement could itself be a form of close attention.',
 'HOST answers using their public preference, without settling what anyone must do.',
 'Show the remaining gap in the answer, without a list of the two hopes.',
 'RECIPIENT addresses PLAYER about what the exchange has left uncomfortable; no invitation or instruction.',
 'PLAYER revises one earlier assumption about their role as a custodian, not the maker.',
 'Stop on the specific unresolved social hesitation before the invitation choice. No recap, lesson or material action.'
];
const conversationBeats=[
 'React to the compiled admission without repeating it. HOST is still at TABLE; no viewing arrival yet.',
 'HOST develops one implication of the public admission, without explaining why the work was made.',
 'PLAYER notices what is being asked without assuming a right to settle it.',
 'PLAYER asks HOST a direct question about what another person owes a gift.',
 'HOST answers that exact question with a concrete distinction, not generic reassurance.',
 'PLAYER privately tests the answer against its cost, without a gesture or weather cue.',
 'PLAYER points out an exception to HOST distinction, not a new past event.',
 'HOST responds to the exception and concedes something specific.',
 'Register how that concession changes the terms of the exchange.',
 'PLAYER asks whether gratitude still belongs to its giver when it is expected.',
 'HOST answers from their public preference and admits a limitation.',
 'PLAYER notices the difference between agreeing and yielding; no recap of wishes.',
 'PLAYER challenges whether visible acknowledgment necessarily proves careful attention.',
 'HOST answers that challenge without claiming that any display or acknowledgment has happened.',
 'PLAYER recognises a difficulty in the answer, without assigning anyone a hidden motive.',
 'PLAYER questions their own right to arbitrate a gift between its creator and intended recipient.',
 'HOST addresses that specific question, keeping PLAYER as custodian rather than one of the gift owners.',
 'A new understanding of the custodian role replaces one earlier assumption.',
 'PLAYER asks what it would mean to leave the disagreement unresolved, not where to put anything.',
 'HOST gives a qualified answer, without a promise, instruction, invitation or secret.',
 'PLAYER notices one unresolved cost in that answer, without praising silence or quiet.',
 'Stop on that precise tension before the next choice. No recap, weather or new action.'
];
const attentiveOpening=[
 'PLAYER hesitates over how to give the work honest attention without merely performing politeness; no gift-law debate.',
 'HOST describes one ordinary difficulty of being looked at or listened to, grounded in their own public preference.',
 'RECIPIENT answers with what feels uncomfortable about that kind of attention, not a recital of a second wish.',
 'PLAYER notices which word changes the tone of the exchange.',
 'HOST answers that discomfort and concedes one concrete limitation of their preferred way of looking.',
 'PLAYER asks HOST whether disagreement with an impression would be welcome; no new depicted detail.',
 'HOST answers directly about receiving disagreement, without a private history or a new request.',
 'PLAYER recognises that easy approval might be less attentive than admitting an uncertain impression.',
 'RECIPIENT questions whether PLAYER is trying to notice something or trying to produce a correct interpretation.',
 'PLAYER admits a provisional way of attending, not a claim about the work contents or secret motive.',
 'Use the supplied public memory once to contrast familiar company with this awkward present exchange.',
 'RECIPIENT asks HOST what happens when one person is finished looking before the other is finished being understood.',
 'HOST answers that mismatch using their public preference, without asserting control or demanding gratitude.',
 'PLAYER notices a shift from defending an opinion to allowing someone else time; do not repeat the wishes.',
 'PLAYER asks HOST whether an uncomfortable response could still show real attention.',
 'HOST answers with a qualified concession, without a moral, promise or account of making the work.',
 'Let the answer change PLAYER earlier assumption about visible ease and genuine interest.',
 'RECIPIENT addresses PLAYER about what remains awkward in this specific exchange, not rights or ownership.',
 'PLAYER realises that a confident impression is not the same as having listened carefully.',
 'Stop on the immediate social hesitation before the invitation. No recap of gratitude, debt, obligation or gift rights.'
];
const custodyConversation=[
 'The compiled admission changes the stakes for PLAYER as custodian; respond without repeating its words.',
 'HOST names a present uncertainty in their public preference, not an explanation of the private creation motive.',
 'PLAYER distinguishes curiosity from the practical duty of making a choice with incomplete understanding.',
 'PLAYER asks HOST how much understanding a custodian needs before acting responsibly.',
 'HOST answers with a limited distinction, without telling PLAYER what to do or promising certainty.',
 'PLAYER notices the temptation to treat reassurance as a substitute for taking responsibility.',
 'PLAYER asks whether a responsible act can still leave its actor uncomfortable.',
 'HOST answers that actual question rather than returning to praise, thanks, gift claims or evidence of attention.',
 'PLAYER recognises a consequence of that answer for their own wish to feel blameless.',
 'PLAYER asks how failing to understand another person differs from disregarding them.',
 'HOST answers from their public preference without claiming to speak for the intended recipient.',
 'PLAYER tests their own assumption that being impartial would spare anyone discomfort.',
 'PLAYER asks how to leave another person room to interpret an act differently.',
 'HOST answers without prescribing a response, describing a new event or restating the earlier admission.',
 'PLAYER notices the gap between a careful intention and an impact that cannot be guaranteed.',
 'PLAYER questions what they can honestly take responsibility for when agreement is impossible.',
 'HOST responds with one limitation of a custodian role, not a verdict or a material instruction.',
 'PLAYER understanding changes: responsibility does not require ownership of another person feelings.',
 'PLAYER acknowledges one concrete difficulty in accepting that limit, without asking for private information.',
 'HOST responds to that difficulty without resolving it or directing the next choice.',
 'PLAYER can distinguish seeking comfort from making a commitment, but has not yet made one.',
 'End on PLAYER remaining uncertainty before D2; no recap of S1 arguments about gratitude, debt or gift rights.'
];
const reactions:Record<string,string>={
 D1A:'The unease of directly asking someone to join a private moment; do not replay the invitation or movement.',
 D1B:'The awkwardness of relying on an intermediary; no request to relay again, no new message.',
 D1T:'An opening passed before PLAYER found a phrasing; third-person present feeling only, without reproach, quotation or implied speech.',
 D2A:'An earlier personal assumption no longer seems adequate; respond without mentioning information, its source or any knowledge claim.',
 D2B:'The difference between restraint and avoidance in PLAYER own response; no handling, explanation, or claims of moral correctness.',
 D2T:'An opportunity passed without commitment; no claims about what anyone knows or what an object means.',
 ARRA:'The creator is already alongside PLAYER at VIEWING. Let an ordinary direct exchange interrupt PLAYER overthinking, without restating the creator wish.',
 ARRB:'The intended recipient is already alongside PLAYER at VIEWING. Their direct exchange makes PLAYER less sure of their first social reading; no wish recap.',
 ARRT:'No invited companion joined. PLAYER notices their own unspoken expectation without staging others or claiming solitude.',
 D3A:'The work is already public. PLAYER feels the loss of control that follows that public placement; do not repeat the placement or stage a new audience.',
 D3B:'The work is already in the closed box. PLAYER reacts to not being able to keep inspecting it, with no promised retrieval or delivery.',
 D3T:'PLAYER still retains the work. The practical responsibility has not passed to anyone else; no implication of public display or private deposit.'
};
const closings:Record<string,string>={
 F1:'Public display is final. HOST remains at VIEWING, never at TABLE. Close one exchange between PLAYER and creator about the changed present, not wishes or a request to stay.',
 F2:'Public display is final. RECIPIENT remains at VIEWING. Close one exchange between PLAYER and intended recipient without new knowledge or a request to act.',
 F3:'Public display is final. Follow only PLAYER, with no claims of solitude or new audience. Their changed present experience carries the ending.',
 F4:'Public display is final. Follow PLAYER immediate response without any explanation, knowledge, other actor or wished-for alternate outcome.',
 F5:'The work is inside the closed box, not visible. Follow PLAYER empty-handed present response without predicting who receives or sees anything.',
 F6:'PLAYER keeps the work in their custody. No public display or private deposit took place. End on retained responsibility, not honoring one owner wish over the other.'
};
export function authoringBeats(id:string,separate=false){const plan=id==='S1'?(separate?attentiveOpening:openingBeats):id==='S2'?(separate?custodyConversation:conversationBeats):id==='S3'?[
 'PLAYER notices how their own first interpretation has become less comfortable, without describing the image.',
 'Develop a specific limit in that interpretation rather than relisting the public wishes.',
 'Distinguish curiosity from a right to decide for others, without a moral judgment.',
 'Let an opposing thought complicate that distinction; no new facts or external actors.',
 'One brief body-only response belongs to PLAYER, never a repeated breath-and-shoulders routine.',
 'Stop at the unresolved personal tension before commitment, without choosing an outcome.'
]:id.startsWith('F')?[
 closings[id]!,
 'The planned voice responds to that changed present, not a wish, rule, instruction or recap.',
 'Complicate the first feeling with one specific unresolved thought, without an alternate material outcome.',
 'The planned voice responds directly to that thought, or deepen PLAYER perspective if narrator.',
 'Develop the remaining uncertainty without a gesture, weather, generic quiet or another scene.',
 'Close on the supplied interpretive question without quoting it as a slogan, moral or future task.'
]:[reactions[id]!,'Respond once to that specific tension and stop. No pair of wish summaries, breathing/shoulder routine, atmosphere, new action or generic claim that quiet resolves nothing.'];return Object.fromEntries(plan.map((beat,i)=>['p'+(i+1),beat]));}
export function authoringInstruction(words:number,separate=false){return (separate?'Keep the two main scenes distinct: S1 is a concrete exchange about looking and listening; S2 develops the custodian responsibility under uncertainty. Never repeat the same question about gratitude, obligation or gift rights in both scenes. Endings contain present feeling and bound dialogue only: no restaging people, movement, object handling or past folding. Leads and tails in endings must be empty. All prose, including staging and inner thoughts, is third person unless it is a bound spoken line; no generic you/your in narration.\n':'')+`Write a literary scene in English. Approximate total: ${words} words for the WHOLE block. Develop the distinct scene_beats in order, with replies that answer the preceding line. Write natural short paragraphs, varying length. Spoken lines may develop a full thought in 20–32 words (maximum35), without speaker tags or quotation marks. Leads and tails may be EMPTY: do not wrap each utterance in a gesture. Use at most one necessary body-only staging beat in the block. Narrator paragraphs should advance an objection, recognition or unresolved implication, never translate a preceding gesture into the same feeling. This is free prose, not paired observation and interpretation.
Fill the flat strings in wire_plan and close the JSON. Every nonempty lead/tail is an independent complete third-person sentence. Put correct punctuation, including question marks, in speech. Only the fixed voice speaks; singular they/them. No catalogue, repeated public wishes, rule explanation, weather, repeated quiet or generic physical routine to hit length. No made-up event, person, depicted detail, invitation, arrival, handling, explanation or private knowledge. The engine already narrated those. All positions and final custody in the projection are binding. Only S1 may use the supplied public memory and atmosphere. Short reactions end after their one specific tension. Endings close the settled result, never another choice, request, promise or future task. Finish naturally and stop.`;}
export function authoringProjection(w:EmotionalWorld,id:string,c:Record<string,any>){
 c.scene_beats=authoringBeats(id,w.prosePolicy==='scene-prose-3');
 const names=[w.player_name,...(c.host?[w.host.name]:[]),...(c.recipient?[w.recipient.name]:[]),...(c.guest?[c.guest.name]:[])];
 c.current_actor_pronouns=Object.fromEntries(names.map(name=>[name,'they/them/their only; never she/her/hers or he/him/his']));
 if(id!=='S1'){
  delete c.sensory_detail;delete c.past_memory;if(c.place)delete c.place.atmosphere;
 }
 if(id!=='S1'&&id!=='S2'){
  delete c.public_wishes;delete c.public_tension;
  for(const k of ['host','recipient','guest'])if(c[k])delete c[k].public_wish;
  c.focus=reactions[id]??closings[id]??'PLAYER tests their own interpretation, not the two public wishes.';
  c.wish_boundary='Public preferences were established earlier. Do not recap, quote, compare, honor or reject either wish here. Develop only this phase focus.';
 }
 if(id.startsWith('F'))c.ending_boundary=closings[id]+' Only interpretation stays open. No recital of the journey, hopes, feelings in general, or a moral.';
 if(id==='F1'||id==='F2')c.position_boundary='The invited guest is at VIEWING for this whole closing exchange. No hands, arms or elbows on the work table, no return to it, no request to move or stay.';
 if(w.prosePolicy==='scene-prose-3'){
  c.physical_history='The work has always been one loose flat unframed sheet. It has never been folded, rolled, framed, copied or opened. Do not invent a prior physical state.';
  if(id==='D2T'){
   c.focus='D2 is the explanation decision, not the earlier invitation. PLAYER tolerates an uncertainty they did not resolve; no meeting, guest, invitation, request or opportunity to invite.';
   c.scene_beats={p1:'PLAYER notices the temptation to postpone responsibility until they feel certain; an internal response, not a new event or knowledge claim.',p2:'Complicate that thought once and stop; no invitation, meeting, guest, new task or reproach.'};
  }
  if(id.startsWith('F')){
   c.position_boundary='The factual scene fixes current positions. Do not describe anyone sitting, standing, remaining or moving near a board, bench, table or other place. Write internal responses and bound speech only, with empty leads/tails.';
   c.scene_beats.p1=(closings[id]??'Preserve the completed outcome.')+' Begin with PLAYER specific internal response, never a sentence about where anyone stands or sits.';
  }
 }

 c.reaction_boundary='Only supplied public facts support this reaction. Do not add events, objects, people, past meetings, depiction, material handling or knowledge. Do not invent body contact with scenery. Follow the planned exchanges and phase focus; keep names and singular they/them.';
}
