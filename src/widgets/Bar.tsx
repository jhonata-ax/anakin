import React,{useEffect,useRef,useState} from 'react';
import {usePlugin} from '@remnote/plugin-sdk';
import {copyFormat,pasteFormat,captureSelection,withToast,diagnoseClick} from '../lib/core';
import {getBarState,switchBar,moveBar,saveBarPosition} from '../lib/toolbar';
import {movedPosition} from '../lib/toolbar-state.cjs';

type Point={bottom:number,right:number};
const shell:React.CSSProperties={background:'#202124',border:'1px solid #44474b',borderRadius:14,
  width:'100%',height:'100%',boxSizing:'border-box',display:'flex',alignItems:'center',
  padding:'3px 6px',gap:2,color:'#cdd0d5',fontFamily:'Arial, system-ui, sans-serif',
  boxShadow:'0 4px 16px rgba(0,0,0,.18)',userSelect:'none',overflow:'hidden'};
const iconButton:React.CSSProperties={border:'0',borderRadius:10,background:'transparent',color:'inherit',
  cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',
  fontSize:9.5,lineHeight:'12px',padding:'2px 2px',height:38,minWidth:54};

function PaintIcon({type}:{type:'copy'|'apply'}){
  // Outline icons sized like the native Flashcard, Heading and Todo buttons.
  return type==='copy'?<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 5 4 4M4 20l4.5-1.4L19 8.1a2.1 2.1 0 0 0-3-3L5.4 15.7 4 20Z"/>
    <path d="M7 14l3 3"/>
  </svg>:<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round">
    <rect x="6" y="5" width="13" height="15" rx="2"/>
    <path d="M9 5.5V3.8h7V5M10 12l2.2 2.2L16 10.5"/>
  </svg>;
}
function withTimeout<T>(p:Promise<T>,ms:number,msg:string):Promise<T>{
  // Evita botão travado em "ocupado" se alguma chamada da API nunca responder.
  return new Promise<T>((resolve,reject)=>{const t=setTimeout(()=>reject(Error(msg)),ms);p.then(v=>{clearTimeout(t);resolve(v);},e=>{clearTimeout(t);reject(e);});});
}
export default function Bar({compact}:{compact:boolean}){
  const plugin=usePlugin();
  const [busy,setBusy]=useState(false);
  const [note,setNote]=useState('');
  const stateRef=useRef<Point>({bottom:84,right:22});
  const drag=useRef<null|{startX:number,startY:number,position:Point,last:Point}>(null);
  const queue=useRef<{busy:boolean,latest:null|Point}>({busy:false,latest:null});
  const selectionCache=useRef<null|{selection:any,at:number,which:'copy'|'paste'}>(null);
  const captureId=useRef(0);
  const lastTap=useRef(0);
  useEffect(()=>{let active=true;getBarState(plugin).then(s=>{if(active)stateRef.current=s.position;}).catch(()=>{});return()=>{active=false;};},[plugin]);
  async function sendMove(position:Point){
    queue.current.latest=position;
    if(queue.current.busy)return;
    queue.current.busy=true;
    try{while(queue.current.latest){const next=queue.current.latest;queue.current.latest=null;await moveBar(plugin,next);}}
    catch(error){console.warn('[Format Painter] Não foi possível mover:',error);}
    finally{queue.current.busy=false;}
  }
  function startDrag(e:React.PointerEvent<HTMLSpanElement>){
    if(e.button!==0)return;
    e.preventDefault();e.stopPropagation();
    drag.current={startX:e.screenX,startY:e.screenY,position:stateRef.current,last:stateRef.current};
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function duringDrag(e:React.PointerEvent<HTMLSpanElement>){
    if(!drag.current)return;
    e.preventDefault();
    const pos=movedPosition(drag.current.position,e.screenX-drag.current.startX,e.screenY-drag.current.startY);
    drag.current.last=pos;
    void sendMove(pos);
  }
  async function endDrag(e:React.PointerEvent<HTMLSpanElement>){
    if(!drag.current)return;
    const {startX,startY}=drag.current;
    const last=drag.current.last;drag.current=null;stateRef.current=last;
    try{e.currentTarget.releasePointerCapture(e.pointerId);}catch(_){}
    // Toque sem arrastar: dois toques seguidos (até 450 ms) recolhem ou expandem a barra.
    const moved=Math.hypot(e.screenX-startX,e.screenY-startY)>3;
    if(!moved){
      const now=Date.now();
      if(now-lastTap.current<450){lastTap.current=0;await switchBar(plugin,!compact);return;}
      lastTap.current=now;return;
    }
    lastTap.current=0;
    await saveBarPosition(plugin,last);await sendMove(last);
  }
  async function snapshotAtClick(which:'copy'|'paste') {
    // This is the FIRST awaited operation of the click. A preceding React
    // state update or toast can cause loss of selection in the desktop app.
    try { return await captureSelection(plugin); }
    catch (error) {
      const cached=selectionCache.current;
      // If focus was lost exactly as the cursor entered the toolbar, use ONLY
      // the snapshot captured on entry to this SAME button, for a brief time.
      if(cached && cached.which===which && Date.now()-cached.at<1200 &&
         cached.selection?.range?.end>cached.selection?.range?.start)
        return cached.selection;
      throw error;
    }
  }
  function prefetch(which:'copy'|'paste') {
    const id=++captureId.current;
    selectionCache.current=null;
    void captureSelection(plugin).then(selection=>{
      if(id===captureId.current)
        selectionCache.current={selection,at:Date.now(),which};
    }).catch(()=>{});
  }
  async function run(which:'copy'|'paste'){
    if(busy)return;
    try {
      const selected=await withTimeout(snapshotAtClick(which),6000,'TEMPO: o RemNote não respondeu à leitura da seleção. Tente novamente.');
      // Do not keep a cached selection after using it.
      selectionCache.current=null;
      setBusy(true);
      if(which==='copy'){
        const msg=await withTimeout(withToast(plugin,()=>copyFormat(plugin,selected)),10000,'TEMPO: a cópia demorou demais.');setNote(msg);return;
      }
      const savedSelection=selected;
      const msg=await withTimeout(pasteFormat(plugin,savedSelection),10000,'TEMPO: a aplicação demorou demais. Confira o texto antes de repetir.');
      setNote(msg);
      await plugin.app.toast('Pincel 2.0.0: '+msg);
    }catch(error:any){
      const msg=error?.message||String(error);setNote('ERRO: '+msg);
      await plugin.app.toast('Pincel 2.0.0: '+msg);
      console.error('[Format Painter 2.0.0]',error);
    }finally {setBusy(false);}
  }
  async function runDiagnose(){
    const msg=await withToast(plugin,()=>withTimeout(diagnoseClick(plugin),8000,'TEMPO: o diagnóstico não terminou.'));setNote(msg);
  }
  function action(which:'copy'|'paste'){
    return {
      onPointerEnter:()=>prefetch(which),
      onPointerLeave:()=>{++captureId.current;},
      onPointerDown:(e:React.PointerEvent<HTMLButtonElement>)=>{
        if(e.button!==0)return;
        e.preventDefault();e.stopPropagation();void run(which);
      },
      onClick:(e:React.MouseEvent<HTMLButtonElement>)=>{
        if(e.detail===0){e.preventDefault();void run(which);}
      }
    };
  }
  const grip=<span title="Arraste para mover · duplo clique para recolher/expandir" aria-label="Arrastar barra (duplo clique recolhe ou expande)"
    onPointerDown={startDrag} onPointerMove={duringDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
    style={{cursor:'grab',touchAction:'none',fontSize:13,lineHeight:'28px',padding:'2px 1px',color:'#9ca0a6'}}>⠿</span>;
  if(compact){return <div style={shell}>
    {grip}
    <button type="button" title="Reabrir pincel" aria-label="Reabrir pincel"
      onClick={()=>void switchBar(plugin,false)} style={{...iconButton,minWidth:40}}>
      <PaintIcon type="copy"/><span>Expandir</span>
    </button>
  </div>;}
  return <div style={shell} title={note||'Pincel de formatação — estilo RemNote'}>
    {grip}
    <button {...action('copy')} disabled={busy} type="button" title="Copiar formatação da seleção (fpc)"
      style={{...iconButton,opacity:busy ? 0.55 : 1}}><PaintIcon type="copy"/><span>Copiar</span></button>
    <button {...action('paste')} disabled={busy} type="button" title="Aplicar somente ao texto selecionado (fpa)"
      style={{...iconButton,opacity:busy ? 0.55 : 1}}><PaintIcon type="apply"/><span>Aplicar</span></button>
    <button type="button" title="Diagnóstico: mostra o que o plugin enxerga ao clicar" aria-label="Diagnóstico"
      onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();void runDiagnose();}}
      style={{border:'none',background:'transparent',color:'#a9adb3',fontSize:14,cursor:'pointer',padding:'2px 1px',alignSelf:'center'}}>?</button>
  </div>;
}
