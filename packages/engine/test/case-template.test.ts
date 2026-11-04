import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCaseWorld, parseCaseDraft, certifyCaseWorld } from '../src/case-template.js';
import { canonicalizeWorld, createState, project } from '../src/index.js';
import { createPreparedWorld } from '../src/nieve.js';

export const draft = { title: 'The Winter Ledger', reserve: 'the emergency repair reserve',
  motive: 'to conceal losses from a failed private business', coverStory: 'payment for an urgent boiler replacement',
  recipient: 'Northgate Repairs', documentTitle: 'Emergency Boiler Invoice', cargoCode: 'C42', commandCode: 'R3' };

test('the case contract rejects attempts to change mechanics, invalid codes and spoilers in public titles', () => {
  assert.deepEqual(parseCaseDraft(draft), draft);
  for (const value of [{ ...draft, actions: [] }, { ...draft, motive: '' }, { ...draft, cargoCode: 'C17; DELETE' },
    { ...draft, commandCode: 3 }, { ...draft, title: 'Vera stole the money' }, { ...draft, title: 'The R3 command' },
    { ...draft, title: 'The r3 command' }, { ...draft, title: 'The c42 mystery' }, { ...draft, coverStory: 'replacement part r9' },
    { ...draft, title: draft.recipient }, { ...draft, title: draft.documentTitle },
    { ...draft, motive: 'start a political campaign' }, { ...draft, coverStory: 'departure at 21:30' }, null]) {
    assert.throws(() => parseCaseDraft(value));
  }
});

test('generated clues and revealed truth agree while hidden case details stay out of the initial projection', () => {
  const before = canonicalizeWorld(createPreparedWorld());
  const world = buildCaseWorld(parseCaseDraft(draft), { role: 'technician', tone: 'tension', detail: '' });
  assert.equal(world.origin, 'meta'); assert.equal(world.title, draft.title);
  assert.ok(world.closure!.truth.includes(draft.motive)); assert.ok(world.closure!.truth.includes(draft.recipient));
  assert.ok(world.actions.find(action => action.id === 'manifest')!.text.includes('C42'));
  assert.ok(world.actions.find(action => action.id === 'observe_radio')!.text.includes('R3'));
  assert.ok(world.actions.find(action => action.id === 'copy_photo')!.text.includes(draft.documentTitle));
  assert.ok(!canonicalizeWorld(world).includes('C17')); assert.ok(!canonicalizeWorld(world).includes('R7'));
  const view = JSON.stringify(project(world, createState(world), 'p1'));
  for (const secret of [draft.motive, draft.coverStory, draft.recipient, draft.documentTitle, 'C42', 'R3']) assert.ok(!view.includes(secret));
  assert.equal(canonicalizeWorld(createPreparedWorld()), before);
});

test('both roles retain all four executable evidence routes and failure by inaction', () => {
  for (const role of ['technician', 'guest'] as const) {
    const world = buildCaseWorld(draft, { role, tone: 'melancholy', detail: 'Wind at the shutters' });
    const result = certifyCaseWorld(world);
    assert.equal(result.successRoutes, 4); assert.equal(result.inaction, 'failure');
    assert.ok(result.referenceWaitingRatio < 0.2);
  }
});

test('playability failures are rejected before any world can be sealed', () => {
  const world = buildCaseWorld(draft, { role: 'technician', tone: 'tension', detail: '' });
  world.actions.find(action => action.id === 'observe_radio')!.durationMs = 1_000_000;
  assert.throws(() => certifyCaseWorld(world), /route/i);
});

test('changing the motive changes the actual evidence and truth, not just an identifier', () => {
  const config = { role: 'technician' as const, tone: 'tension' as const, detail: '' };
  const a = buildCaseWorld(draft, config);
  const b = buildCaseWorld({ ...draft, motive: 'to pay an undisclosed personal debt', coverStory: 'a deposit for replacement windows' }, config);
  assert.notEqual(a.closure!.truth, b.closure!.truth);
  assert.notEqual(a.actions.find(action => action.id === 'witness_coercion')!.text, b.actions.find(action => action.id === 'witness_coercion')!.text);
});
