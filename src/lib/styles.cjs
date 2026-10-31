"use strict";
const {extractColorStyle,colorShape}=require("./color-values.cjs");
// Copia APENAS atributos conhecidos de estilo. Nao copia identificadores, clozes ou links.
function isTextPart(x, textType) {
  return typeof x === "string" || !!x && typeof x === "object" && x.i === textType && typeof x.text === "string";
}
function formOf(x, keys) {
  const result = {};
  if (typeof x === "string") return result;
  for (const k of keys) if (Object.prototype.hasOwnProperty.call(x, k)) result[k] = x[k];
  return result;
}
function getStyleDetails(parts, keys, textType) {
  if (!Array.isArray(parts) || !parts.length || parts.every(x => x === ""))
    throw Error("Selecione uma palavra de origem.");
  if (!parts.every(x => isTextPart(x, textType)))
    throw Error("A selecao inclui elementos especiais. Selecione apenas texto comum.");
  // A seleção de uma única palavra pode cruzar vários segmentos RichText.
  // Agrupa por formatação, ponderando pelo tamanho, preferindo estilo explícito
  // quando há pontuação ou espaços sem formatação nas bordas.
  const weights=new Map();
  for (const part of parts) {
    const content=typeof part==='string'?part:part.text;
    if (!content) continue;
    const style={...formOf(part,keys),...extractColorStyle(part).style};
    const signature=JSON.stringify(style);
    const item=weights.get(signature) || {style,weight:0};
    item.weight+=Array.from(content).length;
    weights.set(signature,item);
  }
  if(!weights.size) throw Error("Selecione uma palavra de origem.");
  const withStyle=Array.from(weights.values()).filter(x=>Object.keys(x.style).length);
  const candidates=withStyle.length?withStyle:Array.from(weights.values());
  candidates.sort((a,b)=>b.weight-a.weight);
  return {style:candidates[0].style,mixed:weights.size>1};
}
/** Copy the precise formatting of the selected characters, not the longest
 * formatted run. A multi-style selection is ambiguous for a single-style
 * paintbrush and MUST be rejected rather than silently choosing a neighbor.
 */
function getExactStyleDetails(parts, keys, textType) {
  if (!Array.isArray(parts) || !parts.length)
    throw Error("CÓPIA: selecione a palavra cuja formatação deseja copiar.");
  if (!parts.every(x => isTextPart(x, textType)))
    throw Error("CÓPIA: a seleção contém um elemento especial. Selecione somente texto.");
  const seen=[];
  let characters=0;
  for (const part of parts) {
    const content=typeof part==='string' ? part : part.text;
    if (!content || !content.trim()) continue;
    characters+=content.length;
    const found=extractColorStyle(part);
    if (found.unsupported.length)
      throw Error('CÓPIA: a seleção possui uma cor que a versão do SDK não consegue interpretar.');
    const style={...formOf(part,keys),...found.style};
    // Empty/default boolean flags do not represent a format, and must not
    // make two otherwise-identical runs look different.
    for (const k of ['b','l','u']) if(style[k]===false)delete style[k];
    const canonical=JSON.stringify(Object.keys(style).sort().map(k=>[k,style[k]]));
    if(!seen.some(x=>x.canonical===canonical))seen.push({canonical,style});
  }
  if (!characters)throw Error('CÓPIA: a seleção contém apenas espaços.');
  if(seen.length!==1)
    throw Error('CÓPIA: a seleção contém estilos diferentes. Selecione apenas a palavra/trecho com um único estilo; nenhuma formatação anterior foi substituída.');
  return {style:seen[0].style,length:characters,mixed:false};
}
function getStyle(parts, keys, textType) {
  return getStyleDetails(parts, keys, textType).style;
}
function applyStyle(parts, style, keys, textType) {
  if (!Array.isArray(parts) || !parts.length || parts.every(x => x === ""))
    throw Error("Selecione a palavra de destino.");
  if (!parts.every(x => isTextPart(x, textType)))
    throw Error("O destino inclui elementos especiais. Nada foi alterado.");
  if (!style || typeof style !== 'object' || Array.isArray(style))
    throw Error("Formato copiado invalido.");
  const safeStyle = {};
  for (const k of keys) if (Object.prototype.hasOwnProperty.call(style, k)) safeStyle[k] = style[k];
  return parts.map(x => {
    const original = typeof x === 'string' ? {i:textType, text:x} : {...x};
    for (const k of keys) delete original[k];
    return {...original, ...safeStyle};
  });
}
// Mostra chaves de possivel cor sem expor o conteudo selecionado.
function colorDiagnostics(parts, keys) {
  const text = (parts || []).find(x => x && typeof x === 'object' && typeof x.text === 'string');
  if (!text) return {colorKeys:[], otherKeys:[]};
  const colorKeys = Object.keys(text).filter(k => keys.includes(k) && /color|highlight|^h$|^fc$|^tc$|^fg$/i.test(k));
  const otherKeys = Object.keys(text).filter(k => k !== 'text' && k !== 'i' && !keys.includes(k));
  return {colorKeys, otherKeys};
}
module.exports = {getStyle, getStyleDetails, getExactStyleDetails, applyStyle, colorDiagnostics, colorShape};
