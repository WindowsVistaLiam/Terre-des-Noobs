import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { GachaError } from './gacha-game.js';
import { CARDS, SETTINGS } from './gacha-catalog.js';
import { gid, renderGacha } from './gacha-ui.js';
import { importAttachment } from './profile-media.js';
import { prepareGachaReset, confirmGachaReset } from './gacha-admin.js';
export const gachaCommands = [
  new SlashCommandBuilder().setName('profil').setDescription('Ta vitrine de collectionneur ou celle d’un ami').addUserOption(o => o.setName('joueur').setDescription('Consulter ce collectionneur')),
  new SlashCommandBuilder().setName('gacha').setDescription('Ouvrir des boosters et découvrir des personnages de manga'),
  new SlashCommandBuilder().setName('collection').setDescription('Tes cartes, doublons, favoris et albums'),
  new SlashCommandBuilder().setName('marché').setDescription('Acheter et vendre des cartes entre joueurs'),
  new SlashCommandBuilder().setName('social').setDescription('Amis, propositions d’échange et collectionneurs'),
  new SlashCommandBuilder().setName('info').setDescription('Guide, taux de tirage, garanties et catalogue'),
  new SlashCommandBuilder().setName('admin-reset').setDescription('Réinitialiser une collection après confirmation (serveur principal)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addUserOption(o => o.setName('joueur').setDescription('Collectionneur à réinitialiser').setRequired(true)),
].map(c => ({ ...c.toJSON(), dm_permission: false }));
const VIEWS = new Set(['profile', 'packs', 'collection', 'albums', 'market', 'social', 'wishlist', 'missions', 'leaderboard', 'catalog', 'customize', 'info', 'album']);
const field = (key, label, { paragraph = false, value, max = 80, required = true } = {}) => ({ type: 1, components: [{ type: 4, custom_id: key, label, style: paragraph ? 2 : 1, max_length: max, required, ...(value ? { value: value.slice(0, max) } : {}) }] });
export function gachaModal(owner, kind, arg, p) {
  const modal = { custom_id: gid(owner, 'submit', kind, arg ?? ''), title: 'Manga Club', components: [] };
  if (kind === 'text') { modal.title = 'Mon profil de collectionneur'; modal.components = [field('name', 'Ton nom', { max: 32, value: p?.name }), field('bio', 'Ta description', { paragraph: true, max: 300, value: p?.bio, required: false })]; }
  else if (kind === 'image') {
    modal.title = arg === 'portrait' ? 'Importer mon portrait' : 'Importer ma bannière';
    modal.components = [{ type: 18, label: 'Image PNG, JPG ou WebP', description: 'Image fixe, 5 Mo maximum.', component: { type: 19, custom_id: 'image', min_values: 1, max_values: 1, required: true } }];
  } else if (kind === 'search') { modal.title = 'Trouver un personnage ou un manga'; modal.components = [field('query', 'Nom à rechercher', { max: 80 })]; }
  else if (kind === 'list') { modal.title = 'Mettre une carte en vente'; modal.components = [field('quantity', 'Nombre de copies', { max: 3, value: '1' }), field('price', 'Prix par carte, en éclats', { max: 7 })]; }
  else if (kind === 'recycle') { modal.title = 'Recycler une carte'; modal.components = [field('quantity', 'Nombre de copies à recycler', { max: 3, value: '1' })]; }
  else if (kind === 'trade') {
    modal.title = 'Proposer un échange';
    modal.components = [field('targetId', 'Identifiant Discord du destinataire', { max: 20 }), field('quantity', 'Copies de ta carte offertes', { max: 3, value: '1' }), field('wanted', 'Identifiant carte souhaitée (ex. al1234)', { max: 20 }), field('wantedQty', 'Copies demandées', { max: 3, value: '1' })];
  } else throw new GachaError('Formulaire inconnu.');
  return modal;
}
export function parseGachaRoute(interaction) {
  const owner = interaction.user.id;
  if (interaction.isChatInputCommand?.()) {
    const commandViews = { profil: 'profile', gacha: 'packs', collection: 'collection', marché: 'market', social: 'social', info: 'info' };
    if (interaction.commandName === 'admin-reset') return { admin: 'prepare', targetId: interaction.options.getUser('joueur', true).id };
    const view = commandViews[interaction.commandName];
    if (!view) throw new GachaError('Le bot est devenu un gacha. Ouvre /profil pour retrouver les nouveaux menus.');
    const target = view === 'profile' ? interaction.options?.getUser?.('joueur') : null;
    return { action: 'view', args: { view, ...(target ? { targetId: target.id } : {}), ...(view === 'profile' && !target ? { name: interaction.user.globalName || interaction.user.username } : {}) }, public: true };
  }
  const parts = String(interaction.customId ?? '').split(':');
  if (parts[0] !== 'ga') throw new GachaError('Ce panneau appartient à l’ancien RPG. Ouvre /profil pour découvrir le gacha.');
  const [, bound, op, a, b, c, e, f] = parts;
  if (bound !== owner && !(bound === 'all' && op === 'nav')) throw new GachaError('Ce contrôle appartient à un autre joueur. Ouvre tes propres menus avec /profil.');
  const val = interaction.values?.[0];
  const view = (v, extra = {}) => { if (!VIEWS.has(v)) throw new GachaError('Menu inconnu.'); return { action: 'view', args: { view: v, ...extra } }; };
  const prepare = (operation, values) => ({ action: 'prepare', args: { operation, values } });
  const modal = (kind, arg) => ({ form: kind, arg });
  switch (op) {
    case 'nav': return view(a || val);
    case 'page': return view(a, { page: Number(b), filter: c || undefined, seriesId: e || undefined, searchToken: f || undefined });
    case 'cardSelect': return { action: 'view', args: { view: 'card', cardId: val } };
    case 'albumSelect': return view('album', { seriesId: val });
    case 'filter': return view(a, { filter: val, searchToken: b || undefined });
    case 'marketFilter': return view('market', { filter: val });
    case 'personSelect': return view('profile', { targetId: val });
    case 'listingSelect': return { action: 'view', args: { view: 'listing', listingId: val } };
    case 'open': return { action: 'open', args: { pack: a, count: Number(b) }, public: true };
    case 'packSelect': return view('packs', { pack: val });
    case 'universePack': return view('packs', { pack: `s_${a}` });
    case 'daily': return { action: 'daily', args: {} };
    case 'paid': { const [pack, count] = String(val).split('.'); return prepare('buyPack', { pack, count: Number(count) }); }
    case 'duplicates': return prepare('recycleDuplicates', {});
    case 'buy': case 'cancelListing': return prepare(op, { listingId: a });
    case 'confirm': return { action: 'confirm', args: { token: a } };
    case 'adminConfirm': return { admin: 'confirm', token: a };
    case 'searchForm': return modal('search', a);
    case 'cardAction': {
      if (!CARDS.has(a)) throw new GachaError('Carte inconnue.');
      if (val === 'album') return view('album', { seriesId: CARDS.get(a).seriesId });
      if (['favorite', 'wish'].includes(val)) return { action: val, args: { cardId: a } };
      if (val === 'tradeForm') return { action: 'view', args: { view: 'tradePartner', cardId: a } };
      const forms = { listForm: 'list', recycleForm: 'recycle' };
      if (!Object.hasOwn(forms, val)) throw new GachaError('Action inconnue.');
      return modal(forms[val], a);
    }
    case 'customizeAction': {
      if (val === 'text') return modal('text');
      if (['portrait', 'banner'].includes(val)) return modal('image', val);
      if (['clearPortrait', 'clearBanner'].includes(val)) return { action: 'clearMedia', args: { slot: val === 'clearPortrait' ? 'portrait' : 'banner' } };
      break;
    }
    case 'tradeAccept': case 'tradeReject': return prepare('tradeRespond', { tradeId: a, accept: op === 'tradeAccept' });
    case 'tradeTarget': return { action: 'view', args: { view: 'tradeChoose', cardId: a, targetId: val } };
    case 'tradeWant': return prepare('trade', { cardId: a, targetId: b, wanted: val, quantity: 1, wantedQty: 1 });
    case 'tradePage': return { action: 'view', args: { view: 'tradeChoose', cardId: a, targetId: b, page: Number(c) } };
    case 'inbox': {
      const [kind, ...rest] = String(val).split('.');
      if (kind === 'trade') return { action: 'view', args: { view: 'trade', tradeId: rest.join('.') } };
      if (kind === 'friend') return { action: 'view', args: { view: 'friendRequest', requestId: rest.join('.') } };
      break;
    }
    case 'friend': return { action: 'friendRequest', args: { targetId: a } };
    case 'unfriend': return { action: 'unfriend', args: { targetId: a } };
    case 'block': case 'unblock': return { action: 'block', args: { targetId: a || val } };
    case 'friendRespond': return { action: 'friendRespond', args: { requestId: a, accept: b === 'yes' } };
    case 'claim': return { action: 'claim', args: { objective: val } };
    case 'claimAlbum': return { action: 'claimAlbum', args: { seriesId: a } };
    case 'submit': {
      if (!interaction.isModalSubmit?.()) throw new GachaError('Formulaire attendu.');
      const text = key => interaction.fields.getTextInputValue(key).trim();
      const number = key => /^\d+$/.test(text(key)) ? Number(text(key)) : NaN;
      if (a === 'text') return { action: 'customize', args: { name: text('name'), bio: text('bio') } };
      if (a === 'image') return { upload: true, slot: b, attachment: interaction.fields.getUploadedFiles('image', true)?.values().next().value };
      if (a === 'search') return { action: 'search', args: { view: b, query: text('query') } };
      if (a === 'list') return prepare('list', { cardId: b, quantity: number('quantity'), price: number('price') });
      if (a === 'recycle') return prepare('recycle', { cardId: b, quantity: number('quantity') });
      if (a === 'trade') return prepare('trade', { cardId: b, quantity: number('quantity'), targetId: text('targetId'), wanted: text('wanted'), wantedQty: number('wantedQty') });
      break;
    }
  }
  throw new GachaError('Ce contrôle n’est plus disponible. Ouvre /profil.');
}
export function createGachaHandler(game, { adminGuildId, paint = renderGacha, cooldownMs = 500 } = {}) {
  const busy = new Set(), cooldowns = new Map();
  return async interaction => {
    if (!interaction.isChatInputCommand?.() && !interaction.isButton?.() && !interaction.isStringSelectMenu?.() && !interaction.isUserSelectMenu?.() && !interaction.isModalSubmit?.()) return;
    const owner = interaction.user.id;
    let acquired = false;
    try {
      if (!interaction.guildId) throw new GachaError('Ouvre le Manga Club depuis un serveur Discord.');
      const route = parseGachaRoute(interaction);
      if (route.admin && !(adminGuildId && interaction.guildId === adminGuildId && interaction.memberPermissions?.has(PermissionFlagsBits.Administrator))) throw new GachaError('Commande réservée aux administrateurs du serveur principal.');
      if (busy.has(owner) || (cooldowns.get(owner) ?? 0) > Date.now() - cooldownMs) throw new GachaError('Ton action précédente se termine. Réessaie dans un instant.');
      busy.add(owner); acquired = true;
      if (route.form) {
        // Keep the modal response inside Discord’s deadline; only the profile form needs a read.
        const data = route.form === 'text' ? await game.execute('view', owner, { view: 'profile' }) : null;
        await interaction.showModal(gachaModal(owner, route.form, route.arg, data?.p)); return;
      }
      // Every interaction gets its own public reply: previous pulls stay visible,
      // and a visitor never edits another collector's shared message.
      await interaction.deferReply({ flags: 0 });
      let result;
      if (route.upload) {
        if (!['portrait', 'banner'].includes(route.slot)) throw new GachaError('Emplacement inconnu.');
        const media = await importAttachment(route.attachment, route.slot);
        result = await game.execute('media', owner, { slot: route.slot, media }, interaction.id);
      } else if (route.admin) {
        const reset = route.admin === 'prepare' ? await prepareGachaReset(game, owner, route.targetId, interaction.guildId) : await confirmGachaReset(game, owner, route.token, interaction.guildId);
        result = await game.execute('view', owner, { view: 'profile' });
        if (route.admin === 'prepare') result = { ...result, view: 'confirm', pending: reset, admin: true };
        else result.message = 'Collection réinitialisée. Le joueur peut repartir avec /profil.';
      } else result = await game.execute(route.action, owner, route.args, interaction.id);
      const payload = await paint(result, owner);
      await interaction.editReply(payload);
      cooldowns.set(owner, Date.now());
      if (cooldowns.size > 2000) for (const [id, time] of cooldowns) if (time < Date.now() - 60000) cooldowns.delete(id);
    } catch (error) {
      const expected = error instanceof GachaError;
      if (!expected) console.error('Gacha interaction:', { name: error.name, code: error.code, message: error.message });
      const message = expected ? error.message : 'Cette action a rencontré un problème. Réessaie depuis /profil.';
      try {
        // Error rendering must not depend on another successful database query.
        let context = {};
        if (expected) { try { context = await game.execute('view', owner, { view: 'profile' }); } catch {} }
        const data = { ...context, view: 'error', message, appearance: context.appearance ?? {}, now: Date.now() };
        const payload = await paint(data, owner);
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(payload);
        } else { await interaction.deferReply({ flags: 0 }); await interaction.editReply(payload); }
      } catch (failure) { console.error('Gacha response unavailable:', failure.code ?? failure.name); }
    } finally { if (acquired) busy.delete(owner); }
  };
}
