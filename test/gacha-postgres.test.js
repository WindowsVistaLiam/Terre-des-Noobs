import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PostgresStore } from '../src/store.js';
import { GachaGame } from '../src/gacha-game.js';
import { CATALOG } from '../src/gacha-catalog.js';
import { prepareGachaReset, confirmGachaReset } from '../src/gacha-admin.js';
test('Gacha PostgreSQL réel : concurrence, replay, persistance, remboursements et reset isolé du RPG', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const admin = new PostgresStore(process.env.TEST_DATABASE_URL), schema = `gacha_${randomUUID().replaceAll('-', '')}`;
  let a, b, reopened;
  try {
    await admin.pool.query(`CREATE SCHEMA ${schema}`);
    const options = { options: `-c search_path=${schema}` };
    a = new PostgresStore(process.env.TEST_DATABASE_URL, options); b = new PostgresStore(process.env.TEST_DATABASE_URL, options);
    await a.init(); await b.init();
    const ga = new GachaGame(a), gb = new GachaGame(b), seller = '111111111111111111', one = '222222222222222222', two = '333333333333333333';
    for (const user of [seller, one, two]) await ga.execute('view', user, { view: 'profile' });
    await a.transaction(tx => tx.set('player', seller, { id: seller, gold: 12345, name: 'Ancien héros' }));
    const pull = await ga.execute('open', seller, { pack: 'mix', count: 5 }, 'persistent-open');
    const cid = pull.pulls[0].cardId;
    const sale = await ga.execute('list', seller, { cardId: cid, quantity: 1, price: 25 });
    const purchases = await Promise.allSettled([gb.execute('buy', one, { listingId: sale.listingId }, 'buy-one'), ga.execute('buy', two, { listingId: sale.listingId }, 'buy-two')]);
    assert.equal(purchases.filter(x => x.status === 'fulfilled').length, 1);
    const result = await gb.execute('view', seller, { view: 'profile' }); assert.equal(result.p.coins, 323);
    const stockBefore = result.p.stock, openedBefore = result.p.opened;
    await a.close(); a = null;
    reopened = new PostgresStore(process.env.TEST_DATABASE_URL, options); await reopened.init();
    const gr = new GachaGame(reopened);
    const replay = await gr.execute('open', seller, { pack: 'mix', count: 5 }, 'persistent-open');
    assert.equal(replay.p.opened, openedBefore); assert.equal(replay.p.stock, stockBefore); assert.deepEqual(replay.pulls, pull.pulls);
    const offered = Object.keys(replay.p.collection)[0], wanted = CATALOG.cards[0].id;
    await gr.execute('trade', seller, { cardId: offered, wanted, targetId: one });
    const token = await prepareGachaReset(gr, two, one, 'main');
    const resets = await Promise.allSettled([confirmGachaReset(gr, two, token.id, 'main'), confirmGachaReset(gb, two, token.id, 'main')]);
    assert.equal(resets.filter(x => x.status === 'fulfilled').length, 1);
    const restored = await gr.execute('view', seller, { view: 'profile' }); assert.equal(restored.p.collection[offered], replay.p.collection[offered]);
    assert.equal((await reopened.transaction(tx => tx.get('player', seller))).gold, 12345);
    assert.equal(await reopened.transaction(tx => tx.get('gacha_player', one)), null);
    await assert.rejects(reopened.transaction(async tx => { const p = await tx.get('gacha_player', seller); p.coins = 0; await tx.set('gacha_player', seller, p); throw new Error('rollback'); }));
    assert.equal((await gr.execute('view', seller, { view: 'profile' })).p.coins, 323);
  } finally {
    await a?.close(); await b?.close(); await reopened?.close();
    await admin.pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.close();
  }
});
