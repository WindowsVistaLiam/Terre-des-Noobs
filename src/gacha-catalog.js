import { readFileSync } from 'node:fs';
export const CATALOG = JSON.parse(readFileSync(new URL('./assets/gacha/catalog.json', import.meta.url), 'utf8'));
export const CARDS = new Map(CATALOG.cards.map(c => [c.id, Object.freeze(c)]));
export const SERIES = new Map(CATALOG.series.map(s => [s.id, Object.freeze(s)]));
export const RARITIES = Object.freeze([
  { name: 'Commune', short: 'C', color: '#9ca5bd', rate: 50, recycle: 2 },
  { name: 'Peu commune', short: 'U', color: '#47d6a1', rate: 28, recycle: 5 },
  { name: 'Rare', short: 'R', color: '#62aaff', rate: 15, recycle: 12 },
  { name: 'Épique', short: 'E', color: '#b68cff', rate: 5, recycle: 35 },
  { name: 'Mythique', short: 'M', color: '#ff7997', rate: 1.7, recycle: 120 },
  { name: 'Légendaire', short: 'L', color: '#ffd260', rate: .3, recycle: 500 },
]);
export const SETTINGS = Object.freeze({ freeMs: 10 * 60000, freeCap: 10, packCost: 150, packSize: 5, dailyCoins: 100, epicPity: 20, mythicPity: 100, marketTax: .05, marketDuration: 7 * 86400000, tradeDuration: 24 * 3600000 });
export const SERIES_CARDS = new Map([...SERIES.keys()].map(id => [id, CATALOG.cards.filter(c => c.seriesId === id)]));
export const THEMES = [...SERIES.values()].filter(s => (SERIES_CARDS.get(s.id)?.length ?? 0) >= 6);
export function dailyTheme(now = Date.now()) { return THEMES[Math.floor(now / 86400000) % THEMES.length]; }
export function poolFor(pack, now) {
  if (pack === 'mix') return CATALOG.cards;
  if (pack === 'daily') return SERIES_CARDS.get(dailyTheme(now).id);
  if (/^s_al\d+$/.test(pack)) {
    const cards = SERIES_CARDS.get(pack.slice(2));
    if (cards?.length >= 6) return cards;
  }
  throw new Error('Booster inconnu.');
}
export function packName(pack, now) { return pack === 'mix' ? 'Mix multivers' : pack === 'daily' ? dailyTheme(now).name : SERIES.get(pack.slice(2))?.name ?? 'Booster inconnu'; }
export function normalizedRates(pool) {
  const present = new Set(pool.map(c => c.rarity));
  const total = RARITIES.reduce((n, r, i) => n + (present.has(i) ? r.rate : 0), 0);
  return RARITIES.map((r, i) => present.has(i) ? r.rate * 100 / total : 0);
}
export function cardId(value) {
  const id = String(value ?? '').trim().toLowerCase().replace(/^#/, '');
  return CARDS.has(id) ? id : CARDS.has(`al${id}`) ? `al${id}` : null;
}
