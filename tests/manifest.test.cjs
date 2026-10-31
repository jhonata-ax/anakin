"use strict";
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root=path.join(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'public','manifest.json'),'utf8'));
const index=fs.readFileSync(path.join(root,'src','widgets','index.tsx'),'utf8');
const config=fs.readFileSync(path.join(root,'webpack.config.cjs'),'utf8');
test('permissao de edicao satisfaz editor.setText',()=>{
  assert.ok(manifest.requiredScopes.some(s=>s.type==='All'&&s.level==='ReadCreateModifyDelete'));
});
test('barra móvel: widgets cheios e recolhidos têm entradas de build',()=>{
  assert.ok(index.includes('WidgetLocation.FloatingWidget'));
  assert.ok(index.includes("'painter_mini'"));
  assert.ok(index.includes("'painter_bottom'"));
  assert.ok(config.includes('painter_bottom-sandbox'));
  assert.ok(config.includes('painter_mini-sandbox'));
});
