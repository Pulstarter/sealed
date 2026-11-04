import type { ActionDefinition, ActionInput, Condition, Debrief, DomainEvent, Effect, GameState, PlaceId, PlayerState, PlayerView, SuggestedAction, WorldDefinition } from './types.js';

function npcPlace(world: WorldDefinition, id: string, at: number): PlaceId | null {
  return world.npcs.find(n=>n.id===id)?.agenda.find(s=>s.from<=at&&at<s.until)?.placeId??null;
}
function matches(world: WorldDefinition,state: GameState, condition: Condition | undefined, actor?: string): boolean {
  if(!condition)return true;
  const p=actor?state.players[actor]:undefined;
  switch(condition.type){
    case 'all':return condition.conditions.every(c=>matches(world,state,c,actor));
    case 'any':return condition.conditions.some(c=>matches(world,state,c,actor));
    case 'flag':return Boolean(state.flags[condition.id])===condition.value;
    case 'fact':return Boolean(p?.facts.includes(condition.id));
    case 'evidence':return Boolean(p?.evidence.includes(condition.id));
    case 'done':return Boolean(p?.completed.includes(condition.id));
    case 'npc':return Boolean(p&&!p.busy?.to&&npcPlace(world,condition.id,state.now)===p.placeId);
  }
}
function effects(state:GameState, list:Effect[], actor?:string):void {
  for(const effect of list){
    if(effect.type==='flag')state.flags[effect.id]=effect.value;
    else if(actor){const p=state.players[actor];if(!p)continue;const xs=effect.type==='fact'?p.facts:p.evidence;if(!xs.includes(effect.id))xs.push(effect.id);}
  }
}
function emit(state:GameState,event:Omit<DomainEvent,'perceivedBy'>, everyone=false, ownActor?:string):void {
  const perceivedBy=Object.entries(state.players).filter(([id,p])=>ownActor?id===ownActor:everyone||(!p.busy?.to&&event.placeId===p.placeId)).map(([id])=>id);
  state.events.push({...event,perceivedBy});
}
type Reminder = NonNullable<WorldDefinition['reminders']>[number];
function knowsReminder(state:GameState,actor:string,reminder:Reminder):boolean {
  const player=state.players[actor]!;
  return reminder.knownFacts.some(id=>player.facts.includes(id)||player.evidence.includes(id))||
    reminder.knownEvents.some(id=>state.events.some(event=>event.id===`world:${id}`&&event.perceivedBy.includes(actor)));
}
function recallAppointment(state:GameState,reminder:Reminder):void {
  for(const actor of Object.keys(state.players).sort()){
    if(!knowsReminder(state,actor,reminder))continue;
    const id=`reminder:${encodeURIComponent(reminder.id)}:${encodeURIComponent(actor)}`;
    const text=`Reminder: ${reminder.label}. This is the scheduled time, not confirmation of events outside your view.`;
    // Keep reminders already persisted by the previous Wait-only implementation.
    const recalled=state.events.some(event=>event.id===id||
      (event.kind==='reminder'&&/^reminder:\d+$/.test(event.id)&&event.at===reminder.at&&event.actor===actor&&event.text===text));
    if(!recalled)emit(state,{id,at:reminder.at,kind:'reminder',actor,text},false,actor);
  }
}
function actionAt(world:WorldDefinition,state:GameState,actor:string,id:string):ActionDefinition|undefined{
  const p=state.players[actor];if(!p)return;
  if(id.startsWith('move:')){
    const to=id.slice(5) as PlaceId;
    const exit=world.places.find(x=>x.id===p.placeId)?.exits.find(x=>x.to===to);
    if(!exit)return;
    return {id,kind:'use',placeId:p.placeId,label:`Go to ${world.places.find(x=>x.id===to)!.name}`,durationMs:exit.durationMs,effects:[],text:`You arrive at ${world.places.find(x=>x.id===to)!.name}.`};
  }
  return world.actions.find(a=>a.id===id);
}
function available(world:WorldDefinition,state:GameState,actor:string,a:ActionDefinition):boolean{
  const p=state.players[actor];
  return Boolean(p&&!state.finished&&!p.busy&&p.placeId===a.placeId&&
    (!a.once||!p.completed.includes(a.id))&&
    (a.opensAt===undefined||state.now>=a.opensAt)&&
    (a.closesAt===undefined||state.now+a.durationMs<a.closesAt)&&
    state.now+a.durationMs<world.window.durationMs&&matches(world,state,a.requires,actor));
}
export function createState(world:WorldDefinition):GameState{
  const state:GameState={now:0,players:{},flags:{},events:[],actions:[],processedEvents:[],lastSequence:0,finished:false,results:{}};
  for(const p of world.players)state.players[p.id]={placeId:p.startPlace,facts:[...p.initialFacts],evidence:[],completed:[],busy:null};
  return advance(world,state,0);
}
export function advance(world:WorldDefinition,input:GameState,to:number):GameState{
  if(!Number.isSafeInteger(to)||to<input.now)throw new Error('Game time cannot move backwards.');
  const state=structuredClone(input);
  if(state.finished)return state;
  const target=Math.min(to,world.window.durationMs);
  const reminders=(world.reminders??[]).filter(reminder=>reminder.at>=input.now&&reminder.at<=target)
    .sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
  let reminderIndex=0;
  while(true){
    const scheduled=world.scheduledEvents.filter(e=>!state.processedEvents.includes(e.id)&&e.at<=target).sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
    const pending=Object.values(state.players).flatMap(p=>p.busy?[p.busy]:[]).filter(p=>p.endsAt<=target).sort((a,b)=>a.endsAt-b.endsAt||a.sequence-b.sequence);
    const event=scheduled[0],task=pending[0],reminder=reminders[reminderIndex];
    if(!event&&!task&&!reminder)break;
    // At a shared instant, apply world events and completed work before recalling known appointments.
    if(reminder&&(!event||reminder.at<event.at)&&(!task||reminder.at<task.endsAt)){
      state.now=reminder.at;reminderIndex+=1;recallAppointment(state,reminder);
    }else if(event&&(!task||event.at<=task.endsAt)){
      state.now=event.at;state.processedEvents.push(event.id);
      if(matches(world,state,event.requires)){
        effects(state,event.effects);
        emit(state,{id:`world:${event.id}`,at:state.now,text:event.text,placeId:event.placeId,kind:'world'},event.public);
      }else if(event.otherwiseText)emit(state,{id:`world:${event.id}`,at:state.now,text:event.otherwiseText,placeId:event.placeId,kind:'world'},event.public);
    }else if(task){
      state.now=task.endsAt;const p=state.players[task.actor]!;
      const a=actionAt(world,state,task.actor,task.id);p.busy=null;
      if(task.to){p.placeId=task.to;emit(state,{id:`action:${task.sequence}:done`,at:state.now,text:`You arrive at ${world.places.find(x=>x.id===task.to)!.name}.`,placeId:task.to,actor:task.actor,cause:task.requestId,kind:'action'},false,task.actor);}
      else if(a&&matches(world,state,a.requires,task.actor)){
        effects(state,a.effects,task.actor);if(a.once&&!p.completed.includes(a.id))p.completed.push(a.id);
        emit(state,{id:`action:${task.sequence}:done`,at:state.now,text:a.text,placeId:p.placeId,actor:task.actor,cause:task.requestId,kind:'action'},false,task.actor);
      }else emit(state,{id:`action:${task.sequence}:interrupted`,at:state.now,text:'The opportunity ended before you completed the action.',placeId:p.placeId,actor:task.actor,kind:'action'},false,task.actor);
    }
  }
  state.now=target;
  if(target===world.window.durationMs){
    state.finished=true;
    for(const player of world.players){const ending=world.endings.find(e=>matches(world,state,e.requires,player.id));state.results[player.id]=ending?.id??'failure';state.players[player.id]!.busy=null;}
  }
  return state;
}
export function step(world:WorldDefinition,input:GameState,entry:ActionInput):{state:GameState;ok:boolean;error?:string}{
  const deny=()=>({state:input,ok:false,error:'That action is not available now.'});
  if(!input.players[entry.actor]||input.finished||!Number.isSafeInteger(entry.serverSequence)||entry.serverSequence<=input.lastSequence||entry.submittedAtGame<input.now||!Number.isSafeInteger(entry.submittedAtGame)||!entry.requestId||input.actions.some(a=>a.requestId===entry.requestId))return deny();
  let state=advance(world,input,entry.submittedAtGame);const p=state.players[entry.actor]!;
  if(state.finished)return {state,ok:false,error:'This journey has ended.'};
  if(entry.actionId==='wait:next'||entry.actionId==='wait:end'||entry.actionId.startsWith('wait:until:')){
    const preview=waitPlan(world,state,entry.actor);
    const selected=entry.actionId.startsWith('wait:until:')?Number(entry.actionId.slice('wait:until:'.length)):preview.until;
    if(!Number.isSafeInteger(selected)||selected<=state.now||selected>preview.until)return {state,ok:false,error:'That waiting point has passed or is too far ahead. Choose the current wait option.'};
    const candidates=world.scheduledEvents.filter(e=>e.at>state.now&&(e.public||(!p.busy?.to&&e.placeId===p.placeId))).map(e=>e.at);
    if(p.busy)candidates.push(p.busy.endsAt);
    const target=Math.min(...candidates,selected,world.window.durationMs);
    state.lastSequence=entry.serverSequence;state.actions.push({...entry});
    state=advance(world,state,target);
    return {state,ok:true};
  }
  if(entry.actionId==='cancel'&&p.busy&&!p.busy.to){
    const busy=p.busy;p.busy=null;if(busy.to)p.placeId=busy.from;
    state.lastSequence=entry.serverSequence;state.actions.push({...entry});
    emit(state,{id:`action:${entry.serverSequence}:cancel`,at:state.now,text:'You stop the task. The time already spent is gone.',placeId:p.placeId,actor:entry.actor,kind:'action'},false,entry.actor);
    return {state,ok:true};
  }
  const action=actionAt(world,state,entry.actor,entry.actionId);
  if(!action||!available(world,state,entry.actor,action)||action.irreversible&&!entry.confirmed)return {state,ok:false,error:'That action is not available now.'};
  state.lastSequence=entry.serverSequence;state.actions.push({...entry});
  p.busy={id:action.id,actor:entry.actor,label:action.label,startedAt:state.now,endsAt:state.now+action.durationMs,sequence:entry.serverSequence,requestId:entry.requestId,from:p.placeId,...(action.id.startsWith('move:')?{to:action.id.slice(5) as PlaceId}:{})};
  emit(state,{id:`action:${entry.serverSequence}:start`,at:state.now,text:`You begin: ${action.label}.`,placeId:p.placeId,actor:entry.actor,cause:entry.requestId,kind:'action'},false,entry.actor);
  return {state,ok:true};
}
function waitPlan(world:WorldDefinition,state:GameState,actor:string):NonNullable<SuggestedAction['wait']>{
  const p=state.players[actor]!;
  // Only public bounds and already learned appointments influence the preview.
  // An unknown perceptible event may interrupt it later, never reveal its time early.
  const bound=p.busy?.endsAt??(Math.floor(state.now/60_000)+1)*60_000;
  const known=(world.reminders??[]).filter(r=>r.at>state.now&&knowsReminder(state,actor,r))
    .sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
  const until=Math.min(bound,known[0]?.at??Infinity,world.window.durationMs);
  const reminder=known.find(r=>r.at===until)?.label;
  const closing=!p.busy?world.actions.find(a=>available(world,state,actor,a)&&a.closesAt!==undefined&&until>=a.closesAt-a.durationMs):undefined;
  return {until,...(reminder?{reminder}:{}),...(closing?{warning:`This wait can leave too little time to start: ${closing.label}.`}:{})};
}
export function project(world:WorldDefinition,state:GameState,actor:string):PlayerView{
  const p=state.players[actor],slot=world.players.find(x=>x.id===actor);if(!p||!slot)throw new Error('Unknown player.');
  const place=world.places.find(x=>x.id===p.placeId)!;
  const actions:SuggestedAction[]=[];
  if(!state.finished){
    if(!p.busy){
      for(const a of world.actions)if(available(world,state,actor,a))actions.push({id:a.id,label:a.label,kind:a.kind,durationMs:a.durationMs,irreversible:Boolean(a.irreversible),...(a.closesAt!==undefined?{timing:{startBefore:a.closesAt-a.durationMs,finishBefore:a.closesAt}}:{})});
      for(const edge of place.exits){const a=actionAt(world,state,actor,`move:${edge.to}`)!;if(available(world,state,actor,a))actions.push({id:a.id,label:a.label,kind:'move',durationMs:a.durationMs,irreversible:false});}
    }else if(!p.busy.to)actions.push({id:'cancel',label:'Cancel current task',kind:'control',durationMs:0,irreversible:false});
    const wait=waitPlan(world,state,actor);
    actions.push({id:`wait:until:${wait.until}`,label:'Wait briefly',kind:'wait',durationMs:0,irreversible:false,wait});
  }
  const describe=(id:string)=>({id,text:world.facts.find(f=>f.id===id)?.text??id});
  const ending=state.results[actor]??null;
  const history=state.events.filter(e=>e.perceivedBy.includes(actor)).map((e,i)=>({id:`${actor}:${i}`,at:e.at,text:e.text,...(e.placeId?{placeId:e.placeId}:{}),...(e.actor?{actor:e.actor}:{}),kind:e.kind,perceivedBy:[actor]}));
  return {playerId:actor,title:world.title,origin:world.origin,role:slot.role,now:state.now,window:{...world.window},place:{id:place.id,name:place.name,description:place.description},npcs:p.busy?.to?[]:world.npcs.filter(n=>npcPlace(world,n.id,state.now)===place.id).map(({id,name,archetype})=>({id,name,archetype})),facts:p.facts.map(describe),evidence:p.evidence.map(describe),history,actions,busy:p.busy?{...p.busy}:null,finished:state.finished,ending,endingText:ending?world.endings.find(e=>e.id===ending)?.text??'Journey ended.':null};
}
export function buildDebrief(world:WorldDefinition,state:GameState,actor:string):Debrief|null {
  if(!state.players[actor]||!state.finished||!world.closure)return null;
  const definition=world.closure;
  const checks=(list:typeof definition.prevention)=>list.map(item=>{
    const met=matches(world,state,item.requires,actor);
    return {id:item.id,label:item.label,met,explanation:met?item.metText:item.missingText};
  });
  const name=(id:PlaceId)=>world.places.find(p=>p.id===id)?.name??id;
  const locationBefore=(index:number)=>{
    let location=name(world.players.find(p=>p.id===actor)!.startPlace);
    for(const event of state.events.slice(0,index)){
      if(event.actor!==actor||!event.cause)continue;
      const action=state.actions.find(a=>a.actor===actor&&a.requestId===event.cause);
      if(!action?.actionId.startsWith('move:'))continue;
      const target=name(action.actionId.slice(5) as PlaceId);
      if(event.id.endsWith(':start'))location=`Travelling to ${target}`;
      else if(event.id.endsWith(':done'))location=target;
    }
    return location;
  };
  const moments=definition.moments.flatMap(moment=>{
    const index=state.events.findIndex(e=>e.id===`world:${moment.eventId}`);
    if(index<0)return [];
    const event=state.events[index]!;
    return [{eventId:moment.eventId,title:moment.title,at:event.at,text:event.text,
      ...(event.placeId?{placeName:name(event.placeId)}:{}),playerLocation:locationBefore(index),witnessed:event.perceivedBy.includes(actor)}];
  });
  return {truth:definition.truth,prevented:matches(world,state,definition.prevented,actor),
    prevention:checks(definition.prevention),documentation:checks(definition.documentation),moments};
}
export function canonicalizeWorld(world:WorldDefinition):string{
  function encode(value:unknown):string{
    if(value===null||typeof value==='boolean'||typeof value==='string')return JSON.stringify(value);
    if(typeof value==='number'){if(!Number.isSafeInteger(value))throw new Error('World numbers must be safe integers.');return JSON.stringify(value);}
    if(Array.isArray(value))return `[${value.map(encode).join(',')}]`;
    if(typeof value==='object'&&value&&Object.getPrototypeOf(value)===Object.prototype)return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${encode((value as Record<string,unknown>)[k])}`).join(',')}}`;
    throw new Error('World contains a non-JSON value.');
  }
  return encode(world);
}
export function validateWorld(world:WorldDefinition):string[]{
  const errors:string[]=[];const places=new Set(world.places.map(p=>p.id));const facts=new Set(world.facts.map(f=>f.id));const npcs=new Set(world.npcs.map(n=>n.id));
  if(places.size!==world.places.length||facts.size!==world.facts.length||npcs.size!==world.npcs.length)errors.push('Duplicate world identifiers.');
  if(!Number.isSafeInteger(world.window.durationMs)||world.window.durationMs<=0||world.window.scale<=0)errors.push('Invalid time window.');
  if(!world.players.length||new Set(world.players.map(p=>p.id)).size!==world.players.length)errors.push('Invalid player slots.');
  for(const p of world.players)if(!places.has(p.startPlace)||p.initialFacts.some(f=>!facts.has(f)))errors.push('Invalid player references.');
  for(const p of world.places)for(const e of p.exits)if(!places.has(e.to)||!Number.isSafeInteger(e.durationMs)||e.durationMs<=0)errors.push('Invalid exit.');
  function check(c:Condition|undefined):void{if(!c)return;if(c.type==='all'||c.type==='any')c.conditions.forEach(check);else if((c.type==='fact'||c.type==='evidence')&&!facts.has(c.id))errors.push('Unknown fact.');else if(c.type==='npc'&&!npcs.has(c.id))errors.push('Unknown character.');}
  if(world.places[0]){const seen=new Set<PlaceId>();const pending:PlaceId[]=[world.places[0].id];while(pending.length){const id=pending.pop()!;if(seen.has(id))continue;seen.add(id);for(const e of world.places.find(p=>p.id===id)?.exits??[])pending.push(e.to);}if(seen.size!==places.size)errors.push('Place graph is not connected.');}
  if(new Set(world.actions.map(a=>a.id)).size!==world.actions.length)errors.push('Duplicate actions.');
  for(const a of world.actions){if(!places.has(a.placeId)||!Number.isSafeInteger(a.durationMs)||a.durationMs<=0)errors.push('Invalid action.');if(a.opensAt!==undefined&&a.closesAt!==undefined&&a.opensAt>=a.closesAt)errors.push('Invalid scene window.');check(a.requires);for(const e of a.effects)if(e.type!=='flag'&&!facts.has(e.id))errors.push('Unknown effect fact.');}
  for(const n of world.npcs){let until=0;for(const s of n.agenda){if(s.from<until||s.until<=s.from||s.placeId&&!places.has(s.placeId))errors.push('Invalid character agenda.');until=s.until;}}
  if(new Set(world.scheduledEvents.map(e=>e.id)).size!==world.scheduledEvents.length)errors.push('Duplicate events.');
  for(const e of world.scheduledEvents){if(!Number.isSafeInteger(e.at)||e.at<0||e.at>world.window.durationMs||e.placeId&&!places.has(e.placeId))errors.push('Invalid event.');check(e.requires);for(const effect of e.effects)if(effect.type!=='flag'&&!facts.has(effect.id))errors.push('Unknown scheduled effect.');}
  for(const e of world.endings)check(e.requires);
  for(const r of world.reminders??[])if(!Number.isSafeInteger(r.at)||r.at<0||r.at>world.window.durationMs||
    r.knownFacts.some(id=>!facts.has(id))||r.knownEvents.some(id=>!world.scheduledEvents.some(e=>e.id===id)))errors.push('Invalid reminder references.');
  if(world.closure){check(world.closure.prevented);for(const c of [...world.closure.prevention,...world.closure.documentation])check(c.requires);
    for(const m of world.closure.moments)if(!world.scheduledEvents.some(e=>e.id===m.eventId))errors.push('Invalid debrief event.');}
  if(!world.endings.some(e=>!e.requires))errors.push('No fallback ending.');
  try{canonicalizeWorld(world);}catch{errors.push('Invalid canonical world.');}
  return [...new Set(errors)];
}
