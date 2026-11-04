// A supplier name must be unique, also against suppliers that stopped working with the shop (R3 MSG116).
// Two names are the same when they match after this key: spaces trimmed and collapsed, letters in one case,
// and the tone mark in oa, oe and uy written in one place (hoà = hòa, hoè = hòe, thuỷ = thủy).
// Letters and diacritics otherwise still count, so "Mai" and "Mãi" are different names.
const TONE_MARKS = '\\u0300\\u0301\\u0303\\u0309\\u0323';
// o or u carrying a tone mark straight after the plain letter, followed by the plain a, e or y that completes oa, oe, uy.
const TONE_ON_FIRST = new RegExp(`([ou])([${TONE_MARKS}])([aey])(?![\\u0302\\u0306\\u031b])`, 'gu');

export function supplierNameKey(name) {
  const lower = String(name).normalize('NFC').replace(/\s+/gu, ' ').trim().toLowerCase();
  // The tone moves onto the second letter, the way "hoà" and "thuỷ" are written.
  return lower.normalize('NFD').replace(TONE_ON_FIRST, '$1$3$2').normalize('NFC');
}
