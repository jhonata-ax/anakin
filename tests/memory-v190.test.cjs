'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {makeEntry,freshEntry,remember,recall,TTL_MS}=require('../src/lib/selection-memory.cjs');
const {applyToActiveSelection}=require('../src/lib/exact-selection.cjs');
const sel=(text,a,b,remId='R1')=>({remId,range:{start:a,end:b},richText:[text]});
const m=(text,extra={})=>({i:'m',text,...extra});
function remPlugin({front,back,focus}){
  const rem={text:front,backText:back,writes:[],
    async setText(v){this.text=structuredClone(v);this.writes.push(['text',v]);},
    async setBackText(v){this.backText=structuredClone(v);this.writes.push(['back',v]);}};
  return {rem,plugin:{
    richText:{async length(){return 1;}},
    rem:{async findOne(id){return id==='R1'?rem:undefined;}},
    editor:{async getFocusedEditorText(){return focus;},async setText(){throw Error('sem foco');}}
  }};
}
test('entrada expira depois do TTL e exige faixa válida',()=>{
  const e=makeEntry(sel('lei',0,3),['lei'],1000);
  assert.ok(freshEntry(e,1000+TTL_MS-1));
  assert.equal(freshEntry(e,1000+TTL_MS+1),undefined);
  assert.equal(makeEntry({remId:'R1',richText:['lei']}),undefined);
  assert.equal(makeEntry(sel('lei',3,3)),undefined);
});
test('remember grava só seleção válida e recall devolve a última',async()=>{
  const store={};let live=sel('lei',0,3);
  const plugin={editor:{async getSelectedText(){return live;},async getFocusedEditorText(){return ['lei'];}},
    storage:{async setSession(k,v){store[k]=v;},async getSession(k){return store[k];}}};
  assert.equal(await remember(plugin),true);
  live=undefined;
  assert.equal(await remember(plugin),false);
  const back=await recall(plugin);
  assert.deepEqual(back.selection.richText,['lei']);
});
test('sem foco: grava pela frente do Rem, sem tocar no verso',async()=>{
  const {rem,plugin}=remPlugin({front:['lei lei'],back:['outra coisa'],focus:undefined});
  const r=await applyToActiveSelection(plugin,sel('lei',4,7),{b:true},undefined);
  assert.equal(r.unchanged,false);
  assert.deepEqual(rem.text,['lei ',m('lei',{b:true})]);
  assert.deepEqual(rem.backText,['outra coisa']);
  assert.equal(rem.writes.length,1);
});
test('sem foco: seleção no verso grava só o verso',async()=>{
  const {rem,plugin}=remPlugin({front:['pergunta'],back:['a lei vale'],focus:undefined});
  await applyToActiveSelection(plugin,sel('lei',2,5),{u:true},undefined);
  assert.deepEqual(rem.backText,['a ',m('lei',{u:true}),' vale']);
  assert.deepEqual(rem.text,['pergunta']);
});
test('sem foco: mesma palavra na mesma posição em frente e verso é recusada',async()=>{
  const {rem,plugin}=remPlugin({front:['lei x'],back:['lei y'],focus:undefined});
  await assert.rejects(applyToActiveSelection(plugin,sel('lei',0,3),{b:true},undefined),/AMBIGUIDADE/);
  assert.equal(rem.writes.length,0);
});
test('sem foco: a dica do editor desfaz a ambiguidade',async()=>{
  const {rem,plugin}=remPlugin({front:['lei x'],back:['lei y'],focus:undefined});
  await applyToActiveSelection(plugin,sel('lei',0,3),{b:true},undefined,['lei y']);
  assert.deepEqual(rem.backText,[m('lei',{b:true}),' y']);
  assert.deepEqual(rem.text,['lei x']);
});
test('sem foco: posição que não confere cancela sem gravar',async()=>{
  const {rem,plugin}=remPlugin({front:['abc def'],back:undefined,focus:undefined});
  await assert.rejects(applyToActiveSelection(plugin,sel('lei',0,3),{b:true},undefined),/POSIÇÃO/);
  assert.equal(rem.writes.length,0);
});
test('setText do editor falha: cai para gravação pelo Rem',async()=>{
  const {rem,plugin}=remPlugin({front:['lei lei'],back:undefined,focus:['lei lei']});
  await applyToActiveSelection(plugin,sel('lei',4,7),{b:true},undefined);
  assert.deepEqual(rem.text,['lei ',m('lei',{b:true})]);
});
