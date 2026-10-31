'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {replaceSelectionFormatting,findMatches,contentFingerprint}=require('../src/lib/replace-selection-v14.cjs');
const sample=(word,range)=>({remId:'R1',richText:[word],...(range?{range}: {})});
function fixture(front,back,{richText=false}={}){
  const value={text:structuredClone(front),backText:back===undefined?undefined:structuredClone(back)};
  const written=[];
  const rem=()=>({
    get text(){return structuredClone(value.text);},
    get backText(){return structuredClone(value.backText);},
    async setText(parts){written.push('text');value.text=structuredClone(parts);},
    async setBackText(parts){written.push('backText');value.backText=structuredClone(parts);},
  });
  const plugin={rem:{async findOne(){return rem();}}};
  if(richText)plugin.richText={
    async length(parts){return parts.reduce((n,p)=>n+(typeof p==='string'?p.length:p.i==='m'?p.text.length:1),0);},
    async substring(parts,start,end){
      let current=0,out=[];
      for(const p of parts){const text=typeof p==='string'?p:p?.i==='m'?p.text:null;const width=text===null?1:text.length;
        const a=Math.max(0,start-current),b=Math.min(width,end-current);
        if(text!==null && a<b)out.push(typeof p==='string'?text.slice(a,b):{...p,text:text.slice(a,b)});
        else if(text===null && a<b)out.push(p);
        current+=width;
      }
      return out;
    }
  };
  return {plugin,value,written};
}
test('sem range: ocorrência única funciona, sem depender do foco', async()=>{
  const m=fixture(['ABC DESTINO XYZ']);
  const r=await replaceSelectionFormatting(m.plugin,sample('DESTINO'),{b:true,tc:'Green',h:'Yellow'});
  assert.equal(r.unchanged,false); assert.equal(m.value.text.map(p=>typeof p==='string'?p:p.text).join(''),'ABC DESTINO XYZ');
  assert.equal(m.value.text.find(p=>p?.text==='DESTINO').tc,'Green');
  assert.deepEqual(m.written,['text']);
});
test('range fornecido mas colapsado não é utilizado como desempate', async()=>{
  const m=fixture(['A A']);
  await assert.rejects(replaceSelectionFormatting(m.plugin,sample('A',{start:1,end:1}),{b:true}),/AMBIGUIDADE/);
  assert.deepEqual(m.written,[]);
});
test('múltiplas ocorrências e tokens especiais: índice do SDK identifica a escolhida',async()=>{
  const parts=[{i:'s',delimiterCharacterForSerialization:'>>'},'X ',{i:'q',_id:'42'},' A A'];
  const m=fixture(parts,undefined,{richText:true});
  const before=contentFingerprint(m.value.text);
  const r=await replaceSelectionFormatting(m.plugin,sample('A',{start:7,end:8}),{tc:8});
  assert.equal(r.unchanged,false);assert.equal(contentFingerprint(m.value.text),before);
  const matches=m.value.text.filter(x=>x?.text==='A' && x?.tc===8);
  assert.equal(matches.length,1);
});
test('múltiplas ocorrências sem posição verificável nunca altera palavra ao acaso',async()=>{
  const m=fixture(['VERDE VERDE']);
  await assert.rejects(replaceSelectionFormatting(m.plugin,sample('VERDE'),{b:true}),/AMBIGUIDADE/);
  assert.equal(m.written.length,0);
});
test('preserva texto com propriedades não relacionadas a estilo',async()=>{
  const parts=[{i:'m',text:'ABCD',q:true,extraFlag:'X',tc:1},{i:'q',_id:'abc'}];
  const m=fixture(parts);
  const before=contentFingerprint(m.value.text);
  await replaceSelectionFormatting(m.plugin,sample('BC'),{b:true,tc:'Blue'});
  assert.equal(contentFingerprint(m.value.text),before);
  const found=m.value.text.find(x=>x?.text==='BC');
  assert.equal(found.q,true);assert.equal(found.extraFlag,'X');assert.equal(found.tc,'Blue');
  assert.deepEqual(m.value.text.at(-1),parts.at(-1));
});
test('preserva cloze alvo e cancela sem alterar',async()=>{
  const m=fixture([{i:'m',text:'HOJE',cId:'x',tc:'Red'}]);
  await assert.rejects(replaceSelectionFormatting(m.plugin,sample('HOJE'),{tc:'Green'}),/SEGURANÇA/);
  assert.deepEqual(m.written,[]);
});
test('foco distingue o verso se os textos exibidos diferirem',async()=>{
  const m=fixture([{i:'m',text:'ALVO',b:true}],['ALVO']);
  const r=await replaceSelectionFormatting(m.plugin,sample('ALVO'),{h:'Yellow'},['ALVO']);
  assert.equal(r.side,'backText');assert.deepEqual(m.written,['backText']);
});
test('não marca operação como aplicada quando não há mudança de estilo',async()=>{
  const m=fixture(['A ',{i:'m',text:'ALVO',b:true}]);
  const r=await replaceSelectionFormatting(m.plugin,sample('ALVO'),{b:true});
  assert.equal(r.unchanged,true);assert.equal(m.written.length,0);
});
test('seleção de duas palavras cruza segmentos sem colar texto duplicado',async()=>{
  const m=fixture([{i:'m',text:'primeira ',tc:'Blue'}, {i:'m',text:'segunda',b:true}]);
  const before=contentFingerprint(m.value.text);
  await replaceSelectionFormatting(m.plugin,sample('primeira segunda'),{tc:'Red'});
  assert.equal(contentFingerprint(m.value.text),before);
  assert.equal(m.value.text.filter(x=>x?.tc==='Red').length,2);
});
