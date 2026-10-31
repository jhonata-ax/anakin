import {RICH_TEXT_FORMATTING, RICH_TEXT_ELEMENT_TYPE, type ReactRNPlugin} from '@remnote/plugin-sdk';
import {getStyleDetails, getExactStyleDetails, colorDiagnostics, colorShape} from './styles.cjs';
import {extractColorStyle} from './color-values.cjs';
import {applyToActiveSelection} from './exact-selection.cjs';
import {isUsableTextSelection,firstUsableTextSelection} from './selection-utils.cjs';
import {remember,recall} from './selection-memory.cjs';

/** Chamado pelo plugin principal para guardar a última seleção válida. */
export async function rememberSelection(plugin: ReactRNPlugin) { return remember(plugin); }

// RICH_TEXT_FORMATTING.TEXT_COLOR is absent from some legacy SDK typings.
// `tc` is copied verbatim; custom colors may be encoded as values other than CSS strings.
const STYLE_KEYS: string[] = Array.from(new Set([
  RICH_TEXT_FORMATTING.BOLD, RICH_TEXT_FORMATTING.ITALIC,
  RICH_TEXT_FORMATTING.UNDERLINE, RICH_TEXT_FORMATTING.HIGHLIGHT,
  'b', 'l', 'u', 'h', 'tc'
].filter((k): k is string => typeof k === 'string')));
const TEXT_TYPE = RICH_TEXT_ELEMENT_TYPE.TEXT;
const STORAGE_KEY = 'format-painter:copied-style-v05';

