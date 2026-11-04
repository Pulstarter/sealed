import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {dirname} from 'node:path';
import type {EmotionalProfile,EmotionalState,EmotionalArt} from '../../../packages/engine/src/emotional-types.js';
import type {EmotionalMessage} from './emotional-chat.js';
import type {GenerationCheckpoint} from './emotional-generation.js';
import type {MetaReceipt,MetaRequest,ImageRequest} from './emotional-meta.js';
import type {EmotionalEventKind} from './emotional-diagnostic.js';

export type EmotionalStatus='chat'|'chatting'|'proposal'|'queued'|'generating'|'ready'|'playing'|'finished'|'failed';
export interface EmotionalRecord {
  id:string;ownerHash:string;generation:number;createdAt:number;updatedAt:number;revision:number;status:EmotionalStatus;confirmedAt:number|null;
  messages:EmotionalMessage[];profile:EmotionalProfile;checkpoint:GenerationCheckpoint;canonical:string|null;seal:string|null;
  state:EmotionalState|null;lastRequestId:string;error:string|null;
}
type Row=Record<string,any>;
export class EmotionalStore {
  private db:DatabaseSync;private inTransaction=false;
  constructor(file:string,private release='development'){
    if(file!==':memory:')mkdirSync(dirname(file),{recursive:true,mode:0o700});this.db=new DatabaseSync(file);if(file!==':memory:')chmodSync(file,0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS emotional_flows(id TEXT PRIMARY KEY,owner_hash TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,status TEXT NOT NULL,confirmed_at INTEGER,payload TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS emotional_owner ON emotional_flows(owner_hash,created_at);
      CREATE TABLE IF NOT EXISTS emotional_requests(owner_hash TEXT NOT NULL,request_id TEXT NOT NULL,payload_hash TEXT NOT NULL,flow_id TEXT NOT NULL REFERENCES emotional_flows(id),status INTEGER NOT NULL DEFAULT 200,PRIMARY KEY(owner_hash,request_id));
      CREATE TABLE IF NOT EXISTS emotional_calls(flow_id TEXT NOT NULL REFERENCES emotional_flows(id),call_key TEXT NOT NULL,created_at INTEGER NOT NULL,status TEXT NOT NULL,reserved_cost REAL NOT NULL,estimated_cost REAL,request_json TEXT NOT NULL,response_json TEXT,receipt_json TEXT,PRIMARY KEY(flow_id,call_key));
      CREATE TABLE IF NOT EXISTS emotional_art(flow_id TEXT NOT NULL REFERENCES emotional_flows(id),asset_id TEXT NOT NULL,mime TEXT NOT NULL,sha256 TEXT NOT NULL,bytes BLOB NOT NULL,PRIMARY KEY(flow_id,asset_id));
      CREATE TABLE IF NOT EXISTS emotional_events(id INTEGER PRIMARY KEY,flow_id TEXT NOT NULL REFERENCES emotional_flows(id),at INTEGER NOT NULL,kind TEXT NOT NULL,request_id TEXT,release TEXT NOT NULL,details_json TEXT NOT NULL,dedupe_key TEXT,UNIQUE(flow_id,dedupe_key));
      CREATE INDEX IF NOT EXISTS emotional_event_flow ON emotional_events(flow_id,id);`);
    if(!(this.db.prepare('PRAGMA table_info(emotional_requests)').all() as Row[]).some(r=>r.name==='status'))this.db.exec('ALTER TABLE emotional_requests ADD COLUMN status INTEGER NOT NULL DEFAULT 200');
  }
  transaction<T>(fn:()=>T):T{if(this.inTransaction)return fn();this.db.exec('BEGIN IMMEDIATE');this.inTransaction=true;try{const out=fn();this.db.exec('COMMIT');return out;}catch(e){this.db.exec('ROLLBACK');throw e;}finally{this.inTransaction=false;}}
  event(id:string,at:number,kind:EmotionalEventKind,details:Record<string,unknown>,requestId:string|null=null,dedupeKey:string|null=null){this.db.prepare('INSERT INTO emotional_events(flow_id,at,kind,request_id,release,details_json,dedupe_key) VALUES(?,?,?,?,?,?,?) ON CONFLICT(flow_id,dedupe_key) DO NOTHING').run(id,at,kind,requestId,this.release,JSON.stringify(details),dedupeKey);}
  get(id:string):EmotionalRecord|null{const row=this.db.prepare('SELECT payload FROM emotional_flows WHERE id=?').get(id) as Row|undefined;return row?JSON.parse(row.payload):null;}
  current(owner:string):EmotionalRecord|null{const row=this.db.prepare('SELECT payload FROM emotional_flows WHERE owner_hash=? ORDER BY rowid DESC LIMIT 1').get(owner) as Row|undefined;return row?JSON.parse(row.payload):null;}
  owned(owner:string,id:string):EmotionalRecord|null{const r=this.get(id);return r?.ownerHash===owner?r:null;}
  memories(owner:string):EmotionalRecord[]{return(this.db.prepare("SELECT payload FROM emotional_flows WHERE owner_hash=? AND status='finished' ORDER BY rowid DESC").all(owner) as Row[]).map(r=>JSON.parse(r.payload));}
  unfinished():EmotionalRecord[]{return(this.db.prepare("SELECT payload FROM emotional_flows WHERE status IN ('chatting','queued','generating') ORDER BY updated_at,rowid").all() as Row[]).map(r=>JSON.parse(r.payload));}
  insert(r:EmotionalRecord){this.db.prepare('INSERT INTO emotional_flows VALUES(?,?,?,?,?,?,?)').run(r.id,r.ownerHash,r.createdAt,r.updatedAt,r.status,r.confirmedAt,JSON.stringify(r));}
  save(r:EmotionalRecord){r.revision++;this.db.prepare('UPDATE emotional_flows SET updated_at=?,status=?,confirmed_at=?,payload=? WHERE id=?').run(r.updatedAt,r.status,r.confirmedAt,JSON.stringify(r),r.id);}
  request(owner:string,id:string):{payloadHash:string;flowId:string;status:number}|null{const r=this.db.prepare('SELECT payload_hash,flow_id,status FROM emotional_requests WHERE owner_hash=? AND request_id=?').get(owner,id) as Row|undefined;return r?{payloadHash:r.payload_hash,flowId:r.flow_id,status:Number(r.status)}:null;}
  cache(owner:string,id:string,payloadHash:string,flowId:string,status=200){this.db.prepare('INSERT INTO emotional_requests(owner_hash,request_id,payload_hash,flow_id,status) VALUES(?,?,?,?,?)').run(owner,id,payloadHash,flowId,status);}
  counts(owner:string,dayStart:number){const row=this.db.prepare('SELECT count(*) AS conversations,coalesce(sum(owner_hash=? AND created_at>=?),0) AS owner_conversations,coalesce(sum(confirmed_at IS NOT NULL),0) AS jobs,coalesce(sum(confirmed_at>=?),0) AS daily,coalesce(sum(owner_hash=? AND confirmed_at>=?),0) AS owner_daily FROM emotional_flows').get(owner,dayStart,dayStart,owner,dayStart) as Row;return{conversations:Number(row.conversations),ownerConversations:Number(row.owner_conversations),jobs:Number(row.jobs),daily:Number(row.daily),ownerDaily:Number(row.owner_daily)};}
  chargedSince(at:number){const r=this.db.prepare('SELECT coalesce(sum(coalesce(estimated_cost,reserved_cost)),0) AS cost FROM emotional_calls WHERE created_at>=?').get(at) as Row;return Number(r.cost);}
  calls(id:string){return(this.db.prepare('SELECT call_key,status,request_json,response_json,receipt_json FROM emotional_calls WHERE flow_id=? ORDER BY rowid').all(id) as Row[]).map(r=>({key:String(r.call_key),status:String(r.status),request:JSON.parse(r.request_json) as MetaRequest|ImageRequest,response:r.response_json?JSON.parse(r.response_json):null,receipt:r.receipt_json?JSON.parse(r.receipt_json) as MetaReceipt:null}));}
  startCall(id:string,at:number,spec:MetaRequest|ImageRequest,reservation:number){this.db.prepare("INSERT INTO emotional_calls(flow_id,call_key,created_at,status,reserved_cost,request_json) VALUES(?,?,?,'started',?,?)").run(id,spec.key,at,reservation,JSON.stringify(spec));}
  finishCall(id:string,receipt:MetaReceipt,raw:unknown){this.db.prepare('UPDATE emotional_calls SET status=?,estimated_cost=?,response_json=?,receipt_json=? WHERE flow_id=? AND call_key=?').run(receipt.status,receipt.estimatedCostUsd,JSON.stringify(raw??null),JSON.stringify(receipt),id,receipt.key);}
  storeArt(id:string,ref:EmotionalArt,bytes:Buffer){this.db.prepare('INSERT INTO emotional_art VALUES(?,?,?,?,?)').run(id,ref.id,ref.mime,ref.sha256,bytes);}
  art(id:string,asset:string):{mime:string;sha256:string;bytes:Buffer}|null{const r=this.db.prepare('SELECT mime,sha256,bytes FROM emotional_art WHERE flow_id=? AND asset_id=?').get(id,asset) as Row|undefined;return r?{mime:r.mime,sha256:r.sha256,bytes:Buffer.from(r.bytes)}:null;}
  close(){this.db.close();}
}
