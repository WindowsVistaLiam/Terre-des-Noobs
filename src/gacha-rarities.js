export const ODDS_VERSION = 2;
export const RANK = Object.freeze({ COMMON: 0, UNCOMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4, MYTHIC: 5 });
export const RARITIES = Object.freeze([
  { name: 'Commune', short: 'C', color: '#9ca5bd', rate: 51, recycle: 2 },
  { name: 'Peu commune', short: 'U', color: '#47d6a1', rate: 28, recycle: 5 },
  { name: 'Rare', short: 'R', color: '#62aaff', rate: 15, recycle: 12 },
  { name: 'Épique', short: 'E', color: '#b68cff', rate: 5, recycle: 35 },
  { name: 'Légendaire', short: 'L', color: '#ffd260', rate: .9, recycle: 120 },
  { name: 'Mythique', short: 'M', color: '#ff7997', rate: .1, recycle: 500 },
]);
// Old catalogs used the opposite numeric order for M and L. Preserve each
// character's displayed rarity, identifier and artwork while correcting rank.
export function normalizeCatalog(catalog) {
  if (catalog.rarityVersion === ODDS_VERSION) return catalog;
  if (catalog.rarityVersion != null && catalog.rarityVersion !== 1) throw new Error('Version des raretés inconnue.');
  return { ...catalog, rarityVersion: ODDS_VERSION, cards: catalog.cards.map(c => {
    const rarity = c.rarity === 4 ? RANK.MYTHIC : c.rarity === 5 ? RANK.LEGENDARY : c.rarity;
    const delta = rarity - c.rarity;
    return { ...c, rarity, power: c.power + delta * 14, aura: c.aura + delta * 12 };
  }) };
}
