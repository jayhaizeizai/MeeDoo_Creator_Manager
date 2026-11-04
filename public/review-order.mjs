// Review timestamps come from the signed-in user's scores, not browsing history.
export function previousRatedIndex(items, currentIndex) {
  const rated = items.map((item, index) => ({item, index}))
    .filter(({item}) => item.score != null && Number.isFinite(Date.parse(item.updated_at)))
    .sort((a, b) => Date.parse(a.item.updated_at) - Date.parse(b.item.updated_at) || String(a.item.key).localeCompare(String(b.item.key)));
  const position = rated.findIndex(({index}) => index === currentIndex);
  return (position < 0 ? rated.at(-1) : rated[position - 1])?.index ?? -1;
}
