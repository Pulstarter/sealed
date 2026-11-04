import type {IncomingMessage,ServerResponse} from 'node:http';
import {createHash,randomBytes} from 'node:crypto';
import {EmotionalService,EmotionalError,type EmotionalOptions} from './emotional-service.js';
import type {EmotionalInput} from '../../../packages/engine/src/emotional-types.js';

const COOKIE='sealed_emotional_owner';
const send=(res:ServerResponse,status:number,value:unknown)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
function validKeys(value:Record<string,unknown>,allowed:string[]){if(Object.keys(value).some(k=>!allowed.includes(k)))throw new EmotionalError(400,'Unexpected input.');}
const requestId=(x:unknown)=>typeof x==='string'&&/^[a-z0-9:_-]{1,100}$/i.test(x);
const id=(x:unknown)=>typeof x==='string'&&/^[a-f0-9-]{36}$/.test(x);
async function readBody(req:IncomingMessage){let size=0;const buffers:Buffer[]=[];for await(const chunk of req){const b=Buffer.from(chunk);size+=b.length;if(size>8192)throw new EmotionalError(413,'Message too long.');buffers.push(b);}if(!req.headers['content-type']?.toLowerCase().startsWith('application/json'))throw new EmotionalError(415,'JSON required.');try{const x:unknown=JSON.parse(Buffer.concat(buffers).toString('utf8'));if(!x||typeof x!=='object'||Array.isArray(x))throw new Error();return x as Record<string,unknown>;}catch{throw new EmotionalError(400,'Invalid JSON.');}}
export class EmotionalHTTP {
  private service:EmotionalService;private streams=new Set<ServerResponse>();private closed=false;
  constructor(file:string,now:()=>number,private publicOrigin?:string,options?:EmotionalOptions,private scope={base:'/api/emotional/',cookie:COOKIE}){this.service=new EmotionalService(file,now,options);}
  private owner(req:IncomingMessage,res:ServerResponse,create=false){
    let secret=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(this.scope.cookie+'='))?.slice(this.scope.cookie.length+1);
    if(!secret||!/^[a-f0-9]{64}$/.test(secret)){if(!create)throw new EmotionalError(401,'Recover your adventure first.');secret=randomBytes(32).toString('hex');}
    res.setHeader('Set-Cookie',`${this.scope.cookie}=${secret}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${this.publicOrigin?.startsWith('https:')?'; Secure':''}`);
    return createHash('sha256').update(secret).digest('hex');
  }
  async route(req:IncomingMessage,res:ServerResponse,url:URL):Promise<boolean>{
    if(!url.pathname.startsWith(this.scope.base))return false;
    let interaction:{owner:string;id:string;requestId:string;operation:'chat'|'confirm'|'action'}|undefined;
    try{
      const path='/api/emotional/'+url.pathname.slice(this.scope.base.length);
      if(req.method==='GET'){
        const owner=this.owner(req,res,path==='/api/emotional/current');
        if(path==='/api/emotional/current'){const item=url.searchParams.get('id');if(item&&!id(item))throw new EmotionalError(400,'Invalid adventure.');send(res,200,{available:this.service.available,release:this.service.release,flow:this.service.current(owner,item??undefined)});return true;}
        if(path==='/api/emotional/memories'){send(res,200,{memories:this.service.memories(owner)});return true;}
        if(path==='/api/emotional/reveal'){const item=url.searchParams.get('id');if(!id(item))throw new EmotionalError(400,'Invalid adventure.');send(res,200,this.service.reveal(owner,item!));return true;}
        const image=path.match(/^\/api\/emotional\/art\/([a-f0-9-]{36})\/(scene|host|recipient)$/);
        if(image){const asset=this.service.art(owner,image[1]!,image[2]!);res.writeHead(200,{'Content-Type':asset.mime,'Content-Length':asset.bytes.length,'Cache-Control':'no-store'});res.end(asset.bytes);return true;}
        if(path==='/api/emotional/events'){
          const initial=this.service.current(owner);if(!initial)throw new EmotionalError(401,'No active adventure.');
          res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store, no-cache, must-revalidate',Connection:'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();this.streams.add(res);res.write(`retry: 2000\nevent: snapshot\ndata: ${JSON.stringify(initial)}\n\n`);
          const timer=setInterval(()=>{if(this.closed||res.destroyed||res.writableEnded)return;try{if(res.writableLength>1048576){res.destroy();return;}res.write(`event: snapshot\ndata: ${JSON.stringify(this.service.current(owner))}\n\n`);}catch{res.end();}},1000);timer.unref();res.once('close',()=>{clearInterval(timer);this.streams.delete(res);});return true;
        }
      }else if(req.method==='POST'){
        const expected=this.publicOrigin?new URL(this.publicOrigin).origin:'http://'+req.headers.host;
        if(req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&req.headers.origin!==expected)throw new EmotionalError(403,'Origin not allowed.');
        const value=await readBody(req);const owner=this.owner(req,res);if(!requestId(value.requestId))throw new EmotionalError(400,'A valid request ID is required.');
        if(path==='/api/emotional/new'){validKeys(value,['requestId']);send(res,201,{flow:this.service.newConversation(owner,value.requestId as string)});return true;}
        if(!id(value.id))throw new EmotionalError(400,'Invalid adventure.');
        const operation=path.slice('/api/emotional/'.length);if(operation==='chat'||operation==='confirm'||operation==='action')interaction={owner,id:value.id as string,requestId:value.requestId as string,operation};
        const revisionHeader=req.headers['if-match'];const revision=typeof revisionHeader==='string'&&/^"\d{1,12}"$/.test(revisionHeader)?Number(revisionHeader.slice(1,-1)):null;
        if((path==='/api/emotional/chat'||path==='/api/emotional/confirm')&&revision===null)throw new EmotionalError(400,'Recover the current proposal or question before continuing.');
        if(path==='/api/emotional/chat'){validKeys(value,['id','text','requestId']);if(typeof value.text!=='string'||!value.text.trim()||value.text.length>1000)throw new EmotionalError(400,'Write a short preference or skip.');send(res,202,{flow:this.service.chat(owner,value.id as string,value.text.trim(),value.requestId as string,revision!)});return true;}
        if(path==='/api/emotional/confirm'){validKeys(value,['id','requestId']);send(res,202,{flow:this.service.confirm(owner,value.id as string,value.requestId as string,revision!)});return true;}
        if(path==='/api/emotional/action'){validKeys(value,['id','node','kind','choice','requestId']);if(typeof value.node!=='string'||!/^[A-Z0-9]{1,12}$/.test(value.node)||!['start','continue','begin','choose'].includes(String(value.kind))||(value.choice!==undefined&&!['A','B'].includes(String(value.choice))))throw new EmotionalError(400,'Invalid action.');send(res,200,{flow:this.service.action(owner,{id:value.id as string,node:value.node,kind:value.kind as EmotionalInput['kind'],choice:value.choice as 'A'|'B'|undefined,requestId:value.requestId as string})});return true;}
      }
      throw new EmotionalError(404,'Not found.');
    }catch(reason){if(interaction){try{this.service.rejected(interaction.owner,interaction.id,interaction.requestId,interaction.operation,reason);}catch{console.error('SEALED could not persist an interaction diagnostic.');}}if(res.headersSent){res.end();return true;}send(res,reason instanceof EmotionalError?reason.status:500,{error:reason instanceof EmotionalError?reason.message:'Your adventure could not be processed. Recover it before trying another action.'});return true;}
  }
  async close(){this.closed=true;for(const stream of this.streams)stream.end();await this.service.close();}
}
