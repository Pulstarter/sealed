<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { SuggestedAction, WorldDefinition } from '../../../packages/engine/src/types.js';
import ArtTile from './components/ArtTile.vue';
import ActionContent from './components/ActionContent.vue';
import EnvelopeDebrief from './components/EnvelopeDebrief.vue';
import { useJourney } from './composables/useJourney';
import { actionLabel, advanceMessage, orderActions, planStatus, realDuration, verifyCommitment, worldTime } from './lib/presentation';

const journey = useJourney();
const { session, view, initialHash, commitmentRetained, loading, working, error, notice, advanceFeedback, connection, now, reveal, retryAction, canAct,setup,preparation,preparing,preparationNeedsRecovery,retryPreparationRequest } = journey;
const route = ref<'home' | 'configure' | 'preparing' | 'journey' | 'reveal'>('home');
const role = ref<'technician' | 'guest'>('technician');
const tone = ref<'tension' | 'melancholy'>('tension');
const detail = ref('Snow all night');
const caseSource=ref<'prepared'|'meta'>('prepared');
const preparationPhase=computed(()=>({queued:'Your envelope is in the queue.',generating:'Meta is writing a new case for the lodge.',repairing:'Meta is correcting the case before validation.',validating:'Checking the case and sealing the world.',ready:'Your envelope is ready.',failed:'Your envelope could not be prepared.'})[preparation.value?.status??'queued']);
const preparationProblem=computed(()=>preparation.value?.errorCode==='interrupted'?'Preparation was interrupted. The request may have been charged; it will not be repeated automatically.':preparation.value?.errorCode==='unavailable'?'Meta preparation is unavailable. You can play the reference case.':'A validated case could not be prepared. No envelope was sealed.');
const originLabel=computed(()=>view.value?.origin==='meta'?'Meta-generated case':'Prepared reference');
const drawer = ref<'help' | 'notebook' | 'inventory' | 'history' | 'actions' | 'confirm' | 'seal' | null>(null);
const dialog = ref<HTMLDialogElement>();
const pendingConfirmation = ref<SuggestedAction | null>(null);
const verification = ref<Awaited<ReturnType<typeof verifyCommitment>> | null>(null);
const verifying = ref(false);
const verificationError = ref('');
const suppliedCommitment = ref('');
const timelineFilter = ref<'all' | 'you' | 'unseen'>('all');
const revealTab = ref<'events' | 'plans'>('events');
const copied = ref(false);
const windowNotice = ref('');
const narrative = ref<HTMLElement>();
const placeTiles: Record<string, number> = { reception: 0, lounge: 1, kitchen: 2, generator: 3, office: 4 };
const personTiles: Record<string, number> = { vera: 5, bruno: 6, ada: 7, leo: 8 };
const clock = computed(() => worldTime(now.value, view.value?.window.startLabel ?? '21:00'));
const shortHash = computed(() => session.value ? `${session.value.hash.slice(0, 10)}…${session.value.hash.slice(-6)}` : '');
const latest = computed(() => view.value?.history.at(-1));
const progress = computed(() => {
  const busy = view.value?.busy;
  return busy ? Math.max(0, Math.min(1, (now.value - busy.startedAt) / Math.max(1, busy.endsAt - busy.startedAt))) : 0;
});
const sortedActions = computed(() => orderActions(view.value?.actions ?? [], !!view.value?.busy));
const mainActions = computed(() => sortedActions.value.slice(0, 3));
const advanceDetail = computed(() => {
  const receipt = advanceFeedback.value;
  if (!receipt) return '';
  if (receipt.taskRequestId && view.value?.busy?.requestId === receipt.taskRequestId) {
    return session.value?.clock.paused ? 'Your task is paused.' : connection.value === 'connected' ? 'Your task is still in progress. The clock keeps running.' : 'Your task remains unfinished.';
  }
  return receipt.taskRequestId ? 'The task result is in History.' : 'Events and results stay in History.';
});
const commitmentMismatch = computed(() => !!initialHash.value && !!session.value && initialHash.value !== session.value.hash);
const world = computed<WorldDefinition | null>(() => {
  if (!reveal.value) return null;
  try { return JSON.parse(reveal.value.canonical) as WorldDefinition; } catch { return null; }
});
const timeline = computed(() => (reveal.value?.events ?? []).filter(event => {
  const seen = event.perceivedBy.includes(view.value?.playerId ?? '');
  return timelineFilter.value === 'all' || (timelineFilter.value === 'you' ? seen : !seen);
}));
const dialogTitle = computed(() => ({ help: 'Before you enter', notebook: 'Your notebook', inventory: 'Evidence & inventory', history: 'Your history', actions: 'Available actions', confirm: pendingConfirmation.value?.wait?'Advance the clock?':'A choice you cannot take back', seal: 'The original commitment' })[drawer.value ?? 'help']);

