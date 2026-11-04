import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {EmotionalStore,type EmotionalRecord} from '../src/emotional-store.js';
import {newGenerationCheckpoint} from '../src/emotional-generation.js';
import {chatOpening,emptyProfile} from '../src/emotional-chat.js';

const id='11111111-2222-4333-8444-555555555555';
function seed(root:string){
  const file=join(root,'private.sqlite'),store=new EmotionalStore(file,'test-release');
  const flow:EmotionalRecord={id,ownerHash:'private-owner',generation:1,createdAt:1000,updatedAt:2000,revision:1,status:'chat',confirmedAt:null,messages:[chatOpening(),{role:'user',kind:'answer',content:'PRIVATE PLAYER WORDS'}],profile:emptyProfile(),checkpoint:newGenerationCheckpoint(),canonical:null,seal:null,state:null,lastRequestId:'test-chat',error:'chat_response_rejected'};
  store.insert(flow);store.startCall(id,1000,{key:'chat:test-chat',model:'muse-spark-1.3',instructions:'PRIVATE PROMPT',payload:{messages:flow.messages},schema:{},maxTokens:50},.01);
  store.finishCall(id,{key:'chat:test-chat',model:'muse-spark-1.3',startedAt:1000,latencyMs:45,status:'complete',inputTokens:10,outputTokens:20,estimatedCostUsd:.0001,reservedCostUsd:.01},{model:'muse-spark-1.3',text:'PRIVATE MODEL REPLY'});
  store.event(id,2000,'operation_failed',{stage:'chat',code:'preference_not_grounded',field:'intensity',profile:{mood:'PRIVATE PROFILE'}},'test-chat');store.close();return file;
}
function cli(file:string,...args:string[]){return JSON.parse(execFileSync(process.execPath,['--import','tsx','apps/server/src/emotional-diagnostics.ts','--db',file,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));}
test('operator diagnostics are read only and default to metadata; full interactions export privately',t=>{
  const root=mkdtempSync(join(tmpdir(),'sealed-diagnostics-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const file=seed(root),before=readFileSync(file);
  const list=cli(file,'--failures');assert.equal(list.flows.length,1);assert.equal(list.flows[0].id,id);assert.equal(list.flows[0].lastFailure.code,'preference_not_grounded');
  const detail=cli(file,'--flow','11111111');assert.equal(detail.flow.id,id);assert.equal(detail.events[0].release,'test-release');assert.equal(detail.events[0].details.field,'intensity');assert.equal(detail.calls[0].latencyMs,45);
  assert.doesNotMatch(JSON.stringify({list,detail}),/PRIVATE|private-owner|instructions|messages|response_json|ownerHash/);
  const exported=cli(file,'--flow',id,'--export');assert.equal(statSync(exported.exportPath).mode&0o777,0o600);assert.equal(statSync(join(root,'diagnostics')).mode&0o777,0o700);
  const content=JSON.parse(readFileSync(exported.exportPath,'utf8'));assert.equal(content.conversation[1].content,'PRIVATE PLAYER WORDS');assert.equal(content.calls[0].response.text,'PRIVATE MODEL REPLY');assert.equal(content.calls[0].request.instructions,'PRIVATE PROMPT');
  assert.doesNotMatch(JSON.stringify(exported),/PRIVATE PLAYER|PRIVATE MODEL|PRIVATE PROMPT|private-owner/);assert.doesNotMatch(JSON.stringify(content),/private-owner/);assert.deepEqual(readFileSync(file),before);
});
test('older conversations remain inspectable without inventing missing historical failure reasons',t=>{
  const root=mkdtempSync(join(tmpdir(),'sealed-diagnostics-old-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const file=seed(root),db=new DatabaseSync(file);db.exec('DROP TABLE emotional_events');db.close();const before=readFileSync(file);
  const detail=cli(file,'--flow',id);assert.equal(detail.flow.historyAvailable,false);assert.deepEqual(detail.events,[]);assert.equal(detail.flow.error,'chat_response_rejected');assert.equal(detail.flow.lastFailure,null);assert.equal(detail.calls.length,1);assert.deepEqual(readFileSync(file),before);
});
