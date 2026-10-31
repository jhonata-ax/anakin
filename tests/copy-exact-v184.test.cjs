'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {getExactStyleDetails}=require('../src/lib/styles.cjs');
const keys=['b','l','u','h','tc'];
const m=(text,extra={})=>({i:'m',text,...extra});
function take(parts){return getExactStyleDetails(parts,keys,'m');}
test('copy only selected word, never another occurrence in the Rem',()=>{
 const sel=[m('lei',{tc:'#bd62f3',b:true})];
 assert.deepEqual(take(sel).style,{b:true,tc:'#bd62f3'});
 assert.equal(take(sel).length,3);
});
test('preserves custom color object without converting into HEX',()=>{
 const color={custom:{hex:'#aa13ee',scope:'user'}};
 assert.deepEqual(take([m('palavra',{tc:color})]).style.tc,color);
});
test('fragmentation with same formatting is accepted',()=>{
 assert.deepEqual(take([m('le',{h:'#ffcc00',b:true}),m('i',{b:true,h:'#ffcc00'})]).style,{b:true,h:'#ffcc00'});
});
test('fragmentation with distinct formatting is rejected, not silently dominated',()=>{
 assert.throws(()=>take([m('legalidade',{tc:'green'}),m(' demais',{tc:'red'})]),/estilos diferentes/);
});
test('plain selected text captures empty formatting (clearing destination styles)',()=>{
 assert.deepEqual(take(['lei']).style,{});
});
test('trailing spaces without style do not override the actual selected word',()=>{
 assert.deepEqual(take([m('lei',{b:true}), '  ']).style,{b:true});
});
test('selected special token is rejected',()=>{
 assert.throws(()=>take([m('lei',{b:true}),{i:'r',id:'ref'}]),/elemento especial/);
});
test('invalid custom color fails instead of copying a wrong fallback',()=>{
 assert.throws(()=>take([m('lei',{tc:null})]),/cor.*não consegue interpretar/);
});
