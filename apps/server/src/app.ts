import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createState, advance, step, project, canonicalizeWorld, validateWorld, buildDebrief } from '../../../packages/engine/src/index.js';
import { createPreparedWorld } from '../../../packages/engine/src/nieve.js';
import type { Role, SessionSnapshot, Reveal } from '../../../packages/engine/src/types.js';
import { Store, type SessionRecord,type StoryRecord } from './store.js';
import { createStory,syncStory,storyStep,storyScene,storyExplanation,STORY_TITLE,STORY_GOAL } from '../../../packages/engine/src/story.js';
import type { StorySnapshot,StoryInput } from '../../../packages/engine/src/story-types.js';
import { Preparations,PreparationError,publicPreparation,type GenerationOptions } from './preparations.js';
import { META_MODEL } from './meta-generation.js';
import {EmotionalHTTP} from './emotional-routes.js';
import type {EmotionalOptions} from './emotional-service.js';
import {reviewedDemo} from './demo-prepared.js';

const PRESENCE_MS = 15_000;
const COOKIE = 'sealed_session';
const OWNER_COOKIE='sealed_owner';
const BODY_LIMIT = 8_192;
const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
class HttpError extends Error { constructor(readonly status: number, message: string) { super(message); } }
export interface AppOptions { databasePath?: string; now?: () => number; publicOrigin?: string; staticDir?: string; generation?:GenerationOptions;emotional?:EmotionalOptions;demoLimits?:{total:number;perOwner:number} }

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) {
    const data = Buffer.from(chunk); size += data.length;
    if (size > BODY_LIMIT) throw new HttpError(413, 'Request too large.');
    chunks.push(data);
  }
  if (!size) return {};
  if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) throw new HttpError(415, 'JSON required.');
  try {
    const result: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!result || Array.isArray(result) || typeof result !== 'object') throw new Error();
    return result as Record<string, unknown>;
  } catch { throw new HttpError(400, 'Invalid JSON.'); }
}
function keys(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some(k => !allowed.includes(k))) throw new HttpError(400, 'Unexpected input.');
}
function send(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

export function createApp(options: AppOptions = {}) {
  const store = new Store(options.databasePath ?? process.env.DATABASE_PATH ?? 'data/sealed.sqlite');
  const now = options.now ?? Date.now;
  const publicOrigin = options.publicOrigin ?? process.env.PUBLIC_ORIGIN;
  const emotional=new EmotionalHTTP(options.databasePath??process.env.DATABASE_PATH??'data/sealed.sqlite',now,publicOrigin,options.emotional);
  const demoFile=(options.databasePath??process.env.DATABASE_PATH??'data/sealed.sqlite')===':memory:'?':memory:':(options.databasePath??process.env.DATABASE_PATH??'data/sealed.sqlite')+'.demo.sqlite';
  const demo=new EmotionalHTTP(demoFile,now,publicOrigin,{apiKey:'',prepared:reviewedDemo(),preparedLimits:options.demoLimits},{base:'/api/demo/',cookie:'sealed_demo_owner'});
  const preparations=new Preparations(store,now,options.generation);
  const staticRoot = resolve(options.staticDir ?? 'dist/web');
  const streams = new Set<ServerResponse>();
  let closed = false;
  function cookie(req:IncomingMessage,name:string):string|null {
    const raw=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(`${name}=`))?.slice(name.length+1);
    return raw&&/^[a-f0-9]{64}$/.test(raw)?raw:null;
  }
  function setCookie(res:ServerResponse,name:string,secret:string){
    res.setHeader('Set-Cookie',`${name}=${secret}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${publicOrigin?.startsWith('https:')?'; Secure':''}`);
  }
  function owner(req:IncomingMessage,res:ServerResponse):string {
    const prior=cookie(req,OWNER_COOKIE);if(prior)return prior;
    const secret=randomBytes(32).toString('hex');setCookie(res,OWNER_COOKIE,secret);return secret;
  }
  const preparationToken=(secret:string,id:string)=>createHmac('sha256',secret).update(id).digest('hex');
  function token(req: IncomingMessage): string | null {
    const raw = req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    return raw && /^[a-f0-9]{64}$/.test(raw) ? hash(raw) : null;
  }
  function current(req: IncomingMessage, required = true): SessionRecord | null {
    const value = token(req); const record = value ? store.get(value) : null;
    if (!record && required) throw new HttpError(401, 'No active journey.');
    return record;
  }
  function sync(record: SessionRecord, at: number): void {
    if (record.phase === 'playing' && !record.paused) {
      const eligibleUntil = Math.min(at, record.presenceUntil);
      const realDelta = Math.max(0, eligibleUntil - record.anchorReal);
      if (realDelta > 0) record.state = advance(record.world, record.state,
        Math.min(record.world.window.durationMs, record.state.now + Math.floor(realDelta * record.world.window.scale)));
    }
    record.anchorReal = at;
    if (record.state.finished) record.phase = 'finished';
    store.save(record);
  }
  function snapshot(record: SessionRecord, at: number): SessionSnapshot {
    const actor = record.world.players[0]?.id;
    if (!actor) throw new Error('Stored world has no actor');
    return { id: record.id, hash: record.hash, phase: record.phase, view: project(record.world, record.state, actor),
      clock: { serverNow: at, gameNow: record.state.now, scale: record.world.window.scale,
        paused: record.phase !== 'playing' || record.paused || record.presenceUntil <= at } };
  }
  function origin(req: IncomingMessage): void {
    if (req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Origin not allowed.');
    if (req.headers.origin) {
      const expected = publicOrigin ? new URL(publicOrigin).origin : `http://${req.headers.host}`;
      if (req.headers.origin !== expected) throw new HttpError(403, 'Origin not allowed.');
    }
  }
  function readSnapshot(req: IncomingMessage): SessionSnapshot {
    return store.transaction(() => { const record = current(req)!; const at = now(); sync(record, at); return snapshot(record, at); });
  }
  function storySnapshot(r:StoryRecord,at:number):StorySnapshot {
    const updated=syncStory(r.state,at);if(updated.revision!==r.state.revision){r.state=updated;store.saveStory(r);}
    const actor=r.state.players[0]!.id,p=r.state.players[0]!,scene=storyScene(r.state,actor);
    return {id:r.id,startRequestId:r.startRequestId,generation:r.generation,revision:r.state.revision,serverNow:at,version:r.state.version,title:STORY_TITLE,goal:STORY_GOAL,phase:p.phase,scene,deadline:p.deadline,lastRequestId:r.state.lastRequestId,decisions:p.decisions,lastDecision:p.decisions.at(-1)??null,ending:p.phase==='finished'?{id:p.node,title:scene.title,explanation:storyExplanation(r.state,actor)}:null};
  }
  function readStory(req:IncomingMessage):StorySnapshot|null {const secret=cookie(req,OWNER_COOKIE);if(!secret)return null;return store.transaction(()=>{const r=store.story(hash(secret));return r?storySnapshot(r,now()):null;});}
  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    const requestUrl=new URL(req.url??'/','http://localhost');
    const path = requestUrl.pathname;
    if (path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    if(await demo.route(req,res,requestUrl))return;
    if(await emotional.route(req,res,requestUrl))return;
    if (req.method === 'GET' && path === '/health') return send(res, 200, { ok: true, stage:preparations.available?'H2':'H1', content:preparations.available?'meta-and-prepared':'prepared',defaultExperience:'el-ultimo-vagon' });
    if(req.method==='GET'&&path==='/api/story'){owner(req,res);return send(res,200,{session:readStory(req)});}
    if(req.method==='GET'&&path==='/api/story/events'){
      const initial=readStory(req);if(!initial)throw new HttpError(401,'No hay una aventura activa.');
      res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store, no-cache, must-revalidate',Connection:'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();streams.add(res);res.write(`event: snapshot\ndata: ${JSON.stringify(initial)}\n\n`);
      const timer=setInterval(()=>{if(res.destroyed||res.writableEnded||closed)return;try{if(res.writableLength>1048576){res.destroy();return;}res.write(`event: snapshot\ndata: ${JSON.stringify(readStory(req))}\n\n`);}catch{res.end();}},1000);timer.unref();res.once('close',()=>{clearInterval(timer);streams.delete(res);});return;
    }
    if(req.method==='GET'&&path==='/api/setup'){
      owner(req,res);return send(res,200,{meta:{available:preparations.available,model:preparations.available?META_MODEL:null}});
    }
    if(req.method==='GET'&&path==='/api/preparations/current'){
      const secret=cookie(req,OWNER_COOKIE);const p=secret?preparations.current(hash(secret)):null;
      return send(res,200,{preparation:p?publicPreparation(p):null});
    }
    if (req.method === 'GET' && path === '/api/session') {
      const record = current(req, false); return send(res, 200, { session: record ? readSnapshot(req) : null });
    }
    if (req.method === 'GET' && path === '/api/session/events') {
      const initial = readSnapshot(req);
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.flushHeaders(); streams.add(res); res.write(`event: snapshot\ndata: ${JSON.stringify(initial)}\n\n`);
      const timer = setInterval(() => {
        if (res.destroyed || res.writableEnded || closed) return;
        try {
          if (res.writableLength > 1_048_576) { res.destroy(); return; }
          res.write(`event: snapshot\ndata: ${JSON.stringify(readSnapshot(req))}\n\n`);
        } catch { res.end(); }
      }, 1000);
      timer.unref(); res.once('close', () => { clearInterval(timer); streams.delete(res); }); return;
    }
    if (req.method === 'GET' && path === '/api/session/reveal') {
      const reveal = store.transaction(() => {
        const record = current(req)!; sync(record, now());
        if (record.phase !== 'finished') throw new HttpError(403, 'The envelope is still sealed.');
        const actor = record.world.players[0]!.id;
        return { canonical: record.canonical, hash: record.hash, events: record.state.events,
          actions: record.state.actions, ending: record.state.results[actor] ?? 'failure',
          debrief: buildDebrief(record.world,record.state,actor) } satisfies Reveal;
      });
      return send(res, 200, reveal);
    }
    if (req.method === 'POST' && path.startsWith('/api/')) {
      origin(req); const value = await body(req);
      if(path==='/api/story/start'){
        keys(value,['requestId','restart']);if(typeof value.requestId!=='string'||!/^[a-z0-9:_-]{1,100}$/i.test(value.requestId)||(value.restart!==undefined&&typeof value.restart!=='boolean'))throw new HttpError(400,'Petición de inicio no válida.');
        const secret=owner(req,res),ownerHash=hash(secret),requestId=value.requestId,payloadHash=hash(JSON.stringify({restart:value.restart===true}));
        const result=store.transaction(()=>{const cached=store.startedStory(ownerHash,requestId);if(cached){if(cached.startPayloadHash!==payloadHash)throw new HttpError(409,'El identificador ya pertenece a otro inicio.');return storySnapshot(cached,now());}
          const current=store.story(ownerHash);if(current&&value.restart!==true)throw new HttpError(409,'Ya tienes una aventura. Puedes continuarla o empezar de nuevo.');const at=now();const r:StoryRecord={id:randomUUID(),ownerHash,generation:(current?.generation??0)+1,startRequestId:requestId,startPayloadHash:payloadHash,createdAt:at,state:createStory(at)};store.insertStory(r);return storySnapshot(r,at);});return send(res,201,result);
      }
      if(path==='/api/story/action'){
        keys(value,['id','node','kind','choice','requestId']);
        if(typeof value.id!=='string'||value.id.length>100||typeof value.node!=='string'||!/^[A-Z0-9]{1,12}$/.test(value.node)||typeof value.kind!=='string'||!['continue','begin','choose'].includes(value.kind)||typeof value.requestId!=='string'||!/^[a-z0-9:_-]{1,100}$/i.test(value.requestId)||(value.choice!==undefined&&(typeof value.choice!=='string'||!['A','B'].includes(value.choice))))throw new HttpError(400,'Acción no válida.');
        const secret=cookie(req,OWNER_COOKIE);if(!secret)throw new HttpError(401,'Recupera tu aventura antes de continuar.');
        const requestId=value.requestId,payloadHash=hash(JSON.stringify({node:value.node,kind:value.kind,choice:value.choice??null}));
        const result=store.transaction(()=>{
          const r=store.storyById(hash(secret),value.id as string);if(!r)throw new HttpError(404,'Aventura no encontrada.');
          if(store.story(hash(secret))?.id!==r.id)throw new HttpError(409,'Hay una aventura más reciente. Recupérala para continuar.');
          const at=now();storySnapshot(r,at);const cached=store.storyCached(r.id,requestId);
          if(cached){if(cached.payloadHash!==payloadHash)throw new HttpError(409,'Este identificador ya pertenece a otra acción.');return {status:cached.status,text:cached.status===200?JSON.stringify(storySnapshot(r,at)):cached.response};}
          const input:StoryInput={actor:r.state.players[0]!.id,node:value.node as string,kind:value.kind as StoryInput['kind'],at,sequence:r.state.lastSequence+1,requestId,...(value.choice?{choice:value.choice as 'A'|'B'}:{})};const out=storyStep(r.state,input);r.state=out.state;store.saveStory(r);const status=out.ok?200:409;const text=JSON.stringify(out.ok?storySnapshot(r,at):{error:out.error});store.cacheStory(r.id,requestId,payloadHash,status,text);return {status,text};
        });res.writeHead(result.status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(result.text);return;
      }
      if(path==='/api/preparations'){
        keys(value,['role','tone','detail','requestId']);
        if(!['technician','guest'].includes(String(value.role))||typeof value.role!=='string'||!['tension','melancholy'].includes(String(value.tone))||typeof value.tone!=='string'||typeof value.detail!=='string'||value.detail.length>160||/\b(war|warfare|politics|political|guerra|pol[ií]tica)\b/i.test(value.detail)||typeof value.requestId!=='string'||!/^[a-z0-9:_-]{1,100}$/i.test(value.requestId))throw new HttpError(400,'Invalid preparation settings.');
        const secret=owner(req,res);const p=preparations.enqueue(hash(secret),value.requestId,{role:value.role as Role,tone:value.tone as 'tension'|'melancholy',detail:value.detail},id=>hash(preparationToken(secret,id)),current(req,false)?.phase==='playing');
        return send(res,p.status==='ready'||p.status==='failed'?200:202,{preparation:publicPreparation(p)});
      }
      const claim=path.match(/^\/api\/preparations\/([a-f0-9-]{36})\/claim$/);
      if(claim){
        keys(value,[]);const secret=cookie(req,OWNER_COOKIE);const p=store.preparation(claim[1]!);
        if(!secret||!p||p.ownerHash!==hash(secret))throw new HttpError(404,'Preparation not found.');
        if(p.status!=='ready')throw new HttpError(409,'The envelope is not ready.');
        const previous=current(req,false);
        if(previous?.phase==='playing'&&previous.id!==p.sessionId)throw new HttpError(409,'Finish your current journey first.');
        const record=store.get(p.tokenHash);if(!record)throw new HttpError(409,'The prepared envelope is unavailable.');
        setCookie(res,COOKIE,preparationToken(secret,p.id));
        return send(res,200,store.transaction(()=>{const at=now();sync(record,at);return snapshot(record,at);}));
      }
      if (path === '/api/journeys') {
        keys(value, ['role', 'tone', 'detail']);
        if (typeof value.role !== 'string' || !['technician', 'guest'].includes(value.role) ||
          typeof value.tone !== 'string' || !['tension', 'melancholy'].includes(value.tone) ||
          typeof value.detail !== 'string' || value.detail.length > 160) throw new HttpError(400, 'Invalid journey settings.');
        if (/\b(war|warfare|politics|political|guerra|pol[ií]tica)\b/i.test(value.detail)) throw new HttpError(400, 'This setting is unavailable in the demo.');
        const role = value.role as Role; const tone = value.tone as string; const detail = value.detail;
        const result = store.transaction(() => {
          const ownerSecret=cookie(req,OWNER_COOKIE);if(ownerSecret&&preparations.hasActive(hash(ownerSecret)))throw new HttpError(409,'Your envelope is already being prepared. Recover it first.');
          const existing = current(req, false);
          if (existing?.phase === 'playing') throw new HttpError(409, 'Finish your current journey first.');
          const world = { ...createPreparedWorld(role), config: { role, tone, detail } };
          if (validateWorld(world).length) throw new Error('Prepared world validation failed');
          const canonical = canonicalizeWorld(world); const secret = randomBytes(32).toString('hex'); const at = now();
          const created: SessionRecord = { tokenHash: hash(secret), id: randomUUID(), world, canonical, hash: hash(canonical),
            state: createState(world), phase: 'sealed', paused: true, anchorReal: at, presenceUntil: at, sequence: 0 };
          store.insert(created);
          const secure = publicOrigin?.startsWith('https:') ? '; Secure' : '';
          res.setHeader('Set-Cookie', `${COOKIE}=${secret}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${secure}`);
          return snapshot(created, at);
        });
        return send(res, 201, result);
      }
      if (path === '/api/session/actions') {
        keys(value, ['actionId', 'requestId', 'confirmed']);
        if (typeof value.actionId !== 'string' || !/^[a-z0-9:_-]{1,100}$/i.test(value.actionId) ||
          typeof value.requestId !== 'string' || !/^[a-z0-9:_-]{1,100}$/i.test(value.requestId) ||
          (value.confirmed !== undefined && typeof value.confirmed !== 'boolean')) throw new HttpError(400, 'Invalid action.');
        const requestId = value.requestId; const actionId = value.actionId; const confirmed = value.confirmed === true;
        const payloadHash = hash(JSON.stringify({ actionId, confirmed }));
        const result = store.transaction(() => {
          const record = current(req)!; const cached = store.cached(record.id, requestId);
          if (cached) {
            if (cached.payloadHash !== payloadHash) throw new HttpError(409, 'Request ID was already used for a different action.');
            const at = now(); sync(record, at);
            const response = snapshot(record, at);
            if (cached.status === 200) {
              const original = JSON.parse(cached.response) as SessionSnapshot;
              if (original.advance) response.advance = original.advance;
            }
            return { status: cached.status, text: cached.status === 200 ? JSON.stringify(response) : cached.response };
          }
          const at = now(); sync(record, at);
          if (record.phase !== 'playing') throw new HttpError(409, 'The journey is not playing.');
          if (record.paused || record.presenceUntil <= at) throw new HttpError(409, 'Resume the journey before acting.');
          const actor = record.world.players[0]!.id;
          const beforeTask = record.state.players[actor]!.busy;
          const advanceTarget = actionId.startsWith('wait:') ? (actionId.startsWith('wait:until:') ? Number(actionId.slice('wait:until:'.length)) : project(record.world, record.state, actor).actions.find(action => action.kind === 'wait')?.wait?.until) : undefined;
          record.sequence += 1;
          const outcome = step(record.world, record.state, { actor, actionId, requestId,
            confirmed, submittedAtGame: record.state.now, serverSequence: record.sequence });
          record.state = outcome.state;
          if (record.state.finished) record.phase = 'finished';
          record.anchorReal = at; store.save(record);
          const status = outcome.ok ? 200 : 409;
          const accepted = outcome.ok ? snapshot(record, at) : null;
          if (accepted && advanceTarget !== undefined) {
            const event = record.state.events.find(event => event.at === record.state.now && event.kind === 'world' && event.perceivedBy.includes(actor));
            const completed = beforeTask && record.state.events.some(event => event.id === `action:${beforeTask.sequence}:done` && event.actor === actor);
            accepted.advance = { requestId, requestedUntil: advanceTarget, reachedAt: record.state.now,
              reason: record.state.now < advanceTarget && event ? (event.placeId ? 'local-event' : 'announcement') : completed ? 'task-completed' : 'target',
              ...(beforeTask ? { taskRequestId: beforeTask.requestId } : {}) };
          }
          const response = accepted ?? { error: outcome.error ?? 'That action is not available now.' };
          const text = JSON.stringify(response); store.cache(record.id, requestId, payloadHash, status, text); return { status, text };
        });
        res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(result.text); return;
      }
      if (['/api/session/start', '/api/session/pause', '/api/session/resume', '/api/session/presence'].includes(path)) {
        keys(value, path.endsWith('/presence') ? ['visible'] : []);
        if (path.endsWith('/presence') && typeof value.visible !== 'boolean') throw new HttpError(400, 'Visibility required.');
        const result = store.transaction(() => {
          const record = current(req)!; const at = now(); sync(record, at);
          if (path.endsWith('/start') && record.phase === 'sealed') {
            record.phase = 'playing'; record.paused = false; record.presenceUntil = at + PRESENCE_MS;
          } else if (path.endsWith('/pause') && record.phase === 'playing') record.paused = true;
          else if (path.endsWith('/resume') && record.phase === 'playing') {
            record.paused = false; record.presenceUntil = at + PRESENCE_MS;
          } else if (path.endsWith('/presence') && record.phase === 'playing') record.presenceUntil = value.visible ? at + PRESENCE_MS : at;
          record.anchorReal = at; store.save(record); return snapshot(record, at);
        });
        return send(res, 200, result);
      }
      throw new HttpError(404, 'Not found.');
    }
    if (path.startsWith('/api/')) throw new HttpError(404, 'Not found.');
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed.');
    let decoded: string;
    try { decoded = decodeURIComponent(path); } catch { throw new HttpError(400, 'Invalid path.'); }
    if (decoded.includes('\0') || decoded.split('/').some(segment => segment.startsWith('.'))) throw new HttpError(404, 'Not found.');
    let file = resolve(staticRoot, `.${decoded}`);
    if (!file.startsWith(`${staticRoot}${sep}`) && file !== staticRoot) throw new HttpError(404, 'Not found.');
    try { if (!(await stat(file)).isFile()) file = resolve(staticRoot, 'index.html'); }
    catch { file = resolve(staticRoot, 'index.html'); }
    let bytes: Buffer;
    try { bytes = await readFile(file); } catch { throw new HttpError(503, 'The web build is not available yet.'); }
    const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
      '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': decoded.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  }
  const server = createServer({ requestTimeout: 15_000, headersTimeout: 10_000, maxHeaderSize: 16_384 }, (req, res) => {
    void route(req, res).catch(error => {
      if (res.headersSent) { res.end(); return; }
      if (error instanceof HttpError||error instanceof PreparationError) send(res, error.status, { error: error.message });
      else send(res, 500, { error: 'The journey could not be processed. Please retry.' });
    });
  });
  return { server,
    listen(port = 0, host = '127.0.0.1'): Promise<string> {
      return new Promise((accept, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.removeListener('error', reject); const address = server.address();
          if (!address || typeof address === 'string') return reject(new Error('Missing address'));
          accept(`http://${host}:${address.port}`);
        });
      });
    },
    async close(): Promise<void> {
      if (closed) return; closed = true;
      for (const stream of streams) stream.end();
      await emotional.close();
      await demo.close();
      await preparations.close();
      await new Promise<void>((accept, reject) => { server.close(e => e ? reject(e) : accept()); server.closeAllConnections(); });
      store.close();
    },
  };
}
