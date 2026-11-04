import {story3c} from '../../../packages/engine/test/emotional-story-fixture.js';
import {fixtureWorld} from '../../../packages/engine/test/emotional-fixture.js';
import type {EmotionalProfile} from '../../../packages/engine/src/emotional-types.js';
export const testProfile:EmotionalProfile={mood:'tired',direction:'accompany',experience:'quiet mystery',exclusions:['graphic violence'],intensity:'gentle'};
// Encode synthetic stories into the selected writer revision; never used in production.
export const response=(value:unknown,model='muse-spark-1.3',format:'sentences'|'flat'|'nested'|'attributed'|'paired'='flat')=>{
 let wire=value;if(value&&typeof value==='object'&&'paragraphs' in value&&format!=='nested'){
  const p=(value as {paragraphs:Record<string,string>}).paragraphs;
  wire=format==='paired'?Object.fromEntries(Object.entries(p).map(([k,text])=>[k,{voice:'NARRATOR>NONE',text}])):format==='attributed'?Object.fromEntries(Object.entries(p).map(([k,text])=>[k,{speaker:'NARRATOR',addressee:'NONE',text}])):format==='flat'?p:Object.fromEntries(Object.entries(p).flatMap(([key,text])=>{const words=text.split(' '),size=Math.ceil(words.length/3);return [1,2,3].map((n)=>[key+'s'+n,words.slice((n-1)*size,n*size).join(' ')||'.']);}));
 }
 return new Response(JSON.stringify({model,choices:[{finish_reason:'stop',message:{content:JSON.stringify(wire)}}],usage:{prompt_tokens:100,completion_tokens:200,total_tokens:300}}),{status:200});
};
const paragraph=(id:string,i:number,flat=false,short=false,sentences=false,paragraphWords?:number)=>{
 const words='Rain rested against the glass while Alex considered the quiet room and the small blue painting in their care. A remembered afternoon brought an ordinary warmth then left enough distance for a question to remain gently unanswered.'.split(' ');
 if(flat)words.splice(paragraphWords!==undefined?paragraphWords-3:short?23:sentences?30:34);
 for(const index of [30,20,10])words.splice(index,0,id+'-'+i+'-'+index);
 return words.join(' ');
};
export function providerFixture(options:{badBlock?:string;alwaysBad?:boolean;shortParagraphs?:boolean;paragraphWords?:number}={}){
  const visits=new Map<string,number>();
  return (async(_url:unknown,init?:RequestInit)=>{const req=JSON.parse(String(init?.body));const payload=JSON.parse(req.messages[1].content);if(payload.task==='world'){const w=fixtureWorld();const {public_hook,...draft}=w;const {TABLE,VIEWING,PUBLIC,...venue}=w.venue;const {inside,...record}=w.record;return response({...draft,host:{...draft.host,gesture:'tilts their head'},recipient:{...draft.recipient,gesture:'raises an eyebrow'},venue,record,...(req.response_format.json_schema.schema.properties.future_question.enum?{future_question:'care'}:{}),...(req.response_format.json_schema.schema.properties.work.properties.visual?{work:{name:draft.work.name,visual:{material:'flat watercolor on thick paper',subject:'A blue shoreline and a white lighthouse.',figures:'none',detail_one:'A blue band follows the lower edge.',detail_two:'A grey cloud hangs above the lighthouse.',detail_three:'The white tower has a square window.'}}}:{}),...(req.response_format.json_schema.schema.properties.story?{story:{...story3c,...(req.response_format.json_schema.schema.properties.story.properties.tension.enum?{tension:'from_wishes'}:{}),...(req.response_format.json_schema.schema.properties.work.properties.visual?{scene_three:'detail_two'}:{}),...(payload.admission_contract?{scene_two:'I wanted someone to stay with it a minute.'}:{})}}:{})},req.model);}
    const id=payload.block,n=payload.paragraphs;visits.set(id,(visits.get(id)??0)+1);const bad=id===options.badBlock&&(options.alwaysBad||visits.get(id)===1);
    if(payload.reaction_contract==='present-reactions-1'||payload.reaction_contract==='outcome-reactions-1'||payload.reaction_contract==='outcome-reactions-2'){
     const wire:Record<string,string>={},words='feels uncertain and quietly relieved while a personal unease remains tender and genuine without a neat answer or an easy reassurance'.split(' ');
     for(let i=0;i<n;i++){
      const key='p'+String(i+1).padStart(2,'0'),narrator=payload.paragraph_plan['p'+(i+1)]==='NARRATOR>NONE',count=options.paragraphWords??Math.round(payload.target_words/n*(options.shortParagraphs?.65:1));
      const start=narrator?payload.protagonist+' feels':'I feel',body=Array.from({length:Math.max(8,(narrator?count:Math.min(35,count))-2)},(_,j)=>j%5===0?id+'x'+i+'x'+j:words[j%words.length]).join(' ');
      wire[key+'_text']=bad?'This plot branch tells the reader about the schema.':start+' '+body+'.';
      if(!narrator){wire[key+'_lead']='';wire[key+'_tail']='';}
     }return response(wire,req.model);
    }
    // Structural fixture for free-form scenes: honours the requested total; not editorial evidence.
    if(payload.projection?.context?.scene_beats){
     const wire:Record<string,string>={},pool='Rain softened the light as Alex considered an ordinary evening with care and a different understanding of what another person might want from this small gesture'.split(' ');
     for(let i=0;i<n;i++){
      const k='p'+String(i+1).padStart(2,'0'),narrator=payload.paragraph_plan['p'+(i+1)]==='NARRATOR>NONE';
      const count=options.paragraphWords??Math.round(payload.target_words/n*(options.shortParagraphs?.65:1));
      const text=bad?'This plot branch tells the reader about the schema.':Array.from({length:Math.max(8,count-(narrator?0:9))},(_,j)=>j%5===0?id+'x'+i+'x'+j:pool[j%pool.length]).join(' ')+'.';
      wire[k+'_text']=narrator?text:'That concern feels different now '+id+'x'+i+' spoken.';
      if(!narrator){wire[k+'_lead']=req.response_format.json_schema.schema.properties[k+'_lead'].enum?'':text;wire[k+'_tail']='';}
     }return response(wire,req.model);
    }
    if(req.response_format.json_schema.schema.properties.p01_observation){const wire:Record<string,string>={};for(let i=0;i<n;i++){const k='p'+String(i+1).padStart(2,'0'),narrator=payload.paragraph_plan['p'+(i+1)]==='NARRATOR>NONE';if(narrator){const text=bad?'This plot branch tells the reader about the schema.':paragraph(id,i,true,options.shortParagraphs,false,options.paragraphWords??26),words=text.split(' '),half=Math.ceil(words.length/2);wire[k+'_observation']=words.slice(0,half).join(' ');wire[k+'_response']=words.slice(half).join(' ');}else{wire[k+'_lead']=bad?'This plot branch tells the reader about the schema.':paragraph(id,i,true,options.shortParagraphs,false,options.paragraphWords??17);wire[k+'_text']='That blue '+id+'-'+i+' looks different in this light.';wire[k+'_tail']='';}}return response(wire,req.model);}
    if(req.response_format.json_schema.schema.properties.p01_text){const wire:Record<string,string>={};for(let i=0;i<n;i++){const key='p'+String(i+1).padStart(2,'0'),narrator=payload.paragraph_plan['p'+(i+1)]==='NARRATOR>NONE';const text=bad?'This plot branch tells the reader about the schema.':paragraph(id,i,true,options.shortParagraphs,false,options.paragraphWords??(options.shortParagraphs?20:narrator?26:17));wire[key+'_text']=narrator?text:'That blue '+id+'-'+i+' looks different in this light.';if(!narrator){wire[key+'_lead']=text;wire[key+'_tail']='';}}return response(wire,req.model);}
    if(req.response_format.json_schema.schema.properties.p1?.properties?.lead){const wire=Object.fromEntries(Array.from({length:n},(_,i)=>{const key='p'+(i+1),narrator=req.response_format.json_schema.schema.properties[key].properties.lead.enum;const perParagraph=payload.bounded_narration?(narrator?26:17):27;const text=bad?'This plot branch tells the reader about the schema.':paragraph(id,i,true,options.shortParagraphs,false,options.paragraphWords??(options.shortParagraphs?20:perParagraph));return[key,narrator?{lead:'',text,tail:''}:{lead:text,text:'That blue '+id+'-'+i+' looks different in this light.',tail:''}];}));return response(wire,req.model);}
    return response({paragraphs:Object.fromEntries(Array.from({length:n},(_,i)=>['p'+(i+1),bad?'This plot branch tells the reader about the schema.':paragraph(id,i,!!(req.response_format.json_schema.schema.properties.p1||req.response_format.json_schema.schema.properties.p1s1),options.shortParagraphs,!!req.response_format.json_schema.schema.properties.p1s1,options.paragraphWords??(req.response_format.json_schema.schema.properties.p1?.properties?.voice?28:undefined))])), ...(req.response_format.json_schema.schema.properties.claims?{claims:[]}:{})},req.model,req.response_format.json_schema.schema.properties.p1?.properties?.voice?'paired':req.response_format.json_schema.schema.properties.p1?.type==='object'?'attributed':req.response_format.json_schema.schema.properties.paragraphs?'nested':req.response_format.json_schema.schema.properties.p1s1?'sentences':'flat');
  }) as typeof fetch;
}

