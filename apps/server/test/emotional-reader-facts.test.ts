import {test} from 'node:test';import assert from 'node:assert/strict';
import {generateEmotional} from '../src/emotional-generation.js';
import {providerFixture,testProfile} from './emotional-fixtures.js';
import {compileEmotionalFacts} from '../../../packages/engine/src/emotional.js';
test('new stories preserve artwork clues as narrative and keep instructions in decision review',async()=>{
 const r=await generateEmotional(testProfile,{apiKey:'test',fetch:providerFixture(),withArt:false});const a=r.artifact;
 assert.doesNotMatch(a.factualText.AAA!.S1!,/The image depicts|handle\. flat watercolor/);
 assert.match(a.factualText.AAA!.S1!,/white lighthouse/);assert.match(a.factualText.AAA!.S1!,/square window/);
 for(const route of Object.values(a.factualText))for(const id of ['S2','S3'])assert.doesNotMatch(route[id]!,/last (?:decision|choice)|timer|two actions|If you|will accompany|will not accompany/);
 const legacy=structuredClone(a.world);delete legacy.prosePolicy;assert.match(compileEmotionalFacts(legacy).AAA!.S1!,/The image depicts/);
});
test('the new short-block writer has one approximate total and does not force per-paragraph word counts',async()=>{
 const fixture=providerFixture();const requests:any[]=[];
 await generateEmotional(testProfile,{apiKey:'test',withArt:false,fetch:(async(url,init)=>{const req=JSON.parse(String(init?.body)),p=JSON.parse(req.messages[1].content);if(p.block==='D1T')requests.push(p);return fixture(url,init);}) as typeof fetch});
 assert.ok(requests.length);for(const p of requests){assert.doesNotMatch(p.instruction,/paragraphs about|Every paragraph|37–40|5–20 words/);assert.match(p.instruction,/approximate total|Approximate total/);assert.match(p.instruction,/Stop|stop/);}
});

test('literary facts retain explicit wish owners even when source wishes have no names',async()=>{
 const a=(await generateEmotional(testProfile,{apiKey:'test',fetch:providerFixture(),withArt:false})).artifact;
 const w=a.world;w.host.public_wish='slow looking';w.recipient.public_wish='quiet privacy';
 const text=compileEmotionalFacts(w).AAA!.S1!;
 assert.match(text,/Tessa Vale[^.!?]*slow looking/);assert.match(text,/Ren Cole[^.!?]*quiet privacy/);
});
