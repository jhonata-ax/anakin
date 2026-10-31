const {test}=require('node:test');
const assert=require('node:assert/strict');
const {getStyle, applyStyle}=require('../src/lib/styles.cjs');
const keys=['b','it','h','u']; const type=2;
test('copia negrito e realce sem copiar o texto',()=>{
  const src=[{i:type,text:'CERTO',b:true,h:'green'}];
  const style=getStyle(src,keys,type);
  assert.deepEqual(style,{b:true,h:'green'});
  const dst=applyStyle(['RESPOSTA'],style,keys,type);
  assert.deepEqual(dst,[{i:type,text:'RESPOSTA',b:true,h:'green'}]);
});
test('remove a formatacao antiga do destino',()=>{
  const dst=applyStyle([{i:type,text:'TEXTO',h:'red',b:true}],{},keys,type);
  assert.equal(dst[0].text,'TEXTO');
  assert.equal(dst[0].h,undefined); assert.equal(dst[0].b,undefined);
});
test('rejeita componentes especiais e evita alteracao',()=>{
  assert.throws(()=>applyStyle([{i:999,text:'outro'}],{},keys,type),/especiais/);
});
test('aceita seleção fragmentada e prefere estilo explícito dominante',()=>{
  const s=getStyle([{i:type,text:'CER',b:true,h:'green'},'TO'],keys,type);
  assert.deepEqual(s,{b:true,h:'green'});
});
test('aceita origem simples não formatada',()=>{
  assert.deepEqual(getStyle(['PALAVRA'],keys,type),{});
});
