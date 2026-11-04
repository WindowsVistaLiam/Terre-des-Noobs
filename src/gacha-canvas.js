import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';
import { CARDS, SERIES, SERIES_CARDS, CATALOG, RARITIES, SETTINGS, normalizedRates, poolFor, packName } from './gacha-catalog.js';
import { rarePull } from './gacha-animation.js';
GlobalFonts.registerFromPath(fileURLToPath(new URL('./assets/fonts/Lato-Regular.ttf', import.meta.url)), 'Gacha');
const cache = new Map();
const W = 1280, M = 48;
const C = { bg: '#0c0e18', paper: '#f3f2fb', muted: '#9c9db6', panel: '#15192a', line: '#30344e', gold: '#ffd260' };
async function art(card) {
  if (!card?.art) return null;
  const key = card.art.atlas;
  if (!cache.has(key)) {
    cache.set(key, loadImage(fileURLToPath(new URL(`./assets/gacha/atlas-${key}.webp`, import.meta.url))).catch(() => null));
    while (cache.size > 12) cache.delete(cache.keys().next().value);
  }
  const image = await cache.get(key);
  return image ? { image, sx: card.art.index % 10 * 160, sy: Math.floor(card.art.index / 10) * 220, sw: 160, sh: 220 } : null;
}
function rounded(ctx, x, y, w, h, fill, stroke, radius = 16) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, radius);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
}
function lines(ctx, text, width, size) {
  ctx.font = `${size}px Gacha`;
  const output = [];
  for (const paragraph of String(text ?? '').split('\n')) {
    let current = '';
    for (const word of paragraph.split(/\s+/)) {
      if (ctx.measureText(`${current} ${word}`).width > width && current) { output.push(current); current = word; }
      else current = current ? `${current} ${word}` : word;
      while (ctx.measureText(current).width > width) {
        let cut = current.length - 1;
        while (cut > 1 && ctx.measureText(current.slice(0, cut)).width > width) cut--;
        output.push(current.slice(0, cut)); current = current.slice(cut);
      }
    }
    output.push(current);
  }
  return output;
}
function txt(ctx, text, x, y, width, size = 22, color = C.paper, max = 10) {
  const all = lines(ctx, text, width, size), visible = all.slice(0, max);
  if (all.length > max) { let end = visible.at(-1); while (ctx.measureText(`${end}…`).width > width) end = end.slice(0, -1); visible[visible.length - 1] = `${end}…`; }
  ctx.fillStyle = color; ctx.font = `${size}px Gacha`; ctx.textBaseline = 'top';
  visible.forEach((line, i) => ctx.fillText(line, x, y + i * size * 1.3));
  return visible.length * size * 1.3;
}
function pill(ctx, text, x, y, color = C.gold, width = 170) { rounded(ctx, x, y, width, 34, '#111523ee', `${color}99`, 17); txt(ctx, text, x + 13, y + 7, width - 24, 15, color, 1); }
function panel(ctx, title, text, x, y, w, h, color = C.gold) {
  rounded(ctx, x, y, w, h, C.panel, C.line);
  const titleHeight = txt(ctx, title, x + 22, y + 20, w - 44, 23, color, 2);
  const offset = 20 + titleHeight + 14;
  txt(ctx, text, x + 22, y + offset, w - 44, 20, C.paper, Math.max(1, Math.floor((h - offset - 12) / 26)));
}
async function drawCard(ctx, card, x, y, w, h, { quantity, fresh, dim = false } = {}) {
  const rarity = RARITIES[card.rarity];
  rounded(ctx, x, y, w, h, '#171b2a', rarity.color, 16);
  const image = await art(card), pictureY = y + 57, pictureH = h - 153;
  ctx.save(); ctx.beginPath(); ctx.roundRect(x + 10, pictureY, w - 20, pictureH, 10); ctx.clip();
  if (image) {
    const scale = Math.max((w - 20) / image.sw, pictureH / image.sh);
    ctx.drawImage(image.image, image.sx, image.sy, image.sw, image.sh, x + w / 2 - image.sw * scale / 2, pictureY + pictureH / 2 - image.sh * scale / 2, image.sw * scale, image.sh * scale);
  } else { ctx.fillStyle = '#292d48'; ctx.fillRect(x + 10, pictureY, w - 20, pictureH); txt(ctx, card.name.split(' ').map(s => s[0]).slice(0, 2).join(''), x + 30, pictureY + 45, w - 60, 60, rarity.color); }
  if (dim) { ctx.fillStyle = '#0c0e1888'; ctx.fillRect(x + 10, pictureY, w - 20, pictureH); }
  ctx.restore();
  txt(ctx, card.name, x + 14, y + 14, w - 59, 18, C.paper, 2);
  rounded(ctx, x + w - 38, y + 15, 25, 25, rarity.color, null, 13); txt(ctx, rarity.short, x + w - 31, y + 19, 20, 15, C.bg, 1);
  txt(ctx, SERIES.get(card.seriesId)?.name, x + 14, y + h - 88, w - 28, 15, C.muted, 2);
  txt(ctx, `POW ${card.power}     AURA ${card.aura}`, x + 14, y + h - 45, w - 28, 15, rarity.color, 1);
  txt(ctx, `#${card.id}`, x + 14, y + h - 24, w - 28, 12, C.muted, 1);
  if (fresh) pill(ctx, 'NOUVEAU', x + 12, pictureY + 9, '#47d6a1', 105);
  if (quantity !== undefined) pill(ctx, quantity ? `×${quantity} en collection` : 'À découvrir', x + 12, pictureY + pictureH - 40, quantity ? rarity.color : C.muted, Math.min(170, w - 24));
}
async function picture(ctx, media, x, y, w, h, circle = false) {
  if (!media?.data || media.mime !== 'image/webp') return false;
  try {
    const image = await loadImage(Buffer.from(media.data, 'base64'));
    ctx.save(); ctx.beginPath(); if (circle) ctx.arc(x + w / 2, y + h / 2, w / 2, 0, Math.PI * 2); else ctx.roundRect(x, y, w, h, 16); ctx.clip();
    const scale = Math.max(w / image.width, h / image.height);
    ctx.drawImage(image, x + (w - image.width * scale) / 2, y + (h - image.height * scale) / 2, image.width * scale, image.height * scale); ctx.restore(); return true;
  } catch { return false; }
}
const TITLES = { profile: 'Ton monde en cartes', packs: 'La salle des boosters', pull: 'Le destin a choisi', collection: 'Ta collection', catalog: 'Le grand catalogue', albums: 'Les univers', album: 'Album de collection', wishlist: 'Tes personnages recherchés', card: 'Une carte, une histoire', market: 'Le marché des collectionneurs', listing: 'Une nouvelle pièce de collection', social: 'Collectionner ensemble', trade: 'Échange entre collectionneurs', missions: 'Le carnet des défis', leaderboard: 'Le cercle des collectionneurs', info: 'Le guide du gacha', confirm: 'Avant de confirmer', customize: 'Ton identité de collectionneur', error: 'Un petit contretemps' };
export async function drawGacha(data) {
  const celebration = rarePull(data);
  const v = data.view, p = data.p, accent = celebration?.color ?? (['market', 'listing'].includes(v) ? '#47d6a1' : ['social', 'trade'].includes(v) ? '#b68cff' : ['catalog', 'info', 'albums', 'album'].includes(v) ? '#62aaff' : C.gold);
  let h = 940;
  if (v === 'profile') h = data.appearance?.banner ? 1240 : 1050;
  if (['collection', 'catalog', 'album', 'wishlist', 'market', 'tradeChoose'].includes(v)) h = 1110;
  if (v === 'pull') h = 750 + Math.floor((data.pulls.length - 1) / 5) * 370;
  if (['social', 'albums', 'missions'].includes(v)) h = 1100;
  if (v === 'leaderboard') h = 1150;
  if (v === 'trade') h = 1010;
  const canvas = createCanvas(W, h), ctx = canvas.getContext('2d');
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, h);
  const glow = ctx.createRadialGradient(1030, 80, 0, 1030, 80, 950); glow.addColorStop(0, `${accent}25`); glow.addColorStop(1, `${accent}00`); ctx.fillStyle = glow; ctx.fillRect(0, 0, W, h);
  ctx.strokeStyle = `${accent}0f`; ctx.lineWidth = 1;
  for (let i = -3; i < 10; i++) { ctx.beginPath(); ctx.moveTo(i * 190, 0); ctx.lineTo(i * 190 + 400, h); ctx.stroke(); }
  for (let i = 0; i < 65; i++) { ctx.fillStyle = `${accent}${i % 3 ? '25' : '70'}`; ctx.fillRect((i * 197 + 13) % W, (i * 353 + 23) % h, 2, 2); }
  txt(ctx, 'TERRE DES NOOBS  /  MANGA CLUB', M, 31, 900, 16, accent, 1);
  txt(ctx, celebration?.title ?? TITLES[v] ?? TITLES.profile, M, 70, 1050, 42, celebration?.color ?? C.paper, 2);
  const person = v === 'profile' ? data.target : p;
  const portrait = await picture(ctx, data.appearance?.portrait, 1132, 45, 94, 94, true);
  if (!portrait) {
    const favorite = CARDS.get(person?.favorites?.[0]), image = await art(favorite);
    ctx.save(); ctx.beginPath(); ctx.arc(1179, 92, 47, 0, Math.PI * 2); ctx.clip();
    if (image) ctx.drawImage(image.image, image.sx, image.sy, image.sw, image.sh, 1132, 28, 94, 129);
    else { ctx.fillStyle = `${accent}25`; ctx.fillRect(1132, 45, 94, 94); txt(ctx, (person?.name || 'M').slice(0, 1).toUpperCase(), 1157, 66, 55, 42, accent, 1); }
    ctx.restore();
  }
  if (p) txt(ctx, v === 'profile' && data.target.id !== p.id ? `La vitrine de ${data.target.name}` : `${p.coins.toLocaleString('fr-FR')} éclats   •   ${p.tickets}/${SETTINGS.freeCap} gratuits   •   ${p.stock} en réserve`, M, 134, 1050, 19, C.muted, 1);
  let y = 195;
  if (data.message) { rounded(ctx, M, y, W - M * 2, 62, `${accent}12`, `${accent}44`, 12); txt(ctx, data.message, M + 18, y + 13, W - M * 2 - 36, 19, accent, 2); y += 80; }
  if (v === 'profile') {
    const t = data.target, own = t.id === p.id;
    if (data.appearance?.banner) { await picture(ctx, data.appearance.banner, M, y, W - M * 2, 165); y += 185; }
    txt(ctx, t.name, M, y, 1100, 36, accent, 1); y += 52;
    txt(ctx, t.bio || 'Un nouveau collectionneur rejoint le Manga Club.', M, y, W - M * 2, 21, C.muted, 3); y += 100;
    const unique = Object.keys(t.discovered).length, owned = Object.values(t.collection).reduce((a, b) => a + b, 0);
    [['Personnages découverts', `${unique} / ${CARDS.size}`], ['Cartes en collection', String(owned)], ['Boosters ouverts', String(t.opened)], ['Échanges réussis', String(t.trades)]].forEach(([title, text], i) => {
      const x = M + i * 300; rounded(ctx, x, y, 284, 112, C.panel, C.line);
      txt(ctx, title, x + 20, y + 18, 244, 18, accent, 2); txt(ctx, text, x + 20, y + 66, 244, 26, C.paper, 1);
    }); y += 138;
    const fav = t.favorites.map(cid => CARDS.get(cid)).filter(Boolean).slice(0, 4);
    if (fav.length) { txt(ctx, 'LES FAVORIS DE LA VITRINE', M, y, 1000, 18, C.muted); y += 35; for (const [i, c] of fav.entries()) await drawCard(ctx, c, M + i * 300, y, 242, Math.min(330, h - y - 85)); }
    else panel(ctx, own ? 'Bienvenue dans ta nouvelle collection' : 'Une vitrine à remplir', own ? 'Ouvre tes premiers boosters, choisis tes personnages favoris et complète tes albums.\n5 boosters de bienvenue t’attendent en réserve.' : 'Ce joueur n’a pas encore choisi de favoris.', M, y, W - M * 2, 180, accent);
  } else if (v === 'packs') {
    const selected = data.pack || 'mix', selectedPool = poolFor(selected, data.now);
    const rates = normalizedRates(selectedPool).map((n, i) => `${RARITIES[i].short} ${n.toFixed(1)} %`).join(' · ');
    panel(ctx, packName(selected, data.now).toUpperCase(), `${selectedPool.length.toLocaleString('fr-FR')} personnages · 5 cartes par booster\nUne rare ou mieux garantie. Gratuit ou 150 éclats.\nTaux hors garanties : ${rates}\nChange de booster dans la liste ou depuis un album.`, M, y, 580, 245, C.gold);
    panel(ctx, 'LA SÉLECTION DU JOUR', `${data.theme.name}\n5 cartes de cet univers. Renouvellement à minuit UTC.\nUn rang absent profite aux communes.\nMythique : 0,1 % • Légendaire : 0,9 % par carte.`, 652, y, 580, 245, '#62aaff'); y += 272;
    const next = p.tickets < SETTINGS.freeCap ? `${Math.max(1, Math.ceil((p.ticketAt + SETTINGS.freeMs - data.now) / 60000))} min` : 'Réserve rechargeable pleine';
    panel(ctx, 'LES BOOSTERS GRATUITS', `${p.tickets}/${SETTINGS.freeCap} rechargeables • +1 toutes les 10 minutes\nProchaine recharge : ${next}\n${p.stock} boosters offerts en réserve, sans limite de temps.`, M, y, 580, 230);
    panel(ctx, 'LE DESTIN FINIT PAR SOURIRE', `Épique ou mieux : dans ${SETTINGS.epicPity - p.pityEpic} booster(s) maximum.\nLégendaire ou mieux : dans ${SETTINGS.legendaryPity - p.pityLegendary} maximum.\nMythique : dans ${SETTINGS.mythicPity - p.pityMythic} maximum.\nCompteurs partagés entre tous les boosters.`, 652, y, 580, 230, '#b68cff');
  } else if (v === 'pull') {
    for (const [i, pull] of data.pulls.entries()) await drawCard(ctx, CARDS.get(pull.cardId), M + i % 5 * 241, y + Math.floor(i / 5) * 370, 220, 345, { fresh: pull.fresh });
  } else if (['collection', 'catalog', 'wishlist', 'album', 'tradeChoose'].includes(v)) {
    const heading = v === 'album' ? `${data.series.name} · ${SERIES_CARDS.get(data.series.id).filter(c => p.discovered[c.id]).length}/${SERIES_CARDS.get(data.series.id).length} découvertes` : v === 'tradeChoose' ? `Tu offres ${CARDS.get(data.cardId).name} · Choisis une carte de ${data.target.name}` : `${data.total} personnage(s)${data.query ? ` · Recherche : ${data.query}` : ''}`;
    txt(ctx, heading, M, y, W - M * 2, 23, accent, 2); y += 70;
    if (!data.cards.length) panel(ctx, 'Une page encore blanche', 'Ouvre des boosters ou change tes filtres pour retrouver des personnages. Tu peux rechercher un nom de personnage ou de manga.', M, y, W - M * 2, 190, accent);
    for (const [i, c] of data.cards.entries()) await drawCard(ctx, c, M + i % 4 * 300, y + Math.floor(i / 4) * 360, 284, 340, { quantity: (v === 'tradeChoose' ? data.target : p).collection[c.id] ?? 0, dim: v !== 'tradeChoose' && !p.discovered[c.id] });
  } else if (v === 'card' || v === 'listing') {
    const c = v === 'card' ? data.card : CARDS.get(data.listing.cardId), r = RARITIES[c.rarity];
    await drawCard(ctx, c, M + 20, y, 350, 530, { quantity: p.collection[c.id] ?? 0 });
    panel(ctx, r.name.toUpperCase(), `${c.name}\n${SERIES.get(c.seriesId).name}\nNuméro de collection : ${c.id}\nPuissance : ${c.power} • Aura : ${c.aura}\nDécouvre tes héros et complète leur univers.`, 468, y, 764, 260, r.color);
    if (v === 'card') panel(ctx, 'VENDRE, ÉCHANGER OU GARDER', `Recyclage : ${r.recycle} éclats par copie.\n${p.favorites.includes(c.id) ? 'Favorite : ta dernière copie est protégée.' : 'Ajoute-la aux favoris pour protéger ta dernière copie.'}\n${p.wishlist.includes(c.id) ? 'Ce personnage est dans ta liste de souhaits.' : 'Ajoute-la à tes souhaits pour la retrouver au marché.'}`, 468, y + 286, 764, 240, accent);
    else { const l = data.listing; panel(ctx, 'UNE ANNONCE ENTRE JOUEURS', `${l.quantity} carte(s) • ${l.price} éclats par carte\nLot complet : ${l.quantity * l.price} éclats\nFin : ${new Date(l.expiresAt).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}\nCommission vendeur : 5 %. Achat du lot entier.`, 468, y + 286, 764, 240, '#47d6a1'); }
  } else if (v === 'market') {
    txt(ctx, `${data.total} annonce(s) · ${data.filter === 'mine' ? 'Mes ventes' : data.filter === 'wishes' ? 'Mes souhaits' : 'Marché global'}`, M, y, 1100, 23, accent); y += 55;
    if (!data.listings.length) panel(ctx, 'Le marché vous appartient', 'Vends tes doublons depuis ta collection, puis ouvre leur fiche. Les annonces restent 7 jours. Les cartes invendues te sont rendues automatiquement.', M, y, W - M * 2, 200, accent);
    for (const [i, l] of data.listings.entries()) {
      const c = CARDS.get(l.cardId), x = M + i % 2 * 604, rowY = y + Math.floor(i / 2) * 172;
      panel(ctx, `${c.name} ×${l.quantity}`, `${SERIES.get(c.seriesId).name}\n${l.price} éclats / carte · Lot : ${l.price * l.quantity}\n${l.sellerId === p.id ? 'Ton annonce' : RARITIES[c.rarity].name}`, x, rowY, 580, 154, RARITIES[c.rarity].color);
    }
  } else if (v === 'albums') {
    txt(ctx, `${data.total} univers · Découvre chaque personnage pour compléter son album`, M, y, 1180, 21, C.muted); y += 55;
    data.series.forEach((s, i) => {
      const cards = SERIES_CARDS.get(s.id), n = cards.filter(c => p.discovered[c.id]).length;
      const x = M + i % 2 * 604, sy = y + Math.floor(i / 2) * 110;
      rounded(ctx, x, sy, 580, 94, C.panel, C.line); txt(ctx, s.name, x + 18, sy + 14, 430, 21, C.paper, 1); txt(ctx, `${n}/${cards.length}`, x + 460, sy + 16, 100, 18, accent, 1);
      rounded(ctx, x + 18, sy + 58, 540, 7, C.line, null, 3); if (n) rounded(ctx, x + 18, sy + 58, Math.max(7, 540 * n / cards.length), 7, accent, null, 3);
    });
  } else if (v === 'social') {
    panel(ctx, 'TON CERCLE', `${p.friends.length} ami(s)\n${data.requests.length} demande(s) reçue(s)\n${data.trades.length} échange(s) en attente\nLes propositions et demandes arrivent dans ce menu.`, M, y, 580, 240, accent);
    panel(ctx, 'L’ÉCHANGE EN TOUTE CONFIANCE', 'Choisis une carte dans ta collection, puis « Proposer un échange ». Le destinataire verra la proposition ici et pourra la consulter avant de confirmer.\nTu peux annuler une proposition en attente.', 652, y, 580, 240, '#62aaff'); y += 265;
    const names = data.people.slice(0, 10).map(x => `${p.friends.includes(x.id) ? 'Ami · ' : ''}${x.name} — ${Object.keys(x.discovered).length} découvertes`).join('\n');
    panel(ctx, 'LES COLLECTIONNEURS', names || 'Tes amis apparaîtront après leur premier /profil.', M, y, 1184, 360, accent);
  } else if (v === 'tradePartner') {
    panel(ctx, 'À QUI PROPOSER CET ÉCHANGE ?', `Tu proposes une copie de ${data.card.name}.\nChoisis un joueur Discord ci-dessous, puis la carte que tu aimerais recevoir.\nLe destinataire pourra accepter ou refuser. Aucun transfert n’a lieu sans son accord.`, M, y, W - M * 2, 260, accent);
  } else if (v === 'friendRequest') {
    panel(ctx, 'UNE DEMANDE D’AMI', `${data.from.name} souhaite rejoindre ton cercle de collectionneurs.\nIdentifiant Discord : ${data.from.id}\nAccepte ou refuse avec les boutons ci-dessous.`, M, y, W - M * 2, 250, accent);
  } else if (v === 'trade') {
    const t = data.trade;
    txt(ctx, `Offre de ${data.fromName} à ${data.toName}`, M, y, 1184, 23, accent, 2); y += 65;
    await drawCard(ctx, CARDS.get(t.offer), 160, y + 20, 300, 440, { quantity: t.offerQty });
    await drawCard(ctx, CARDS.get(t.wanted), 820, y + 20, 300, 440, { quantity: t.wantedQty });
    txt(ctx, 'CONTRE', 530, y + 200, 220, 33, accent, 1);
    pill(ctx, ({ pending: 'EN ATTENTE', accepted: 'ACCEPTÉ', declined: 'REFUSÉ', cancelled: 'ANNULÉ', expired: 'EXPIRÉ' })[t.status], 545, y + 270, accent, 190);
    txt(ctx, t.from === p.id ? 'Tu offres la carte de gauche.' : 'Tu reçois la carte de gauche et cèdes celle de droite.', M, y + 500, 1184, 23, C.paper, 2);
  } else if (v === 'missions') {
    [...data.dailyTasks, ...data.objectives].forEach((o, i) => {
      const x = M + i % 2 * 604, sy = y + Math.floor(i / 2) * 145;
      panel(ctx, o.name || 'Mission quotidienne', `${o.text} · ${Math.min(o.value, o.goal)}/${o.goal}\n${o.claimed ? 'Récompense récupérée' : `Récompense : ${o.coins} éclats`}`, x, sy, 580, 130, o.claimed ? C.muted : o.value >= o.goal ? '#47d6a1' : accent);
    });
  } else if (v === 'leaderboard') {
    txt(ctx, 'Classement global par personnages découverts', M, y, 1100, 22, C.muted); y += 45;
    data.people.forEach((t, i) => {
      rounded(ctx, M, y + i * 48, 1184, 42, t.id === p.id ? `${accent}22` : C.panel, null, 8);
      txt(ctx, `${String(i + 1).padStart(2, '0')}   ${t.name}`, M + 16, y + i * 48 + 10, 800, 20, i < 3 ? accent : C.paper, 1);
      txt(ctx, `${Object.keys(t.discovered).length} découvertes`, 956, y + i * 48 + 10, 245, 18, C.muted, 1);
    });
  } else if (v === 'info') {
    panel(ctx, 'COMMENT JOUER ?', '1. Récupère tes boosters gratuits et ton quotidien.\n2. Ouvre 5 cartes, puis complète tes albums.\n3. Protège tes favorites et recycle tes doublons.\n4. Échange avec tes amis ou vends au marché.\nLes éclats se gagnent en jouant, sans argent réel.', M, y, 580, 290, accent);
    panel(ctx, 'TAUX DU MIX MULTIVERS', RARITIES.map(r => `${r.name} : ${r.rate} % · recyclage ${r.recycle}`).join('\n'), 652, y, 580, 290, '#b68cff'); y += 315;
    panel(ctx, 'LES GARANTIES', '5 cartes sans rare ? La dernière devient rare (épique si les rares sont absentes de cet univers).\nÉpique ou mieux : après 20 boosters sans en obtenir.\nLégendaire ou mieux : après 100 boosters sans en obtenir.\nMythique : après 400 boosters sans en obtenir.\nLa garantie normale ne crée jamais de mythique ou de légendaire supplémentaire.', M, y, 580, 330, C.gold);
    const rates = normalizedRates(poolFor('daily', data.now));
    panel(ctx, `SÉLECTION : ${data.theme.name}`, `${RARITIES.map((r, i) => `${r.short} ${rates[i].toFixed(2)} %`).join(' · ')}\nTaux par carte hors garanties. Les chances d’un rang absent vont aux communes.\nPour 5 cartes : environ 0,50 % d’au moins une mythique et 4,42 % d’au moins une légendaire, hors garanties.\nPersonnages et portraits : AniList.\nQuotidien : renouvellement à minuit UTC.`, 652, y, 580, 330, '#62aaff');
  } else if (v === 'confirm') {
    panel(ctx, 'VÉRIFIE CETTE OPÉRATION', data.pending.review, M, y, W - M * 2, 330, accent);
    panel(ctx, 'À TOI DE CHOISIR', 'Cette confirmation t’est réservée et expire dans 5 minutes.\nTes cartes et ton solde seront vérifiés à nouveau au moment de valider.', M, y + 355, W - M * 2, 165, C.muted);
  } else if (v === 'customize') {
    panel(ctx, 'UNE VITRINE À TON IMAGE', 'Change ton nom et ta description, importe un portrait et une bannière.\nTon portrait apparaît en haut à droite de chaque menu.\nSans portrait, ta première carte favorite sert de repère visuel.', M, y, W - M * 2, 220, accent);
    panel(ctx, 'TES IMAGES', 'PNG, JPG ou WebP fixes, jusqu’à 5 Mo.\nPortrait recadré au carré ; bannière panoramique.\nLes images sont conservées dans la base PostgreSQL.', M, y + 245, W - M * 2, 210, '#62aaff');
  } else panel(ctx, 'REPRENONS DEPUIS LE MENU', data.message || 'Ouvre /profil pour retrouver ta collection.', M, y, W - M * 2, 250, accent);
  ctx.fillStyle = C.bg; ctx.fillRect(0, h - 60, W, 60);
  ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(M, h - 62); ctx.lineTo(W - M, h - 62); ctx.stroke();
  txt(ctx, 'MANGA CLUB  ·  COLLECTIONNE, ÉCHANGE, PARTAGE', M, h - 40, 950, 14, C.muted, 1);
  if (data.pages) txt(ctx, `${(data.page ?? 0) + 1} / ${data.pages}`, 1100, h - 42, 125, 18, accent, 1);
  return { buffer: await canvas.encode('png'), width: W, height: h };
}
