import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advance, canonicalizeWorld, createState, project, step } from '../src/index.js';
import { createPreparedWorld } from '../src/nieve.js';
import type { GameState, WorldDefinition } from '../src/types.js';

function act(world: WorldDefinition, state: GameState, actionId: string): GameState {
  const result = step(world, state, { actor: 'p1', actionId, submittedAtGame: state.now,
    serverSequence: state.lastSequence + 1, requestId: `reminder-test-${state.lastSequence + 1}`, confirmed: true });
  assert.ok(result.ok, result.error ?? `Action rejected: ${actionId}`);
  const busy = result.state.players.p1!.busy;
  return busy ? advance(world, result.state, busy.endsAt) : result.state;
}

function atGenerator(world: WorldDefinition, knowsCargo = true): GameState {
  let state = createState(world);
  if (knowsCargo) state = act(world, state, 'vehicle_notes');
  state = act(world, state, 'move:office');
  state = advance(world, state, 2_250_000);
  state = act(world, state, 'move:reception');
  state = act(world, state, 'move:generator');
  return advance(world, state, 2_975_000);
}

function cargoReminders(state: GameState) {
  return state.events.filter(event => event.kind === 'reminder' && event.at === 3_000_000);
}

test('a learned appointment is recalled at its time without Wait or out-of-view facts', () => {
  const world = createPreparedWorld();
  const canonical = canonicalizeWorld(world);
  const before = atGenerator(world);
  assert.equal(cargoReminders(before).length, 0);
  const after = advance(world, before, 3_005_000);
  assert.equal(cargoReminders(after).length, 1);
  const reminder = cargoReminders(after)[0]!;
  assert.deepEqual(reminder.perceivedBy, ['p1']);
  assert.equal(reminder.actor, 'p1');
  assert.equal(reminder.placeId, undefined);
  assert.match(reminder.text, /Expected cargo in Reception/);
  assert.match(reminder.text, /scheduled time, not confirmation/);
  assert.ok(project(world, after, 'p1').history.some(event => event.kind === 'reminder' && event.at === 3_000_000));
  assert.ok(!JSON.stringify(project(world, after, 'p1')).includes('marked C17'));
  assert.deepEqual(after.players.p1!.facts, before.players.p1!.facts);
  assert.deepEqual(after.players.p1!.evidence, before.players.p1!.evidence);
  assert.equal(canonicalizeWorld(world), canonical);
});

test('Wait and normal clock advancement produce the same reminders exactly once', () => {
  const world = createPreparedWorld(); const before = atGenerator(world);
  const wait = project(world, before, 'p1').actions.find(action => action.kind === 'wait')!;
  const waited = act(world, before, wait.id);
  const elapsed = advance(world, before, 3_000_000);
  assert.equal(cargoReminders(elapsed).length, 1);
  assert.deepEqual(waited.events, elapsed.events);
  let restored = JSON.parse(JSON.stringify(elapsed)) as GameState;
  restored = advance(world, restored, 3_000_000);
  restored = advance(world, restored, 3_005_000);
  const rejected = step(world, restored, { actor: 'p1', actionId: wait.id, submittedAtGame: restored.now,
    serverSequence: restored.lastSequence + 1, requestId: 'late-reminder-wait' });
  assert.equal(rejected.ok, false);
  assert.equal(cargoReminders(rejected.state).length, 1);
});

test('reminder delivery is identical across clock partitions including the exact appointment', () => {
  const world = createPreparedWorld(); const before = atGenerator(world);
  const whole = advance(world, before, 3_005_000);
  let split = before;
  for (const at of [2_999_999, 3_000_000, 3_000_000, 3_000_001, 3_005_000]) split = advance(world, split, at);
  assert.equal(cargoReminders(whole).length, 1);
  assert.deepEqual(split, whole);
});

test('an unknown appointment stays private and later learning never backfills a reminder', () => {
  const world = createPreparedWorld();
  let state = advance(world, atGenerator(world, false), 3_005_000);
  assert.equal(cargoReminders(state).length, 0);
  assert.ok(!JSON.stringify(project(world, state, 'p1')).includes('Expected cargo'));
  state = act(world, state, 'move:reception');
  state = act(world, state, 'vehicle_notes');
  state = advance(world, state, 3_250_000);
  assert.ok(state.players.p1!.facts.includes('manifest_due'));
  assert.equal(cargoReminders(state).length, 0);
});

test('arrival at the appointment neither suppresses the reminder nor reveals a scene during transit', () => {
  const world = createPreparedWorld(); let state = act(world, createState(world), 'vehicle_notes');
  state = advance(world, state, 2_900_000);
  state = act(world, state, 'move:generator');
  assert.equal(state.now, 3_000_000);
  assert.equal(cargoReminders(state).length, 1);
  const cargo = state.events.find(event => event.id === 'world:case-arrival')!;
  assert.deepEqual(cargo.perceivedBy, []);
  assert.equal(project(world, state, 'p1').place.id, 'generator');
});

test('knowledge completed at the exact appointment qualifies for its reminder', () => {
  const world = createPreparedWorld();
  let state = advance(world, createState(world), 2_900_000);
  state = act(world, state, 'vehicle_notes');
  assert.equal(state.now, 3_000_000);
  assert.equal(cargoReminders(state).length, 1);
});

test('simultaneous known appointments are recalled separately without witnessing either scene', () => {
  const world = createPreparedWorld();
  const away = advance(world, act(world, createState(world), 'move:generator'), 2_100_000);
  const simultaneous = away.events.filter(event => event.kind === 'reminder' && event.at === 2_100_000);
  assert.equal(simultaneous.length, 2);
  assert.equal(new Set(simultaneous.map(event => event.id)).size, 2);
  assert.ok(!project(world, away, 'p1').history.some(event => event.at === 2_100_000 && event.kind === 'world'));
});

test('an existing reminder from the previous engine is not duplicated at the same clock instant', () => {
  const world = createPreparedWorld(); let state = atGenerator(world);
  state = act(world, state, project(world, state, 'p1').actions.find(action => action.kind === 'wait')!.id);
  const existing = cargoReminders(state)[0]!;
  existing.id = 'reminder:41';
  assert.equal(cargoReminders(advance(world, state, 3_000_000)).length, 1);
});
