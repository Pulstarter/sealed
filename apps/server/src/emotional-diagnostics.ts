import {DatabaseSync} from 'node:sqlite';
import {existsSync,lstatSync,mkdirSync,realpathSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {EmotionalRecord} from './emotional-store.js';

// Operator-only entry point. Importing the service here would resume jobs and
// could spend credits; this reader never constructs a store or calls a model.
class UsageError extends Error {}
type Row=Record<string,any>;
const parse=(value:unknown)=>value?JSON.parse(String(value)):null;
function metadata(details:Record<string,unknown>){const {profile,evidence,...publicToOperator}=details;return publicToOperator;}
function run(args:string[]){
  let file=process.env.DATABASE_PATH??'data/sealed.sqlite',flow='',limit=20,failures=false,exportContent=false;
  for(let i=0;i<args.length;i++){
    const arg=args[i];
    if(arg==='--db'||arg==='--flow'||arg==='--limit'){
      const value=args[++i];if(!value||value.startsWith('--'))throw new UsageError('Missing option value.');
      if(arg==='--db')file=value;else if(arg==='--flow')flow=value.toLowerCase();else limit=Number(value);
    }else if(arg==='--failures')failures=true;else if(arg==='--export')exportContent=true;else throw new UsageError('Unknown option. Use --db FILE, --flow REFERENCE, --limit 1..100, --failures or --export.');
  }
  if(flow&&!/^[a-f0-9-]{8,36}$/.test(flow))throw new UsageError('Invalid adventure reference.');
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new UsageError('Limit must be 1..100.');
  if(exportContent&&!flow)throw new UsageError('Private export requires one --flow reference.');
  const db=new DatabaseSync(resolve(file),{readOnly:true});
  try{
    db.exec('BEGIN');
    const hasEvents=!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='emotional_events'").get();
    type SummaryRecord=Pick<EmotionalRecord,'id'|'status'|'createdAt'|'updatedAt'|'error'>;
    // Listing failures must not load every story and its base64 illustrations.
    const rows=db.prepare("SELECT id,status,created_at,updated_at,json_extract(payload,'$.error') AS error FROM emotional_flows ORDER BY rowid DESC").all() as Row[];
    const records=rows.map(r=>({id:String(r.id),status:r.status,createdAt:Number(r.created_at),updatedAt:Number(r.updated_at),error:r.error}) as SummaryRecord).filter(r=>!flow||r.id.startsWith(flow));
    if(flow&&records.length!==1)throw new UsageError(records.length?'Reference is ambiguous; use the full adventure ID.':'Adventure not found.');
    function timeline(id:string){return hasEvents?(db.prepare('SELECT id,at,kind,request_id,release,details_json FROM emotional_events WHERE flow_id=? ORDER BY id').all(id) as Row[]).map(e=>({id:Number(e.id),at:Number(e.at),kind:String(e.kind),requestId:e.request_id,release:String(e.release),details:parse(e.details_json) as Record<string,unknown>})):[];}
    function calls(id:string){return(db.prepare('SELECT call_key,created_at,status,reserved_cost,estimated_cost,request_json,response_json,receipt_json FROM emotional_calls WHERE flow_id=? ORDER BY rowid').all(id) as Row[]).map(c=>({key:String(c.call_key),at:Number(c.created_at),status:String(c.status),reservedCostUsd:Number(c.reserved_cost),estimatedCostUsd:c.estimated_cost===null?null:Number(c.estimated_cost),receipt:parse(c.receipt_json),request:parse(c.request_json),response:parse(c.response_json)}));}
    function summary(r:SummaryRecord){
      const history=timeline(r.id),last=history.findLast(e=>['operation_failed','process_interrupted','request_rejected','action_rejected'].includes(e.kind));
      const usage=db.prepare("SELECT count(*) AS calls,coalesce(sum(status!='complete'),0) AS failed,coalesce(sum(coalesce(estimated_cost,reserved_cost)),0) AS cost FROM emotional_calls WHERE flow_id=?").get(r.id)!;
      return{id:r.id,reference:r.id.slice(0,8),status:r.status,createdAt:r.createdAt,updatedAt:r.updatedAt,error:r.error,historyAvailable:history.length>0,lastFailure:last?{at:last.at,kind:last.kind,...metadata(last.details)}:null,calls:Number(usage.calls),failedCalls:Number(usage.failed),conservativeEstimateUsd:Number(usage.cost)};
    }
    if(!flow){const summaries=records.map(summary).filter(r=>!failures||r.error||r.lastFailure||r.failedCalls).slice(0,limit);return{scope:'preview',flows:summaries};}
    const record=parse(db.prepare('SELECT payload FROM emotional_flows WHERE id=?').get(records[0]!.id)!.payload) as EmotionalRecord,history=timeline(record.id),provider=calls(record.id);
    const detail={scope:'preview',flow:summary(record),events:history.map(e=>({...e,details:metadata(e.details)})),calls:provider.map(c=>({key:c.key,at:c.at,status:c.status,model:c.receipt?.model??c.request.model,latencyMs:c.receipt?.latencyMs??null,inputTokens:c.receipt?.inputTokens??null,outputTokens:c.receipt?.outputTokens??null,reservedCostUsd:c.reservedCostUsd,estimatedCostUsd:c.estimatedCostUsd,issue:c.receipt?.issue??null}))};
    if(!exportContent)return detail;
    const directory=join(dirname(realpathSync(file)),'diagnostics');
    if(!existsSync(directory))mkdirSync(directory,{mode:0o700});
    const info=lstatSync(directory);if(!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o077)!==0)throw new UsageError('The diagnostic export directory must be private and must not be a symlink.');
    const exportPath=join(directory,record.id+'-'+randomUUID()+'.json');
    writeFileSync(exportPath,JSON.stringify({scope:'preview',exportedAt:new Date().toISOString(),flow:detail.flow,conversation:record.messages,profile:record.profile,events:history,calls:provider,checkpoint:{world:record.checkpoint.world,initialComplete:record.checkpoint.initialComplete,repairPass:record.checkpoint.repairPass,repairPlan:record.checkpoint.repairPlan,repairsComplete:record.checkpoint.repairsComplete},decisions:record.state?.players.map(p=>({actor:p.id,decisions:p.decisions}))??[]},null,2)+'\n',{mode:0o600,flag:'wx'});
    return{scope:'preview',flow:detail.flow,exportPath};
  }finally{db.close();}
}
try{process.stdout.write(JSON.stringify(run(process.argv.slice(2)),null,2)+'\n');}
catch(reason){process.stderr.write((reason instanceof UsageError?reason.message:'Could not read private SEALED diagnostics. Check the database path and access.')+'\n');process.exitCode=1;}
