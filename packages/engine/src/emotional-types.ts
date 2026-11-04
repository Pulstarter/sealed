import type {StoryDecision,StoryInput} from './story-types.js';

export type EmotionalChoice='A'|'B'|'T';
export interface EmotionalPerson {name:string;gesture:string;public_wish:string}
export interface EmotionalStory {tension:string;anchor:string;scene_two:string;scene_three:string;sealed_truth:string}
export interface EmotionalVisual {material:string;subject:string;figures:'none'|'one'|'two';detail_one:string;detail_two:string;detail_three:string}
export interface EmotionalWorld {
  title:string;player_name:string;host:EmotionalPerson;recipient:EmotionalPerson;
  venue:{name:string;atmosphere:string;TABLE:string;VIEWING:string;PUBLIC:string;ARCHIVE_surface:string;BOX_surface:string};
  work:{name:string;appearance:string;visual?:EmotionalVisual;format?:'single-unframed'};record:{name:string;exterior:string;inside:string};
  private_reason:string;public_hook:string;shared_past_memory:string;public_motif_one:string;public_motif_two:string;future_question:string;
  story?:EmotionalStory;
  choicePolicy?:'two-buttons-and-timeout';
  reactionPolicy?:'public-only';
  prosePolicy?:'story-facts'|'scene-prose'|'scene-prose-2'|'scene-prose-3';
  dramaticPolicy?:{version:'story-specific-1'|'story-specific-2'|'story-specific-3';intensity:EmotionalProfile['intensity']};
  factualPolicy?:'post-deposit'|'post-deposit-compact';
  referencePolicy?:'wish-pairs';
  endingPolicy?:'present-reactions-1'|'outcome-reactions-1'|'outcome-reactions-2';
  retainedVisibility?:'unchanged';
  narrationPolicy?:'protagonist-camera-1'|'protagonist-camera-2'|'protagonist-camera-3'|'protagonist-camera-4'|'protagonist-camera-5';
}
export type EmotionalWorldDraft=Omit<EmotionalWorld,'public_hook'|'venue'|'record'>&{venue:Pick<EmotionalWorld['venue'],'name'|'atmosphere'|'ARCHIVE_surface'|'BOX_surface'>;record:Pick<EmotionalWorld['record'],'name'|'exterior'>};
export interface EmotionalProfile {
  mood:string;direction:'accompany'|'shift'|'unspecified';experience:string;exclusions:string[];intensity:'gentle'|'moderate'|'tense'|'unspecified';
}
export type EmotionalSpeaker='NARRATOR'|'PLAYER'|'HOST'|'RECIPIENT';
export interface EmotionalPassage {speaker:EmotionalSpeaker;addressee:Exclude<EmotionalSpeaker,'NARRATOR'>|'NONE';text:string;lead?:string;tail?:string}
export interface EmotionalBlock {text:string;claims:string[];passages?:EmotionalPassage[]}
export interface EmotionalArt {id:'scene'|'host'|'recipient';sha256:string;mime:'image/webp'|'image/png'|'image/jpeg';alt:string}
export interface EmotionalArtifact {version:'emotional-1'|'emotional-2';players:{id:string;name:string}[];world:EmotionalWorld;blocks:Record<string,EmotionalBlock>;factualText:Record<string,Record<string,string>>;art:EmotionalArt[]}
export interface EmotionalPlayer {id:string;node:string;phase:'sealed'|'reading'|'deciding'|'finished';deadline:number|null;decisions:StoryDecision[];visited:string[]}
export interface EmotionalState {version:'emotional-1';players:EmotionalPlayer[];revision:number;lastSequence:number;lastAt:number;lastRequestId:string|null}
export interface EmotionalInput extends Omit<StoryInput,'kind'> {kind:'start'|'continue'|'begin'|'choose'}
export interface EmotionalScene {id:string;title:string;paragraphs:string[];decision?:{id:'D1'|'D2'|'D3';durationMs:number;prompt:string;inaction:string;options:{id:'A'|'B';label:string;cost?:string}[]}}
export interface EmotionalView {
  revision:number;title:string;goal:string;playerName:string;phase:EmotionalPlayer['phase'];scene:EmotionalScene;deadline:number|null;decisions:StoryDecision[];
  history:{id:string;title:string;paragraphs:string[]}[];lastRequestId:string|null;ending:null|{id:string;explanation:string[];closedChoices:{decision:string;choice:EmotionalChoice;label:string}[]};art:EmotionalArt[];
}
export interface EmotionalFlowSnapshot {
  id:string;generation:number;createdAt:number;revision:number;serverNow:number;
  status:'chat'|'chatting'|'proposal'|'queued'|'generating'|'ready'|'playing'|'finished'|'failed';
  messages:{role:'assistant'|'user';kind:'question'|'answer'|'proposal'|'redirect';content:string}[];
  profile:EmotionalProfile;seal:string|null;progress:null|{done:number;total:number;label:string};error:string|null;lastRequestId:string;adventure:EmotionalView|null;
}
