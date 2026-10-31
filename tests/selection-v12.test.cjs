'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {replaceSelectionFormatting,choose,findMatches,mutate}=require('../src/lib/replace-selection-v12.cjs');
const {getStyleDetails}=require('../src/lib/styles.cjs');
const text = (parts)=>parts.map(x=>typeof x==='string'?x:x.i==='m'?x.text:'\uFFFC').join('');
function make(front,back) {
 let data={text:structuredClone(front),backText:back===undefined?undefined:structuredClone(back)};
 const calls=[];
 const plugin={rem:{async findOne(id){return {get text(){return structuredClone(data.text)},get backText(){return structuredClone(data.backText)},async setText(v){calls.push('text');data.text=structuredClone(v)},async setBackText(v){calls.push('backText');data.backText=structuredClone(v)}}}}};
 return {plugin,calls,data:()=>structuredClone(data)};
}
const select=(s,start=0)=>({remId:'r1',range:{start,end:start+s.length},richText:[s]});
async function run(model,s,start,style={b:true,tc:'Green',h:'Yellow'}) {return replaceSelectionFormatting(model.plugin,select(s,start),style)}
test('seleção única é aplicada mesmo que o offset RemNote difira do texto serializado',async()=>{
 const m=make([{i:'s',delimiterCharacterForSerialization:'->'},'Primeiro termo e DESTINO agora']);
 const before=text(m.data().text);
 const r=await run(m,'DESTINO',999);assert.equal(r.side,'text');assert.equal(text(m.data().text),before);
 assert.ok(m.data().text.some(x=>x?.text==='DESTINO' && x.b && x.tc==='Green'));
});
test('texto com flashcard, referência e imagem preserva todos os tokens especiais',async()=>{
 const special=[{i:'s',delimiterCharacterForSerialization:'->'},{i:'q',_id:'ref123'},{i:'i',url:'x'}];
 const m=make(['Antes ',special[0],' e ',special[1],special[2],' DESTINO fim']);
 const before=m.data().text;
 await run(m,'DESTINO');
 assert.deepEqual(m.data().text.filter(x=>typeof x==='object' && x.i!=='m'),special);
 assert.equal(text(before),text(m.data().text));
});
test('copia cor de texto e cor de fundo no destino, preservando palavra',async()=>{
 const m=make(['CERTO outro']);await run(m,'outro',6,{b:true,tc:4,h:8});
 const x=m.data().text.find(x=>x?.text==='outro');assert.equal(x.b,true);assert.equal(x.tc,4);assert.equal(x.h,8);
});
test('não duplica palavra',async()=>{const m=make(['O certo está certo']);await run(m,'está',9);assert.equal(text(m.data().text),'O certo está certo')});
test('textos iguais em dois locais: escolhe apenas a posição exata',async()=>{
 const m=make(['A palavra A palavra']);await run(m,'palavra',12);const arr=m.data().text;
 assert.equal(arr.filter(x=>x?.text==='palavra'&&x.b).length,1);
 assert.equal(text(arr),'A palavra A palavra');
});
test('repetições com offset não confiável não alteram o Rem',async()=>{
 const m=make(['A A']);await assert.rejects(run(m,'A',99),/AMBIGUIDADE/);assert.equal(m.calls.length,0);
});
test('a mesma seleção nos dois lados sem posição única é recusada',async()=>{
 const m=make(['MESMA'],['MESMA']);await assert.rejects(run(m,'MESMA',0),/AMBIGUIDADE/);
 assert.equal(m.calls.length,0);
});
test('se a palavra só existe no verso, altera o verso',async()=>{
 const m=make(['FRENTE'],['teste DESTINO ok']);await run(m,'DESTINO',0);assert.deepEqual(m.calls,['backText']);
});
test('preserva marcações cloze fora da seleção',async()=>{
 const cloze={i:'m',text:'CLOZE',cId:'abc',hiddenCloze:true};
 const m=make([cloze,' DESTINO']);await run(m,'DESTINO');assert.deepEqual(m.data().text[0],cloze);
});
test('não edita cloze ou link selecionado',async()=>{
 const m=make([{i:'m',text:'CLOZE',cId:'abc'}]);await assert.rejects(run(m,'CLOZE'),/SEGURANCA/);
 assert.equal(m.calls.length,0);
});
test('preserva formatação das palavras ao redor',async()=>{
 const m=make([{i:'m',text:'VERDE ',tc:4},'DESTINO',{i:'m',text:' AZUL',tc:8}]);await run(m,'DESTINO');
 assert.equal(m.data().text[0].tc,4);assert.equal(m.data().text.at(-1).tc,8);
});
test('seleção não encontrada nunca grava',async()=>{
 const m=make(['abcdefgh']);await assert.rejects(run(m,'XYZ'),/DESTINO/);assert.equal(m.calls.length,0);
});
test('seleção atravessando dois segmentos de texto mantém conteúdo e recebe estilo',async()=>{
 const m=make(['Começo ',{i:'m',text:'DO',b:true},{i:'m',text:'IS',tc:2},' final']);
 await run(m,'DOIS',7,{b:true,tc:6});assert.equal(text(m.data().text),'Começo DOIS final');
 assert.equal(m.data().text.filter(x=>x?.tc===6).length,2);
});
test('seleção não pode atravessar token especial',async()=>{
 const m=make(['DO',{i:'q',_id:'abc'},'IS']);await assert.rejects(run(m,'DOIS'),/DESTINO/);
});
test('tipo de cor inválida é rejeitado sem modificar conteúdo',async()=>{
 const m=make(['X']);await assert.rejects(run(m,'X',0,{tc:{oops:1}}),/ESTILO/);assert.equal(m.calls.length,0);
});
test('read-after-selection concorrente cancela gravação se Rem mudar',async()=>{
 let num=0;const plugin={rem:{async findOne(){num++;return {text:num===1?['X']:['Y'],async setText(){throw Error('não deve gravar')}}}}};
 await assert.rejects(replaceSelectionFormatting(plugin,select('X'),{b:true}),/ALTERADO/);
});
test('falha de gravação mostra o erro real sem fingir sucesso',async()=>{
 const p={rem:{async findOne(){return {text:['X'],async setText(){throw Error('permission denied')}}}}};
 await assert.rejects(replaceSelectionFormatting(p,select('X'),{b:true}),/GRAVACAO.*permission denied/);
});
test('detecta formatacao do RemNote incluindo tc/h',()=>{
 const out=getStyleDetails([{i:'m',text:'CERTO',b:true,tc:4,h:7}],['b','l','u','tc','h'],'m');
 assert.equal(out.style.tc,4);assert.equal(out.style.h,7);assert.equal(out.style.b,true);
});
test('desempata palavras idênticas frente e verso pelo editor focado, se confirmado',async()=>{
 let data={text:['AQUI'],backText:['AQUI']};let calls=[];
 const plugin={
  editor:{async getFocusedEditorText(){return ['AQUI']}},
  rem:{async findOne(){return {text:structuredClone(data.text),backText:structuredClone(data.backText),
    async setText(v){calls.push('front');data.text=v},async setBackText(v){calls.push('back');data.backText=v}}}}
 };
 // Mesmos textos: foco não distingue lados; recusa corretamente.
 await assert.rejects(replaceSelectionFormatting(plugin,select('AQUI'),{b:true}),/AMBIGUIDADE/);
 assert.equal(calls.length,0);
});
test('desempata frente e verso com seleção coincidente usando o foco comparado',async()=>{
 let data={text:[{i:'m',text:'AQUI',b:true}],backText:['AQUI']};let calls=[];
 const plugin={editor:{async getFocusedEditorText(){return ['AQUI']}},rem:{async findOne(){return {
  text:structuredClone(data.text),backText:structuredClone(data.backText),
  async setText(v){calls.push('front');data.text=v},async setBackText(v){calls.push('back');data.backText=v}
 }}}};
 const res=await replaceSelectionFormatting(plugin,select('AQUI'),{b:true});
 assert.equal(res.side,'backText');assert.deepEqual(calls,['back']);
});
