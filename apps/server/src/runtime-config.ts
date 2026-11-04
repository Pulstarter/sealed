import { readFileSync } from 'node:fs';
import type { GenerationOptions } from './preparations.js';
import type {EmotionalOptions} from './emotional-service.js';
export function runtimeGeneration(env:Record<string,string|undefined>):GenerationOptions|undefined{
  if(env.META_GENERATION_ENABLED!=='1')return;
  let key=env.MODEL_API_KEY??'';
  if(!key&&env.MODEL_API_KEY_FILE){try{key=readFileSync(env.MODEL_API_KEY_FILE,'utf8').trim();}catch{throw new Error('Meta generation requires readable server credentials.');}}
  if(!key.trim()||/[\r\n]/.test(key))throw new Error('Meta generation requires valid server credentials.');
  function limit(name:string,fallback:number){const raw=env[name]??String(fallback);const value=Number(raw);if(!/^\d+$/.test(raw)||!Number.isSafeInteger(value)||value<1)throw new Error('Invalid Meta generation limit.');return value;}
  return {apiKey:key,maxJobs:limit('META_GENERATION_MAX_JOBS',100),dailyJobs:limit('META_GENERATION_DAILY_JOBS',20),ownerDailyJobs:limit('META_GENERATION_OWNER_DAILY_JOBS',3)};
}
export function runtimeEmotional(env:Record<string,string|undefined>):EmotionalOptions|undefined{
  if(env.META_EMOTIONAL_ENABLED!=='1')return;
  let apiKey=env.MODEL_API_KEY??'';
  if(!apiKey&&env.MODEL_API_KEY_FILE){try{apiKey=readFileSync(env.MODEL_API_KEY_FILE,'utf8').trim();}catch{throw new Error('Emotional generation requires readable server credentials.');}}
  if(!apiKey.trim()||/[\r\n]/.test(apiKey))throw new Error('Emotional generation requires valid server credentials.');
  function limit(name:string,fallback:number,decimal=false){const text=env[name]??String(fallback),n=Number(text);if(!(decimal?/^\d+(?:\.\d{1,6})?$/:/^\d+$/).test(text)||!Number.isFinite(n)||n<=0||!decimal&&!Number.isSafeInteger(n))throw new Error('Invalid emotional preparation limit.');return n;}
  return{apiKey,maxJobs:limit('META_EMOTIONAL_MAX_JOBS',20),dailyJobs:limit('META_EMOTIONAL_DAILY_JOBS',5),ownerDailyJobs:limit('META_EMOTIONAL_OWNER_DAILY_JOBS',3),dailyEstimateUsd:limit('META_EMOTIONAL_DAILY_ESTIMATE_USD',5,true)};
}
