'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {cleanState,movedPosition,cleanPosition}=require('../src/lib/toolbar-state.cjs');
test('arrastar para a direita diminui right e para cima aumenta bottom',()=>{
  assert.deepEqual(movedPosition({bottom:100,right:200},40,-30),{bottom:130,right:160});
});
test('posicao nunca recebe NaN e limita valores extremos',()=>{
  assert.deepEqual(cleanPosition({bottom:NaN,right:-20}),{bottom:84,right:0});
  assert.deepEqual(cleanPosition({bottom:9999,right:Infinity}),{bottom:4000,right:22});
});
test('recolhida, ocultacao e posicao persistem no estado',()=>{
  assert.deepEqual(cleanState({compact:true,hidden:false,position:{right:300,bottom:190}}),{
    compact:true,hidden:false,position:{right:300,bottom:190}
  });
});
