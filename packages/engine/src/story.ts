import { vagonText } from './vagon-text.js';
import type { StoryChoice,StoryDecision,StoryInput,StoryPlayer,StoryScene,StoryState } from './story-types.js';

export const STORY_VERSION='ultimo-vagon-1';
export const STORY_TITLE='El último vagón';
export const STORY_GOAL='Encontrar a Inés y salir del tren con ella';
const titles:Record<string,string>={S1:'La promesa',S2:'La primera puerta',R1A:'La persona que se queda',R1B:'Lo que queda grabado',R1T:'La puerta cerrada',S4:'Al otro lado del cristal',S5:'Lo que puedes alcanzar',R2A:'Las manos vacías',R2B:'La correa negra',R2T:'El ruido del metal',S7:'El andén de servicio',S8:'La última mano',R3A:'La mano de tu hermana',R3B:'Vidal en el andén',R3C:'El precio de seguirlo',R3T:'El último salto',R3U:'El paso que se pierde',F1:'Lo que sale a la luz',F2:'La persona que trajiste',F3:'La voz que permanece',F4:'El mensaje sin respuesta'};
const cards:Record<string,NonNullable<StoryScene['decision']>>={
  S2:{id:'D1',durationMs:12000,prompt:'El carro atrapa a Mara. Vidal está a punto de cerrar la puerta.',options:[{id:'A',label:'Ayudar a Mara'},{id:'B',label:'Seguir a Vidal'}]},
  S5:{id:'D2',durationMs:10000,prompt:'Inés tiene el pie atrapado. La cámara está junto al fuego. La estantería cede.',options:[{id:'A',label:'Liberar a Inés'},{id:'B',label:'Recuperar la cámara'}]},
  S8:{id:'D3',durationMs:8000,prompt:'Vidal está escapando. El humo va a cerrar el paso. Inés tiene que llegar al andén.',options:[{id:'A',label:'Quedarme con Inés'},{id:'B',label:'Detener a Vidal'}]},
};
const chosen=(p:StoryPlayer,id:StoryDecision['id'])=>p.decisions.find(d=>d.id===id)?.choice;
function facts(p:StoryPlayer){return {mara:chosen(p,'D1')==='A',audio:chosen(p,'D1')==='B',injured:!!chosen(p,'D2')&&chosen(p,'D2')!=='A',camera:chosen(p,'D2')==='B'&&chosen(p,'D3')!=='T',held:chosen(p,'D3')==='B'};}
function ending(p:StoryPlayer){const f=facts(p);const alive=chosen(p,'D3')==='A'||f.mara||!f.injured;return alive?(f.audio||f.camera?'F1':'F2'):(f.audio||f.camera?'F3':'F4');}
export function createStory(at:number,players=[{id:'p1'}]):StoryState{return {version:STORY_VERSION,players:players.map(p=>({id:p.id,node:'S1',phase:'reading',deadline:null,decisions:[]})),revision:0,lastSequence:0,lastAt:at,lastRequestId:null};}
function resolve(state:StoryState,p:StoryPlayer,choice:StoryChoice,at:number,sequence:number){
  const card=cards[p.node];if(!card)throw new Error('No decision here.');
  p.decisions.push({id:card.id,actor:p.id,choice,at,sequence});p.phase='reading';p.deadline=null;
  if(card.id==='D1')p.node='R1'+choice;
  else if(card.id==='D2')p.node='R2'+choice;
  else {const f=facts(p),supported=f.mara||!f.injured;p.node=choice==='A'?'R3A':choice==='B'?(supported?'R3B':'R3C'):(supported?'R3T':'R3U');}
  state.lastSequence=sequence;state.lastAt=at;state.revision++;
}
export function syncStory(input:StoryState,at:number):StoryState {
  if(!Number.isSafeInteger(at)||at<0)throw new Error('Invalid server time.');
  const state=structuredClone(input);
  for(const p of state.players.filter(p=>p.phase==='deciding'&&p.deadline!==null&&at>=p.deadline).sort((a,b)=>a.deadline!-b.deadline!||a.id.localeCompare(b.id)))resolve(state,p,'T',p.deadline!,state.lastSequence+1);
  return state;
}
export function storyStep(input:StoryState,entry:StoryInput):{state:StoryState;ok:boolean;error?:string}{
  const deny=(state:StoryState,message='Esta escena ya ha cambiado. Recupera tu aventura.')=>({state,ok:false,error:message});
  if(!input.players.some(p=>p.id===entry.actor)||!Number.isSafeInteger(entry.at)||entry.at<input.lastAt||!Number.isSafeInteger(entry.sequence)||entry.sequence<=input.lastSequence||!entry.requestId)return deny(input);
  const state=syncStory(input,entry.at),p=state.players.find(p=>p.id===entry.actor)!;
  if(p.node!==entry.node||p.phase==='finished')return deny(state);
  if(entry.kind==='begin'){
    if(!cards[p.node])return deny(state);
    if(p.phase==='reading'){p.phase='deciding';p.deadline=entry.at+cards[p.node]!.durationMs;}
  }else if(entry.kind==='choose'){
    if(p.phase!=='deciding'||!['A','B'].includes(entry.choice??''))return deny(state,'La decisión ya terminó.');
    resolve(state,p,entry.choice!,entry.at,Math.max(state.lastSequence+1,entry.sequence));state.lastRequestId=entry.requestId;return {state,ok:true};
  }else if(entry.kind==='continue'){
    if(p.phase!=='reading'||cards[p.node])return deny(state);
    const next=p.node==='S1'?'S2':p.node.startsWith('R1')?'S4':p.node==='S4'?'S5':p.node.startsWith('R2')?'S7':p.node==='S7'?'S8':p.node.startsWith('R3')?ending(p):null;
    if(!next)return deny(state);p.node=next;if(next.startsWith('F'))p.phase='finished';
  }else return deny(state);
  state.lastSequence=Math.max(state.lastSequence+1,entry.sequence);state.lastAt=entry.at;state.lastRequestId=entry.requestId;state.revision++;return {state,ok:true};
}
export function storyScene(state:StoryState,actor:string):StoryScene {
  const p=state.players.find(p=>p.id===actor);if(!p)throw new Error('Unknown actor.');
  const f=facts(p);let paragraphs=[...(vagonText[p.node]??[])];
  if(p.node==='S4'&&f.mara)paragraphs.push(...vagonText.S4M!);
  if(p.node==='S7')paragraphs.push(...vagonText[f.mara?'S7M':'S7S']!);
  if(p.node==='S8')paragraphs.push(...vagonText[f.mara?'S8M':f.injured?'S8L':'S8P']!);
  const proof=f.camera&&f.audio?'las fotografías y la grabación':f.camera?'las fotografías':'la grabación';
  paragraphs=paragraphs.map(text=>{
    text=text.replace('las fotografías, la grabación o ambas',proof);
    if(/^Si (detuviste a Vidal|lo detuviste en el andén),/.test(text)){
      const pieces=text.split(/(?=Si escapó,|Si se marchó,)/);text=(f.held?pieces[0]!:pieces[1]!).replace(/^Si [^,]+,\s*/,'');text=text[0]!.toUpperCase()+text.slice(1);
    }
    if(p.node==='R3A'&&text.startsWith('Si conservas la cámara'))return [f.camera?'La cámara sigue cruzada sobre tu pecho.':'',f.audio?'La grabación permanece en tu teléfono y en el correo al que la enviaste.':''].filter(Boolean).join(' ');
    if(p.node==='R3B')text=text.replace('con Mara si está contigo, o caminando hacia el empleado si podía hacerlo sin ayuda',f.mara?'apoyada en Mara':'caminando hacia el empleado');
    if(p.node==='R3T'){
      text=text.replace('con Mara si os acompaña, o avanzando por sí misma si podía caminar',f.mara?'apoyada en Mara':'avanzando por sí misma');
      if(text.startsWith('Si llevabas la cámara'))return chosen(p,'D2')==='B'?'La correa de la cámara se engancha en el marco. Tienes que soltar el cierre para salir; el aparato queda dentro.':'Cruzas con las manos vacías.';
      text=text.replace('Cualquier grabación que hubieras enviado sigue guardada.',f.audio?'La grabación que enviaste sigue guardada.':'Lo palpas para comprobar que no lo has perdido.');
    }
    if(p.node==='R3U'&&text.startsWith('Si conservabas la cámara'))return (chosen(p,'D2')==='B'?'La correa de la cámara se engancha al salir. El cierre se abre con el tirón y el aparato queda dentro. ':'')+'Tu teléfono sigue en el bolsillo.'+(f.audio?' La grabación continúa guardada.':'');
    return text;
  }).filter(Boolean);
  const chapter=p.node==='S1'?1:p.node==='S2'?2:p.node.startsWith('R1')?3:p.node==='S4'?4:p.node==='S5'?5:p.node.startsWith('R2')?6:p.node==='S7'?7:p.node==='S8'?8:p.node.startsWith('R3')?9:10;
  return {id:p.node,title:titles[p.node]!,chapter,paragraphs,art:chapter<4?(p.node==='R1A'?1:0):chapter<7?2:3,...(cards[p.node]?{decision:structuredClone(cards[p.node]!)}:{})};
}
export function storyExplanation(state:StoryState,actor:string):string[]{
  const p=state.players.find(p=>p.id===actor)!;const f=facts(p);
  return [chosen(p,'D1')==='A'?'Ayudaste a Mara y se quedó contigo.':chosen(p,'D1')==='B'?'Seguiste a Vidal y grabaste su amenaza. Mara se quedó ayudando a otros pasajeros.':'Se agotó la primera decisión. Mara ayudó a otros pasajeros y no conservaste una grabación.',
    chosen(p,'D2')==='A'?'Liberaste a Inés: podía caminar, pero perdisteis la cámara.':chosen(p,'D2')==='B'?'Recuperaste la cámara. Inés se lesionó y necesitaba ayuda.':'Se agotó la segunda decisión: Inés se lesionó y se perdió la cámara.',
    chosen(p,'D3')==='A'?'Te quedaste con Inés y la acompañaste hasta el andén.':(f.mara||!f.injured)?(chosen(p,'D3')==='B'?'Detuviste a Vidal. Inés pudo salir '+(f.mara?'con Mara.':'por sus medios.'):'Se agotó la última decisión. Inés pudo salir '+(f.mara?'con Mara.':'por sus medios.')+' La cámara no salió del tren.'):(chosen(p,'D3')==='B'?'Al separarte para detener a Vidal, Inés quedó sin la ayuda que necesitaba.':'Se agotó el plazo y no llegaste a sacar a Inés, que no podía caminar sin ayuda.')];
}