watch(session,(next,previous)=>{
  if(!next||next.id!==previous?.id||next.view.place.id!==previous.view.place.id||next.view.busy){windowNotice.value='';return;}
  if(previous.view.busy)return;
  const lost=previous.view.actions.find(a=>a.timing&&next.view.now>=a.timing.startBefore&&!next.view.actions.some(b=>b.id===a.id));
  if(lost?.timing)windowNotice.value=`${lost.label}: no longer enough time to finish before ${worldTime(lost.timing.finishBefore,next.view.window.startLabel)}.`;
});

watch(drawer, async value => {
  await nextTick();
  if (value && !dialog.value?.open) dialog.value?.showModal();
  else if (!value && dialog.value?.open) dialog.value.close();
});
watch(advanceFeedback, async value => { if (value) { await nextTick(); narrative.value?.scrollTo({ top: 0 }); } });
watch(loading, isLoading => {
  if (!isLoading && session.value?.phase === 'playing') route.value = 'journey';
});
watch([preparing,preparation,session,loading],()=>{
  if(loading.value)return;
  if(preparing.value){route.value='preparing';return;}
  if(route.value==='preparing'&&session.value?.id===preparation.value?.sessionId&&preparation.value?.status==='ready')route.value='journey';
  else if(route.value==='preparing'&&!preparing.value&&error.value&&preparation.value?.status!=='failed')route.value='configure';
  if(preparation.value?.status==='failed'){
    role.value=preparation.value.config.role;tone.value=preparation.value.config.tone;detail.value=preparation.value.config.detail;
  }
});

