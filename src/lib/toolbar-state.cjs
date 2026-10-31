'use strict';
const DEFAULT = Object.freeze({bottom:84,right:22});
function cleanPosition(input) {
  const v = input || DEFAULT;
  const bound = n => Number.isFinite(n) ? Math.min(4000,Math.max(0,Math.round(n))) : undefined;
  return {bottom:bound(v.bottom) ?? DEFAULT.bottom,right:bound(v.right) ?? DEFAULT.right};
}
function movedPosition(base, dx, dy) {
  const pos=cleanPosition(base);
  return cleanPosition({bottom:pos.bottom - dy, right:pos.right - dx});
}
function cleanState(value) {
  return {position:cleanPosition(value?.position),compact:value?.compact===true,hidden:value?.hidden===true};
}
module.exports={DEFAULT,cleanPosition,movedPosition,cleanState};
