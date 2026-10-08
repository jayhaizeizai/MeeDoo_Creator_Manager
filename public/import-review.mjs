export function recommendedImportChoice(row){if(!row.name||row.issues.length)return 'skip';if(row.matches.length===1)return row.matches[0].id;return row.matches.length?'skip':'create';}
export function importSelectionCounts(rows,choice){const counts={create:0,link:0,skip:0};for(const r of rows){const c=choice(r);counts[c==='create'?'create':c==='skip'?'skip':'link']++;}return counts;}
