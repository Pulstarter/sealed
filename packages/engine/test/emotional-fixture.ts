import type {EmotionalArtifact,EmotionalWorld} from '../src/emotional-types.js';
import {compileEmotionalFacts} from '../src/emotional.js';

export const fixtureWorld=():EmotionalWorld=>({title:'A paper mystery',player_name:'Alex',host:{name:'Tessa Vale',gesture:'folds a map',public_wish:'a quiet farewell'},recipient:{name:'Ren Cole',gesture:'turns a mug',public_wish:'one ordinary evening'},venue:{name:'map room',atmosphere:'rain and paper',TABLE:'oak table',VIEWING:'window bench',PUBLIC:'pinboard',ARCHIVE_surface:'steel',BOX_surface:'oak'},work:{name:'watercolor',appearance:'flat blue shoreline on thick paper'},record:{name:'Grey envelope',exterior:'closed signed explanation',inside:'PRIVATE ONLY'},private_reason:'Secret motive',public_hook:'Tessa entrusted Alex with the unsigned watercolor; decide how to acknowledge it.',shared_past_memory:'They once counted passing lights and lost count laughing.',public_motif_one:'rain on glass',public_motif_two:'a blank circle',future_question:'Would the unfinished walk wait for slower footsteps?'});
// Synthetic unit-test data; never a fallback or production adventure.
export function emotionalFixture():EmotionalArtifact{
  const content:EmotionalArtifact['blocks']={};
  for(const id of ['S1','S2','S3','ARRA','ARRB','ARRT',...['1','2','3'].flatMap(d=>[... 'ABT'].map(c=>'D'+d+c)),...['1','2','3','4','5','6'].map(n=>'F'+n)])content[id]={text:id==='S1'?'Current scene S1.':id==='S2'?'Future scene S2.':id.startsWith('F')?'Ending '+id+'.':'Visible consequence '+id+'.',claims:[]};
  return {version:'emotional-1',players:[{id:'p1',name:'Alex'}],world:fixtureWorld(),blocks:content,factualText:compileEmotionalFacts(fixtureWorld()),art:[]};
}
