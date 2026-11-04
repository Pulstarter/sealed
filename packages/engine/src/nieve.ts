import type { ActionDefinition, Condition, Effect, Npc, PlaceId, Role, WorldDefinition } from './types.js';

const minute = (n: number) => n * 60_000;
const flag = (id: string, value = true): Condition => ({ type: 'flag', id, value });
const fact = (id: string): Condition => ({ type: 'fact', id });
const evidence = (id: string): Condition => ({ type: 'evidence', id });
const all = (...conditions: Condition[]): Condition => ({ type: 'all', conditions });
const any = (...conditions: Condition[]): Condition => ({ type: 'any', conditions });
const grant = (id: string): Effect => ({ type: 'fact', id });
const proof = (id: string): Effect => ({ type: 'evidence', id });
const set = (id: string): Effect => ({ type: 'flag', id, value: true });
const tech = any(evidence('tech_relay'), evidence('tech_radio'));
const plan = any(evidence('plan_statement'), evidence('plan_photo'));

function action(id: string, placeId: PlaceId, label: string, text: string, effects: Effect[], extra: Partial<ActionDefinition> = {}): ActionDefinition {
  return { id, placeId, label, text, effects, durationMs: 100_000, kind: 'examine', once: true, ...extra };
}
function agenda(id: string, name: string, archetype: string, points: { at: number; place: PlaceId }[], trips: { from: number; until: number; origin: PlaceId; target: PlaceId }[] = []): Npc {
  const segments: Npc['agenda'] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const next = points[i + 1];
    const trip = trips.find(t => t.from >= p.at && (!next || t.until === next.at));
    segments.push({ from: p.at, until: trip?.from ?? next?.at ?? minute(60) + 1, placeId: p.place });
    if (trip) segments.push({ from: trip.from, until: trip.until, placeId: null, fromPlace: trip.origin, toPlace: trip.target });
  }
  return { id, name, archetype, agenda: segments };
}

