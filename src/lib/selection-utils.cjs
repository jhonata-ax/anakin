'use strict';
/** Accept a genuine selection even if this RemNote editor does not expose a range.
 * If it does supply a range, require a non-collapsed, sane interval.
 * Ambiguous destinations without ranges are rejected later by the matcher.
 */
function isUsableTextSelection(value) {
  if(!value || !value.remId || !Array.isArray(value.richText) ||
    !value.richText.length || value.richText.every(part=>part === '')) return false;
  if(value.range == null) return true;
  return Number.isSafeInteger(value.range.start) && Number.isSafeInteger(value.range.end) &&
    value.range.start >= 0 && value.range.end > value.range.start;
}
function firstUsableTextSelection(primary,secondary) {
  if(isUsableTextSelection(primary)) return primary;
  if(isUsableTextSelection(secondary)) return secondary;
  return undefined;
}
module.exports={isUsableTextSelection,firstUsableTextSelection};
