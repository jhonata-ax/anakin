'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {choose,findVerifiedOffsets,replaceSelectionFormatting}=require('../src/lib/replace-selection-v16.cjs');
const sel=(text,start,end)=>({remId:'rem-1',richText:[text], ...(start===undefined?{}:{range:{start,end}})});
const item=(text,extra={})=>({i:'m',text,...extra});
const badSDK={richText:{async substring(){throw Error('SDK cannot parse custom colors')},async length(){throw Error('SDK cannot parse modern attrs')}}};
const src=(text,backText=[])=>[{key:'text',value:text},{key:'backText',value:backText}];
function store(front,back){
 const state={text:structuredClone(front),backText:structuredClone(back)};
 const written=[];
 const plugin={...badSDK,rem:{async findOne(){return {
   text:structuredClone(state.text),backText:structuredClone(state.backText),
   async setText(value){state.text=structuredClone(value);written.push('text')},
   async setBackText(value){state.backText=structuredClone(value);written.push('backText')},
 }}},richText:{...badSDK.richText,async normalize(parts){return structuredClone(parts)}}};
 return {plugin,state,written};
}
test('second repeated word is resolved by selection start even if SDK rejects custom colors',async()=>{
 const candidates=await findVerifiedOffsets(badSDK,{key:'text',value:['lei lei lei']},sel('lei',4,7),'lei');
 assert.equal(candidates.length,1);assert.equal(candidates[0].from,4);
});
test('third repeated word selected by exact editor range',async()=>{
 const entry=await choose(badSDK,src(['lei lei lei']),sel('lei',8,11),'lei');
 assert.equal(entry.match.from,8);
});
test('repeated words across formatted segments with custom colors',async()=>{
 const parts=[item('lei ',{tc:'#ab34cd'}),item('lei',{tc:'rgba(4, 7, 9, 0.5)'}),' lei'];
 const entry=await choose(badSDK,src(parts),sel('lei',4,7),'lei');
 assert.equal(entry.match.from,4);
});
test('only selected repeated occurrence receives color and bold; words untouched',async()=>{
 const state=store(['lei lei lei'],[]);
 const result=await replaceSelectionFormatting(state.plugin,sel('lei',4,7),{b:true,tc:'#f055aa'});
 assert.equal(result.side,'text'); assert.deepEqual(state.written,['text']);
 assert.deepEqual(state.state.text,['lei ',item('lei',{b:true,tc:'#f055aa'}),' lei']);
});
test('selected second occurrence in backText; first in front unchanged',async()=>{
 const state=store(['lei logo'],['lei e outra lei']);
 const result=await replaceSelectionFormatting(state.plugin,sel('lei',12,15),{b:true});
 assert.equal(result.side,'backText');assert.deepEqual(state.state.text,['lei logo']);
 assert.deepEqual(state.state.backText,['lei e outra ',item('lei',{b:true})]);
});
test('selected first occurrence when another appears later after special node',async()=>{
 const candidate=await choose(badSDK,src(['lei',{i:'x',id:'x1'},'lei']),sel('lei',0,3),'lei');
 assert.equal(candidate.match.pieces[0].index,0);
});
test('atomic node before selected occurrence requires SDK verification; no invented offset',async()=>{
 await assert.rejects(choose(badSDK,src([{i:'x',id:'ref'},'lei lei']),sel('lei',5,8),'lei'),/AMBIGUIDADE/);
});
test('duplicate occurrences without position remain blocked',async()=>{
 await assert.rejects(choose(badSDK,src(['lei lei']),sel('lei'),'lei'),/AMBIGUIDADE/);
});
test('same range in front and back is not guessed when focus cannot distinguish',async()=>{
 await assert.rejects(choose(badSDK,src(['lei logo'],['lei depois']),sel('lei',0,3),'lei'),e=>e.code==='SIDE_AMBIGUITY');
});
test('focus matches one side; same selected range across sides resolves to that side',async()=>{
 const entry=await choose(badSDK,src(['lei logo'],['lei depois']),sel('lei',0,3),'lei',['lei depois']);
 assert.equal(entry.source.key,'backText');
});
test('range length mismatching selected characters is never trusted',async()=>{
 await assert.rejects(choose(badSDK,src(['lei lei']),sel('lei',0,4),'lei'),/AMBIGUIDADE/);
});
