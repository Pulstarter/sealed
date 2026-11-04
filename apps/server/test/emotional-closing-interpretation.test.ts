import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixtureWorld} from '../../../packages/engine/test/emotional-fixture.js';
import {endingReactionIssues} from '../src/emotional-ending.js';
import type {EmotionalBlock,EmotionalWorld} from '../../../packages/engine/src/emotional-types.js';
const world=():EmotionalWorld=>({...fixtureWorld(),endingPolicy:'outcome-reactions-2'});
const speech=(text:string):EmotionalBlock=>({text,claims:[],passages:[{speaker:'PLAYER',addressee:'HOST',lead:'',text,tail:''}]});
// Rejecting a grammatical future by itself blocks the recorded3de manuscript;
// accepting a future material action would instead invent an engine outcome.
test('a closing leaves meaning and another reading open without inventing a future event',()=>{
 for(const text of [
  'I will not pretend I can steer that. Your drawing will mean what it means, and I have to leave it there.',
  'I will not pretend I know what you will find in it; that part is yours now.',
  'I cannot decide what you will see in the drawing.',
  'I promise nothing about its meaning.',
  'I promise no easy answer about its meaning.',
  "It may mean something to them that neither of us intended, and I'll have to let that stand.",
 ]) assert.deepEqual(endingReactionIssues(world(),'F1',speech(text)),[],text);
});
test('an interpretive future cannot hide a later physical action, promise or invented approval',()=>{
 for(const text of [
  'Your drawing will mean what it means, and I will move it.',
  'I do not know what you will find in it; I will ask for it back.',
  'You will find it in the private box.',
  'I will find it in the box.',
  'The drawing will mean that I take it home.',
  'I promise to bring the drawing back.',
  'We agreed to display it, whatever you will find in it.',
  'I know what you will find in it: the original sheet, inside the box.',
  'What you will find in the drawing is certain comfort.',
  'The box is closed, and I cannot know what you will find in it.',
  "I'll have to let that stand, and I'll move the drawing.",
 ]) assert.ok(endingReactionIssues(world(),'F1',speech(text)).length,text);
});
test('future tasks remain disallowed when expressed with contractions or going to',()=>{
 for(const text of ["I'll move the drawing.",'I am going to move it.',"I'm about to take it home."])
  assert.ok(endingReactionIssues(world(),'F1',speech(text)).length,text);
});
test('meaning exceptions do not apply to the older stricter emotional-only contract',()=>{
 const w={...world(),endingPolicy:'present-reactions-1' as const};
 assert.ok(endingReactionIssues(w,'F1',speech('Your drawing will mean what it means.')).length);
});
