"use strict";
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {extractColorStyle,preserveColor}=require('../src/lib/color-values.cjs');
const {safeStyle,replaceSelectionFormatting}=require('../src/lib/replace-selection-v16.cjs');
test('preserva cor hexadecimal sem converter',()=>{
 assert.deepEqual(extractColorStyle({i:'m',text:'A',tc:'#aBc123'}).style,{tc:'#aBc123'});
});
test('preserva o valor numerico original',()=>{
 assert.deepEqual(extractColorStyle({i:'m',text:'A',tc:0xff0088}).style,{tc:0xff0088});
 assert.deepEqual(safeStyle({tc:0xff0088}),{tc:0xff0088});
});
test('preserva objeto e array da cor sem alterar a fonte',()=>{
 const source={i:'m',text:'A',tc:{hex:'#fa08cd',mode:'custom',alpha:0.7},h:[1,2,3]};
 const obj=extractColorStyle(source).style;
 assert.deepEqual(obj,{tc:{hex:'#fa08cd',mode:'custom',alpha:0.7},h:[1,2,3]});
 obj.tc.hex='#123456';assert.equal(source.tc.hex,'#fa08cd');
});
test('rejeita estruturas perigosas e preserva integridade',()=>{
 assert.throws(()=>preserveColor(Object.assign(Object.create(null),{'__proto__':'x',constructor:'bad'})),/restrita/);
 assert.throws(()=>safeStyle({tc:()=>42}),/inválida/);
});
test('nao grava se normalizacao nao aceitar a cor crua',async()=>{
 const rem={text:['ALVO'],backText:[],async setText(){throw Error('NAO PODE GRAVAR')},async setBackText(){throw Error('NAO PODE GRAVAR')}};
 const plugin={rem:{async findOne(){return rem}},richText:{async normalize(){throw Error('Schema invalid')}}};
 await assert.rejects(replaceSelectionFormatting(plugin,{remId:'r',richText:['ALVO']},{tc:{v:'#ac12ef'}}),/VALIDAÇÃO/);
 assert.deepEqual(rem.text,['ALVO']);
});
test('nao substitui atributos de cor por HEX suposto',()=>{
 assert.deepEqual(safeStyle({b:true,h:{value:0x123456},tc:[42,'CUSTOM']}),{b:true,h:{value:0x123456},tc:[42,'CUSTOM']});
});
