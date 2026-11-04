import test from 'node:test';
import assert from 'node:assert/strict';

test('only a versioned opened record supplies the additional envelope truth',async()=>{
 const {emotionalEnvelopeTruth}=await import('../src/lib/emotional-presentation.js');
 assert.equal(emotionalEnvelopeTruth(undefined),null);assert.equal(emotionalEnvelopeTruth('{'),null);
 assert.equal(emotionalEnvelopeTruth(JSON.stringify({version:'emotional-1',world:{story:{anchor:'old',sealed_truth:'new'}}})),null);
 assert.deepEqual(emotionalEnvelopeTruth(JSON.stringify({version:'emotional-2',world:{story:{anchor:'Visible mark.',sealed_truth:'A different past.'}}})),{anchor:'Visible mark.',truth:'A different past.'});
});

test('recovered failed preparation opens a recovery home without hiding pending or playable journeys',async()=>{
 const {showEmotionalRecoveryHome}=await import('../src/lib/emotional-presentation.js');
 assert.equal(showEmotionalRecoveryHome({status:'failed',error:'generation_failed'} as any,false,''),true);
 assert.equal(showEmotionalRecoveryHome({status:'chat',error:'chat_response_rejected'}as any,false,''),true);
 for(const [status,error,pending,memory]of [['ready',null,false,''],['playing',null,false,''],['finished',null,false,''],['chat',null,false,''],['failed','generation_failed',true,''],['failed','generation_failed',false,'memory-id']]as const)assert.equal(showEmotionalRecoveryHome({status,error}as any,pending,memory),false,status);
});
test('the proposal speaks as SEALED while the declared first-person preference remains intact',async()=>{
 const {emotionalProposalSummary}=await import('../src/lib/emotional-presentation.js');const experience='I would like a gentle, quiet story with human connection.';
 assert.equal(emotionalProposalSummary(experience),'We’ll prepare a gentle, quiet story with human connection.');assert.equal(experience,'I would like a gentle, quiet story with human connection.');
 assert.equal(emotionalProposalSummary("I'd like a reflective mystery."),'We’ll prepare a reflective mystery.');
 assert.equal(emotionalProposalSummary('quiet human connection'),'Your adventure: quiet human connection.');
});
