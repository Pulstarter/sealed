import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { SessionSnapshot, SuggestedAction, Reveal, TimeAdvanceReceipt,JourneyConfig,JourneySetup,PreparationSnapshot } from '../../../../packages/engine/src/types.js';
import { api, ApiError } from '../lib/api';
import { extrapolateClock, rememberCommitment } from '../lib/presentation';

export function useJourney() {
  const session = ref<SessionSnapshot | null>(null);
  const initialHash = ref<string>();
  const commitmentRetained = ref(false);
  const loading = ref(true);
  const working = ref(false);
  const error = ref('');
  const notice = ref('');
  const advanceFeedback = ref<TimeAdvanceReceipt | null>(null);
  const connection = ref<'connecting' | 'connected' | 'reconnecting' | 'hidden'>('connecting');
  const now = ref(0);
  const reveal = ref<Reveal | null>(null);
  const retryAction = ref<{ actionId: string; requestId: string; confirmed: boolean } | null>(null);
  const setup=ref<JourneySetup>({meta:{available:false,model:null}});
  const preparation=ref<PreparationSnapshot|null>(null);
  const retryPreparationRequest=ref<(JourneyConfig&{requestId:string})|null>(null);
  const preparationKey='sealed:pending-preparation';
  try{const saved=JSON.parse(localStorage.getItem(preparationKey)??'null');if(saved&&typeof saved.requestId==='string'&&/^[a-z0-9:_-]{1,100}$/i.test(saved.requestId)&&['technician','guest'].includes(saved.role)&&['tension','melancholy'].includes(saved.tone)&&typeof saved.detail==='string'&&saved.detail.length<=160)retryPreparationRequest.value=saved;}catch{/* Storage is optional; the owner cookie still recovers active work. */}
  const preparing=computed(()=>!!retryPreparationRequest.value||!!preparation.value&&!['ready','failed'].includes(preparation.value.status));
  const preparationNeedsRecovery=computed(()=>!!retryPreparationRequest.value&&preparation.value?.requestId!==retryPreparationRequest.value.requestId&&!working.value);
  let receivedAt = 0;
  let source: EventSource | null = null;
  let tick: ReturnType<typeof setInterval> | undefined;
  let presenceTick: ReturnType<typeof setInterval> | undefined;
  let preparationTick:ReturnType<typeof setInterval>|undefined;
  let checkingPreparation=false;
  let restoring = false;
  let lastServerNow = -Infinity;

  const view = computed(() => session.value?.view ?? null);
  const canAct = computed(() => !!session.value && session.value.phase === 'playing' && connection.value === 'connected' && !session.value.clock.paused && !working.value && !retryAction.value);

  function applySnapshot(next: SessionSnapshot) {
    if (session.value?.id === next.id && next.clock.serverNow < lastServerNow) return;
    if (session.value?.id !== next.id) {
      lastServerNow = -Infinity;
      initialHash.value = undefined;
      reveal.value = null;
      advanceFeedback.value = null;
    }
    lastServerNow = next.clock.serverNow;
    session.value = next;
    if (!initialHash.value) {
      try {
        const saved = rememberCommitment(localStorage, next.id, next.hash, next.phase);
        initialHash.value = saved.hash;
        commitmentRetained.value = saved.retained;
      } catch {
        initialHash.value = next.phase === 'sealed' ? next.hash : undefined;
        commitmentRetained.value = false;
      }
    }
    receivedAt = performance.now();
    now.value = next.clock.gameNow;
    connection.value = document.hidden ? 'hidden' : 'connected';
    if (next.phase === 'finished') closeStream();
  }

  function closeStream() {
    source?.close();
    source = null;
  }

  function openStream() {
    closeStream();
    if (!session.value || session.value.phase !== 'playing' || document.hidden) return;
    source = new EventSource('/api/session/events');
    source.addEventListener('snapshot', event => {
      try { applySnapshot(JSON.parse((event as MessageEvent<string>).data) as SessionSnapshot); }
      catch { connection.value = 'reconnecting'; }
    });
    source.onerror = () => { if (!document.hidden) connection.value = 'reconnecting'; };
  }

  function keepPreparation(request:(JourneyConfig&{requestId:string})|null){
    retryPreparationRequest.value=request;
    try{localStorage.setItem(preparationKey,request?JSON.stringify(request):'');}catch{/* Recovery remains available through the owner cookie. */}
  }
  async function acceptPreparation(p:PreparationSnapshot){
    if(retryPreparationRequest.value&&retryPreparationRequest.value.requestId!==p.requestId)return false;
    const intended=retryPreparationRequest.value?.requestId===p.requestId;
    if(!['ready','failed'].includes(p.status)){
      preparation.value=p;keepPreparation({...p.config,requestId:p.requestId});return true;
    }
    if(!intended&&session.value)return false;
    preparation.value=p;
    if(p.status==='failed'){keepPreparation(null);return true;}
    applySnapshot(await api<SessionSnapshot>(`/api/preparations/${p.id}/claim`,{}));
    keepPreparation(null);retryAction.value=null;closeStream();
    return true;
  }
  async function refreshPreparation(){
    if(checkingPreparation)return false;
    checkingPreparation=true;
    try{const result=await api<{preparation:PreparationSnapshot|null}>('/api/preparations/current');return result.preparation?await acceptPreparation(result.preparation):false;}
    finally{checkingPreparation=false;}
  }

  async function refresh() {
    if (restoring) return;
    restoring = true;
    try {
      setup.value=await api<JourneySetup>('/api/setup');
      const result = await api<{ session: SessionSnapshot | null }>('/api/session');
      if (result.session) {
        applySnapshot(result.session);
        if (result.session.phase === 'playing' && !document.hidden) {
          applySnapshot(await api<SessionSnapshot>('/api/session/presence', { visible: true }));
        }
        openStream();
      } else {
        session.value = null;
        connection.value = 'connected';
      }
      const confirmed=await refreshPreparation();
      if(confirmed||!retryPreparationRequest.value)error.value='';
      else if(!error.value)error.value='This preparation has not been confirmed. Recover the same request.';
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : 'The server is unavailable.';
      connection.value = 'reconnecting';
    } finally {
      loading.value = false;
      restoring = false;
    }
  }

  async function createJourney(config: JourneyConfig,mode:'prepared'|'meta'='prepared') {
    if(working.value||preparing.value)return false;
    working.value = true;
    error.value = '';
    notice.value = '';
    advanceFeedback.value = null;
    try {
      if(mode==='meta'){
        const request={...config,requestId:crypto.randomUUID()};keepPreparation(request);preparation.value=null;
        const result=await api<{preparation:PreparationSnapshot}>('/api/preparations',request);await acceptPreparation(result.preparation);return true;
      }
      applySnapshot(await api<SessionSnapshot>('/api/journeys', config));
      preparation.value=null;
      retryAction.value = null;
      closeStream();
      return true;
    } catch (reason) {
      if(reason instanceof ApiError&&reason.status<500&&reason.status!==408&&reason.status!==429)keepPreparation(null);
      if(reason instanceof ApiError&&(reason.status===429||reason.status===503))keepPreparation(null);
      error.value = reason instanceof Error ? reason.message : 'The journey could not be prepared.';
      return false;
    } finally { working.value = false; }
  }

  async function retryPreparation(){
    if(working.value)return;working.value=true;error.value='';
    try{
      const pending=retryPreparationRequest.value;
      const found=await api<{preparation:PreparationSnapshot|null}>('/api/preparations/current');
      if(found.preparation&&(!pending||found.preparation.requestId===pending.requestId))await acceptPreparation(found.preparation);
      else if(pending){const result=await api<{preparation:PreparationSnapshot}>('/api/preparations',pending);await acceptPreparation(result.preparation);}
    }catch(reason){
      if(reason instanceof ApiError&&((reason.status<500&&reason.status!==408)||reason.status===503))keepPreparation(null);
      error.value=reason instanceof Error?reason.message:'Your preparation could not be recovered.';
    }
    finally{working.value=false;}
  }

  async function startJourney() {
    working.value = true;
    error.value = '';
    try {
      applySnapshot(await api<SessionSnapshot>('/api/session/start', {}));
      applySnapshot(await api<SessionSnapshot>('/api/session/presence', { visible: !document.hidden }));
      openStream();
    } catch (reason) { error.value = reason instanceof Error ? reason.message : 'The journey could not start.'; }
    finally { working.value = false; }
  }

  async function submitAction(action: SuggestedAction, confirmed = false) {
    if (!canAct.value) return;
    retryAction.value = { actionId: action.id, requestId: crypto.randomUUID(), confirmed };
    await resendAction();
  }

  async function resendAction() {
    if (working.value || !retryAction.value) return;
    working.value = true;
    error.value = '';
    notice.value = '';
    advanceFeedback.value = null;
    try {
      const result = await api<SessionSnapshot>('/api/session/actions', retryAction.value);
      applySnapshot(result);
      if (result.advance?.requestId === retryAction.value.requestId) advanceFeedback.value = result.advance;
      retryAction.value = null;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'The action could not be confirmed. Retry it to avoid submitting twice.';
      if (reason instanceof ApiError && reason.status < 500 && reason.status !== 408 && reason.status !== 429) {
        retryAction.value = null;
        await refresh();
        notice.value = message;
      } else error.value = message;
    } finally { working.value = false; }
  }

  async function pauseOrResume() {
    if (!session.value || working.value) return;
    working.value = true;
    try {
      const path = session.value.clock.paused ? '/api/session/resume' : '/api/session/pause';
      applySnapshot(await api<SessionSnapshot>(path, {}));
      openStream();
    } catch (reason) { error.value = reason instanceof Error ? reason.message : 'The clock could not be updated.'; }
    finally { working.value = false; }
  }

  async function openEnvelope() {
    if (session.value?.phase !== 'finished') return;
    working.value = true;
    try {
      reveal.value = await api<Reveal>('/api/session/reveal');
      error.value = '';
    } catch (reason) { error.value = reason instanceof Error ? reason.message : 'The envelope could not be opened.'; }
    finally { working.value = false; }
  }

  function reportHidden() {
    if (session.value?.phase !== 'playing') return;
    closeStream();
    connection.value = 'hidden';
    const blob = new Blob([JSON.stringify({ visible: false })], { type: 'application/json' });
    if (!navigator.sendBeacon('/api/session/presence', blob)) {
      void fetch('/api/session/presence', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visible: false }), keepalive: true }).catch(() => undefined);
    }
  }

  function visibilityChanged() { if (document.hidden) reportHidden(); else void refresh(); }
  function dismissNotice() { notice.value = ''; }
  function dismissAdvanceFeedback() { advanceFeedback.value = null; }
  function newJourney() { closeStream(); session.value = null; reveal.value = null; retryAction.value = null; error.value = ''; notice.value = ''; advanceFeedback.value = null;preparation.value=null;keepPreparation(null); }

  onMounted(() => {
    void refresh();
    tick = setInterval(() => {
      if (session.value && connection.value === 'connected' && !document.hidden) {
        now.value = extrapolateClock(session.value.clock, receivedAt, performance.now(), session.value.view.window.durationMs);
      }
    }, 100);
    presenceTick = setInterval(() => {
      if (session.value?.phase === 'playing' && !document.hidden) {
        void api<SessionSnapshot>('/api/session/presence', { visible: true }).then(applySnapshot).catch(() => { connection.value = 'reconnecting'; });
      }
    }, 5000);
    preparationTick=setInterval(()=>{if(preparing.value&&!working.value&&!restoring&&!document.hidden)void refreshPreparation().then(confirmed=>{if(confirmed)error.value='';}).catch(()=>{error.value='Preparation could not be checked. Recover the same request.';});},1000);
    document.addEventListener('visibilitychange', visibilityChanged);
    window.addEventListener('pagehide', reportHidden);
    window.addEventListener('online', refresh);
  });
  onUnmounted(() => {
    reportHidden(); closeStream(); clearInterval(tick); clearInterval(presenceTick);clearInterval(preparationTick);
    document.removeEventListener('visibilitychange', visibilityChanged);
    window.removeEventListener('pagehide', reportHidden);
    window.removeEventListener('online', refresh);
  });

  return { session, view, initialHash, commitmentRetained, loading, working, error, notice, advanceFeedback, connection, now, reveal, retryAction, canAct,setup,preparation,preparing,preparationNeedsRecovery,retryPreparationRequest,retryPreparation, refresh, createJourney, startJourney, submitAction, resendAction, pauseOrResume, openEnvelope, newJourney, dismissNotice, dismissAdvanceFeedback };
}
