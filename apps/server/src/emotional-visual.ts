import type {EmotionalWorld} from '../../../packages/engine/src/emotional-types.js';
import {emotionalScopes,emotionalProjection} from '../../../packages/engine/src/emotional.js';
import {firstNameIsUnambiguous} from './emotional-identities.js';

export function sharedCameraNames(w:EmotionalWorld,id:string){
 const active=w.narrationPolicy==='protagonist-camera-1'||w.narrationPolicy==='protagonist-camera-2'||w.narrationPolicy==='protagonist-camera-3'||w.narrationPolicy==='protagonist-camera-4'||w.narrationPolicy==='protagonist-camera-5';
 if(!active)return[];
 const present=(w.narrationPolicy==='protagonist-camera-2'||w.narrationPolicy==='protagonist-camera-3'||w.narrationPolicy==='protagonist-camera-4'||w.narrationPolicy==='protagonist-camera-5')?emotionalProjection(w,id).allowed_named_current_actors:null;
 if(!present&&emotionalScopes[id]!.facts.guest_at_VIEWING!==undefined)return[];
 const identities=[w.player_name,w.host.name,w.recipient.name];
 return [['HOST',w.host.name],['RECIPIENT',w.recipient.name]].filter(([role])=>!present?.includes(role!)).flatMap(([,name])=>firstNameIsUnambiguous(name!,identities)?[name!,name!.split(' ')[0]!]:[name!]);
}
// A single-token proper name keeps its case: Mark/Will/May must not forbid
// ordinary lower-case words. Full identities remain case-insensitive.
export const containsCameraName=(names:string[],text:string)=>names.some(name=>new RegExp('(?:^|[^\\p{L}])'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![\\p{L}])',/\s/u.test(name)?'iu':'u').test(text));

const people='(?:human\\s+figures?|figures?|people|persons?|men|women|man|woman|passengers?|travelers?|travellers?|children|child|crowd)';
const depicted='(?:image|picture|painting|drawing|sketch|watercolou?r|print|sheet)';
const negative=new RegExp('\\b(?:no|without(?:\\s+any)?)\\s+'+people+'(?:\\s+(?:or|and)\\s+(?:any\\s+)?'+people+')*\\b','giu');
const observer=/\b(?:look(?:s|ed|ing)?\s+at|stud(?:y|ies|ied|ying)|watch(?:es|ed|ing)?|gaz(?:e|es|ed|ing)\s+at|read(?:s|ing)?)\b/iu;
const numberValues:Record<string,number>={one:1,two:2,three:3,four:4,five:5,six:6};

function depictedClaims(text:string){
 const attributed=new RegExp('\\b(?:rendered|painted|drawn|sketched|depicted|inked)\\s+(?:[\\p{L}-]+\\s+){0,3}'+people+'\\b','iu').test(text);
 const located=[...text.matchAll(new RegExp('\\b'+people+'\\b[^.!?]{0,75}\\b(?:in|inside|within|across)\\s+(?:(?:the|this|that)\\s+)?'+depicted+'\\b','giu'))].some(m=>!observer.test(m[0]));
 const shown=new RegExp('\\b'+depicted+'\\b[^.!?]{0,35}\\b(?:show(?:s|ed)?|depicts?|depicted|contains?|contained|holds?|held)\\b[^.!?]{0,70}\\b'+people+'\\b','iu').test(text);
 return attributed||located||shown;
}

/** Bounded literal checks supplement, rather than replace, complete editorial review. */
export function visualIssues(w:EmotionalWorld,text:string,source=false,visible=true):string[]{
 const v=w.work.visual;if(!v)return[];
 const problems:string[]=[];
 for(const paragraph of text.split(/\n\s*\n/u)){
  const positive=paragraph.replace(negative,'no depicted occupants');
  const claims=depictedClaims(positive);
  const direct=source&&new RegExp('\\b'+people+'\\b','iu').test(positive);
  const expected=v.figures==='none'?0:v.figures==='one'?1:2;
  if(expected===0&&(claims||direct))problems.push('The immutable visual catalogue depicts no people. Do not add a rendered figure, passenger or other depicted person.');
  if(expected>0&&(source||depictedClaims(paragraph))&&/\b(?:no|without(?:\s+any)?)\s+(?:human\s+figures?|figures?|people|persons?)\b/iu.test(paragraph))problems.push('The immutable visual catalogue includes human figures; do not claim that none are depicted.');
  if(claims||direct)for(const match of positive.matchAll(new RegExp('\\b(?:(exactly|only|a single)\\s+)?(one|two|three|four|five|six|[1-9])?\\s*'+people+'\\b','giu'))){
   const count=match[1]?.toLowerCase()==='a single'?1:numberValues[match[2]?.toLowerCase()??'']??Number(match[2]);
   if(count>expected||(!!match[1]&&count!==expected))problems.push('The immutable visual catalogue figure count contradicts this depicted count.');
  }
  if(!visible&&claims)problems.push('The deposited work is not visible. Do not describe its current depicted figures.');
 }
 return [...new Set(problems)];
}

export function visualWorldIssues(w:EmotionalWorld):string[]{
 const v=w.work.visual;if(!v)return[];
 if(!['none','one','two'].includes(v.figures))return['Invalid visual figure count.'];
 // Occupancy belongs to its dedicated field; avoid contradictory shorthand
 // in the scene title (an "empty shelter" containing its one waiting person).
 const occupancySubject=v.subject.replace(/\bempty[-\u2010-\u2015]seeming\b/giu,'sparse');
 if(v.figures!=='none'&&/\b(?:empty|deserted|unpeopled|unoccupied)\b/iu.test(occupancySubject))return['Visual catalogue subject must not assert emptiness when human figures are present.'];
 const fields=[v.material,v.subject,v.detail_one,v.detail_two,v.detail_three];
 if(fields.some(text=>typeof text!=='string'||!text.trim()||text.length>240||(text.match(/[\p{L}\p{N}]+/gu)?.length??0)>24))return['Visual catalogue fields must be concise, nonempty observations.'];
 return fields.flatMap(text=>visualIssues(w,text,true));
}

export function futureReceiptIssue(text:string):boolean{
 const claim=/\b(?:will|would|was going to)\s+(?:receive|collect|retrieve|get|take|read)\s+(?:(?:the|this|that|their|his|her)\s+)?(?:it|work|drawing|painting|sketch|piece|gift|explanation|note|paper)\b/giu;
 return [...text.matchAll(claim)].some(m=>{
  const before=text.slice(0,m.index).split(/[.!?;\n]|\b(?:but|yet|and|while|whereas|although|though)\b/iu).at(-1)??'';
  return !/\b(?:whether|if|hoped|hopes|wished|wishes|might|perhaps|maybe)\b/iu.test(before);
 });
}

export function workAwarenessIssue(text:string):boolean{
 return [...text.matchAll(/\bunaware\s+of\s+(?:(?:the|this|that)\s+)?(?:work|picture|drawing|painting|sketch)\b/giu)].some(m=>{
  const tail=text.slice(m.index!+m[0].length);
  // Not knowing a reason, detail or private meaning is allowed; not knowing
  // the picture exists contradicts the public setup.
  if(/^[’']s\s+(?!existence\b)/iu.test(tail))return false;
  if(/^\s+(?:(?:private|hidden|intended|true)\s+)?(?:meaning|motive|reason|purpose|past|origin|history|significance|detail)\b/iu.test(tail))return false;
  return true;
 });
}