export function createPreparedWorld(role: Role = 'technician'): WorldDefinition {
  const definitions = [
    ['departure', 'The snowplough leaves at 22:00. Keep the lodge money safe and document any wrongdoing.'],
    ['first_windows', 'At 21:20 Vera checks the generator while Leo tests the radio in reception. Each visit ends at 21:24.'],
    ['manifest_due', 'The final vehicle manifest arrives in Reception at 21:44; the cargo reaches Reception at 21:50.'],
    ['meeting_rumor', 'Ada expects a private meeting later. Ask again after the first inspections.'],
    ['storm', 'The snow keeps the lodge isolated. The scheduled snowplough is the last departure.'],
    ['pressure_hint', 'Bruno is anxious about a conversation with Vera, around 21:35 in the kitchen.'],
    ['protocol', 'A safe cargo hold requires identifying the remote command and the final cargo manifest.'],
    ['risk_id', 'The remote command identifier is R7. The anomaly can be linked to the departure manifest.'],
    ['plate', 'The control plate confirms that R7 affects the departing vehicle.'],
    ['risk_copy', 'You have documented the control anomaly for a custody report.'],
    ['radio_aftermath', 'The radio test is over. Leo cannot recreate the original signal as first-hand evidence.'],
    ['second_windows', 'At 21:35 Vera meets Bruno in the kitchen while Ada checks a document in the office. Both end at 21:39.'],
    ['kit', 'You have a numbered tamper-evident seal and a notebook for documenting custody.'],
    ['saw_coercion', 'You personally heard Vera instruct Bruno to hide the money transfer.'],
    ['photo_seen', 'You saw Ada photograph the signed money-transfer order.'],
    ['manifest', 'The final manifest identifies cargo C17 and the control command R7.'],
    ['matching_vehicle', 'The anomalous command matches the vehicle carrying C17.'],
    ['hold_order', 'Leo has prepared a hold. It takes effect only after you identify and seal the arriving case.'],
    ['case_identified', 'The arriving case is C17. It contains the lodge money.'],
    ['seal_checked', 'The numbered seal is intact; Leo can record custody.'],
    ['tech_relay', 'First-hand record of Vera changing the R7 control.'],
    ['tech_radio', 'First-hand record of the anomalous R7 radio command.'],
    ['plan_statement', 'Bruno signed a statement about Vera’s order to divert the money.'],
    ['plan_photo', 'Ada supplied a photograph of the signed money-transfer order.'],
    ['custody', 'Leo signed the custody record for the retained case.'],
  ];
  const places: WorldDefinition['places'] = [
    { id: 'reception', name: 'Reception', description: 'Snow brushes the windows beside the departure desk.', exits: ['lounge', 'generator', 'office'].map(to => ({ to: to as PlaceId, durationMs: 100_000 })) },
    { id: 'lounge', name: 'Dining lounge', description: 'A warm fire and a long table offer a little shelter from the storm.', exits: ['reception', 'kitchen'].map(to => ({ to: to as PlaceId, durationMs: 100_000 })) },
    { id: 'kitchen', name: 'Kitchen', description: 'Bruno works beside the stove. Voices carry only within the room.', exits: [{ to: 'lounge', durationMs: 100_000 }] },
    { id: 'generator', name: 'Generator room', description: 'The vehicle-control terminal sits beside the lodge equipment.', exits: [{ to: 'reception', durationMs: 100_000 }] },
    { id: 'office', name: 'Office', description: 'A desk holds the lodge’s ordinary paperwork.', exits: [{ to: 'reception', durationMs: 100_000 }] },
  ];
  const actions: ActionDefinition[] = [
    action('notice', 'reception', 'Read the departure notice', 'Departure is at 22:00. The lodge asks you to keep the money safe and document what happens.', [grant('departure')], { durationMs: 50_000 }),
    action('leo_intro', 'reception', 'Ask Leo about tonight', 'Leo mentions simultaneous inspections at 21:20, ending at 21:24.', [grant('first_windows')], { kind: 'talk', requires: { type: 'npc', id: 'leo' } }),
    action('vehicle_notes', 'reception', 'Check the departure board', 'The manifest reaches Reception at 21:44 and the cargo at 21:50.', [grant('manifest_due')]),
    action('ada_intro', 'lounge', 'Ask Ada about the guests', 'Ada is watching for a private meeting later in the evening.', [grant('meeting_rumor')], { kind: 'talk', requires: { type: 'npc', id: 'ada' } }),
    action('window_notes', 'lounge', 'Check the storm outside', 'No other vehicle can reach the lodge tonight.', [grant('storm')]),
    action('bruno_intro', 'kitchen', 'Ask Bruno about the schedule', 'Bruno expects Vera at 21:35. He looks worried.', [grant('pressure_hint')], { kind: 'talk', requires: { type: 'npc', id: 'bruno' } }),
    action('safety_diagram', 'kitchen', 'Read the safety protocol', 'A cargo hold needs an identified anomaly and the final manifest.', [grant('protocol')], { durationMs: 50_000 }),
    action('observe_relay', 'generator', 'Watch the control inspection', 'You record Vera changing the R7 control.', [proof('tech_relay'), grant('risk_id')], { kind: 'observe', opensAt: minute(20), closesAt: minute(24), requires: { type: 'npc', id: 'vera' } }),
    action('observe_radio', 'reception', 'Witness the radio test', 'You document the anomalous R7 command with Leo.', [proof('tech_radio'), grant('risk_id')], { kind: 'observe', opensAt: minute(20), closesAt: minute(24), requires: { type: 'npc', id: 'leo' } }),
    action('control_plate', 'generator', 'Read the control plate', 'The R7 identifier controls the departure vehicle.', [grant('plate')], { durationMs: 50_000, requires: tech }),
    action('copy_risk', 'generator', 'Copy the anomaly record', 'You preserve the anomaly details in your notes.', [grant('risk_copy')], { requires: tech }),
    action('leo_update', 'reception', 'Ask about the finished test', 'Leo cannot reproduce the signal as fresh evidence.', [grant('radio_aftermath')], { kind: 'talk', opensAt: minute(24), requires: { type: 'npc', id: 'leo' } }),
    action('ada_update', 'lounge', 'Ask Ada about the meeting', 'At 21:35, Vera meets Bruno in the kitchen while Ada checks the office. Both opportunities end at 21:39.', [grant('second_windows')], { kind: 'talk', opensAt: minute(24), requires: { type: 'npc', id: 'ada' } }),
    action('materials', 'lounge', 'Collect the documentation kit', 'You collect a numbered seal and a notebook.', [grant('kit')]),
    action('witness_coercion', 'kitchen', 'Listen to the private meeting', 'You hear Vera tell Bruno to conceal the money transfer.', [grant('saw_coercion')], { kind: 'observe', opensAt: minute(35), closesAt: minute(39), requires: all({ type: 'npc', id: 'vera' }, { type: 'npc', id: 'bruno' }) }),
    action('statement', 'kitchen', 'Obtain Bruno’s statement', 'Bruno signs a statement confirming what you heard.', [proof('plan_statement')], { kind: 'talk', opensAt: minute(35), closesAt: minute(39), requires: all(fact('saw_coercion'), { type: 'npc', id: 'bruno' }) }),
    action('witness_photo', 'office', 'See what Ada found', 'You see Ada photograph a signed transfer order.', [grant('photo_seen')], { kind: 'observe', opensAt: minute(35), closesAt: minute(39), requires: { type: 'npc', id: 'ada' } }),
    action('copy_photo', 'office', 'Copy Ada’s photograph', 'Ada gives you a copy of the signed transfer order.', [proof('plan_photo')], { kind: 'talk', opensAt: minute(35), closesAt: minute(39), requires: all(fact('photo_seen'), { type: 'npc', id: 'ada' }) }),
    action('manifest', 'reception', 'Examine the final manifest', 'The manifest identifies cargo C17 and command R7.', [grant('manifest')], { opensAt: minute(44), requires: flag('manifestReady') }),
    action('correlate', 'reception', 'Match the control identifier', 'R7 links the anomaly to cargo C17.', [grant('matching_vehicle')], { requires: all(tech, fact('manifest')) }),
    action('brief_leo', 'reception', 'Prepare a cargo hold with Leo', 'Leo prepares the hold. Identify and seal the arriving case before 21:58.', [grant('hold_order'), set('holdPrepared')], { kind: 'talk', requires: all(fact('matching_vehicle'), { type: 'npc', id: 'leo' }) }),
    action('inspect_case', 'reception', 'Identify the arriving case', 'The case is C17 and contains the lodge money.', [grant('case_identified')], { opensAt: minute(50), closesAt: minute(58), requires: flag('caseAtReception') }),
    action('seal_case', 'reception', 'Hold and seal the case', 'You seal C17. Leo admits the hold; the money cannot depart.', [set('caseSealed'), set('holdRequested')], { kind: 'use', opensAt: minute(50), closesAt: minute(58), requires: all(tech, fact('manifest'), fact('case_identified'), fact('kit'), flag('holdPrepared')), irreversible: true }),
    action('check_seal', 'reception', 'Check the numbered seal', 'The seal is intact. Leo can sign the custody record.', [grant('seal_checked')], { durationMs: 50_000, requires: flag('caseSealed') }),
    action('custody', 'reception', 'Record custody with Leo', 'Leo signs custody of the retained case.', [proof('custody')], { kind: 'talk', requires: all(fact('seal_checked'), { type: 'npc', id: 'leo' }) }),
  ];
  return {
    id: `nieve-v2-${role}`, title: 'Snowbound at the lodge', origin: 'prepared',
    engineVersion: 'sealed-0.2', schemaVersion: 1, seed: 'nieve-reference-1',
    window: { startLabel: '21:00', endLabel: '22:00', durationMs: minute(60), scale: 5 },
    players: [{ id: 'p1', role, startPlace: 'reception', initialFacts: role === 'technician' ? ['protocol'] : ['meeting_rumor'] }],
    places,
    npcs: [
      agenda('vera', 'Vera', 'Director', [{ at: 0, place: 'office' }, { at: minute(20), place: 'generator' }, { at: minute(29), place: 'kitchen' }, { at: minute(44), place: 'office' }, { at: minute(50), place: 'reception' }], [{ from: 1_000_000, until: minute(20), origin: 'office', target: 'generator' }, { from: minute(24), until: minute(29), origin: 'generator', target: 'kitchen' }, { from: minute(39), until: minute(44), origin: 'kitchen', target: 'office' }, { from: 2_900_000, until: minute(50), origin: 'office', target: 'reception' }]),
      agenda('bruno', 'Bruno', 'Cook', [{ at: 0, place: 'kitchen' }]),
      agenda('ada', 'Ada', 'Guest', [{ at: 0, place: 'lounge' }, { at: minute(35), place: 'office' }, { at: 2_540_000, place: 'lounge' }], [{ from: 1_900_000, until: minute(35), origin: 'lounge', target: 'office' }, { from: minute(39), until: 2_540_000, origin: 'office', target: 'lounge' }]),
      agenda('leo', 'Leo', 'Guide', [{ at: 0, place: 'reception' }]),
    ],
    facts: definitions.map(([id, text]) => ({ id: id!, text: text! })),
    actions,
    scheduledEvents: [
      { id: 'welcome', at: 0, public: true, text: 'Prepared reference adventure. Departure is at 22:00; investigate and keep the lodge money safe.', effects: [] },
      { id: 'first-signal', at: minute(16), public: true, text: 'The announced inspections begin at 21:20: generator and reception, until 21:24. You cannot witness both.', effects: [] },
      { id: 'a1', at: minute(20), placeId: 'generator', public: false, text: 'Vera starts working at the vehicle-control terminal.', effects: [] },
      { id: 'a2', at: minute(20), placeId: 'reception', public: false, text: 'Leo begins the radio test. An odd command cuts through the static.', effects: [] },
      { id: 'a1-close', at: minute(24), placeId: 'generator', public: false, text: 'Vera finishes the inspection and leaves.', effects: [] },
      { id: 'a2-close', at: minute(24), placeId: 'reception', public: false, text: 'The signal is gone; the radio test is over.', effects: [] },
      { id: 'second-signal', at: minute(30), public: true, text: 'The next encounters are at 21:35: kitchen and office, until 21:39. Choose where to be.', effects: [] },
      { id: 'b1', at: minute(35), placeId: 'kitchen', public: false, text: 'Vera approaches Bruno and lowers her voice.', effects: [] },
      { id: 'b2', at: minute(35), placeId: 'office', public: false, text: 'Ada finds a document and raises her camera.', effects: [] },
      { id: 'b1-close', at: minute(39), placeId: 'kitchen', public: false, text: 'The private meeting ends. Bruno returns to work.', effects: [] },
      { id: 'b2-close', at: minute(39), placeId: 'office', public: false, text: 'Ada puts away the photograph and leaves the office.', effects: [] },
      { id: 'manifest-arrival', at: minute(44), placeId: 'reception', public: false, text: 'The final cargo manifest arrives at the desk.', effects: [set('manifestReady')] },
      { id: 'case-arrival', at: minute(50), placeId: 'reception', public: false, text: 'Vera arrives with the case marked C17. Loading starts.', effects: [set('caseAtReception')] },
      { id: 'hold-deadline', at: minute(58), public: true, text: 'The driver closes loading. No further hold can be admitted.', effects: [] },
      { id: 'departure-held', at: minute(60), public: true, text: 'Leo retains the sealed case. The money stays at the lodge.', requires: flag('caseSealed'), effects: [set('moneyRetained')] },
      { id: 'departure-lost', at: minute(60), public: true, text: 'The snowplough leaves with the lodge money. The opportunity is gone.', requires: flag('caseSealed', false), effects: [] },
    ],
    endings: [
      { id: 'success', requires: all(flag('moneyRetained'), tech, plan, evidence('custody')), text: 'The money is safe. You documented the plan and preserved custody.' },
      { id: 'partial', requires: flag('moneyRetained'), text: 'The money is safe, but the evidence or custody record is incomplete.' },
      { id: 'failure', text: 'The money left the lodge. Knowing the truth was not enough.' },
    ],
    reminders: [
      {id:'inspection',at:minute(20),label:'Announced inspections: Generator or Reception',knownFacts:['first_windows'],knownEvents:['first-signal']},
      {id:'inspection-end',at:minute(24),label:'Announced inspections end',knownFacts:['first_windows'],knownEvents:['first-signal']},
      {id:'kitchen-meeting',at:minute(35),label:'Announced meeting in the Kitchen',knownFacts:['pressure_hint','second_windows'],knownEvents:['second-signal']},
      {id:'office-document',at:minute(35),label:'Announced document check in the Office',knownFacts:['second_windows'],knownEvents:['second-signal']},
      {id:'encounters-end',at:minute(39),label:'Announced encounters end',knownFacts:['second_windows'],knownEvents:['second-signal']},
      {id:'manifest',at:minute(44),label:'Expected manifest in Reception',knownFacts:['manifest_due'],knownEvents:[]},
      {id:'cargo',at:minute(50),label:'Expected cargo in Reception',knownFacts:['manifest_due'],knownEvents:[]},
      {id:'hold-deadline',at:minute(58),label:'Last cargo-hold deadline',knownFacts:['hold_order','case_identified'],knownEvents:[]},
      {id:'departure',at:minute(60),label:'Scheduled departure',knownFacts:['departure'],knownEvents:['welcome']},
    ],
    closure: {
      truth: 'Vera planned to divert the lodge’s money in case C17 on the 22:00 departure. R7 is the control command linked to the vehicle carrying C17. The generator inspection and radio test offered alternative ways to identify the anomaly. The kitchen meeting and the office document offered alternative evidence of the transfer plan.',
      prevented: flag('moneyRetained'),
      prevention: [
        {id:'technical',label:'Identify the technical anomaly',requires:tech,metText:'You obtained a first-hand record of R7.',missingText:'Witness a complete generator inspection or radio test; hearing that it happened is not a collected record.'},
        {id:'manifest',label:'Read the final manifest',requires:fact('manifest'),metText:'You obtained the final C17/R7 manifest.',missingText:'Examine the manifest in Reception after its announced arrival.'},
        {id:'match',label:'Match the command to the cargo',requires:fact('matching_vehicle'),metText:'You linked R7 to the vehicle carrying C17.',missingText:'Use the anomaly record and final manifest to establish the match.'},
        {id:'prepare',label:'Prepare the hold with Leo',requires:flag('holdPrepared'),metText:'Leo was ready to admit the hold.',missingText:'Brief Leo in Reception once the anomaly and manifest are matched.'},
        {id:'kit',label:'Collect the documentation kit',requires:fact('kit'),metText:'You had the numbered seal and notebook.',missingText:'Collect the numbered seal and notebook in the Dining lounge.'},
        {id:'identify',label:'Identify the arriving case',requires:fact('case_identified'),metText:'You identified the arriving case as C17.',missingText:'Examine the cargo in Reception after it arrives at 21:50.'},
        {id:'seal',label:'Complete the hold and seal before 21:58',requires:flag('caseSealed'),metText:'The completed seal made the hold effective.',missingText:'Confirm and complete the seal before 21:58. Preparing a hold alone does not stop departure.'},
      ],
      documentation: [
        {id:'plan',label:'Document the transfer plan',requires:plan,metText:'You obtained Bruno’s statement or Ada’s photograph.',missingText:'During the announced meeting, obtain a signed statement or a copy of the photograph after witnessing the relevant scene.'},
        {id:'custody',label:'Record custody of the retained case',requires:evidence('custody'),metText:'Leo signed the custody record after you checked the seal.',missingText:'Check the completed numbered seal, then obtain Leo’s custody record.'},
      ],
      moments: [
        {eventId:'a1',title:'The control inspection'}, {eventId:'a2',title:'The radio test'},
        {eventId:'b1',title:'The private meeting'}, {eventId:'b2',title:'The transfer document'},
        {eventId:'case-arrival',title:'The cargo reaches Reception'},
      ],
    },
  };
}

export const referenceRoute: (string | number)[] = [
  'notice', 'leo_intro', 'vehicle_notes', 'move:lounge', 'ada_intro', 'window_notes',
  'move:kitchen', 'bruno_intro', 'safety_diagram', 'move:lounge', 'move:reception', 'move:generator',
  1_200_000, 'observe_relay', 'control_plate', 'copy_risk', 'move:reception', 'leo_update',
  'move:lounge', 'ada_update', 'materials', 'move:kitchen', 2_100_000,
  'witness_coercion', 'statement', 'move:lounge', 'move:reception', 2_640_000,
  'manifest', 'correlate', 'brief_leo', 3_000_000, 'inspect_case', 'seal_case', 'check_seal', 'custody', 3_600_000,
];
