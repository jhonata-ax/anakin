'use strict';
/**
 * Selection-first painter. NEVER searches for a word in the rest of a Rem.
 * The editor's own active selection range is the sole authority for the target.
 * A selection without a trustworthy range cannot be edited safely through the
 * public API; in that case fail closed (do not guess / duplicate text).
 */
const {safeStyle, contentFingerprint, protectedFingerprint} = require('./replace-selection-v16.cjs');
const STYLE_KEYS=['b','l','u','h','tc'];
const STRUCTURAL = new Set(['cId','hiddenCloze','revealedCloze','qId','url','title','workInProgressPortal','workInProgressRem','workInProgressTag']);
const isText=x=>typeof x==='string'||Boolean(x && !Array.isArray(x) && x.i==='m' && typeof x.text==='string');
const getText=x=>typeof x==='string'?x:x.text;
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const copy=x=>JSON.parse(JSON.stringify(x));
function selectionText(sel){
  if (!sel||!sel.remId||!Array.isArray(sel.richText)||!sel.richText.length||!sel.richText.every(isText))
    throw Error('SELEÇÃO: destaque apenas texto comum.');
  const phrase=sel.richText.map(getText).join('');
  if (!phrase.length)throw Error('SELEÇÃO: destaque um trecho antes de aplicar.');
  return phrase;
}
function exactRange(sel){
  const r=sel?.range;
  if(!r||!Number.isSafeInteger(r.start)||!Number.isSafeInteger(r.end)||r.start<0||r.end<=r.start)
    throw Error('POSIÇÃO: o RemNote não informou o intervalo exato da seleção. Nenhuma outra ocorrência foi usada.');
  const phrase=selectionText(sel);
  if(r.end-r.start!==phrase.length)
    throw Error('POSIÇÃO: o intervalo recebido não corresponde ao comprimento do texto selecionado. Operação cancelada.');
  return {start:r.start,end:r.end,text:phrase};
}
function slice(part,a,b){const t=getText(part).slice(a,b);return typeof part==='string'?t:{...part,text:t};}
function paint(part,a,b,style){
  if(typeof part==='object' && Object.keys(part).some(k=>STRUCTURAL.has(k)))
    throw Error('SEGURANÇA: a seleção contém link/cloze especial; nada foi alterado.');
  const p=typeof part==='string'?{i:'m',text:part.slice(a,b)}:{...part,text:part.text.slice(a,b)};
  for(const key of STYLE_KEYS)delete p[key];
  for(const key of STYLE_KEYS)if(own(style,key))p[key]=copy(style[key]);
  return p;
}
/**
 * Map absolute editor offsets to editable text segments. Atomic tokens such
 * as references, separators, images or portals may occupy logical positions
 * in the editor. Their widths MUST come from the RemNote API, never from a
 * hardcoded value or from a search for the selected word.
 *
 * `atomWidths` is keyed by original element index and is populated only by
 * `plugin.richText.length([atom])`. 0 is a valid API-reported width.
 */
function formatAtSelectedRange(original,selected,style,atomWidths = new Map()){
  if(!Array.isArray(original))throw Error('EDITOR: conteúdo do editor não está disponível.');
  const r=exactRange(selected),safe=safeStyle(style);
  const out=[];
  let cursor=0,actual='',covered=0;
  for(let i=0;i<original.length;i++){
    const part=original[i];
    if(!isText(part)){
      if(cursor<r.end){
        const width=atomWidths.get(i);
        if(!Number.isSafeInteger(width)||width<0)
          throw Error('POSIÇÃO: o RemNote não informou o comprimento de um elemento especial antes da seleção. Nada foi alterado.');
        // Never format an atomic object or infer which part it represents.
        if(width>0&&cursor<r.end&&cursor+width>r.start)
          throw Error('SEGURANÇA: a seleção inclui um elemento especial. Selecione apenas texto.');
        cursor+=width;
      }
      out.push(part);
      continue;
    }
    const t=getText(part),from=cursor,to=cursor+t.length;
    const a=Math.max(r.start,from),b=Math.min(r.end,to);
    if(a<b){
      actual+=t.slice(a-from,b-from);covered+=b-a;
      if(a>from)out.push(slice(part,0,a-from));
      out.push(paint(part,a-from,b-from,safe));
      if(b<to)out.push(slice(part,b-from,t.length));
    }else out.push(part);
    cursor=to;
  }
  if(covered!==r.end-r.start||actual!==r.text)
    throw Error('POSIÇÃO: o intervalo do editor não confere com o trecho selecionado. Nenhuma outra ocorrência foi considerada.');
  if(contentFingerprint(original)!==contentFingerprint(out)||protectedFingerprint(original)!==protectedFingerprint(out))
    throw Error('INTEGRIDADE: texto/metadados mudariam; operação cancelada.');
  return {richText:out,changed:JSON.stringify(original)!==JSON.stringify(out),start:r.start,end:r.end};
}

