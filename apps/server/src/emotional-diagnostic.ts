import {MetaError} from './emotional-meta.js';

// Only authored validation messages enter the diagnostic trail. Never copy an
// arbitrary exception, request headers or credentials into it.
export class EmotionalDiagnosticError extends Error {
  constructor(readonly stage:'chat'|'world'|'validation',readonly code:string,message:string,readonly details:Record<string,unknown>={}){super(message);}
}
export function emotionalFailure(reason:unknown){
  if(reason instanceof EmotionalDiagnosticError)return {stage:reason.stage,code:reason.code,message:reason.message,...reason.details};
  if(reason instanceof MetaError)return {stage:'provider',code:'provider_'+(reason.receipt?.status??'unavailable'),message:reason.message,callKey:reason.receipt?.key??null,model:reason.receipt?.model??null};
  const exceptionType=reason instanceof Error&&['TypeError','RangeError','SyntaxError','ReferenceError'].includes(reason.name)?reason.name:'Error';
  return {stage:'runtime',code:'internal_error',message:'Unexpected internal failure.',exceptionType};
}
export type EmotionalEventKind='conversation_started'|'chat_submitted'|'chat_accepted'|'preparation_confirmed'|'generation_started'|'provider_started'|'provider_finished'|'validation_completed'|'repair_planned'|'adventure_sealed'|'operation_failed'|'action_accepted'|'action_rejected'|'request_rejected'|'decision_timed_out'|'process_interrupted'|'generation_resumed';
