"use strict";
const {test}=require('node:test');const assert=require('node:assert/strict');
const {isUsableTextSelection,firstUsableTextSelection}=require('../src/lib/selection-utils.cjs');
const good={remId:'a',richText:[{i:'m',text:'CERTO'}],range:{start:0,end:5}};
test('seleção de texto editável é aceita',()=>assert.equal(isUsableTextSelection(good),true));
test('seleção ausente de fila é recusada sem inventar Rem',()=>assert.equal(isUsableTextSelection(undefined),false));
test('seleção de lista ou card inteiro não é seleção de texto',()=>assert.equal(isUsableTextSelection({remId:'a'}),false));
test('fallback seleciona método alternativo quando ele traz um range válido',()=>assert.deepEqual(firstUsableTextSelection(undefined,good),good));
test('range inválido não entra na gravação',()=>assert.equal(isUsableTextSelection({...good,range:{start:2,end:2}}),false));