let lastRemembered: any;
async function selectionOrThrow(plugin: ReactRNPlugin): Promise<any> {
  // A edição modal da fila de revisão nem sempre informa uma seleção de texto.
  // Tentar ambos os acessos oficiais, sem ler DOM/clipboard e sem inventar posição.
  let primary: any;
  try { primary = await plugin.editor.getSelectedText(); } catch (error) {
    console.debug('[Format Painter] getSelectedText indisponível:', error);
  }
  if (isUsableTextSelection(primary) && primary.range && Number.isSafeInteger(primary.range.start) && Number.isSafeInteger(primary.range.end)) return primary;
  let secondary: any;
  try { secondary = await plugin.editor.getSelection(); } catch (error) {
    console.debug('[Format Painter] getSelection indisponível:', error);
  }
  // Prefer a verifiable range when both APIs describe the same selected text.
  // Never combine a range from another Rem or a different selection.
  if (isUsableTextSelection(primary) && isUsableTextSelection(secondary) &&
    primary.remId===secondary.remId && JSON.stringify(primary.richText)===JSON.stringify(secondary.richText) &&
    secondary.range && Number.isSafeInteger(secondary.range.start)) return secondary;
  const found = firstUsableTextSelection(primary, secondary);
  if (found) return found;
  const remembered = await recall(plugin);
  if (remembered) { lastRemembered = remembered; return remembered.selection; }
  let queueActive = false;
  try { queueActive = !!(await plugin.queue.getCurrentCard()); } catch (_) { /* fila não ativa */ }
  if (queueActive) {
    throw Error('FILA: nesta janela o RemNote não forneceu uma seleção editável ao plugin. Use fpo para abrir o cartão no editor normal e aplicar com segurança.');
  }
  throw Error('SELECAO: selecione somente a palavra no editor antes de usar Copiar ou Aplicar.');
}
export async function openCurrentReviewCard(plugin: ReactRNPlugin): Promise<string> {
  const card = await plugin.queue.getCurrentCard();
  if (!card) throw Error('FILA: não existe cartão ativo na fila de revisão.');
  const rem = await card.getRem();
  if (!rem) throw Error('FILA: não foi possível localizar o Rem do cartão.');
  await plugin.window.openRem(rem);
  return 'Cartão aberto no editor normal. Selecione a palavra antes de aplicar.';
}
export async function copyFormat(plugin: ReactRNPlugin, selectionSnapshot?: any): Promise<string> {
  // Capture the SOURCE before the floating toolbar can take editor focus.
  // Only selected.richText is inspected: never search the rest of the card.
  const selected = selectionSnapshot || await selectionOrThrow(plugin);
  const {style,length} = getExactStyleDetails(selected.richText, STYLE_KEYS, TEXT_TYPE);
  // Nunca ignorar uma cor não interpretada: isso apagaria a cor do destino.
  const unsupported=(selected.richText||[]).flatMap((part:any)=>extractColorStyle(part).unsupported);
  if(unsupported.length) throw Error(`COR PERSONALIZADA: formato ainda não suportado (${unsupported.map((x:any)=>x.key+':'+x.type).join(', ')}). Use fpd; nenhuma formatação foi copiada.`);
  await plugin.storage.setLocal(STORAGE_KEY, {v: 2, style});
  const diagnostics = colorDiagnostics(selected.richText, STYLE_KEYS);
  const detected = Object.keys(style).filter(k=>k==='tc'||k==='h');
  const rawShapes = colorShape(selected.richText);
  const color = detected.length ? ` Cor/realce copiado: ${detected.join(', ')}.` : rawShapes.length ? ` Cor reconhecida no texto, mas formato não suportado (${rawShapes.join(', ')}); estilos restantes copiados.` : ' Nenhum atributo de cor recebido pela API.';
  const shown = selected.richText.map((p: any) => typeof p === 'string' ? p : p.text || '').join('');
  const preview = shown.length > 28 ? shown.slice(0,28) + '…' : shown;
  return `Formato copiado de “${preview}” (${length} caracteres).${color}`;
}
export async function captureSelection(plugin: ReactRNPlugin): Promise<any> {
  return selectionOrThrow(plugin);
}
export async function pasteFormat(plugin: ReactRNPlugin, selectionSnapshot?:any): Promise<string> {
  // Apenas a seleção do editor: não procurar palavras em outros campos do Rem.
  lastRemembered = undefined;
  const selected = selectionSnapshot || await selectionOrThrow(plugin);
  // Read focus context while the selection is still current, before storage calls.
  let focusedSnapshot: any;
  try { focusedSnapshot = await plugin.editor.getFocusedEditorText(); } catch (_) {}
  // Se a seleção veio da memória (o clique na barra tirou o foco), o texto do editor
  // memorizado serve apenas como dica para escolher frente/verso; nunca como destino.
  let hint: any = lastRemembered?.focusedText;
  if (!hint) { const m = await recall(plugin); if (m && JSON.stringify(m.selection)===JSON.stringify(selected)) hint = m.focusedText; }
  const saved = await plugin.storage.getLocal<{v:number,style:Record<string,unknown>}>(STORAGE_KEY);
  if (!saved || saved.v !== 2) throw Error('Primeiro copie a formatacao da palavra de origem.');
  const result = await applyToActiveSelection(plugin, selected, saved.style, focusedSnapshot, hint);
  if (result.unchanged) return 'O trecho selecionado já tinha essa formatação.';
  const dropped = (result as any).dropped as string[] | undefined;
  const warn = dropped?.length ? ` ATENÇÃO: o RemNote recusou ${dropped.map(k=>k==='h'?'o realce (h)':'a cor do texto (tc)').join(' e ')}; o restante foi aplicado.` : '';
  return `Formatação aplicada exclusivamente ao trecho selecionado; ${result.length} caracteres preservados.${warn}`;
}
/** Diagnosis does not include the actual selected words or edit any Rem. */
export async function inspectSelection(plugin: ReactRNPlugin): Promise<string> {
  const selected = await selectionOrThrow(plugin);
  const rich = selected.richText || [];
  const types = rich.map((x: any) => typeof x === 'string' ? 'texto' : x?.i || 'objeto');
  const typeCount: Record<string,number> = {};
  for(const t of types) typeCount[t]=(typeCount[t]||0)+1;
  const position = selected.range && Number.isSafeInteger(selected.range.start) &&
    Number.isSafeInteger(selected.range.end) ? `${selected.range.start}-${selected.range.end}` : 'não disponível';
  return `SELEÇÃO (sem exibir conteúdo): ${rich.length} segmentos, tipos ${JSON.stringify(typeCount)}, faixa ${position}. Apenas o intervalo selecionado será considerado.`;
}
/** Relatório passo a passo do que o plugin enxerga no momento do clique. Não altera nada e não mostra o texto. */
export async function diagnoseClick(plugin: ReactRNPlugin): Promise<string> {
  const out: string[] = [];
  const t0 = Date.now();
  const rangeOf = (s: any) => s?.range ? `${s.range.start}-${s.range.end}` : 'sem faixa';
  let live: any;
  try { live = await plugin.editor.getSelectedText(); out.push('1 ao vivo: ' + (live ? `SIM (${rangeOf(live)}, remId ${live.remId ? 'ok' : 'FALTA'})` : 'NÃO')); }
  catch (e: any) { out.push('1 ao vivo: ERRO ' + String(e?.message || e).slice(0, 60)); }
  try { const g: any = await plugin.editor.getSelection(); out.push('2 getSelection: ' + (g ? (g.type || 'objeto') : 'NÃO')); }
  catch (e: any) { out.push('2 getSelection: ERRO ' + String(e?.message || e).slice(0, 60)); }
  const mem: any = await recall(plugin);
  out.push('3 memória: ' + (mem ? `SIM (${Math.round((Date.now() - mem.at) / 1000)}s, ${rangeOf(mem.selection)})` : 'NÃO'));
  let focused: any;
  try { focused = await plugin.editor.getFocusedEditorText(); out.push('4 editor focado: ' + (Array.isArray(focused) ? `SIM (${focused.length} partes)` : 'NÃO')); }
  catch (e: any) { out.push('4 editor focado: ERRO ' + String(e?.message || e).slice(0, 60)); }
  const sel = live?.remId ? live : mem?.selection;
  if (sel?.remId) {
    try {
      const rem: any = await plugin.rem.findOne(sel.remId);
      const f = Array.isArray(rem?.text), b = Array.isArray(rem?.backText);
      out.push(`5 Rem: ${rem ? 'achado' : 'NÃO achado'}${rem ? `, frente ${f ? 'sim' : 'não'}, verso ${b ? 'sim' : 'não'}` : ''}`);
    } catch (e: any) { out.push('5 Rem: ERRO ' + String(e?.message || e).slice(0, 60)); }
  } else out.push('5 Rem: sem seleção para localizar');
  const saved: any = await plugin.storage.getLocal(STORAGE_KEY);
  out.push('6 formato copiado: ' + (saved?.v === 2 ? `SIM (${Object.keys(saved.style || {}).join(',') || 'nenhum estilo'})` : 'NÃO'));
  out.push(`(${Date.now() - t0} ms)`);
  return out.join(' | ');
}
export async function inspectColor(plugin: ReactRNPlugin): Promise<string> {
  const selected = await selectionOrThrow(plugin);
  const diag = colorDiagnostics(selected.richText, STYLE_KEYS);
  const format=getStyleDetails(selected.richText,STYLE_KEYS,TEXT_TYPE).style;
  const shape=Object.entries(format).filter(([k])=>k==='tc'||k==='h')
    .map(([k,v])=>`${k}=${JSON.stringify(v).slice(0,100)}`);
  return `Campos de cor recebidos (tipo): ${colorShape(selected.richText).join(', ') || '(nenhum)'}. Valores de cor (sem mostrar texto): ${shape.join('; ') || '(nenhum)'}. Outros campos: ${diag.otherKeys.join(', ') || '(nenhum)'}.`;
}
export async function withToast(plugin: ReactRNPlugin, action: () => Promise<string>) {
  try {
    const message = await action();
    await plugin.app.toast('Pincel 2.0.0: ' + message);
    return message;
  } catch (error: any) {
    const message = error?.message || String(error);
    console.error('[Format Painter 2.0.0] ' + message, error);
    await plugin.app.toast('Pincel 2.0.0: ' + message);
    return 'ERRO: ' + message;
  }
}
