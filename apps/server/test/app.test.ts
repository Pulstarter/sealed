import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { SessionSnapshot, Reveal } from '../../../packages/engine/src/types.js';

async function journey(url: string, role = 'technician') {
  const response = await fetch(`${url}/api/journeys`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role, tone: 'tension', detail: '' }) });
  assert.equal(response.status, 201);
  return { cookie: response.headers.get('set-cookie')!.split(';')[0]!, snapshot: await response.json() as SessionSnapshot };
}
async function post(url: string, cookie: string, path: string, value: object = {}) {
  return fetch(`${url}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(value) });
}
async function snapshot(url: string, cookie: string): Promise<SessionSnapshot> {
  const response = await fetch(`${url}/api/session`, { headers: { Cookie: cookie } });
  return ((await response.json()) as { session: SessionSnapshot }).session;
}

test('creating a prepared journey returns a sealed authorized snapshot, never the world', async t => {
  const app = createApp({ databasePath: ':memory:' });
  t.after(() => app.close());
  const url = await app.listen();
  const response = await fetch(`${url}/api/journeys`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'technician', tone: 'tension', detail: '' }),
  });
  assert.equal(response.status, 201);
  const value = await response.json() as Record<string, unknown>;
  assert.equal(value.phase, 'sealed');
  assert.equal(typeof value.hash, 'string');
  assert.equal(value.canonical, undefined);
  assert.equal(value.world, undefined);
  assert.equal(value.scheduledEvents, undefined);
  assert.equal(value.debrief, undefined);
  assert.ok(!JSON.stringify(value).includes('Vera planned to divert'));
  assert.ok(response.headers.get('set-cookie')?.includes('HttpOnly'));
});

test('the sealed clock does not run and starting twice does not reset it', async t => {
  let time = 0; const app = createApp({ databasePath: ':memory:', now: () => time });
  t.after(() => app.close()); const url = await app.listen(); const { cookie } = await journey(url);
  time = 100_000; assert.equal((await snapshot(url, cookie)).view.now, 0);
  await post(url, cookie, '/api/session/start');
  time += 1000; const again = await post(url, cookie, '/api/session/start');
  const state = await again.json() as SessionSnapshot;
  assert.equal(state.view.now, 5000); assert.equal(state.phase, 'playing');
});

test('an action occupies time before granting its result and a repeated request does not act twice', async t => {
  let time = 0; const app = createApp({ databasePath: ':memory:', now: () => time });
  t.after(() => app.close()); const url = await app.listen(); const { cookie } = await journey(url);
  await post(url, cookie, '/api/session/start');
  const input = { actionId: 'notice', requestId: 'notice-once' };
  const response = await post(url, cookie, '/api/session/actions', input); assert.equal(response.status, 200);
  const started = await response.json() as SessionSnapshot;
  assert.equal(started.view.now, 0); assert.equal(started.view.busy?.endsAt, 50_000);
  assert.ok(!started.view.facts.some(f => f.id === 'departure'));
  time = 11_000;
  const complete = await snapshot(url, cookie);
  assert.equal(complete.view.now, 55_000); assert.equal(complete.view.busy, null);
  assert.ok(complete.view.facts.some(f => f.id === 'departure'));
  const replay = await post(url, cookie, '/api/session/actions', input);
  assert.equal(replay.status, 200);
  assert.equal((await replay.json() as SessionSnapshot).view.now, complete.view.now);
  const conflict = await post(url, cookie, '/api/session/actions', { actionId: 'vehicle_notes', requestId: input.requestId });
  assert.equal(conflict.status, 409);
  assert.equal((await snapshot(url, cookie)).view.history.filter(e => e.actor === 'p1' && e.kind === 'action' && e.text.includes('Departure is at 22:00')).length, 1);
});

test('pause, hidden presence and expired connection do not accrue unlimited time', async t => {
  let time = 0; const app = createApp({ databasePath: ':memory:', now: () => time });
  t.after(() => app.close()); const url = await app.listen(); const { cookie } = await journey(url);
  await post(url, cookie, '/api/session/start'); time = 1000;
  await post(url, cookie, '/api/session/pause'); time = 50_000;
  assert.equal((await snapshot(url, cookie)).view.now, 5000);
  await post(url, cookie, '/api/session/presence', { visible: true });
  assert.equal((await snapshot(url, cookie)).clock.paused, true);
  await post(url, cookie, '/api/session/resume'); time += 1000;
  await post(url, cookie, '/api/session/presence', { visible: false }); time += 60_000;
  assert.equal((await snapshot(url, cookie)).view.now, 10_000);
  await post(url, cookie, '/api/session/presence', { visible: true }); time += 100_000;
  const expired = await snapshot(url, cookie);
  assert.equal(expired.view.now, 85_000); assert.equal(expired.clock.paused, true);
});

test('anonymous sessions are isolated and the server rejects client actor or time authority', async t => {
  const app = createApp({ databasePath: ':memory:' }); t.after(() => app.close()); const url = await app.listen();
  const a = await journey(url), b = await journey(url, 'guest');
  assert.notEqual(a.snapshot.id, b.snapshot.id); assert.notEqual(a.snapshot.hash, b.snapshot.hash);
  assert.equal((await snapshot(url, a.cookie)).view.role, 'technician');
  assert.equal((await snapshot(url, b.cookie)).view.role, 'guest');
  assert.equal((await fetch(`${url}/api/session/reveal`, { headers: { Cookie: a.cookie } })).status, 403);
  assert.equal((await fetch(`${url}/api/session/reveal`)).status, 401);
  await post(url, a.cookie, '/api/session/start');
  assert.equal((await post(url, a.cookie, '/api/session/actions', {
    actionId: 'notice', requestId: 'authority', actor: 'p2', submittedAtGame: 3_000_000, serverSequence: 99,
  })).status, 400);
  const cross = await fetch(`${url}/api/session/pause`, { method: 'POST', headers: {
    Cookie: a.cookie, 'Content-Type': 'application/json', Origin: 'https://malicious.invalid',
  }, body: '{}' });
  assert.equal(cross.status, 403);
  const invalidRole = await fetch(`${url}/api/journeys`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: ['technician'], tone: 'tension', detail: '' }) });
  assert.equal(invalidRole.status, 400);
});

test('a future scene cannot be activated early and rejected input does not stop the clock', async t => {
  let time = 0; const app = createApp({ databasePath: ':memory:', now: () => time });
  t.after(() => app.close()); const url = await app.listen(); const { cookie } = await journey(url);
  await post(url, cookie, '/api/session/start'); time = 1000;
  const response = await post(url, cookie, '/api/session/actions', { actionId: 'observe_radio', requestId: 'too-early' });
  assert.equal(response.status, 409);
  const value = await snapshot(url, cookie);
  assert.equal(value.view.now, 5000); assert.equal(value.view.busy, null); assert.equal(value.view.evidence.length, 0);
});

test('snapshot SSE starts with an authorized full projection and no hidden definition', async t => {
  const app = createApp({ databasePath: ':memory:' }); t.after(() => app.close()); const url = await app.listen();
  const { cookie } = await journey(url); const controller = new AbortController();
  const response = await fetch(`${url}/api/session/events`, { headers: { Cookie: cookie }, signal: controller.signal });
  assert.equal(response.status, 200); assert.equal(response.headers.get('x-accel-buffering'), 'no');
  assert.ok(response.headers.get('cache-control')?.includes('no-store'));
  const reader = response.body!.getReader(); const { value } = await reader.read();
  const data = new TextDecoder().decode(value);
  assert.ok(data.startsWith('event: snapshot\ndata: '));
  assert.ok(!data.includes('scheduledEvents')); assert.ok(!data.includes('canonical'));
  controller.abort(); await reader.cancel().catch(() => {});
});

test('SQLite survives restart with the same world, clock, busy action and idempotency record', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'sealed-server-')); const db = join(directory, 'game.sqlite');
  let time = 0; let app = createApp({ databasePath: db, now: () => time }); let url = await app.listen();
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  const { cookie, snapshot: sealed } = await journey(url); await post(url, cookie, '/api/session/start');
  const input = { actionId: 'notice', requestId: 'persisted-request' };
  await post(url, cookie, '/api/session/actions', input); time = 2000; await snapshot(url, cookie);
  await app.close(); app = createApp({ databasePath: db, now: () => time }); url = await app.listen();
  const restored = await snapshot(url, cookie);
  assert.equal(restored.id, sealed.id); assert.equal(restored.hash, sealed.hash);
  assert.equal(restored.view.now, 10_000); assert.equal(restored.view.busy?.id, 'notice');
  assert.equal((await post(url, cookie, '/api/session/actions', input)).status, 200);
  time += 9000; assert.equal((await snapshot(url, cookie)).view.busy, null);
});

test('inaction ends in failure and the reveal has the original exact hashed bytes', async t => {
  const app = createApp({ databasePath: ':memory:', now: () => 0 }); t.after(() => app.close()); const url = await app.listen();
  const { cookie, snapshot: sealed } = await journey(url); await post(url, cookie, '/api/session/start');
  let state = await snapshot(url, cookie);
  for (let i = 0; i < 100 && !state.view.finished; i++) {
    const response = await post(url, cookie, '/api/session/actions', { actionId: 'wait:next', requestId: `wait-${i}` });
    assert.equal(response.status, 200); state = await response.json() as SessionSnapshot;
  }
  assert.equal(state.phase, 'finished'); assert.equal(state.view.ending, 'failure');
  const response = await fetch(`${url}/api/session/reveal`, { headers: { Cookie: cookie } }); assert.equal(response.status, 200);
  const reveal = await response.json() as Reveal;
  assert.equal(reveal.hash, sealed.hash);
  assert.equal(createHash('sha256').update(reveal.canonical, 'utf8').digest('hex'), sealed.hash);
  assert.equal(reveal.ending, 'failure');
  assert.match(reveal.debrief?.truth??'',/R7/);
  assert.equal(reveal.debrief?.prevented,false);
  assert.ok(reveal.debrief?.prevention.some(c=>c.id==='seal'&&!c.met));
  assert.ok(reveal.events.some(e => !e.perceivedBy.includes('p1')));
  assert.ok(reveal.actions.every((a, i) => a.actor === 'p1' && a.serverSequence === i + 1));
});

test('the echoed wait target stays fixed across latency and remains idempotent',async t=>{
  let time=0;const app=createApp({databasePath:':memory:',now:()=>time});t.after(()=>app.close());
  const url=await app.listen();const {cookie}=await journey(url);
  const started=await post(url,cookie,'/api/session/start');const initial=await started.json() as SessionSnapshot;
  const wait=initial.view.actions.find(a=>a.kind==='wait')!;assert.equal(wait.wait?.until,60_000);
  time=1000;
  const input={actionId:wait.id,requestId:'fixed-wait'};
  const response=await post(url,cookie,'/api/session/actions',input);assert.equal(response.status,200);
  assert.equal((await response.json() as SessionSnapshot).view.now,60_000);
  const replay=await post(url,cookie,'/api/session/actions',input);assert.equal(replay.status,200);
  assert.equal((await replay.json() as SessionSnapshot).view.now,60_000);
  const stale=await post(url,cookie,'/api/session/actions',{actionId:wait.id,requestId:'stale-wait'});
  assert.equal(stale.status,409);assert.match((await stale.json() as {error:string}).error,/waiting point has passed/);
  assert.equal((await post(url,cookie,'/api/session/actions',{actionId:'wait:until:3000000',requestId:'too-far'})).status,409);
});

test('the world reaches departure from elapsed presence time without any player action', async t => {
  let time = 0; const app = createApp({ databasePath: ':memory:', now: () => time });
  t.after(() => app.close()); const url = await app.listen(); const { cookie } = await journey(url);
  await post(url, cookie, '/api/session/start');
  for (let i = 1; i <= 72; i++) {
    time = i * 10_000;
    assert.equal((await post(url, cookie, '/api/session/presence', { visible: true })).status, 200);
  }
  const value = await snapshot(url, cookie);
  assert.equal(value.phase, 'finished'); assert.equal(value.view.now, 3_600_000); assert.equal(value.view.ending, 'failure');
  const response = await fetch(`${url}/api/session/reveal`, { headers: { Cookie: cookie } });
  const reveal = await response.json() as Reveal;
  assert.equal(reveal.actions.length, 0);
});

test('clock-driven reminders reach SSE once and survive pause, stale Wait and SQLite restart', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'sealed-reminders-')); const databasePath = join(directory, 'game.sqlite');
  let time = 0; let app = createApp({ databasePath, now: () => time }); let url = await app.listen();
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  const { cookie, snapshot: sealed } = await journey(url); await post(url, cookie, '/api/session/start');
  async function presence() {
    const response = await post(url, cookie, '/api/session/presence', { visible: true });
    assert.equal(response.status, 200); return await response.json() as SessionSnapshot;
  }
  for (const actionId of ['vehicle_notes', 'move:generator']) {
    assert.equal((await post(url, cookie, '/api/session/actions', { actionId, requestId: `reminder-${actionId}` })).status, 200);
    for (let i = 0; i < 2; i++) { time += 10_000; await presence(); }
  }
  while (time < 590_000) { time += 10_000; await presence(); }
  const before = await snapshot(url, cookie); assert.equal(before.view.now, 2_950_000);
  const selected = before.view.actions.find(action => action.kind === 'wait')!;
  assert.equal(selected.wait?.until, 3_000_000);
  await post(url, cookie, '/api/session/pause'); time += 60_000;
  const paused = await snapshot(url, cookie); assert.equal(paused.view.now, 2_950_000);
  assert.equal(paused.view.history.filter(event => event.kind === 'reminder' && event.at === 3_000_000).length, 0);
  await post(url, cookie, '/api/session/resume');
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 5000);
  t.after(() => { clearTimeout(timeout); controller.abort(); });
  const stream = await fetch(`${url}/api/session/events`, { headers: { Cookie: cookie }, signal: controller.signal });
  assert.equal(stream.status, 200);
  const reader = stream.body!.getReader(); const decoder = new TextDecoder(); let buffer = '';
  async function nextSnapshot(): Promise<SessionSnapshot> {
    while (!buffer.includes('\n\n')) {
      const chunk = await reader.read(); assert.equal(chunk.done, false);
      buffer += decoder.decode(chunk.value, { stream: true });
    }
    const end = buffer.indexOf('\n\n'); const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2);
    return JSON.parse(frame.split('\n').find(line => line.startsWith('data: '))!.slice(6)) as SessionSnapshot;
  }
  assert.equal((await nextSnapshot()).view.now, 2_950_000);
  time += 10_000;
  const delivered = await nextSnapshot(); assert.equal(delivered.view.now, 3_000_000);
  const reminders = delivered.view.history.filter(event => event.kind === 'reminder' && event.at === 3_000_000);
  assert.equal(reminders.length, 1); assert.match(reminders[0]!.text, /not confirmation/);
  assert.ok(!JSON.stringify(delivered).includes('marked C17')); assert.deepEqual(delivered.view.evidence, []);
  clearTimeout(timeout); controller.abort(); await reader.cancel().catch(() => {});
  const stale = await post(url, cookie, '/api/session/actions', { actionId: selected.id, requestId: 'late-cargo-wait' });
  assert.equal(stale.status, 409);
  await app.close(); app = createApp({ databasePath, now: () => time }); url = await app.listen();
  let recovered = await snapshot(url, cookie);
  assert.equal(recovered.hash, sealed.hash);
  assert.equal(recovered.view.history.filter(event => event.kind === 'reminder' && event.at === 3_000_000).length, 1);
  while (!recovered.view.finished) { time += 10_000; recovered = await presence(); }
  const reveal = await (await fetch(`${url}/api/session/reveal`, { headers: { Cookie: cookie } })).json() as Reveal;
  assert.equal(reveal.events.filter(event => event.kind === 'reminder' && event.at === 3_000_000).length, 1);
  assert.ok(!reveal.events.find(event => event.id === 'world:case-arrival')!.perceivedBy.includes('p1'));
  assert.ok(!reveal.actions.some(action => action.actionId.startsWith('wait:')));
  assert.equal(createHash('sha256').update(reveal.canonical).digest('hex'), sealed.hash);
});

test('static SPA routes cannot expose configuration files and API misses remain JSON errors', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'sealed-static-'));
  await writeFile(join(directory, 'index.html'), '<!doctype html><title>SEALED</title>');
  const app = createApp({ databasePath: ':memory:', staticDir: directory });
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); }); const url = await app.listen();
  const page = await fetch(`${url}/journey`); assert.equal(page.status, 200); assert.ok((await page.text()).includes('SEALED'));
  const hidden = await fetch(`${url}/.env.local`); assert.equal(hidden.status, 404);
  const missing = await fetch(`${url}/api/missing`); assert.equal(missing.status, 404);
  assert.ok(missing.headers.get('content-type')?.includes('application/json'));
});

test('time advance receipts distinguish a free jump from completing a running task', async t => {
  const app = createApp({ databasePath: ':memory:', now: () => 0 }); t.after(() => app.close());
  const url = await app.listen(); const { cookie } = await journey(url); await post(url, cookie, '/api/session/start');
  const free = await (await post(url, cookie, '/api/session/actions', { actionId: 'wait:next', requestId: 'free-jump' })).json() as SessionSnapshot;
  assert.deepEqual(free.advance, { requestId: 'free-jump', requestedUntil: 60_000, reachedAt: 60_000, reason: 'target' });
  const started = await (await post(url, cookie, '/api/session/actions', { actionId: 'leo_intro', requestId: 'talk-start' })).json() as SessionSnapshot;
  assert.equal(started.advance, undefined);
  const ended = await (await post(url, cookie, '/api/session/actions', { actionId: started.view.actions.find(action => action.kind === 'wait')!.id, requestId: 'finish-talk' })).json() as SessionSnapshot;
  assert.equal(ended.advance?.reason, 'task-completed'); assert.equal(ended.advance?.taskRequestId, 'talk-start');
  assert.equal(ended.view.busy, null); assert.ok(ended.view.facts.some(fact => fact.id === 'first_windows'));
});

test('an announcement explains an early stop and its original receipt survives a delayed retry', async t => {
  let time = 0; const app = createApp({ databasePath: ':memory:', now: () => time }); t.after(() => app.close());
  const url = await app.listen(); const { cookie } = await journey(url); await post(url, cookie, '/api/session/start');
  let state = await snapshot(url, cookie);
  while (state.view.now < 900_000) state = await (await post(url, cookie, '/api/session/actions', { actionId: 'wait:next', requestId: `setup-${state.view.now}` })).json() as SessionSnapshot;
  state = await (await post(url, cookie, '/api/session/actions', { actionId: 'leo_intro', requestId: 'ongoing-talk' })).json() as SessionSnapshot;
  const input = { actionId: state.view.actions.find(action => action.kind === 'wait')!.id, requestId: 'early-jump' };
  const stopped = await (await post(url, cookie, '/api/session/actions', input)).json() as SessionSnapshot;
  assert.deepEqual(stopped.advance, { requestId: 'early-jump', requestedUntil: 1_000_000, reachedAt: 960_000, reason: 'announcement', taskRequestId: 'ongoing-talk' });
  assert.equal(stopped.view.busy?.endsAt, 1_000_000);
  assert.ok(!JSON.stringify(stopped.advance).includes('Vera'));
  time = 2000;
  const replay = await (await post(url, cookie, '/api/session/actions', input)).json() as SessionSnapshot;
  assert.equal(replay.view.now, 970_000); assert.deepEqual(replay.advance, stopped.advance);
  time = 10_000;
  const completed = await (await post(url, cookie, '/api/session/actions', input)).json() as SessionSnapshot;
  assert.equal(completed.view.busy, null); assert.deepEqual(completed.advance, stopped.advance);
});

test('a local event can stop fast-forward without disclosing it in the preview', async t => {
  let time = 0; const app = createApp({ databasePath: ':memory:', now: () => time }); t.after(() => app.close());
  const url = await app.listen(); const { cookie } = await journey(url); await post(url, cookie, '/api/session/start');
  let state = await snapshot(url, cookie);
  while (state.view.now < 2_940_000) state = await (await post(url, cookie, '/api/session/actions', { actionId: 'wait:next', requestId: `setup-${state.view.now}` })).json() as SessionSnapshot;
  time = 6000;
  state = await (await post(url, cookie, '/api/session/actions', { actionId: 'notice', requestId: 'reading-notice' })).json() as SessionSnapshot;
  assert.ok(!JSON.stringify(state).includes('marked C17'));
  const result = await (await post(url, cookie, '/api/session/actions', { actionId: state.view.actions.find(action => action.kind === 'wait')!.id, requestId: 'local-stop' })).json() as SessionSnapshot;
  assert.equal(result.advance?.reason, 'local-event'); assert.equal(result.advance?.requestedUntil, 3_020_000);
  assert.equal(result.advance?.reachedAt, 3_000_000); assert.ok(result.view.busy);
});

test('a rejected expired target cannot produce a successful time advance receipt', async t => {
  let time = 0; const app = createApp({ databasePath: ':memory:', now: () => time }); t.after(() => app.close());
  const url = await app.listen(); const { cookie } = await journey(url); await post(url, cookie, '/api/session/start');
  time = 12_000;
  const response = await post(url, cookie, '/api/session/actions', { actionId: 'wait:until:60000', requestId: 'expired-receipt' });
  assert.equal(response.status, 409); assert.equal((await response.json() as Record<string, unknown>).advance, undefined);
});
