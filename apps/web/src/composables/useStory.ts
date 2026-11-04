import { computed,onMounted,onUnmounted,ref,watch } from 'vue';
import type { StorySnapshot } from '../../../../packages/engine/src/story-types.js';
import { paginateStory } from '../lib/story-presentation.js';

type Pending={kind:'start'|'continue'|'begin'|'choose';requestId:string;generation?:number;restart?:boolean;id?:string;node?:string;choice?:'A'|'B'};
const PENDING_KEY='sealed-vagon-pending-v1';
const saved=(key:string)=>{try{return localStorage.getItem(key);}catch{return null;}};
const save=(key:string,value:string)=>{try{localStorage.setItem(key,value);}catch{/* Recovery still works from the server if storage is unavailable. */}};
function savedPending():Pending|null {
  try{const p=JSON.parse(saved(PENDING_KEY)||'null') as Pending|null;return p&&['start','continue','begin','choose'].includes(p.kind)&&typeof p.requestId==='string'?p:null;}catch{return null;}
}
export function useStory(){
  const session=ref<StorySnapshot|null>(null),loading=ref(true),working=ref(false),error=ref(''),notice=ref(''),pending=ref<Pending|null>(savedPending()),pageIndex=ref(0),remaining=ref(0),connected=ref(true);
  const pages=computed(()=>paginateStory(session.value?.scene.paragraphs??[]));
  const canRecover=computed(()=>!!pending.value&&!working.value);
  let stream:EventSource|null=null,timer:ReturnType<typeof setInterval>|undefined,alive=true,receivedAt=0,expiredCheck:number|null=null,activeRequestId:string|null=null;
  const pageKey=(s:StorySnapshot)=>`sealed-vagon-page:${s.id}:${s.scene.id}`;
  function setPending(p:Pending|null){pending.value=p;save(PENDING_KEY,p?JSON.stringify(p):'');}
  function accept(next:StorySnapshot|null){
    if(!alive||!next)return;
    const prior=session.value;
    const p=pending.value;
    if(p&&((p.kind==='start'&&(next.startRequestId===p.requestId||(p.generation!==undefined&&next.generation>p.generation)))||(p.kind!=='start'&&next.id===p.id&&(next.lastRequestId===p.requestId||next.scene.id!==p.node))||(p.kind!=='start'&&prior&&next.generation>prior.generation))){
      setPending(null);error.value='';if(activeRequestId===p.requestId){activeRequestId=null;working.value=false;}
    }
    if(prior&&(next.generation<prior.generation||(next.id===prior.id&&(next.revision<prior.revision||next.serverNow<prior.serverNow))))return;
    const changed=prior?.id!==next.id||prior.scene.id!==next.scene.id;
    session.value=next;receivedAt=performance.now();connected.value=true;
    if(changed){pageIndex.value=Math.min(Math.max(0,Number(saved(pageKey(next)))||0),Math.max(0,pages.value.length-1));if(next.lastDecision?.choice==='T'&&next.scene.id.startsWith('R'))notice.value='Se agotó el tiempo. Esto fue lo que ocurrió.';else notice.value='';}
    if(next.phase!=='deciding')expiredCheck=null;
    updateClock();connect();
  }
  function connect(){
    if(!alive||document.hidden||!session.value||session.value.phase==='finished'){stream?.close();stream=null;return;}
    if(stream)return;stream=new EventSource('/api/story/events');
    stream.addEventListener('snapshot',(event)=>{try{accept(JSON.parse((event as MessageEvent<string>).data) as StorySnapshot);}catch{connected.value=false;}});
    stream.addEventListener('error',()=>{connected.value=false;});
  }
  async function refresh(){
    try{const res=await fetch('/api/story',{cache:'no-store'});if(!res.ok)throw new Error();const value=await res.json() as {session:StorySnapshot|null};accept(value.session);connected.value=true;if(!pending.value)error.value='';}
    catch{connected.value=false;error.value='No se pudo recuperar la aventura. Comprueba la conexión y vuelve a intentarlo.';}
    finally{loading.value=false;}
  }
  function updateClock(){
    const s=session.value;if(!s||s.deadline===null){remaining.value=0;return;}
    remaining.value=Math.max(0,s.deadline-(s.serverNow+performance.now()-receivedAt));
    if(remaining.value===0&&expiredCheck!==s.deadline){expiredCheck=s.deadline;void refresh();}
  }
  async function send(p:Pending){
    if(working.value)return;working.value=true;activeRequestId=p.requestId;error.value='';setPending(p);
    try{
      const isStart=p.kind==='start';
      const res=await fetch(isStart?'/api/story/start':'/api/story/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(isStart?{requestId:p.requestId,restart:!!p.restart}:{id:p.id,node:p.node,kind:p.kind,requestId:p.requestId,...(p.choice?{choice:p.choice}:{})})});
      if(!res.ok){
        if(pending.value?.requestId!==p.requestId)return;
        if(res.status>=400&&res.status<500&&res.status!==408&&res.status!==429){setPending(null);await refresh();if(!notice.value)notice.value='La escena ha cambiado. Hemos recuperado el estado de tu aventura.';return;}
        throw new Error();
      }
      accept(await res.json() as StorySnapshot);
    }catch{if(pending.value?.requestId===p.requestId){connected.value=false;error.value='No pudimos confirmar tu acción. Recupera la conexión y pulsa «Recuperar acción».';}}
    finally{if(activeRequestId===p.requestId){activeRequestId=null;working.value=false;}}
  }
  async function start(restart=false){if(pending.value||working.value)return;stream?.close();stream=null;await send({kind:'start',requestId:crypto.randomUUID(),generation:session.value?.generation??0,restart});}
  async function act(kind:'continue'|'begin'|'choose',choice?:'A'|'B'){
    const s=session.value;if(!s||pending.value||working.value)return;
    await send({kind,id:s.id,node:s.scene.id,requestId:crypto.randomUUID(),...(choice?{choice}:{})});
  }
  async function retry(){if(pending.value)await send(pending.value);else await refresh();}
  function nextPage(){pageIndex.value=Math.min(pageIndex.value+1,Math.max(0,pages.value.length-1));}
  function previousPage(){pageIndex.value=Math.max(0,pageIndex.value-1);}
  watch(pageIndex,()=>{if(session.value)save(pageKey(session.value),String(pageIndex.value));},{flush:'sync'});
  const resume=()=>{if(document.hidden){stream?.close();stream=null;}else void refresh();};
  onMounted(()=>{void refresh();timer=setInterval(updateClock,100);document.addEventListener('visibilitychange',resume);window.addEventListener('online',resume);});
  onUnmounted(()=>{alive=false;stream?.close();if(timer)clearInterval(timer);document.removeEventListener('visibilitychange',resume);window.removeEventListener('online',resume);});
  return {session,loading,working,pending,canRecover,error,notice,pages,pageIndex,remaining,connected,start,refresh,act,retry,nextPage,previousPage};
}
