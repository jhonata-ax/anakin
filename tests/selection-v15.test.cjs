'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {replaceSelectionFormatting}=require('../src/lib/replace-selection-v15.cjs');
const selected=(word,range)=>({remId:'r',richText:[word],range});
const fixture=(front,back)=>{
 const value={text:structuredClone(front),backText:structuredClone(back)};const written=[];
 const plugin={rem:{async findOne(){return {
  get text(){return structuredClone(value.text)},get backText(){return structuredClone(value.backText)},
  async setText(a){value.text=structuredClone(a);written.push('text')},
  async setBackText(a){value.backText=structuredClone(a);written.push('backText')}
 }}},richText:{
   async length(parts){return parts.reduce((n,p)=>n+(typeof p==='string'?p.length:p.i==='m'?p.text.length:1),0)},
   async substring(parts,start,end){let offset=0,out=[];for(const p of parts){const txt=typeof p==='string'?p:p.i==='m'?p.text:null,sz=txt===null?1:txt.length; const a=Math.max(0,start-offset),b=Math.min(sz,end-offset);if(b>a){if(txt!==null)out.push(typeof p==='string'?txt.slice(a,b):{...p,text:txt.slice(a,b)});else out.push(p)}offset+=sz;}return out;}
 }};
 return {plugin,value,written};
};
test('review: one occurrence front+back, range uniquely identifies front',async()=>{
 const m=fixture(['Frente ALVO fim'],['ALVO atrás']);
 const r=await replaceSelectionFormatting(m.plugin,selected('ALVO',{start:7,end:11}),{b:true});
 assert.equal(r.side,'text');assert.deepEqual(m.written,['text']);
});
test('review: one occurrence front+back, range uniquely identifies back',async()=>{
 const m=fixture(['ALVO frente'],['Verso ALVO fim']);
 const r=await replaceSelectionFormatting(m.plugin,selected('ALVO',{start:6,end:10}),{h:'yellow'});
 assert.equal(r.side,'backText');assert.deepEqual(m.written,['backText']);
});
test('review: if same offset in both sides, refuse and offer explicit choice',async()=>{
 const m=fixture(['ALVO primeiro'],['ALVO segundo']);
 await assert.rejects(replaceSelectionFormatting(m.plugin,selected('ALVO',{start:0,end:4}),{b:true}),e=>e.code==='SIDE_AMBIGUITY');
 assert.deepEqual(m.written,[]);
});
test('review: when selection is ambiguous, confirmed front choice succeeds',async()=>{
 const m=fixture(['ALVO primeiro'],['ALVO segundo']);
 const r=await replaceSelectionFormatting(m.plugin,selected('ALVO',{start:0,end:4}),{b:true},undefined,'text');
 assert.equal(r.side,'text');assert.deepEqual(m.written,['text']);
});
test('review: when selection is ambiguous, confirmed back choice succeeds',async()=>{
 const m=fixture(['ALVO primeiro'],['ALVO segundo']);
 const r=await replaceSelectionFormatting(m.plugin,selected('ALVO',{start:0,end:4}),{tc:'Green'},undefined,'backText');
 assert.equal(r.side,'backText');assert.deepEqual(m.written,['backText']);
});
test('review: special token before selected word uses logical offsets',async()=>{
 const m=fixture([{i:'q',id:'1'},'A ALVO B'],['ALVO']);
 const r=await replaceSelectionFormatting(m.plugin,selected('ALVO',{start:3,end:7}),{b:true});
 assert.equal(r.side,'text');assert.deepEqual(m.written,['text']);
});
test('review: repeated target on the chosen side without range is rejected',async()=>{
 const m=fixture(['ALVO ALVO'],['ALVO']);
 await assert.rejects(replaceSelectionFormatting(m.plugin,selected('ALVO'),{b:true},undefined,'text'),/AMBIGUIDADE/);
 assert.deepEqual(m.written,[]);
});
test('review: if front and back have identical text, focused snapshot not enough',async()=>{
 const m=fixture(['ALVO'],['ALVO']);
 await assert.rejects(replaceSelectionFormatting(m.plugin,selected('ALVO',{start:0,end:4}),{b:true},['ALVO']),e=>e.code==='SIDE_AMBIGUITY');
 assert.deepEqual(m.written,[]);
});
