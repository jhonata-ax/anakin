import {declareIndexPlugin,WidgetLocation,AppEvents,type ReactRNPlugin} from '@remnote/plugin-sdk';
import {copyFormat,pasteFormat,inspectColor,inspectSelection,diagnoseClick,openCurrentReviewCard,withToast,rememberSelection} from '../lib/core';
import {showBar,hideBar,resetBar} from '../lib/toolbar';
const ICON='https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f58c.png';
async function onActivate(plugin:ReactRNPlugin){
  await plugin.app.registerCommand({
    id:'pincel-copiar-formatacao',name:'Pincel: copiar formatação',quickCode:'fpc',
    description:'Copia os estilos do texto selecionado.',keywords:'pincel copiar estilo cor',
    action:async()=>{await withToast(plugin,()=>copyFormat(plugin));}
  });
  await plugin.app.registerCommand({
    id:'pincel-aplicar-formatacao',name:'Pincel: aplicar formatação',quickCode:'fpa',
    description:'Altera somente a formatação da seleção, sem duplicar o texto.',keywords:'pincel aplicar colar estilo',
    action:async()=>{await withToast(plugin,()=>pasteFormat(plugin));}
  });
  await plugin.app.registerCommand({
    id:'pincel-abrir-cartao-da-fila',name:'Pincel: abrir cartão no editor normal',quickCode:'fpo',
    description:'Abre o cartão atual no editor normal quando a seleção não está disponível na fila.',
    keywords:'pincel fila revisao abrir editar cartão',
    action:async()=>{await withToast(plugin,()=>openCurrentReviewCard(plugin));}
  });
  await plugin.app.registerCommand({
    id:'pincel-diagnosticar-selecao',name:'Pincel: diagnosticar seleção',quickCode:'fpx',
    description:'Conta ocorrências e mostra o estado da seleção sem revelar o texto nem modificar o Rem.',
    keywords:'pincel problema seleção ocorrência diagnostico',
    action:async()=>{await withToast(plugin,()=>diagnoseClick(plugin));}
  });
  await plugin.app.registerCommand({
    id:'pincel-diagnosticar-cor',name:'Pincel: diagnosticar cores',quickCode:'fpd',
    keywords:'pincel diagnosticar cor',action:async()=>{await withToast(plugin,()=>inspectColor(plugin));}
  });
  await plugin.app.registerCommand({
    id:'pincel-mostrar-barra-inferior',name:'Pincel: mostrar barra móvel',quickCode:'fpb',
    keywords:'pincel abrir barra',action:async()=>{await showBar(plugin);}
  });
  await plugin.app.registerCommand({
    id:'pincel-ocultar-barra-inferior',name:'Pincel: ocultar barra móvel',quickCode:'fph',
    keywords:'pincel fechar barra',action:async()=>{await hideBar(plugin);}
  });
  await plugin.app.registerCommand({
    id:'pincel-recentralizar-barra',name:'Pincel: restaurar posição da barra',quickCode:'fpr',
    keywords:'pincel barra restaurar posicao',action:async()=>{await withToast(plugin,async()=>{await resetBar(plugin);return 'Posição restaurada.';});}
  });
  await plugin.app.registerWidget('painter',WidgetLocation.SelectedTextMenu,{
    dimensions:{width:300,height:'auto'},widgetTabTitle:'Pincel',widgetTabIcon:ICON
  });
  await plugin.app.registerWidget('painter_sidebar',WidgetLocation.RightSidebar,{
    dimensions:{width:300,height:'auto'},widgetTabTitle:'Pincel',widgetTabIcon:ICON
  });
  await plugin.app.registerWidget('painter_bottom',WidgetLocation.FloatingWidget,{
    dimensions:{width:168,height:46}
  });
  await plugin.app.registerWidget('painter_mini',WidgetLocation.FloatingWidget,{
    dimensions:{width:72,height:46}
  });
  // Memoriza a última seleção válida: o clique em Copiar/Aplicar tira o foco do editor.
  try{plugin.event.addListener(AppEvents.EditorSelectionChanged,'fp-selection-memory',()=>{void rememberSelection(plugin);});}
  catch(e){console.warn('[Format Painter] Evento de seleção indisponível:',e);}
  try{setInterval(()=>{void rememberSelection(plugin);},600);}catch(_){}
  try{await showBar(plugin);}catch(e){console.warn('[Format Painter] Barra não disponível:',e);}
  console.info('[Format Painter 2.0.0] iniciado.');
}
async function onDeactivate(plugin:ReactRNPlugin){
  // A preferência de exibição permanece guardada; widget é encerrado pelo RemNote.
}
declareIndexPlugin(onActivate,onDeactivate);
