import type { DomainEvent, SuggestedAction, TimeAdvanceReceipt } from '../../../../packages/engine/src/types.js';

export function worldTime(elapsed: number, start: string): string {
  const [hour = 0, minute = 0] = start.split(':').map(Number);
  const total = (hour * 60 + minute + Math.floor(Math.max(0, elapsed) / 60_000)) % 1440;
  return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}

export function extrapolateClock(clock: { gameNow: number; scale: number; paused: boolean; serverNow: number }, receivedAt: number, localNow: number, duration: number): number {
  const elapsed = clock.paused ? 0 : Math.max(0, localNow - receivedAt) * clock.scale;
  return Math.max(0, Math.min(duration, clock.gameNow + elapsed));
}

export function realDuration(duration: number, scale: number): string {
  const seconds = Math.ceil(duration / Math.max(1, scale) / 1000);
  return seconds < 60 ? `${seconds} sec` : `${Math.ceil(seconds / 60)} min`;
}

export function worldTimePrecise(elapsed: number, start: string): string {
  return `${worldTime(elapsed,start)}:${(Math.floor(Math.max(0,elapsed)/1000)%60).toString().padStart(2,'0')}`;
}
export function gameDuration(duration: number): string {
  const seconds=Math.max(0,Math.ceil(duration/1000));
  return seconds>=60?`${Math.floor(seconds/60)}m${seconds%60?` ${seconds%60}s`:''}`:`${seconds}s`;
}
export function actionLabel(action: SuggestedAction,start: string,busy=false): string {
  if(!action.wait)return action.label;
  if(busy)return 'Skip remaining wait';
  const until=action.wait.until;
  return `Advance time to ${until%60_000?worldTimePrecise(until,start):worldTime(until,start)}`;
}
export function waitSaving(action:SuggestedAction,now:number,scale:number):string {
  const remaining=(action.wait?.until??now)-now;
  return remaining<=0?'Updating time…':`Save up to ${realDuration(remaining,scale)} real`;
}
export function orderActions(actions:SuggestedAction[],busy:boolean):SuggestedAction[] {
  const score=(action:SuggestedAction)=>busy&&action.wait?-1:action.id==='cancel'?99:action.irreversible?0:action.kind==='observe'?1:action.kind==='use'?2:action.kind==='talk'?3:action.kind==='examine'?4:action.kind==='move'?5:6;
  return [...actions].sort((a,b)=>score(a)-score(b));
}
export function advanceMessage(receipt:TimeAdvanceReceipt,start:string):string {
  const time=receipt.reachedAt%60_000?worldTimePrecise(receipt.reachedAt,start):worldTime(receipt.reachedAt,start);
  if(receipt.reason==='announcement')return `Fast-forward stopped at ${time} for a lodge announcement.`;
  if(receipt.reason==='local-event')return `Fast-forward stopped at ${time} for an event here.`;
  return receipt.reason==='task-completed'?`Task finished at ${time}.`:`Time advanced to ${time}.`;
}
export function windowHint(action:SuggestedAction,_now:number,_scale:number,start:string):string {
  return action.timing?`Start before ${worldTimePrecise(action.timing.startBefore,start)} · finish before ${worldTime(action.timing.finishBefore,start)}`:'';
}
export function startCountdown(action:SuggestedAction,now:number,scale:number):string {
  if(!action.timing)return '';
  const remaining=(action.timing.startBefore-now)/scale/1000;
  return remaining<=0?'Too late to finish in time':remaining<1?'Less than 1 real sec left to start':`${Math.ceil(remaining)} real sec left to start`;
}
export function planStatus(id:string,events:DomainEvent[],plannedText?:string):string {
  const event=events.find(e=>e.id===`world:${id}`);
  return !event?'Not triggered':plannedText&&event.text!==plannedText?'Alternative occurred':'Occurred';
}

export async function verifyCommitment(canonical: string, initial: string | undefined): Promise<{ status: 'match' | 'mismatch' | 'missing'; computed: string }> {
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const computed = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return { status: !initial ? 'missing' : computed === initial.toLowerCase() ? 'match' : 'mismatch', computed };
}

export function rememberCommitment(storage: Pick<Storage, 'getItem' | 'setItem'>, id: string, hash: string, phase: 'sealed' | 'playing' | 'finished' = 'sealed'): { hash: string | undefined; retained: boolean } {
  const key = `sealed:commitment:${id}`;
  try {
    const prior = storage.getItem(key);
    if (prior && /^[a-f0-9]{64}$/i.test(prior)) return { hash: prior.toLowerCase(), retained: true };
    if (phase !== 'sealed') return { hash: undefined, retained: false };
    storage.setItem(key, hash.toLowerCase());
    return { hash: hash.toLowerCase(), retained: true };
  } catch {
    return { hash: phase === 'sealed' ? hash.toLowerCase() : undefined, retained: false };
  }
}
