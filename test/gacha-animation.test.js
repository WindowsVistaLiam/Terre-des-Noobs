import test from 'node:test';
import assert from 'node:assert/strict';
import { GifReader } from 'omggif';
import { rarePull } from '../src/gacha-animation.js';
import { renderGacha, gachaComponents } from '../src/gacha-ui.js';
import { CATALOG } from '../src/gacha-catalog.js';
import { GachaGame } from '../src/gacha-game.js';
import { MemoryStore } from '../src/store.js';
const user = '111111111111111111';
const byRank = rarity => CATALOG.cards.find(c => c.rarity === rarity);
async function fixture(rarities) {
  const game = new GachaGame(new MemoryStore(), { random: () => 0 });
  const data = await game.execute('open', user, { pack: 'mix' });
  return { ...data, pulls: rarities.map(rarity => ({ cardId: byRank(rarity).id, fresh: false })) };
}
test('Animation : seulement les ouvertures mythiques/légendaires, même en doublon, priorité au légendaire', () => {
  const pulls = [4, 5, 4].map(r => ({ cardId: byRank(r).id, fresh: false }));
  assert.equal(rarePull({ view: 'pull', pulls }).kind, 'legendaire');
  assert.equal(rarePull({ view: 'pull', pulls: [pulls[0]] }).kind, 'mythique');
  assert.equal(rarePull({ view: 'collection', pulls }), null);
  assert.equal(rarePull({ view: 'pull', pulls: [{ cardId: byRank(3).id }] }), null);
});
test('Animation : GIFs réellement animés et distincts, une seule lecture, sans effacer les cartes', async () => {
  const hashes = [];
  for (const rank of [4, 5]) {
    const data = await fixture([0, 1, rank, 2, 3]);
    const before = structuredClone(data);
    const panel = await renderGacha(data, user), file = panel.files[0];
    assert.match(file.name, rank === 4 ? /mythique\.gif$/ : /legendaire\.gif$/);
    assert.equal(file.attachment.toString('ascii', 0, 6), 'GIF89a');
    assert.ok(file.attachment.length < 8_000_000);
    const gif = new GifReader(file.attachment);
    assert.equal(gif.width, 960); assert.equal(gif.numFrames(), 32); assert.equal(gif.loopCount(), null);
    const first = new Uint8Array(gif.width * gif.height * 4), pixels = new Uint8Array(first.length);
    gif.decodeAndBlitFrameRGBA(0, first); pixels.set(first);
    for (let i = 1; i <= 15; i++) gif.decodeAndBlitFrameRGBA(i, pixels);
    assert.notDeepEqual(pixels, first, 'Le milieu doit contenir du mouvement');
    // Common cards outside the effect regions remain visible in every frame.
    const offset = (Math.round(360 * .75) * gif.width + Math.round(80 * .75)) * 4;
    assert.deepEqual(pixels.slice(offset, offset + 4), first.slice(offset, offset + 4));
    gif.decodeAndBlitFrameRGBA(31, pixels);
    assert.deepEqual(pixels, first, 'La dernière image conserve le résultat complet');
    const duration = Array.from({ length: gif.numFrames() }, (_, i) => gif.frameInfo(i).delay * 10).reduce((a, b) => a + b, 0);
    assert.equal(duration, 4140);
    assert.deepEqual(panel.components, gachaComponents(data, user));
    assert.deepEqual(data, before, 'Le rendu ne doit pas modifier le tirage, les compteurs ou le solde');
    assert.deepEqual(panel.allowedMentions.users, [user]);
    hashes.push(file.attachment);
  }
  assert.notDeepEqual(hashes[0], hashes[1]);
});
test('Animation : ouverture de 25 cartes avec plusieurs hauts rangs reste sous la limite de pièce jointe', async () => {
  const data = await fixture(Array.from({ length: 25 }, (_, i) => i < 3 ? 5 : i < 9 ? 4 : i % 4));
  const panel = await renderGacha(data, user), file = panel.files[0];
  assert.match(file.name, /legendaire\.gif$/); assert.ok(file.attachment.length < 8_000_000);
  const gif = new GifReader(file.attachment); assert.equal(gif.numFrames(), 32); assert.ok(gif.height > 1500);
  assert.ok(panel.components.length <= 5); assert.equal(rarePull(data).total, 9);
});
test('Animation : les autres résultats sont des PNG et une panne d’encodage conserve le tirage', async () => {
  const normal = await fixture([0, 1, 2, 3, 0]);
  const png = await renderGacha(normal, user, { animationEncoder: () => { throw new Error('must not run'); } });
  assert.equal(png.files[0].name, 'manga-club.png');
  const rare = await fixture([0, 1, 4, 2, 0]);
  const fallback = await renderGacha(rare, user, { animationEncoder: async () => { throw new Error('simulated encoder failure'); } });
  assert.equal(fallback.files[0].attachment.toString('ascii', 1, 4), 'PNG');
  assert.deepEqual(fallback.components, gachaComponents(rare, user));
});
test('Animation : rejouer le même reçu retrouve exactement les mêmes cartes et le même paiement', async () => {
  let n = 0;
  const game = new GachaGame(new MemoryStore(), { random: () => n++ % 2 ? 0 : .985 });
  const data = await game.execute('open', user, { pack: 'mix' }, 'rare-open');
  assert.equal(rarePull(data).rarity, 4);
  await renderGacha(data, user);
  const replay = await game.execute('open', user, { pack: 'mix' }, 'rare-open');
  assert.deepEqual(replay.pulls, data.pulls); assert.equal(replay.p.opened, 1);
  assert.equal(replay.p.coins, data.p.coins); assert.equal(replay.p.tickets, data.p.tickets);
});
