import { randomBytes } from 'node:crypto';
import { GachaError } from './gacha-game.js';
export async function prepareGachaReset(game, actor, targetId, guildId) {
  return game.store.transaction(async tx => {
    const target = await tx.get('gacha_player', targetId);
    if (!target) throw new GachaError('Ce joueur n’a pas encore de collection.');
    const token = { id: randomBytes(12).toString('hex'), owner: actor, targetId, guildId, generation: target.generation, expiresAt: game.clock() + 5 * 60000, review: `Réinitialiser définitivement ${target.name} (${targetId}) ?\n${Object.keys(target.collection).length} personnages possédés · ${target.opened} boosters ouverts.\nCartes, éclats, amis et récompenses seront effacés. Les ventes seront retirées ; les cartes réservées par les autres joueurs leur seront rendues.\nLes anciennes sauvegardes RPG sont conservées.` };
    await tx.set('gacha_reset', token.id, token); return token;
  });
}
export async function confirmGachaReset(game, actor, tokenId, guildId) {
  return game.store.transaction(async tx => {
    const token = await tx.get('gacha_reset', tokenId);
    if (!token || token.owner !== actor || token.guildId !== guildId || token.expiresAt <= game.clock()) throw new GachaError('Confirmation expirée ou indisponible.');
    const p = await tx.get('gacha_player', token.targetId);
    if (!p || p.generation !== token.generation) throw new GachaError('Ce profil a déjà été réinitialisé.');
    for (const l of await tx.list('gacha_listing')) if (l.sellerId === p.id) await tx.delete('gacha_listing', l.id);
    for (const t of await tx.list('gacha_trade')) if (t.from === p.id || t.to === p.id) {
      if (t.status === 'pending' && t.from !== p.id) await game.refundTrade(tx, t, 'cancelled');
      await tx.delete('gacha_trade', t.id);
    }
    for (const r of await tx.list('gacha_friend')) if (r.from === p.id || r.to === p.id) await tx.delete('gacha_friend', r.id);
    for (const other of await tx.list('gacha_player')) if (other.id !== p.id && other.friends.includes(p.id)) { other.friends = other.friends.filter(id => id !== p.id); await tx.set('gacha_player', other.id, other); }
    for (const kind of ['gacha_receipt', 'gacha_confirm', 'gacha_search']) for (const d of await tx.list(kind)) if (d.owner === p.id) await tx.delete(kind, d.id);
    for (const slot of ['portrait', 'banner']) await tx.delete('gacha_media', `${p.id}.${slot}`);
    await tx.delete('gacha_player', p.id); await tx.delete('gacha_reset', token.id);
    await tx.set('gacha_audit', token.id, { id: token.id, actor, targetId: p.id, guildId, at: game.clock(), action: 'reset' });
    return true;
  });
}
