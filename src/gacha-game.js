import { randomInt, randomBytes } from 'node:crypto';
import { CARDS, SERIES, SERIES_CARDS, CATALOG, RARITIES, SETTINGS, poolFor, dailyTheme, cardId } from './gacha-catalog.js';
import { GachaError } from './errors.js';
export { GachaError } from './errors.js';
const check = (ok, message) => { if (!ok) throw new GachaError(message); };
const KIND = 'gacha_player';
const id = () => randomBytes(8).toString('hex');
const day = time => Math.floor(time / 86400000);
const int = (n, min, max) => { const value = Number(n); check(Number.isSafeInteger(value) && value >= min && value <= max, `Choisis un nombre entier entre ${min} et ${max}.`); return value; };
const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/@(everyone|here)/gi, '$1').trim().slice(0, max);
const OBJECTIVES = [
  { id: 'first', name: 'Premier tirage', text: 'Ouvrir 1 booster', field: 'opened', goal: 1, coins: 50 },
  { id: 'ten', name: 'La fièvre des boosters', text: 'Ouvrir 10 boosters', field: 'opened', goal: 10, coins: 150 },
  { id: 'fifty', name: 'Collectionneur assidu', text: 'Ouvrir 50 boosters', field: 'opened', goal: 50, coins: 350 },
  { id: 'unique10', name: 'Premières rencontres', text: 'Découvrir 10 personnages', field: 'unique', goal: 10, coins: 75 },
  { id: 'unique50', name: 'Galerie de héros', text: 'Découvrir 50 personnages', field: 'unique', goal: 50, coins: 150 },
  { id: 'unique100', name: 'Le grand album', text: 'Découvrir 100 personnages', field: 'unique', goal: 100, coins: 300 },
  { id: 'trader', name: 'Entre amis', text: 'Réussir 1 échange', field: 'trades', goal: 1, coins: 100 },
];
export class GachaGame {
  constructor(store, { now = Date.now, random = () => randomInt(0x100000000) / 0x100000000 } = {}) { this.store = store; this.clock = now; this.random = random; }
  async player(tx, userId, name) {
    let p = await tx.get(KIND, userId);
    if (!p) {
      const imported = await tx.get('gacha_import', userId);
      const old = imported ? null : await tx.get('player', userId);
      p = { id: userId, generation: id(), name: clean(name || old?.name || 'Collectionneur', 32), bio: clean(old?.customization?.bio || '', 300), createdAt: this.clock(), coins: 300, tickets: SETTINGS.freeCap, ticketAt: this.clock(), stock: 5, opened: 0, pityEpic: 0, pityMythic: 0, dailyAt: null, streak: 0, collection: {}, discovered: {}, favorites: [], wishlist: [], friends: [], blocked: [], trades: 0, sold: 0, recycled: 0, claims: [], albums: [], recent: [], tasks: { day: day(this.clock()), opens: 0, recycles: 0, trades: 0, claimed: [] } };
      for (const slot of imported ? [] : ['portrait', 'banner']) {
        const media = await tx.get('profile_media', `${userId}.${slot}`);
        if (media) await tx.set('gacha_media', `${userId}.${slot}`, media);
      }
      await tx.set('gacha_import', userId, { id: userId, at: this.clock() });
    }
    this.recharge(p);
    return p;
  }
  recharge(p) {
    const now = this.clock();
    if (p.tickets >= SETTINGS.freeCap) p.ticketAt = now;
    else {
      const gained = Math.max(0, Math.floor((now - p.ticketAt) / SETTINGS.freeMs));
      p.tickets = Math.min(SETTINGS.freeCap, p.tickets + gained);
      p.ticketAt = p.tickets === SETTINGS.freeCap ? now : p.ticketAt + gained * SETTINGS.freeMs;
    }
    if (p.tasks.day !== day(now)) p.tasks = { day: day(now), opens: 0, recycles: 0, trades: 0, claimed: [] };
  }
  add(p, cid, quantity) { p.collection[cid] = (p.collection[cid] ?? 0) + quantity; p.discovered[cid] ??= this.clock(); }
  remove(p, cid, quantity) {
    check(CARDS.has(cid), 'Carte inconnue.');
    check((p.collection[cid] ?? 0) - quantity >= (p.favorites.includes(cid) ? 1 : 0), 'Quantité insuffisante ou dernière copie protégée par tes favoris.');
    p.collection[cid] -= quantity;
    if (!p.collection[cid]) delete p.collection[cid];
  }
  async save(tx, p) { await tx.set(KIND, p.id, p); }
  async expire(tx) {
    const now = this.clock();
    for (const listing of await tx.list('gacha_listing')) {
      if (listing.expiresAt > now) continue;
      const seller = await tx.get(KIND, listing.sellerId);
      if (seller && seller.generation === listing.generation) { this.add(seller, listing.cardId, listing.quantity); await this.save(tx, seller); }
      await tx.delete('gacha_listing', listing.id);
    }
    for (const trade of await tx.list('gacha_trade')) {
      if (trade.status !== 'pending' || trade.expiresAt > now) continue;
      await this.refundTrade(tx, trade, 'expired');
    }
  }
  async refundTrade(tx, trade, status) {
    const from = await tx.get(KIND, trade.from);
    if (from && from.generation === trade.generation) { this.add(from, trade.offer, trade.offerQty); await this.save(tx, from); }
    trade.status = status; trade.closedAt = this.clock();
    await tx.set('gacha_trade', trade.id, trade);
  }
  async execute(action, userId, args = {}, requestId) {
    check(typeof userId === 'string' && userId.length <= 24, 'Joueur invalide.');
    return this.store.transaction(async tx => {
      await this.expire(tx);
      let p = await this.player(tx, userId, args.name);
      const receipt = requestId ? await tx.get('gacha_receipt', requestId) : null;
      if (receipt) {
        check(receipt.owner === userId, 'Cette interaction ne t’appartient pas.');
        return this.view(tx, p, receipt.effect.view, { ...receipt.effect, replay: true });
      }
      let effect;
      if (action === 'view') effect = { view: args.view || 'profile', ...args };
      else if (action === 'prepare') {
        check(['recycle', 'list', 'buy', 'cancelListing', 'trade', 'tradeRespond', 'recycleDuplicates', 'buyPack'].includes(args.operation), 'Action inconnue.');
        const pending = { id: id(), owner: userId, generation: p.generation, operation: args.operation, args: args.values ?? {}, expiresAt: this.clock() + 5 * 60000 };
        // Validate against current state and create a human-readable immutable review.
        pending.review = await this.review(tx, p, pending.operation, pending.args);
        await tx.set('gacha_confirm', pending.id, pending);
        effect = { view: 'confirm', pending };
      } else if (action === 'confirm') {
        const pending = await tx.get('gacha_confirm', args.token);
        check(pending && pending.owner === userId && pending.generation === p.generation && pending.expiresAt > this.clock(), 'Confirmation expirée ou déjà utilisée. Recommence depuis le menu.');
        effect = await this.mutate(tx, p, pending.operation, pending.args);
        await tx.delete('gacha_confirm', pending.id);
      } else effect = await this.mutate(tx, p, action, args);
      await this.save(tx, p);
      if (requestId && action !== 'view') await tx.set('gacha_receipt', requestId, { id: requestId, owner: userId, effect, createdAt: this.clock() });
      return this.view(tx, p, effect.view, effect);
    });
  }
  async review(tx, p, operation, a) {
    if (operation === 'buyPack') { int(a.count, 1, 5); poolFor(a.pack, this.clock()); return `${a.count} booster(s) · ${SETTINGS.packSize * a.count} cartes\nCoût : ${SETTINGS.packCost * a.count} éclats. Aucun argent réel.`; }
    if (operation === 'recycleDuplicates') {
      const list = this.duplicates(p);
      check(list.length, 'Aucun doublon commun, peu commun ou rare à recycler.');
      return `${list.reduce((n, c) => n + c.quantity, 0)} doublons → ${list.reduce((n, c) => n + RARITIES[CARDS.get(c.id).rarity].recycle * c.quantity, 0)} éclats.\nUne copie de chaque personnage reste en collection. Épiques, mythiques et légendaires exclus.`;
    }
    if (['recycle', 'list', 'trade'].includes(operation)) {
      const c = CARDS.get(a.cardId); check(c, 'Carte inconnue.');
      const quantity = int(a.quantity ?? 1, 1, 999);
      check((p.collection[c.id] ?? 0) >= quantity + (p.favorites.includes(c.id) ? 1 : 0), 'Quantité insuffisante ou dernière copie favorite protégée.');
      if (operation === 'recycle') return `Recycler ${quantity} × ${c.name}\nGain : ${RARITIES[c.rarity].recycle * quantity} éclats. Cette copie disparaîtra.`;
      if (operation === 'list') {
        const price = int(a.price, 1, 1000000);
        return `Vendre ${quantity} × ${c.name}\n${price} éclats par carte · Lot entier : ${price * quantity} éclats.\nCommission : 5 % (arrondie au supérieur). Annonce valable 7 jours. Les cartes sont réservées pendant la vente.`;
      }
      const wanted = CARDS.get(cardId(a.wanted)); check(wanted, 'Identifiant de carte demandée inconnu.');
      int(a.wantedQty ?? 1, 1, 999);
      const target = await tx.get(KIND, a.targetId);
      check(target && target.id !== p.id, 'Choisis un autre joueur déjà inscrit au gacha.');
      check(!p.blocked.includes(target.id) && !target.blocked.includes(p.id), 'Échange indisponible entre ces joueurs.');
      return `Proposer à ${target.name} (${target.id}) :\n${quantity} × ${c.name} contre ${a.wantedQty ?? 1} × ${wanted.name}.\nTes cartes seront réservées 24 heures, jusqu’à acceptation, refus ou annulation.`;
    }
    if (operation === 'tradeRespond') {
      const t = await tx.get('gacha_trade', a.tradeId);
      check(t?.status === 'pending' && (t.to === p.id || t.from === p.id), 'Échange indisponible.');
      return `${a.accept ? 'Accepter' : 'Refuser ou annuler'} cet échange ?\n${t.offerQty} × ${CARDS.get(t.offer).name} contre ${t.wantedQty} × ${CARDS.get(t.wanted).name}.`;
    }
    const l = await tx.get('gacha_listing', a.listingId);
    check(l, 'Cette annonce n’est plus disponible.');
    return operation === 'buy' ? `Acheter le lot de ${l.quantity} × ${CARDS.get(l.cardId).name}\nCoût total : ${l.price * l.quantity} éclats.` : `Annuler la vente de ${l.quantity} × ${CARDS.get(l.cardId).name} et récupérer les cartes.`;
  }
  duplicates(p) { return Object.entries(p.collection).filter(([cid, q]) => q > 1 && CARDS.get(cid)?.rarity <= 2).map(([id, quantity]) => ({ id, quantity: quantity - 1 })); }
  draw(pool, minimum = 0) {
    const groups = RARITIES.map((_, rarity) => pool.filter(c => c.rarity === rarity));
    const available = groups.map((g, i) => g.length && i >= minimum ? i : -1).filter(i => i >= 0);
    // A small theme may not have every tier: the guarantee targets its highest available tier.
    if (!available.length) return this.draw(pool, Math.max(...pool.map(c => c.rarity)));
    const total = available.reduce((n, i) => n + RARITIES[i].rate, 0);
    let roll = Math.min(.999999999, Math.max(0, this.random())) * total;
    let rarity = available.at(-1);
    for (const i of available) { roll -= RARITIES[i].rate; if (roll < 0) { rarity = i; break; } }
    const g = groups[rarity];
    return g[Math.min(g.length - 1, Math.floor(Math.max(0, this.random()) * g.length))];
  }
  async mutate(tx, p, action, a) {
    const now = this.clock();
    switch (action) {
      case 'open': case 'buyPack': {
        const count = int(a.count ?? 1, 1, 5), pool = poolFor(a.pack ?? 'mix', now);
        const paid = action === 'buyPack';
        if (paid) { check(p.coins >= count * SETTINGS.packCost, 'Pas assez d’éclats.'); p.coins -= count * SETTINGS.packCost; }
        else {
          check(p.tickets + p.stock >= count, 'Pas assez de boosters gratuits. Attends la recharge ou récupère ta récompense quotidienne.');
          const tickets = Math.min(p.tickets, count);
          if (p.tickets === SETTINGS.freeCap && tickets) p.ticketAt = now;
          p.tickets -= tickets; p.stock -= count - tickets;
        }
        const pulls = [];
        for (let n = 0; n < count; n++) {
          const minimum = p.pityMythic >= SETTINGS.mythicPity - 1 ? 4 : p.pityEpic >= SETTINGS.epicPity - 1 ? 3 : 2;
          let max = 0;
          for (let slot = 0; slot < SETTINGS.packSize; slot++) {
            const c = this.draw(pool, slot === 4 ? minimum : 0);
            const fresh = !p.discovered[c.id];
            this.add(p, c.id, 1); max = Math.max(max, c.rarity);
            pulls.push({ cardId: c.id, fresh });
          }
          p.opened++; p.tasks.opens++;
          p.pityEpic = max >= 3 ? 0 : p.pityEpic + 1;
          p.pityMythic = max >= 4 ? 0 : p.pityMythic + 1;
        }
        p.recent = [...pulls, ...p.recent].slice(0, 40);
        return { view: 'pull', pack: a.pack ?? 'mix', pulls, message: `${count} booster(s) ouvert(s) · ${pulls.filter(c => c.fresh).length} nouvelles découvertes.` };
      }
      case 'daily': {
        check(p.dailyAt === null || day(p.dailyAt) < day(now), 'Récompense déjà récupérée aujourd’hui. Retour à minuit UTC (01 h en hiver, 02 h en été en France).');
        p.streak = p.dailyAt !== null && day(p.dailyAt) === day(now) - 1 ? p.streak + 1 : 1;
        const coins = SETTINGS.dailyCoins + Math.min(6, p.streak - 1) * 10;
        p.coins += coins; p.stock += 3; p.dailyAt = now;
        return { view: 'profile', message: `Récompense quotidienne : +3 boosters et +${coins} éclats. Série : ${p.streak} jour(s) !` };
      }
      case 'favorite': case 'wish': {
        const cid = cardId(a.cardId); check(cid, 'Carte inconnue.');
        const list = action === 'favorite' ? p.favorites : p.wishlist;
        if (list.includes(cid)) list.splice(list.indexOf(cid), 1);
        else { check(list.length < (action === 'favorite' ? 12 : 30), 'Ta liste est pleine.'); if (action === 'favorite') check(p.collection[cid], 'Tu ne possèdes pas cette carte.'); list.push(cid); }
        return { view: 'card', cardId: cid, message: action === 'favorite' ? 'Favoris mis à jour. La dernière copie favorite est protégée.' : 'Liste de souhaits mise à jour.' };
      }
      case 'recycle': {
        const quantity = int(a.quantity, 1, 999), c = CARDS.get(a.cardId); check(c, 'Carte inconnue.');
        this.remove(p, c.id, quantity); p.coins += RARITIES[c.rarity].recycle * quantity; p.recycled += quantity; p.tasks.recycles += quantity;
        return { view: 'collection', message: `${quantity} × ${c.name} recyclé(s) : +${RARITIES[c.rarity].recycle * quantity} éclats.` };
      }
      case 'recycleDuplicates': {
        let coins = 0, quantity = 0;
        for (const c of this.duplicates(p)) { this.remove(p, c.id, c.quantity); quantity += c.quantity; coins += RARITIES[CARDS.get(c.id).rarity].recycle * c.quantity; }
        check(quantity, 'Aucun doublon à recycler.');
        p.coins += coins; p.recycled += quantity; p.tasks.recycles += quantity;
        return { view: 'collection', message: `${quantity} doublons recyclés : +${coins} éclats. Une copie de chaque personnage conservée.` };
      }
      case 'list': {
        const quantity = int(a.quantity, 1, 999), price = int(a.price, 1, 1000000);
        check((await tx.list('gacha_listing')).filter(l => l.sellerId === p.id).length < 10, 'Maximum : 10 annonces actives.');
        this.remove(p, a.cardId, quantity);
        const l = { id: id(), sellerId: p.id, generation: p.generation, cardId: a.cardId, quantity, price, createdAt: now, expiresAt: now + SETTINGS.marketDuration };
        await tx.set('gacha_listing', l.id, l);
        return { view: 'listing', listingId: l.id, message: 'Annonce publiée. Les cartes sont réservées jusqu’à la vente ou l’annulation.' };
      }
      case 'buy': case 'cancelListing': {
        const l = await tx.get('gacha_listing', a.listingId); check(l && l.expiresAt > now, 'Annonce déjà vendue, annulée ou expirée.');
        const seller = l.sellerId === p.id ? p : await tx.get(KIND, l.sellerId);
        check(seller?.generation === l.generation, 'Vendeur indisponible.');
        if (action === 'cancelListing') { check(l.sellerId === p.id, 'Cette annonce ne t’appartient pas.'); this.add(p, l.cardId, l.quantity); }
        else {
          check(l.sellerId !== p.id, 'Tu ne peux pas acheter ta propre annonce.');
          check(!p.blocked.includes(seller.id) && !seller.blocked.includes(p.id), 'Transaction indisponible entre ces joueurs.');
          const total = l.price * l.quantity; check(p.coins >= total, 'Pas assez d’éclats.');
          p.coins -= total; seller.coins += total - Math.ceil(total * SETTINGS.marketTax); seller.sold += l.quantity;
          this.add(p, l.cardId, l.quantity); await this.save(tx, seller);
        }
        await tx.delete('gacha_listing', l.id);
        return { view: 'market', message: action === 'buy' ? `Achat réussi : ${l.quantity} × ${CARDS.get(l.cardId).name}.` : 'Annonce annulée, cartes rendues.' };
      }
      case 'trade': {
        await this.review(tx, p, action, a);
        const pending = (await tx.list('gacha_trade')).filter(t => t.status === 'pending');
        check(pending.filter(t => t.from === p.id).length < 10 && pending.filter(t => t.to === a.targetId).length < 30, 'Trop de propositions d’échange en attente.');
        const target = await tx.get(KIND, a.targetId);
        const quantity = int(a.quantity ?? 1, 1, 999), wantedQty = int(a.wantedQty ?? 1, 1, 999);
        this.remove(p, a.cardId, quantity);
        const t = { id: id(), from: p.id, to: a.targetId, generation: p.generation, targetGeneration: target.generation, offer: a.cardId, offerQty: quantity, wanted: cardId(a.wanted), wantedQty, status: 'pending', createdAt: now, expiresAt: now + SETTINGS.tradeDuration };
        await tx.set('gacha_trade', t.id, t);
        return { view: 'trade', tradeId: t.id, message: 'Proposition envoyée dans la boîte sociale du destinataire. Tes cartes sont réservées.' };
      }
      case 'tradeRespond': {
        const t = await tx.get('gacha_trade', a.tradeId); check(t?.status === 'pending' && t.expiresAt > now, 'Échange déjà traité ou expiré.');
        check(t.to === p.id || (t.from === p.id && !a.accept), 'Cette proposition ne t’est pas destinée.');
        if (!a.accept) {
          // Use the current in-transaction player when refunding the sender.
          if (t.from === p.id) { this.add(p, t.offer, t.offerQty); t.status = 'cancelled'; t.closedAt = now; await tx.set('gacha_trade', t.id, t); }
          else await this.refundTrade(tx, t, 'declined');
        } else {
          const from = await tx.get(KIND, t.from);
          check(from?.generation === t.generation && p.generation === t.targetGeneration, 'Le profil d’un participant a changé.');
          check(!p.blocked.includes(from.id) && !from.blocked.includes(p.id), 'Échange indisponible entre ces joueurs.');
          this.remove(p, t.wanted, t.wantedQty); this.add(p, t.offer, t.offerQty); this.add(from, t.wanted, t.wantedQty);
          p.trades++; from.trades++; p.tasks.trades++; this.recharge(from); from.tasks.trades++;
          await this.save(tx, from); t.status = 'accepted'; t.closedAt = now; await tx.set('gacha_trade', t.id, t);
        }
        return { view: 'trade', tradeId: t.id, message: a.accept ? 'Échange réussi : les cartes ont été transférées simultanément.' : 'Proposition fermée. Cartes rendues à leur propriétaire.' };
      }
      case 'friendRequest': case 'block': {
        const target = await tx.get(KIND, a.targetId); check(target && target.id !== p.id, 'Joueur indisponible.');
        if (action === 'block') {
          if (p.blocked.includes(target.id)) p.blocked = p.blocked.filter(x => x !== target.id);
          else {
            check(p.blocked.length < 100, 'Liste de blocage pleine.'); p.blocked.push(target.id);
            p.friends = p.friends.filter(x => x !== target.id); target.friends = target.friends.filter(x => x !== p.id);
            await this.save(tx, target);
          }
          return { view: 'social', message: 'Liste de blocage mise à jour.' };
        }
        check(!p.blocked.includes(target.id) && !target.blocked.includes(p.id), 'Demande indisponible entre ces joueurs.');
        check(!p.friends.includes(target.id), 'Vous êtes déjà amis.');
        check(p.friends.length < 100 && target.friends.length < 100, 'Liste d’amis pleine.');
        const rid = [p.id, target.id].sort().join('.');
        const previous = await tx.get('gacha_friend', rid);
        check(!previous || previous.expiresAt <= now, 'Une demande est déjà en attente dans votre boîte sociale.');
        await tx.set('gacha_friend', rid, { id: rid, from: p.id, to: target.id, expiresAt: now + 7 * 86400000 });
        return { view: 'social', message: 'Demande d’ami envoyée.' };
      }
      case 'friendRespond': {
        const r = await tx.get('gacha_friend', a.requestId); check(r && r.to === p.id && r.expiresAt > now, 'Demande expirée.');
        const from = await tx.get(KIND, r.from);
        if (a.accept) {
          check(from && !p.blocked.includes(from.id) && !from.blocked.includes(p.id), 'Demande indisponible.');
          check(p.friends.length < 100 && from.friends.length < 100, 'Liste d’amis pleine.');
          if (!p.friends.includes(from.id)) p.friends.push(from.id);
          if (!from.friends.includes(p.id)) from.friends.push(p.id);
          await this.save(tx, from);
        }
        await tx.delete('gacha_friend', r.id);
        return { view: 'social', message: a.accept ? 'Vous êtes désormais amis !' : 'Demande refusée.' };
      }
      case 'unfriend': {
        p.friends = p.friends.filter(id => id !== a.targetId);
        const target = await tx.get(KIND, a.targetId);
        if (target) { target.friends = target.friends.filter(id => id !== p.id); await this.save(tx, target); }
        return { view: 'social', message: 'Ce joueur a été retiré de ta liste d’amis.' };
      }
      case 'claim': {
        const objective = OBJECTIVES.find(x => x.id === a.objective);
        if (objective) {
          const value = objective.field === 'unique' ? Object.keys(p.discovered).length : p[objective.field];
          check(value >= objective.goal && !p.claims.includes(objective.id), 'Objectif non atteint ou déjà récupéré.');
          p.claims.push(objective.id); p.coins += objective.coins;
          return { view: 'missions', message: `${objective.name} : +${objective.coins} éclats !` };
        }
        const tasks = { opens: [3, 35], recycles: [5, 25], trades: [1, 40] };
        check(Object.hasOwn(tasks, a.objective), 'Objectif inconnu.');
        const [goal, coins] = tasks[a.objective];
        check(p.tasks[a.objective] >= goal && !p.tasks.claimed.includes(a.objective), 'Objectif non atteint ou déjà récupéré.');
        p.tasks.claimed.push(a.objective); p.coins += coins;
        return { view: 'missions', message: `Mission quotidienne : +${coins} éclats.` };
      }
      case 'claimAlbum': {
        const cards = SERIES_CARDS.get(a.seriesId); check(cards && cards.length >= 6 && cards.every(c => p.discovered[c.id]), 'Découvre tous les personnages de cet album (au moins 6).');
        check(!p.albums.includes(a.seriesId), 'Récompense déjà récupérée.');
        p.albums.push(a.seriesId); p.coins += 250; p.stock += 2;
        return { view: 'album', seriesId: a.seriesId, message: 'Album complété : +250 éclats et +2 boosters !' };
      }
      case 'customize': {
        p.name = clean(a.name, 32); check(p.name.length >= 2, 'Nom : de 2 à 32 caractères.');
        p.bio = clean(a.bio, 300);
        return { view: 'profile', message: 'Profil personnalisé.' };
      }
      case 'search': {
        check(['collection', 'catalog', 'market', 'albums'].includes(a.view), 'Recherche inconnue.');
        const query = clean(a.query, 80); check(query.length >= 2, 'Recherche : au moins 2 caractères.');
        const search = { id: id(), owner: p.id, query, expiresAt: now + 3600000 };
        await tx.set('gacha_search', search.id, search);
        return { view: a.view, searchToken: search.id };
      }
      case 'media': {
        check(['portrait', 'banner'].includes(a.slot), 'Emplacement inconnu.');
        check(a.media?.mime === 'image/webp' && typeof a.media.data === 'string' && a.media.data.length < 2_000_000, 'Image invalide.');
        await tx.set('gacha_media', `${p.id}.${a.slot}`, a.media);
        return { view: 'profile', message: 'Image du profil mise à jour.' };
      }
      case 'clearMedia': {
        check(['portrait', 'banner'].includes(a.slot), 'Emplacement inconnu.'); await tx.delete('gacha_media', `${p.id}.${a.slot}`);
        return { view: 'profile', message: 'Image personnalisée retirée.' };
      }
      default: throw new GachaError('Action inconnue. Ouvre /profil pour retrouver les nouveaux menus.');
    }
  }
  async view(tx, p, view, args = {}) {
    const now = this.clock();
    if (args.searchToken) {
      const search = await tx.get('gacha_search', args.searchToken);
      check(search?.owner === p.id && search.expiresAt > now, 'Recherche expirée. Relance-la depuis le menu.');
      args = { ...args, query: search.query };
    }
    const target = args.targetId && args.targetId !== p.id ? await tx.get(KIND, args.targetId) : p;
    if (args.targetId) check(target && !p.blocked.includes(target.id) && !target.blocked.includes(p.id), 'Ce profil est indisponible.');
    const result = { view, ...args, p, now, theme: dailyTheme(now), catalogueSize: CARDS.size, seriesSize: SERIES.size };
    if (view === 'packs') poolFor(args.pack || 'mix', now);
    result.appearance = {
      portrait: await tx.get('gacha_media', `${view === 'profile' ? target.id : p.id}.portrait`),
      banner: view === 'profile' ? await tx.get('gacha_media', `${target.id}.banner`) : null,
    };
    if (view === 'profile') result.target = target;
    if (['collection', 'catalog', 'album', 'wishlist'].includes(view)) {
      let cards = CATALOG.cards;
      if (view === 'collection') cards = cards.filter(c => p.collection[c.id]);
      if (view === 'wishlist') cards = cards.filter(c => p.wishlist.includes(c.id));
      if (view === 'album') { check(SERIES.has(args.seriesId), 'Album inconnu.'); cards = SERIES_CARDS.get(args.seriesId); result.series = SERIES.get(args.seriesId); }
      if (args.query) { const query = clean(args.query, 80).toLocaleLowerCase('fr'); cards = cards.filter(c => `${c.name} ${SERIES.get(c.seriesId).name}`.toLocaleLowerCase('fr').includes(query)); }
      if (args.filter === 'duplicates') cards = cards.filter(c => p.collection[c.id] > 1);
      if (args.filter === 'favorites') cards = cards.filter(c => p.favorites.includes(c.id));
      if (/^[0-5]$/.test(args.filter ?? '')) cards = cards.filter(c => c.rarity === Number(args.filter));
      cards = [...cards].sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name));
      const pages = Math.max(1, Math.ceil(cards.length / 8));
      result.page = Math.max(0, Math.min(pages - 1, Number(args.page) || 0)); result.pages = pages; result.total = cards.length;
      result.cards = cards.slice(result.page * 8, result.page * 8 + 8);
    }
    if (view === 'albums') {
      let series = [...SERIES.values()];
      if (args.query) series = series.filter(s => s.name.toLowerCase().includes(clean(args.query, 80).toLowerCase()));
      series.sort((a, b) => SERIES_CARDS.get(b.id).filter(c => p.discovered[c.id]).length - SERIES_CARDS.get(a.id).filter(c => p.discovered[c.id]).length || a.name.localeCompare(b.name));
      result.pages = Math.max(1, Math.ceil(series.length / 12)); result.page = Math.max(0, Math.min(result.pages - 1, Number(args.page) || 0));
      result.series = series.slice(result.page * 12, result.page * 12 + 12); result.total = series.length;
    }
    if (view === 'card') { result.card = CARDS.get(cardId(args.cardId)); check(result.card, 'Carte inconnue.'); }
    if (view === 'tradePartner' || view === 'tradeChoose') {
      result.card = CARDS.get(args.cardId); check(result.card && p.collection[args.cardId], 'Tu ne possèdes pas cette carte.');
      if (view === 'tradeChoose') {
        check(target && target.id !== p.id, 'Choisis un autre collectionneur.');
        result.target = target;
        const cards = Object.keys(target.collection).map(id => CARDS.get(id)).filter(Boolean).sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name));
        result.total = cards.length; result.pages = Math.max(1, Math.ceil(cards.length / 8)); result.page = Math.max(0, Math.min(result.pages - 1, Number(args.page) || 0)); result.cards = cards.slice(result.page * 8, result.page * 8 + 8);
      }
    }
    if (view === 'market') {
      let listings = (await tx.list('gacha_listing')).filter(l => !p.blocked.includes(l.sellerId));
      const players = new Map((await tx.list(KIND)).map(x => [x.id, x]));
      listings = listings.filter(l => !players.get(l.sellerId)?.blocked.includes(p.id));
      if (args.filter === 'mine') listings = listings.filter(l => l.sellerId === p.id);
      if (args.filter === 'wishes') listings = listings.filter(l => p.wishlist.includes(l.cardId));
      if (args.query) { const q = clean(args.query, 80).toLowerCase(); listings = listings.filter(l => `${CARDS.get(l.cardId).name} ${SERIES.get(CARDS.get(l.cardId).seriesId).name}`.toLowerCase().includes(q)); }
      listings.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
      result.pages = Math.max(1, Math.ceil(listings.length / 8)); result.page = Math.max(0, Math.min(result.pages - 1, Number(args.page) || 0));
      result.listings = listings.slice(result.page * 8, result.page * 8 + 8); result.total = listings.length;
    }
    if (view === 'listing') { result.listing = await tx.get('gacha_listing', args.listingId); check(result.listing, 'Cette annonce n’est plus disponible.'); }
    if (view === 'social') {
      const people = (await tx.list(KIND)).filter(x => x.id !== p.id && !p.blocked.includes(x.id) && !x.blocked.includes(p.id));
      result.people = people.sort((a, b) => Number(p.friends.includes(b.id)) - Number(p.friends.includes(a.id)) || a.name.localeCompare(b.name)).slice(0, 20);
      result.trades = (await tx.list('gacha_trade')).filter(t => (t.from === p.id || t.to === p.id) && t.status === 'pending').slice(0, 20);
      result.requests = (await tx.list('gacha_friend')).filter(r => r.to === p.id && r.expiresAt > now).slice(0, 20);
      result.names = Object.fromEntries(people.map(x => [x.id, x.name]));
    }
    if (view === 'trade') {
      result.trade = await tx.get('gacha_trade', args.tradeId); check(result.trade && (result.trade.from === p.id || result.trade.to === p.id), 'Échange indisponible.');
      result.fromName = (await tx.get(KIND, result.trade.from))?.name ?? result.trade.from;
      result.toName = (await tx.get(KIND, result.trade.to))?.name ?? result.trade.to;
    }
    if (view === 'friendRequest') {
      result.request = await tx.get('gacha_friend', args.requestId);
      check(result.request?.to === p.id && result.request.expiresAt > now, 'Demande expirée.');
      result.from = await tx.get(KIND, result.request.from); check(result.from, 'Joueur indisponible.');
    }
    if (view === 'missions') {
      result.objectives = OBJECTIVES.map(o => ({ ...o, value: o.field === 'unique' ? Object.keys(p.discovered).length : p[o.field], claimed: p.claims.includes(o.id) }));
      result.dailyTasks = [['opens', 'Ouvrir 3 boosters', 3, 35], ['recycles', 'Recycler 5 cartes', 5, 25], ['trades', 'Réussir 1 échange', 1, 40]].map(([id, text, goal, coins]) => ({ id, text, goal, coins, value: p.tasks[id], claimed: p.tasks.claimed.includes(id) }));
    }
    if (view === 'leaderboard') {
      result.people = (await tx.list(KIND)).filter(x => !p.blocked.includes(x.id) && !x.blocked.includes(p.id)).sort((a, b) => Object.keys(b.discovered).length - Object.keys(a.discovered).length || b.opened - a.opened).slice(0, 15);
    }
    return result;
  }
  async cleanup() {
    await this.store.transaction(async tx => {
      await this.expire(tx);
      for (const [kind, time, ttl] of [['gacha_receipt', 'createdAt', 7 * 86400000], ['gacha_confirm', 'expiresAt', 0], ['gacha_friend', 'expiresAt', 0], ['gacha_search', 'expiresAt', 0], ['gacha_reset', 'expiresAt', 0]])
        for (const doc of await tx.list(kind)) if (doc[time] + ttl < this.clock()) await tx.delete(kind, doc.id);
      for (const t of await tx.list('gacha_trade')) if (t.status !== 'pending' && t.closedAt < this.clock() - 30 * 86400000) await tx.delete('gacha_trade', t.id);
    });
  }
}
