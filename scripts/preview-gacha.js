import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { MemoryStore } from '../src/store.js';
import { GachaGame } from '../src/gacha-game.js';
import { CATALOG, CARDS } from '../src/gacha-catalog.js';
import { renderGacha } from '../src/gacha-ui.js';
import { normalizeImage } from '../src/profile-media.js';
const A = '111111111111111111', B = '222222222222222222';
export async function createGachaPreviewGame() {
  let state = 427;
  const game = new GachaGame(new MemoryStore(), { now: () => Date.UTC(2026, 10, 4, 15), random: () => { state = Math.imul(state, 1664525) + 1013904223 | 0; return (state >>> 0) / 2 ** 32; } });
  for (const [id, name] of [[A, 'Vista'], [B, 'Nyx']]) await game.execute('view', id, { view: 'profile', name });
  await game.store.transaction(async tx => {
    for (const id of [A, B]) {
      const p = await tx.get('gacha_player', id); p.coins = 1420; p.opened = 38; p.stock = 8;
      p.bio = id === A ? 'À la recherche des héros qui ont marqué nos soirées anime. One Piece, Naruto, Bleach… et surtout des échanges entre amis !' : 'Les doublons des uns font les trésors des autres.';
      for (const c of CATALOG.cards.slice(0, id === A ? 120 : 70)) { p.collection[c.id] = 1 + Number(c.rarity < 4); p.discovered[c.id] = game.clock(); }
      p.favorites = CATALOG.cards.slice(0, 4).map(c => c.id); p.friends = [id === A ? B : A];
      p.wishlist = CATALOG.cards.slice(130, 137).map(c => c.id);
      await tx.set('gacha_player', id, p);
    }
  });
  const banner = createCanvas(1280, 320), ctx = banner.getContext('2d'), gradient = ctx.createLinearGradient(0, 0, 1280, 320);
  gradient.addColorStop(0, '#262447'); gradient.addColorStop(1, '#163a47'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1280, 320);
  ctx.strokeStyle = '#ffd26066'; ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) { ctx.save(); ctx.translate(850 + i * 70, 120); ctx.rotate(Math.PI / 4); ctx.strokeRect(-70, -70, 140, 140); ctx.restore(); }
  ctx.font = '44px Gacha'; ctx.fillStyle = '#f3f2fb'; ctx.fillText('LA VITRINE DE VISTA', 75, 150); ctx.font = '25px Gacha'; ctx.fillStyle = '#ffd260'; ctx.fillText('Chaque carte commence une nouvelle histoire.', 75, 200);
  await game.execute('media', A, { slot: 'banner', media: await normalizeImage(await banner.encode('png'), 'banner') });
  return game;
}
export async function previewGacha(directory = new URL('../.local/gacha-previews/', import.meta.url)) {
  await mkdir(directory, { recursive: true });
  const game = await createGachaPreviewGame();
  const out = async (name, data) => { const panel = await renderGacha(data, A); await writeFile(new URL(`${name}.png`, directory), panel.files[0].attachment); console.log(`${name}: ${panel.files[0].attachment.length} bytes, ${panel.components.length} rows`); };
  for (const view of ['profile', 'packs', 'collection', 'catalog', 'albums', 'wishlist', 'social', 'missions', 'leaderboard', 'info', 'customize']) await out(view, await game.execute('view', A, { view }));
  const c = CATALOG.cards.find(c => c.name.includes('Luffy')) ?? CATALOG.cards[0];
  await out('card', await game.execute('view', A, { view: 'card', cardId: c.id }));
  await out('album', await game.execute('view', A, { view: 'album', seriesId: c.seriesId }));
  await out('trade-partner', await game.execute('view', A, { view: 'tradePartner', cardId: c.id }));
  await out('trade-choice', await game.execute('view', A, { view: 'tradeChoose', cardId: c.id, targetId: B }));
  const offer = CATALOG.cards[10].id, wanted = CATALOG.cards[11].id;
  const trade = await game.execute('trade', A, { cardId: offer, wanted, targetId: B }); await out('trade', trade);
  const normal = [...CARDS.values()].find(c => c.rarity === 0);
  await game.store.transaction(async tx => { const p = await tx.get('gacha_player', B); p.collection[normal.id] = 4; await tx.set('gacha_player', B, p); });
  await game.execute('list', B, { cardId: normal.id, quantity: 2, price: 15 });
  await out('market', await game.execute('view', A, { view: 'market' }));
  await out('pull', await game.execute('open', A, { pack: 'mix' }));
  await out('pull-5', await game.execute('open', A, { pack: 'mix', count: 5 }));
  await out('confirm', await game.execute('prepare', A, { operation: 'buyPack', values: { pack: 'mix', count: 1 } }));
  return game;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await previewGacha();
