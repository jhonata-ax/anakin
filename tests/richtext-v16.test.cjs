'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {replaceSelectionFormatting, safeStyle, prepareForWrite, protectedFingerprint}=require('../src/lib/replace-selection-v16.cjs');

function normalizeRichText(value) {
  assert(Array.isArray(value));
  const output=[];
  for(const original of value){
    const p=structuredClone(original);
    if(typeof p !== 'string' && p.i==='m'){
      if(typeof p.text !== 'string') throw Error('text must be string');
      for(const key of ['b','l','u']) if(p[key] !== undefined && typeof p[key]!=='boolean')throw Error('invalid '+key);
      for(const key of ['tc','h']) if(p[key] !== undefined && typeof p[key]!=='string')throw Error('invalid '+key);
    }
    // Simula a função do SDK, que pode unir segmentos consecutivos.
    if(typeof p==='string' && typeof output.at(-1)==='string') output[output.length-1]+=p;
    else output.push(p);
  }
  return output;
}
function setup(front,back,{normalize=normalizeRichText}={}){
  const db={text:structuredClone(front),backText:structuredClone(back)};
  const writes=[];
  const plugin={
    rem:{async findOne(){return {
      get text(){return structuredClone(db.text)},get backText(){return structuredClone(db.backText)},
      async setText(value){const checked=normalizeRichText(value);writes.push('text');db.text=checked;},
      async setBackText(value){const checked=normalizeRichText(value);writes.push('backText');db.backText=checked;}
    }}},
    richText:{
      normalize,
      async substring(v,start,end){return v.map(x=>typeof x==='string'?x.slice(start,end):x).filter(x=>x!=='')},
      async length(v){return v.reduce((sum,x)=>sum+(typeof x==='string'?x.length:x.i==='m'?x.text.length:1),0)}
    }
  };
  return {plugin,db,writes};
}
const selection=(word)=>({remId:'abc',richText:[word]});

test('fundo de flashcard: normaliza RichText antes de setBackText e preserva texto',async()=>{
 const ctx=setup(['Frente'],['Explicação: ALVO segue.']);
 const result=await replaceSelectionFormatting(ctx.plugin,selection('ALVO'),{h:'green',tc:'Green',b:true});
 assert.equal(result.side,'backText'); assert.deepEqual(ctx.writes,['backText']);
 assert.deepEqual(ctx.db.backText,['Explicação: ',{i:'m',text:'ALVO',h:'green',tc:'Green',b:true},' segue.']);
});
test('atributos numéricos de cor/realce são preservados e recusados pela validação simulada',async()=>{
 const ctx=setup(['Texto ALVO'],[]);
 await assert.rejects(replaceSelectionFormatting(ctx.plugin,selection('ALVO'),{h:1,b:true}),/VALIDAÇÃO/);
 assert.deepEqual(ctx.writes,[]);
 assert.deepEqual(ctx.db.text,['Texto ALVO']);
});
test('valores numéricos do RemNote são preservados sem conversão',()=>{
 assert.deepEqual(safeStyle({tc:123}),{tc:123});
 assert.deepEqual(safeStyle({tc:'#00ff88',h:'green',b:true}),{tc:'#00ff88',h:'green',b:true});
});
test('se SDK normalize falha, não executa gravação',async()=>{
 const ctx=setup(['Texto ALVO'],[],{normalize:async()=>{throw Error('Invalid input')}});
 await assert.rejects(replaceSelectionFormatting(ctx.plugin,selection('ALVO'),{b:true}),/VALIDAÇÃO/);
 assert.deepEqual(ctx.writes,[]);
});
test('se normalize modifica conteúdo, cancela sem gravar',async()=>{
 const ctx=setup(['Texto ALVO'],[],{normalize:async()=>['TEXTO DIFERENTE']});
 await assert.rejects(replaceSelectionFormatting(ctx.plugin,selection('ALVO'),{b:true}),/INTEGRIDADE/);
 assert.deepEqual(ctx.writes,[]);
});
test('se normalize remove metadados de texto, cancela sem gravar',async()=>{
 const ctx=setup([{i:'m',text:'ABCD ALVO',custom:'x'}],[],{normalize:async(a)=>a.map(x=>typeof x==='string'?x:({...x,custom:undefined}))});
 await assert.rejects(replaceSelectionFormatting(ctx.plugin,selection('ALVO'),{b:true}),/INTEGRIDADE/);
 assert.deepEqual(ctx.writes,[]);
});
test('referências fora da seleção permanecem intactas na escrita',async()=>{
 const original=[{i:'q',id:'reference-1'},'Prefixo ALVO Fim'];
 const ctx=setup(['Outra frente'],original);
 await replaceSelectionFormatting(ctx.plugin,selection('ALVO'),{u:true});
 assert.deepEqual(ctx.writes,['backText']);
 assert.deepEqual(ctx.db.backText[0],original[0]);
 assert.equal(ctx.db.backText.map(x=>typeof x==='string'?x:x.i==='m'?x.text:'').join(''),'Prefixo ALVO Fim');
});
test('não altera palavra errada se duas ocorrências indistinguíveis',async()=>{
 const ctx=setup(['ALVO ALVO'],[]);
 await assert.rejects(replaceSelectionFormatting(ctx.plugin,selection('ALVO'),{b:true}),/AMBIGUIDADE/);
 assert.deepEqual(ctx.writes,[]);
});
test('fingerprint protegido é independente de fragmentação de texto',()=>{
 assert.equal(protectedFingerprint(['teste ',{i:'m',text:'a',b:true}]),protectedFingerprint(['teste ',{i:'m',text:'a',h:'red'}]));
 assert.notEqual(protectedFingerprint([{i:'m',text:'ABC',custom:'x'}]),protectedFingerprint([{i:'m',text:'ABC',custom:'y'}]));
});
test('prepareForWrite não altera objeto original',async()=>{
 const raw=['Olá TESTE']; const proposed=['Olá ',{i:'m',text:'TESTE',h:'red'}];
 const normalized=await prepareForWrite({richText:{normalize:async(v)=>normalizeRichText(v)}},raw,proposed);
 assert.deepEqual(raw,['Olá TESTE']); assert.deepEqual(normalized,proposed);
});

test('se normalize descarta a cor, cancela em vez de alegar sucesso',async()=>{
 const ctx=setup(['Texto ALVO'],[],{normalize:async(a)=>a.map(p=>typeof p==='string'?p:({...p,h:undefined}))});
 await assert.rejects(replaceSelectionFormatting(ctx.plugin,selection('ALVO'),{h:'green'}),/não preservou a representação original/);
 assert.deepEqual(ctx.writes,[]);
});
