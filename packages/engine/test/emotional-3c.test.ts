import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmotionalState,stepEmotional,projectEmotional,emotionalProjection,compileEmotionalFacts,emotionalRoutes} from '../src/emotional.js';
import {emotionalFixture} from './emotional-fixture.js';

import {story3c} from './emotional-story-fixture.js';
function fixture3c(){const a=emotionalFixture();a.version='emotional-2';a.world.story=structuredClone(story3c);a.factualText=compileEmotionalFacts(a.world);return a;}
test('3C keeps its new revelation out of all block contexts and every active snapshot',()=>{
 const a=fixture3c(),before=JSON.stringify(a);
 for(const id of Object.keys(a.blocks))assert.ok(!JSON.stringify(emotionalProjection(a.world,id)).includes(story3c.sealed_truth));
 for(const route of emotionalRoutes){let s=createEmotionalState(0);let seq=0,at=1;
  const act=(kind:'start'|'continue'|'begin'|'choose',choice?:'A'|'B')=>{const r=stepEmotional(a,s,{kind,choice,actor:'p1',node:s.players[0]!.node,at:at++,sequence:++seq,requestId:'r'+seq});assert.ok(r.ok);s=r.state;assert.ok(!JSON.stringify(projectEmotional(a,s,'p1')).includes(story3c.sealed_truth));};
  act('start');assert.ok(projectEmotional(a,s,'p1').scene.paragraphs.join(' ').includes(story3c.anchor));
  for(const c of route){act('begin');if(c==='T'){at+=12000;const r=stepEmotional(a,s,{kind:'choose',choice:'A',actor:'p1',node:s.players[0]!.node,at:at++,sequence:++seq,requestId:'timeout'+seq});s=r.state;}else act('choose',c as 'A'|'B');act('continue');if(s.players[0]!.node.startsWith('ARR'))act('continue');}
  assert.equal(s.players[0]!.phase,'finished');
 }
 assert.equal(JSON.stringify(a),before);
});
test('3C discloses the physical cost before the clock; old adventures retain their options and bytes',()=>{
 const a=fixture3c();let s=createEmotionalState(0);let seq=0;const act=(kind:'start'|'continue'|'begin'|'choose',choice?:'A'|'B')=>{s=stepEmotional(a,s,{kind,choice,actor:'p1',node:s.players[0]!.node,at:++seq,sequence:seq,requestId:String(seq)}).state;};
 act('start');assert.match(projectEmotional(a,s,'p1').scene.decision!.options[0]!.cost!,/Ren/);
 act('begin');act('choose','A');act('continue');let v=projectEmotional(a,s,'p1');assert.equal(v.deadline,null);assert.match(v.scene.decision!.options[0]!.cost!,/accompan|public/i);
 act('begin');act('choose','A');act('continue');act('continue');v=projectEmotional(a,s,'p1');assert.match(v.scene.decision!.options[0]!.label,/explanation/i);
 const old=emotionalFixture(),bytes=JSON.stringify(old);const oldState=stepEmotional(old,createEmotionalState(0),{kind:'start',actor:'p1',node:'S1',at:1,sequence:1,requestId:'old'}).state;assert.equal(projectEmotional(old,oldState,'p1').scene.decision!.options[0]!.cost,undefined);assert.equal(JSON.stringify(old),bytes);
});
