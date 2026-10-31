'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {formatAtSelectedRange,applyToActiveSelection}=require('../src/lib/exact-selection.cjs');
const s=(t,a,b)=>({remId:'id1',range:{start:a,end:b},richText:[t]});
const m=(text,extra={})=>({i:'m',text,...extra});
function state(contents){
 let copy=structuredClone(contents),writes=0;
 return {get value(){return copy},get writes(){return writes},plugin:{editor:{async getFocusedEditorText(){return structuredClone(copy)},async setText(next){copy=structuredClone(next);writes++;}}}};
}
test('second identical word is painted, and never first or third',async()=>{
 const st=state(['lei lei lei']);
 await applyToActiveSelection(st.plugin,s('lei',4,7),{b:true,tc:'#f032aa'});
 assert.deepEqual(st.value,['lei ',m('lei',{b:true,tc:'#f032aa'}),' lei']);
 assert.equal(st.writes,1);
});
test('third occurrence of identical word with mixed formatting',()=>{
 const d=formatAtSelectedRange([m('lei ',{b:true}),m('lei ',{tc:'#ff00ab'}),'lei'],s('lei',8,11),{tc:'#1ab4c7'});
 assert.deepEqual(d.richText,[m('lei ',{b:true}),m('lei ',{tc:'#ff00ab'}),m('lei',{tc:'#1ab4c7'})]);
});
test('selected single word with same text in two Rem fields is not searched elsewhere',async()=>{
 const st=state(['Certo e Certo']);
 const out=await applyToActiveSelection(st.plugin,s('Certo',8,13),{b:true});
 assert.equal(out.unchanged,false);
 assert.deepEqual(st.value,['Certo e ',m('Certo',{b:true})]);
});
test('selected substring within a word is painted only at the selected interval',()=>{
 const v=formatAtSelectedRange(['legalidade e legalidade'],s('gali',2,6),{h:'red'});
 assert.deepEqual(v.richText,['le',m('gali',{h:'red'}),'dade e legalidade']);
});
test('wrong selection offset never falls back to searching duplicate text',()=>{
 assert.throws(()=>formatAtSelectedRange(['lei lei'],s('lei',1,4),{b:true}),/POSIÇÃO/);
});
test('without a range never guesses one of repeated words',()=>{
 assert.throws(()=>formatAtSelectedRange(['lei lei'],{remId:'id1',richText:['lei']},{b:true}),/intervalo exato/);
});
test('range outside focused editor is rejected',()=>{
 assert.throws(()=>formatAtSelectedRange(['lei'],s('lei',8,11),{b:true}),/POSIÇÃO/);
});
test('invalid length never searches elsewhere',()=>{
 assert.throws(()=>formatAtSelectedRange(['lei lei'],s('lei',4,8),{b:true}),/intervalo recebido/);
});
test('special atom AFTER selection is preserved',()=>{
 const atom={i:'q',id:'x'};
 const v=formatAtSelectedRange(['lei ',atom,'lei'],s('lei',0,3),{b:true});
 assert.deepEqual(v.richText,[m('lei',{b:true}),' ',atom,'lei']);
});
test('special atom BEFORE selection is rejected rather than inferring width',()=>{
 assert.throws(()=>formatAtSelectedRange([{i:'q',id:'x'},'lei lei'],s('lei',4,7),{b:true}),/elemento especial/);
});
test('selected cloze metadata refuses mutation',()=>{
 assert.throws(()=>formatAtSelectedRange([m('lei',{cId:'abc'})],s('lei',0,3),{b:true}),/SEGURANÇA/);
});
test('no-op exact style does not write',async()=>{
 const st=state([m('lei',{b:true})]);
 const r=await applyToActiveSelection(st.plugin,s('lei',0,3),{b:true});
 assert.equal(r.unchanged,true);assert.equal(st.writes,0);
});
test('preserves custom color of an unrelated word',async()=>{
 const st=state([m('rosa ',{tc:{custom:'#d345ff'}}),'verde']);
 await applyToActiveSelection(st.plugin,s('verde',5,10),{b:true});
 assert.deepEqual(st.value,[m('rosa ',{tc:{custom:'#d345ff'}}),m('verde',{b:true})]);
});
test('API rejects the RichText without changing the editor snapshot',async()=>{
 let calls=0;
 const plugin={editor:{async setText(){calls++;throw Error('Invalid input');}}};
 await assert.rejects(applyToActiveSelection(plugin,s('lei',4,7),{b:true},['lei lei']),/GRAVAÇÃO/);
 assert.equal(calls,1);
});
