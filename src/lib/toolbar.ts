import type {ReactRNPlugin} from '@remnote/plugin-sdk';
import {cleanState,cleanPosition} from './toolbar-state.cjs';
export const BAR_STATE_KEY='format-painter:bar:state-v08';
export const BAR_ID_KEY='format-painter:bar:id-v08';
export const FULL_WIDGET='painter_bottom';
export const MINI_WIDGET='painter_mini';

export async function getBarState(plugin:ReactRNPlugin) {
  const saved=await plugin.storage.getLocal<any>(BAR_STATE_KEY);
  return cleanState(saved) as {position:{bottom:number,right:number},compact:boolean,hidden:boolean};
}
export async function showBar(plugin:ReactRNPlugin) {
  const state=await getBarState(plugin);
  const id=await plugin.storage.getLocal<string>(BAR_ID_KEY);
  if(id){
    try{if(await plugin.window.isFloatingWidgetOpen(id)){if(!state.hidden)return id; await plugin.window.closeFloatingWidget(id);}}
    catch(_){/* reinicia em caso de widget obsoleto */}
  }
  state.hidden=false;
  await plugin.storage.setLocal(BAR_STATE_KEY,state);
  const created=await plugin.window.openFloatingWidget(state.compact?MINI_WIDGET:FULL_WIDGET,state.position,undefined,false);
  await plugin.storage.setLocal(BAR_ID_KEY,created);
  return created;
}
export async function hideBar(plugin:ReactRNPlugin) {
  const state=await getBarState(plugin);
  state.hidden=true;
  await plugin.storage.setLocal(BAR_STATE_KEY,state);
  const id=await plugin.storage.getLocal<string>(BAR_ID_KEY);
  if(id){try { await plugin.window.closeFloatingWidget(id); }catch(_) { /* ja fechado */ }}
  await plugin.storage.setLocal(BAR_ID_KEY,'');
}
export async function switchBar(plugin:ReactRNPlugin,compact:boolean) {
  const state=await getBarState(plugin);
  state.compact=compact; state.hidden=false;
  await plugin.storage.setLocal(BAR_STATE_KEY,state);
  const id=await plugin.storage.getLocal<string>(BAR_ID_KEY);
  // Abre o novo painel ANTES de fechar o atual: fechar o proprio widget
  // interromperia a funcao assíncrona que faz a troca.
  const created=await plugin.window.openFloatingWidget(compact?MINI_WIDGET:FULL_WIDGET,state.position,undefined,false);
  await plugin.storage.setLocal(BAR_ID_KEY,created);
  if(id) {try{await plugin.window.closeFloatingWidget(id);}catch(_) {}}
}
export async function moveBar(plugin:ReactRNPlugin,position:{bottom:number,right:number}) {
  const id=await plugin.storage.getLocal<string>(BAR_ID_KEY);
  if(!id)throw new Error('Barra nao esta ativa; use o comando fpb.');
  await plugin.window.setFloatingWidgetPosition(id,cleanPosition(position));
}
export async function saveBarPosition(plugin:ReactRNPlugin,position:{bottom:number,right:number}) {
  const state=await getBarState(plugin);
  state.position=cleanPosition(position);
  await plugin.storage.setLocal(BAR_STATE_KEY,state);
}
export async function resetBar(plugin:ReactRNPlugin) {
  await saveBarPosition(plugin,{bottom:84,right:22});
  await moveBar(plugin,{bottom:84,right:22});
}
