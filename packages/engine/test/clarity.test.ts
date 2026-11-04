import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../src/index.js';
import { createPreparedWorld, referenceRoute } from '../src/nieve.js';
import type { GameState, WorldDefinition } from '../src/types.js';

function act(w: WorldDefinition, s: GameState, actionId: string): GameState {
  const r=engine.step(w,s,{actor:'p1',actionId,submittedAtGame:s.now,serverSequence:s.lastSequence+1,requestId:`clarity-${s.lastSequence+1}`,confirmed:true});
  assert.ok(r.ok,`${actionId}: ${r.error}`);
  return r.state.players.p1!.busy?engine.advance(w,r.state,r.state.players.p1!.busy!.endsAt):r.state;
}
function finish(w: WorldDefinition, omit: string[]=[]): GameState {
  let s=engine.createState(w);
  for(const x of referenceRoute)if(typeof x==='number')s=engine.advance(w,s,x);else if(!omit.includes(x))s=act(w,s,x);
  return s;
}
test('timed suggestions disclose the exclusive start deadline, not just scene closing time',()=>{
  const w=createPreparedWorld();let s=engine.advance(w,engine.createState(w),1_320_000);
  const radio=engine.project(w,s,'p1').actions.find(a=>a.id==='observe_radio')!;
  assert.deepEqual(radio.timing,{startBefore:1_340_000,finishBefore:1_440_000});
  s=engine.advance(w,s,1_340_000);
  assert.ok(!engine.project(w,s,'p1').actions.some(a=>a.id==='observe_radio'));
});
test('waiting is bounded and respects a known cargo reminder away from reception',()=>{
  const w=createPreparedWorld();let s=act(w,engine.createState(w),'vehicle_notes');s=act(w,s,'move:generator');s=engine.advance(w,s,2_970_000);
  const wait=engine.project(w,s,'p1').actions.find(a=>a.kind==='wait')!;
  assert.equal(wait.wait?.until,3_000_000);assert.match(wait.wait?.reminder??'',/cargo/i);
  s=act(w,s,wait.id);assert.equal(s.now,3_000_000);
  assert.match(engine.project(w,s,'p1').history.at(-1)!.text,/Reminder: Expected cargo in Reception/);
  assert.ok(!engine.project(w,s,'p1').history.some(e=>e.id==='world:case-arrival'||e.text.includes('marked C17')));
  s=act(w,s,'wait:next');assert.equal(s.now,3_060_000);
});
test('a hidden event cannot alter the wait preview but can interrupt the actual wait when perceived',()=>{
  const w=createPreparedWorld();const initial=engine.createState(w);
  const normal=engine.project(w,initial,'p1').actions.find(a=>a.kind==='wait')!;
  w.scheduledEvents.push({id:'secret-knock',at:30_000,placeId:'reception',public:false,text:'A quiet knock at the door.',effects:[]});
  const changed=engine.project(w,initial,'p1').actions.find(a=>a.kind==='wait')!;
  assert.deepEqual(changed,normal);assert.equal(changed.wait?.until,60_000);
  const s=act(w,initial,changed.id);assert.equal(s.now,30_000);
  assert.equal(engine.project(w,s,'p1').history.at(-1)?.text,'A quiet knock at the door.');
});
test('a fixed wait target never drifts with network delay and cannot request an arbitrary future time',()=>{
  const w=createPreparedWorld();let s=engine.createState(w);
  const wait=engine.project(w,s,'p1').actions.find(a=>a.kind==='wait')!;
  s=engine.advance(w,s,10_000);s=act(w,s,wait.id);assert.equal(s.now,60_000);
  const send=(id:string)=>engine.step(w,s,{actor:'p1',actionId:id,submittedAtGame:s.now,serverSequence:s.lastSequence+1,requestId:'invalid-target'});
  assert.equal(send('wait:until:3000000').ok,false);assert.equal(send(wait.id).ok,false);
});
test('the debrief is sealed, unavailable during play, and separates prevention from documentation',()=>{
  const w=createPreparedWorld();const bytes=engine.canonicalizeWorld(w);
  assert.ok(w.closure?.truth.includes('R7'));
  assert.equal(engine.buildDebrief(w,engine.createState(w),'p1'),null);
  const success=engine.buildDebrief(w,finish(w),'p1')!;
  assert.equal(success.prevented,true);assert.ok(success.prevention.every(x=>x.met));assert.ok(success.documentation.every(x=>x.met));
  const partial=engine.buildDebrief(w,finish(w,['custody']),'p1')!;
  assert.equal(partial.prevented,true);assert.equal(partial.documentation.find(x=>x.id==='custody')?.met,false);
  const failed=engine.buildDebrief(w,engine.advance(w,engine.createState(w),3_600_000),'p1')!;
  assert.equal(failed.prevented,false);assert.ok(failed.prevention.some(x=>!x.met));
  assert.equal(failed.moments.find(x=>x.eventId==='b1')?.playerLocation,'Reception');
  assert.equal(failed.moments.find(x=>x.eventId==='b1')?.witnessed,false);
  assert.equal(engine.canonicalizeWorld(w),bytes);
});
test('legacy envelopes remain usable without rewriting their canonical contents',()=>{
  const w=createPreparedWorld();delete w.closure;delete w.reminders;
  const bytes=engine.canonicalizeWorld(w);const s=engine.advance(w,engine.createState(w),3_600_000);
  assert.equal(engine.buildDebrief(w,s,'p1'),null);assert.equal(engine.canonicalizeWorld(w),bytes);
  assert.deepEqual(engine.validateWorld(w),[]);
});
test('debrief location follows recorded arrival order at the exact time of a scene',()=>{
  const w=createPreparedWorld();let s=engine.advance(w,engine.createState(w),1_100_000);
  s=act(w,s,'move:generator');s=engine.advance(w,s,3_600_000);
  const scene=engine.buildDebrief(w,s,'p1')!.moments.find(m=>m.eventId==='a1')!;
  assert.equal(scene.playerLocation,'Travelling to Generator room');assert.equal(scene.witnessed,false);
});
