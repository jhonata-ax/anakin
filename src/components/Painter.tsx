import React, {useState} from 'react';
import {usePlugin} from '@remnote/plugin-sdk';
import {copyFormat, pasteFormat, inspectColor, withToast} from '../lib/core';
export default function Painter() {
  const plugin=usePlugin();
  const [status,setStatus]=useState('Selecione uma palavra e use Copiar.');
  const [busy,setBusy]=useState(false);
  async function perform(action:()=>Promise<string>) {
    if(busy) return;
    setBusy(true);
    try {setStatus(await withToast(plugin,action));} finally {setBusy(false);}
  }
  const btn: React.CSSProperties={cursor:'pointer',borderRadius:8,border:'1px solid #4b5563',padding:'8px 10px',fontWeight:650};
  return <div style={{background:'#111419',color:'#e5e7eb',padding:12,fontSize:13,fontFamily:'system-ui',borderRadius:10}}>
    <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>🖌 Pincel de formatação</div>
    <div style={{display:'flex',gap:7,flexWrap:'wrap',marginTop:12}}>
      <button disabled={busy} style={{...btn,background:'#374151',color:'#fff'}} onClick={()=>perform(()=>copyFormat(plugin))}>Copiar</button>
      <button disabled={busy} style={{...btn,background:'#e5e7eb',color:'#111827'}} onClick={()=>perform(()=>pasteFormat(plugin))}>Aplicar</button>
    </div>
    <p style={{color:'#cbd5e1',fontSize:12,lineHeight:1.5}} aria-live="polite">{status}</p>
    <button disabled={busy} style={{...btn,padding:'5px 7px',background:'#1f2937',color:'#cbd5e1',fontSize:11}} onClick={()=>perform(()=>inspectColor(plugin))}>Diagnosticar cor</button>
    <p style={{color:'#9ca3af',fontSize:11,lineHeight:1.4}}>Comandos rápidos: <b>fpc</b> copiar, <b>fpa</b> aplicar, <b>fpd</b> diagnosticar. Ajuste atalhos no RemNote → Configurações → Keyboard Shortcuts.</p>
  </div>;
}
