import test from 'node:test';
import assert from 'node:assert/strict';
import { ActionRowBuilder, ModalBuilder } from 'discord.js';
import { MemoryStore } from '../src/store.js';
import { GachaGame } from '../src/gacha-game.js';
import { CARDS, SERIES, CATALOG, RARITIES, SETTINGS, normalizedRates, poolFor, dailyTheme } from '../src/gacha-catalog.js';
import { gachaComponents, gid, renderGacha } from '../src/gacha-ui.js';
import { gachaCommands, parseGachaRoute, gachaModal, createGachaHandler } from '../src/gacha-controller.js';
import { prepareGachaReset, confirmGachaReset } from '../src/gacha-admin.js';
const A = '111111111111111111', B = '222222222222222222', C = '333333333333333333';
const cards = RARITIES.map((_, i) => CATALOG.cards.find(c => c.rarity === i));
async function setup(random = () => 0) {
  let time = Date.UTC(2026, 10, 4, 12);
  const store = new MemoryStore(), game = new GachaGame(store, { now: () => time, random });
  for (const user of [A, B, C]) await game.execute('view', user, { view: 'profile', name: `Joueur ${user[0]}` });
  const change = async (user, fn) => store.transaction(async tx => { const p = await tx.get('gacha_player', user); fn(p); await tx.set('gacha_player', user, p); });
  const profile = async user => (await game.execute('view', user, { view: 'profile' })).p;
  const confirm = async (user, operation, values) => { const d = await game.execute('prepare', user, { operation, values }); return game.execute('confirm', user, { token: d.pending.id }); };
  return { store, game, change, profile, confirm, advance: ms => time += ms };
}
test('Gacha : catalogue embarqué, identifiants uniques, sources, 6 raretés et univers cohérents', () => {
  assert.ok(CARDS.size > 4000); assert.ok(SERIES.size > 1000);
  assert.equal(CARDS.size, CATALOG.cards.length);
  for (const c of CATALOG.cards) { assert.ok(SERIES.has(c.seriesId)); assert.ok(c.art); assert.match(c.source, /^https:\/\/anilist.co\/character\/\d+$/); assert.ok(c.rarity >= 0 && c.rarity <= 5); }
  const rates = normalizedRates(poolFor('daily', Date.UTC(2026, 10, 4)));
  assert.ok(Math.abs(rates.reduce((a, b) => a + b, 0) - 100) < .00001);
  assert.ok(poolFor('daily', Date.UTC(2026, 10, 4)).every(c => c.seriesId === dailyTheme(Date.UTC(2026, 10, 4)).id));
});
test('Gacha : migration additive sans conversion d’or ni modification du RPG', async () => {
  const store = new MemoryStore(), legacy = { id: A, name: 'Ancien héros', gold: 999999, level: 35, customization: { bio: 'Mon histoire' } };
  await store.transaction(tx => tx.set('player', A, legacy));
  const d = await new GachaGame(store).execute('view', A, { view: 'profile' });
  assert.equal(d.p.name, 'Ancien héros'); assert.equal(d.p.coins, 300); assert.equal(d.p.stock, 5); assert.equal(d.p.tickets, SETTINGS.freeCap);
  assert.deepEqual(await store.transaction(tx => tx.get('player', A)), legacy);
});
test('Gacha : cinq cartes par booster, rare garantie, recharge partielle et plafond sans cumul caché', async () => {
  const s = await setup();
  const d = await s.game.execute('open', A, { pack: 'mix' });
  assert.equal(d.pulls.length, 5); assert.ok(CARDS.get(d.pulls[4].cardId).rarity >= 2); assert.equal(d.p.tickets, SETTINGS.freeCap - 1);
  s.advance(9 * 60000); assert.equal((await s.profile(A)).tickets, SETTINGS.freeCap - 1);
  s.advance(60000); assert.equal((await s.profile(A)).tickets, SETTINGS.freeCap);
  s.advance(24 * 3600000); await s.profile(A);
  await s.game.execute('open', A, { pack: 'mix' }); s.advance(60000);
  assert.equal((await s.profile(A)).tickets, SETTINGS.freeCap - 1);
});
test('Gacha : les boosters en réserve ne rechargent pas et un replay ne retire rien', async () => {
  const s = await setup();
  await s.change(A, p => { p.tickets = 3; });
  const first = await s.game.execute('open', A, { pack: 'mix', count: 5 }, 'same-open');
  assert.equal(first.p.tickets, 0); assert.equal(first.p.stock, 3); assert.equal(first.p.opened, 5);
  const again = await s.game.execute('open', A, { pack: 'mix', count: 5 }, 'same-open');
  assert.deepEqual(again.pulls, first.pulls); assert.equal(again.p.opened, 5); assert.ok(again.replay);
  await assert.rejects(s.game.execute('open', B, { pack: 'mix' }, 'same-open'), /appartient/);
});
test('Gacha : les trois garanties se déclenchent et leurs compteurs sont remis à zéro', async () => {
  const s = await setup();
  await s.change(A, p => { p.pityEpic = 19; });
  const epic = await s.game.execute('open', A, { pack: 'mix' });
  assert.equal(CARDS.get(epic.pulls[4].cardId).rarity, 3); assert.equal(epic.p.pityEpic, 0);
  await s.change(A, p => { p.pityLegendary = 99; });
  const legendary = await s.game.execute('open', A, { pack: 'mix' });
  assert.equal(CARDS.get(legendary.pulls[4].cardId).rarity, 4); assert.equal(legendary.p.pityLegendary, 0);
  await s.change(A, p => { p.pityMythic = 399; });
  const mythic = await s.game.execute('open', A, { pack: 'mix' });
  assert.equal(CARDS.get(mythic.pulls[4].cardId).rarity, 5); assert.equal(mythic.p.pityMythic, 0); assert.equal(mythic.p.pityLegendary, 0); assert.equal(mythic.p.pityEpic, 0);
});
test('Gacha : boosters payants atomiques, prix entier et rejet des quantités malformées', async () => {
  const s = await setup();
  const results = await Promise.allSettled(Array.from({ length: 3 }, (_, i) => s.game.execute('buyPack', A, { pack: 'mix', count: 1 }, `buy-pack-${i}`)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 2); assert.equal((await s.profile(A)).coins, 0);
  for (const count of [-1, 0, 1.2, NaN, 6]) await assert.rejects(s.game.execute('open', A, { pack: 'mix', count }));
});
test('Gacha : récompense quotidienne une seule fois, série et rupture', async () => {
  const s = await setup();
  const results = await Promise.allSettled([s.game.execute('daily', A), s.game.execute('daily', A)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await s.profile(A)).stock, 8); assert.equal((await s.profile(A)).coins, 400);
  s.advance(86400000); assert.equal((await s.game.execute('daily', A)).p.streak, 2);
  s.advance(2 * 86400000); assert.equal((await s.game.execute('daily', A)).p.streak, 1);
});
test('Gacha : favoris protégés, recyclage des doublons conservant une copie, hauts rangs exclus', async () => {
  const s = await setup();
  await s.change(A, p => { for (const c of cards) p.collection[c.id] = 3; p.favorites = [cards[0].id]; });
  await assert.rejects(s.game.execute('recycle', A, { cardId: cards[0].id, quantity: 3 }), /protégée/);
  const d = await s.confirm(A, 'recycleDuplicates', {});
  for (const c of cards.slice(0, 3)) assert.equal(d.p.collection[c.id], 1);
  for (const c of cards.slice(3)) assert.equal(d.p.collection[c.id], 3);
  assert.equal(d.p.coins, 300 + (2 + 5 + 12) * 2);
});
test('Gacha : vente en séquestre, deux acheteurs concurrents, commission et suppression de l’annonce', async () => {
  const s = await setup(), cid = cards[1].id;
  await s.change(A, p => { p.collection[cid] = 2; });
  const sale = await s.confirm(A, 'list', { cardId: cid, quantity: 2, price: 10 });
  assert.equal(sale.p.collection[cid], undefined);
  const purchases = await Promise.allSettled([B, C].map(user => s.game.execute('buy', user, { listingId: sale.listingId })));
  assert.equal(purchases.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal((await s.profile(A)).coins, 319);
  assert.equal((await s.game.execute('view', B, { view: 'market' })).listings.length, 0);
  assert.equal((await s.profile(B)).collection[cid] ?? (await s.profile(C)).collection[cid], 2);
});
test('Gacha : vente annulée ou expirée rend les cartes, sans fabriquer d’éclats', async () => {
  const s = await setup(), cid = cards[0].id;
  await s.change(A, p => { p.collection[cid] = 2; });
  const sale = await s.confirm(A, 'list', { cardId: cid, quantity: 1, price: 20 });
  await assert.rejects(s.game.execute('cancelListing', B, { listingId: sale.listingId }), /appartient/);
  await s.game.execute('cancelListing', A, { listingId: sale.listingId });
  assert.equal((await s.profile(A)).collection[cid], 2);
  await s.confirm(A, 'list', { cardId: cid, quantity: 2, price: 20 });
  s.advance(SETTINGS.marketDuration + 1); await s.game.cleanup();
  assert.equal((await s.profile(A)).collection[cid], 2); assert.equal((await s.profile(A)).coins, 300);
});
test('Gacha : validation de confirmation refaite après modification de l’inventaire et expiration', async () => {
  const s = await setup(), cid = cards[0].id;
  await s.change(A, p => { p.collection[cid] = 1; });
  const pending = await s.game.execute('prepare', A, { operation: 'recycle', values: { cardId: cid, quantity: 1 } });
  await s.game.execute('favorite', A, { cardId: cid });
  await assert.rejects(s.game.execute('confirm', A, { token: pending.pending.id }), /protégée/);
  await assert.rejects(s.game.execute('confirm', B, { token: pending.pending.id }), /Confirmation/);
  s.advance(5 * 60000 + 1); await assert.rejects(s.game.execute('confirm', A, { token: pending.pending.id }), /expirée/);
});
test('Gacha : échange réservé, consentement du destinataire et acceptation unique concurrente', async () => {
  const s = await setup(), offer = cards[0].id, wanted = cards[1].id;
  await s.change(A, p => { p.collection[offer] = 2; }); await s.change(B, p => { p.collection[wanted] = 2; });
  const t = await s.confirm(A, 'trade', { cardId: offer, quantity: 2, wanted, wantedQty: 1, targetId: B });
  assert.equal((await s.profile(A)).collection[offer], undefined);
  await assert.rejects(s.game.execute('tradeRespond', C, { tradeId: t.tradeId, accept: true }), /destinée/);
  const outcomes = await Promise.allSettled([1, 2].map(() => s.game.execute('tradeRespond', B, { tradeId: t.tradeId, accept: true })));
  assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1);
  const a = await s.profile(A), b = await s.profile(B);
  assert.equal(a.collection[wanted], 1); assert.equal(b.collection[offer], 2); assert.equal(b.collection[wanted], 1);
  assert.equal(a.trades, 1); assert.equal(b.trades, 1);
});
test('Gacha : échange refusé, annulé ou expiré restitue exactement les cartes offertes', async () => {
  for (const mode of ['decline', 'cancel', 'expire']) {
    const s = await setup(), cid = cards[0].id;
    await s.change(A, p => { p.collection[cid] = 3; });
    const t = await s.game.execute('trade', A, { cardId: cid, quantity: 2, wanted: cards[1].id, targetId: B });
    if (mode === 'expire') { s.advance(SETTINGS.tradeDuration + 1); await s.game.cleanup(); }
    else await s.game.execute('tradeRespond', mode === 'decline' ? B : A, { tradeId: t.tradeId, accept: false });
    assert.equal((await s.profile(A)).collection[cid], 3); assert.equal((await s.profile(B)).collection[cid], undefined);
  }
});
test('Gacha : insuffisance chez le destinataire et blocage n’entraînent aucun transfert partiel', async () => {
  const s = await setup(), cid = cards[0].id;
  await s.change(A, p => { p.collection[cid] = 2; });
  const t = await s.game.execute('trade', A, { cardId: cid, quantity: 1, wanted: cards[1].id, targetId: B });
  await assert.rejects(s.game.execute('tradeRespond', B, { tradeId: t.tradeId, accept: true }), /Quantité/);
  assert.equal((await s.profile(A)).collection[cid], 1);
  await s.game.execute('block', B, { targetId: A });
  await assert.rejects(s.game.execute('tradeRespond', B, { tradeId: t.tradeId, accept: true }), /indisponible/);
  await assert.rejects(s.game.execute('view', A, { view: 'profile', targetId: B }), /indisponible/);
});
test('Gacha : demandes d’amis, acceptation, protection d’identité et retrait lors d’un blocage', async () => {
  const s = await setup();
  await s.game.execute('friendRequest', A, { targetId: B });
  const inbox = await s.game.execute('view', B, { view: 'social' }), r = inbox.requests[0];
  await assert.rejects(s.game.execute('friendRespond', C, { requestId: r.id, accept: true }));
  await s.game.execute('friendRespond', B, { requestId: r.id, accept: true });
  assert.deepEqual((await s.profile(A)).friends, [B]); assert.deepEqual((await s.profile(B)).friends, [A]);
  await s.game.execute('block', A, { targetId: B }); assert.deepEqual((await s.profile(B)).friends, []);
});
test('Gacha : découvertes permanentes, albums et récompenses à usage unique', async () => {
  const s = await setup(), theme = dailyTheme(Date.UTC(2026, 10, 4));
  await s.change(A, p => { CATALOG.cards.filter(c => c.seriesId === theme.id).forEach(c => { p.discovered[c.id] = 1; }); });
  const album = await s.game.execute('claimAlbum', A, { seriesId: theme.id });
  assert.equal(album.p.coins, 550); assert.equal(album.p.stock, 7);
  await assert.rejects(s.game.execute('claimAlbum', A, { seriesId: theme.id }), /déjà/);
  await s.game.execute('open', A, { pack: 'mix' }); await s.game.execute('claim', A, { objective: 'first' });
  await assert.rejects(s.game.execute('claim', A, { objective: 'first' }), /déjà/);
});
test('Gacha : recherche paginée liée à son auteur et collections filtrées, parcours d’échange sans saisir d’identifiants', async () => {
  const s = await setup(), cid = cards[0].id;
  await s.change(A, p => { p.collection[cid] = 1; }); await s.change(B, p => { for (const c of CATALOG.cards.slice(0, 20)) p.collection[c.id] = 1; });
  const search = await s.game.execute('search', A, { view: 'catalog', query: 'Naruto' });
  assert.ok(search.total); assert.ok(search.cards.every(c => `${c.name} ${SERIES.get(c.seriesId).name}`.toLowerCase().includes('naruto')));
  await assert.rejects(s.game.execute('view', B, { view: 'catalog', searchToken: search.searchToken }), /expirée/);
  const partners = await s.game.execute('view', A, { view: 'tradeChoose', cardId: cid, targetId: B, page: 1 });
  assert.equal(partners.page, 1); assert.equal(partners.cards.length, 8);
});
test('Gacha : chaque écran conserve les limites Discord et les composants natifs sont valides', async () => {
  const s = await setup(); await s.change(A, p => { for (const c of CATALOG.cards.slice(0, 30)) p.collection[c.id] = 2; });
  const views = ['profile', 'packs', 'collection', 'catalog', 'albums', 'market', 'social', 'missions', 'leaderboard', 'info', 'customize', 'wishlist', 'card', 'tradePartner', 'tradeChoose'];
  for (const view of views) {
    const d = await s.game.execute('view', A, { view, cardId: CATALOG.cards[0].id, ...(view === 'tradeChoose' ? { targetId: B } : {}) });
    const rows = gachaComponents(d, A); assert.ok(rows.length <= 5, view);
    const ids = rows.flatMap(row => row.components).map(c => c.custom_id).filter(Boolean);
    assert.equal(new Set(ids).size, ids.length, view);
    for (const row of rows) { assert.doesNotThrow(() => ActionRowBuilder.from(row).toJSON(), view); for (const c of row.components) { if (c.custom_id) assert.ok(c.custom_id.length <= 100); assert.ok((c.options?.length ?? 0) <= 25); } }
  }
  for (const [kind, arg] of [['text'], ['image', 'portrait'], ['search', 'catalog'], ['trade', cards[0].id], ['list', cards[0].id], ['recycle', cards[0].id]]) assert.doesNotThrow(() => ModalBuilder.from(gachaModal(A, kind, arg, { name: 'Nami', bio: 'Salut' })).toJSON());
});
test('Gacha : le propriétaire des contrôles est vérifié ; navigation publique limitée à la lecture', () => {
  const mock = { user: { id: B }, customId: gid(A, 'confirm', 'anything') };
  assert.throws(() => parseGachaRoute(mock), /autre joueur/);
  assert.throws(() => parseGachaRoute({ ...mock, customId: gid('all', 'open', 'mix', '1') }), /autre joueur/);
  assert.equal(parseGachaRoute({ ...mock, customId: gid('all', 'nav'), values: ['packs'] }).args.view, 'packs');
  assert.throws(() => parseGachaRoute({ ...mock, customId: `tdn:${B}:fight:skill` }), /ancien RPG/);
  assert.equal(gachaCommands.length, 7); assert.equal(gachaCommands.find(c => c.name === 'admin-reset').default_member_permissions, '8');
});
test('Gacha : PNG réel avec portraits, mention ciblée et absence de ping global', async () => {
  const s = await setup(); const d = await s.game.execute('open', A, { pack: 'mix' });
  const png = await renderGacha(d, A); assert.ok(png.files[0].attachment.length > 50000);
  assert.equal(png.files[0].attachment.subarray(1, 4).toString(), 'PNG'); assert.equal(png.content, `<@${A}>`);
  assert.deepEqual(png.allowedMentions.parse, []); assert.deepEqual(png.allowedMentions.users, [A]);
});
test('Gacha : reset nettoie le séquestre et les liens, rembourse les autres, respecte les générations', async () => {
  const s = await setup();
  await s.change(A, p => { p.collection[cards[0].id] = 2; }); await s.change(B, p => { p.collection[cards[1].id] = 2; });
  await s.game.execute('trade', B, { cardId: cards[1].id, quantity: 1, wanted: cards[0].id, targetId: A });
  await s.game.execute('list', A, { cardId: cards[0].id, quantity: 1, price: 10 });
  const token = await prepareGachaReset(s.game, C, A, 'main');
  await assert.rejects(confirmGachaReset(s.game, B, token.id, 'main'));
  await confirmGachaReset(s.game, C, token.id, 'main');
  assert.equal((await s.profile(B)).collection[cards[1].id], 2);
  assert.equal((await s.game.execute('view', B, { view: 'market' })).total, 0);
  assert.deepEqual((await s.profile(A)).collection, {});
  await assert.rejects(confirmGachaReset(s.game, C, token.id, 'main'));
});
test('Gacha : handler rend les tirages et confirmations publics ; permissions admin revérifiées', async () => {
  const s = await setup(); const events = [];
  const handler = createGachaHandler(s.game, { adminGuildId: 'main', cooldownMs: 0, paint: async d => ({ view: d.view, message: d.message }) });
  const mock = (customId, permission = false, guildId = 'main') => ({ id: Math.random().toString(), user: { id: A }, guildId, customId, isButton: () => true, isChatInputCommand: () => false, memberPermissions: { has: () => permission }, deferReply: async options => events.push(options), editReply: async payload => events.push(payload) });
  await handler(mock(gid(A, 'open', 'mix', '1'))); assert.equal(events[0].flags, 0); assert.equal(events[1].view, 'pull');
  events.length = 0;
  await handler(mock(gid(A, 'paid'), false)); assert.equal(events[0].flags, 0);
  const token = await prepareGachaReset(s.game, A, B, 'main');
  await handler(mock(gid(A, 'adminConfirm', token.id), true, 'other')); assert.ok((await s.profile(B)).generation);
  events.length = 0; await handler(mock(gid(A, 'adminConfirm', token.id), false)); assert.match(events.at(-1).message, /administrateurs/);
  await handler(mock(gid(A, 'adminConfirm', token.id), true));
  assert.equal(await s.store.transaction(tx => tx.get('gacha_player', B)), null);
});
test('Gacha : ouverture depuis un album cible uniquement cet univers avec taux adaptés', async () => {
  const s = await setup(), theme = dailyTheme(Date.UTC(2026, 10, 4));
  const route = parseGachaRoute({ user: { id: A }, customId: gid(A, 'universePack', theme.id) });
  const packs = await s.game.execute(route.action, A, route.args);
  assert.equal(packs.pack, `s_${theme.id}`);
  const d = await s.game.execute('open', A, { pack: packs.pack, count: 5 });
  assert.ok(d.pulls.every(c => CARDS.get(c.cardId).seriesId === theme.id));
  assert.ok(gachaComponents(d, A).length <= 5);
  const daily = await s.game.execute('view', A, { view: 'packs', pack: 'daily' });
  const ids = gachaComponents(daily, A).flatMap(row => row.components).map(c => c.custom_id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length);
});
test('Gacha : parcours Discord complet de proposition, sélection de joueur et acceptation confirmée', async () => {
  const s = await setup(), offer = cards[0].id, wanted = cards[1].id;
  await s.change(A, p => { p.collection[offer] = 1; }); await s.change(B, p => { p.collection[wanted] = 1; });
  const actor = (user, customId, value) => ({ user: { id: user }, customId, values: value ? [value] : [] });
  let route = parseGachaRoute(actor(A, gid(A, 'cardAction', offer), 'tradeForm'));
  assert.equal((await s.game.execute(route.action, A, route.args)).view, 'tradePartner');
  route = parseGachaRoute(actor(A, gid(A, 'tradeTarget', offer), B));
  assert.equal((await s.game.execute(route.action, A, route.args)).cards[0].id, wanted);
  route = parseGachaRoute(actor(A, gid(A, 'tradeWant', offer, B), wanted));
  let pending = await s.game.execute(route.action, A, route.args);
  route = parseGachaRoute(actor(A, gid(A, 'confirm', pending.pending.id)));
  const proposal = await s.game.execute(route.action, A, route.args);
  route = parseGachaRoute(actor(B, gid(B, 'tradeAccept', proposal.tradeId)));
  pending = await s.game.execute(route.action, B, route.args);
  route = parseGachaRoute(actor(B, gid(B, 'confirm', pending.pending.id)));
  assert.equal((await s.game.execute(route.action, B, route.args)).trade.status, 'accepted');
});
test('Gacha : 400 boosters sans tirage chanceux déclenchent les garanties prévues sans coût supplémentaire', async () => {
  const s = await setup(); await s.change(A, p => { p.stock = 400; p.tickets = 0; });
  for (let n = 1; n <= 400; n++) {
    const d = await s.game.execute('open', A, { pack: 'mix' });
    if (n === 20) assert.equal(CARDS.get(d.pulls[4].cardId).rarity, 3);
    if (n === 100) assert.equal(CARDS.get(d.pulls[4].cardId).rarity, 4);
    if (n === 400) assert.equal(CARDS.get(d.pulls[4].cardId).rarity, 5);
  }
  const p = await s.profile(A); assert.equal(p.opened, 400); assert.equal(p.coins, 300); assert.equal(p.pityMythic, 0);
});
