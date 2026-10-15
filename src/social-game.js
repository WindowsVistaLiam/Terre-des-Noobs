import { randomUUID } from "node:crypto";
import { ensure, statsOf } from "./game.js";
import { CLASSES, DAY, HOUR, dayKey } from "./content.js";
import {
  CITY_UPGRADES,
  cityUpgradeCost,
  INVASIONS,
  FRIEND_LIMIT,
  DEFENSE_ROLES,
} from "./social-content.js";

const idOf = () => randomUUID().replaceAll("-", "").slice(0, 12);
const validAmount = (n, max = 1000000) =>
  Number.isSafeInteger(n) && n >= 1 && n <= max;
const add = (target, resources) => {
  for (const [key, n] of Object.entries(resources))
    target[key] = (target[key] ?? 0) + n;
};
export function normalizeSocial(p) {
  p.social ??= {};
  for (const [key, value] of Object.entries({
    friends: [],
    blocked: [],
    honor: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    duelAt: null,
    cityClaimDay: null,
    defenses: 0,
  }))
    if (p.social[key] === undefined) p.social[key] = structuredClone(value);
  return p;
}
const summary = (p) => ({
  id: p.id,
  name: p.name,
  raceId: p.raceId,
  classId: p.classId,
  level: p.level,
  guildId: p.guildId,
  lastActiveAt: p.lastActiveAt ?? p.createdAt,
  honor: p.social?.honor ?? 0,
  wins: p.social?.wins ?? 0,
  losses: p.social?.losses ?? 0,
  defenses: p.social?.defenses ?? 0,
});
async function otherPlayer(tx, id) {
  const p = await tx.get("player", id);
  ensure(p, "Cet aventurier n’a pas encore de personnage.");
  return normalizeSocial(p);
}
function interact(a, b) {
  ensure(a.id !== b.id, "Choisis un autre aventurier.");
  ensure(
    !a.social.blocked.includes(b.id) && !b.social.blocked.includes(a.id),
    "Les interactions avec cet aventurier ne sont pas disponibles.",
  );
}
const active = (r, now) => r.status === "pending" && r.expiresAt > now;
const paged = (all, page = 1, size = 6) => {
  ensure(
    Number.isSafeInteger(page) && page >= 1 && page <= 10000,
    "Page invalide.",
  );
  const pages = Math.max(1, Math.ceil(all.length / size));
  page = Math.min(page, pages);
  return { entries: all.slice((page - 1) * size, page * size), page, pages };
};
async function inbox(tx, id, now) {
  const [friends, invitations, duels] = await Promise.all(
    ["friend_request", "guild_invite", "duel"].map((kind) => tx.list(kind)),
  );
  return {
    incoming: friends.filter((r) => r.to === id && active(r, now)),
    outgoing: friends.filter((r) => r.from === id && active(r, now)),
    invitations: invitations.filter((r) => r.to === id && active(r, now)),
    challenges: duels.filter((r) => r.to === id && active(r, now)),
  };
}
function logGuild(g, now, text) {
  g.log ??= [];
  g.log.unshift({ at: now, text });
  g.log = g.log.slice(0, 30);
}
export function normalizeCity(g, now) {
  g.officers ??= [];
  g.bulletin ??= "Bienvenue sous notre bannière.";
  g.log ??= [];
  g.city ??= {};
  const c = g.city;
  c.buildings ??= Object.fromEntries(
    Object.keys(CITY_UPGRADES).map((k) => [k, 0]),
  );
  for (const k of Object.keys(CITY_UPGRADES)) c.buildings[k] ??= 0;
  c.resources ??= {};
  c.guards ??= {};
  c.prestige ??= 0;
  c.warfare ??= false;
  c.shieldUntil ??= 0;
  c.attackAt ??= null;
  const maxIntegrity = 500 + g.level * 40 + c.buildings.remparts * 100;
  c.integrity ??= maxIntegrity;
  c.repairedAt ??= now;
  const hours = Math.max(0, Math.floor((now - c.repairedAt) / HOUR));
  c.integrity = Math.min(
    maxIntegrity,
    c.integrity + hours * (15 + c.buildings.infirmerie * 10),
  );
  c.repairedAt += hours * HOUR;
  for (const [uid, guard] of Object.entries(c.guards))
    if (guard.until <= now || !g.members.includes(uid)) delete c.guards[uid];
  return g;
}
export function cityStats(g) {
  const c = g.city,
    b = c.buildings;
  const guardPower = Object.values(c.guards).reduce((n, v) => n + v.power, 0);
  return {
    maxIntegrity: 500 + g.level * 40 + b.remparts * 100,
    defense: 130 + g.level * 20 + b.remparts * 60 + b.phare * 30 + guardPower,
    attack: 90 + g.level * 30 + b.caserne * 90,
    guards: Object.keys(c.guards).length,
  };
}
async function ownGuild(game, tx, p, now) {
  const g = await tx.get("guild", p.guildId ?? "");
  ensure(
    g && g.members.includes(p.id),
    "Rejoins ou fonde une guilde pour bâtir votre cité.",
  );
  normalizeCity(g, now);
  invasion(g, now);
  return g;
}
function officer(g, id) {
  ensure(
    g.leaderId === id || g.officers.includes(id),
    "Cette action est réservée au chef et aux officiers.",
  );
}
function invasion(g, now) {
  const day = dayKey(now);
  if (g.city.invasion?.day !== day) {
    const hp = 400 + g.level * 80 + Math.min(6, g.members.length) * 80;
    g.city.invasion = {
      day,
      name: INVASIONS[Math.floor(now / DAY) % INVASIONS.length],
      hp,
      maxHp: hp,
      contributions: {},
      sorties: {},
      lastSortie: {},
      claimed: [],
      won: false,
    };
  }
  return g.city.invasion;
}

