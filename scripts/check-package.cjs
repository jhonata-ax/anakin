'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const required=[
  'manifest.json', 'index.html', 'README.md',
  'index.js', 'index-sandbox.js',
  'painter.js', 'painter-sandbox.js',
  'painter_sidebar.js', 'painter_sidebar-sandbox.js',
  'painter_bottom.js', 'painter_bottom-sandbox.js',
  'painter_mini.js', 'painter_mini-sandbox.js',
];
for(const name of required){
  const file=path.join(root,'dist',name);
  if(!fs.existsSync(file)||!fs.statSync(file).size)throw Error('Pacote incompleto: '+name);
}
const manifest=JSON.parse(fs.readFileSync(path.join(root,'dist','manifest.json'),'utf8'));
if(manifest.id!=='format_painter_br'||manifest.version.major!==2||manifest.version.minor!==0||manifest.version.patch!==9)
  throw Error('ID ou versao do manifest incorretos.');
const zip=path.join(root,'PluginZip.zip');
if(!fs.existsSync(zip)||fs.statSync(zip).size<20000)throw Error('PluginZip.zip nao foi gerado corretamente.');
const header=fs.readFileSync(zip).subarray(0,4).toString('hex');
if(header!=='504b0304')throw Error('PluginZip.zip nao e um ZIP valido.');
console.log('OK: pacote compilado para RemNote v2.0.9 em PluginZip.zip.');
