import test from 'node:test';
import assert from 'node:assert/strict';
import { GachaGame } from '../src/gacha-game.js';
import { MemoryStore } from '../src/store.js';
import { createGachaHandler } from '../src/gacha-controller.js';
import { gid } from '../src/gacha-ui.js';
const A = '111111111111111111', B = '222222222222222222';
async function setup() {
  const game = new GachaGame(new MemoryStore(), { random: () => 0 });
  for (const user of [A, B]) await game.execute('view', user, { view: 'profile' });
  const handler = createGachaHandler(game, { cooldownMs: 0, adminGuildId: 'main', paint: async d => ({ view: d.view, owner: d.p?.id, message: d.message, pending: d.pending }) });
  return { game, handler };
}
let seq = 0;
function interaction({ user = A, command, customId, values, ephemeral = false, fields, admin = false, target = null } = {}) {
  const events = [], source = { id: 'source-message', flags: { has: flag => flag === 64 && ephemeral }, edit: async () => { throw new Error('Source message must stay unchanged'); } };
  return { events, id: `public-interaction-${++seq}`, user: { id: user, username: 'Collectionneur' }, guildId: 'main', commandName: command, customId, values,
    options: { getUser: () => target }, fields, memberPermissions: { has: () => admin },
    ...(command ? {} : { message: source }),
    isChatInputCommand: () => Boolean(command), isButton: () => Boolean(customId && !values && !fields), isStringSelectMenu: () => Boolean(values), isModalSubmit: () => Boolean(fields), isFromMessage: () => true,
    async deferReply(options) { this.deferred = true; events.push({ type: 'defer', ...options }); },
    deferUpdate: async () => { throw new Error('Public responses must not update their source'); },
    editReply: async payload => events.push({ type: 'reply', ...payload }),
    showModal: async modal => events.push({ type: 'modal', modal }),
  };
}
function publicReply(i, view) { assert.equal(i.events[0].type, 'defer'); assert.equal(i.events[0].flags, 0); assert.equal(i.events[1].view, view); }
test('Public : les six commandes, y compris collection et social, sont visibles dans le salon', async () => {
  const { handler } = await setup();
  for (const [command, view] of [['profil', 'profile'], ['gacha', 'packs'], ['collection', 'collection'], ['marché', 'market'], ['social', 'social'], ['info', 'info']]) {
    const i = interaction({ command }); await handler(i); publicReply(i, view);
  }
});
test('Public : listes et boutons publient une nouvelle réponse, même depuis un ancien panneau éphémère', async () => {
  const { handler } = await setup();
  for (const ephemeral of [false, true]) {
    const i = interaction({ customId: gid('all', 'nav'), values: ['collection'], ephemeral });
    await handler(i); publicReply(i, 'collection');
    const action = interaction({ customId: gid(A, 'daily'), ephemeral });
    await handler(action); publicReply(action, ephemeral ? 'error' : 'profile');
  }
});
test('Public : un visiteur ouvre ses propres menus sans modifier ni dépenser les biens de l’auteur', async () => {
  const { game, handler } = await setup();
  const nav = interaction({ user: B, customId: gid('all', 'nav'), values: ['packs'] });
  await handler(nav); publicReply(nav, 'packs'); assert.equal(nav.events[1].owner, B);
  const foreign = interaction({ user: B, customId: gid(A, 'open', 'mix', '1') });
  await handler(foreign); publicReply(foreign, 'error');
  assert.equal((await game.execute('view', A, { view: 'profile' })).p.opened, 0);
});
test('Public : confirmations visibles, propriétaire toujours contrôlé et dépenses appliquées une fois', async () => {
  const { game, handler } = await setup();
  const prepare = interaction({ customId: gid(A, 'paid'), values: ['mix.1'] });
  await handler(prepare); publicReply(prepare, 'confirm');
  const token = prepare.events[1].pending.id;
  const thief = interaction({ user: B, customId: gid(A, 'confirm', token) });
  await handler(thief); publicReply(thief, 'error');
  const confirm = interaction({ customId: gid(A, 'confirm', token) });
  await handler(confirm); publicReply(confirm, 'pull');
  const p = (await game.execute('view', A, { view: 'profile' })).p;
  assert.equal(p.coins, 150); assert.equal(p.opened, 1);
});
test('Public : les fenêtres de formulaire restent natives et leur résultat est publié', async () => {
  const { handler } = await setup();
  const open = interaction({ customId: gid(A, 'customizeAction'), values: ['text'] });
  await handler(open); assert.equal(open.events[0].type, 'modal');
  const submit = interaction({ customId: gid(A, 'submit', 'text'), fields: { getTextInputValue: key => key === 'name' ? 'Nouveau nom' : 'Nouvelle vitrine' }, ephemeral: true });
  await handler(submit); publicReply(submit, 'profile');
  const search = interaction({ customId: gid(A, 'submit', 'search', 'catalog'), fields: { getTextInputValue: () => 'Naruto' } });
  await handler(search); publicReply(search, 'catalog');
});
test('Public : reset visible, mais réservé à l’administrateur qui l’a préparé sur le serveur principal', async () => {
  const { handler, game } = await setup();
  const prepare = interaction({ command: 'admin-reset', target: { id: B }, admin: true });
  await handler(prepare); publicReply(prepare, 'confirm');
  const token = prepare.events[1].pending.id;
  const other = interaction({ user: B, customId: gid(A, 'adminConfirm', token), admin: true });
  await handler(other); publicReply(other, 'error');
  const confirm = interaction({ customId: gid(A, 'adminConfirm', token), admin: true });
  await handler(confirm); publicReply(confirm, 'profile');
  assert.equal(await game.store.transaction(tx => tx.get('gacha_player', B)), null);
});
