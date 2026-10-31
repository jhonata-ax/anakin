'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {applyToActiveSelection,formatAtSelectedRange,widthsFromRemNote} = require('../src/lib/exact-selection.cjs');
const m = (text,extra={})=>({i:'m',text,...extra});
const selection=(text,a,b)=>({remId:'R1',range:{start:a,end:b},richText:[text]});
function mock(parts,lengthByType={}){
  let value=structuredClone(parts),writes=0,calls=[];
  return {get value(){return value},get writes(){return writes},get calls(){return calls},plugin:{
    richText:{async length([token]){calls.push(token.i);if(!(token.i in lengthByType))throw Error('Unsupported token: '+token.i);return lengthByType[token.i];}},
    editor:{async getFocusedEditorText(){return structuredClone(value)},async setText(next){writes++;value=structuredClone(next);}}
  }};
}
test('reference of width 1 preceding second identical word does not prevent formatting',async()=>{
 const atom={i:'r',id:'ref'};
 const state=mock(['lei ',atom,'lei lei'],{r:1});
 await applyToActiveSelection(state.plugin,selection('lei',5,8),{b:true,tc:'#ff00ff'});
 assert.deepEqual(state.value,['lei ',atom,m('lei',{b:true,tc:'#ff00ff'}),' lei']);
 assert.equal(state.writes,1);
 assert.deepEqual(state.calls,['r']);
});
test('atomic width 2 shifts the selection to third identical word',async()=>{
 const atom={i:'portal',id:'p'};
 const state=mock(['lei ',atom,'lei lei'],{portal:2});
 await applyToActiveSelection(state.plugin,selection('lei',10,13),{h:'#334455'});
 assert.deepEqual(state.value,['lei ',atom,'lei ',m('lei',{h:'#334455'})]);
});
test('atomic width 0 keeps coordinates unchanged',async()=>{
 const atom={i:'zero',id:'z'};
 const state=mock(['lei ',atom,'lei'],{zero:0});
 await applyToActiveSelection(state.plugin,selection('lei',4,7),{b:true});
 assert.deepEqual(state.value,['lei ',atom,m('lei',{b:true})]);
});
test('atomic inside a selection is rejected without writing',async()=>{
 const atom={i:'x',id:'x'};
 const state=mock(['ab',atom,'cd'],{x:1});
 await assert.rejects(applyToActiveSelection(state.plugin,selection('abcd',0,4),{b:true}),/SEGURANÇA|POSIÇÃO/);
 assert.equal(state.writes,0);
});
test('unmeasurable atomic cancels safely',async()=>{
 const state=mock([{i:'unrecognized',id:'x'},'lei'],{});
 await assert.rejects(applyToActiveSelection(state.plugin,selection('lei',1,4),{b:true}),/SDK não conseguiu medir/);
 assert.equal(state.writes,0);
});
test('atomic *after* selection need not be measured',async()=>{
 const state=mock(['lei',{i:'unknown',id:'x'}],{});
 await applyToActiveSelection(state.plugin,selection('lei',0,3),{u:true});
 assert.deepEqual(state.value,[m('lei',{u:true}),{i:'unknown',id:'x'}]);
 assert.deepEqual(state.calls,[]);
});
test('selection inside atomic must be rejected without modifying it',async()=>{
 const atom={i:'reference',id:'r'};
 const state=mock(['a',atom,'b'],{reference:2});
 await assert.rejects(applyToActiveSelection(state.plugin,selection('z',1,2),{b:true}),/SEGURANÇA/);
 assert.equal(state.writes,0);
});
test('special reference with custom-colored text before selection keeps source untouched',async()=>{
 const atom={i:'ref',id:'a'};
 const state=mock([m('pre ',{tc:{custom:'#445566'}}),atom,m('destino',{tc:'#000000'})],{ref:1});
 await applyToActiveSelection(state.plugin,selection('destino',5,12),{tc:'#cc5599'});
 assert.deepEqual(state.value,[m('pre ',{tc:{custom:'#445566'}}),atom,m('destino',{tc:'#cc5599'})]);
});
