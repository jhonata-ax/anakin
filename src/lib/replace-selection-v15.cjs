'use strict';
/**
 * Format-only editing. Never inserts text; only changes approved style fields
 * on verified text runs. Ignores unrelated rich-text tokens without rewriting
 * them, and refuses ambiguous selections instead of guessing an occurrence.
 */
const ALLOWED = Object.freeze(['b', 'l', 'u', 'h', 'tc']);
const TEXT_TYPE = 'm';
const STRUCTURAL = new Set([
  'cId', 'hiddenCloze', 'revealedCloze', 'qId', 'url', 'title',
  'workInProgressPortal', 'workInProgressRem', 'workInProgressTag'
]);
function isText(part) {
  return typeof part === 'string' ||
    (!!part && typeof part === 'object' && !Array.isArray(part) && part.i === TEXT_TYPE && typeof part.text === 'string');
}
function textOf(part) { return typeof part === 'string' ? part : part.text; }
function selectPlainText(selection) {
  const items = selection?.richText;
  if (!selection?.remId || !Array.isArray(items) || items.length === 0 || !items.every(isText))
    throw Error('SELEÇÃO: selecione somente texto, sem imagens, referências ou separadores.');
  const text = items.map(textOf).join('');
  if (!text.trim()) throw Error('SELEÇÃO: selecione uma palavra ou trecho não vazio.');
  return text;
}
function safeStyle(style) {
  if (!style || typeof style !== 'object' || Array.isArray(style)) throw Error('ESTILO: copie o formato novamente.');
  const out = {};
  for (const key of ALLOWED) {
    if (!Object.prototype.hasOwnProperty.call(style, key)) continue;
    const value = style[key];
    if (['b', 'l', 'u'].includes(key)) {
      if (typeof value !== 'boolean') throw Error('ESTILO: valor inválido para negrito/itálico/sublinhado.');
    } else if (typeof value !== 'number' && typeof value !== 'string') {
      throw Error('ESTILO: valor inválido para cor ou realce.');
    }
    out[key] = value;
  }
  return out;
}
function contentFingerprint(parts) {
  // Text segment splitting is irrelevant; all non-text tokens must remain identical.
  if (!Array.isArray(parts)) throw Error('REM: RichText não disponível.');
  const seq = [];
  for (const item of parts) {
    if (isText(item)) {
      const str = textOf(item);
      if (seq.length && seq[seq.length-1][0] === 'T') seq[seq.length-1][1] += str;
      else seq.push(['T', str]);
    } else seq.push(['A', JSON.stringify(item)]);
  }
  return JSON.stringify(seq);
}
function findMatches(parts, needle) {
  if (!Array.isArray(parts) || !needle) return [];
  const out=[];
  let run='', pieces=[], projected=0;
  function flush() {
    if (run) {
      let cursor=0;
      while (cursor <= run.length-needle.length) {
        const from = run.indexOf(needle,cursor);
        if (from<0) break;
        out.push({from,to:from+needle.length, pieces:pieces.slice(),
          // synthetic position is only valid for the plain-text subset
          projectedStart:pieces[0].projectedStart+from,
          includesAtomic:pieces[0].includesAtomic});
        cursor=from+1;
      }
    }
    run='';pieces=[];
  }
  let atomicSeen=false;
  for(let i=0;i<parts.length;i++) {
    const item=parts[i];
    if(!isText(item)) {flush();atomicSeen=true;projected+=1;continue;}
    const value=textOf(item);
    if(!pieces.length) pieces.push({index:i, start:0, text:value, projectedStart:projected, includesAtomic:atomicSeen});
    else pieces.push({index:i, start:run.length, text:value, projectedStart:projected, includesAtomic:atomicSeen});
    run+=value;
    projected+=value.length;
  }
  flush();
  return out;
}
function safeTarget(part) {
  if (typeof part === 'string') return true;
  // Do not modify clozes, inline links or structural text metadata.
  return !Object.keys(part).some(k => STRUCTURAL.has(k));
}
function stylePiece(part, start, end, style) {
  const text = textOf(part).slice(start,end);
  const styled = typeof part === 'string' ? {i:TEXT_TYPE,text} : {...part,text};
  // Replace only style flags, retaining non-style text metadata (e.g. quote/code).
  for(const k of ALLOWED) delete styled[k];
  return Object.assign(styled,style);
}
function slicePiece(part,start,end) {
  const t=textOf(part).slice(start,end);
  return typeof part === 'string' ? t : {...part,text:t};
}
function mutate(parts, match, style) {
  const affected=[];
  for (const seg of match.pieces) {
    const start=Math.max(match.from,seg.start),end=Math.min(match.to,seg.start+seg.text.length);
    if(end>start)affected.push(seg.index);
  }
  if(!affected.length)throw Error('DESTINO: nenhum caractere selecionado é editável.');
  for(const i of affected) if(!safeTarget(parts[i]))
    throw Error('SEGURANÇA: a seleção contém um cloze ou link. Nada foi alterado.');
  const wanted=new Set(affected), out=[];
  for(let i=0;i<parts.length;i++) {
    const seg=match.pieces.find(s=>s.index===i);
    if(!wanted.has(i)||!seg){out.push(parts[i]);continue;}
    const a=Math.max(match.from,seg.start)-seg.start;
    const b=Math.min(match.to,seg.start+seg.text.length)-seg.start;
    if(a>0)out.push(slicePiece(parts[i],0,a));
    if(b>a)out.push(stylePiece(parts[i],a,b,style));
    if(b<seg.text.length)out.push(slicePiece(parts[i],b,seg.text.length));
  }
  if(contentFingerprint(out)!==contentFingerprint(parts))
    throw Error('INTEGRIDADE: a alteração modificaria o conteúdo. Operação cancelada.');
  return out;
}
function plainTextAt(parts, start, end) {
  // Valid for ordinary RichText text, not for tokens with special lengths.
  let cursor=0,str='';
  for(const part of parts) {
    if(!isText(part)) return null;
    const text=textOf(part),from=Math.max(0,start-cursor),to=Math.min(text.length,end-cursor);
    if(to>from)str+=text.slice(from,to);
    cursor+=text.length;
  }
  return str;
}
function exactOffset(selection) {
  const r=selection?.range;
  if(!r || !Number.isSafeInteger(r.start) || !Number.isSafeInteger(r.end)||r.start<0||r.end<=r.start)return null;
  return {start:r.start,end:r.end};
}
function matchPrefix(source, match) {
  // Build the prefix from ACTUAL RichText elements. Counting only plain text
  // would be wrong when the Rem includes references, flashcard delimiters etc.
  const piece=match.pieces.find(p => match.from >= p.start && match.from < p.start+p.text.length);
  if(!piece)throw Error('POSIÇÃO: início da seleção não está em um segmento de texto.');
  const offset=match.from-piece.start;
  const prefix=source.slice(0,piece.index);
  if(offset>0)prefix.push(slicePiece(source[piece.index],0,offset));
  return prefix;
}
async function findVerifiedOffsets(plugin, source, selection, needle) {
  const r=exactOffset(selection);
  if(!r)return [];
  const all=findMatches(source.value,needle);
  if(!all.length)return [];
  // Confirm that the editor's selection range addresses precisely this text
  // on the source side; then verify candidate positions against the API length.
  if(typeof plugin?.richText?.substring==='function' && typeof plugin?.richText?.length==='function') {
    try {
      const excerpt=await plugin.richText.substring(source.value,r.start,r.end);
      if(!Array.isArray(excerpt)||!excerpt.every(isText)||excerpt.map(textOf).join('')!==needle)return [];
      const verified=[];
      for(const match of all){
        try {
          const prefix=matchPrefix(source.value,match);
          const logicalStart=await plugin.richText.length(prefix);
          if(logicalStart===r.start)verified.push(match);
        }catch(_){/* candidate not provable */}
      }
      return verified;
    } catch (_) {return [];} // NEVER guess if the RemNote API rejected a range.
  }
  // Plain-text-only fallback: JavaScript offsets equal RemNote logical offsets.
  if(source.value.every(isText) && plainTextAt(source.value,r.start,r.end)===needle)
    return all.filter(m=>m.projectedStart===r.start);
  return [];
}
function sideAmbiguity(message){
  const error=new Error(message);
  error.code='SIDE_AMBIGUITY';
  return error;
}
async function choose(plugin,sources,selection,needle,focusedSnapshot,forcedSide) {
  const all=[];
  for(const source of sources) for(const match of findMatches(source.value,needle)) all.push({source,match});
  if(!all.length)throw Error('DESTINO: o texto selecionado não está no Rem. Selecione novamente.');
  const pool=forcedSide ? all.filter(x=>x.source.key===forcedSide) : all;
  if(!pool.length)throw Error('DESTINO: a seleção não existe no lado escolhido. Nenhuma alteração realizada.');
  if(pool.length===1)return pool[0];
  // First priority: exact position verified by SDK logical RichText offsets.
  const verified=[];
  for(const source of sources){
    if(forcedSide && source.key!==forcedSide)continue;
    const offsets=await findVerifiedOffsets(plugin,source,selection,needle);
    for(const match of offsets){
      const candidate=pool.find(x=>x.source.key===source.key && x.match.from===match.from &&
        x.match.pieces[0].index===match.pieces[0].index);
      if(candidate) verified.push(candidate);
    }
  }
  if(verified.length===1)return verified[0];
  // Second priority: full focused-editor snapshot, never just a substring.
  if(Array.isArray(focusedSnapshot)){
    const equalSources=sources.filter(s=>JSON.stringify(s.value)===JSON.stringify(focusedSnapshot));
    if(equalSources.length===1){
      const narrowed=pool.filter(x=>x.source.key===equalSources[0].key);
      if(narrowed.length===1)return narrowed[0];
      if(narrowed.length>1){
        const resolved=verified.filter(x=>x.source.key===equalSources[0].key);
        if(resolved.length===1)return resolved[0];
      }
    }
  }
  const uniqueSides=new Set(pool.map(x=>x.source.key));
  if(uniqueSides.size===2 && pool.length===2 && !forcedSide){
    throw sideAmbiguity('A palavra aparece uma vez no anverso e uma vez no verso. Escolha o lado na barra do pincel; nada foi alterado.');
  }
  throw Error('AMBIGUIDADE: múltiplas ocorrências sem posição confirmável; selecione trecho maior ou abra o editor normal.');
}
async function replaceSelectionFormatting(plugin, selected, style, focusedSnapshot, forcedSide) {
  const needle=selectPlainText(selected),safe=safeStyle(style);
  const rem=await plugin.rem.findOne(selected.remId);
  if(!rem)throw Error('REM: o Rem selecionado não foi encontrado.');
  const sources=[{key:'text',setter:'setText',value:rem.text},{key:'backText',setter:'setBackText',value:rem.backText}]
    .filter(x=>Array.isArray(x.value));
  if(!sources.length)throw Error('REM: nenhum lado contém RichText editável.');
  const chosen=await choose(plugin,sources,selected,needle,focusedSnapshot,forcedSide);
  const before=JSON.stringify(chosen.source.value);
  const output=mutate(chosen.source.value,chosen.match,safe);
  if(JSON.stringify(output)===before)return {unchanged:true,length:needle.length,side:chosen.source.key};
  const latest=await plugin.rem.findOne(selected.remId);
  if(!latest || JSON.stringify(latest[chosen.source.key])!==before)
    throw Error('ALTERAÇÃO CONCORRENTE: o Rem mudou durante a operação. Selecione novamente.');
  if(typeof latest[chosen.source.setter]!=='function')throw Error('API: método de gravação indisponível.');
  try { await latest[chosen.source.setter](output); }
  catch(e) {throw Error(`GRAVAÇÃO: ${String(e?.message||e).slice(0,180)}`);}
  return {unchanged:false,length:needle.length,side:chosen.source.key};
}
module.exports={ALLOWED,isText,textOf,selectPlainText,safeStyle,contentFingerprint,findMatches,mutate,matchPrefix,findVerifiedOffsets,choose,replaceSelectionFormatting,findVerifiedOffsets};
