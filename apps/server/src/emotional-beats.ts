/** Public conversation beats only; consequences and revelations belong to the engine. */
const N='NARRATOR>NONE';
const opening=[N,'HOST>PLAYER','RECIPIENT>HOST',N,'HOST>RECIPIENT','PLAYER>HOST',N,'RECIPIENT>PLAYER','PLAYER>RECIPIENT','HOST>PLAYER',N,N];
const admission=[N,'HOST>PLAYER',N,'PLAYER>HOST','HOST>PLAYER',N,'PLAYER>HOST','HOST>PLAYER',N,'PLAYER>HOST','HOST>PLAYER',N,'PLAYER>HOST',N];
export function sceneParagraphCount(id:string){return id==='S1'?12:id==='S2'?14:id==='S3'?6:id.startsWith('F')?5:3;}
export function sceneParagraphVoice(id:string,n:number){
 if(id==='S1')return opening[n-1]??N;
 if(id==='S2')return admission[n-1]??N;
 if(id==='F1'||id==='F2'){const role=id==='F1'?'HOST':'RECIPIENT';return n===2?role+'>PLAYER':n===4?'PLAYER>'+role:N;}
 if(id==='ARRA'||id==='ARRB')return n===2?(id==='ARRA'?'HOST':'RECIPIENT')+'>PLAYER':N;
 if(/^D(?:1[AB]|2[ABT])$/.test(id))return n===2?'HOST>PLAYER':N;
 return N;
}
const openingBeats=[
 'Show one concrete social hesitation while PLAYER holds the entrusted work; do not repeat the factual catalogue.',
 'HOST names a specific public difficulty about giving attention, not a private reason or a new action.',
 'RECIPIENT responds directly to that difficulty from their different public wish; do not swap owners.',
 'Let PLAYER notice the mismatch between the two responses, without resolving it.',
 'HOST answers RECIPIENT with a limited concession, not a repetition of the wish.',
 'PLAYER questions the cost of that concession, without initiating any viewing invitation.',
 'Use the supplied public memory once as a contrast to the present exchange; do not invent its participants or details.',
 'RECIPIENT challenges PLAYER assumption about gratitude, within their public preference.',
 'PLAYER acknowledges that challenge without deciding a material outcome.',
 'HOST answers the change in PLAYER position; do not reveal a motive.',
 'Show the remaining interpersonal friction through a new body-only reaction, not another sensory motif.',
 'Leave the two public wishes genuinely in tension as PLAYER considers speaking next; no recap or invitation.'
];
const admissionBeats=[
 'React to the already compiled admission without quoting it again; the invitation has not yet brought anyone to the viewing bench.',
 'HOST develops one implication of that admission from their public wish, without the private motive.',
 'Show how that statement changes PLAYER first assumption, without recap.',
 'PLAYER asks a concrete question about the cost of the public wish, not what the explanation contains.',
 'HOST answers the actual question directly with a limited distinction, not a second wish quotation.',
 'Let PLAYER register a difficulty in that answer; no atmosphere filler.',
 'PLAYER challenges the distinction using only what is public.',
 'HOST responds to that challenge; admit a present uncertainty without introducing private history.',
 'Show a different body-only reaction that changes the tone of the exchange.',
 'PLAYER offers a counterargument about attention or gratitude, not a material decision.',
 'HOST answers that counterargument without solving the tension or repeating the original admission.',
 'Show what PLAYER now understands differently about the wish, once.',
 'PLAYER makes one concise acknowledgment, not a promise, invitation or request to handle anything.',
 'End on the specific unresolved human cost of that exchange; no recap, instruction or new action.'
];
export function sceneBeatPlan(id:string){
 const beats=id==='S1'?openingBeats:id==='S2'?admissionBeats:id==='S3'?[
  'Ground PLAYER immediate reaction to the already completed viewing; no artwork description.',
  'Notice a weakness in PLAYER first interpretation, without staging anyone else.',
  'Weigh one public hope against its human cost; no list of all choices.',
  'Let an opposing interpretation complicate that response, not paraphrase it.',
  'Show a new physical response belonging only to PLAYER; no repeated sensory cue.',
  'Stop at the unresolved personal tension, without choosing a destination or assigning a lesson.'
 ]:id.startsWith('F')?[
  'Start after the settled material result with its immediate human feeling; do not recap the route.',
  'Give one response to that feeling from the planned voice, or PLAYER perspective if narrator; preserve known positions.',
  'Recognize the cost to the other public hope without restating both wishes.',
  'Let the planned voice respond to that cost, without a new promise or action.',
  'Close on one changed interpretation and leave the supplied interpretive question open; no moral or next task.'
 ]:[
  'A specific immediate response to the already completed choice, never replaying the action.',
  'Complicate that response in the planned voice; no recap of both wishes.',
  'End with a distinct after-effect and stop, without a new action or lesson.'
 ];return Object.fromEntries(beats.map((beat,i)=>['p'+(i+1),beat]));
}
export function sceneWriterInstruction(words:number){return `Write a literary scene in English. Approximate total: ${words} words for this WHOLE block. Fill the flat string fields in wire_plan and close the JSON. Follow scene_beats in order: a reply must answer the preceding utterance. Narrator paragraphs are free prose, not compulsory observation-plus-interpretation pairs. Vary sentence lengths. Spoken text is at most 35 words; use complete third-person lead/tail sentences for staging when needed. No quote marks, speaker tags or stage directions inside speech; the server supplies them. Do not repeat the same gesture, atmosphere or conclusion to reach a count. Public wishes are starting positions for disagreement, never a recurring list. Reactions to choices and endings stay brief; the main exchanges belong to S1/S2. Preserve singular they/them. Finish each field naturally and stop.
Only supplied public facts may enter reactions. The engine already narrated actions, positions and depicted contents: do not replay, request, reverse or add them. No new material handling, invitation, arrival, explanation knowledge, secret motive, past event, person, artwork feature or solitude. A pending viewing invitation is not a current arrival; HOST remains at the table through S2. Creator and recipient own the gift relationship; PLAYER is its custodian. Do not redirect their wishes to PLAYER. Only planned voices speak. An ending preserves final custody and leaves interpretation open, never a future delivery, new task, moral or recap.`;}