export const socialMethods = {
  async socialInfo(tx, id, _, now) {
    const p = await this.player(tx, id, now);
    const mail = await inbox(tx, id, now);
    const guild = p.guildId ? await tx.get("guild", p.guildId) : null;
    return {
      p,
      type: "social",
      mail,
      guildName: guild?.name,
      friendsCount: p.social.friends.length,
    };
  },
  async friendsInfo(tx, id, { page = 1 }, now) {
    const p = await this.player(tx, id, now);
    const all = await tx.list("player");
    const friends = all
      .filter((v) => p.social.friends.includes(v.id))
      .map(summary)
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
    const blocked = all
      .filter((v) => p.social.blocked.includes(v.id))
      .map(summary);
    return { p, type: "friends", ...paged(friends, page), blocked };
  },
  async inboxInfo(tx, id, { page = 1 }, now) {
    const p = await this.player(tx, id, now);
    const mail = await inbox(tx, id, now);
    const all = [
      ...mail.incoming.map((record) => ({ kind: "friend", record })),
      ...mail.outgoing.map((record) => ({ kind: "friend", record })),
      ...mail.invitations.map((record) => ({ kind: "guild", record })),
      ...mail.challenges.map((record) => ({ kind: "duel", record })),
    ].sort((a, b) => b.record.createdAt - a.record.createdAt);
    return { p, type: "inbox", ...mail, ...paged(all, page) };
  },
  async directoryInfo(tx, id, { page = 1 }, now) {
    const p = await this.player(tx, id, now);
    const all = await tx.list("player");
    const players = all
      .filter(
        (v) =>
          v.id !== id &&
          !p.social.blocked.includes(v.id) &&
          !v.social?.blocked?.includes(id),
      )
      .map(summary)
      .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
    return { p, type: "directory", ...paged(players, page) };
  },
  async playerCard(tx, id, { targetId }, now) {
    const p = await this.player(tx, id, now),
      target = await otherPlayer(tx, targetId);
    const guild = target.guildId ? await tx.get("guild", target.guildId) : null;
    const own = p.guildId ? await tx.get("guild", p.guildId) : null;
    return {
      p,
      type: "playerCard",
      target: {
        ...summary(target),
        stats: statsOf(target),
        guildName: guild?.name,
      },
      canInvite: Boolean(
        own && (own.leaderId === id || own.officers?.includes(id)),
      ),
      isFriend: p.social.friends.includes(target.id),
      blocked: p.social.blocked.includes(target.id),
      unavailable: target.social.blocked.includes(id),
      mutualCount: p.social.friends.filter((uid) =>
        target.social.friends.includes(uid),
      ).length,
    };
  },
  async friendRequest(tx, id, { targetId }, now) {
    const p = await this.player(tx, id, now),
      target = await otherPlayer(tx, targetId);
    interact(p, target);
    ensure(!p.social.friends.includes(targetId), "Vous êtes déjà amis.");
    ensure(
      p.social.friends.length < FRIEND_LIMIT &&
        target.social.friends.length < FRIEND_LIMIT,
      "La liste d’amis de l’un de vous est complète (100).",
    );
    const all = await tx.list("friend_request");
    ensure(
      all.filter((r) => r.from === id && active(r, now)).length < 10,
      "Tu as déjà 10 demandes en attente.",
    );
    const old = await tx.get("friend_request", `${id}.${targetId}`);
    ensure(
      !old || old.expiresAt <= now,
      "Une demande existe déjà, ou le délai après son refus n’est pas terminé.",
    );
    ensure(
      !all.some((r) => r.from === targetId && r.to === id && active(r, now)),
      "Cet aventurier t’a déjà envoyé une demande : ouvre ta boîte de réception.",
    );
    await tx.set("friend_request", `${id}.${targetId}`, {
      id: `${id}.${targetId}`,
      from: id,
      to: targetId,
      fromName: p.name,
      toName: target.name,
      status: "pending",
      createdAt: now,
      expiresAt: now + 7 * DAY,
    });
    return {
      p,
      type: "social",
      message: `Demande envoyée à ${target.name}. Elle apparaîtra dans sa boîte de réception Social pendant 7 jours.`,
    };
  },
  async friendRespond(tx, id, { requestId, response }, now) {
    const p = await this.player(tx, id, now);
    const r = await tx.get("friend_request", requestId);
    ensure(r && active(r, now), "Cette demande n’est plus disponible.");
    ensure(
      ["accept", "decline", "cancel"].includes(response),
      "Réponse inconnue.",
    );
    ensure(
      response === "cancel" ? r.from === id : r.to === id,
      "Cette demande ne t’appartient pas.",
    );
    const target = await otherPlayer(tx, response === "cancel" ? r.to : r.from);
    if (response === "accept") {
      interact(p, target);
      ensure(
        p.social.friends.length < FRIEND_LIMIT &&
          target.social.friends.length < FRIEND_LIMIT,
        "Une liste d’amis est complète.",
      );
      if (!p.social.friends.includes(target.id))
        p.social.friends.push(target.id);
      if (!target.social.friends.includes(id)) target.social.friends.push(id);
      await this.save(tx, target);
      r.status = "accepted";
    } else r.status = response === "cancel" ? "cancelled" : "declined";
    r.expiresAt = now + (response === "cancel" ? HOUR : DAY);
    await tx.set("friend_request", r.id, r);
    await this.save(tx, p);
    return {
      p,
      type: "social",
      message:
        response === "accept"
          ? `Toi et ${target.name} êtes maintenant amis !`
          : "Demande classée. Aucune notification privée n’est envoyée.",
    };
  },
  async friendRemove(tx, id, { targetId }, now) {
    const p = await this.player(tx, id, now),
      target = await otherPlayer(tx, targetId);
    ensure(
      p.social.friends.includes(targetId),
      "Cet aventurier n’est pas dans ta liste d’amis.",
    );
    p.social.friends = p.social.friends.filter((v) => v !== targetId);
    target.social.friends = target.social.friends.filter((v) => v !== id);
    await this.save(tx, p);
    await this.save(tx, target);
    return {
      p,
      type: "social",
      message: "Cet aventurier a été retiré de ta liste d’amis.",
    };
  },
  async blockPlayer(tx, id, { targetId }, now) {
    const p = await this.player(tx, id, now),
      target = await otherPlayer(tx, targetId);
    ensure(id !== targetId, "Tu ne peux pas te bloquer toi-même.");
    ensure(
      p.social.blocked.length < 100 || p.social.blocked.includes(targetId),
      "Ta liste de blocage est complète.",
    );
    if (!p.social.blocked.includes(targetId)) p.social.blocked.push(targetId);
    p.social.friends = p.social.friends.filter((v) => v !== targetId);
    target.social.friends = target.social.friends.filter((v) => v !== id);
    for (const kind of ["friend_request", "duel", "guild_invite"])
      for (const r of await tx.list(kind))
        if (
          r.status === "pending" &&
          ((r.from === id && r.to === targetId) ||
            (r.from === targetId && r.to === id))
        ) {
          r.status = "blocked";
          await tx.set(kind, r.id, r);
        }
    await this.save(tx, p);
    await this.save(tx, target);
    return {
      p,
      type: "social",
      message:
        "Aventurier bloqué : demandes, défis, invitations et cadeaux directs sont désactivés entre vous.",
    };
  },
  async unblockPlayer(tx, id, { targetId }, now) {
    const p = await this.player(tx, id, now);
    p.social.blocked = p.social.blocked.filter((v) => v !== targetId);
    await this.save(tx, p);
    return {
      p,
      type: "social",
      message:
        "Aventurier débloqué. Votre ancienne amitié n’est pas rétablie automatiquement.",
    };
  },
  async duelChallenge(tx, id, { targetId }, now) {
    const p = await this.player(tx, id, now),
      target = await otherPlayer(tx, targetId);
    this.home(p);
    interact(p, target);
    const all = await tx.list("duel");
    ensure(
      all.filter((r) => r.from === id && active(r, now)).length < 3,
      "Tu as déjà 3 défis en attente.",
    );
    ensure(
      !all.some(
        (r) =>
          active(r, now) &&
          [r.from, r.to].includes(id) &&
          [r.from, r.to].includes(targetId),
      ),
      "Un défi existe déjà entre vous.",
    );
    const duel = {
      id: idOf(),
      from: id,
      to: targetId,
      fromName: p.name,
      toName: target.name,
      createdAt: now,
      expiresAt: now + 15 * 60000,
      status: "pending",
    };
    await tx.set("duel", duel.id, duel);
    return {
      p,
      type: "duel",
      duel,
      message: `${target.name} peut accepter ton défi dans Social → Réception. Duel d’entraînement, sans perte de vie, d’or ou d’objet.`,
    };
  },
  async duelRespond(tx, id, { duelId, response }, now) {
    const p = await this.player(tx, id, now);
    const duel = await tx.get("duel", duelId);
    ensure(duel && active(duel, now), "Ce défi n’est plus disponible.");
    ensure(
      ["accept", "decline", "cancel"].includes(response),
      "Réponse inconnue.",
    );
    ensure(
      response === "cancel" ? duel.from === id : duel.to === id,
      "Ce défi ne t’appartient pas.",
    );
    if (response !== "accept") {
      duel.status = response === "cancel" ? "cancelled" : "declined";
      await tx.set("duel", duel.id, duel);
      return { p, type: "duel", duel, message: "Le défi est classé." };
    }
    const a = await otherPlayer(tx, duel.from),
      b = normalizeSocial(p);
    interact(a, b);
    this.home(a);
    this.home(b);
    ensure(
      [a, b].every(
        (v) => v.social.duelAt === null || now - v.social.duelAt >= 60000,
      ),
      "Chaque joueur doit attendre une minute entre deux duels.",
    );
    const fighters = [a, b].map((v) => ({
      p: v,
      s: statsOf(v),
      hp: statsOf(v).hp,
      mana: statsOf(v).mana,
      damage: 0,
      healed: 0,
    }));
    let turns = 0;
    for (turns = 1; turns <= 40 && fighters.every((f) => f.hp > 0); turns++) {
      // Ordre alterné pour éviter un avantage permanent au premier joueur.
      const order = turns % 2 ? [0, 1] : [1, 0];
      for (const i of order) {
        const f = fighters[i],
          enemy = fighters[1 - i];
        if (f.hp <= 0 || enemy.hp <= 0) break;
        const sk = CLASSES[f.p.classId].skill;
        const use =
          turns % 2 === 1 &&
          f.mana >= sk.cost &&
          (sk.kind !== "heal" || f.hp < f.s.hp * 0.65);
        if (use) f.mana -= sk.cost;
        else f.mana = Math.min(f.s.mana, f.mana + 3);
        if (use && sk.kind === "heal") {
          const heal = Math.round(
            f.s.power * sk.multiplier * (1 + f.s.healing),
          );
          const before = f.hp;
          f.hp = Math.min(f.s.hp, f.hp + heal);
          f.healed += f.hp - before;
          continue;
        }
        const magical = use && ["magic", "drain_magic"].includes(sk.kind);
        let mult = use ? sk.multiplier : 1;
        if (use && sk.kind === "execute" && enemy.hp / enemy.s.hp < 0.35)
          mult *= 2;
        if (use && sk.kind === "rage")
          f.hp = Math.max(1, f.hp - Math.ceil(f.s.hp * 0.08));
        const defense =
          enemy.s.defense *
          (magical || (use && sk.kind === "pierce") ? 0.5 : 1);
        const damage = this.hit(
          magical ? f.s.power : Math.max(f.s.attack, f.s.power * 0.85),
          defense,
          mult * (this.random() < f.s.crit ? 1.6 : 1),
        );
        const dealt = Math.min(enemy.hp, damage);
        enemy.hp = Math.max(0, enemy.hp - damage);
        f.damage += dealt;
        if (use && sk.kind.startsWith("drain")) {
          const before = f.hp;
          f.hp = Math.min(
            f.s.hp,
            f.hp + Math.ceil(dealt * 0.35 * (1 + f.s.healing)),
          );
          f.healed += f.hp - before;
        }
      }
      if (fighters.some((f) => f.hp <= 0)) break;
    }
    const winner =
      fighters[0].hp <= 0 ? b.id : fighters[1].hp <= 0 ? a.id : null;
    for (const f of fighters) {
      f.p.social.duelAt = now;
      if (!winner) f.p.social.draws++;
      else if (winner === f.p.id) f.p.social.wins++;
      else f.p.social.losses++;
      // Le classement compte les victoires ; aucune monnaie ou XP ne se crée.
      await this.save(tx, f.p);
    }
    duel.status = "finished";
    duel.finishedAt = now;
    duel.winner = winner;
    duel.turns = Math.min(turns, 40);
    duel.fighters = fighters.map((f) => ({
      id: f.p.id,
      name: f.p.name,
      hp: f.hp,
      maxHp: f.s.hp,
      damage: f.damage,
      healed: f.healed,
    }));
    await tx.set("duel", duel.id, duel);
    return {
      p: fighters.find((f) => f.p.id === id).p,
      type: "duel",
      duel,
      message: winner
        ? `${fighters.find((f) => f.p.id === winner).p.name} remporte le duel d’entraînement ! Vos jauges réelles et vos coffres sont intacts.`
        : "Égalité au terme de 40 tours. Vos personnages restent intacts.",
    };
  },
  async duelsInfo(tx, id, { page = 1 }, now) {
    const p = await this.player(tx, id, now);
    const all = (await tx.list("duel"))
      .filter(
        (d) =>
          [d.from, d.to].includes(id) &&
          (d.status === "finished" || active(d, now)),
      )
      .sort((a, b) => b.createdAt - a.createdAt);
    return { p, type: "duels", ...paged(all, page) };
  },
  async duelInfo(tx, id, { duelId }, now) {
    const p = await this.player(tx, id, now);
    const duel = await tx.get("duel", duelId);
    ensure(
      duel && [duel.from, duel.to].includes(id),
      "Ce duel ne t’appartient pas.",
    );
    return { p, type: "duel", duel };
  },
  async pvpLeaderboard(tx, id, _, now) {
    const p = await this.player(tx, id, now);
    const leaders = (await tx.list("player"))
      .map(summary)
      .sort((a, b) => b.wins - a.wins || b.honor - a.honor)
      .slice(0, 10);
    return { p, type: "pvpLeaderboard", leaders };
  },

  async guildInvite(tx, id, { targetId }, now) {
    const p = await this.player(tx, id, now),
      target = await otherPlayer(tx, targetId);
    interact(p, target);
    const g = await ownGuild(this, tx, p, now);
    officer(g, id);
    ensure(!target.guildId, "Cet aventurier a déjà une guilde.");
    ensure(g.members.length < 30, "La guilde est complète.");
    const invitations = await tx.list("guild_invite");
    ensure(
      invitations.filter((r) => r.guildId === g.id && active(r, now)).length <
        10,
      "La guilde a déjà 10 invitations en attente.",
    );
    const key = `${g.id}.${targetId}`;
    const old = await tx.get("guild_invite", key);
    ensure(
      !old || old.expiresAt <= now,
      "Une invitation existe déjà ou vient d’être refusée.",
    );
    await tx.set("guild_invite", key, {
      id: key,
      from: id,
      fromName: p.name,
      to: targetId,
      toName: target.name,
      guildId: g.id,
      guildName: g.name,
      status: "pending",
      createdAt: now,
      expiresAt: now + 7 * DAY,
    });
    return {
      p,
      type: "social",
      message: `Invitation à ${g.name} déposée dans la réception de ${target.name}.`,
    };
  },
  async guildInviteRespond(tx, id, { invitationId, response }, now) {
    const p = await this.player(tx, id, now),
      r = await tx.get("guild_invite", invitationId);
    ensure(r && r.to === id && active(r, now), "Invitation indisponible.");
    ensure(["accept", "decline"].includes(response), "Réponse inconnue.");
    if (response === "accept") {
      const inviter = await otherPlayer(tx, r.from);
      interact(p, inviter);
      const g = await tx.get("guild", r.guildId);
      ensure(
        g && g.members.includes(r.from),
        "Cette invitation n’est plus valable.",
      );
      const result = await this.guildJoin(tx, id, { guildId: r.guildId }, now);
      r.status = "accepted";
      await tx.set("guild_invite", r.id, r);
      return result;
    }
    r.status = "declined";
    r.expiresAt = now + DAY;
    await tx.set("guild_invite", r.id, r);
    return { p, type: "social", message: "Invitation déclinée." };
  },
  async guildManage(tx, id, { targetId, operation }, now) {
    const p = await this.player(tx, id, now),
      g = await ownGuild(this, tx, p, now);
    ensure(g.leaderId === id, "Seul le chef peut gérer les membres.");
    ensure(
      id !== targetId && g.members.includes(targetId),
      "Choisis un autre membre de la guilde.",
    );
    ensure(
      ["promote", "demote", "kick"].includes(operation),
      "Action de gestion inconnue.",
    );
    const target = await otherPlayer(tx, targetId);
    if (operation === "promote") {
      if (!g.officers.includes(targetId)) g.officers.push(targetId);
    } else g.officers = g.officers.filter((v) => v !== targetId);
    if (operation === "kick") {
      g.members = g.members.filter((v) => v !== targetId);
      delete g.city.guards[targetId];
      target.guildId = null;
      await this.save(tx, target);
    }
    logGuild(
      g,
      now,
      `${p.name} : ${target.name} ${operation === "promote" ? "devient officier" : operation === "demote" ? "redevient membre" : "quitte la guilde sur décision du chef"}.`,
    );
    await tx.set("guild", g.id, g);
    return {
      p,
      guild: g,
      type: "guild",
      message: "La gestion de la guilde a été mise à jour.",
    };
  },
  async guildBulletin(tx, id, { text }, now) {
    const p = await this.player(tx, id, now),
      g = await ownGuild(this, tx, p, now);
    officer(g, id);
    ensure(
      typeof text === "string" &&
        text.trim().length >= 3 &&
        text.trim().length <= 180,
      "Le message doit contenir 3 à 180 caractères.",
    );
    g.bulletin = text.trim().replace(/[\u0000-\u001f]/g, " ");
    logGuild(g, now, `${p.name} met à jour le message de guilde.`);
    await tx.set("guild", g.id, g);
    return {
      p,
      guild: g,
      type: "guild",
      message: "Message de guilde affiché sur votre bannière.",
    };
  },

  async cityInfo(tx, id, _, now) {
    const p = await this.player(tx, id, now);
    const g = await ownGuild(this, tx, p, now);
    invasion(g, now);
    await tx.set("guild", g.id, g);
    return { p, guild: g, type: "city", cityStats: cityStats(g) };
  },
  async cityDonate(tx, id, { resource, quantity }, now) {
    const p = await this.player(tx, id, now);
    this.home(p);
    const g = await ownGuild(this, tx, p, now);
    ensure(
      ["bois", "pierre", "fer", "herbe", "essence"].includes(resource) &&
        validAmount(quantity, 10000),
      "Choisis une ressource de construction et une quantité de 1 à 10 000.",
    );
    this.spend(p, 0, { [resource]: quantity });
    add(g.city.resources, { [resource]: quantity });
    logGuild(g, now, `${p.name} donne ${quantity} ${resource} à la cité.`);
    await tx.set("guild", g.id, g);
    await this.save(tx, p);
    return {
      p,
      guild: g,
      type: "city",
      cityStats: cityStats(g),
      message: "Matériaux déposés dans la réserve commune.",
    };
  },
  async cityUpgrade(tx, id, { buildingId }, now) {
    const p = await this.player(tx, id, now);
    this.home(p);
    const g = await ownGuild(this, tx, p, now);
    officer(g, id);
    ensure(CITY_UPGRADES[buildingId], "Construction inconnue.");
    const next = g.city.buildings[buildingId] + 1;
    ensure(next <= 5, "Niveau maximal atteint (5).");
    const cost = cityUpgradeCost(buildingId, next);
    ensure(g.gold >= cost.gold, `Le trésor doit contenir ${cost.gold} or.`);
    for (const [key, qty] of Object.entries(cost.resources))
      ensure(
        (g.city.resources[key] ?? 0) >= qty,
        `La réserve commune doit contenir ${qty} ${key}.`,
      );
    g.gold -= cost.gold;
    for (const [key, qty] of Object.entries(cost.resources))
      g.city.resources[key] -= qty;
    g.city.buildings[buildingId] = next;
    if (buildingId === "remparts") g.city.integrity += 100;
    logGuild(
      g,
      now,
      `${p.name} améliore ${CITY_UPGRADES[buildingId].name} au niveau ${next}.`,
    );
    await tx.set("guild", g.id, g);
    return {
      p,
      guild: g,
      type: "city",
      cityStats: cityStats(g),
      message: `${CITY_UPGRADES[buildingId].name} renforcé !`,
    };
  },
  async cityGuard(tx, id, _, now) {
    const p = await this.player(tx, id, now);
    this.home(p);
    const g = await ownGuild(this, tx, p, now);
    ensure(!g.city.guards[id], "Tu montes déjà la garde pour cette journée.");
    ensure(p.energy >= 10, "Monter la garde demande 10 énergie.");
    const s = statsOf(p);
    p.energy -= 10;
    g.city.guards[id] = {
      until: now + DAY,
      power: Math.min(200, Math.round(s.defense * 2 + s.hp * 0.12)),
      name: p.name,
    };
    logGuild(g, now, `${p.name} prend la garde pour 24 heures.`);
    await this.save(tx, p);
    await tx.set("guild", g.id, g);
    return {
      p,
      guild: g,
      type: "city",
      cityStats: cityStats(g),
      message:
        "Tu renforces la défense de siège pendant 24 heures. Tu peux continuer tes aventures.",
    };
  },
  async cityDefense(tx, id, { role }, now) {
    const p = await this.player(tx, id, now);
    this.home(p);
    const g = await ownGuild(this, tx, p, now);
    ensure(
      g.members.length >= 2,
      "Deux membres au moins sont nécessaires pour défendre ensemble la cité.",
    );
    const e = invasion(g, now);
    ensure(DEFENSE_ROLES[role], "Rôle de défense inconnu.");
    ensure(!e.won, "L’invasion du jour a déjà été repoussée.");
    ensure(
      (e.sorties[id] ?? 0) < 3,
      "Tu as effectué tes trois sorties du jour.",
    );
    ensure(
      !e.lastSortie[id] || now - e.lastSortie[id] >= 5 * 60000,
      "Attends cinq minutes entre deux sorties.",
    );
    ensure(p.energy >= 10, "Une sortie demande 10 énergie.");
    const s = statsOf(p);
    ensure(
      p.hp >= s.hp * 0.5,
      "Récupère au moins 50 % de tes PV avant une sortie.",
    );
    const b = g.city.buildings;
    const base =
      role === "assault"
        ? Math.max(s.attack, s.power) * 2.5 + b.caserne * 18
        : role === "bastion"
          ? s.defense * 4 + s.hp * 0.22 + b.remparts * 18
          : s.power * 2.2 + s.hp * 0.1 + b.infirmerie * 20;
    const score = Math.max(
      20,
      Math.round((base + b.phare * 8) * (0.9 + this.random() * 0.2)),
    );
    const applied = Math.min(e.hp, score);
    e.hp -= applied;
    e.contributions[id] = (e.contributions[id] ?? 0) + applied;
    e.sorties[id] = (e.sorties[id] ?? 0) + 1;
    e.lastSortie[id] = now;
    p.energy -= 10;
    p.hp = Math.max(1, p.hp - Math.ceil(s.hp * 0.1));
    logGuild(
      g,
      now,
      `${p.name} mène une sortie ${DEFENSE_ROLES[role]} : ${applied} points de menace retirés.`,
    );
    if (e.hp <= 0) {
      e.won = true;
      g.city.prestige += 25;
      g.gold += 100 + g.level * 50;
      logGuild(
        g,
        now,
        `L’invasion est repoussée ! +25 prestige et renfort du trésor.`,
      );
    }
    await this.save(tx, p);
    await tx.set("guild", g.id, g);
    return {
      p,
      guild: g,
      type: "city",
      cityStats: cityStats(g),
      message: `Sortie ${DEFENSE_ROLES[role]} : -${applied} menace. ${e.won ? "La cité est sauvée ! Les participants peuvent réclamer leur récompense." : "Tes compagnons peuvent prendre le relais."}`,
    };
  },
  async cityClaim(tx, id, _, now) {
    const p = await this.player(tx, id, now);
    const g = await ownGuild(this, tx, p, now),
      e = invasion(g, now);
    ensure(
      e.won && e.contributions[id] > 0,
      "Participe à une invasion victorieuse pour réclamer la récompense.",
    );
    ensure(
      !e.claimed.includes(id) && p.social.cityClaimDay !== dayKey(now),
      "Tu as déjà reçu ta récompense de défense du jour.",
    );
    e.claimed.push(id);
    p.social.cityClaimDay = dayKey(now);
    p.social.defenses++;
    p.social.honor += 5;
    const gold = 80 + g.level * 25,
      xp = 90 + g.level * 50;
    p.gold += gold;
    this.gainXp(p, xp);
    add(p.resources, { bois: 12, pierre: 12, fer: 3 });
    await this.save(tx, p);
    await tx.set("guild", g.id, g);
    return {
      p,
      guild: g,
      type: "city",
      cityStats: cityStats(g),
      message: `Défenseur de la cité : +${gold} or, ${xp} XP, 12 bois, 12 pierres, 3 fers et 5 honneur. Une récompense par jour, toutes guildes confondues.`,
    };
  },
  async cityWarToggle(tx, id, _, now) {
    const p = await this.player(tx, id, now),
      g = await ownGuild(this, tx, p, now);
    ensure(
      g.leaderId === id,
      "Seul le chef peut engager la cité dans les sièges.",
    );
    ensure(
      !g.city.warfare ||
        g.city.attackAt === null ||
        now - g.city.attackAt >= 6 * HOUR,
      "Attends la fin des six heures de récupération avant de quitter les sièges.",
    );
    g.city.warfare = !g.city.warfare;
    logGuild(
      g,
      now,
      `${p.name} ${g.city.warfare ? "active" : "désactive"} les sièges entre guildes.`,
    );
    await tx.set("guild", g.id, g);
    return {
      p,
      guild: g,
      type: "city",
      cityStats: cityStats(g),
      message: g.city.warfare
        ? "Sièges activés : les autres cités volontaires de niveau comparable peuvent vous attaquer. Coffres personnels et bâtiments sont protégés."
        : "Les sièges sont désactivés pour votre cité.",
    };
  },
  async cityTargets(tx, id, { page = 1 }, now) {
    const p = await this.player(tx, id, now),
      g = await ownGuild(this, tx, p, now);
    const targets = (await tx.list("guild"))
      .filter(
        (v) =>
          v.id !== g.id && v.city?.warfare && Math.abs(v.level - g.level) <= 2,
      )
      .map((v) => {
        normalizeCity(v, now);
        return {
          id: v.id,
          name: v.name,
          level: v.level,
          city: v.city,
          cityStats: cityStats(v),
        };
      });
    return { p, guild: g, type: "cityTargets", ...paged(targets, page) };
  },
  async citySiege(tx, id, { guildId }, now) {
    const p = await this.player(tx, id, now);
    this.home(p);
    const g = await ownGuild(this, tx, p, now);
    officer(g, id);
    const target = await tx.get("guild", guildId);
    ensure(target && target.id !== g.id, "Cité adverse introuvable.");
    normalizeCity(target, now);
    ensure(
      g.city.warfare && target.city.warfare,
      "Les deux cités doivent avoir activé les sièges.",
    );
    ensure(
      Math.abs(g.level - target.level) <= 2,
      "Les cités doivent avoir des niveaux de guilde comparables (écart maximal : 2).",
    );
    ensure(
      g.city.attackAt === null || now - g.city.attackAt >= 6 * HOUR,
      "Votre armée récupère pendant six heures entre deux sièges.",
    );
    ensure(
      target.city.shieldUntil <= now,
      "Cette cité bénéficie encore de sa protection de six heures.",
    );
    ensure(
      g.city.integrity >= cityStats(g).maxIntegrity * 0.5,
      "Réparez votre cité à au moins 50 % avant un siège.",
    );
    ensure(
      g.gold >= 120 && p.energy >= 15,
      "Un siège demande 120 or du trésor et 15 de ton énergie.",
    );
    const s = statsOf(p);
    const attack = Math.round(
      (cityStats(g).attack + Math.max(s.attack, s.power) * 2) *
        (0.9 + this.random() * 0.2),
    );
    const defense = Math.round(
      cityStats(target).defense * (0.9 + this.random() * 0.2),
    );
    const won = attack > defense;
    g.gold -= 120;
    p.energy -= 15;
    g.city.attackAt = now;
    target.city.shieldUntil = now + 6 * HOUR;
    const damage = Math.max(20, Math.round((won ? attack : defense) * 0.3));
    if (won) {
      target.city.integrity = Math.max(
        Math.ceil(cityStats(target).maxIntegrity * 0.25),
        target.city.integrity - damage,
      );
      g.city.prestige += 30;
    } else {
      g.city.integrity = Math.max(
        Math.ceil(cityStats(g).maxIntegrity * 0.25),
        g.city.integrity - damage,
      );
      target.city.prestige += 15;
    }
    const text = `${g.name} attaque ${target.name} : ${won ? "victoire des assaillants" : "les défenseurs tiennent bon"}.`;
    logGuild(g, now, text);
    logGuild(target, now, text);
    const siege = {
      id: idOf(),
      from: g.id,
      to: target.id,
      attacker: g.name,
      defender: target.name,
      attack,
      defense,
      won,
      createdAt: now,
    };
    await tx.set("siege", siege.id, siege);
    await tx.set("guild", g.id, g);
    await tx.set("guild", target.id, target);
    await this.save(tx, p);
    return {
      p,
      type: "siege",
      siege,
      message: `${text} Aucun coffre n’est pillé, aucun bâtiment n’est détruit. Les cités se réparent progressivement ; la défense bénéficie de six heures de protection.`,
    };
  },
};
