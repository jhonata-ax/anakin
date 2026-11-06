'use strict';
/**
 * Selection-first painter. NEVER searches for a word in the rest of a Rem.
 * The editor's own active selection range is the sole authority for the target.
 * A selection without a trustworthy range cannot be edited safely through the
 * public API; in that case fail closed (do not guess / duplicate text).
 */
const {safeStyle, contentFingerprint, protectedFingerprint} = require('./replace-selection-v16.cjs');
const STYLE_KEYS=['b','l','u','h','tc'];
// Metadados de leitura do RemNote que acompanham realce/cor personalizados; viajam junto com o estilo.
const EXTRA_KEYS=['elementId','decorations'];
const STRUCTURAL = new Set(['cId','hiddenCloze','revealedCloze','qId','url','title','workInProgressPortal','workInProgressRem','workInProgressTag']);
const isText=x=>typeof x==='string'||Boolean(x && !Array.isArray(x) && x.i==='m' && typeof x.text==='string');
const getText=x=>typeof x==='string'?x:x.text;
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const copy=x=>JSON.parse(JSON.stringify(x));
// safeStyle ignora chaves desconhecidas; o elementId do realce personalizado viaja junto com o `h`.
const withId=(safe,orig)=>{
  if(orig&&typeof orig.elementId==='string'&&own(safe,'h'))safe.elementId=orig.elementId;
  if(orig&&own(orig,'decorations'))safe.decorations=copy(orig.decorations);
  return safe;
};
// O elementId é identificador do realce, não conteúdo: não entra na conferência de integridade.
const noIds=parts=>parts.map(p=>{if(p&&typeof p==='object'&&!Array.isArray(p)&&EXTRA_KEYS.some(k=>k in p)){const q={...p};for(const k of EXTRA_KEYS)delete q[k];return q;}return p;});
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
  for(const key of EXTRA_KEYS)delete p[key]; // pertencem ao realce/cor do trecho; só voltam se o estilo copiado os trouxer
  for(const key of STYLE_KEYS)if(own(style,key))p[key]=copy(style[key]);
  if(typeof style.elementId==='string'&&own(style,'h'))p.elementId=style.elementId;
  if(own(style,'decorations'))p.decorations=copy(style.decorations);
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
  const r=exactRange(selected),safe=withId(safeStyle(style),style);
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
  if(contentFingerprint(original)!==contentFingerprint(out)||protectedFingerprint(noIds(original))!==protectedFingerprint(noIds(out)))
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


