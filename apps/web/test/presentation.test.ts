import { test } from 'node:test';
import assert from 'node:assert/strict';
import { worldTime, extrapolateClock, realDuration, verifyCommitment, rememberCommitment } from '../src/lib/presentation.js';
import * as presentation from '../src/lib/presentation.js';
import type { SuggestedAction } from '../../../packages/engine/src/types.js';

test('time-window copy distinguishes the last start, the finish deadline and real duration',()=>{
  const action:SuggestedAction={id:'radio',label:'Witness the radio test',kind:'observe',durationMs:100_000,irreversible:false,timing:{startBefore:1_340_000,finishBefore:1_440_000}};
  assert.equal(presentation.gameDuration(action.durationMs),'1m 40s');
  assert.equal(presentation.windowHint(action,1_320_000,5,'21:00'),'Start before 21:22:20 · finish before 21:24');
  assert.equal(presentation.startCountdown(action,1_320_000,5),'4 real sec left to start');
  assert.equal(presentation.startCountdown(action,1_340_000,5),'Too late to finish in time');
});
test('wait copy preserves the fixed chosen target and warns before crossing a visible opportunity',()=>{
  const action:SuggestedAction={id:'wait:until:1',label:'Wait briefly',kind:'wait',durationMs:0,irreversible:false,wait:{until:3_000_000,reminder:'Expected cargo in Reception',warning:'This wait can leave too little time.'}};
  assert.equal(presentation.actionLabel(action,'21:00'),'Advance time to 21:50');
  assert.equal(presentation.actionLabel(action,'21:00',true),'Skip remaining wait');
  assert.equal(presentation.gameDuration(action.wait!.until-2_970_000),'30s');
});

test('fast-forward savings use real seconds and stop promising savings after the fixed target', () => {
  const action: SuggestedAction = { id: 'wait:until:478000', label: 'Wait', kind: 'wait', durationMs: 0, irreversible: false, wait: { until: 478_000 } };
  assert.equal(presentation.waitSaving(action,421_000,5),'Save up to 12 sec real');
  assert.equal(presentation.waitSaving(action,478_000,5),'Updating time…');
});

test('an occupied player sees fast-forward before cancel without reordering free investigation priorities', () => {
  const actions: SuggestedAction[] = [
    { id:'cancel',label:'Cancel',kind:'control',durationMs:0,irreversible:false },
    { id:'wait:until:1',label:'Wait',kind:'wait',durationMs:0,irreversible:false,wait:{until:1} },
  ];
  assert.deepEqual(presentation.orderActions(actions,true).map(action=>action.id),['wait:until:1','cancel']);
  assert.equal(actions[0]!.id,'cancel');
  const investigate={id:'look',label:'Look',kind:'examine',durationMs:1000,irreversible:false};
  assert.equal(presentation.orderActions([...actions,investigate],false)[0]!.id,'look');
});

test('advance feedback describes the reached server time rather than the requested target', () => {
  const text = presentation.advanceMessage({ requestId:'advance',requestedUntil:1_000_000,reachedAt:960_000,reason:'announcement' },'21:00');
  assert.ok(text.includes('21:16')); assert.ok(!text.includes('21:16:40'));
  assert.match(text,/announcement/i);
});
test('planned conditional branches are marked by the event record rather than presented as actual facts',()=>{
  const actual=[{id:'world:departure-lost',at:3_600_000,text:'The money left.',kind:'world',perceivedBy:['p1']}];
  assert.equal(presentation.planStatus('departure-held',actual),'Not triggered');
  assert.equal(presentation.planStatus('departure-lost',actual),'Occurred');
});

test('world time crosses midnight and ignores negative elapsed time', () => {
  assert.equal(worldTime(90 * 60_000, '23:00'), '00:30');
  assert.equal(worldTime(-10, '21:00'), '21:00');
});

test('display clock uses a monotonic receive anchor, clamps to the end, and honors pause', () => {
  const clock = { gameNow: 1_000, scale: 5, paused: false, serverNow: 9_999_999 };
  assert.equal(extrapolateClock(clock, 100, 300, 3_600_000), 2_000);
  assert.equal(extrapolateClock({ ...clock, paused: true }, 100, 300, 3_600_000), 1_000);
  assert.equal(extrapolateClock(clock, 100, 1_000_000, 3_600_000), 3_600_000);
});

test('action duration label converts game duration to active real seconds', () => {
  assert.equal(realDuration(100_000, 5), '20 sec');
  assert.equal(realDuration(50_000, 5), '10 sec');
});

test('verification hashes the exact downloaded bytes and compares the conserved initial commitment', async () => {
  const expected = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  assert.equal((await verifyCommitment('', expected)).status, 'match');
  assert.equal((await verifyCommitment(' ', expected)).status, 'mismatch');
  assert.equal((await verifyCommitment('', undefined)).status, 'missing');
});

test('a later server hash never overwrites the initial stored commitment', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.equal(rememberCommitment(storage, 'trip', 'a'.repeat(64)).hash, 'a'.repeat(64));
  assert.equal(rememberCommitment(storage, 'trip', 'b'.repeat(64)).hash, 'a'.repeat(64));
});

test('a hash first seen after entering the game is not claimed as the original commitment', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.equal(rememberCommitment(storage, 'already-playing', 'a'.repeat(64), 'playing').hash, undefined);
  assert.equal(values.size, 0);
});
