// Repair only known UTF-8 punctuation misdecoded as Windows-1252.
// Keep the original stored message and all non-text attributes unchanged.
const punctuation=['‘','’','“','”','–','—','…','•'];
const pairs=punctuation.map(value=>[new TextDecoder('windows-1252').decode(new TextEncoder().encode(value)),value]);
export function displayMailText(value=''){
 for(const [broken,fixed] of pairs)value=value.replaceAll(broken,fixed);
 return value;
}
