'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {applyToActiveSelection}=require('../src/lib/exact-selection.cjs');
const sel=(t,a,b)=>({remId:'R1',range:{start:a,end:b},richText:[t]});
const m=(text,extra={})=>({i:'m',text,...extra});
// Editor que recusa qualquer elemento com cor `tc` objeto (simula "Invalid input").
function picky(contents,rejectKeys){
  let value=structuredClone(contents),attempts=0;
  return {get value(){return value},get attempts(){return attempts},plugin:{
    editor:{async getFocusedEditorText(){return structuredClone(value)},
      async setText(next){attempts++;
        if(next.some(p=>p&&typeof p==='object'&&rejectKeys.some(k=>k in p&&typeof p[k]==='object')))throw Error('Invalid input');
        value=structuredClone(next);}}}};
}
test('cor recusada: aplica o resto e informa o que foi descartado',async()=>{
  const st=picky(['lei lei'],['tc']);
  const r=await applyToActiveSelection(st.plugin,sel('lei',4,7),{b:true,tc:{custom:'#fff'}});
  assert.deepEqual(r.dropped,['tc']);
  assert.deepEqual(st.value,['lei ',m('lei',{b:true})]);
});
test('realce e cor recusados: remove ambos e mantém negrito',async()=>{
  const st=picky(['lei lei'],['tc','h']);
  const r=await applyToActiveSelection(st.plugin,sel('lei',0,3),{u:true,tc:{x:1},h:{y:2}});
  assert.deepEqual(r.dropped,['h','tc']);
  assert.deepEqual(st.value,[m('lei',{u:true}),' lei']);
});
test('recusa total: erro lista as tentativas e o tipo do estilo, sem gravar',async()=>{
  const plugin={editor:{async getFocusedEditorText(){return ['lei lei']},async setText(){throw Error('Invalid input')}}};
  await assert.rejects(applyToActiveSelection(plugin,sel('lei',4,7),{b:true,tc:'#ff0000'}),
    e=>/GRAVAÇÃO/.test(e.message)&&/tc=string/.test(e.message)&&/sem tc/.test(e.message)&&/Editor\/completo/.test(e.message));
});
test('inserção só da seleção exige a mesma seleção ativa',async()=>{
  let inserted;
  const plugin={editor:{async getFocusedEditorText(){return ['lei lei']},async setText(){throw Error('Invalid input')},
    async getSelectedText(){return sel('lei',4,7)},async insertRichText(x){inserted=x;}}};
  const r=await applyToActiveSelection(plugin,sel('lei',4,7),{b:true});
  assert.equal(r.via,'selecao');
  assert.deepEqual(inserted,[m('lei',{b:true})]);
  // seleção mudou: não insere nada
  inserted=undefined;
  plugin.editor.getSelectedText=async()=>sel('lei',0,3);
  await assert.rejects(applyToActiveSelection(plugin,sel('lei',4,7),{b:true}),/GRAVAÇÃO/);
  assert.equal(inserted,undefined);
});
