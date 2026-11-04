import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer } from 'vue';
import { createApp } from '../../server/src/app.js';
import { useJourney } from '../src/composables/useJourney.js';

async function journeyHarness(t: TestContext) {
  let time = 0;
  // Both clocks are controlled: a delayed test runner must not advance only
  // the client's interpolation while the authoritative server stays frozen.
  t.mock.method(performance, 'now', () => time);
  const server = createApp({ databasePath: ':memory:', now: () => time });
  const cleanup: (() => void | Promise<void>)[] = [() => server.close()];
  t.after(async () => { for (const close of cleanup.reverse()) await close(); });
  const url = await server.listen();
  const nativeFetch = globalThis.fetch;
  const created = await nativeFetch(`${url}/api/journeys`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'technician', tone: 'tension', detail: '' }),
  });
  const cookie = created.headers.get('set-cookie')!.split(';')[0]!;
  await nativeFetch(`${url}/api/session/start`, { method: 'POST', headers: { Cookie: cookie } });
  let actionTransport: ((request: () => Promise<Response>) => Promise<Response>) | undefined;
  const submitted: { actionId: string; requestId: string }[] = [];
  t.mock.method(globalThis, 'fetch', async (path: string, options?: RequestInit) => {
    const request = () => nativeFetch(`${url}${path}`, { ...options, headers: { ...options?.headers, Cookie: cookie } });
    if (path === '/api/session/actions') {
      submitted.push(JSON.parse(options!.body as string));
      if (actionTransport) return actionTransport(request);
    }
    return request();
  });
  const globals = {
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    window: { addEventListener() {}, removeEventListener() {} },
    localStorage: { getItem() { return null; }, setItem() {} },
    EventSource: class { addEventListener() {} close() {} },
    navigator: { sendBeacon() { return true; } },
  };
  for (const [name, value] of Object.entries(globals)) {
    const prior = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true });
    cleanup.push(() => { if (prior) Object.defineProperty(globalThis, name, prior); else Reflect.deleteProperty(globalThis, name); });
  }
  const renderer = createRenderer<object, object>({
    createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
    insert() {}, remove() {}, setText() {}, setElementText() {}, patchProp() {},
    parentNode: () => null, nextSibling: () => null,
  });
  let journey!: ReturnType<typeof useJourney>;
  const component = renderer.createApp({ setup() { journey = useJourney(); return () => null; } });
  component.mount({});
  cleanup.push(() => component.unmount());
  while (journey.loading.value) await new Promise(resolve => setImmediate(resolve));
  assert.equal(journey.connection.value, 'connected');
  return { journey, submitted, setTime: (value: number) => { time = value; },
    setTransport: (value: typeof actionTransport) => { actionTransport = value; } };
}

test('an expired wait becomes a dismissible notice while the refreshed journey stays usable', async t => {
  const { journey, setTime } = await journeyHarness(t);
  const wait = journey.view.value!.actions.find(action => action.kind === 'wait')!;
  setTime(12_000);
  await journey.submitAction(wait);
  assert.match(journey.notice?.value ?? '', /passed|past|expired/i);
  assert.equal(journey.error.value, '');
  assert.equal(journey.retryAction.value, null);
  assert.equal(journey.connection.value, 'connected');
  assert.equal(journey.canAct.value, true);
  assert.equal(journey.now.value, 60_000);
  journey.dismissNotice();
  assert.equal(journey.notice.value, '');
});

test('a lost action response keeps its request identity until the same action is confirmed', async t => {
  const { journey, setTransport, submitted } = await journeyHarness(t);
  const action = journey.view.value!.actions.find(item => item.kind === 'move')!;
  setTransport(async request => { await request(); throw new TypeError('Connection lost after sending'); });
  await journey.submitAction(action);
  assert.ok(journey.error.value);
  assert.ok(journey.retryAction.value);
  assert.equal(journey.notice?.value ?? '', '');
  setTransport(undefined);
  await journey.resendAction();
  assert.equal(submitted.length, 2);
  assert.equal(submitted[0]!.requestId, submitted[1]!.requestId);
  assert.equal(journey.retryAction.value, null);
  assert.equal(journey.error.value, '');
  assert.equal(journey.view.value!.history.filter(event => event.kind === 'action').length, 1);
});

for (const status of [408, 429, 503]) {
  test(`HTTP ${status} retains the uncertain action for a safe retry`, async t => {
    const { journey, setTransport } = await journeyHarness(t);
    setTransport(async () => Response.json({ error: 'Temporarily unavailable' }, { status }));
    await journey.submitAction(journey.view.value!.actions.find(action => action.kind === 'wait')!);
    assert.ok(journey.retryAction.value);
    assert.equal(journey.error.value, 'Temporarily unavailable');
    assert.equal(journey.notice?.value ?? '', '');
  });
}

test('accepted advance feedback survives refresh and clears when a new task starts', async t => {
  const { journey } = await journeyHarness(t);
  await journey.submitAction(journey.view.value!.actions.find(action => action.kind === 'wait')!);
  assert.equal(journey.advanceFeedback?.value?.reason, 'target');
  await journey.refresh(); assert.equal(journey.advanceFeedback.value?.reachedAt, 60_000);
  await journey.submitAction(journey.view.value!.actions.find(action => action.kind === 'move')!);
  assert.equal(journey.advanceFeedback.value, null);
});

test('a lost advance response restores the original interruption without claiming the task is already done', async t => {
  const { journey, setTime, setTransport } = await journeyHarness(t);
  while (journey.now.value < 900_000) await journey.submitAction(journey.view.value!.actions.find(action => action.kind === 'wait')!);
  await journey.submitAction(journey.view.value!.actions.find(action => action.id === 'leo_intro')!);
  setTransport(async request => { await request(); throw new TypeError('Response lost'); });
  await journey.submitAction(journey.view.value!.actions.find(action => action.kind === 'wait')!);
  assert.equal(journey.advanceFeedback?.value ?? null, null);
  setTime(2000); setTransport(undefined); await journey.resendAction();
  assert.equal(journey.advanceFeedback?.value?.reason, 'announcement');
  assert.equal(journey.advanceFeedback.value.reachedAt, 960_000); assert.equal(journey.now.value, 970_000);
  assert.equal(journey.view.value!.busy?.requestId, journey.advanceFeedback.value.taskRequestId);
  setTime(10_000); await journey.refresh();
  assert.equal(journey.view.value!.busy, null); assert.equal(journey.advanceFeedback.value.reachedAt, 960_000);
});
