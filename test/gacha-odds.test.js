import test from 'node:test';
import assert from 'node:assert/strict';
import { RANK, RARITIES, normalizeCatalog, ODDS_VERSION } from '../src/gacha-rarities.js';
import { CARDS, THEMES, SERIES_CARDS, CATALOG, SETTINGS, normalizedRates } from '../src/gacha-catalog.js';
import { GachaGame } from '../src/gacha-game.js';
import { MemoryStore } from '../src/store.js';
const user = '111111111111111111';
const pool = RARITIES.map((_, rank) => CATALOG.cards.find(c => c.rarity === rank));
const pity = () => ({ pityEpic: 0, pityLegendary: 0, pityMythic: 0 });
test('Raretés : mythique au-dessus de légendaire, 0,1 % / 0,9 %, total 100 % et valeurs croissantes', () => {
  assert.ok(RANK.MYTHIC > RANK.LEGENDARY && RANK.LEGENDARY > RANK.EPIC && RANK.EPIC > RANK.RARE);
  assert.equal(RARITIES[RANK.MYTHIC].name, 'Mythique'); assert.equal(RARITIES[RANK.LEGENDARY].name, 'Légendaire');
  assert.equal(RARITIES[RANK.MYTHIC].rate, .1); assert.equal(RARITIES[RANK.LEGENDARY].rate, .9);
  assert.equal(RARITIES.reduce((n, r) => n + r.rate, 0), 100);
  for (let i = 1; i < RARITIES.length; i++) assert.ok(RARITIES[i].recycle > RARITIES[i - 1].recycle);
});
test('Raretés : tous les univers ciblés gardent les taux des hauts rangs sans renormalisation à la hausse', () => {
  assert.ok(THEMES.length > 200);
  for (const theme of THEMES) {
    const rates = normalizedRates(SERIES_CARDS.get(theme.id));
    assert.equal(rates[RANK.MYTHIC], .1, theme.name); assert.equal(rates[RANK.LEGENDARY], .9, theme.name);
    assert.equal(rates.reduce((a, b) => a + b, 0), 100, theme.name);
  }
});
test('Raretés : 100 000 tirages couvrent exactement chaque tranche, même sans rares dans l’univers', () => {
  for (const cards of [pool, pool.filter(c => c.rarity !== RANK.RARE)]) {
    let sample = 0, index = 0;
    const game = new GachaGame(new MemoryStore(), { random: () => index++ % 2 ? 0 : (sample + .5) / 100000 });
    const counts = Array(6).fill(0);
    for (sample = 0; sample < 100000; sample++) counts[game.draw(cards).rarity]++;
    assert.equal(counts[RANK.MYTHIC], 100); assert.equal(counts[RANK.LEGENDARY], 900);
    assert.equal(counts[RANK.EPIC], 5000);
    if (!cards.some(c => c.rarity === RANK.RARE)) { assert.equal(counts[RANK.COMMON], 66000); assert.equal(counts[RANK.RARE], 0); }
  }
});
test('Raretés : la garantie normale et le rang rare absent ne créent jamais de mythique ou légendaire', () => {
  const game = new GachaGame(new MemoryStore(), { random: () => 0 });
  for (const cards of [pool, pool.filter(c => c.rarity !== RANK.RARE)]) {
    const p = pity(), batch = game.rollPack(p, cards);
    assert.ok(batch.every(c => c.rarity < RANK.LEGENDARY));
    assert.equal(batch[4].rarity, cards.length === 6 ? RANK.RARE : RANK.EPIC);
    assert.equal(p.pityMythic, 1); assert.equal(p.pityLegendary, 1);
  }
});
test('Raretés : un haut rang naturel satisfait déjà la garantie, sans ajouter une deuxième ultra-rare', () => {
  for (const [rank, roll, counter] of [[RANK.MYTHIC, .9995, 'pityMythic'], [RANK.LEGENDARY, .995, 'pityLegendary']]) {
    const values = [roll, 0, ...Array(8).fill(0)]; let i = 0;
    const game = new GachaGame(new MemoryStore(), { random: () => values[i++] ?? 0 });
    const p = { ...pity(), [counter]: rank === RANK.MYTHIC ? SETTINGS.mythicPity - 1 : SETTINGS.legendaryPity - 1 };
    const batch = game.rollPack(p, pool);
    assert.equal(batch.filter(c => c.rarity >= RANK.LEGENDARY).length, 1);
    assert.equal(batch[0].rarity, rank); assert.equal(batch[4].rarity, RANK.COMMON);
    assert.equal(p[counter], 0);
  }
});
test('Raretés : 100 000 boosters simulés restent proches de 0,50 % de mythiques et 4,42 % de légendaires, hors pity', () => {
  let state = 417;
  const game = new GachaGame(new MemoryStore(), { random: () => { state = Math.imul(state, 1664525) + 1013904223 | 0; return (state >>> 0) / 2 ** 32; } });
  for (const cards of [pool, pool.filter(c => c.rarity !== RANK.RARE)]) {
    let mythic = 0, legendary = 0;
    for (let i = 0; i < 100000; i++) {
      const batch = game.rollPack(pity(), cards);
      mythic += Number(batch.some(c => c.rarity === RANK.MYTHIC));
      legendary += Number(batch.some(c => c.rarity === RANK.LEGENDARY));
    }
    assert.ok(mythic > 400 && mythic < 600, `Mythiques : ${mythic}/100000`);
    assert.ok(legendary > 4100 && legendary < 4700, `Légendaires : ${legendary}/100000`);
  }
});
test('Migration du catalogue : les anciennes M restent M, les anciennes L restent L, identifiants et illustrations conservés', () => {
  const old = { cards: [{ id: 'mythic', rarity: 4, power: 100, aura: 90, art: { atlas: 3, index: 2 } }, { id: 'legend', rarity: 5, power: 115, aura: 103, art: { atlas: 1, index: 7 } }] };
  const converted = normalizeCatalog(old);
  assert.equal(converted.cards[0].rarity, RANK.MYTHIC); assert.equal(converted.cards[1].rarity, RANK.LEGENDARY);
  assert.equal(converted.cards[0].id, old.cards[0].id); assert.deepEqual(converted.cards[0].art, old.cards[0].art);
  assert.equal(converted.cards[0].power, 114); assert.equal(converted.cards[1].power, 101);
  assert.deepEqual(normalizeCatalog(converted), converted); assert.equal(old.cards[0].rarity, 4);
});
test('Migration des joueurs : ancien compteur conservé pour légendaire, nouveau compteur mythique, aucun objet ni éclat perdu', async () => {
  const store = new MemoryStore(), game = new GachaGame(store);
  await game.execute('view', user, { view: 'profile' });
  const cid = pool[RANK.MYTHIC].id;
  await store.transaction(async tx => { const p = await tx.get('gacha_player', user); delete p.oddsVersion; delete p.pityLegendary; p.pityMythic = 37; p.pityEpic = 7; p.collection[cid] = 3; p.favorites = [cid]; await tx.set('gacha_player', user, p); });
  const p = (await game.execute('view', user, { view: 'profile' })).p;
  assert.equal(p.oddsVersion, ODDS_VERSION); assert.equal(p.pityLegendary, 37); assert.equal(p.pityMythic, 0); assert.equal(p.pityEpic, 7);
  assert.equal(p.collection[cid], 3); assert.deepEqual(p.favorites, [cid]); assert.equal(p.coins, 300);
  assert.equal(CARDS.get(cid).rarity, RANK.MYTHIC);
  const reopened = (await new GachaGame(store).execute('view', user, { view: 'profile' })).p;
  assert.equal(reopened.pityLegendary, 37); assert.equal(reopened.pityMythic, 0);
});
test('Migration : une ancienne confirmation ne peut valider une opération après changement d’équilibrage', async () => {
  const store = new MemoryStore(), game = new GachaGame(store);
  const pending = await game.execute('prepare', user, { operation: 'buyPack', values: { count: 1, pack: 'mix' } });
  await store.transaction(async tx => { const d = await tx.get('gacha_confirm', pending.pending.id); delete d.oddsVersion; await tx.set('gacha_confirm', d.id, d); });
  await assert.rejects(game.execute('confirm', user, { token: pending.pending.id }), /Confirmation expirée/);
  assert.equal((await game.execute('view', user, { view: 'profile' })).p.coins, 300);
});
