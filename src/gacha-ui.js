import { CARDS, RARITIES, SERIES_CARDS, SETTINGS, THEMES, packName } from './gacha-catalog.js';
import { drawGacha } from './gacha-canvas.js';
export const gid = (owner, op, ...args) => {
  const result = ['ga', owner, op, ...args].join(':');
  if (result.length > 100) throw new Error('Discord custom ID exceeds 100 characters');
  return result;
};
const row = (...components) => ({ type: 1, components });
const button = (owner, label, op, args = [], style = 2, disabled = false) => ({ type: 2, style, label, custom_id: gid(owner, op, ...args), disabled });
const select = (owner, op, placeholder, options, args = []) => row({ type: 3, custom_id: gid(owner, op, ...args), placeholder, min_values: 1, max_values: 1, options: options.slice(0, 25).map(o => ({ label: o.label.slice(0, 100), value: o.value, ...(o.description ? { description: o.description.slice(0, 100) } : {}) })) });
const NAV = [['profile', 'Mon profil'], ['packs', 'Ouvrir des boosters'], ['collection', 'Ma collection'], ['albums', 'Albums par manga'], ['market', 'Marché des joueurs'], ['social', 'Amis et échanges'], ['wishlist', 'Mes souhaits'], ['missions', 'Missions et récompenses'], ['leaderboard', 'Classement'], ['catalog', 'Catalogue des personnages'], ['customize', 'Personnaliser mon profil'], ['info', 'Règles et probabilités']];
const nav = () => select('all', 'nav', 'Explorer le Manga Club…', NAV.map(([value, label]) => ({ value, label })));
const cardOptions = cards => cards.map(c => ({ value: c.id, label: `${c.name} · ${RARITIES[c.rarity].name}`, description: `#${c.id}` }));
export function gachaComponents(d, owner) {
  const p = d.p, v = d.view, rows = [];
  if (v === 'profile') {
    if (d.target.id === owner) rows.push(row(button(owner, 'Ouvrir mes boosters', 'nav', ['packs'], 1), button(owner, 'Récompense du jour', 'daily', [], 3), button(owner, 'Personnaliser', 'nav', ['customize'])));
    else rows.push(row(p.friends.includes(d.target.id) ? button(owner, 'Retirer des amis', 'unfriend', [d.target.id]) : button(owner, 'Demander en ami', 'friend', [d.target.id], 3), button(owner, 'Bloquer ce joueur', 'block', [d.target.id], 4)));
  }
  if (v === 'packs' || v === 'pull') {
    const pack = d.pack || 'mix', name = packName(pack, d.now);
    rows.push(row(button(owner, 'Ce booster · 1 gratuit', 'open', [pack, '1'], 1, p.tickets + p.stock < 1), button(owner, 'Ce booster · 5 gratuits', 'open', [pack, '5'], 1, p.tickets + p.stock < 5), ...(pack !== 'daily' ? [button(owner, 'Sélection du jour · gratuit', 'open', ['daily', '1'], 3, p.tickets + p.stock < 1)] : [])));
    rows.push(select(owner, 'packSelect', `Booster choisi : ${name}`.slice(0, 150), [
      { value: 'mix', label: 'Mix multivers · Tous les personnages' }, { value: 'daily', label: `Sélection du jour · ${d.theme.name}` },
      ...[...THEMES].sort((a, b) => SERIES_CARDS.get(b.id).length - SERIES_CARDS.get(a.id).length).slice(0, 20).map(s => ({ value: `s_${s.id}`, label: s.name })),
    ]));
    rows.push(select(owner, 'paid', 'Ouvrir avec mes éclats…', [
      { value: `${pack}.1`, label: `1 booster · 150 éclats · ${name}` },
      { value: `${pack}.5`, label: `5 boosters · 750 éclats · ${name}` },
    ]));
    if (v === 'pull') rows.push(select(owner, 'cardSelect', 'Examiner une carte du tirage…', cardOptions([...new Set(d.pulls.map(c => c.cardId))].map(cid => CARDS.get(cid)))));
  }
  if (['collection', 'catalog', 'album', 'wishlist'].includes(v)) {
    if (d.cards.length) rows.push(select(owner, 'cardSelect', 'Choisir une carte…', cardOptions(d.cards)));
    if (['collection', 'catalog'].includes(v)) rows.push(select(owner, 'filter', 'Filtrer les personnages…', [
      { label: 'Toutes les raretés', value: 'all' },
      ...(v === 'collection' ? [{ label: 'Mes doublons', value: 'duplicates' }, { label: 'Mes favoris', value: 'favorites' }] : []),
      ...RARITIES.map((r, i) => ({ label: r.name, value: String(i) })),
    ], [v, d.searchToken ?? '']));
    const actions = [];
    if (v === 'collection') actions.push(button(owner, 'Recycler les doublons C/U/R', 'duplicates', [], 4));
    if (v === 'collection' || v === 'catalog') actions.push(button(owner, 'Rechercher', 'searchForm', [v]));
    if (v === 'album') {
      const cards = SERIES_CARDS.get(d.series.id);
      actions.push(button(owner, 'Récompense de l’album', 'claimAlbum', [d.series.id], 3, cards.length < 6 || !cards.every(c => p.discovered[c.id]) || p.albums.includes(d.series.id)));
      if (cards.length >= 6) actions.push(button(owner, 'Booster de cet univers', 'universePack', [d.series.id], 1));
    }
    if (actions.length) rows.push(row(...actions));
  }
  if (v === 'albums') {
    if (d.series.length) rows.push(select(owner, 'albumSelect', 'Ouvrir un album…', d.series.map(s => ({ value: s.id, label: s.name }))));
    rows.push(row(button(owner, 'Rechercher un manga', 'searchForm', ['albums'])));
  }
  if (v === 'card') {
    const c = d.card, has = Boolean(p.collection[c.id]);
    rows.push(select(owner, 'cardAction', 'Que faire de cette carte ?', [
      ...(has ? [{ label: p.favorites.includes(c.id) ? 'Retirer des favoris' : 'Ajouter aux favoris', value: 'favorite' }, { label: 'Vendre au marché', value: 'listForm' }, { label: 'Proposer un échange', value: 'tradeForm' }, { label: 'Recycler contre des éclats', value: 'recycleForm' }] : []),
      { label: p.wishlist.includes(c.id) ? 'Retirer de mes souhaits' : 'Ajouter à mes souhaits', value: 'wish' },
      { label: 'Voir son album', value: 'album' },
    ], [c.id]));
    if (p.discovered[c.id]) rows.push(row({ type: 2, style: 5, label: 'Fiche du personnage', url: c.source }));
  }
  if (v === 'market') {
    if (d.listings.length) rows.push(select(owner, 'listingSelect', 'Consulter une annonce…', d.listings.map(l => ({ value: l.id, label: `${CARDS.get(l.cardId).name} ×${l.quantity} · ${l.price * l.quantity} éclats` }))));
    rows.push(select(owner, 'marketFilter', 'Parcourir le marché…', [{ value: 'all', label: 'Toutes les annonces' }, { value: 'mine', label: 'Mes ventes et annulations' }, { value: 'wishes', label: 'Mes personnages recherchés' }]));
    rows.push(row(button(owner, 'Rechercher', 'searchForm', ['market']), button(owner, 'Vendre depuis ma collection', 'nav', ['collection'])));
  }
  if (v === 'listing') rows.push(row(d.listing.sellerId === owner ? button(owner, 'Annuler cette vente', 'cancelListing', [d.listing.id], 4) : button(owner, `Acheter · ${d.listing.price * d.listing.quantity} éclats`, 'buy', [d.listing.id], 3)));
  if (v === 'social') {
    rows.push(row({ type: 5, custom_id: gid(owner, 'personSelect'), placeholder: 'Consulter un joueur Discord…', min_values: 1, max_values: 1 }));
    if (d.trades.length || d.requests.length) rows.push(select(owner, 'inbox', 'Mes propositions et demandes…', [
      ...d.requests.map(r => ({ value: `friend.${r.id}`, label: `Demande d’ami · ${d.names[r.from] || r.from}` })),
      ...d.trades.map(t => ({ value: `trade.${t.id}`, label: `${t.to === owner ? 'Reçue' : 'Envoyée'} · ${CARDS.get(t.offer).name} ↔ ${CARDS.get(t.wanted).name}` })),
    ]));
    if (p.blocked.length) rows.push(select(owner, 'unblock', 'Débloquer un joueur…', p.blocked.slice(0, 25).map(id => ({ value: id, label: `Débloquer ${id}` }))));
  }
  if (v === 'friendRequest') rows.push(row(button(owner, 'Accepter', 'friendRespond', [d.requestId, 'yes'], 3), button(owner, 'Refuser', 'friendRespond', [d.requestId, 'no'], 4)));
  if (v === 'tradePartner') rows.push(row({ type: 5, custom_id: gid(owner, 'tradeTarget', d.card.id), placeholder: 'À qui proposer cet échange ?', min_values: 1, max_values: 1 }));
  if (v === 'tradeChoose') {
    if (d.cards.length) rows.push(select(owner, 'tradeWant', 'Quelle carte souhaites-tu recevoir ?', cardOptions(d.cards), [d.cardId, d.target.id]));
    rows.push(row(button(owner, 'Retour à ma collection', 'nav', ['collection'])));
    if (d.pages > 1) rows.push(row(button(owner, '← Page précédente', 'tradePage', [d.cardId, d.target.id, String(d.page - 1)], 2, d.page <= 0), button(owner, 'Page suivante →', 'tradePage', [d.cardId, d.target.id, String(d.page + 1)], 2, d.page + 1 >= d.pages)));
  }
  if (v === 'trade' && d.trade.status === 'pending') rows.push(row(
    ...(d.trade.to === owner ? [button(owner, 'Accepter cet échange', 'tradeAccept', [d.trade.id], 3)] : []),
    button(owner, d.trade.to === owner ? 'Refuser' : 'Annuler ma proposition', 'tradeReject', [d.trade.id], 4),
  ));
  if (v === 'missions') {
    const ready = [...d.dailyTasks, ...d.objectives].filter(o => !o.claimed && o.value >= o.goal);
    if (ready.length) rows.push(select(owner, 'claim', 'Récupérer une récompense…', ready.map(o => ({ value: o.id, label: `${o.name || o.text} · ${o.coins} éclats` }))));
  }
  if (v === 'customize') rows.push(select(owner, 'customizeAction', 'Personnaliser ma vitrine…', [
    { value: 'text', label: 'Changer mon nom et ma description' }, { value: 'portrait', label: 'Importer un portrait' }, { value: 'banner', label: 'Importer une bannière' },
    { value: 'clearPortrait', label: 'Retirer mon portrait personnalisé' }, { value: 'clearBanner', label: 'Retirer ma bannière personnalisée' },
  ]));
  if (v === 'confirm') rows.push(row(button(owner, 'Confirmer', d.admin ? 'adminConfirm' : 'confirm', [d.pending.id], 3), button(owner, 'Annuler', 'nav', ['profile'])));
  if (d.pages > 1 && v !== 'tradeChoose') rows.push(row(button(owner, '← Page précédente', 'page', [v, String(d.page - 1), d.filter ?? '', d.seriesId ?? '', d.searchToken ?? ''], 2, d.page <= 0), button(owner, 'Page suivante →', 'page', [v, String(d.page + 1), d.filter ?? '', d.seriesId ?? '', d.searchToken ?? ''], 2, d.page + 1 >= d.pages)));
  rows.push(nav());
  if (rows.length > 5) throw new Error(`Too many Discord rows for ${v}: ${rows.length}`);
  return rows;
}
export async function renderGacha(data, owner) {
  const canvas = await drawGacha(data);
  const mention = /^\d{17,20}$/.test(owner) ? `<@${owner}>` : data.p?.name ?? 'Collectionneur';
  const description = [`Manga Club — ${data.view}`, data.message, ...(data.cards ?? []).map(c => `${c.name} : ${RARITIES[c.rarity].name}`), ...(data.pulls ?? []).map(c => CARDS.get(c.cardId).name)].filter(Boolean).join('. ').slice(0, 1024);
  const context = data.view === 'trade' ? ` · Échange entre <@${data.trade.from}> et <@${data.trade.to}>` : data.view === 'profile' && data.target.id !== owner ? ` · Profil de <@${data.target.id}>` : data.view === 'listing' ? ` · Annonce de <@${data.listing.sellerId}>` : '';
  return { content: mention + context, allowedMentions: { parse: [], users: /^\d{17,20}$/.test(owner) ? [owner] : [], repliedUser: false }, files: [{ attachment: canvas.buffer, name: 'manga-club.png', description }], attachments: [], components: gachaComponents(data, owner) };
}