/** Query ONLY atomic elements before or within the selected range. This
 * bypasses normalization of the whole Rem, which can reject modern custom
 * colors unrelated to the edit. The SDK owns the atomic length semantics.
 */
async function widthsFromRemNote(plugin,original,selected){
  const r=exactRange(selected);
  const widths=new Map();
  let cursor=0;
  for(let i=0;i<original.length && cursor<r.end;i++){
    const part=original[i];
    if(isText(part)){
      cursor+=getText(part).length;
      continue;
    }
    if(typeof plugin?.richText?.length!=='function')
      throw Error('POSIÇÃO: a API richText.length não está disponível para medir elementos especiais.');
    let width;
    try{width=await plugin.richText.length([part]);}
    catch(e){
      throw Error('POSIÇÃO: o SDK não conseguiu medir um elemento especial. O texto não foi alterado. '+String(e?.message||e).slice(0,100));
    }
    if(!Number.isSafeInteger(width)||width<0)
      throw Error('POSIÇÃO: o SDK devolveu um comprimento inválido para um elemento especial. Nada foi alterado.');
    widths.set(i,width);
    cursor+=width;
  }
  return widths;
}

const brief=e=>String(e?.message||e).replace(/\s+/g,' ').slice(0,140);
const omit=(o,keys)=>{const c=copy(o);for(const k of keys)delete c[k];return c;};
/** O RemNote pode recusar só a cor (tc/h). Tenta o estilo completo e, se recusado, sem h, sem tc e sem ambos. */
function styleVariants(style){
  const base=copy(style||{}),out=[{style:base,dropped:[]}];
  const h=own(base,'h'),tc=own(base,'tc');
  if(h)out.push({style:omit(base,['h']),dropped:['h']});
  if(tc)out.push({style:omit(base,['tc']),dropped:['tc']});
  if(h&&tc)out.push({style:omit(base,['h','tc']),dropped:['h','tc']});
  return out;
}
const describeStyle=style=>Object.entries(style||{}).map(([k,v])=>k+'='+(v===null?'null':Array.isArray(v)?'array':typeof v)).join(',')||'nenhum';
function failure(errors,style){
  return Error('GRAVAÇÃO: o RemNote recusou o RichText. Nada foi inserido. Estilo copiado: '+describeStyle(style)+'. Tentativas: '+errors.join(' | '));
}
async function writeRemField(plugin,rem,field,richText){
  const setter=field==='text'?'setText':'setBackText';
  if(typeof rem?.[setter]!=='function')throw Error('EDITOR: '+setter+' indisponível.');
  try{await rem[setter](richText);}
  catch(e){throw Error('GRAVAÇÃO: a API recusou o conteúdo RichText do Rem. Nada foi inserido. '+brief(e));}
}
/**
 * Caminho sem foco: usa o remId da própria seleção e o campo (frente/verso) cujo
 * texto confere exatamente com o trecho na posição informada. Se mais de um campo
 * conferir, recusa, a menos que a cópia do editor (hint) identifique apenas um.
 */