// Realces predefinidos do RemNote (os seis do seletor): nome e índice do enum RemColor.
const HIGHLIGHT_PRESETS=Object.freeze({Red:1,Orange:2,Yellow:3,Green:4,Purple:5,Blue:6});
/** Predefinido de realce mais próximo pelo matiz (HSL). Cores quase cinzas não têm equivalente: devolve undefined. */
function nearestHighlight(rgb){
  const [r,g,b]=rgb.map(x=>x/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,l=(max+min)/2;
  const sat=d===0?0:d/(1-Math.abs(2*l-1));
  if(d===0||sat<0.15||l<0.08||l>0.95)return undefined;
  let hue=max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4;
  hue=(hue*60+360)%360;
  const name=hue<15||hue>=345?'Red':hue<45?'Orange':hue<75?'Yellow':hue<165?'Green':hue<255?'Blue':'Purple';
  return {name,idx:HIGHLIGHT_PRESETS[name]};
}
function rgbOf(v,depth=0){
  if(depth>2||v==null)return undefined;
  if(typeof v==='number'&&Number.isInteger(v)&&v>=256&&v<=0xFFFFFF)return [(v>>16)&255,(v>>8)&255,v&255];
  if(typeof v==='string'){
    let m=v.match(/#([0-9a-f]{8}|[0-9a-f]{6})(?![0-9a-f])/i);
    if(m){const x=m[1];return [parseInt(x.slice(0,2),16),parseInt(x.slice(2,4),16),parseInt(x.slice(4,6),16)];}
    m=v.match(/#([0-9a-f]{3})(?![0-9a-f])/i);
    if(m){const x=m[1];return [parseInt(x[0]+x[0],16),parseInt(x[1]+x[1],16),parseInt(x[2]+x[2],16)];}
    m=v.match(/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i);
    if(m)return [+m[1],+m[2],+m[3]].map(n=>Math.min(255,n));
    return undefined;
  }
  if(typeof v==='object'&&!Array.isArray(v)){
    if(['r','g','b'].every(k=>Number.isInteger(v[k])))return [v.r,v.g,v.b];
    return rgbOf(v.hex,depth+1)||rgbOf(v.value,depth+1)||rgbOf(v.color,depth+1);
  }
  return undefined;
}
/** Formas alternativas do realce: hexadecimal normalizado e, por último, o predefinido mais próximo (visível, mas aproximado). */
function highlightAlternatives(h){
  const rgb=rgbOf(h),out=[];
  if(!rgb)return out;
  const hex='#'+rgb.map(n=>n.toString(16).padStart(2,'0')).join('');
  if(hex!==h)out.push({value:hex,label:'hexadecimal '+hex,approx:false});
  const near=nearestHighlight(rgb);
  if(near){
    out.push({value:near.name,label:'cor predefinida mais próxima ('+near.name+')',approx:true});
    out.push({value:near.idx,label:'cor predefinida mais próxima ('+near.name+')',approx:true});
  }
  return out;
}
const brief=e=>String(e?.message||e).replace(/\s+/g,' ').slice(0,140);
const omit=(o,keys)=>{const c=copy(o);for(const k of keys)delete c[k];return c;};
/** O RemNote pode recusar só a cor (tc/h). Tenta o estilo completo e, se recusado, sem h, sem tc e sem ambos. */
function styleVariants(style){
  const base=copy(style||{}),out=[{style:base,dropped:[]}];
  const dec=own(base,'decorations'),id=own(base,'elementId'),h=own(base,'h'),tc=own(base,'tc');
  if(dec||id){
    const keep=omit(base,EXTRA_KEYS);
    out.push({style:keep,dropped:dec&&id?['decorations','elementId']:dec?['decorations']:['elementId']});
  }
  if(h)out.push({style:omit(base,['h',...EXTRA_KEYS]),dropped:['h']});
  if(tc)out.push({style:omit(base,['tc',...(h?[]:EXTRA_KEYS)]),dropped:['tc']});
  if(h&&tc)out.push({style:omit(base,['h','tc',...EXTRA_KEYS]),dropped:['h','tc']});
  return out;
}
const shortVal=v=>{try{return JSON.stringify(v).slice(0,48);}catch(_){return '?';}};
const describeStyle=style=>Object.entries(style||{}).map(([k,v])=>k+'='+(v===null?'null':Array.isArray(v)?'array':typeof v)+((k==='h'||k==='tc'||k==='elementId'||k==='decorations')?'('+shortVal(v)+')':'')).join(',')||'nenhum';
const label=v=>v.dropped.length?'sem '+v.dropped.join('+'):'completo';
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
const sameVal=(a,b)=>typeof a==='string'&&typeof b==='string'?a.toLowerCase()===b.toLowerCase():JSON.stringify(a)===JSON.stringify(b);
const maskId=v=>typeof v==='string'?v.replace(/[a-z]/g,'a').replace(/[A-Z]/g,'A').replace(/[0-9]/g,'9').slice(0,48):typeof v;
/** Novo elementId no mesmo formato do copiado (mesmos tipos de caractere), para não duplicar o id do realce de origem. */
function freshElementId(sample){
  const L='abcdefghijklmnopqrstuvwxyz',U=L.toUpperCase(),D='0123456789',pick=a=>a[Math.floor(Math.random()*a.length)];
  return [...String(sample)].map(ch=>/[a-z]/.test(ch)?pick(L):/[A-Z]/.test(ch)?pick(U):/[0-9]/.test(ch)?pick(D):ch).join('');
}
const withFreshId=style=>style&&typeof style.elementId==='string'?{...style,elementId:freshElementId(style.elementId)}:style;
/** Lê o texto de volta e resume o que o RemNote realmente guardou no trecho (valor de h e formato do elementId). */
async function readBack(plugin,selected){
  try{
    await sleep(150);
    const after=await plugin.editor.getFocusedEditorText();
    if(!Array.isArray(after))return undefined;
    const widths=await widthsFromRemNote(plugin,after,selected);
    const r=exactRange(selected);
    let cursor=0,seen=0;const parts=[];
    for(let i=0;i<after.length;i++){
      const part=after[i];
      if(!isText(part)){cursor+=widths.get(i)||0;continue;}
      const t=getText(part),from=cursor,to=cursor+t.length;cursor=to;
      const a=Math.max(r.start,from),b=Math.min(r.end,to);
      if(a>=b)continue;
      seen+=b-a;
      const o=typeof part==='string'?{}:part;
      parts.push({h:o.h,elementId:o.elementId,decorations:o.decorations});
    }
    return seen===r.end-r.start?parts:undefined;
  }catch(_){return undefined;}
}
/** true se o realce ficou igual ao pedido; false se o RemNote o alterou/ignorou; undefined se não deu para ler. */
async function verifyApplied(plugin,selected,style){
  if(!own(style,'h'))return {ok:true};
  const parts=await readBack(plugin,selected);
  if(!parts)return {ok:undefined};
  const ok=parts.every(p=>sameVal(p.h,style.h));
  const summary='gravado h='+shortVal(parts[0]?.h)+', elementId='+(parts[0]?.elementId===undefined?'ausente':maskId(parts[0].elementId))+(typeof style.elementId==='string'?' (enviado '+maskId(style.elementId)+')':'')+(own(style,'decorations')?', decorations enviado':'')+(parts[0]?.decorations!==undefined?', decorations=gravado':'');
  return {ok,summary};
}
const plainOf=rich=>(Array.isArray(rich)?rich:[]).map(x=>typeof x==='string'?x:(x&&typeof x.text==='string'?x.text:'\u0000')).join('');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
/**
 * Para cores que o setText recusa (ex.: realce personalizado): apaga SOMENTE a seleção ativa e insere
 * o mesmo texto já formatado. insertRichText não substitui a seleção sozinho, por isso apagar antes
 * evita a duplicação. Depois confere o texto do editor; se não for idêntico ao original, desfaz.
 */
async function replaceActiveSelection(plugin,selected,variant,original){
  const ed=plugin?.editor;
  if(typeof ed?.delete!=='function'||typeof ed?.insertRichText!=='function'||typeof ed?.getSelectedText!=='function'||typeof ed?.getFocusedEditorText!=='function')
    throw Error('indisponível');
  const live=await ed.getSelectedText();
  const r=exactRange(selected);
  if(!live||(live.type&&live.type!=='Text')||live.remId!==selected.remId||live.range?.start!==r.start||live.range?.end!==r.end||
     !Array.isArray(live.richText)||!live.richText.every(isText)||live.richText.map(getText).join('')!==r.text)
    throw Error('a seleção ativa mudou');
  const before=plainOf(original);
  const hasH=own(variant,'h'),noExtras=omit(variant,EXTRA_KEYS);
  const forms=[{style:variant,label:'original',approx:false,kind:'plain'}];
  if(own(variant,'decorations')&&(own(variant,'elementId')))forms.push({style:omit(variant,['decorations']),label:'sem decorations',approx:false,kind:'plain'});
  if(own(variant,'decorations')||own(variant,'elementId'))forms.push({style:noExtras,label:'sem metadados',approx:false,kind:'plain'});
  if(hasH&&typeof plugin?.richText?.toMarkdown==='function'&&typeof plugin?.richText?.parseFromMarkdown==='function')
    forms.push({style:noExtras,label:'via markdown',approx:false,kind:'markdown'});
  if(hasH)for(const alt of highlightAlternatives(variant.h))forms.push({style:{...noExtras,h:alt.value},label:alt.label,approx:alt.approx,kind:'plain'});
  const restore=async()=>{
    for(let i=0;i<3&&typeof ed.undo==='function';i++){
      try{await ed.undo();}catch(_){break;}
      await sleep(80);
      try{if(plainOf(await ed.getFocusedEditorText())===before)return true;}catch(_){}
    }
    return false;
  };
  const errs=[];let used;
  try{
    await ed.delete();
    for(const f of forms){
      const safe=withId(safeStyle(f.style),f.style);
      let parts=live.richText.map(part=>paint(part,0,getText(part).length,safe));
      if(f.kind==='markdown'){
        try{
          const md=await plugin.richText.toMarkdown(parts);
          const parsed=await plugin.richText.parseFromMarkdown(md);
          if(!Array.isArray(parsed)||!parsed.some(x=>x&&typeof x==='object'&&own(x,'h')))throw Error('o markdown não preserva o realce');
          if(plainOf(parsed)!==r.text)throw Error('o markdown alterou o texto');
          parts=parsed;
        }catch(e){errs.push(f.label+': '+brief(e));continue;}
      }
      // A validação recusa antes de alterar qualquer coisa; só o primeiro formato aceito é inserido.
      try{await ed.insertRichText(parts);used=f;break;}
      catch(e){errs.push(f.label+': '+brief(e));}
    }
  }catch(e){
    const back=await restore();
    throw Error('substituição falhou'+(back?' (desfeita)':' (confira o texto)')+': '+brief(e));
  }
  if(!used){
    const back=await restore();
    throw Error('o RemNote recusou todas as formas do realce'+(back?' (desfeito)':' (confira o texto)')+' ['+errs.join(' ; ')+']');
  }
  await sleep(120);
  let after;try{after=await ed.getFocusedEditorText();}catch(_){}
  {const vr=await verifyApplied(plugin,selected,used.style);used.verified=vr.ok;used.readback=vr.summary;}
  if(Array.isArray(after)&&plainOf(after)!==before){
    const back=await restore();
    throw Error('VERIFICAÇÃO: o texto mudou após a substituição'+(back?' (desfeita)':' (confira o texto)'));
  }
  return used;
}
async function applyToActiveSelection(plugin,selected,style0,focusedSnapshot,hint){
  const style=withFreshId(style0);
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
  let lastWrite;
  const attempt=async v=>{
    const r=v===variants[0]?first:formatAtSelectedRange(original,selected,v.style,widths);
    try{await plugin.editor.setText(r.richText);}
    catch(e){errors.push('Editor/'+label(v)+': '+brief(e));return undefined;}
    const vr=await verifyApplied(plugin,selected,v.style),verified=vr.ok;
    const res={unchanged:false,length:phrase.length,dropped:v.dropped,reasons:errors.slice(),verified,readback:vr.summary};
    if(verified===false){errors.push('Editor/'+label(v)+': aceito, mas o realce não ficou gravado');lastWrite=res;return undefined;}
    return res;
  };
  let done=await attempt(variants[0]);
  if(done)return done;
  // Antes de descartar cor/realce, tenta preservá-los substituindo só a seleção (com verificação).
  try{
    const used=await replaceActiveSelection(plugin,selected,variants[0].style,original);
    const res={unchanged:false,length:phrase.length,via:'selecao',dropped:[],approx:used.approx?used.label:undefined,form:used.label,verified:used.verified,readback:used.readback,reasons:errors.slice()};
    if(used.verified!==false)return res;
    errors.push('Seleção/'+used.label+': aceito, mas o realce não ficou gravado');lastWrite=res;
  }
  catch(e){errors.push('Seleção: '+String(e?.message||e).replace(/\s+/g,' ').slice(0,520));}
  for(const v of variants.slice(1)){done=await attempt(v);if(done)return done;}
  if(lastWrite){lastWrite.reasons=errors.slice();return lastWrite;}
  if(plugin?.rem?.findOne){
    try{return await applyViaRem(plugin,selected,style,hint||original);}
    catch(e){errors.push('Rem: '+brief(e));}
  }
  throw failure(errors,style);
}
module.exports={selectionText,exactRange,formatAtSelectedRange,widthsFromRemNote,applyToActiveSelection,applyViaRem};
