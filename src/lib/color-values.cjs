"use strict";
// The 0.0.46 SDK predates the current RemNote custom color picker.
// Always recognize the persisted text-color key `tc` even when it is not
// exported by the older RICH_TEXT_FORMATTING enum.
const CANONICAL_COLOR_KEYS = Object.freeze(['tc','h']);
const ALIASES = Object.freeze({
  tc:['textColor','text_color','customTextColor','fontColor','foregroundColor','fgColor','color','fc'],
  h:['highlightColor','highlight_color','customHighlightColor','backgroundColor','background_color','bgColor']
});
function hex2(n){return Math.round(n).toString(16).padStart(2,'0')}
/** Only convert color forms with unambiguous CSS semantics. Never guess a palette index. */
function normalizeColor(value){
  if(typeof value==='string'){
    const v=value.trim();
    if(!v || v.length>120) return null;
    // Built-in RemNote names and CSS color functions/hex are passed through.
    if(/^#[\da-f]{3,4}$|^#[\da-f]{6}$|^#[\da-f]{8}$/i.test(v)) return v;
    if(/^(?:rgb|rgba|hsl|hsla)\(\s*[\d.%+\-\s,\/]+\)$/i.test(v)) return v;
    if(/^[a-zA-Z][a-zA-Z -]{0,32}$/.test(v)) return v;
    return null;
  }
  // Accept RGB integer values only when they look like actual RGB colors.
  // Small integers may be palette indices and must not be interpreted as RGB.
  if(typeof value==='number' && Number.isInteger(value) && value>=256 && value<=0xFFFFFF)
    return `#${value.toString(16).padStart(6,'0')}`;
  if(value && typeof value==='object' && !Array.isArray(value)){
    if(typeof value.hex==='string') return normalizeColor(value.hex);
    if(typeof value.value==='string') return normalizeColor(value.value);
    const {r,g,b,a}=value;
    if([r,g,b].every(x=>typeof x==='number'&&Number.isInteger(x)&&x>=0&&x<=255)){
      if(a===undefined) return '#'+hex2(r)+hex2(g)+hex2(b);
      if(typeof a==='number' && a>=0 && a<=1) return `rgba(${r}, ${g}, ${b}, ${a})`;
    }
  }
  return null;
}
/** Keep canonical color values exactly as returned by the RemNote editor.
 * Newer builds may encode custom colors as structures not understood by the
 * 2024 SDK. Converting such data to a guessed CSS color destroys information.
 */
function preserveColor(value){
  const seen=new WeakSet();
  function check(x,depth){
    if(depth>5)throw Error('profundidade excessiva');
    if(x===null)throw Error('valor nulo');
    if(typeof x==='string'){if(!x.trim()||x.length>256)throw Error('texto invalido');return;}
    if(typeof x==='number'){if(!Number.isFinite(x))throw Error('numero invalido');return;}
    if(typeof x!=='object')throw Error('tipo invalido');
    if(seen.has(x))throw Error('valor circular');
    seen.add(x);
    if(Array.isArray(x)){
      if(x.length>16)throw Error('lista extensa');
      for(const v of x)check(v,depth+1);
    } else {
      const keys=Object.keys(x);
      if(keys.length>20)throw Error('objeto extenso');
      if(keys.some(k=>['__proto__','prototype','constructor'].includes(k)))throw Error('chave restrita');
      for(const k of keys)check(x[k],depth+1);
    }
    seen.delete(x);
  }
  check(value,0);
  const raw=JSON.stringify(value);
  if(typeof raw!=='string'||raw.length>2048)throw Error('valor extenso');
  return JSON.parse(raw);
}
function extractColorStyle(part){
  if(!part || typeof part!=='object' || Array.isArray(part)) return {style:{},unsupported:[]};
  const style={},unsupported=[];
  for(const key of CANONICAL_COLOR_KEYS){
    const candidates=[key,...ALIASES[key]];
    for(const sourceKey of candidates){
      if(!Object.prototype.hasOwnProperty.call(part,sourceKey))continue;
      try {
        // Canonical `tc`/`h` values are copied without conversion.
        // An older alias gets normalized only if its semantics are clear.
        const original=part[sourceKey];
        const color=sourceKey===key ? preserveColor(original) : normalizeColor(original);
        if(color!==null){style[key]=color;break;}
      } catch (_) { /* explain unsupported shape without disclosing source text */ }
      unsupported.push({key:sourceKey,type:Array.isArray(part[sourceKey])?'array':typeof part[sourceKey]});
    }
  }
  return {style,unsupported};
}
function colorShape(parts){
  const keys=[...CANONICAL_COLOR_KEYS,...ALIASES.tc,...ALIASES.h];
  return (parts||[]).filter(p=>p&&typeof p==='object'&&typeof p.text==='string').map(p=>
    keys.filter(k=>Object.prototype.hasOwnProperty.call(p,k))
      .map(k=>`${k}:${Array.isArray(p[k])?'array':typeof p[k]}`)
  ).flat().filter((x,i,a)=>a.indexOf(x)===i);
}
module.exports={CANONICAL_COLOR_KEYS,ALIASES,normalizeColor,preserveColor,extractColorStyle,colorShape};
