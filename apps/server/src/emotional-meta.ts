import {performance} from 'node:perf_hooks';

export type MetaModel='muse-spark-1.3'|'muse-wonder-1.0';
export interface MetaReceipt {key:string;model:string;startedAt:number;latencyMs:number;status:'complete'|'rejected'|'uncertain';inputTokens:number|null;outputTokens:number|null;estimatedCostUsd:number|null;reservedCostUsd:number;issue?:string}
export interface MetaRequest {key:string;model:MetaModel;instructions:string;payload:unknown;schema:Record<string,unknown>;maxTokens:number}
export interface MetaOptions {
  apiKey:string;fetch?:typeof fetch;signal?:AbortSignal;
  onStart?:(request:MetaRequest|ImageRequest,reservation:number)=>void|Promise<void>;
  onFinish?:(receipt:MetaReceipt,raw?:unknown)=>void|Promise<void>;
}
export interface ImageRequest {key:string;model:'muse-image-1.0';prompt:string}
export class MetaError extends Error {constructor(message:string,readonly receipt?:MetaReceipt){super(message);this.name='MetaError';}}
export const objectSchema=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
export const stringSchema={type:'string'};
const obj=(x:unknown):Record<string,any>=>x!==null&&typeof x==='object'&&!Array.isArray(x)?x as Record<string,any>:{};
function conforms(s:Record<string,any>,x:unknown,depth=0):boolean{
  if(depth>40)return false;
  if(s.type==='object'){const v=obj(x);if(x===null||typeof x!=='object'||Array.isArray(x))return false;const props=obj(s.properties);return(s.required??[]).every((k:string)=>k in v)&&(s.additionalProperties!==false||Object.keys(v).every(k=>k in props))&&Object.entries(v).every(([k,v])=>!props[k]||conforms(props[k],v,depth+1));}
  if(s.type==='array')return Array.isArray(x)&&x.length<=1000&&x.every(v=>conforms(s.items,v,depth+1));
  if(s.type==='string')return typeof x==='string'&&(!s.enum||s.enum.includes(x));
  if(s.type==='boolean')return typeof x==='boolean';
  if(s.type==='number'||s.type==='integer')return typeof x==='number'&&Number.isFinite(x)&&(s.type!=='integer'||Number.isSafeInteger(x));
  return false;
}
function credentials(options:MetaOptions){if(!options.apiKey.trim()||/[\r\n]/.test(options.apiKey))throw new MetaError('Meta credentials are not configured.');}
function usageNumber(x:unknown){return typeof x==='number'&&Number.isSafeInteger(x)&&x>=0?x:null;}
export async function completeMeta(spec:MetaRequest,options:MetaOptions):Promise<{value:unknown;receipt:MetaReceipt}>{
  credentials(options);
  const rate=spec.model==='muse-wonder-1.0'?{input:4,output:20}:{input:1.25,output:4.25};
  const request={model:spec.model,reasoning_effort:'minimal',max_completion_tokens:spec.maxTokens,stream:false,messages:[{role:'developer',content:spec.instructions},{role:'user',content:JSON.stringify(spec.payload)}],response_format:{type:'json_schema',json_schema:{name:'sealed_emotional',strict:true,schema:spec.schema}}};
  const reservation=(Buffer.byteLength(JSON.stringify(request))*rate.input+spec.maxTokens*rate.output)/1e6;
  await options.onStart?.(spec,reservation);
  const receipt:MetaReceipt={key:spec.key,model:spec.model,startedAt:Date.now(),latencyMs:0,status:'uncertain',inputTokens:null,outputTokens:null,estimatedCostUsd:null,reservedCostUsd:reservation};
  const start=performance.now();let raw:unknown,reported=false;
  try{
    const res=await(options.fetch??fetch)('https://api.meta.ai/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+options.apiKey,'Content-Type':'application/json'},body:JSON.stringify(request),signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(180000)]):AbortSignal.timeout(180000)});
    if(!res.ok){receipt.status='rejected';throw new MetaError('Meta HTTP '+res.status+'. No automatic retry.');}
    const text=await res.text();if(text.length>1_000_000)throw new MetaError('Meta response exceeded the content limit.');
    raw=JSON.parse(text);const data=obj(raw),usage=obj(data.usage);receipt.inputTokens=usageNumber(usage.prompt_tokens);receipt.outputTokens=usageNumber(usage.completion_tokens);
    if(receipt.inputTokens!==null&&receipt.outputTokens!==null)receipt.estimatedCostUsd=(receipt.inputTokens*rate.input+receipt.outputTokens*rate.output)/1e6;
    receipt.status='rejected';const c=obj(data.choices?.[0]),m=obj(c.message);
    if(data.model!==spec.model||c.finish_reason!=='stop'||typeof m.content!=='string')throw new MetaError('Meta response was incomplete or from an unexpected model.');
    const value:unknown=JSON.parse(m.content);if(!conforms(spec.schema,value))throw new MetaError('Meta JSON did not conform to the requested contract.');
    if(receipt.estimatedCostUsd===null)throw new MetaError('Meta usage could not be accounted for.');
    receipt.status='complete';receipt.latencyMs=Math.round(performance.now()-start);reported=true;await options.onFinish?.(receipt,raw);return {value,receipt};
  }catch(reason){
    receipt.latencyMs=Math.round(performance.now()-start);receipt.issue=reason instanceof MetaError?reason.message:'Meta transport or response failed; charge status may be uncertain. No automatic retry.';
    if(!reported)await options.onFinish?.(receipt,raw);throw new MetaError(receipt.issue,receipt);
  }
}

export async function createMetaIllustration(key:string,prompt:string,options:MetaOptions):Promise<{bytes:Buffer;mime:'image/webp'|'image/png'|'image/jpeg';receipt:MetaReceipt}>{
  credentials(options);await options.onStart?.({key,model:'muse-image-1.0',prompt},.01);
  const receipt:MetaReceipt={key,model:'muse-image-1.0',startedAt:Date.now(),latencyMs:0,status:'uncertain',inputTokens:null,outputTokens:null,estimatedCostUsd:null,reservedCostUsd:.01};let raw:unknown,reported=false;const start=performance.now();
  try{
    const res=await(options.fetch??fetch)('https://api.meta.ai/v1/images/generations',{method:'POST',headers:{Authorization:'Bearer '+options.apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:'muse-image-1.0',prompt,n:1,response_format:'b64_json',output_format:'webp',reasoning_strength:'low',tool_enablement:{enable_image_search:false,enable_web_search:false,enable_shell:false}}),signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(180000)]):AbortSignal.timeout(180000)});
    if(!res.ok){receipt.status='rejected';throw new MetaError('Meta image HTTP '+res.status+'. No automatic retry.');}
    const text=await res.text();if(text.length>20_000_000)throw new MetaError('Image response exceeded the limit.');raw=JSON.parse(text);const data=obj(raw),encoded=data.data?.[0]?.b64_json;
    receipt.status='rejected';if(typeof encoded!=='string'||!encoded.length||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw new MetaError('Meta did not return image bytes.');
    const bytes=Buffer.from(encoded,'base64');const format=data.output_format;const valid=format==='webp'?bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP':format==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):format==='jpeg'?bytes[0]===255&&bytes[1]===216:false;
    if(!valid||bytes.length<32||bytes.length>12_000_000)throw new MetaError('Meta image format could not be verified.');
    receipt.estimatedCostUsd=.01;receipt.status='complete';receipt.latencyMs=Math.round(performance.now()-start);reported=true;await options.onFinish?.(receipt,{...data,data:[{bytes:bytes.length}]});return {bytes,mime:format==='jpeg'?'image/jpeg':format==='png'?'image/png':'image/webp',receipt};
  }catch(reason){receipt.latencyMs=Math.round(performance.now()-start);receipt.issue=reason instanceof MetaError?reason.message:'Meta image transport failed; charge status unknown. No automatic retry.';if(!reported)await options.onFinish?.(receipt,raw);throw new MetaError(receipt.issue,receipt);}
}
