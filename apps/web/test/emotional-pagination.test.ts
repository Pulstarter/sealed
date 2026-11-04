import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as presentation from '../src/lib/emotional-presentation.js';
import {paginateStory} from '../src/lib/story-presentation.js';

const api=presentation as typeof presentation&{paginateEmotionalScene:(paragraphs:string[],fits?:(paragraphs:string[])=>boolean)=>string[][];readingOffset:(pages:string[][],page:number)=>number;pageAtOffset:(pages:string[][],offset:number)=>number};
const words=(paragraphs:string[])=>paragraphs.join(' ').trim().split(/\s+/).length;
const paragraph=(n:number,count=42)=>Array.from({length:count},(_,i)=>`word${n}_${i}`).join(' ')+'.';
test('preview pagination fills the available space with intact paragraphs and fewer turns',()=>{
 assert.equal(typeof api.paginateEmotionalScene,'function');
 const source=Array.from({length:10},(_,i)=>paragraph(i)),pages=api.paginateEmotionalScene(source,p=>words(p)<=140);
 assert.deepEqual(pages.flat(),source);assert.equal(pages.length,4);assert.ok(pages.length<paginateStory(source).length);assert.ok(pages.every(p=>words(p)<=140));
});
test('a short speaker attribution stays with its dialogue instead of ending the preceding page',()=>{
 const scene=paragraph(0,60),attribution='Mara answered:',dialogue='“I cannot promise that.”';
 const pages=api.paginateEmotionalScene([scene,attribution,dialogue],p=>words(p)<=65);
 assert.deepEqual(pages,[[scene],[attribution,dialogue]]);
});
test('unusually long paragraphs remain intact and readable through local overflow without losing text',()=>{
 const long=paragraph(0,400),source=['  A quiet beginning.  ',long,'Afterwards.'];
 const pages=api.paginateEmotionalScene(source,p=>words(p)<=100);assert.deepEqual(pages.flat(),source);assert.ok(pages.every(p=>p.length));assert.deepEqual(api.paginateEmotionalScene([]),[]);
});
test('word anchors keep the same passage in view when the page layout changes',()=>{
 const source=Array.from({length:10},(_,i)=>paragraph(i)),small=api.paginateEmotionalScene(source,p=>words(p)<=90),large=api.paginateEmotionalScene(source,p=>words(p)<=200);
 const offset=api.readingOffset(small,2);assert.equal(offset,168);const page=api.pageAtOffset(large,offset);assert.equal(page,1);assert.equal(api.readingOffset(large,page),168);
 assert.equal(api.pageAtOffset(large,99999),large.length-1);assert.equal(api.pageAtOffset([],100),0);
});
