'use strict';
/**
 * Memória da última seleção válida. O plugin principal (que nunca perde foco)
 * grava aqui o trecho selecionado; os botões, que roubam o foco do editor ao
 * serem clicados, recorrem a ela quando a seleção "ao vivo" já desapareceu.
 * A posição continua sendo revalidada contra o texto real antes de qualquer gravação.
 */
const {isUsableTextSelection}=require('./selection-utils.cjs');
const KEY='format-painter:last-selection-v19';
const TTL_MS=20000;
const WRITE_REFRESH_MS=8000;
let lastSignature;
let lastWrittenAt=0;
const hasRange=s=>!!(s&&s.range&&Number.isSafeInteger(s.range.start)&&Number.isSafeInteger(s.range.end)&&s.range.end>s.range.start);
function makeEntry(selection,focusedText,now=Date.now()){
  if(!isUsableTextSelection(selection)||!hasRange(selection))return undefined;
  const clone=x=>JSON.parse(JSON.stringify(x));
  return {at:now,selection:clone(selection),focusedText:Array.isArray(focusedText)?clone(focusedText):undefined};
}
function freshEntry(entry,now=Date.now(),ttl=TTL_MS){
  if(!entry||typeof entry.at!=='number'||now-entry.at>ttl||now<entry.at-1000)return undefined;
  return isUsableTextSelection(entry.selection)&&hasRange(entry.selection)?entry:undefined;
}
async function remember(plugin){
  try{
    const selection=await plugin.editor.getSelectedText();
    if(!isUsableTextSelection(selection)||!hasRange(selection))return false;
    let focused;try{focused=await plugin.editor.getFocusedEditorText();}catch(_){}
    const entry=makeEntry(selection,focused);
    if(!entry)return false;
    // O fallback de monitoramento não deve gravar a mesma seleção na sessão
    // repetidamente. Renova antes de vencer o prazo de 20 s.
    const signature=JSON.stringify([entry.selection,entry.focusedText]);
    if(signature===lastSignature && entry.at-lastWrittenAt<WRITE_REFRESH_MS)return true;
    await plugin.storage.setSession(KEY,entry);
    lastSignature=signature;
    lastWrittenAt=entry.at;
    return true;
  }catch(_){return false;}
}
async function recall(plugin,now=Date.now()){
  try{return freshEntry(await plugin.storage.getSession(KEY),now);}catch(_){return undefined;}
}
module.exports={KEY,TTL_MS,WRITE_REFRESH_MS,makeEntry,freshEntry,remember,recall};
