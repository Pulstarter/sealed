import {computed,onMounted,onUnmounted,ref,watch} from 'vue';
import type {EmotionalFlowSnapshot} from '../../../../packages/engine/src/emotional-types.js';
import {acceptEmotionalSnapshot,showEmotionalRecoveryHome,verifyEmotionalSeal,paginateEmotionalScene,readingOffset,pageAtOffset} from '../lib/emotional-presentation.js';
import {paginateStory} from '../lib/story-presentation.js';

type Pending={kind:'new'|'chat'|'confirm'|'start'|'continue'|'begin'|'choose';requestId:string;id?:string;generation?:number;revision?:number;node?:string;choice?:'A'|'B';text?:string};
const KEY='sealed-emotional-pending-v1';
function get(key:string,session=false){try{return(session?sessionStorage:localStorage).getItem(key);}catch{return null;}}
function put(key:string,value:string,session=false){try{(session?sessionStorage:localStorage).setItem(key,value);}catch{/* Server recovery remains available. */}}
function loadPending(key=KEY):Pending|null{try{const p=JSON.parse(get(key,true)??'null') as Pending|null;return p&&['new','chat','confirm','start','continue','begin','choose'].includes(p.kind)&&typeof p.requestId==='string'?p:null;}catch{return null;}}
export function useEmotional(prepared=false){
  const apiBase=prepared?'/api/demo':'/api/emotional',storagePrefix=prepared?'sealed-demo':'sealed-emotional',pendingKey=prepared?'sealed-demo-pending-v1':KEY;
  const flow=ref<EmotionalFlowSnapshot|null>(null),loading=ref(true),working=ref(false),available=ref(false),connected=ref(true),error=ref(''),quotaLimited=ref(false),notice=ref(''),pending=ref<Pending|null>(loadPending(pendingKey)),pageIndex=ref(0),remaining=ref(0),sealVerified=ref<boolean|null>(null),reveal=ref<{canonical:string;hash:string}|null>(null),memories=ref<{id:string;title:string;createdAt:number}[]>([]);
  const recoveryHome=ref(false),release=ref('');
  const memoryId=new URLSearchParams(window.location.search??'').get('memory')??'';
  const initialSeal=ref<string|null>(null),commitmentStored=ref(false);
  const sealMismatch=computed(()=>!!initialSeal.value&&flow.value?.seal!==initialSeal.value);
  const layout=ref<{key:string;source:string;pages:string[][]}|null>(null);
  const sceneKey=(f:EmotionalFlowSnapshot)=>f.id+':'+f.adventure?.scene.id;
  const pages=computed(()=>{const f=flow.value,paragraphs=f?.adventure?.scene.paragraphs??[];return f&&layout.value?.key===sceneKey(f)&&layout.value.source===JSON.stringify(paragraphs)?layout.value.pages:paginateEmotionalScene(paragraphs);});
  let stream:EventSource|null=null,alive=true,receivedAt=0,serverAnchor=0,expired='',activeRequest:string|null=null,timer:ReturnType<typeof setInterval>|undefined;
  const pageKey=(f:EmotionalFlowSnapshot)=>storagePrefix+'-page:'+f.id+':'+f.adventure?.scene.id;
  const positionKey=(f:EmotionalFlowSnapshot)=>storagePrefix+'-position:'+sceneKey(f);
  const noticeKey=(f:EmotionalFlowSnapshot)=>storagePrefix+'-notice:'+sceneKey(f);
  function acknowledgeNotice(){if(notice.value&&flow.value)put(noticeKey(flow.value),'seen');notice.value='';}
  let readingAnchor=0,positioning=false;
  function position(offset:number){readingAnchor=Math.max(0,Math.trunc(offset));positioning=true;pageIndex.value=pageAtOffset(pages.value,readingAnchor);positioning=false;if(flow.value?.adventure)put(positionKey(flow.value),String(readingAnchor));}
  function savedPosition(f:EmotionalFlowSnapshot){const stored=get(positionKey(f));if(stored!==null&&/^\d+$/.test(stored)&&Number.isSafeInteger(Number(stored)))return Number(stored);const oldPage=Math.max(0,Number(get(pageKey(f)))||0);return readingOffset(paginateStory(f.adventure?.scene.paragraphs??[]),oldPage);}
  function layoutReading(nextPages:string[][]){const f=flow.value;if(!f?.adventure)return;const source=f.adventure.scene.paragraphs.filter(p=>p.trim());if(JSON.stringify(nextPages.flat())!==JSON.stringify(source))throw new Error('A page layout must preserve every paragraph.');layout.value={key:sceneKey(f),source:JSON.stringify(f.adventure.scene.paragraphs),pages:nextPages};position(readingAnchor);}
  function setPending(p:Pending|null){pending.value=p;put(pendingKey,p?JSON.stringify(p):'',true);}
  function accept(next:EmotionalFlowSnapshot|null){
    if(!alive)return;if(!next){flow.value=null;return;}if(!acceptEmotionalSnapshot(flow.value,next))return;
    const prior=flow.value,p=pending.value;
    if(p&&(next.lastRequestId===p.requestId||p.kind==='new'&&p.generation!==undefined&&next.generation>p.generation||p.id&&next.id===p.id&&p.node&&next.adventure?.scene.id!==p.node||p.generation!==undefined&&next.generation>p.generation)){
      setPending(null);error.value='';if(activeRequest===p.requestId){activeRequest=null;working.value=false;}
    }
    if(prior?.id!==next.id)recoveryHome.value=false;
    const changed=prior?.id!==next.id||prior.adventure?.scene.id!==next.adventure?.scene.id;
    const sealKey=storagePrefix+'-seal:'+next.id,stored=get(sealKey);
    if(stored&&/^[a-f0-9]{64}$/.test(stored))initialSeal.value=stored;
    else if(prior?.id!==next.id)initialSeal.value=null;
    if(!initialSeal.value&&next.status==='ready'&&next.seal&&/^[a-f0-9]{64}$/.test(next.seal)){initialSeal.value=next.seal;put(sealKey,next.seal);}
    commitmentStored.value=!!initialSeal.value&&get(sealKey)===initialSeal.value;
    const at=performance.now(),sameDeadline=prior?.id===next.id&&next.adventure?.deadline!=null&&prior.adventure?.deadline===next.adventure.deadline;
    serverAnchor=sameDeadline?Math.max(next.serverNow,serverAnchor+Math.max(0,at-receivedAt)):next.serverNow;
    flow.value=next;receivedAt=at;connected.value=true;
    if(changed){position(savedPosition(next));sealVerified.value=null;reveal.value=null;notice.value=next.adventure?.scene.id.match(/^D[123]T$/)&&!get(noticeKey(next))?'The moment passed. This is what happened.':'';}
    if(next.adventure?.phase!=='deciding')expired='';clock();connect();
  }
  function connect(){
    if(!alive||document.hidden||memoryId||!flow.value||['finished','failed'].includes(flow.value.status)){stream?.close();stream=null;return;}
    if(stream)return;stream=new EventSource(apiBase+'/events');stream.addEventListener('snapshot',event=>{try{accept(JSON.parse((event as MessageEvent<string>).data) as EmotionalFlowSnapshot);}catch{connected.value=false;}});stream.addEventListener('error',()=>{connected.value=false;});
  }
  async function refresh(){
    const initial=loading.value;
    try{const response=await fetch(apiBase+'/current'+(memoryId?'?id='+encodeURIComponent(memoryId):''),{cache:'no-store'});if(!response.ok)throw Error('Your adventure could not be recovered.');const data=await response.json() as {available:boolean;release?:string;flow:EmotionalFlowSnapshot|null};available.value=data.available;release.value=data.release??'';accept(data.flow);if(initial&&flow.value?.id===data.flow?.id)recoveryHome.value=showEmotionalRecoveryHome(data.flow,!!pending.value,memoryId);connected.value=true;if(!pending.value){error.value='';quotaLimited.value=false;}}
    catch{quotaLimited.value=false;connected.value=false;error.value='We could not reconnect. Your saved choices stay on the server.';}finally{loading.value=false;}
  }
  function clock(){const s=flow.value,a=s?.adventure;if(!s||a?.deadline==null){remaining.value=0;return;}remaining.value=Math.max(0,a.deadline-(serverAnchor+performance.now()-receivedAt));const key=s.id+':'+a.deadline;if(remaining.value===0&&expired!==key){expired=key;void refresh();}}
  async function send(p:Pending){
    if(working.value)return;working.value=true;activeRequest=p.requestId;error.value='';quotaLimited.value=false;setPending(p);
    const endpoint=p.kind==='new'?'new':p.kind==='chat'?'chat':p.kind==='confirm'?'confirm':'action';
    const body=endpoint==='new'?{requestId:p.requestId}:endpoint==='chat'?{id:p.id,text:p.text,requestId:p.requestId}:endpoint==='confirm'?{id:p.id,requestId:p.requestId}:{id:p.id,node:p.node,kind:p.kind,choice:p.choice,requestId:p.requestId};
    try{const response=await fetch(apiBase+'/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json',...((p.kind==='chat'||p.kind==='confirm')&&p.revision!==undefined?{'If-Match':'"'+p.revision+'"'}:{})},body:JSON.stringify(body)});const data=await response.json() as {flow?:EmotionalFlowSnapshot;error?:string};
      if(!response.ok){if(pending.value?.requestId!==p.requestId)return;if(response.status>=400&&response.status<500&&response.status!==408){setPending(null);await refresh();quotaLimited.value=response.status===429;error.value=data.error??'This action is no longer available.';return;}throw Error();}
      if(data.flow)accept(data.flow);
    }catch{if(pending.value?.requestId===p.requestId){connected.value=false;error.value='We could not confirm your last action. Recover it before choosing again.';}}
    finally{if(activeRequest===p.requestId){activeRequest=null;working.value=false;}}
  }
  async function newAdventure(){if(pending.value||working.value||memoryId)return;stream?.close();stream=null;await send({kind:'new',requestId:crypto.randomUUID(),generation:flow.value?.generation??0});}
  async function answer(text:string){const f=flow.value;if(!f||working.value||pending.value||!text.trim())return;await send({kind:'chat',id:f.id,generation:f.generation,revision:f.revision,text,requestId:crypto.randomUUID()});}
  async function confirm(){const f=flow.value;if(!f||working.value||pending.value)return;await send({kind:'confirm',id:f.id,generation:f.generation,revision:f.revision,requestId:crypto.randomUUID()});}
  async function act(kind:'start'|'continue'|'begin'|'choose',choice?:'A'|'B'){const f=flow.value;if(!f?.adventure||working.value||pending.value||memoryId)return;if(kind==='continue')acknowledgeNotice();await send({kind,id:f.id,generation:f.generation,node:f.adventure.scene.id,choice,requestId:crypto.randomUUID()});}
  function dismissError(){error.value='';quotaLimited.value=false;}
  async function retry(){if(pending.value)await send(pending.value);else await refresh();}
  async function openEnvelope(){const f=flow.value;if(!f||f.status!=='finished')return;try{const r=await fetch(apiBase+'/reveal?id='+f.id,{cache:'no-store'});if(!r.ok)throw Error();const data=await r.json() as {canonical:string;hash:string};sealVerified.value=await verifyEmotionalSeal(data.canonical,data.hash)&&data.hash===initialSeal.value&&data.hash===f.seal;reveal.value=data;}catch{quotaLimited.value=false;error.value='The envelope could not be verified. Reconnect and try again.';}}
  async function loadMemories(){try{const r=await fetch(apiBase+'/memories',{cache:'no-store'});if(r.ok)memories.value=(await r.json() as {memories:typeof memories.value}).memories;}catch{quotaLimited.value=false;error.value='Your memories could not be loaded. Reconnect and try again.';}}
  function nextPage(){acknowledgeNotice();pageIndex.value=Math.min(pageIndex.value+1,Math.max(0,pages.value.length-1));}function previousPage(){acknowledgeNotice();pageIndex.value=Math.max(0,pageIndex.value-1);}
  watch(pageIndex,()=>{if(flow.value?.adventure&&!positioning){readingAnchor=readingOffset(pages.value,pageIndex.value);put(positionKey(flow.value),String(readingAnchor));put(pageKey(flow.value),String(pageIndex.value));}},{flush:'sync'});
  function resume(){if(document.hidden){stream?.close();stream=null;}else void refresh();}
  onMounted(()=>{void refresh();timer=setInterval(clock,100);document.addEventListener('visibilitychange',resume);window.addEventListener('online',resume);});
  onUnmounted(()=>{alive=false;stream?.close();if(timer)clearInterval(timer);document.removeEventListener('visibilitychange',resume);window.removeEventListener('online',resume);});
  return{apiBase,flow,loading,working,available,connected,error,recoveryHome,release,inspectPreparation:()=>{recoveryHome.value=false;},quotaLimited,notice,pending,pageIndex,pages,remaining,sealVerified,reveal,initialSeal,commitmentStored,sealMismatch,memories,memoryId,newAdventure,answer,confirm,act,retry,dismissError,refresh,nextPage,previousPage,layoutReading,openEnvelope,loadMemories};
}
