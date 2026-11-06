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
// Editor simulado: texto como string; setText recusa realce em objeto; insertRichText NÃO substitui seleção.
function sim(text,range,{rejectObjects=true,badInsert=false}={}){
  const st={text,caret:range.end,sel:{...range},history:[],richInserted:undefined,parts:[text]};
  const plain=()=>st.parts.map(p=>typeof p==='string'?p:p.text).join('');
  const editor={
    async getFocusedEditorText(){return structuredClone(st.parts)},
    async getSelectedText(){return st.sel?{type:'Text',remId:'R1',range:{...st.sel},richText:[plain().slice(st.sel.start,st.sel.end)]}:undefined},
    async setText(next){if(rejectObjects&&next.some(p=>p&&typeof p==='object'&&['h','tc'].some(k=>typeof p[k]==='object')))throw Error('Invalid input');st.parts=structuredClone(next);},
    async delete(){st.history.push(structuredClone(st.parts));const t=plain();st.parts=[t.slice(0,st.sel.start)+t.slice(st.sel.end)];st.caret=st.sel.start;st.sel=undefined;},
    async insertRichText(x){if(badInsert)throw Error('falha ao inserir');st.history.push(structuredClone(st.parts));const t=plain();
      st.parts=[t.slice(0,st.caret),...structuredClone(x),t.slice(st.caret)].filter(p=>p!=='');},
    async undo(){const prev=st.history.pop();if(prev)st.parts=prev;}
  };
  return {st,plain,plugin:{editor}};
}
test('realce personalizado recusado pelo setText: apaga a seleção e insere formatado, sem duplicar',async()=>{
  const h={custom:'#abcdef'};
  const t=sim('lei lei',{start:4,end:7});
  const r=await applyToActiveSelection(t.plugin,sel('lei',4,7),{b:true,h});
  assert.equal(r.via,'selecao');assert.deepEqual(r.dropped,[]);
  assert.equal(t.plain(),'lei lei');
  assert.deepEqual(t.st.parts,['lei ',m('lei',{b:true,h})]);
});
test('inserção falha depois de apagar: desfaz, descarta só o realce e mantém o texto',async()=>{
  const t=sim('lei lei',{start:4,end:7},{badInsert:true});
  const r=await applyToActiveSelection(t.plugin,sel('lei',4,7),{b:true,h:{c:1}});
  assert.deepEqual(r.dropped,['h']);           // realce descartado, com aviso
  assert.equal(t.plain(),'lei lei');           // texto intacto, sem duplicar nem perder
  assert.deepEqual(t.st.parts,['lei ',m('lei',{b:true})]);
});
test('seleção mudou: não apaga nada e cai para a variante sem realce',async()=>{
  const t=sim('lei lei',{start:0,end:3});
  const r=await applyToActiveSelection(t.plugin,sel('lei',4,7),{b:true,h:{c:1}});
  assert.deepEqual(r.dropped,['h']);
  assert.equal(t.plain(),'lei lei');
});
// Anfitrião que só aceita realce predefinido (nome ou índice) e recusa strings hexadecimais.
function simPreset(text,range){
  const t=sim(text,range);
  const ok=h=>typeof h==='number'?h<256:/^(Red|Orange|Yellow|Green|Purple|Blue|Gray|Brown|Pink)$/.test(h);
  const ed=t.plugin.editor,origInsert=ed.insertRichText.bind(ed),origSet=ed.setText;
  ed.setText=async()=>{throw Error('Invalid input');};
  ed.insertRichText=async x=>{if(x.some(p=>p&&typeof p==='object'&&'h' in p&&!ok(p.h)))throw Error('Invalid input');return origInsert(x);};
  return t;
}
test('realce hexadecimal recusado: tenta formas alternativas sem duplicar e avisa a aproximação',async()=>{
  const t=simPreset('lei lei',{start:4,end:7});
  const r=await applyToActiveSelection(t.plugin,sel('lei',4,7),{b:true,h:'#f5d90a'});
  assert.match(r.approx,/Yellow/);
  assert.equal(t.plain(),'lei lei');
  assert.deepEqual(t.st.parts,['lei ',m('lei',{b:true,h:'Yellow'})]);
});
test('realce ilegível: desfaz a substituição e informa os valores',async()=>{
  const t=simPreset('lei lei',{start:4,end:7});
  await assert.rejects(applyToActiveSelection(t.plugin,sel('lei',4,7),{b:true,h:'meu-realce'}),
    e=>/GRAVAÇÃO/.test(e.message)&&/h=string\("meu-realce"\)/.test(e.message));
  assert.equal(t.plain(),'lei lei');
});
// Elemento de leitura com `elementId` (realce personalizado): a escrita recusa essa chave.
// Editor simulado que preserva a estrutura dos elementos ao apagar/inserir por posição.
function simElementId(range){
  const st={parts:[m('lei ',{h:'#112233',elementId:'e1'}),'lei'],sel:{...range},caret:range.end,history:[]};
  const txt=x=>typeof x==='string'?x:x.text;
  const plain=()=>st.parts.map(txt).join('');
  const hasId=x=>x.some(p=>p&&typeof p==='object'&&'elementId' in p);
  const cut=(a,b)=>{let pos=0;const out=[];for(const p of st.parts){const t=txt(p),from=pos,to=pos+t.length;pos=to;
    const l=t.slice(0,Math.max(0,Math.min(t.length,a-from))),r=t.slice(Math.max(0,Math.min(t.length,b-from)));
    const mk=x=>x===''?undefined:(typeof p==='string'?x:{...p,text:x});
    if(mk(l))out.push(mk(l));if(mk(r))out.push(mk(r));}return out;};
  const editor={
    async getFocusedEditorText(){return structuredClone(st.parts)},
    async getSelectedText(){return st.sel?{type:'Text',remId:'R1',range:{...st.sel},richText:[plain().slice(st.sel.start,st.sel.end)]}:undefined},
    async setText(next){if(hasId(next))throw Error('Invalid input');st.parts=structuredClone(next);},
    async delete(){st.history.push(structuredClone(st.parts));st.parts=cut(st.sel.start,st.sel.end);st.caret=st.sel.start;st.sel=undefined;},
    async insertRichText(x){if(hasId(x))throw Error('Invalid input');st.history.push(structuredClone(st.parts));
      let pos=0;const out=[];let done=false;
      for(const p of st.parts){const t=txt(p),from=pos,to=pos+t.length;pos=to;
        if(!done&&st.caret>=from&&st.caret<=to){const k=st.caret-from,mk=y=>y===''?undefined:(typeof p==='string'?y:{...p,text:y});
          if(mk(t.slice(0,k)))out.push(mk(t.slice(0,k)));out.push(...structuredClone(x));if(mk(t.slice(k)))out.push(mk(t.slice(k)));done=true;}
        else out.push(p);}
      st.parts=done?out:[...out,...structuredClone(x)];},
    async undo(){const prev=st.history.pop();if(prev)st.parts=prev;}
  };
  return {st,plain,plugin:{editor}};
}
test('realce hexadecimal personalizado com elementId: insere só o trecho sem elementId e mantém o resto',async()=>{
  const t=simElementId({start:4,end:7});
  const source={remId:'R1',range:{start:4,end:7},richText:['lei']};
  const r=await applyToActiveSelection(t.plugin,source,{b:true,h:'#0e6e17'});
  assert.equal(r.via,'selecao');assert.equal(r.approx,undefined);
  assert.deepEqual(t.st.parts[0],m('lei ',{h:'#112233',elementId:'e1'}));   // intocado
  assert.deepEqual(t.st.parts.find(p=>p.h==='#0e6e17'),m('lei',{b:true,h:'#0e6e17'}));
  assert.equal(t.plain(),'lei lei');
});
test('destino com elementId na própria palavra: o elementId não é reenviado',async()=>{
  const t=simElementId({start:0,end:3});
  t.plugin.editor.getSelectedText=async()=>({type:'Text',remId:'R1',range:{start:0,end:3},richText:[m('lei',{h:'#112233',elementId:'e1'})]});
  const target={remId:'R1',range:{start:0,end:3},richText:[m('lei',{h:'#112233',elementId:'e1'})]};
  const r=await applyToActiveSelection(t.plugin,target,{u:true,h:'#0e6e17'});
  assert.equal(r.via,'selecao');
  assert.ok(!JSON.stringify(t.st.parts.filter(p=>p.u)).includes('elementId'));
});
// Anfitrião que só guarda o realce personalizado quando acompanhado do elementId copiado.
test('realce personalizado: o elementId copiado viaja junto com o h',async()=>{
  const t=simElementId({start:4,end:7});
  t.st.parts=['lei ','lei'];
  t.plugin.editor.setText=async n=>{t.st.parts=structuredClone(n);};
  const r=await applyToActiveSelection(t.plugin,{remId:'R1',range:{start:4,end:7},richText:['lei']},{b:true,h:'#0e6e17',elementId:'abc'});
  assert.equal(r.verified,true);
  const seg=t.st.parts[1];
  assert.equal(seg.h,'#0e6e17');assert.equal(seg.b,true);
  assert.match(seg.elementId,/^[a-z]{3}$/);   // id novo, mesmo formato do copiado
  assert.match(r.readback,/elementId=aaa/);
});
test('o RemNote aceita mas não guarda o realce: avisa em vez de fingir sucesso',async()=>{
  const t=simElementId({start:4,end:7});
  t.st.parts=['lei ','lei'];
  t.plugin.editor.setText=async n=>{t.st.parts=structuredClone(n).map(p=>{if(p&&typeof p==='object'){const q={...p};delete q.h;return q;}return p;});};
  t.plugin.editor.insertRichText=async()=>{throw Error('Invalid input');};
  const r=await applyToActiveSelection(t.plugin,{remId:'R1',range:{start:4,end:7},richText:['lei']},{b:true,h:'#0e6e17',elementId:'abc'});
  assert.deepEqual(r.dropped,['h']);           // no fim, só o realce é descartado, com aviso
  assert.ok(r.reasons.some(x=>/não ficou gravado/.test(x)));  // e o motivo explica que o RemNote aceitou mas não guardou
  assert.equal(t.plain(),'lei lei');
});
test('elementId do destino não sobra quando o formato copiado não tem realce',async()=>{
  const t=simElementId({start:0,end:3});
  t.st.parts=[m('lei',{h:'#112233',elementId:'e1'}),' lei'];
  t.plugin.editor.setText=async n=>{t.st.parts=structuredClone(n);};
  await applyToActiveSelection(t.plugin,{remId:'R1',range:{start:0,end:3},richText:[m('lei',{h:'#112233',elementId:'e1'})]},{b:true});
  assert.deepEqual(t.st.parts[0],m('lei',{b:true}));
});
test('realce descartado informa o motivo',async()=>{
  const t=simPreset('lei lei',{start:4,end:7});
  t.plugin.editor.setText=async n=>{if(n.some(p=>p&&typeof p==='object'&&'h' in p))throw Error('Invalid input');t.st.parts=structuredClone(n);};
  t.plugin.editor.insertRichText=async()=>{throw Error('Invalid input');};
  const r=await applyToActiveSelection(t.plugin,sel('lei',4,7),{b:true,h:'#0e6e17'});
  assert.deepEqual(r.dropped,['h']);
  assert.ok(r.reasons.some(x=>/Seleção/.test(x)));
});
// `decorations`: atributo novo do RemNote que acompanha cores personalizadas.
test('decorations copiado viaja com o realce quando o RemNote o aceita',async()=>{
  const t=simElementId({start:4,end:7});
  t.st.parts=['lei ','lei'];
  const dec=[{type:'highlight',color:'#004ffe'}];
  t.plugin.editor.setText=async()=>{throw Error('Invalid input');};
  t.plugin.editor.insertRichText=async x=>{
    if(x.some(p=>p&&typeof p==='object'&&p.h==='#004ffe'&&JSON.stringify(p.decorations)!==JSON.stringify(dec)))throw Error('Invalid input');
    t.st.parts=['lei ',...structuredClone(x)];
  };
  const r=await applyToActiveSelection(t.plugin,{remId:'R1',range:{start:4,end:7},richText:['lei']},{h:'#004ffe',decorations:dec});
  assert.equal(r.form,'original');
  assert.deepEqual(t.st.parts[1].decorations,dec);
  assert.equal(t.plain(),'lei lei');
});
test('RemNote recusa decorations: cai para o formato sem metadados, sem perder texto',async()=>{
  const t=simElementId({start:4,end:7});
  t.st.parts=['lei ','lei'];
  t.plugin.editor.setText=async()=>{throw Error('Invalid input');};
  t.plugin.editor.insertRichText=async x=>{
    if(x.some(p=>p&&typeof p==='object'&&(p.decorations!==undefined||typeof p.h==='string')))throw Error('Invalid input');
    t.st.parts=['lei ',...structuredClone(x)];
  };
  const r=await applyToActiveSelection(t.plugin,{remId:'R1',range:{start:4,end:7},richText:['lei']},{h:'#004ffe',decorations:[{x:1}]});
  assert.match(r.form,/predefinida/);   // chegou ao predefinido mais próximo, que o anfitrião aceita
  assert.equal(t.plain(),'lei lei');
  assert.equal(t.st.parts[1].decorations,undefined);
});
test('realce personalizado azul vira o predefinido Blue e nunca um número RGB invisível',async()=>{
  const t=simPreset('lei lei',{start:4,end:7});
  const r=await applyToActiveSelection(t.plugin,sel('lei',4,7),{h:'#004ffe'});
  assert.match(r.approx,/Blue/);
  assert.equal(t.st.parts[1].h,'Blue');
  assert.equal(t.plain(),'lei lei');
});
test('matizes: verde, laranja e roxo; cinza não tem equivalente e o realce é descartado com aviso',async()=>{
  for(const [hex,name] of [['#0e6e17','Green'],['#ff8800','Orange'],['#8a2be2','Purple'],['#e11d48','Red']]){
    const t=simPreset('lei lei',{start:0,end:3});
    const r=await applyToActiveSelection(t.plugin,sel('lei',0,3),{h:hex});
    assert.match(r.approx,new RegExp(name),hex);
  }
  const t=simPreset('lei lei',{start:0,end:3});
  t.plugin.editor.setText=async n=>{if(n.some(p=>p&&typeof p==='object'&&'h' in p))throw Error('Invalid input');t.st.parts=structuredClone(n);};
  const r=await applyToActiveSelection(t.plugin,sel('lei',0,3),{b:true,h:'#808080'});
  assert.deepEqual(r.dropped,['h']);
});
