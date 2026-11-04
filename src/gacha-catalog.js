import { readFileSync } from 'node:fs';
import { RANK, RARITIES, normalizeCatalog } from './gacha-rarities.js';
export { RANK, RARITIES } from './gacha-rarities.js';
export const CATALOG = normalizeCatalog(JSON.parse(readFileSync(new URL('./assets/gacha/catalog.json', import.meta.url), 'utf8')));
export const CARDS = new Map(CATALOG.cards.map(c => [c.id, Object.freeze(c)]));
export const SERIES = new Map(CATALOG.series.map(s => [s.id, Object.freeze(s)]));
export const SETTINGS = Object.freeze({ freeMs: 10 * 60000, freeCap: 10, packCost: 150, packSize: 5, dailyCoins: 100, epicPity: 20, legendaryPity: 100, mythicPity: 400, marketTax: .05, marketDuration: 7 * 86400000, tradeDuration: 24 * 3600000 });
export const SERIES_CARDS = new Map([...SERIES.keys()].map(id => [id, CATALOG.cards.filter(c => c.seriesId === id)]));
export function validTheme(cards) { return cards?.length >= 6 && [RANK.COMMON, RANK.EPIC, RANK.LEGENDARY, RANK.MYTHIC].every(rank => cards.some(c => c.rarity === rank)); }
export const THEMES = [...SERIES.values()].filter(s => validTheme(SERIES_CARDS.get(s.id)));
export function dailyTheme(now = Date.now()) { return THEMES[Math.floor(now / 86400000) % THEMES.length]; }
export function poolFor(pack, now) {
  if (pack === 'mix') return CATALOG.cards;
  if (pack === 'daily') return SERIES_CARDS.get(dailyTheme(now).id);
  if (/^s_al\d+$/.test(pack)) {
    const cards = SERIES_CARDS.get(pack.slice(2));
    if (validTheme(cards)) return cards;
  }
  throw new Error('Booster inconnu.');
}
export function packName(pack, now) { return pack === 'mix' ? 'Mix multivers' : pack === 'daily' ? dailyTheme(now).name : SERIES.get(pack.slice(2))?.name ?? 'Booster inconnu'; }
export function normalizedRates(pool) {
  const present = new Set(pool.map(c => c.rarity));
  if (!present.has(RANK.COMMON)) throw new Error('Ce booster ne contient pas de cartes communes.');
  const rates = RARITIES.map((r, i) => present.has(i) ? r.rate : 0);
  // Missing ranks go to commons, never to the ultra-rare tiers.
  rates[RANK.COMMON] += RARITIES.reduce((n, r, i) => n + (present.has(i) ? 0 : r.rate), 0);
  return rates;
}
export function cardId(value) {
  const id = String(value ?? '').trim().toLowerCase().replace(/^#/, '');
  return CARDS.has(id) ? id : CARDS.has(`al${id}`) ? `al${id}` : null;
}
