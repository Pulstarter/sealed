export type StoryChoice='A'|'B'|'T';
export interface StoryDecision {id:'D1'|'D2'|'D3';choice:StoryChoice;actor:string;at:number;sequence:number}
export interface StoryPlayer {id:string;node:string;phase:'reading'|'deciding'|'finished';deadline:number|null;decisions:StoryDecision[]}
export interface StoryState {version:string;players:StoryPlayer[];revision:number;lastSequence:number;lastAt:number;lastRequestId:string|null}
export interface StoryInput {actor:string;node:string;kind:'continue'|'begin'|'choose';choice?:'A'|'B';at:number;sequence:number;requestId:string}
export interface StoryScene {id:string;title:string;chapter:number;paragraphs:string[];art:number;decision?:{id:'D1'|'D2'|'D3';durationMs:number;prompt:string;options:{id:'A'|'B';label:string}[]}}
export interface StorySnapshot {
  id:string;startRequestId:string;generation:number;revision:number;serverNow:number;version:string;title:string;goal:string;
  phase:StoryPlayer['phase'];scene:StoryScene;deadline:number|null;lastRequestId:string|null;
  decisions:StoryDecision[];lastDecision:StoryDecision|null;
  ending:null|{id:string;title:string;explanation:string[]};
}