async function applyViaRem(plugin,selected,style,hint){
  const phrase=selectionText(selected);
  const rem=await plugin?.rem?.findOne?.(selected.remId);
  if(!rem)throw Error('EDITOR: não foi possível localizar o Rem da seleção.');
  const fields=[['text',rem.text],['backText',rem.backText]].filter(([,v])=>Array.isArray(v));
  const ok=[];let firstError;
  for(const [field,value] of fields){
    try{
      const widths=await widthsFromRemNote(plugin,value,selected);
      const result=formatAtSelectedRange(value,selected,style,widths);
      ok.push({field,value,widths,result});
    }catch(e){firstError=firstError||e;}
  }
  let chosen=ok;
  if(ok.length>1&&Array.isArray(hint)){
    const sameAsHint=ok.filter(o=>JSON.stringify(o.value)===JSON.stringify(hint));
    if(sameAsHint.length===1)chosen=sameAsHint;
  }
  if(!chosen.length)throw firstError||Error('POSIÇÃO: a seleção não confere com o texto do Rem. Nada foi alterado.');
  if(chosen.length>1)throw Error('AMBIGUIDADE: o trecho aparece na mesma posição na frente e no verso. Nada foi alterado.');
  const {field,value,widths,result}=chosen[0];
  if(!result.changed)return {unchanged:true,length:phrase.length};
  const errors=[];
  for(const v of styleVariants(style)){
    const r=formatAtSelectedRange(value,selected,v.style,widths);
    try{await writeRemField(plugin,rem,field,r.richText);return {unchanged:false,length:phrase.length,via:'rem',dropped:v.dropped};}
    catch(e){errors.push('Rem/'+(v.dropped.length?'sem '+v.dropped.join('+'):'completo')+': '+brief(e));}
  }
  throw failure(errors,style);
}
/** Último recurso do editor: substitui SOMENTE a seleção ativa, e só se ela ainda for exatamente a mesma. */
async function replaceActiveSelection(plugin,selected,variant){
  if(typeof plugin?.editor?.insertRichText!=='function'||typeof plugin?.editor?.getSelectedText!=='function')throw Error('indisponível');
  const live=await plugin.editor.getSelectedText();
  const r=exactRange(selected);
  if(!live||live.remId!==selected.remId||live.range?.start!==r.start||live.range?.end!==r.end||
     !Array.isArray(live.richText)||!live.richText.every(isText)||live.richText.map(getText).join('')!==r.text)
    throw Error('a seleção ativa mudou');
  const safe=safeStyle(variant);
  await plugin.editor.insertRichText(live.richText.map(part=>paint(part,0,getText(part).length,safe)));
}
async function applyToActiveSelection(plugin,selected,style,focusedSnapshot,hint){
  const phrase=selectionText(selected);
  let original=Array.isArray(focusedSnapshot)?focusedSnapshot:undefined;
  if(!original){try{original=await plugin.editor.getFocusedEditorText();}catch(_){}}
  if(!Array.isArray(original)){
    // O editor perdeu o foco (clique na barra flutuante): grava pelo Rem da seleção.
    return applyViaRem(plugin,selected,style,hint);
  }
  const widths=await widthsFromRemNote(plugin,original,selected);
  const variants=styleVariants(style);
  let first;
  try{first=formatAtSelectedRange(original,selected,variants[0].style,widths);}
  catch(e){
    // O editor focado pode ser outro: tenta o Rem da seleção antes de desistir.
    if(plugin?.rem?.findOne){try{return await applyViaRem(plugin,selected,style,hint||original);}catch(_){}}
    throw e;
  }
  if(!first.changed)return {unchanged:true,length:phrase.length};
  // Only the focused editor, never the entire Rem/front/back. No insertion.
  if(typeof plugin?.editor?.setText!=='function')throw Error('EDITOR: setText indisponível.');
  const errors=[];
  for(const v of variants){
    const r=v===variants[0]?first:formatAtSelectedRange(original,selected,v.style,widths);
    try{await plugin.editor.setText(r.richText);return {unchanged:false,length:phrase.length,dropped:v.dropped};}
    catch(e){errors.push('Editor/'+(v.dropped.length?'sem '+v.dropped.join('+'):'completo')+': '+brief(e));}
  }
  for(const v of variants){
    try{await replaceActiveSelection(plugin,selected,v.style);return {unchanged:false,length:phrase.length,via:'selecao',dropped:v.dropped};}
    catch(e){errors.push('Seleção/'+(v.dropped.length?'sem '+v.dropped.join('+'):'completo')+': '+brief(e));if(/mudou|indispon/.test(String(e?.message)))break;}
  }
  if(plugin?.rem?.findOne){
    try{return await applyViaRem(plugin,selected,style,hint||original);}
    catch(e){errors.push('Rem: '+brief(e));}
  }
  throw failure(errors,style);
}
module.exports={selectionText,exactRange,formatAtSelectedRange,widthsFromRemNote,applyToActiveSelection,applyViaRem};
