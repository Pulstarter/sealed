import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import type { GameState, SessionSnapshot, WorldDefinition, JourneyConfig, PreparationSnapshot } from '../../../packages/engine/src/types.js';
import type { GenerationAttempt } from './meta-generation.js';
import type { StoryState } from '../../../packages/engine/src/story-types.js';

export interface SessionRecord {
  tokenHash: string; id: string; world: WorldDefinition; canonical: string; hash: string;
  state: GameState; phase: SessionSnapshot['phase']; paused: boolean;
  anchorReal: number; presenceUntil: number; sequence: number;
}
export interface PreparationRecord {
  id:string; ownerHash:string; tokenHash:string; requestId:string; payloadHash:string; config:JourneyConfig;
  status:PreparationSnapshot['status']; createdAt:number; attempts:GenerationAttempt[];
  canonical:string|null; hash:string|null; sessionId:string|null; errorCode:PreparationSnapshot['errorCode']|null;
}
export interface StoryRecord {id:string;ownerHash:string;generation:number;startRequestId:string;startPayloadHash:string;createdAt:number;state:StoryState}
type Row = Record<string, string | number | bigint | Uint8Array | null>;
export class Store {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, id TEXT NOT NULL UNIQUE,
        canonical TEXT NOT NULL, hash TEXT NOT NULL, state TEXT NOT NULL, phase TEXT NOT NULL,
        paused INTEGER NOT NULL, anchor_real INTEGER NOT NULL, presence_until INTEGER NOT NULL, sequence INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS requests (session_id TEXT NOT NULL REFERENCES sessions(id), request_id TEXT NOT NULL,
        payload_hash TEXT NOT NULL, status INTEGER NOT NULL, response TEXT NOT NULL, PRIMARY KEY(session_id, request_id));
      CREATE TABLE IF NOT EXISTS preparations (id TEXT PRIMARY KEY,owner_hash TEXT NOT NULL,token_hash TEXT NOT NULL,
        request_id TEXT NOT NULL,payload_hash TEXT NOT NULL,config TEXT NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL,
        attempts TEXT NOT NULL,canonical TEXT,hash TEXT,session_id TEXT REFERENCES sessions(id),error_code TEXT,
        UNIQUE(owner_hash,request_id));
      CREATE INDEX IF NOT EXISTS preparations_owner ON preparations(owner_hash,created_at);
      CREATE TABLE IF NOT EXISTS story_sessions (id TEXT PRIMARY KEY,owner_hash TEXT NOT NULL,generation INTEGER NOT NULL,
        start_request_id TEXT NOT NULL,start_payload_hash TEXT NOT NULL,created_at INTEGER NOT NULL,state TEXT NOT NULL,
        UNIQUE(owner_hash,start_request_id));
      CREATE INDEX IF NOT EXISTS story_owner ON story_sessions(owner_hash,generation);
      CREATE TABLE IF NOT EXISTS story_requests (story_id TEXT NOT NULL REFERENCES story_sessions(id),request_id TEXT NOT NULL,
        payload_hash TEXT NOT NULL,status INTEGER NOT NULL,response TEXT NOT NULL,PRIMARY KEY(story_id,request_id));`);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  get(tokenHash: string): SessionRecord | null {
    const row = this.db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(tokenHash) as Row | undefined;
    if (!row) return null;
    const canonical = String(row.canonical);
    return { tokenHash: String(row.token_hash), id: String(row.id), canonical, world: JSON.parse(canonical) as WorldDefinition,
      hash: String(row.hash), state: JSON.parse(String(row.state)) as GameState,
      phase: String(row.phase) as SessionSnapshot['phase'], paused: Boolean(row.paused),
      anchorReal: Number(row.anchor_real), presenceUntil: Number(row.presence_until), sequence: Number(row.sequence) };
  }
  preparation(id:string):PreparationRecord|null {
    const row=this.db.prepare('SELECT * FROM preparations WHERE id=?').get(id) as Row|undefined;
    return row?this.readPreparation(row):null;
  }
  private readPreparation(row:Row):PreparationRecord {
    return {id:String(row.id),ownerHash:String(row.owner_hash),tokenHash:String(row.token_hash),requestId:String(row.request_id),payloadHash:String(row.payload_hash),
      config:JSON.parse(String(row.config)) as JourneyConfig,status:String(row.status) as PreparationRecord['status'],createdAt:Number(row.created_at),
      attempts:JSON.parse(String(row.attempts)) as GenerationAttempt[],canonical:row.canonical===null?null:String(row.canonical),hash:row.hash===null?null:String(row.hash),sessionId:row.session_id===null?null:String(row.session_id),errorCode:row.error_code as PreparationRecord['errorCode']};
  }
  ownerPreparations(ownerHash:string):PreparationRecord[] {
    return (this.db.prepare('SELECT * FROM preparations WHERE owner_hash=? ORDER BY created_at DESC,rowid DESC').all(ownerHash) as Row[]).map(row=>this.readPreparation(row));
  }
  unfinishedPreparations():PreparationRecord[] {
    return (this.db.prepare("SELECT * FROM preparations WHERE status NOT IN ('ready','failed') ORDER BY created_at,rowid").all() as Row[]).map(row=>this.readPreparation(row));
  }
  preparationCounts(ownerHash:string,dayStart:number):{total:number;daily:number;ownerDaily:number} {
    const row=this.db.prepare('SELECT count(*) AS total,coalesce(sum(created_at>=?),0) AS daily,coalesce(sum(created_at>=? AND owner_hash=?),0) AS owner_daily FROM preparations').get(dayStart,dayStart,ownerHash) as Row;
    return {total:Number(row.total),daily:Number(row.daily),ownerDaily:Number(row.owner_daily)};
  }
  insertPreparation(p:PreparationRecord):void {
    this.db.prepare('INSERT INTO preparations VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(p.id,p.ownerHash,p.tokenHash,p.requestId,p.payloadHash,JSON.stringify(p.config),p.status,p.createdAt,JSON.stringify(p.attempts),p.canonical,p.hash,p.sessionId,p.errorCode??null);
  }
  savePreparation(p:PreparationRecord):void {
    this.db.prepare('UPDATE preparations SET status=?,attempts=?,canonical=?,hash=?,session_id=?,error_code=? WHERE id=?').run(p.status,JSON.stringify(p.attempts),p.canonical,p.hash,p.sessionId,p.errorCode??null,p.id);
  }
  insert(r: SessionRecord): void {
    this.db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(r.tokenHash, r.id, r.canonical, r.hash,
      JSON.stringify(r.state), r.phase, Number(r.paused), r.anchorReal, r.presenceUntil, r.sequence);
  }
  save(r: SessionRecord): void {
    this.db.prepare(`UPDATE sessions SET state=?, phase=?, paused=?, anchor_real=?, presence_until=?, sequence=? WHERE token_hash=?`)
      .run(JSON.stringify(r.state), r.phase, Number(r.paused), r.anchorReal, r.presenceUntil, r.sequence, r.tokenHash);
  }
  cached(sessionId: string, requestId: string): { payloadHash: string; status: number; response: string } | null {
    const row = this.db.prepare('SELECT payload_hash, status, response FROM requests WHERE session_id=? AND request_id=?')
      .get(sessionId, requestId) as Row | undefined;
    return row ? { payloadHash: String(row.payload_hash), status: Number(row.status), response: String(row.response) } : null;
  }
  cache(sessionId: string, requestId: string, payloadHash: string, status: number, response: string): void {
    this.db.prepare('INSERT INTO requests VALUES (?, ?, ?, ?, ?)').run(sessionId, requestId, payloadHash, status, response);
  }
  private readStory(row:Row):StoryRecord{return {id:String(row.id),ownerHash:String(row.owner_hash),generation:Number(row.generation),startRequestId:String(row.start_request_id),startPayloadHash:String(row.start_payload_hash),createdAt:Number(row.created_at),state:JSON.parse(String(row.state)) as StoryState};}
  story(ownerHash:string):StoryRecord|null {const row=this.db.prepare('SELECT * FROM story_sessions WHERE owner_hash=? ORDER BY generation DESC LIMIT 1').get(ownerHash) as Row|undefined;return row?this.readStory(row):null;}
  storyById(ownerHash:string,id:string):StoryRecord|null {const row=this.db.prepare('SELECT * FROM story_sessions WHERE owner_hash=? AND id=?').get(ownerHash,id) as Row|undefined;return row?this.readStory(row):null;}
  startedStory(ownerHash:string,requestId:string):StoryRecord|null {const row=this.db.prepare('SELECT * FROM story_sessions WHERE owner_hash=? AND start_request_id=?').get(ownerHash,requestId) as Row|undefined;return row?this.readStory(row):null;}
  insertStory(r:StoryRecord):void {this.db.prepare('INSERT INTO story_sessions VALUES (?,?,?,?,?,?,?)').run(r.id,r.ownerHash,r.generation,r.startRequestId,r.startPayloadHash,r.createdAt,JSON.stringify(r.state));}
  saveStory(r:StoryRecord):void {this.db.prepare('UPDATE story_sessions SET state=? WHERE id=?').run(JSON.stringify(r.state),r.id);}
  storyCached(id:string,requestId:string):{payloadHash:string;status:number;response:string}|null {const row=this.db.prepare('SELECT payload_hash,status,response FROM story_requests WHERE story_id=? AND request_id=?').get(id,requestId) as Row|undefined;return row?{payloadHash:String(row.payload_hash),status:Number(row.status),response:String(row.response)}:null;}
  cacheStory(id:string,requestId:string,payloadHash:string,status:number,response:string):void {this.db.prepare('INSERT INTO story_requests VALUES (?,?,?,?,?)').run(id,requestId,payloadHash,status,response);}
  close(): void { this.db.close(); }
}
