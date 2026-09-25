/**
 * The search query that reads a deck. Quoting makes the name literal and
 * still spans the deck's subdecks, so a parent deck that only holds subdecks
 * reads as the sum of its descendants; excluding them needs an explicit
 * `-deck:"Name"::*`.
 */
export function deckSearchQuery(deckName: string): string {
  return `deck:"${escapeQuoted(deckName)}"`;
}

function escapeQuoted(deckName: string): string {
  return deckName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
