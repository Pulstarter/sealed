import type {EmotionalArtifact,EmotionalWorld,EmotionalWorldDraft,EmotionalChoice,EmotionalInput,EmotionalPlayer,EmotionalState,EmotionalView,EmotionalScene,EmotionalVisual} from './emotional-types.js';

export const emotionalRoutes=[...'ABT'].flatMap(a=>[...'ABT'].flatMap(b=>[...'ABT'].map(c=>a+b+c)));
export const emotionalBlockIds=['S1','S2','S3','ARRA','ARRB','ARRT',...['1','2','3'].flatMap(d=>[...'ABT'].map(c=>'D'+d+c)),...['1','2','3','4','5','6'].map(n=>'F'+n)];
export type EmotionalFacts=Record<string,string|boolean>;
export function emotionalTrace(route:string){
  if(!/^[ABT]{3}$/.test(route))throw new Error('Invalid route.');
  const s0:EmotionalFacts={work:'PLAYER',record:'TABLE',record_open:false,player_knows:false,recipient_knows:false,host_knows:true,invited:'NONE',guest_at_VIEWING:'NONE',host_at:'TABLE',recipient_at:'WORK_AREA',box_door:'CLOSED',archive_door:'CLOSED',box_access:'SLOT',archive_access:'SLOT'};
  const s1:EmotionalFacts={...s0,invited:route[0]==='A'?'HOST':route[0]==='B'?'RECIPIENT':'NONE'},s2:EmotionalFacts={...s1};
  if(route[1]==='A')Object.assign(s2,{record:'PLAYER',record_open:true,player_knows:true});else if(route[1]==='B')s2.record='ARCHIVE';
  const s3:EmotionalFacts={...s2,guest_at_VIEWING:s2.invited!};if(s2.invited==='HOST')s3.host_at='VIEWING';if(s2.invited==='RECIPIENT')s3.recipient_at='VIEWING';
  const s4:EmotionalFacts={...s3};if(route[2]!=='T'){s4.work=route[2]==='A'?'PUBLIC':'BOX';if(s4.record==='PLAYER'){s4.record=s4.work;if(s4.work==='PUBLIC'&&s4.guest_at_VIEWING==='RECIPIENT')s4.recipient_knows=true;}}
  return {s0,s1,s2,s3,s4};
}
export function emotionalEnding(route:string){
  if(!/^[ABT]{3}$/.test(route))throw new Error('Invalid route.');
  return route[2]==='B'?'F5':route[2]==='T'?'F6':route[1]!=='A'?'F4':route[0]==='A'?'F1':route[0]==='B'?'F2':'F3';
}
export function compileEmotionalWorld(draft:EmotionalWorldDraft):EmotionalWorld{
  return {...structuredClone(draft),public_hook:`Discover why ${draft.host.name} made the ${draft.work.name} for ${draft.recipient.name}, and decide what becomes of this gesture.`,venue:{...draft.venue,TABLE:'the work table',VIEWING:'the viewing bench',PUBLIC:'the public display board'},record:{...draft.record,inside:draft.private_reason}};
}
const sentence=(text:string)=>/[.!?…][’'\"”)]?$/.test(text.trim())?text.trim():text.trim()+'.';
export const emotionalVisualKeys=['detail_one','detail_two','detail_three']as const;
export const visualFigureSentence=(v:EmotionalVisual)=>v.figures==='none'?'The image depicts no people.':`The image depicts exactly ${v.figures==='one'?'one human figure':'two human figures'}.`;
export const describeEmotionalWork=(v:EmotionalVisual)=>[sentence(v.material),sentence(v.subject),visualFigureSentence(v),...emotionalVisualKeys.map(key=>sentence(v[key]))].join(' ');
/** All factual paragraphs are generated before the commitment and included in its bytes. */
function legacyEmotionalFacts(w:EmotionalWorld){return Object.fromEntries(emotionalRoutes.map(r=>{
  const p=w.player_name,host=w.host.name,recipient=w.recipient.name,work=w.work.name,note=w.record.name;
  return[r,{...((w.narrationPolicy==='protagonist-camera-4'||w.narrationPolicy==='protagonist-camera-5')?{['ARR'+r[0]]:r[0]==='A'?`${host}, already inside ${w.venue.name}, moved from the work table to the viewing bench to join ${p}.`:r[0]==='B'?`${recipient}, already inside ${w.venue.name}, moved from the work area to the viewing bench to join ${p}.`:`No invitation was sent. ${p} continued the viewing without an invited companion; the other two adults remained in their original areas.`}:{}),...(w.story?{S2:`The invitation is settled. ${sentence(w.story.scene_two)} The explanation remains closed on the work table. If you read and keep it, ${w.choicePolicy==='two-buttons-and-timeout'?'it will accompany the work in your last decision. There are two actions: public display or private deposit. If you do not choose before the timer ends, you keep both.':'it will accompany the work in your last choice: public display, private deposit, or keeping both.'} Archiving it unopened means giving up that knowledge tonight.`,S3:`${sentence(w.story.scene_three)} The viewing has begun. ${r[1]==='A'?'You still hold the open explanation: sharing the work publicly will display the explanation too; a private deposit will include it.':'Your last choice concerns the work alone; its explanation will not accompany it.'} A private deposit will not be collected tonight. Keeping the work leaves it with you.`}:{}),S1:`${p} is holding the ${work}, made by ${host} for ${recipient}. Its explanation, ${note}, is closed on ${w.venue.TABLE}. ${host} is at the table; ${recipient} is in the work area. One of them can be invited to ${w.venue.VIEWING}. The invitation, the explanation and the work are yours to handle.${w.work.visual?` ${(w.narrationPolicy==='protagonist-camera-3'||w.narrationPolicy==='protagonist-camera-4'||w.narrationPolicy==='protagonist-camera-5')?describeEmotionalWork(w.work.visual)+(w.work.format?' The work is one unframed flat piece.':''):sentence(w.work.visual.subject)+' '+visualFigureSentence(w.work.visual)}`:''}${w.story?` ${sentence(w.story.tension)} ${sentence(w.story.anchor)}`:''}`,['D1'+r[0]]:r[0]==='A'?`${p} invited ${host} to share the viewing tonight. The invitation is sent; the viewing has not started yet.`:r[0]==='B'?`${p} asked ${host} to pass an invitation to ${recipient} for tonight's viewing. The invitation is sent.`:`The first moment passed without a response. ${p} sent no invitation.`,['D2'+r[1]]:r[1]==='A'?`${p} opened ${note}, read the explanation, and kept the open original. It says: ${sentence(w.private_reason)}`:r[1]==='B'?`${p} deposited ${note} unopened through the archive slot. The archive's main door stayed closed. The ${work} remains in their keeping.`:`${note} stayed closed on ${w.venue.TABLE}. ${p} did not move or read it.`,['D3'+r[2]]:r[2]==='A'?`${p} left the ${work} on ${w.venue.PUBLIC}.${r[1]==='A'?` The open ${note} is displayed beside it.${r[0]==='B'?` ${recipient}, present for the viewing, read its explanation.`:''}`:''}`:r[2]==='B'?`${p} deposited the ${work}${r[1]==='A'?` and the open ${note}`:''} through the private box slot. The main door stayed closed. No retrieval or reading happened tonight.`:`The last moment passed without a response. ${p} kept the ${work}. Nothing was displayed or deposited in that moment.`}];
}));}
/** New text is committed before play; old worlds retain their exact paragraphs. */
function compileBaseEmotionalFacts(w:EmotionalWorld){
 const facts=legacyEmotionalFacts(w);if(w.prosePolicy!=='story-facts'&&w.prosePolicy!=='scene-prose'&&w.prosePolicy!=='scene-prose-2'&&w.prosePolicy!=='scene-prose-3')return facts;
 const fragment=(s:string)=>s.trim().replace(/[.!?]+$/u,'');
 for(const [route,f]of Object.entries(facts)){
  const v=w.work.visual;
  const depiction=v?`The work uses ${fragment(v.material)} to show ${fragment(v.subject)}. ${v.figures==='none'?'No human figure appears in the drawing.':`The drawing contains ${v.figures==='one'?'one human figure':'two human figures'}.`} Its details draw the eye: ${emotionalVisualKeys.map(k=>fragment(v[k])).join('; ')}.`:sentence(w.work.appearance);
  f.S1=`${w.player_name} holds the ${w.work.name}, made by ${w.host.name} for ${w.recipient.name}. ${w.record.name} lies closed on the work table. ${w.host.name} waits at the table, while ${w.recipient.name} remains in the work area. ${depiction} ${w.story?`${w.host.name} has made a wish known: ${fragment(w.host.public_wish)}. ${w.recipient.name} has made a wish known: ${fragment(w.recipient.public_wish)}. One mark stands out: ${fragment(w.story.anchor)}.`:''}`;
  if(w.story){f.S2=`${w.record.name} still lies closed on the work table. ${sentence(w.story.scene_two)}`;f.S3=`A detail draws attention: ${fragment(w.story.scene_three)}. The viewing has begun.`;}
  if(w.prosePolicy==='scene-prose'){
   f.S1=`${w.player_name} holds the ${w.work.name}, made by ${w.host.name} for ${w.recipient.name}. ${w.record.name} lies closed on the work table beside ${w.host.name}; ${w.recipient.name} is still in the work area. ${v?'On '+fragment(v.material)+', '+fragment(v.subject).replace(/^A /u,'a ')+'. '+(v.figures==='none'?'No human figure appears in the drawing.':`The drawing contains ${v.figures==='one'?'one human figure':'two human figures'}.`)+' '+emotionalVisualKeys.map(k=>sentence(v[k])).join(' '):sentence(w.work.appearance)} ${w.story?`${w.host.name}’s hope is already known: ${sentence(w.host.public_wish)} ${w.recipient.name}’s different hope is also known: ${sentence(w.recipient.public_wish)} One mark interrupts the surface: ${sentence(w.story.anchor)}`:''}`;
   if(w.story){f.S2=`Before the viewing, ${w.host.name} is still at the work table beside the closed ${w.record.name}. ${sentence(w.story.scene_two)}`;f.S3=`The viewing brings one detail into focus: ${sentence(w.story.scene_three)}`;}
  }
  if(w.prosePolicy==='scene-prose-2'){
   const capital=(s:string)=>sentence(s).replace(/\p{L}/u,c=>c.toLocaleUpperCase('en'));
   const noteLabel=/^(?:the|an?)\s/iu.test(w.record.name)?w.record.name.replace(/\p{L}/u,c=>c.toLocaleUpperCase('en')):'The '+w.record.name;
   const depiction=v?`On ${fragment(v.material)} appears ${fragment(v.subject).replace(/^A /u,'a ')}. ${v.figures==='none'?'No human figure appears in the drawing.':`The drawing contains ${v.figures==='one'?'one human figure':'two human figures'}.`} Details catch the eye: ${emotionalVisualKeys.map(k=>fragment(v[k]).replace(/^[A-Z]/u,c=>c.toLocaleLowerCase('en'))).join('; ')}.`:capital(w.work.appearance);
   f.S1=`${w.player_name} holds the ${w.work.name}, made by ${w.host.name} for ${w.recipient.name}. ${noteLabel} lies closed on the work table beside ${w.host.name}; ${w.recipient.name} is still in the work area. ${depiction} ${w.story?`${w.host.name}’s stated hope: ${sentence(w.host.public_wish)} ${w.recipient.name}’s different hope: ${sentence(w.recipient.public_wish)} One mark stands out: ${sentence(w.story.anchor)}`:''}`;
   if(w.story){f.S2=`Before the viewing, ${w.host.name} is still at the work table beside the closed ${w.record.name}. ${sentence(w.story.scene_two)}`;f.S3=`The viewing brings one detail into focus: ${sentence(w.story.scene_three)}`;}
  }
  if(w.prosePolicy==='scene-prose-3'){
   const out=f as Record<string,string>,p=w.player_name,host=w.host.name,recipient=w.recipient.name;
   const label=(name:string)=>/^(?:the|an?|this|that|their|our|my|your)\s/iu.test(name)||/[’']s\b/u.test(name)?name:'the '+name;
   const capital=(s:string)=>s.replace(/\p{L}/u,c=>c.toLocaleUpperCase('en'));
   const work=label(w.work.name),original=capital(label(w.record.name));
   const depiction=v?`The work uses ${fragment(v.material)} to show ${fragment(v.subject).replace(/^(?:A|An|The)\b/u,c=>c.toLocaleLowerCase('en'))}. ${v.figures==='none'?'No human figure appears in the drawing.':`The drawing contains ${v.figures==='one'?'one human figure':'two human figures'}.`} Details catch the eye: ${emotionalVisualKeys.map(k=>fragment(v[k])).join('; ')}.`:sentence(w.work.appearance);
   out.S1=`${p} holds ${work}, made by ${host} for ${recipient}. ${original} lies closed on the work table beside ${host}; ${recipient} is still in the work area. ${depiction} ${w.story?`${host}’s known hope: ${sentence(w.host.public_wish)} ${recipient}’s contrasting hope: ${sentence(w.recipient.public_wish)} One mark stands out: ${sentence(w.story.anchor)}`:''}`;
   if(w.story){out.S2=`Before the viewing, ${host} is still at the work table beside the closed original. ${sentence(w.story.scene_two)}`;out.S3=`The viewing brings one detail into focus: ${sentence(w.story.scene_three)}`;}
   out['D2'+route[1]]=route[1]==='A'?`${p} opened the original, read the explanation, and kept it open. It says: ${sentence(w.private_reason)}`:route[1]==='B'?`${p} deposited the unopened original through the archive slot. The archive’s main door stayed closed. ${capital(work)} remains in their keeping.`:`The original stayed closed on the work table. ${p} did not move or read it.`;
   out['D3'+route[2]]=route[2]==='A'?`${p} left ${work} on the public display board.${route[1]==='A'?` The open original is displayed beside it.${route[0]==='B'?` ${recipient}, present for the viewing, read its explanation.`:''}`:''}`:route[2]==='B'?`${p} deposited ${work}${route[1]==='A'?' and the open original':''} through the private box slot. The main door stayed closed. ${w.factualPolicy==='post-deposit-compact'?'Nothing was retrieved or read afterward.':w.factualPolicy==='post-deposit'?'After the deposit, nothing was retrieved from the box or read inside it.':'No retrieval or reading happened tonight.'}`:`The last moment passed without a response. ${p} kept ${work}. Nothing was displayed or deposited in that moment.`;
   const ending=emotionalEnding(route);if(ending==='F1'||ending==='F2')out[ending]=`${ending==='F1'?host:recipient} remains at the viewing bench. ${capital(work)} is on the public display board.`;
   if(w.dramaticPolicy){
    const wish=(text:string,owner:string)=>{const resolved=sentence(text.replace(/\bthe creator\b/giu,host).replace(/\bthe (?:intended )?recipient\b/giu,recipient));return resolved.startsWith(owner)?resolved:`${owner} has said what they hope for: ${resolved}`;};
    const image=v?`It is made with ${fragment(v.material)}. It depicts ${fragment(v.subject).replace(/^(?:A|An|The)\b/u,article=>article.toLowerCase())}. ${v.figures==='none'?'There are no human figures in the work.':`It shows ${v.figures==='one'?'one human figure':'two human figures'}.`} ${emotionalVisualKeys.map(k=>fragment(v[k])).join('; ')}.`:sentence(w.work.appearance);
    out.S1=[`${p} holds ${work}, made by ${host} for ${recipient}. ${original} lies closed on the work table beside ${host}; ${recipient} is still in the work area.`,image,...(w.story?[`${wish(w.host.public_wish,host)} ${wish(w.recipient.public_wish,recipient)}`,`One mark stands out: ${sentence(w.story.anchor)}`]:[])].join('\n\n');
    if(w.story)out.S2=`${host} speaks from the work table. ${sentence(w.story.scene_two)}`;
    if(route[0]==='B')out.D1B=`${p}'s invitation to ${recipient} is sent through ${host}. The viewing has not started yet.`;
    const second='D2'+route[1];out[second]=out[second]!.replace('opened the original','opened the explanation').replace('unopened original','unopened explanation').replace('The original stayed closed','The unopened explanation stayed closed');
    const third='D3'+route[2];out[third]=out[third]!.replace('open original','open explanation');
   }
  }
 }
 return facts;
}
/** The committed ending reference states only consequences, never inferred consent. */
export function compileEmotionalFacts(w:EmotionalWorld){
 const facts=compileBaseEmotionalFacts(w) as Record<string,Record<string,string>>;
 if(w.endingPolicy!=='present-reactions-1'&&w.endingPolicy!=='outcome-reactions-1'&&w.endingPolicy!=='outcome-reactions-2')return facts;
 for(const route of emotionalRoutes){
  const id=emotionalEnding(route),p=w.player_name,work=w.work.name;
  facts[route]![id]=route[2]==='A'
   ?`${p} chose to display ${work} publicly.`+(id==='F1'?` ${w.host.name} remains at the viewing bench.`:id==='F2'?` ${w.recipient.name} remains at the viewing bench.`:'')
   :route[2]==='B'?`${p} chose the private box for ${work}. The work remains inside; the box is closed.`
   :`${p} kept ${work} when the last moment passed without a response. Responsibility remains with ${p}.`;
 }
 return facts;
}
export const emotionalScopes=Object.fromEntries(emotionalBlockIds.map(id=>{
  const states=emotionalRoutes.flatMap(r=>{const t=emotionalTrace(r);if(id==='S1'||id==='S2'||id==='S3')return[t[id==='S1'?'s0':id==='S2'?'s1':'s3']];if(id.startsWith('ARR'))return r[0]===id.at(-1)?[t.s3]:[];if(id.startsWith('D'))return r[Number(id[1])-1]===id.at(-1)?[t[id[1]==='1'?'s1':id[1]==='2'?'s2':'s4']]:[];return emotionalEnding(r)===id?[t.s4]:[];});
  const facts=Object.fromEntries(Object.entries(states[0]!).filter(([k,v])=>states.every(s=>s[k]===v)));
  return [id,{facts,claims:Object.entries(facts).map(([k,v])=>k+'='+v),secret:id==='D2A'||/^F[123]$/.test(id),paragraphs:id.startsWith('S')?10:id.startsWith('F')?10:3}];
}));

/** A fresh projection for every call: no shared mutable actor or location data. */
export function emotionalProjection(w:EmotionalWorld,id:string){
  const s=emotionalScopes[id];if(!s)throw new Error('Unknown block.');
  const context:Record<string,unknown>={protagonist:w.player_name,place:{name:w.venue.name,atmosphere:w.venue.atmosphere},work:{...w.work},motif_one:w.public_motif_one,motif_two:w.public_motif_two,past_memory:w.shared_past_memory,future_question:w.future_question,current_facts:{...s.facts},temporal_constraints:'Already inside this venue in the same evening. No re-entry. Reading is unhurried.',authorship_constraint:'HOST created WORK for RECIPIENT. PLAYER did not create it. Do not deny HOST authorship or invent a handover from a third creator.',knowledge_field_meaning:'Knowledge flags refer only to the private creation motive, never current deposits or awareness of the work.'};
  if(w.story){
    context.authorship={creator:w.host.name,recipient:w.recipient.name,custodian:w.player_name,rule:'Only creator made WORK; custodian holds it and did not draw, paint or create it. Role references do not put absent people in the current scene.'};
    delete context.motif_one;delete context.motif_two;delete context.future_question;
    context.sensory_detail=id==='S1'||id==='S2'||id==='D2A'||id==='ARRA'?w.public_motif_one:w.public_motif_two;
    if(!id.startsWith('ARR'))context.public_tension=w.story.tension;
    // The compiler presents the clue in S1. Writers do not need its wording
    // or origin; omit clue-bearing clauses from the general visual description.
    const clueWords:string[]=w.story.anchor.toLowerCase().match(/[\p{L}]+/gu)??[];
    const general=w.work.appearance.split(/,|\bwith\b/iu).filter(part=>{const tokens:string[]=part.toLowerCase().match(/[\p{L}]+/gu)??[];return tokens.filter(t=>t.length>4&&clueWords.includes(t)).length<2;}).join(', ').trim();
    context.work={name:w.work.name,appearance:general||'a flat work entrusted to PLAYER'};
    if(w.work.visual&&s.facts.work!=='BOX'){context.work={name:w.work.name,appearance:w.work.appearance,visual:structuredClone(w.work.visual)};context.visual_boundary='This is the complete immutable depiction, identical in every scene. Describe only its listed subject, figure count and details; do not add people, objects, colors, marks, inscriptions or changes of lighting inside the image. Room occupants are not automatically figures in the work. Reactions and interpretations may change; the depicted facts cannot.';}
    if(s.facts.work==='BOX'){context.work={name:w.work.name,visibility:'Inside the closed private box, not visible. Do not describe a visible drawing, surface, lines or colors. Use the room and the reaction only.'};}
    if(id==='S1'||id==='S2')context.work_boundary='The work is in PLAYER hands throughout; never lay it on the table or lean it against a surface.';
    if(id.startsWith('F'))context.visible_arrangement=s.facts.work==='BOX'?'The work is inside the closed private box and cannot be seen; describe it only as remembered, never on a board or bench.':s.facts.work==='PUBLIC'?'The work is on the public display board. The viewing bench is seating for people, never a surface holding the work.':'The work remains with PLAYER, never on the board or inside a deposit.';
    if(id==='S2')context.development=w.story.scene_two;
    if(id==='S3')context.development=w.story.scene_three;
    if(id.startsWith('F'))context.open_interpretation=w.future_question;
    if(id.startsWith('ARR'))context.arrival_boundary='Only the named invited guest joins PLAYER at the bench. Do not place the other guest at the bench or give them current dialogue. They remain in their original area; their earlier public wishes can be referred to.';
    if(s.facts.player_knows===undefined)context.knowledge_boundary='Whether PLAYER knows the private motive varies here. Do not claim they know it or that they are uncertain about why the work was made; discuss visible artwork and public wishes only.';
    if(s.facts.record===undefined)context.record_boundary='The explanation may or may not accompany the work. Do not describe the work as unaccompanied or alone, and do not introduce any record.';
    context.prose_boundary='The engine states all handling of the work, explanation, invitations and deposits. Develop present reactions and dialogue only. Do not repeat the compiled factual paragraph, sensory phrase or public wishes as padding. A body gesture cannot touch or hold a tracked object. Do not add memories except the supplied public memory in S1. Do not invent an answer to the anchor detail.';
  }
  const actors=['PLAYER'];const place=context.place as Record<string,unknown>;
  if(id==='S1'||id==='S2'||id.startsWith('D2')||id==='D1A'||id==='D1B'){context.host={...w.host};place.table=w.venue.TABLE;if(id==='S2'||id.startsWith('D2'))place.archive={surface:w.venue.ARCHIVE_surface,access:'always available one-way slot; main door remains closed'};actors.push('HOST');}
  if(id!=='S1')delete context.past_memory;
  if(id==='S1')context.inciting_request=w.public_hook;
  if(id==='S1'){context.recipient={...w.recipient,at:'WORK_AREA'};actors.push('RECIPIENT');}
  if(id==='D1A'||id==='D1B')context.invitation_target={name:id==='D1A'?w.host.name:w.recipient.name,by:'spoken request to '+w.host.name,when:'tonight, before S3; not a future walk',where:w.venue.VIEWING};
  if(s.facts.guest_at_VIEWING===undefined)context.attendance_constraint='Attendance varies. Do not claim a lone protagonist, empty spare seat or absent companion.';
  if(id==='S1'||id==='S2')context.record={name:w.record.name,exterior:w.record.exterior,kind:'Prewritten signed explanation, not a blank form or choices log.'};
  if(s.secret){context.record={name:w.record.name,source_facts:{author:w.host.name,recipient:w.recipient.name,reason:w.private_reason}};context.reason_subject=w.host.name+' created the work for '+w.recipient.name+'. Any he/she/they in the reason refers to the creator.';}
  if(id==='ARRA'||id==='F1'){context.guest={...w.host,at:'VIEWING'};actors.push('HOST');}
  if(id==='ARRB'||id==='F2'){context.guest={...w.recipient,at:'VIEWING'};actors.push('RECIPIENT');}
  if(id.startsWith('ARR')||id==='S3'||id.startsWith('F'))place.viewing=w.venue.VIEWING;
  if(id==='S3'||id.startsWith('D3')||id.startsWith('F')){place.public_display=w.venue.PUBLIC;place.private_box={surface:w.venue.BOX_surface,access:'always available one-way slot; main door closed; no retrieval or reading tonight'};}
  const notes=id==='S1'?'Explain the entrusted work and concrete mystery. Handover is already done. PLAYER holds WORK; RECORD closed on TABLE. Lead only to choosing one invitation. Do not describe archive or private-box access yet: those choices come in later scenes. The present choice is whom to invite, not what to do with the objects.':id==='S2'?'Invitation settled; do not say which option was chosen or repeat it. HOST still at TABLE. The closed explanation stays on TABLE throughout this block. No actor picks it up, moves or opens it before D2. Present the approaching choice without performing it.':id==='S3'?'The selected arrival already happened. Mention no record, private reason or current guest. Lead to PUBLIC/BOX/retain, never archive for WORK.':id==='ARRT'?'No invited guest joins VIEWING. Do not claim the venue is empty. No PLAYER speech or new task.':id.startsWith('ARR')?'Named invited guest joins VIEWING now. Do not mention record, its knowledge or its location.':id==='D1T'?'No response, speech or invitation by PLAYER; preserve objects.':id.startsWith('D1')?'PLAYER sends this invitation by asking HOST; no arrival yet.':id==='D2A'?'PLAYER opens and reads RECORD; clearly explain the exact reason; retain the open original. Do not disclose to RECIPIENT.':id==='D2B'?'Deposit original RECORD closed/unread through ARCHIVE slot. Never open a door or invent a key.':id==='D2T'?'RECORD remains closed on TABLE; PLAYER does not open, move, file or speak.':id==='D3A'?'Place WORK in PUBLIC once. Do not mention record or guests; those vary.':id==='D3B'?'Deposit WORK through BOX slot once; no opening a door, record mention or recipient reading.':id==='D3T'?'Retain WORK; no PLAYER speech, deposit, added task, record or guests.':'AFTER D3: preserve settled facts, never replay the action. Leave only the prepared future question open, without new promises or messages.';
  if(w.story&&place.public_display)context.public_display_boundary='The public display board is a static physical pinboard for paper. Never a screen, changing timetable, glowing letters or an electronic display. Its notices do not cycle, flicker, update or rearrange.';
  return {context,allowed_named_current_actors:actors,permitted_claims:[...s.claims],notes:id.startsWith('D')?'The server has already narrated the factual action and its material result. Write only the immediate human reaction, observation or safe memory afterwards. Do not repeat a transfer, reading, invitation or message, do not move WORK/RECORD, and do not mention records, slots, keys or archive access. PLAYER does not speak on T. No further task or promise.':notes};
}

const decisionId=(node:string)=>node==='S1'?'D1':node==='S2'?'D2':node==='S3'?'D3':null;
const routeOf=(p:EmotionalPlayer)=>p.decisions.map(d=>d.choice).join('');
export function createEmotionalState(at:number,players=[{id:'p1'}]):EmotionalState{
  if(!Number.isSafeInteger(at)||at<0||!players.length||new Set(players.map(p=>p.id)).size!==players.length||players.some(p=>!p.id))throw new Error('Invalid initial state.');
  return {version:'emotional-1',players:players.map(p=>({id:p.id,node:'S1',phase:'sealed',deadline:null,decisions:[],visited:[]})),revision:0,lastSequence:0,lastAt:at,lastRequestId:null};
}
function resolve(state:EmotionalState,p:EmotionalPlayer,choice:EmotionalChoice,at:number,sequence:number){
  const id=decisionId(p.node);if(!id)throw new Error('No decision here.');
  p.decisions.push({id,choice,actor:p.id,at,sequence});p.node=id+choice;p.phase='reading';p.deadline=null;p.visited.push(p.node);state.lastAt=at;state.lastSequence=sequence;state.revision++;
}
export function syncEmotional(input:EmotionalState,at:number){
  if(!Number.isSafeInteger(at)||at<0)throw new Error('Invalid server time.');const s=structuredClone(input);
  for(const p of s.players.filter(p=>p.phase==='deciding'&&p.deadline!==null&&at>=p.deadline).sort((a,b)=>a.deadline!-b.deadline!||a.id.localeCompare(b.id)))resolve(s,p,'T',p.deadline!,s.lastSequence+1);
  return s;
}
export function stepEmotional(a:EmotionalArtifact,input:EmotionalState,e:EmotionalInput):{ok:boolean;state:EmotionalState;error?:string}{
  const deny=(state=input)=>({ok:false,state,error:'This moment has changed. Recover your adventure.'});
  if(!input.players.some(p=>p.id===e.actor)||!Number.isSafeInteger(e.at)||e.at<input.lastAt||!Number.isSafeInteger(e.sequence)||e.sequence<=input.lastSequence||!e.requestId||!['start','continue','begin','choose'].includes(e.kind)||(e.kind==='choose'&&!['A','B'].includes(e.choice??'')))return deny();
  const s=syncEmotional(input,e.at),p=s.players.find(p=>p.id===e.actor)!;
  if(p.node!==e.node||p.phase==='finished')return deny(s);
  if(e.kind==='start'){if(p.phase!=='sealed')return deny(s);p.phase='reading';p.visited.push('S1');}
  else if(e.kind==='begin'){if(!decisionId(p.node)||p.phase==='sealed')return deny(s);if(p.phase==='reading'){p.phase='deciding';p.deadline=e.at+12000;}}
  else if(e.kind==='choose'){if(p.phase!=='deciding')return deny(s);resolve(s,p,e.choice!,e.at,Math.max(e.sequence,s.lastSequence+1));s.lastRequestId=e.requestId;return {ok:true,state:s};}
  else {if(p.phase!=='reading'||decisionId(p.node))return deny(s);const next=p.node.startsWith('D1')?'S2':p.node.startsWith('D2')?'ARR'+p.decisions[0]!.choice:p.node.startsWith('ARR')?'S3':p.node.startsWith('D3')?emotionalEnding(routeOf(p)):null;if(!next||!a.blocks[next])return deny(s);p.node=next;p.visited.push(next);if(next.startsWith('F'))p.phase='finished';}
  s.lastAt=e.at;s.lastSequence=Math.max(e.sequence,s.lastSequence+1);s.lastRequestId=e.requestId;s.revision++;return {ok:true,state:s};
}
function sceneTitle(id:string){return id==='S1'?'An unfinished gesture':id==='S2'?'What the paper holds':id==='S3'?'Where it belongs':id.startsWith('ARR')?'Who shares the moment':id.startsWith('F')?'What remains':'The choice you made';}
export function emotionalExplanation(a:EmotionalArtifact,p:EmotionalPlayer){
  const choices=p.decisions.map(d=>d.choice),w=a.world;
  return [choices[0]==='A'?`You invited ${w.host.name}.`:choices[0]==='B'?`You invited ${w.recipient.name}.`:'No invitation was sent when the first moment passed.',choices[1]==='A'?'You read the explanation and kept the open original.':choices[1]==='B'?'You archived the explanation without reading it.':'The explanation stayed closed on the table.',choices[2]==='A'?`You shared the ${w.work.name} publicly${choices[1]==='A'?', with the explanation':', without its explanation'}.`:choices[2]==='B'?`You left the ${w.work.name} in the private deposit box. Nobody collected it from the box that night.`:`You kept the ${w.work.name}.`,...(p.phase==='finished'?[`${w.host.name} created it for ${w.recipient.name}: ${sentence(w.private_reason)}`]:[])];
}
export function projectEmotional(a:EmotionalArtifact,s:EmotionalState,actor:string):EmotionalView{
  const p=s.players.find(p=>p.id===actor);if(!p)throw new Error('Unknown actor.');const w=a.world;
  const visibleText=(id:string)=>{const route=routeOf(p).padEnd(3,'T');let factual=a.factualText[route]?.[id];if(id==='D2A'&&factual&&sentence(w.private_reason)===w.private_reason.trim())factual=factual.replace('It says: '+w.private_reason+'.','It says: '+sentence(w.private_reason));return[factual,a.blocks[id]?.text].filter(Boolean).join('\n\n').split('\n\n').filter(Boolean);};
  const scene:EmotionalScene={id:p.node,title:sceneTitle(p.node),paragraphs:p.phase==='sealed'?[]:visibleText(p.node)};
  const id=decisionId(p.node);if(id&&p.phase!=='sealed')scene.decision=emotionalDecision(w,id,routeOf(p));
  return {revision:s.revision,title:w.title,goal:w.public_hook,playerName:a.players.find(player=>player.id===actor)?.name??w.player_name,phase:p.phase,scene,deadline:p.deadline,decisions:structuredClone(p.decisions),history:p.visited.map(id=>({id,title:sceneTitle(id),paragraphs:visibleText(id)})),lastRequestId:s.lastRequestId,ending:p.phase==='finished'?{id:p.node,explanation:emotionalExplanation(a,p),closedChoices:p.decisions.flatMap(d=>{const choices=emotionalDecision(w,d.id as 'D1'|'D2'|'D3',routeOf(p));return[...choices.options,{id:'T',label:choices.inaction}].filter(option=>option.id!==d.choice).map(option=>({decision:d.id,choice:option.id as EmotionalChoice,label:option.label}));})}:null,art:structuredClone(a.art)};
}

function emotionalDecision(w:EmotionalWorld,id:'D1'|'D2'|'D3',route=''):NonNullable<EmotionalScene['decision']>{
 const options:NonNullable<EmotionalScene['decision']>['options']=id==='D1'?[{id:'A',label:'Invite '+w.host.name},{id:'B',label:'Invite '+w.recipient.name}]:id==='D2'?[{id:'A',label:'Read and keep the explanation'},{id:'B',label:'Archive it unopened'}]:[{id:'A',label:w.story&&route[1]==='A'?'Share work and explanation publicly':'Share it publicly'},{id:'B',label:'Leave it in the private box'}];
 if(w.story){const costs=id==='D1'?[`${w.recipient.name} will not join the viewing.`,`${w.host.name} will not join the viewing.`]:id==='D2'?['You learn the reason; the open explanation accompanies the work in your final choice, including public display.','Its contents stay private; you give up reading the reason tonight.']:['Other people can see it; you give up control of its audience.','It stays out of public view; nobody collects it tonight.'];options.forEach((option,i)=>option.cost=costs[i]!);}
 return {id,durationMs:12000,inaction:id==='D1'?'Let the 12 seconds pass: no invitation is sent.':id==='D2'?'Let the 12 seconds pass: the explanation stays closed on the table.':'Let the 12 seconds pass: you keep the work.',prompt:id==='D1'?'There is room for one invitation. Who will share the viewing?':id==='D2'?'The explanation can stay closed. What do you do with it?':'Where will you leave the work?',options};
}
