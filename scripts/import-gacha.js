// Build-time import only: the bot never depends on AniList being online.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { normalizeCatalog, ODDS_VERSION } from '../src/gacha-rarities.js';
const dir = new URL('../src/assets/gacha/', import.meta.url);
const cache = new URL('../.local/gacha-import/', import.meta.url);
await mkdir(dir, { recursive: true });
await mkdir(cache, { recursive: true });
const count = Number(process.argv.find(x => x.startsWith('--count='))?.split('=')[1] ?? 5000);
if (!Number.isInteger(count) || count < 50 || count > 5000) throw new Error('count: 50–5000 (limite de pagination AniList)');
const pause = ms => new Promise(r => setTimeout(r, ms));
async function request(query) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const response = await fetch('https://graphql.anilist.co', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query }), signal: AbortSignal.timeout(20000),
      });
      if (response.status === 429) { await pause(65000); continue; }
      if (!response.ok) throw new Error(`AniList HTTP ${response.status}`);
      const data = await response.json();
      if (data.errors) throw new Error(JSON.stringify(data.errors));
      return data.data;
    } catch (e) { if (attempt === 5) throw e; await pause(3000 * (attempt + 1)); }
  }
  throw new Error('AniList rate limit');
}
const raw = [];
for (let page = 1; page <= Math.ceil(count / 50); page++) {
  const file = new URL(`page-${page}.json`, cache);
  let chars;
  try { chars = JSON.parse(await readFile(file, 'utf8')); }
  catch {
    const data = await request(`{Page(page:${page},perPage:50){characters(sort:[FAVOURITES_DESC,ID]){id name{full} image{large} favourites media(perPage:4,sort:POPULARITY_DESC){nodes{id type isAdult title{romaji english}}}}}}`);
    chars = data.Page.characters;
    await writeFile(file, JSON.stringify(chars));
    await pause(2300);
  }
  raw.push(...chars);
  if (page % 10 === 0) console.log(`Catalogue : ${raw.length} personnages lus`);
}
const series = new Map(), used = new Set();
const cards = raw.flatMap(c => {
  const medias = c.media.nodes.filter(m => m.isAdult === false && ['ANIME', 'MANGA'].includes(m.type));
  const m = medias.find(m => m.type === 'ANIME') ?? medias[0];
  if (!m || !c.image.large || used.has(c.id)) return [];
  used.add(c.id);
  const seriesId = `al${m.id}`;
  if (!series.has(seriesId)) series.set(seriesId, { id: seriesId, name: m.title.english || m.title.romaji, source: `https://anilist.co/${m.type.toLowerCase()}/${m.id}` });
  return [{ id: `al${c.id}`, name: c.name.full, seriesId, popularity: c.favourites, imageUrl: c.image.large, source: `https://anilist.co/character/${c.id}` }];
});
// Fixed rarity per character, distributed within each series; never changes an existing card.
let previous = { cards: [] };
try { previous = normalizeCatalog(JSON.parse(await readFile(new URL('catalog.json', dir), 'utf8'))); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const existing = new Map(previous.cards.map(c => [c.id, c]));
for (const c of cards) if (existing.has(c.id)) c.seriesId = existing.get(c.id).seriesId;
for (const c of previous.cards) if (!used.has(Number(c.id.slice(2)))) cards.push(c);
for (const s of previous.series ?? []) if (!series.has(s.id)) series.set(s.id, s);
for (const s of series.values()) {
  const group = cards.filter(c => c.seriesId === s.id);
  group.forEach((c, i) => {
    c.rarity = existing.get(c.id)?.rarity ?? (i === 0 ? 5 : i === 1 ? 4 : i < Math.max(3, group.length * .08) ? 3 : i < group.length * .25 ? 2 : i < group.length * .55 ? 1 : 0);
    const hash = createHash('sha256').update(c.id).digest();
    c.power = 35 + c.rarity * 14 + hash[0] % 15;
    c.aura = 25 + c.rarity * 12 + hash[1] % 18;
  });
}
// Cache normalized portraits individually, then pack into small versioned atlases.
let completed = 0, missing = 0, next = 0;
const portraits = new Map();
async function worker() {
  while (next < cards.length) {
    const c = cards[next++], file = new URL(`${c.id}.webp`, cache);
    let bytes;
    try { bytes = await readFile(file); }
    catch {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const u = new URL(c.imageUrl);
          if (u.protocol !== 'https:' || !['s4.anilist.co', 's5.anilist.co'].includes(u.hostname)) break;
          const r = await fetch(u, { signal: AbortSignal.timeout(12000), redirect: 'error' });
          if (!r.ok) throw new Error(`image ${r.status}`);
          const input = Buffer.from(await r.arrayBuffer());
          if (input.length > 2 * 1024 * 1024) throw new Error('image too large');
          const im = await loadImage(input);
          if (im.width > 4096 || im.height > 4096) throw new Error('image dimensions');
          const cn = createCanvas(160, 220), ctx = cn.getContext('2d');
          const scale = Math.max(160 / im.width, 220 / im.height);
          ctx.drawImage(im, (160 - im.width * scale) / 2, (220 - im.height * scale) / 2, im.width * scale, im.height * scale);
          bytes = await cn.encode('webp', 80);
          await writeFile(file, bytes); break;
        } catch { await pause(500 * (attempt + 1)); }
      }
    }
    if (bytes) portraits.set(c.id, bytes); else missing++;
    if (++completed % 250 === 0) console.log(`Portraits : ${completed}/${cards.length} (${missing} indisponibles)`);
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
for (let start = 0; start < cards.length; start += 100) {
  const atlas = createCanvas(1600, 2200), ctx = atlas.getContext('2d');
  for (const [i, c] of cards.slice(start, start + 100).entries()) {
    if (!portraits.has(c.id)) { c.art = null; continue; }
    ctx.drawImage(await loadImage(portraits.get(c.id)), i % 10 * 160, Math.floor(i / 10) * 220);
    c.art = { atlas: Math.floor(start / 100), index: i };
  }
  await writeFile(new URL(`atlas-${Math.floor(start / 100)}.webp`, dir), await atlas.encode('webp', 80));
}
const output = { version: 1, rarityVersion: ODDS_VERSION, importedAt: new Date().toISOString(), provider: 'AniList', source: 'https://anilist.co', cards, series: [...series.values()] };
await writeFile(new URL('catalog.json', dir), JSON.stringify(output));
console.log(`Import terminé : ${cards.length} cartes, ${series.size} univers, ${portraits.size} portraits.`);
