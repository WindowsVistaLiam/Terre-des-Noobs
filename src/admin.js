import { randomUUID } from "node:crypto";
import { ensure } from "./game.js";

export async function previewReset(game, actorId, targetId, guildId) {
  return game.store.transaction(async (tx) => {
    const target = await tx.get("player", targetId);
    ensure(target, "Ce joueur n’a pas de personnage.");
    const token = randomUUID().replaceAll("-", "");
    await tx.set("admin_reset", token, {
      actorId, targetId, guildId, generation: target.generation ?? target.createdAt,
      expiresAt: game.now() + 5 * 60_000,
    });
    return { type: "adminResetPreview", token, target: {
      id: targetId, name: target.name, level: target.level, guildId: target.guildId,
      gear: target.gear.length, bosses: target.bosses.length,
    } };
  });
}
export async function confirmReset(game, actorId, token, guildId) {
  return game.store.transaction(async (tx) => {
    const request = await tx.get("admin_reset", token);
    ensure(request && request.actorId === actorId && request.guildId === guildId && request.expiresAt > game.now(), "Confirmation expirée ou non autorisée.");
    const id = request.targetId, p = await tx.get("player", id);
    ensure(p && (p.generation ?? p.createdAt) === request.generation, "Ce personnage a déjà été réinitialisé. Relance la commande.");
    for (const kind of ["listing", "friend_request", "guild_invite", "duel"])
      for (const entry of await tx.list(kind))
        if ((kind === "listing" && entry.sellerId === id) ||
          (kind !== "listing" && [entry.from, entry.to].includes(id) && entry.status === "pending"))
          await tx.delete(kind, entry.id);
    for (const other of await tx.list("player")) {
      if (other.id !== id && other.social?.friends?.includes(id)) {
        other.social.friends = other.social.friends.filter((v) => v !== id);
        await tx.set("player", other.id, other);
      }
    }
    for (const kind of ["guild", "party"])
      for (const group of await tx.list(kind)) {
        // Le score de la cité reste acquis ; un nouveau personnage ne peut
        // réclamer une récompense pour les contributions de l’ancien.
        if (kind === "guild" && group.city?.invasion?.contributions?.[id] !== undefined) {
          delete group.city.invasion.contributions[id];
          await tx.set(kind, group.id, group);
        }
        if (!group.members.includes(id)) continue;
        group.members = group.members.filter((v) => v !== id);
        if (kind === "guild") {
          group.officers = (group.officers ?? []).filter((v) => v !== id);
          if (group.city?.guards) delete group.city.guards[id];
        }
        if (!group.members.length) await tx.delete(kind, group.id);
        else {
          if (group.leaderId === id) group.leaderId = group.members[0];
          await tx.set(kind, group.id, group);
        }
      }
    for (const slot of ["portrait", "banner", "avatar"]) await tx.delete("profile_media", `${id}.${slot}`);
    await tx.delete("player", id);
    await tx.delete("admin_reset", token);
    await tx.set("admin_audit", token, { actorId, targetId: id, guildId, at: game.now(), action: "reset", name: p.name, level: p.level });
    return { type: "adminResetDone", message: `${p.name} a été réinitialisé. Ce joueur peut recréer son personnage avec /profil. Les autres joueurs conservent leurs biens et leurs blocages.` };
  });
}
