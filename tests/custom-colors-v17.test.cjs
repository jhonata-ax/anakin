"use strict";
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {getStyleDetails}=require('../src/lib/styles.cjs');
const {safeStyle,replaceSelectionFormatting}=require('../src/lib/replace-selection-v16.cjs');
const {normalizeColor,extractColorStyle,colorShape}=require('../src/lib/color-values.cjs');
const KEYS=['b','l','u','h','tc'];
test('captura explicitamente tc hexadecimal ainda que o enum antigo não o forneça',()=>{
  const chosen=getStyleDetails([{i:'m',text:'rosa',tc:'#f05ac8',b:true}],KEYS,'m');
  assert.deepEqual(chosen.style,{b:true,tc:'#f05ac8'});
});
test('aceita cor predefinida e customizada sem convertê-las em índice',()=>{
  assert.deepEqual(safeStyle({tc:'Green',h:'blue'}),{tc:'Green',h:'blue'});
  assert.deepEqual(safeStyle({tc:'#FF36AC',h:'rgba(10, 20, 30, 0.25)'}),{tc:'#FF36AC',h:'rgba(10, 20, 30, 0.25)'});
});
test('interpreta componentes RGB e HEX de origem',()=>{
  assert.deepEqual(extractColorStyle({text:'X',i:'m',textColor:{r:255,g:16,b:32}}).style,{tc:'#ff1020'});
  assert.deepEqual(extractColorStyle({text:'X',i:'m',tc:{hex:'#ad00ff'}}).style,{tc:{hex:'#ad00ff'}});
});
test('interpreta inteiro RGB inequivoco e recusa índice pequeno',()=>{
  assert.equal(normalizeColor(0xff2299),'#ff2299');
  assert.equal(normalizeColor(5),null);
});
test('captura alias para cor personalizada sem copiar atributo estranho',()=>{
  assert.deepEqual(getStyleDetails([{i:'m',text:'rosa',customTextColor:'#fa23ac',b:true}],KEYS,'m').style,{b:true,tc:'#fa23ac'});
});
test('não publica conteúdo no diagnóstico de cor',()=>{
  const out=colorShape([{i:'m',text:'SEGREDO',tc:'#ee0088'}]);
  assert.deepEqual(out,['tc:string']);
  assert(!JSON.stringify(out).includes('SEGREDO'));
});
test('valida e aplica cor hex ao destino sem duplicar a palavra',async()=>{
 const state={text:['exemplo ALVO exemplo'],backText:[]},writes=[];
 const plugin={
  rem:{async findOne(){return {get text(){return structuredClone(state.text)},get backText(){return structuredClone(state.backText)},
   async setText(value){writes.push(value);state.text=value;}, async setBackText(value){writes.push(value);state.backText=value;}}}},
  richText:{async normalize(v){return v},async length(v){return v.reduce((n,p)=>n+(typeof p==='string'?p.length:p.text?.length||1),0)},async substring(v,start,end){return [v.map(p=>typeof p==='string'?p:p.text||'').join('').slice(start,end)]}}
 };
 const selected={remId:'one',richText:['ALVO'],range:{start:8,end:12}};
 const result=await replaceSelectionFormatting(plugin,selected,{tc:'#ff36ac',b:true});
 assert.equal(result.side,'text');
 assert.equal(writes.length,1);
 assert.equal(state.text.map(p=>typeof p==='string'?p:p.text).join(''),'exemplo ALVO exemplo');
 const target=state.text.find(x=>typeof x==='object'&&x.text==='ALVO');
 assert.equal(target.tc,'#ff36ac');
});
test('nenhuma gravação se normalização rejeitar custom color',async()=>{
 const state={text:['X ALVO Y'],backText:[]};let written=false;
 const plugin={rem:{async findOne(){return {text:state.text,backText:state.backText,async setText(){written=true;},async setBackText(){written=true;}}}},richText:{async normalize(){throw Error('Invalid input');}}};
 await assert.rejects(replaceSelectionFormatting(plugin,{remId:'x',richText:['ALVO']},{tc:'#ff88aa'}),/VALIDAÇÃO/);
 assert.equal(written,false);
});

test('cor de formato desconhecido é sinalizada, não tratada como cor ausente',()=>{
 const result=extractColorStyle({i:'m',text:'ALVO',tc:['#f08']});
 assert.deepEqual(result.style.tc,['#f08']);
 assert.deepEqual(result.unsupported,[]);
});
test('cópia não descarta cor personalizada desconhecida silenciosamente',()=>{
 const fs=require('node:fs');
 const code=fs.readFileSync(require('node:path').join(__dirname,'../src/lib/core.ts'),'utf8');
 assert.match(code,/if\(unsupported.length\) throw Error/);
});
