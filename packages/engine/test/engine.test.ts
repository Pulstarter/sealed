import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { advance, canonicalizeWorld, createState, project, step, validateWorld } from '../src/index.js';
import { createPreparedWorld, referenceRoute } from '../src/nieve.js';
import type { GameState, WorldDefinition } from '../src/types.js';

function act(world: WorldDefinition, state: GameState, actionId: string): GameState {
  const out = step(world, state, { actor: 'p1', actionId, submittedAtGame: state.now, serverSequence: state.lastSequence + 1, requestId: `test-${state.lastSequence + 1}`, confirmed: true });
  assert.equal(out.ok, true, `${actionId} at ${state.now}: ${out.error}`);
  const busy = out.state.players.p1!.busy;
  return busy ? advance(world, out.state, busy.endsAt) : out.state;
}
function play(world: WorldDefinition, route = referenceRoute): {state:GameState; waiting:number} {
  let state=createState(world), waiting=0;
  for (const entry of route) {
    if (typeof entry==='number') { waiting += entry-state.now; state=advance(world,state,entry); }
    else state=act(world,state,entry);
  }
  return {state,waiting};
}
test('prepared world validates and starts without future evidence',()=>{
  const world=createPreparedWorld(); assert.deepEqual(validateWorld(world),[]);
  const state=createState(world);assert.equal(state.now,0);assert.deepEqual(state.players.p1!.evidence,[]);
  assert.equal(project(world,state,'p1').actions.some(a=>a.id==='seal_case'),false);
});
test('reference route succeeds with less than 20 percent explicit waiting',()=>{
  const world=createPreparedWorld();const {state,waiting}=play(world);
  assert.equal(state.results.p1,'success');assert.equal(state.finished,true);
  assert.ok(waiting/world.window.durationMs<.2,`${waiting/world.window.durationMs}`);
  assert.equal(waiting,600_000);
});
test('guest can execute the same valid reference route',()=>assert.equal(play(createPreparedWorld('guest')).state.results.p1,'success'));
test('each choice of technical and plan evidence supports a complete success route',()=>{
  for(const technical of ['relay','radio'])for(const plan of ['statement','photo']){
    const route:(string|number)[]=[
      ...(technical==='relay'?['move:generator']:[]),1_200_000,
      technical==='relay'?'observe_relay':'observe_radio',
      ...(technical==='relay'?['move:reception']:[]),
      'move:lounge','materials',
      ...(plan==='statement'?['move:kitchen']:['move:reception','move:office']),
      2_100_000,...(plan==='statement'?['witness_coercion','statement','move:lounge','move:reception']:['witness_photo','copy_photo','move:reception']),
      2_640_000,'manifest','correlate','brief_leo',3_000_000,
      'inspect_case','seal_case','check_seal','custody',3_600_000,
    ];
    const {state}=play(createPreparedWorld(),route);
    assert.equal(state.results.p1,'success',`${technical}/${plan}`);
    assert.ok(!state.players.p1!.evidence.includes(technical==='relay'?'tech_radio':'tech_relay'));
    assert.ok(!state.players.p1!.evidence.includes(plan==='statement'?'plan_photo':'plan_statement'));
  }
});
test('retention without a custody record is partial, while knowledge without retention still fails',()=>{
  const w=createPreparedWorld();
  const partial=play(w,referenceRoute.filter(x=>x!=='custody')).state;
  assert.equal(partial.results.p1,'partial');assert.equal(partial.flags.moneyRetained,true);
  const informed=play(w,referenceRoute.filter(x=>!['seal_case','check_seal','custody'].includes(String(x)))).state;
  assert.equal(informed.results.p1,'failure');assert.ok(informed.players.p1!.evidence.includes('plan_statement'));
  assert.ok(informed.players.p1!.evidence.includes('tech_relay'));
});
test('holding the case requires explicit confirmation before work can start',()=>{
  const w=createPreparedWorld();const state=play(w,referenceRoute.slice(0,referenceRoute.indexOf('seal_case'))).state;
  const entry={actor:'p1',actionId:'seal_case',submittedAtGame:state.now,serverSequence:state.lastSequence+1,requestId:'confirm-seal'};
  const refused=step(w,state,entry);assert.equal(refused.ok,false);assert.equal(refused.state.players.p1!.busy,null);
  assert.equal(refused.state.flags.caseSealed,undefined);
  const accepted=step(w,state,{...entry,confirmed:true});assert.equal(accepted.ok,true);
  assert.equal(accepted.state.flags.caseSealed,undefined);
  assert.equal(advance(w,accepted.state,accepted.state.players.p1!.busy!.endsAt).flags.caseSealed,true);
});
test('inaction ends in failure and one advance equals partitions',()=>{
  const w=createPreparedWorld();const a=advance(w,createState(w),3_600_000);
  let b=createState(w);for(let t=17_000;t<3_600_000;t+=17_000)b=advance(w,b,t);b=advance(w,b,3_600_000);
  assert.equal(a.results.p1,'failure');assert.deepEqual(b,a);
});
test('scene work cannot start before evidence exists or finish at its closing deadline',()=>{
  const w=createPreparedWorld();let s=createState(w);s=act(w,s,'move:generator');
  let out=step(w,s,{actor:'p1',actionId:'observe_relay',submittedAtGame:s.now,serverSequence:s.lastSequence+1,requestId:'early'});
  assert.equal(out.ok,false);
  s=advance(w,s,1_340_000);out=step(w,s,{actor:'p1',actionId:'observe_relay',submittedAtGame:s.now,serverSequence:s.lastSequence+1,requestId:'late'});
  assert.equal(out.ok,false);assert.deepEqual(out.state.players.p1!.evidence,[]);
});
test('opportunity pairs are physically incompatible',()=>{
  const w=createPreparedWorld();let s=createState(w);s=act(w,s,'move:generator');s=advance(w,s,1_200_000);s=act(w,s,'observe_relay');s=act(w,s,'move:reception');
  assert.equal(project(w,s,'p1').actions.some(a=>a.id==='observe_radio'),false);
  assert.ok(!s.players.p1!.evidence.includes('tech_radio'));
  assert.ok(w.actions.find(a=>a.id==='statement')!.closesAt!-w.actions.find(a=>a.id==='statement')!.opensAt! < 3*100_000);
});
test('action results are deferred and incompatible input cannot bypass occupation',()=>{
  const w=createPreparedWorld();let s=createState(w);const out=step(w,s,{actor:'p1',actionId:'notice',submittedAtGame:0,serverSequence:1,requestId:'a'});
  assert.equal(out.ok,true);s=out.state;assert.ok(!s.players.p1!.facts.includes('departure'));
  assert.equal(step(w,s,{actor:'p1',actionId:'vehicle_notes',submittedAtGame:1,serverSequence:2,requestId:'b'}).ok,false);
  s=advance(w,s,50_000);assert.ok(s.players.p1!.facts.includes('departure'));
});
test('retention cannot be requested without information or physical cargo',()=>{
  const w=createPreparedWorld();let s=advance(w,createState(w),3_000_000);
  assert.equal(step(w,s,{actor:'p1',actionId:'seal_case',submittedAtGame:s.now,serverSequence:1,requestId:'blind',confirmed:true}).ok,false);
});
test('active projection excludes hidden facts, schedules and unseen scenes',()=>{
  const w=createPreparedWorld();const s=advance(w,createState(w),1_300_000);const view=project(w,s,'p1');const json=JSON.stringify(view);
  assert.ok(!json.includes('Vera changing'));assert.ok(!json.includes('scheduledEvents'));assert.ok(!json.includes('referenceRoute'));
  assert.ok(!view.facts.some(f=>f.id==='risk_id'));assert.ok(!view.history.some(e=>e.placeId==='generator'));
});
test('world bytes do not mutate through play and canonical ordering is deterministic',()=>{
  const w=createPreparedWorld();const initial=JSON.stringify(w);const bytes=canonicalizeWorld(w);play(w);
  assert.equal(JSON.stringify(w),initial);assert.equal(canonicalizeWorld(w),bytes);
  const reversed=Object.fromEntries(Object.entries(w).reverse()) as unknown as WorldDefinition;
  assert.equal(canonicalizeWorld(reversed),bytes);assert.equal(createHash('sha256').update(bytes).digest('hex').length,64);
});
test('rejected action still accounts for elapsed authoritative time',()=>{
  const w=createPreparedWorld();const s=createState(w);
  const out=step(w,s,{actor:'p1',actionId:'unknown',submittedAtGame:1_300_000,serverSequence:1,requestId:'invalid'});
  assert.equal(out.ok,false);assert.equal(out.state.now,1_300_000);
  assert.ok(out.state.processedEvents.includes('a1'));
});
test('movement cannot be cancelled into an instantaneous return',()=>{
  const w=createPreparedWorld();let s=createState(w);
  const moving=step(w,s,{actor:'p1',actionId:'move:generator',submittedAtGame:0,serverSequence:1,requestId:'walk'});s=advance(w,moving.state,50_000);
  assert.equal(step(w,s,{actor:'p1',actionId:'cancel',submittedAtGame:s.now,serverSequence:2,requestId:'cancelwalk'}).ok,false);
  assert.ok(project(w,s,'p1').actions.every(a=>a.id!=='cancel'));
});
test('world validation rejects a disconnected graph and unknown scheduled effect',()=>{
  const w=createPreparedWorld();w.places[0]!.exits=[];w.places[1]!.exits=[];
  assert.ok(validateWorld(w).some(e=>e.includes('connected')));
  const bad=createPreparedWorld();bad.scheduledEvents[0]!.effects=[{type:'fact',id:'invented'}];
  assert.ok(validateWorld(bad).some(e=>e.includes('effect')));
});
