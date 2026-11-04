export type PlaceId = 'reception' | 'lounge' | 'kitchen' | 'generator' | 'office';
export type Role = 'technician' | 'guest';
export type Ending = 'success' | 'partial' | 'failure';
export type Condition =
  | { type: 'fact' | 'evidence' | 'done' | 'npc'; id: string }
  | { type: 'flag'; id: string; value: boolean }
  | { type: 'all' | 'any'; conditions: Condition[] };
export type Effect =
  | { type: 'fact' | 'evidence'; id: string }
  | { type: 'flag'; id: string; value: boolean };
export interface Place {
  id: PlaceId; name: string; description: string;
  exits: { to: PlaceId; durationMs: number }[];
}
export interface Npc {
  id: string; name: string; archetype: string;
  agenda: { from: number; until: number; placeId: PlaceId | null; fromPlace?: PlaceId; toPlace?: PlaceId }[];
}
export interface ActionDefinition {
  id: string; kind: 'examine' | 'talk' | 'observe' | 'use'; label: string;
  placeId: PlaceId; durationMs: number; opensAt?: number; closesAt?: number;
  requires?: Condition; effects: Effect[]; text: string; once?: boolean; irreversible?: boolean;
}
export interface ScheduledEvent {
  id: string; at: number; placeId?: PlaceId; public: boolean; text: string;
  requires?: Condition; effects: Effect[]; otherwiseText?: string;
}
export interface WorldDefinition {
  id: string; title: string; origin: 'prepared' | 'meta'; engineVersion: string;
  schemaVersion: number; seed: string;
  config?: { role: Role; tone: string; detail: string };
  window: { startLabel: string; endLabel: string; durationMs: number; scale: number };
  players: { id: string; role: Role; startPlace: PlaceId; initialFacts: string[] }[];
  places: Place[]; npcs: Npc[]; facts: { id: string; text: string }[];
  actions: ActionDefinition[]; scheduledEvents: ScheduledEvent[];
  endings: { id: Ending; requires?: Condition; text: string }[];
  reminders?: { id: string; at: number; label: string; knownFacts: string[]; knownEvents: string[] }[];
  closure?: {
    truth: string; prevented: Condition;
    prevention: ClosureCheck[]; documentation: ClosureCheck[];
    moments: { eventId: string; title: string }[];
  };
}
export interface ClosureCheck { id: string; label: string; requires: Condition; metText: string; missingText: string }
export interface ActionInput { actor: string; actionId: string; submittedAtGame: number; serverSequence: number; requestId: string; confirmed?: boolean }
export interface PendingAction {
  id: string; actor: string; label: string; startedAt: number; endsAt: number;
  sequence: number; requestId: string; from: PlaceId; to?: PlaceId;
}
export interface PlayerState { placeId: PlaceId; facts: string[]; evidence: string[]; completed: string[]; busy: PendingAction | null }
export interface DomainEvent { id: string; at: number; text: string; placeId?: PlaceId; actor?: string; perceivedBy: string[]; cause?: string; kind: string }
export interface GameState {
  now: number; players: Record<string, PlayerState>; flags: Record<string, boolean>;
  events: DomainEvent[]; actions: ActionInput[]; processedEvents: string[];
  lastSequence: number; finished: boolean; results: Record<string, Ending>;
}
export interface SuggestedAction {
  id: string; label: string; kind: string; durationMs: number; irreversible: boolean;
  timing?: { startBefore: number; finishBefore: number };
  wait?: { until: number; reminder?: string; warning?: string };
}
export interface Debrief {
  truth: string; prevented: boolean;
  prevention: { id: string; label: string; met: boolean; explanation: string }[];
  documentation: { id: string; label: string; met: boolean; explanation: string }[];
  moments: { eventId: string; title: string; at: number; text: string; placeName?: string; playerLocation: string; witnessed: boolean }[];
}
export interface PlayerView {
  playerId: string; title: string; origin: 'prepared' | 'meta'; role: Role;
  now: number; window: { startLabel: string; endLabel: string; durationMs: number; scale: number };
  place: { id: PlaceId; name: string; description: string };
  npcs: { id: string; name: string; archetype: string }[];
  facts: { id: string; text: string }[]; evidence: { id: string; text: string }[];
  history: DomainEvent[]; actions: SuggestedAction[]; busy: PendingAction | null;
  finished: boolean; ending: Ending | null; endingText: string | null;
}
export interface TimeAdvanceReceipt {
  requestId: string; requestedUntil: number; reachedAt: number;
  reason: 'announcement' | 'local-event' | 'task-completed' | 'target';
  taskRequestId?: string;
}
export interface SessionSnapshot {
  id: string; hash: string; phase: 'sealed' | 'playing' | 'finished';
  view: PlayerView; clock: { serverNow: number; gameNow: number; scale: number; paused: boolean };
  advance?: TimeAdvanceReceipt;
}
export interface JourneyConfig { role:Role; tone:'tension'|'melancholy'; detail:string }
export type PreparationStatus='queued'|'generating'|'repairing'|'validating'|'ready'|'failed';
export interface PreparationSnapshot {
  id:string; requestId:string; status:PreparationStatus; config:JourneyConfig;
  model:string; sessionId?:string; errorCode?:'generation_failed'|'interrupted'|'unavailable';
}
export interface JourneySetup { meta:{available:boolean;model:string|null} }
export interface Reveal {
  canonical: string; hash: string; events: DomainEvent[];
  actions: ActionInput[]; ending: Ending;
  debrief?: Debrief | null;
}
