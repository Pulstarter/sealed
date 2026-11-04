import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compileEmotionalFacts} from '../src/emotional.js';
import {emotionalFixture} from './emotional-fixture.js';
import {story3c} from './emotional-story-fixture.js';

test('the new chapter two distinguishes the two buttons from the result of not choosing',()=>{
 const a=emotionalFixture();a.world.story=structuredClone(story3c);(a.world as any).choicePolicy='two-buttons-and-timeout';
 const text=compileEmotionalFacts(a.world).AAA!.S2!;
 assert.match(text,/two actions/i);assert.match(text,/If you do not choose[^.]*keep/i);assert.doesNotMatch(text,/or keeping both/);
});
test('an earlier world keeps its original compiled paragraphs unchanged',()=>{
 const a=emotionalFixture();a.world.story=structuredClone(story3c);const before=JSON.stringify(a.world);
 assert.match(compileEmotionalFacts(a.world).AAA!.S2!,/public display, private deposit, or keeping both/);assert.equal(JSON.stringify(a.world),before);
});
