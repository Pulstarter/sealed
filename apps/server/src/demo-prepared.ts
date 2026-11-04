import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type {EmotionalArt} from '../../../packages/engine/src/emotional-types.js';

export interface PreparedAdventure {canonical:string;seal:string;images:{ref:EmotionalArt;bytes:Buffer}[]}
const EXPECTED_SEAL='311a7f2883dec3ad82c058c374582bf189bb49c40bd9c58f4c4c56e3b3b73323';
let reviewed:PreparedAdventure|undefined;
/** Server-only, immutable reviewed material. Never calls a content provider. */
export function reviewedDemo():PreparedAdventure{
 if(reviewed)return reviewed;
 const raw=JSON.parse(readFileSync(new URL('../assets/reviewed-demo.json',import.meta.url),'utf8'));
 const sha=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
 if(raw.seal!==EXPECTED_SEAL||sha(raw.canonical)!==EXPECTED_SEAL)throw Error('Reviewed demo seal does not match');
 const artifact=JSON.parse(raw.canonical);
 if(raw.images.length!==3||artifact.art.length!==3)throw Error('Reviewed illustrations missing');
 const images=raw.images.map((image:{ref:EmotionalArt;base64:string})=>{
  const bytes=Buffer.from(image.base64,'base64'),ref=artifact.art.find((a:EmotionalArt)=>a.id===image.ref.id);
  if(!ref||JSON.stringify(ref)!==JSON.stringify(image.ref)||sha(bytes)!==ref.sha256)throw Error('Reviewed illustration does not match seal');
  return{ref,bytes};
 });
 reviewed={canonical:raw.canonical,seal:raw.seal,images};return reviewed;
}
