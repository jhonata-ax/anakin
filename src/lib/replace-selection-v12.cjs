'use strict';
/**
 * Safe format-only replacement for RemNote RichText.
 * Operates on text runs; atomic tokens are kept byte-for-byte identical.
 * Does NOT rely on editor focus or remote richText.substring index semantics.
 */
const ALLOWED = Object.freeze(['b','l','u','h','tc']);
const TYPE = 'm';
const STRUCTURAL = new Set(['cId','hiddenCloze','revealedCloze','qId','url','title','workInProgressPortal','workInProgressRem','workInProgressTag']);

function isText(part) {
  return typeof part === 'string' || (!!part && typeof part === 'object' && !Array.isArray(part) && part.i === TYPE && typeof part.text === 'string');
}
function textOf(part) { return typeof part === 'string' ? part : part.text; }
function selectPlainText(selection) {
  const items=selection?.richText;
  if (!selection || !selection.remId || !Array.isArray(items) || !items.length || !items.every(isText))
    throw Error('SELECAO: selecione somente uma palavra comum, sem referências ou imagens.');
  const value = items.map(textOf).join('');
  if (!value || !value.trim()) throw Error('SELECAO: selecione uma palavra antes de aplicar.');
  return value;
}
function safeStyle(style) {
  if (!style || typeof style !== 'object' || Array.isArray(style))
    throw Error('ESTILO: formato copiado inválido; copie novamente.');
  const result={};
  for (const k of ALLOWED) {
    if (!Object.prototype.hasOwnProperty.call(style,k)) continue;
    const v=style[k];
    if (['b','l','u'].includes(k)) {
      if (typeof v !== 'boolean') throw Error('ESTILO: negrito/itálico/sublinhado inválido.');
    } else if (typeof v !== 'number' && typeof v !== 'string') {
      throw Error('ESTILO: cor ou realce inválido.');
    }
    result[k]=v;
  }
  return result;
}
function plainSnapshot(parts) {
  if (!Array.isArray(parts)) throw Error('REM: texto do Rem não está disponível.');
  return parts.map(x=>isText(x)?['T',textOf(x)]:['A',JSON.stringify(x)]);
}
function fingerprint(parts) {
  const sequence=[];
  for(const item of parts){
    if(isText(item)){
      const text=textOf(item);
      if(sequence.length && sequence[sequence.length-1][0]==='T') sequence[sequence.length-1][1]+=text;
      else sequence.push(['T',text]);
    }else sequence.push(['A', JSON.stringify(item)]);
  }
  return JSON.stringify(sequence);
}
/** Text runs cannot cross a Rem reference, delimiter, image, etc. */
function findMatches(parts, needle) {
  if(!Array.isArray(parts) || !needle) return [];
  const matches=[];
  let run='',segments=[],projected=0,offset=0;
  function flush() {
    if (!run || !segments.length) {run='';segments=[];return;}
    let search=0;
    while(true){
      const from=run.indexOf(needle,search);
      if(from<0)break;
      matches.push({ start: segments[0].projected + from,
        from, to:from+needle.length, segments:segments.slice() });
      search=from+1;
    }
    run='';segments=[];
  }
  for(let i=0;i<parts.length;i++) {
    const part=parts[i];
    if(!isText(part)){
      flush();
      projected+=1; // one atomic position for tie-breaking only
      continue;
    }
    const str=textOf(part);
    if(!segments.length) offset=projected;
    segments.push({ index:i, text:str, runStart:run.length, projected:offset });
    run+=str;
    projected+=str.length;
  }
  flush();
  return matches;
}
function isUnsafeSegment(part) {
  if(typeof part==='string')return false;
  return Object.keys(part).some(k=>STRUCTURAL.has(k) || (k!=='i' && k!=='text' && !ALLOWED.includes(k)));
}
function slicePart(part,from,to) {
  const t=textOf(part).slice(from,to);
  return typeof part==='string'?t:{...part,text:t};
}
function stylePart(part,from,to,style) {
  const t=textOf(part).slice(from,to);
  // a fully new text fragment with only style keys: no cloze/link changes.
  const out={i:TYPE,text:t};
  for(const [k,v] of Object.entries(style))out[k]=v;
  return out;
}
function mutate(parts,match,style) {
  const affected=[];
  for(const seg of match.segments) {
    const a=Math.max(match.from,seg.runStart),b=Math.min(match.to,seg.runStart+seg.text.length);
    if(a<b) affected.push(seg.index);
  }
  if(!affected.length) throw Error('SELECAO: nenhum segmento editável foi encontrado.');
  for(const i of affected) if(isUnsafeSegment(parts[i]))
    throw Error('SEGURANCA: a seleção contém um link, cloze ou propriedade especial. Nada foi alterado.');
  const output=[];
  for(let i=0;i<parts.length;i++){
    const seg=match.segments.find(x=>x.index===i);
    if(!seg || !affected.includes(i)) {output.push(parts[i]);continue;}
    const a=Math.max(match.from,seg.runStart)-seg.runStart;
    const b=Math.min(match.to,seg.runStart+seg.text.length)-seg.runStart;
    if(a>0)output.push(slicePart(parts[i],0,a));
    if(b>a)output.push(stylePart(parts[i],a,b,style));
    if(b<seg.text.length)output.push(slicePart(parts[i],b,seg.text.length));
  }
  if(fingerprint(output)!==fingerprint(parts))
    throw Error('INTEGRIDADE: alteração de texto detectada. Operação cancelada.');
  return output;
}
function choose(sources,needle,position,preferredSide) {
  const all=[];
  for(const s of sources)for(const m of findMatches(s.value,needle))all.push({source:s,match:m});
  if(!all.length) throw Error('DESTINO: a palavra selecionada não foi encontrada no Rem; selecione novamente.');
  if(all.length===1)return all[0];
  if(preferredSide) {
    const sideMatches=all.filter(x=>x.source.key===preferredSide);
    if(sideMatches.length===1)return sideMatches[0];
    if(Number.isSafeInteger(position) && position>=0) {
      const exactOnSide=sideMatches.filter(x=>x.match.start===position);
      if(exactOnSide.length===1)return exactOnSide[0];
    }
  }
  // If there are duplicate words, the RemNote editor offset may allow a safe tie break.
  if(Number.isSafeInteger(position) && position>=0){
    const exact=all.filter(x=>x.match.start===position);
    if(exact.length===1)return exact[0];
  }
  throw Error('AMBIGUIDADE: essa palavra aparece mais de uma vez. Use um trecho maior e exclusivo.');
}
async function replaceSelectionFormatting(plugin,selected,style) {
  const needle=selectPlainText(selected), safe=safeStyle(style);
  const rem=await plugin.rem.findOne(selected.remId);
  if(!rem)throw Error('REM: o Rem selecionado não foi encontrado.');
  const fronts=[{key:'text',setter:'setText',value:rem.text},{key:'backText',setter:'setBackText',value:rem.backText}]
    .filter(x=>Array.isArray(x.value));
  if(!fronts.length) throw Error('REM: nenhum texto editável foi encontrado.');
  let sideHint;
  // Focus is only a secondary, verified hint. It is never required for normal use.
  try {
    const focused=await plugin.editor?.getFocusedEditorText?.();
    if(Array.isArray(focused)) {
      const equal=fronts.filter(s=>JSON.stringify(s.value)===JSON.stringify(focused));
      if(equal.length===1) sideHint=equal[0].key;
    }
  }catch(_){}
  const chosen=choose(fronts,needle,selected.range?.start,sideHint);
  const before=JSON.stringify(chosen.source.value);
  const output=mutate(chosen.source.value,chosen.match,safe);
  // Extra check to prevent writing if the Rem has changed since selection.
  const fresh=await plugin.rem.findOne(selected.remId);
  if(!fresh || JSON.stringify(fresh[chosen.source.key])!==before)
    throw Error('ALTERADO: o Rem mudou durante a operação. Selecione novamente.');
  if(typeof fresh[chosen.source.setter]!=='function')
    throw Error('API: não é possível gravar esse lado do cartão.');
  try {await fresh[chosen.source.setter](output);} catch(e) {
    throw Error(`GRAVACAO: RemNote rejeitou a alteração (${String(e?.message||e).slice(0,130)}).`);
  }
  return {length:needle.length,side:chosen.source.key,matchStart:chosen.match.start};
}
module.exports={ALLOWED,isText,textOf,selectPlainText,safeStyle,fingerprint,findMatches,mutate,choose,replaceSelectionFormatting};
