import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEmotionalState,stepEmotional,syncEmotional,projectEmotional,emotionalTrace,emotionalEnding,emotionalProjection,emotionalScopes,emotionalRoutes,compileEmotionalFacts} from '../src/emotional.js';
import type {EmotionalArtifact,EmotionalChoice,EmotionalState} from '../src/emotional-types.js';
import {emotionalFixture} from './emotional-fixture.js';

function act(a:EmotionalArtifact,s:EmotionalState,kind:'start'|'continue'|'begin'|'choose',choice?:'A'|'B',at=s.lastAt+1,actor='p1'){
  return stepEmotional(a,s,{actor,node:s.players.find(p=>p.id===actor)!.node,kind,choice,at,sequence:s.lastSequence+1,requestId:'r'+(s.lastSequence+1)});
}
test('every emotional path resolves once and changes external facts; A/B witnesses change each decision',()=>{
  const a=emotionalFixture();const endingCounts:Record<string,number>={};
  for(const x of 'ABT')for(const y of 'ABT')for(const z of 'ABT'){
    const route=x+y+z;let s=createEmotionalState(1000);s=act(a,s,'start').state;let i=0;
    for(let guard=0;guard<20&&s.players[0]!.phase!=='finished';guard++){
      const v=projectEmotional(a,s,'p1');
      assert.ok(!JSON.stringify(v).includes('PRIVATE ONLY'));
      if(v.scene.decision){s=act(a,s,'begin').state;const choice=route[i++]!;s=choice==='T'?syncEmotional(s,s.players[0]!.deadline!):act(a,s,'choose',choice as 'A'|'B').state;}
      else s=act(a,s,'continue').state;
    }
    const view=projectEmotional(a,s,'p1');assert.equal(view.phase,'finished');assert.equal(s.players[0]!.decisions.length,3);
    assert.equal(view.ending!.id,emotionalEnding(route));endingCounts[view.ending!.id]=(endingCounts[view.ending!.id]??0)+1;
    const factual=emotionalTrace(route).s4;assert.equal(factual.work,z==='A'?'PUBLIC':z==='B'?'BOX':'PLAYER');
    assert.equal(factual.recipient_knows,route==='BAA');assert.equal(factual.record_open,y==='A');
    assert.deepEqual(s.players[0]!.decisions.map(d=>d.choice),[x,y,z]);
  }
  assert.deepEqual(endingCounts,{F1:1,F5:9,F6:9,F4:6,F2:1,F3:1});
  assert.equal(emotionalEnding('AAA'),'F1');assert.equal(emotionalEnding('BAA'),'F2');assert.equal(emotionalEnding('ABA'),'F4');assert.equal(emotionalEnding('AAB'),'F5');
});
test('reading is untimed; repeated begin does not renew the deadline and expiry resolves once',()=>{
  const a=emotionalFixture();let s=createEmotionalState(1000);assert.equal(projectEmotional(a,s,'p1').phase,'sealed');
  s=act(a,s,'start').state;assert.equal(syncEmotional(s,900000).players[0]!.node,'S1');
  s=act(a,s,'begin',undefined,2000).state;assert.equal(s.players[0]!.deadline,14000);
  s=act(a,s,'begin',undefined,3000).state;assert.equal(s.players[0]!.deadline,14000);
  const expired=syncEmotional(s,14000);assert.equal(expired.players[0]!.node,'D1T');assert.equal(expired.players[0]!.decisions[0]!.at,14000);
  assert.equal(syncEmotional(expired,900000).revision,expired.revision);
  const late=act(a,s,'choose','A',14000);assert.equal(late.ok,false);assert.equal(late.state.players[0]!.node,'D1T');
});
test('only current content is projected; sealed content and future outcomes stay hidden',()=>{
  const a=emotionalFixture();let s=createEmotionalState(1000);let v=projectEmotional(a,s,'p1');assert.equal(v.scene.paragraphs.length,0);assert.equal(v.scene.decision,undefined);
  s=act(a,s,'start').state;v=projectEmotional(a,s,'p1');assert.ok(v.scene.paragraphs.includes('Current scene S1.'));assert.match(v.scene.paragraphs[0]!,/Alex is holding/);assert.equal(v.ending,null);assert.equal(v.history.length,1);
  assert.doesNotMatch(JSON.stringify(v),/PRIVATE ONLY|Secret motive|Ending F1|Future scene S2/);
  assert.throws(()=>projectEmotional(a,s,'intruder'));
  assert.equal(act(a,s,'start').ok,false);assert.equal(act(a,s,'continue').ok,false);
});
test('projection builder never mutates source actors or carries positions between independent blocks',()=>{
  const world=emotionalFixture().world;const before=JSON.stringify(world);
  for(const id of Object.keys(emotionalScopes)){const p=emotionalProjection(world,id);assert.equal(JSON.stringify(world),before);const host=p.context.host as {at?:string}|undefined;assert.equal(host?.at,undefined);}
  const p=JSON.stringify(emotionalProjection(world,'F5'));assert.doesNotMatch(p,/Secret motive|PRIVATE ONLY|Grey envelope/);
  assert.equal(emotionalRoutes.length,27);
});
test('each actor has separate progress and deadlines; invalid inputs cannot mutate an adventure',()=>{
  const a=emotionalFixture();let s=createEmotionalState(1000,[{id:'p1'},{id:'p2'}]);const original=JSON.stringify(s);s=act(a,s,'start').state;assert.equal(JSON.stringify(createEmotionalState(1000,[{id:'p1'},{id:'p2'}])),original);
  s=act(a,s,'begin').state;assert.equal(s.players[1]!.phase,'sealed');
  for(const patch of [{actor:'unknown'},{at:NaN},{at:-1},{at:1000},{sequence:0},{node:'S3'},{requestId:''},{choice:'T'},{kind:'hack'}]){
    const out=stepEmotional(a,s,{actor:'p1',node:'S1',kind:'choose',choice:'A',at:5000,sequence:s.lastSequence+1,requestId:'invalid',...patch} as any);assert.equal(out.ok,false);assert.deepEqual(out.state,s);
  }
  assert.equal(syncEmotional(s,14000).players[1]!.phase,'sealed');
});
test('every decision explains its timeout without introducing a third clickable action',()=>{
 const a=emotionalFixture();let s=act(a,createEmotionalState(1000),'start').state;
 for(const phrase of [/no invitation/i,/closed.*table/i,/keep.*work/i]){
  const decision=projectEmotional(a,s,'p1').scene.decision!;assert.match((decision as any).inaction,phrase);assert.deepEqual(decision.options.map(x=>x.id),['A','B']);
  s=act(a,s,'begin').state;s=act(a,s,'choose','A').state;s=act(a,s,'continue').state;if(s.players[0]!.node.startsWith('ARR'))s=act(a,s,'continue').state;
 }
});
test('explanation punctuation is correct for new stories and old sealed text remains byte-identical',()=>{
 const a=emotionalFixture();a.world.private_reason='They wanted to offer a fresh start.';a.factualText=compileEmotionalFacts(a.world);assert.doesNotMatch(a.factualText.AAA!.D2A!,/start\.\./);
 // An already sealed adventure may contain the old compiled punctuation.
 a.factualText.AAA!.D2A+='.';const canonical=JSON.stringify(a);let s=act(a,createEmotionalState(1000),'start').state;
 for(let i=0;i<20&&s.players[0]!.phase!=='finished';i++){if(projectEmotional(a,s,'p1').scene.decision){s=act(a,s,'begin').state;s=act(a,s,'choose','A').state;}else s=act(a,s,'continue').state;}
 const v=projectEmotional(a,s,'p1');assert.doesNotMatch(v.ending!.explanation.join(' '),/start\.\./);assert.doesNotMatch(v.history.find(h=>h.id==='D2A')!.paragraphs.join(' '),/start\.\./);assert.equal(JSON.stringify(a),canonical);
});
test('the opened envelope recalls only the labels of unchosen options without changing its sealed bytes',()=>{
 const a=emotionalFixture(),canonical=JSON.stringify(a);let s=act(a,createEmotionalState(1000),'start').state;
 assert.equal(projectEmotional(a,s,'p1').ending,null);
 while(s.players[0]!.phase!=='finished'){if(projectEmotional(a,s,'p1').scene.decision){s=act(a,s,'begin').state;s=act(a,s,'choose','A').state;}else s=act(a,s,'continue').state;}
 const view=projectEmotional(a,s,'p1'),closed=(view.ending as any).closedChoices;
 assert.equal(closed?.length,6);assert.ok(closed.some((x:any)=>x.decision==='D2'&&x.choice==='B'&&/Archive/.test(x.label)));
 assert.ok(closed.some((x:any)=>x.decision==='D3'&&x.choice==='T'&&/keep/i.test(x.label)));
 assert.ok(closed.every((x:any)=>x.choice!=='A'&&Object.keys(x).sort().join(',')==='choice,decision,label'));
 assert.doesNotMatch(JSON.stringify(closed),/Secret motive|Ending F|PRIVATE ONLY/);assert.equal(JSON.stringify(a),canonical);
});
