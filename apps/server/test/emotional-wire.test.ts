import {test} from 'node:test';import assert from 'node:assert/strict';
import {newGenerationCheckpoint} from '../src/emotional-generation.js';
import {generateEmotional} from '../src/emotional-generation.js';
import {providerFixture,testProfile} from './emotional-fixtures.js';
import {decodeFlatParagraphs} from '../src/emotional-wire.js';
import {ambiguousRelationship} from '../src/emotional-continuity.js';
test('new prose uses flat string fields and still binds every speaker without changing provider fragments',async()=>{
 const raw={p01_text:'  Narration, exactly.  ',p02_lead:'A complete lead.',p02_text:'A spoken reply.',p02_tail:''};
 assert.deepEqual(decodeFlatParagraphs({p1:'NARRATOR>NONE',p2:'HOST>PLAYER'},raw),[{speaker:'NARRATOR',addressee:'NONE',lead:'',text:raw.p01_text,tail:''},{speaker:'HOST',addressee:'PLAYER',lead:raw.p02_lead,text:raw.p02_text,tail:raw.p02_tail}]);
 const fixture=providerFixture();let checked=false;const r=await generateEmotional(testProfile,{apiKey:'test',checkpoint:{...newGenerationCheckpoint(),revision:'3c-32'},withArt:false,fetch:(async(url,init)=>{const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);if(p.task!=='world'){const props=req.response_format.json_schema.schema.properties;assert.ok(Object.values(props).every((s:any)=>s.type==='string'));assert.ok(props.p01_text);assert.equal(props.p01_lead,undefined);if(p.block==='S1'){assert.ok(props.p05_lead);checked=true;}}return fixture(url,init);})as typeof fetch});
 assert.ok(checked);assert.equal(r.artifact.blocks.S1!.passages![4]!.speaker,'HOST');assert.equal(r.artifact.blocks.S1!.passages![9]!.speaker,'PLAYER');assert.deepEqual(r.validation.issues,{});
});
test('length repair calibrates the requested total using the measured response without multiplying paragraphs',async()=>{
 const short=providerFixture({shortParagraphs:true}),normal=providerFixture(),counts:Record<string,number>={},targets:Record<string,number>={};let repaired=0;
 const r=await generateEmotional(testProfile,{apiKey:'test',checkpoint:{...newGenerationCheckpoint(),revision:'3c-32'},withArt:false,fetch:(async(url,init)=>{const p=JSON.parse(JSON.parse(String(init?.body)).messages[1].content);if(p.task==='block'){counts[p.block]=p.paragraphs;targets[p.block]=p.target_words;}if(p.task==='repair'){assert.equal(p.paragraphs,counts[p.block]);assert.ok(p.target_words>targets[p.block]!);repaired++;return normal(url,init);}return short(url,init);})as typeof fetch});assert.ok(repaired);assert.ok(r.validation.wordRange[0]>=2000&&r.validation.wordRange[1]<=2400);
});
test('contrasting wishes are not gift owners, while actual private pairs remain rejected',()=>{
 const check=(text:string)=>ambiguousRelationship(text,['Mara','June'],['Alex'],true);
 for(const s of ['Between them lay two known wishes, one for quiet looking and one for openly shared gratitude.','The stillness did not ask them to decide between the two wishes.','Theo registered the other known wish and felt the friction between them like a small warmth.'])assert.equal(check(s),false,s);
 for(const s of ['I want the gift kept private just between us.','Their wishes differ, but keep the gift private between them.'])assert.equal(check(s),true,s);
});