function closeDrawer() { drawer.value = null; pendingConfirmation.value = null; }
function continueOrPrepare() { route.value = preparing.value?'preparing':session.value ? 'journey' : 'configure'; }
async function prepare() {
  route.value = 'preparing';
  if (await journey.createJourney({ role: role.value, tone: tone.value, detail: detail.value },caseSource.value)) route.value = preparing.value?'preparing':'journey';
  else route.value = 'configure';
}
async function chooseAction(action: SuggestedAction) {
  if (!canAct.value) return;
  windowNotice.value='';
  journey.dismissAdvanceFeedback();
  if (action.irreversible || action.wait?.warning) { pendingConfirmation.value = action; drawer.value = 'confirm'; return; }
  closeDrawer(); await journey.submitAction(action);
}
async function confirmAction() {
  const action = pendingConfirmation.value;
  closeDrawer();
  if (action) await journey.submitAction(action, true);
}
async function openEnvelope() {
  await journey.openEnvelope();
  if (reveal.value) { verification.value = null; route.value = 'reveal'; }
}
async function verify() {
  if (!reveal.value) return;
  verifying.value = true; verificationError.value = '';
  try {
    const original = initialHash.value ?? (/^[a-f0-9]{64}$/i.test(suppliedCommitment.value.trim()) ? suppliedCommitment.value.trim() : undefined);
    verification.value = await verifyCommitment(reveal.value.canonical, original);
  } catch { verificationError.value = 'This browser cannot calculate SHA-256 here. Use a secure connection or download the exact envelope.'; }
  finally { verifying.value = false; }
}
function downloadEnvelope() {
  if (!reveal.value) return;
  const url = URL.createObjectURL(new Blob([reveal.value.canonical], { type: 'application/json;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'sealed-world.json'; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function copyHash() {
  const hash = initialHash.value ?? session.value?.hash;
  if (!hash) return;
  try { await navigator.clipboard.writeText(hash); copied.value = true; setTimeout(() => { copied.value = false; }, 1800); }
  catch { drawer.value = 'seal'; }
}
function beginAgain() { journey.newJourney(); route.value = 'configure'; verification.value = null; }
</script>

<template>
  <div class="app-shell" :class="{ 'is-playing': route === 'journey' && session?.phase === 'playing', 'is-reveal': route === 'reveal' }">
    <div v-if="error" class="error-banner" role="alert">
      <span>{{ error }}</span>
      <button v-if="retryAction" class="text-button" :disabled="working" @click="journey.resendAction">Retry the same action</button>
      <button v-else-if="retryPreparationRequest" class="text-button" :disabled="working" @click="journey.retryPreparation">Recover preparation</button>
      <button v-else-if="route === 'configure'" class="text-button" @click="error = ''">Dismiss</button>
      <button v-else class="text-button" :disabled="working" @click="journey.refresh">Reconnect</button>
    </div>
    <div v-else-if="notice" class="error-banner action-notice" role="status">
      <span>{{ notice }}</span>
      <button class="text-button" @click="journey.dismissNotice">Dismiss</button>
    </div>

    <main v-if="route === 'home'" class="booking-layout home-layout">
      <section class="cover-art">
        <ArtTile :tile="0" description="Prepared illustration of the snowbound alpine lodge" />
        <div class="cover-copy"><p class="eyebrow">A journey with a truth of its own</p><h1 class="wordmark">SEALED</h1><p class="cover-tagline">The world keeps moving.<br />With or without you.</p></div>
      </section>
      <section class="booking-content home-content">
        <p class="eyebrow">Snowbound at the lodge</p>
        <h2>Choose where<br />you will be.</h2>
        <p class="intro-copy">A snowbound lodge. Four people with plans of their own. One hour to discover what is happening.</p>
        <p class="muted">At the end, open the envelope and find out what you missed.</p>
        <div class="home-actions">
          <button class="button primary" :disabled="loading" @click="continueOrPrepare">{{ loading ? 'Finding your journey…' : session ? 'Continue my journey' : 'Prepare my journey' }}</button>
          <button class="text-button" @click="drawer = 'help'">How to play</button>
        </div>
        <p class="provenance">{{ setup.meta.available ? 'Reference mystery or a new Meta case' : 'Prepared reference · H1' }}<br /><span>{{ setup.meta.available ? 'Choose your case before entering. Illustrations and the lodge cast are prepared.' : 'Hand-authored case and prepared illustration. Meta generation is unavailable here.' }}</span></p>
      </section>
    </main>

    <main v-else-if="route === 'configure'" class="booking-layout">
      <section class="cover-art compact-art"><ArtTile :tile="0" description="The alpine lodge, surrounded by snow" /><div class="cover-copy"><p class="wordmark small">SEALED</p><h1>Your journey.<br />Its secrets.</h1></div></section>
      <section class="booking-content configuration">
        <button class="text-button back" @click="route = 'home'">Back to the agency</button>
        <p class="eyebrow">Mountain lodge · Mystery · about 12 active minutes</p>
        <h2>Configure your journey</h2>
        <form @submit.prevent="prepare">
          <label class="detail-label" for="case-source">Your mystery</label>
          <select id="case-source" v-model="caseSource" class="detail-input"><option value="prepared">Prepared reference · H1</option><option value="meta" :disabled="!setup.meta.available">New case · Meta</option></select>
          <fieldset><legend>Your role</legend><div class="choice-row">
            <label class="choice" :class="{ selected: role === 'technician' }"><input v-model="role" type="radio" value="technician" name="role" /><strong>Technician</strong><span>You know the lodge's systems.</span></label>
            <label class="choice" :class="{ selected: role === 'guest' }"><input v-model="role" type="radio" value="guest" name="role" /><strong>Guest</strong><span>You arrive with a different perspective.</span></label>
          </div></fieldset>
          <fieldset><legend>The tone</legend><div class="choice-row">
            <label class="choice" :class="{ selected: tone === 'tension' }"><input v-model="tone" type="radio" value="tension" name="tone" /><strong>Tension</strong><span>Uneasy, watchful, restrained.</span></label>
            <label class="choice" :class="{ selected: tone === 'melancholy' }"><input v-model="tone" type="radio" value="melancholy" name="tone" /><strong>Melancholy</strong><span>A quieter, reflective night.</span></label>
          </div></fieldset>
          <label class="detail-label" for="detail">One detail for the journey <span class="muted">(optional)</span></label>
          <input id="detail" v-model="detail" class="detail-input" maxlength="160" placeholder="Snow all night" />
          <p class="small-copy muted">{{ caseSource === 'meta' ? 'Meta creates a new case in the same lodge, with the same cast and schedule. It is validated before the envelope is sealed.' : 'Play the fixed reference mystery. Your selection is recorded; it does not rewrite the case.' }}</p>
          <button class="button primary" type="submit" :disabled="working">Prepare my envelope</button>
        </form>
      </section>
    </main>

    <main v-else-if="route === 'preparing'" class="center-stage" :aria-busy="preparing">
      <p class="wordmark small">SEALED</p><p class="eyebrow">{{ caseSource === 'meta' || preparation ? 'A new case · Meta' : 'Prepared reference' }}</p>
      <template v-if="preparation?.status === 'failed'"><h1>This envelope could not be prepared</h1><p role="alert">{{ preparationProblem }}</p><button class="button primary" @click="route = 'configure'">Back to settings</button></template>
      <template v-else><h1>Preparing your envelope</h1><p role="status">{{ caseSource === 'meta' || preparation ? preparationPhase : 'Loading and checking the reference world.' }}</p><ol v-if="caseSource === 'meta' || preparation" class="preparation-steps" aria-label="Preparation stages"><li :aria-current="preparation?.status === 'queued' ? 'step' : undefined">Request accepted</li><li :aria-current="['generating','repairing'].includes(preparation?.status ?? '') ? 'step' : undefined">Create the case with Meta</li><li :aria-current="preparation?.status === 'validating' ? 'step' : undefined">Validate and seal</li></ol><p class="muted">The game clock has not started.<br />You can reload and recover this preparation.</p><button v-if="preparationNeedsRecovery" class="button primary" @click="journey.retryPreparation">Recover this preparation</button></template>
    </main>

    <main v-else-if="route === 'journey' && session && view && session.phase === 'sealed'" class="booking-layout sealed-layout">
      <section class="cover-art"><ArtTile :tile="0" description="The lodge before your journey begins" /><div class="cover-copy"><p class="wordmark small">SEALED</p><h1>A world already<br />waiting for you.</h1></div></section>
      <section class="booking-content envelope-content">
        <p class="eyebrow">{{ originLabel }} · Original world conserved</p><h2>Your journey<br />is sealed.</h2><p class="journey-title">{{ view.title }}</p>
        <p class="muted">{{ view.role === 'technician' ? 'Technician' : 'Guest' }} · Mystery · about 12 active minutes</p>
        <div class="public-brief"><p class="eyebrow">Your objective</p><p>Keep the lodge's money safe and document what happens before the 22:00 departure.</p></div>
        <button class="seal-line" @click="drawer = 'seal'"><span>World commitment</span><code>{{ shortHash }}</code><span class="small-copy">View full seal</span></button>
        <p v-if="commitmentMismatch" class="warning-copy" role="alert">The server's seal differs from the one kept on this device. Do not treat it as the original world.</p>
        <p class="clock-reassurance">Read at your own pace. The clock starts when you enter.</p>
        <button class="button primary" :disabled="working || commitmentMismatch" @click="journey.startJourney">{{ working ? 'Entering…' : 'Enter and start the clock' }}</button>
        <button class="text-button" @click="route = 'home'">Return to the agency</button>
      </section>
    </main>

    <main v-else-if="route === 'journey' && session && view && session.phase === 'playing'" class="adventure">
      <header class="adventure-header"><div class="journey-brand"><span class="wordmark small">SEALED</span><div><strong>{{ view.title }}</strong><span>{{ originLabel }}</span></div></div><div class="clock-area"><time :datetime="clock">{{ clock }}</time><div><span>World time ×{{ view.window.scale }}</span><span>Until {{ view.window.endLabel }}</span></div><button class="pause-button" :disabled="working || connection !== 'connected'" @click="journey.pauseOrResume">{{ session.clock.paused ? 'Resume' : 'Pause' }}</button></div></header>
      <section class="adventure-scene">
        <ArtTile :tile="placeTiles[view.place.id] ?? 0" :description="`Prepared illustration of ${view.place.name}`" />
        <div class="place-caption"><span>{{ view.busy?.to ? 'In transit' : 'You are in' }}</span><strong>{{ view.place.name }}</strong></div>
        <div v-if="view.npcs.length && !view.busy?.to" class="people-present"><div v-for="npc in view.npcs" :key="npc.id" class="person"><ArtTile :tile="personTiles[npc.id.toLowerCase()] ?? 0" :description="`Prepared portrait of ${npc.name}`" /><span>{{ npc.name }}</span></div></div>
        <span class="art-note">Prepared illustration</span>
      </section>
      <section class="adventure-reading">
        <div class="reading-heading"><p class="eyebrow">{{ view.place.name }} · {{ clock }}</p><button class="text-button" @click="drawer = 'seal'">World sealed</button></div>
        <div ref="narrative" class="narrative" aria-live="polite"><h1>{{ view.place.name }}</h1><div v-if="advanceFeedback" class="advance-feedback" role="status"><div><strong>{{ advanceMessage(advanceFeedback,view.window.startLabel) }}</strong><p>{{ advanceDetail }}</p></div><button class="text-button" aria-label="Dismiss time advance message" @click="journey.dismissAdvanceFeedback">Dismiss</button></div><p>{{ latest?.text ?? view.place.description }}</p></div>
        <div v-if="connection !== 'connected'" class="connection-notice" role="status">{{ connection === 'hidden' ? 'The journey is away from view.' : 'Reconnecting… actions will return after the current state is recovered.' }}</div>
        <div v-else-if="session.clock.paused" class="connection-notice" role="status">The clock is paused. Resume when you are ready.</div>
        <p v-if="windowNotice" class="window-notice" role="status">{{ windowNotice }}</p>
        <div v-if="view.busy" class="busy-status"><div><span>{{ progress >= 1 ? 'Waiting for the server to confirm completion…' : `In progress: ${view.busy.label}` }}</span><span>{{ realDuration(Math.max(0, view.busy.endsAt - now), view.window.scale) }} real remaining</span></div><progress :value="progress" max="1" :aria-label="view.busy.label"></progress></div>
        <div class="action-area">
          <p v-if="!view.busy && !mainActions.length" class="muted">No action is available here right now.</p>
          <button v-for="(action, index) in mainActions" :key="action.id" class="button action-button" :class="{ primary: index === 0, secondary: index !== 0 }" :disabled="!canAct" @click="chooseAction(action)"><ActionContent :action="action" :now="now" :scale="view.window.scale" :start="view.window.startLabel" :busy="!!view.busy" /></button>
          <button v-if="sortedActions.length > 3" class="text-button more-actions" :disabled="!canAct" @click="drawer = 'actions'">All {{ sortedActions.length }} available actions</button>
        </div>
        <nav class="support-navigation" aria-label="Journey details"><button @click="drawer = 'notebook'">Notebook <span>{{ view.facts.length }}</span></button><button @click="drawer = 'inventory'">Evidence <span>{{ view.evidence.length }}</span></button><button @click="drawer = 'history'">History</button></nav>
      </section>
    </main>

    <main v-else-if="route === 'journey' && session && view && session.phase === 'finished'" class="center-stage outcome-stage">
      <p class="wordmark small">SEALED</p><p class="eyebrow">The night has ended</p><h1>{{ view.ending === 'success' ? 'You kept the truth.' : view.ending === 'partial' ? 'Safe, with questions left.' : 'The departure went ahead.' }}</h1><p>{{ view.endingText }}</p><p class="muted">Now discover what happened while you were elsewhere.</p><button class="button primary" :disabled="working" @click="openEnvelope">{{ working ? 'Opening…' : 'Open the envelope' }}</button>
    </main>

    <main v-else-if="route === 'reveal' && reveal && view" class="reveal-layout">
      <header class="reveal-header"><div><p class="eyebrow">The night, revealed</p><h1>The envelope is open.</h1><p>Your choices changed what happened. These are the recorded events.</p></div><button class="button secondary" @click="beginAgain">Prepare another journey</button></header>
      <EnvelopeDebrief v-if="reveal.debrief" :debrief="reveal.debrief" :start="view.window.startLabel" />
      <p v-else class="legacy-envelope-note">This journey keeps its original envelope. Prepare a new journey to try the expanded case explanation.</p>
      <section class="verification-panel" aria-live="polite"><div><p class="eyebrow">Original world commitment</p><h2 v-if="verification?.status === 'match'" class="verified">The world matches the seal you kept.</h2><h2 v-else-if="verification?.status === 'mismatch'" class="warning-copy">The hashes do not match.</h2><h2 v-else-if="verification?.status === 'missing'">No original commitment to compare.</h2><h2 v-else>Verify the envelope on this device.</h2><p class="small-copy muted">This checks the revealed world's bytes against your original seal. It does not independently verify every engine decision.</p></div><div class="verification-actions"><button class="button primary" :disabled="verifying" @click="verify">{{ verifying ? 'Calculating SHA-256…' : 'Verify the original seal' }}</button><button class="text-button" @click="downloadEnvelope">Download exact world JSON</button></div><p v-if="verificationError" class="warning-copy">{{ verificationError }}</p><div v-if="!initialHash" class="missing-commitment"><label for="original-seal">Paste the original full seal if you kept it elsewhere</label><input id="original-seal" v-model="suppliedCommitment" maxlength="64" spellcheck="false" autocomplete="off" placeholder="64 hexadecimal characters" /></div><details class="hash-details"><summary>View full hashes</summary><p>Original: <code>{{ initialHash ?? (suppliedCommitment || 'Not retained on this device') }}</code></p><p>Stored by the server: <code>{{ reveal.hash }}</code></p><p v-if="verification">Calculated from exact bytes: <code>{{ verification.computed }}</code></p></details></section>
      <section class="reveal-timeline"><div class="timeline-toolbar"><div class="tab-group" aria-label="Envelope view"><button :class="{ active: revealTab === 'events' }" @click="revealTab = 'events'">What happened</button><button :class="{ active: revealTab === 'plans' }" @click="revealTab = 'plans'">The sealed plans</button></div><label v-if="revealTab === 'events'">Show <select v-model="timelineFilter"><option value="all">All events</option><option value="you">Your experience</option><option value="unseen">What you missed</option></select></label></div>
        <div v-if="revealTab === 'events'" class="timeline-list"><article v-for="event in timeline" :key="event.id" class="timeline-event" :class="{ unseen: !event.perceivedBy.includes(view.playerId) }"><time>{{ worldTime(event.at, view.window.startLabel) }}</time><div><span class="event-label">{{ event.kind === 'reminder' ? 'Your reminder' : event.kind === 'action' && event.actor === view.playerId ? 'Your action' : event.perceivedBy.includes(view.playerId) ? 'You perceived this' : 'While you were elsewhere' }}</span><p>{{ event.text }}</p><span v-if="event.placeId" class="muted small-copy">{{ world?.places.find(place => place.id === event.placeId)?.name ?? event.placeId }}</span></div></article><p v-if="!timeline.length" class="muted">No recorded events in this view.</p></div>
        <div v-else-if="world" class="plans-view"><p class="muted">These are the original plans. An event or visit can be prevented; the record above shows what actually happened.</p><div class="character-plans"><section v-for="npc in world.npcs" :key="npc.id"><h3>{{ npc.name }} <span>{{ npc.archetype }}</span></h3><ul><li v-for="(visit, index) in npc.agenda" :key="index"><time>{{ worldTime(visit.from, view.window.startLabel) }}–{{ worldTime(visit.until, view.window.startLabel) }}</time><span>{{ visit.placeId ? world.places.find(place => place.id === visit.placeId)?.name : 'In transit' }}</span></li></ul></section></div><h3>Scheduled events</h3><ol class="scheduled-events"><li v-for="event in world.scheduledEvents" :key="event.id" :class="{ 'not-triggered': planStatus(event.id,reveal.events)==='Not triggered' }"><time>{{ worldTime(event.at, view.window.startLabel) }}</time><span class="plan-status">{{ planStatus(event.id,reveal.events,event.text) }}</span><span>{{ event.text }} <em v-if="event.requires">(conditional plan)</em></span></li></ol></div>
      </section>
    </main>

    <dialog ref="dialog" class="journey-dialog" :class="{ 'short-dialog': drawer === 'help' || drawer === 'confirm' || drawer === 'seal' }" aria-labelledby="dialog-title" @close="closeDrawer" @cancel="closeDrawer">
      <div class="dialog-top"><div><p v-if="session?.phase === 'playing'" class="eyebrow">{{ clock }} · {{ session.clock.paused ? 'Paused' : 'The clock keeps moving' }}</p><h2 id="dialog-title">{{ dialogTitle }}</h2></div><button class="close-button" autofocus @click="closeDrawer">Close</button></div>
      <div class="dialog-scroll">
        <p v-if="drawer === 'actions' && windowNotice" class="window-notice" role="status">{{ windowNotice }}</p>
        <div v-if="drawer === 'help'" class="help-copy"><p>The world is created and sealed before you enter.</p><p>The clock moves while you read and decide. You can pause explicitly.</p><p>A task resolves when its timer ends. Skip remaining wait advances the whole world immediately; events and results stay in History.</p><p>When you are free, Advance time lets you skip real waiting. A new event can stop the jump before the selected time.</p><p>You cannot be everywhere. At the end, discover what you missed.</p><p class="muted small-copy">{{ view?.origin === 'meta' ? 'Meta generated the case before sealing. The cast, schedule, illustrations and in-game narration use prepared material.' : 'The reference case is hand-authored, with prepared illustrations. Choose New case · Meta in the settings to generate another mystery when available.' }}</p><button class="button primary" @click="closeDrawer">Understood</button></div>
        <template v-else-if="drawer === 'notebook'"><p class="muted small-copy">Only facts your character has learned.</p><ul class="detail-list"><li v-for="fact in view?.facts" :key="fact.id">{{ fact.text }}</li></ul><p v-if="!view?.facts.length" class="muted">Your notebook is still empty.</p></template>
        <template v-else-if="drawer === 'inventory'"><p class="muted small-copy">Only evidence your character has obtained.</p><ul class="detail-list"><li v-for="item in view?.evidence" :key="item.id">{{ item.text }}</li></ul><p v-if="!view?.evidence.length" class="muted">No evidence collected yet.</p></template>
        <template v-else-if="drawer === 'history'"><p class="muted small-copy">New events keep their original time. Reading here does not pause the world.</p><ol class="history-list"><li v-for="event in view?.history" :key="event.id"><time>{{ worldTime(event.at, view?.window.startLabel ?? '21:00') }}</time><p>{{ event.text }}</p></li></ol></template>
        <template v-else-if="drawer === 'actions'"><div class="drawer-actions"><button v-for="action in sortedActions" :key="action.id" class="button secondary" :disabled="!canAct" @click="chooseAction(action)"><ActionContent :action="action" :now="now" :scale="view?.window.scale ?? 5" :start="view?.window.startLabel ?? '21:00'" :busy="!!view?.busy" /></button></div></template>
        <template v-else-if="drawer === 'confirm' && pendingConfirmation"><p class="confirm-action">{{ actionLabel(pendingConfirmation,view?.window.startLabel ?? '21:00',!!view?.busy) }}</p><p v-if="pendingConfirmation.wait">{{ pendingConfirmation.wait.warning }} You will skip real waiting while the whole world advances. The selected time stays fixed; if it passes while you decide, choose the current option.</p><p v-else>This choice has lasting consequences. The world keeps moving while you decide.</p><button class="button primary" :disabled="!canAct" @click="confirmAction">Confirm this action</button><button class="text-button" @click="closeDrawer">Keep considering</button></template>
        <template v-else-if="drawer === 'seal'"><p>The original world commitment was shown before entering.</p><code class="full-hash">{{ initialHash ?? session?.hash }}</code><p v-if="!commitmentRetained" class="warning-copy small-copy">This browser has not retained an original seal in persistent storage. Keep a copy yourself before entering.</p><p v-if="commitmentMismatch" class="warning-copy">The current server seal differs from the original you kept.</p><button class="button secondary" @click="copyHash">{{ copied ? 'Copied' : 'Copy full seal' }}</button><p class="muted small-copy">The full world remains hidden until this journey ends.</p></template>
      </div>
    </dialog>
  </div>
</template>
