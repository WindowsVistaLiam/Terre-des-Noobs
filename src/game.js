import { randomInt, randomUUID } from "node:crypto";
import { socialMethods, normalizeSocial } from "./social-game.js";
import { DRAIN_RATES, drainHealing, hpChangeText } from "./combat-math.js";
import { campaignEnemy, campaignMarker, guardianReady } from "./campaign.js";
import { identityMethods } from "./identity-game.js";
import { specializationOf, skillOf, activateTechnique, techniqueDamage, techniqueProtection } from "./specializations.js";
import { normalizeAdventures } from "./honors.js";
import { gearIcon } from "./equipment-art.js";
import {
  RACES,
  CLASSES,
  ZONES,
  BUILDINGS,
  RESOURCES,
  RECIPES,
  RARITIES,
  RAIDS,
  DAILY_QUESTS,
  HOUR,
  DAY,
  MAX_LEVEL,
  xpRequired,
  worldEvent,
  dayKey,
  buildingCost,
  SHOP,
  VICTORIES_FOR_BOSS,
} from "./content.js";

export class GameError extends Error {}
export const ensure = (condition, message) => {
  if (!condition) throw new GameError(message);
};
const integer = (n, min = 1, max = 1_000_000) =>
  Number.isSafeInteger(n) && n >= min && n <= max;
const add = (target, source) => {
  for (const [key, value] of Object.entries(source))
    target[key] = (target[key] ?? 0) + value;
};
const emptyBag = () => ({ gold: 0, resources: {}, gear: [] });
const shortId = () => randomUUID().replaceAll("-", "").slice(0, 12);
export const gearLabel = (item) =>
  `${RARITIES[item.rarity].emoji} ${item.name}${item.upgrade ? ` +${item.upgrade}` : ""}`;
export const activeBuilding = (p, b) => b && (!BUILDINGS[b.type].races.length || BUILDINGS[b.type].races.includes(p.raceId));

export function statsOf(p) {
  const base = CLASSES[p.classId].stats;
  const n = p.level - 1;
  const s = {
    hp: base.hp + n * 7,
    mana: base.mana + n * 2,
    attack: base.attack + n * 2.5,
    defense: base.defense + n,
    power: base.power + n * 2.5,
    crit: 0.05,
    luck: 0,
    healing: 0,
    gold: 0,
    xp: 0,
  };
  if (base.crit) s.crit += base.crit;
  add(s, specializationOf(p)?.bonuses ?? {});
  add(s, RACES[p.raceId].bonuses);
  add(s, {
    attack: p.talents.attack * 2,
    defense: p.talents.defense * 2,
    power: p.talents.power * 2,
    hp: p.talents.vitality * 10,
  });
  for (const b of p.buildings.filter(Boolean)) {
    if (BUILDINGS[b.type].races.length && !BUILDINGS[b.type].races.includes(p.raceId)) continue;
    for (const [k, v] of Object.entries(BUILDINGS[b.type].bonuses))
      s[k] += v * b.level;
  }
  for (const id of Object.values(p.equipment)) {
    const item = p.gear.find((g) => g.id === id);
    if (item) add(s, item.stats);
  }
  s.crit = Math.min(0.65, s.crit);
  s.luck = Math.min(0.6, s.luck);
  for (const k of ["hp", "mana", "attack", "defense", "power"])
    s[k] = Math.round(s[k]);
  return s;
}

export class Game {
  constructor(
    store,
    { random = () => randomInt(0, 1_000_000) / 1_000_000, now = Date.now } = {},
  ) {
    this.store = store;
    this.random = random;
    this.now = now;
  }
  pick(list) {
    return list[Math.floor(this.random() * list.length)];
  }
  async execute(action, userId, args = {}, { requestId } = {}) {
    const handlers = new Set([
      "create",
      "profile",
      "inventory",
      "travel",
      "explore",
      "encountersInfo",
      "campaignMap",
      "combat",
      "returnHome",
      "rest",
      "daily",
      "quests",
      "claimQuest",
      "talent",
      "equip",
      "unequip",
      "consume",
      "build",
      "upgradeBuilding",
      "demolish",
      "collect",
      "craft",
      "enchant",
      "salvage",
      "market",
      "sell",
      "buy",
      "cancelListing",
      "gift",
      "leaderboard",
      "guildCreate",
      "guildJoin",
      "guildInfo",
      "guildDonate",
      "guildUpgrade",
      "guildLeave",
      "partyCreate",
      "partyJoin",
      "partyLeave",
      "partyInfo",
      "raid",
      "shopBuy",
      "customizeInfo",
      "customizeText",
      "customizeImage",
      "customizeReset",
      ...Object.keys(socialMethods),
      ...Object.keys(identityMethods),
    ]);
    ensure(handlers.has(action), "Action inconnue.");
    return this.store.transaction(async (tx) => {
      const now = this.now();
      if (requestId && (await tx.get("interaction", requestId)))
        return { duplicate: true };
      const result = await this[action](tx, userId, args, now);
      if (result.p?.id === userId) {
        result.p.lastActiveAt = now;
        await this.save(tx, result.p);
      }
      if (requestId)
        await tx.set("interaction", requestId, {
          id: requestId,
          createdAt: now,
        });
      return { ...result, now };
    });
  }
  async player(tx, id, now) {
    const p = await tx.get("player", id);
    ensure(
      p,
      "Ouvre /profil et crée ton personnage pour rejoindre Brumeterre.",
    );
    ensure(
      p.schemaVersion === 1,
      "Cette sauvegarde nécessite une migration. Contacte l’administrateur.",
    );
    normalizeSocial(p);
    normalizeAdventures(p);
    p.customization ??= { title: "", bio: "", portrait: null, banner: null };
    const s = statsOf(p);
    const energyTicks = Math.max(
      0,
      Math.floor((now - p.energyAt) / (5 * 60_000)),
    );
    p.energy = Math.min(100, p.energy + energyTicks);
    p.energyAt += energyTicks * 5 * 60_000;
    if (p.location === "base") {
      const ticks = Math.max(0, Math.floor((now - p.recoveryAt) / 60_000));
      p.hp = Math.min(s.hp, p.hp + ticks * Math.max(2, Math.ceil(s.hp * 0.02)));
      p.mana = Math.min(s.mana, p.mana + ticks * 3);
      p.recoveryAt += ticks * 60_000;
    } else p.recoveryAt = now;
    p.hp = Math.min(p.hp, s.hp);
    p.mana = Math.min(p.mana, s.mana);
    if (p.quests.day !== dayKey(now))
      p.quests = {
        day: dayKey(now),
        kills: 0,
        gather: 0,
        craft: 0,
        claimed: [],
      };
    await tx.set("player", p.id, p);
    return p;
  }
  home(p) {
    ensure(
      p.location === "base" && !p.battle,
      "Rentre à la base pour effectuer cette action.",
    );
  }
  noBattle(p) {
    ensure(!p.battle, "Termine le combat depuis Profil → Aventure.");
  }
  async save(tx, p) {
    normalizeSocial(p);
    normalizeAdventures(p);
    p.customization ??= { title: "", bio: "", portrait: null, banner: null };
    await tx.set("player", p.id, p);
  }
  spend(p, gold, resources = {}) {
    ensure(p.gold >= gold, `Il te manque ${gold - p.gold} pièces d’or.`);
    for (const [k, qty] of Object.entries(resources))
      ensure(
        (p.resources[k] ?? 0) >= qty,
        `Il faut ${qty} ${RESOURCES[k]} (tu en as ${p.resources[k] ?? 0}).`,
      );
    p.gold -= gold;
    for (const [k, qty] of Object.entries(resources)) p.resources[k] -= qty;
  }
  gainXp(p, amount) {
    p.xp += Math.round(amount);
    let levels = 0;
    while (p.level < MAX_LEVEL && p.xp >= xpRequired(p.level)) {
      p.xp -= xpRequired(p.level);
      p.level++;
      p.talentPoints++;
      levels++;
    }
    if (p.level === MAX_LEVEL) p.xp = 0;
    if (levels) {
      const s = statsOf(p);
      p.hp = Math.min(s.hp, p.hp + levels * 20);
      p.mana = Math.min(s.mana, p.mana + levels * 10);
    }
    return levels;
  }
  generateGear(level, slot = this.pick(["weapon", "armor", "charm"]), rarity) {
    if (rarity === undefined) {
      const roll = this.random();
      rarity =
        roll < 0.01
          ? 4
          : roll < 0.07
            ? 3
            : roll < 0.25
              ? 2
              : roll < 0.55
                ? 1
                : 0;
    }
    const scale = RARITIES[rarity].multiplier * (2 + level * 0.85);
    const stats =
      slot === "weapon"
        ? { attack: Math.ceil(scale), power: Math.ceil(scale) }
        : slot === "armor"
          ? { defense: Math.ceil(scale * 0.6), hp: Math.ceil(scale * 3) }
          : {
              power: Math.ceil(scale * 0.7),
              hp: Math.ceil(scale * 2),
              crit: 0.01 * (rarity + 1),
            };
    const names = {
      weapon: ["Lame", "Arc", "Bâton", "Hache", "Rapière"],
      armor: ["Cuirasse", "Manteau", "Cotte", "Armure"],
      charm: ["Talisman", "Anneau", "Médaillon", "Sceau"],
    };
    const name = `${this.pick(names[slot])} ${this.pick(["de l’aube", "des brumes", "du serment", "de Vesper", "des étoiles"])}`;
    return {
      id: shortId(), name, icon: gearIcon({ name, slot }),
      level,
      slot,
      rarity,
      stats,
      upgrade: 0,
    };
  }
  async create(tx, id, { name, raceId, classId }, now) {
    ensure(
      !(await tx.get("player", id)),
      "Tu as déjà un personnage. Consulte /profil.",
    );
    ensure(
      RACES[raceId] && CLASSES[classId],
      "Race ou classe inconnue. Consulte les informations du jeu.",
    );
    ensure(
      typeof name === "string" && /^[\p{L}\p{N} '\-]{2,24}$/u.test(name),
      "Nom : 2 à 24 lettres, chiffres, espaces, apostrophes ou tirets.",
    );
    const p = {
      schemaVersion: 1,
      generation: shortId(),
      id,
      name: name.trim(),
      raceId,
      classId,
      level: 1,
      xp: 0,
      gold: 150,
      hp: 1,
      mana: 1,
      energy: 100,
      energyAt: now,
      recoveryAt: now,
      recoveryAnchor: now,
      createdAt: now,
      resources: {
        bois: 30,
        pierre: 24,
        fer: 8,
        herbe: 8,
        cuir: 4,
        potion: 5,
        ether: 2,
      },
      gear: [],
      equipment: { weapon: null, armor: null, charm: null },
      buildings: [null, null, null],
      production: {},
      talents: { attack: 0, defense: 0, power: 0, vitality: 0 },
      talentPoints: 0,
      location: "base",
      zone: 0,
      unlockedZone: 0,
      zoneWins: {},
      bosses: [],
      bag: emptyBag(),
      battle: null,
      quests: { day: dayKey(now), kills: 0, gather: 0, craft: 0, claimed: [] },
      kills: 0,
      raids: 0,
      dailyClaimed: null,
      streak: 0,
      guildId: null,
      partyId: null,
      raidAt: null,
    };
    ensure(p.name.length >= 2, "Choisis un nom d’au moins deux caractères.");
    const starter = this.generateGear(1, "weapon", 0);
    starter.name = `Arme du premier serment`;
    starter.icon = gearIcon(starter);
    p.gear.push(starter);
    p.equipment.weapon = starter.id;
    const s = statsOf(p);
    p.hp = s.hp;
    p.mana = s.mana;
    await this.save(tx, p);
    return {
      p,
      message: `Bienvenue, ${p.name}. La cloche de Rosée t’appelle. Tes premières provisions t’attendent à la base.`,
      type: "profile",
    };
  }
  async profile(tx, id, _, now) {
    return { p: await this.player(tx, id, now), type: "profile" };
  }
  async customizeInfo(tx, id, _, now) {
    return { p: await this.player(tx, id, now), type: "customize" };
  }
  async customizeText(tx, id, { title = "", bio = "" }, now) {
    const p = await this.player(tx, id, now);
    ensure(
      typeof title === "string" &&
        title.trim().length <= 40 &&
        typeof bio === "string" &&
        bio.trim().length <= 600,
      "Le titre accepte 40 caractères et la description 600 caractères maximum.",
    );
    const clean = (value) =>
      value.trim().replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "");
    p.customization.title = clean(title).replaceAll("\n", " ");
    p.customization.bio = clean(bio);
    await this.save(tx, p);
    return {
      p,
      type: "customize",
      message: "Ton titre et ta description sont à jour sur ton profil public.",
    };
  }
  async customizeImage(tx, id, { slot, media }, now) {
    const p = await this.player(tx, id, now);
    ensure(
      ["portrait", "banner", "avatar"].includes(slot),
      "Emplacement d’image inconnu.",
    );
    ensure(
      media?.mime === "image/webp" &&
        typeof media.data === "string" &&
        media.data.length <= 1_000_000 &&
        /^[A-Za-z0-9+/]+={0,2}$/.test(media.data) &&
        /^[a-f0-9]{64}$/.test(media.hash) &&
        media.width === (slot === "portrait" ? 256 : slot === "avatar" ? 512 : 1280) &&
        media.height === (slot === "portrait" ? 256 : slot === "avatar" ? 768 : 320),
      "Image invalide : importe ton fichier depuis le bouton de personnalisation.",
    );
    await tx.set("profile_media", `${id}.${slot}`, {
      ...media,
      id: `${id}.${slot}`,
      updatedAt: now,
    });
    p.customization[slot] = { hash: media.hash, updatedAt: now };
    await this.save(tx, p);
    return {
      p,
      type: "customize",
      message:
        slot === "portrait"
          ? "Ton portrait est enregistré et apparaîtra sur les réponses du bot."
          : slot === "avatar" ? "Ton avatar d’équipement est enregistré." : "Ta bannière est enregistrée sur ton profil.",
    };
  }
  async customizeReset(tx, id, { slot }, now) {
    const p = await this.player(tx, id, now);
    ensure(
      ["portrait", "banner", "avatar", "text"].includes(slot),
      "Personnalisation inconnue.",
    );
    if (slot === "text") {
      p.customization.title = "";
      p.customization.bio = "";
    } else {
      await tx.delete("profile_media", `${id}.${slot}`);
      p.customization[slot] = null;
    }
    await this.save(tx, p);
    return {
      p,
      type: "customize",
      message: "Cette personnalisation a été retirée.",
    };
  }
  async inventory(tx, id, _, now) {
    return { p: await this.player(tx, id, now), type: "inventory" };
  }
  async travel(tx, id, { zoneId = 0 }, now) {
    const p = await this.player(tx, id, now);
    this.noBattle(p);
    ensure(integer(zoneId, 0, ZONES.length - 1), "Zone inconnue.");
    ensure(
      zoneId <= p.unlockedZone,
      "Vaincs le boss de la région précédente pour ouvrir cette route.",
    );
    ensure(
      p.level >= ZONES[zoneId].level,
      `Niveau ${ZONES[zoneId].level} requis pour cette région.`,
    );
    p.zone = zoneId;
    p.hunt = null;
    p.location = "campaign";
    p.recoveryAt = now;
    await this.save(tx, p);
    return { p, message: ZONES[zoneId].story, type: "campaign" };
  }
  async encountersInfo(tx, id, _, now) {
    const p = await this.player(tx, id, now);
    this.noBattle(p);
    ensure(p.location === "campaign", "Prends la route depuis la carte.");
    return { p, type: "encounters" };
  }
  async campaignMap(tx, id, { page = 1 }, now) {
    ensure(integer(page, 1, 10000), "Page invalide.");
    const p = await this.player(tx, id, now);
    const players = (await tx.list("player"))
      .filter((v) => v.id !== id && !p.social.blocked.includes(v.id) &&
        !v.social?.blocked?.includes(id))
      .sort((a, b) => (b.unlockedZone ?? 0) - (a.unlockedZone ?? 0) ||
        a.name.localeCompare(b.name, "fr") || a.id.localeCompare(b.id));
    const pages = Math.max(1, Math.ceil(players.length / 5));
    page = Math.min(page, pages);
    return {
      p, type: "map", page, pages,
      travelers: [p, ...players.slice((page - 1) * 5, page * 5)].map(campaignMarker),
    };
  }
  async explore(tx, id, args = {}, now) {
    const p = await this.player(tx, id, now);
    this.noBattle(p);
    ensure(
      p.location === "campaign",
      "Choisis une destination dans le menu Aventure → Carte.",
    );
    ensure(p.hp > 0, "Tu dois te soigner avant de repartir.");
    ensure(
      p.energy >= 5,
      "Il faut 5 énergie. Tu récupères 1 énergie toutes les 5 minutes.",
    );
    ensure(
      p.gear.length + p.bag.gear.length < 100,
      "Ton coffre est plein (100 équipements). Recycle ou vends du matériel.",
    );
    const zone = ZONES[p.zone];
    const chosen = args.mode !== undefined;
    if (chosen) {
      ensure(["progress", "farm"].includes(args.mode), "Mode de rencontre inconnu.");
      ensure(args.zoneId === p.zone, "Tu as changé de région. Rouvre le choix des ennemis.");
      ensure(typeof args.boss === "boolean" && typeof args.elite === "boolean",
        "Type d’ennemi invalide.");
      ensure(integer(args.enemyIndex, 0, zone.enemies.length - 1), "Ennemi inconnu.");
      ensure(!args.boss || (args.mode === "progress" && !args.elite),
        "Le gardien ne peut pas être chassé en mode récolte.");
      ensure(!args.boss || guardianReady(p),
        `Remporte ${VICTORIES_FOR_BOSS} combats de progression avant de défier le gardien.`);
    }
    p.energy -= 5;
    const roll = this.random();
    const boss = chosen ? args.boss : guardianReady(p);
    if (!chosen && !boss && roll < 0.12) {
      const qty = 3 + Math.floor(this.random() * 4);
      add(p.bag.resources, { [zone.resource]: qty, pierre: 2 });
      p.bag.gold += 10 + zone.level * 3;
      p.quests.gather += qty + 2;
      await this.save(tx, p);
      return {
        p,
        type: "campaign",
        message: `Tu découvres une cache oubliée : ${qty} ${RESOURCES[zone.resource]}, 2 pierres et quelques pièces. Le butin reste dans ton sac d’expédition.`,
      };
    }
    const elite = chosen ? args.elite : !boss && roll > 0.88;
    const enemyIndex = chosen ? args.enemyIndex : Math.floor(this.random() * zone.enemies.length);
    const mode = chosen ? args.mode : "progress";
    p.hunt = mode === "farm" ? { zoneId: p.zone, enemyIndex, elite } : null;
    p.battle = {
      id: shortId(),
      turn: 1,
      skillReady: 1,
      log: [],
      mode,
      enemy: campaignEnemy(zone, enemyIndex, { boss, elite }),
    };
    await this.save(tx, p);
    return {
      p,
      type: "campaign",
      message: boss
        ? "Le gardien de la région te barre la route !"
        : mode === "farm" ? "Chasse aux ressources : ce combat ne fait pas avancer le gardien."
          : "Une silhouette émerge de la Brume…",
    };
  }
  hit(attack, defense, multiplier = 1) {
    return Math.max(
      1,
      Math.round(
        (attack * multiplier - defense * 0.65) * (0.9 + this.random() * 0.2),
      ),
    );
  }
  async combat(tx, id, { move, battleId, turn }, now) {
    const p = await this.player(tx, id, now);
    const b = p.battle;
    ensure(b, "Aucun combat en cours. Ouvre le menu Aventure.");
    if (battleId !== undefined)
      ensure(
        b.id === battleId && b.turn === turn,
        "Ce tour a déjà été joué. Rouvre le menu Aventure pour actualiser.",
      );
    ensure(
      ["attack", "skill", "guard", "potion", "ether", "flee"].includes(move),
      "Action de combat inconnue.",
    );
    const s = statsOf(p);
    const e = b.enemy;
    b.techniques ??= {};
    const log = [];
    const hpBefore = p.hp;
    const heal = (amount, source, detail = "") => {
      const before = p.hp;
      p.hp = Math.min(s.hp, p.hp + amount);
      const received = p.hp - before;
      log.push(
        `${source} : +${received} PV${received < amount ? ` sur ${amount} possibles (limite ${s.hp} PV)` : ""}${detail ? ` · ${detail}` : ""}.`,
      );
    };
    let guarding = false;
    if (move === "flee") {
      // Repli garanti et coûteux : pas de blocage de personnage dans un combat.
      const lost = Math.ceil(p.bag.gold * 0.25);
      p.bag.gold -= lost;
      p.battle = null;
      if (b.mode !== "farm") p.zoneWins[p.zone] = 0;
      await this.save(tx, p);
      return {
        p,
        type: "campaign",
        message: `Tu échappes au combat. Tu perds ${lost} or du sac ; ${b.mode === "farm" ? "la progression du gardien est conservée" : "la progression vers le boss est remise à zéro"}.`,
      };
    }
    if (move === "potion" || move === "ether") {
      ensure((p.resources[move] ?? 0) > 0, `Il te faut ${RESOURCES[move]}.`);
      p.resources[move]--;
      if (move === "potion") {
        b.poisonTurns = 0;
        const value = Math.round(
          s.hp * 0.4 * (1 + s.healing + (worldEvent(now).healing ?? 0)),
        );
        heal(value, "Potion de soin");
      } else {
        p.mana = Math.min(s.mana, p.mana + Math.ceil(s.mana * 0.5));
        log.push("💧 Ton mana se régénère.");
      }
    } else if (move === "guard") {
      guarding = true;
      p.mana = Math.min(s.mana, p.mana + 10);
      log.push("🛡️ Tu te protèges et récupères 10 mana.");
    } else {
      let multiplier = 1,
        defense = e.defense;
      let attack = Math.max(s.attack, s.power * 0.85);
      if (move === "skill") {
        const sk = skillOf(p);
        ensure(
          b.turn >= b.skillReady,
          "Ta compétence sera disponible au prochain tour.",
        );
        ensure(
          p.mana >= sk.cost,
          `Il faut ${sk.cost} mana. Défends-toi ou utilise un éther.`,
        );
        p.mana -= sk.cost;
        b.skillReady = b.turn + 2;
        activateTechnique(sk, b.techniques, b.turn);
        multiplier = sk.multiplier;
        log.push(`✨ ${sk.name} !`);
        if (["magic", "drain_magic", "heal"].includes(sk.kind)) {
          attack = s.power;
          defense *= 0.5;
        }
        if (sk.kind === "pierce") defense *= 0.5;
        if (sk.kind === "execute" && e.hp / e.maxHp < 0.35) multiplier *= 2;
        if (sk.kind === "rage")
          p.hp = Math.max(1, p.hp - Math.ceil(s.hp * 0.08));
        if (sk.kind === "heal") {
          heal(Math.round(s.power * multiplier * (1 + s.healing)), sk.name);
          guarding = true;
          multiplier = 0;
        }
      } else p.mana = Math.min(s.mana, p.mana + 3);
      if (multiplier > 0) {
        const critical = this.random() < s.crit;
        const damage = Math.max(1, Math.round(this.hit(
          attack,
          defense,
          multiplier * (critical ? 1.6 : 1),
        ) * (e.trait === "sentinel" && b.turn === 1 ? 0.7 : 1)));
        e.hp = Math.max(0, e.hp - damage);
        log.push(
          `${critical ? "💥 Critique !" : "⚔️"} Tu infliges ${damage} dégâts.`,
        );
        if (move === "skill") {
          const kind = skillOf(p).kind;
          if (DRAIN_RATES[kind])
            heal(
              Math.round(drainHealing(kind, damage, s.healing) * (1 + (skillOf(p).drainBonus ?? 0))),
              "Vol de vie",
              `${DRAIN_RATES[kind] * 100} % de ${damage} dégâts${s.healing ? `, bonus de soins +${Math.round(s.healing * 100)} %` : ""}${skillOf(p).drainBonus ? `, spécialisation +${Math.round(skillOf(p).drainBonus * 100)} %` : ""}`,
            );
        }
      }
    }
    for (const effect of techniqueDamage(b.techniques, s, b.turn)) {
      if (e.hp <= 0) break;
      const dealt = Math.min(e.hp, effect.amount);
      e.hp -= dealt;
      log.push(`${effect.name} : ${dealt} dégâts supplémentaires.`);
    }
    if (e.hp <= 0) {
      log.push("Ennemi vaincu : aucune riposte.");
      return this.victory(tx, p, now, log, hpBefore);
    }
    const heavy = b.turn % 3 === 0;
    const enrage = b.turn > 20 ? 1 + (b.turn - 20) * 0.2 : 1;
    const phase = e.boss && e.hp < e.maxHp * 0.4 ? 1.2 : 1;
    if (e.trait === "regenerating" && heavy) {
      const healed = Math.min(e.maxHp - e.hp, Math.ceil(e.maxHp * 0.08));
      e.hp += healed;
      log.push(`Régénération ennemie : +${healed} PV.`);
    }
    const traitPower = (e.trait === "furious" && e.hp < e.maxHp * 0.5 ? 1.2 : 1) *
      (heavy && ["brute", "swift"].includes(e.trait) ? 1.2 : 1);
    const damage = Math.max(
      1,
      Math.round(
        this.hit(e.attack, s.defense * (e.trait === "arcane" ? 0.65 : 1), (heavy ? 1.8 : 1) * enrage * phase * traitPower) *
          (guarding ? 0.3 : 1) * techniqueProtection(b.techniques, b.turn),
      ),
    );
    p.hp = Math.max(0, p.hp - damage);
    log.push(
      `${heavy ? "💢 Frappe lourde" : "🩸 Riposte"} : ${damage} dégâts.`,
    );
    if (heavy && !guarding && p.hp > 0) {
      if (e.trait === "thief") {
        const stolen = Math.min(p.bag.gold, 5 + e.level * 2);
        p.bag.gold -= stolen; e.stolenGold = (e.stolenGold ?? 0) + stolen;
        log.push(`Le pillard vole ${stolen} or du sac. Vaincs-le pour les récupérer.`);
      }
      if (e.trait === "siphon") {
        const drained = Math.min(p.mana, 5 + e.level); p.mana -= drained;
        log.push(`Absorption ennemie : -${drained} mana.`);
      }
      if (e.trait === "venom") { b.poisonTurns = 2; log.push("Tu es empoisonné pour deux tours. Une potion peut dissiper le poison."); }
    }
    if ((b.poisonTurns ?? 0) > 0 && p.hp > 0) {
      const poison = 2 + Math.ceil(e.level * 0.5);
      p.hp = Math.max(0, p.hp - poison); b.poisonTurns--;
      log.push(`Poison : ${poison} dégâts.`);
    }
    log.push(hpChangeText(hpBefore, p.hp, s.hp));
    b.turn++;
    b.log = log;
    if (p.hp <= 0 || b.turn > 60) {
      // La défaite protège le coffre et les équipements portés ; moitié du sac sauvée.
      p.gold += Math.floor(p.bag.gold / 2);
      for (const [k, qty] of Object.entries(p.bag.resources))
        add(p.resources, { [k]: Math.floor(qty / 2) });
      p.bag = emptyBag();
      p.battle = null;
      p.location = "base";
      if (b.mode !== "farm") p.zoneWins[p.zone] = 0;
      p.hp = Math.max(1, Math.ceil(s.hp * 0.2));
      p.mana = Math.ceil(s.mana * 0.2);
      p.recoveryAt = now;
      p.recoveryAnchor = now;
      await this.save(tx, p);
      return {
        p,
        type: "profile",
        message: `${log.join("\n")}\n☠️ Les éclaireurs te ramènent à la base. La moitié de l’or et des ressources du sac est sauvée, les équipements du sac sont perdus. Ton coffre est intact.\nPV au refuge après secours : ${p.hp} / ${s.hp}.`,
      };
    }
    await this.save(tx, p);
    return { p, type: "campaign", message: log.join("\n") };
  }
  async victory(tx, p, now, log, hpBefore = p.hp) {
    const e = p.battle.enemy;
    const farming = p.battle.mode === "farm";
    const s = statsOf(p);
    const event = worldEvent(now);
    const factor = e.boss ? 3 : e.elite ? 1.6 : 1;
    const guild = p.guildId ? await tx.get("guild", p.guildId) : null;
    const xp = Math.round(
      (80 + e.level * 20) *
        factor *
        (1 + s.xp + (event.xp ?? 0) + (guild ? guild.level * 0.02 : 0)),
    );
    const gold = Math.round(
      (30 + e.level * 10) * factor * (1 + s.gold + (event.gold ?? 0)),
    );
    p.bag.gold += gold;
    if (e.stolenGold) { p.bag.gold += e.stolenGold; log.push(`Tu récupères les ${e.stolenGold} or dérobés.`); }
    const qty = Math.ceil((2 + this.random() * 3) * factor);
    add(p.bag.resources, { [ZONES[p.zone].resource]: qty, pierre: 2 });
    p.quests.gather += qty + 2;
    if (this.random() < 0.32 + s.luck + (event.luck ?? 0) || e.boss) {
      const item = this.generateGear(
        e.level,
        undefined,
        e.boss && this.random() < 0.3 ? 2 : undefined,
      );
      p.bag.gear.push(item);
      log.push(`🎒 ${gearLabel(item)} rejoint ton sac.`);
    }
    p.kills++;
    const species = e.name.replace(/^Élite · /, "");
    p.bestiary[species] = (p.bestiary[species] ?? 0) + 1;
    p.quests.kills++;
    if (!farming)
      p.zoneWins[p.zone] = Math.min(VICTORIES_FOR_BOSS, (p.zoneWins[p.zone] ?? 0) + 1);
    if (e.boss) {
      p.zoneWins[p.zone] = 0;
      if (!p.bosses.includes(p.zone)) {
        p.bosses.push(p.zone);
        p.unlockedZone = Math.min(ZONES.length - 1, p.zone + 1);
        log.push(
          p.zone === ZONES.length - 1
            ? "👑 Tu as brisé le cycle ! Titre acquis : Briseur de Brume."
            : `🗺️ Route ouverte vers ${ZONES[p.unlockedZone].name}.`,
        );
      }
    }
    const levels = this.gainXp(p, xp);
    p.battle = null;
    if (farming) log.push("Chasse terminée : progression du gardien conservée. Tu peux chasser ce même ennemi à nouveau.");
    else if (!e.boss && guardianReady(p)) log.push("Le gardien est disponible. Défie-le quand tu veux, ou continue à chasser.");
    log.push(
      `🏆 Victoire ! +${xp} XP, ${gold} or et des ressources dans ton sac.${levels ? ` Niveau ${p.level} ! +${levels} point(s) de talent.` : ""}`,
    );
    log.push(hpChangeText(hpBefore, p.hp, statsOf(p).hp));
    await this.save(tx, p);
    return { p, type: "campaign", message: log.join("\n") };
  }
  async returnHome(tx, id, _, now) {
    const p = await this.player(tx, id, now);
    this.noBattle(p);
    const gold = p.bag.gold;
    p.gold += gold;
    add(p.resources, p.bag.resources);
    p.gear.push(...p.bag.gear);
    p.bag = emptyBag();
    p.location = "base";
    p.recoveryAt = now;
    p.recoveryAnchor = now;
    await this.save(tx, p);
    return {
      p,
      type: "base",
      message: `🏡 Te voilà au refuge. ${gold} or et tout ton butin sont sécurisés. Tu récupères naturellement des PV et du mana ici.`,
    };
  }
  async rest(tx, id, _, now) {
    const p = await this.player(tx, id, now);
    this.home(p);
    const s = statsOf(p);
    ensure(p.hp < s.hp || p.mana < s.mana, "Tu es déjà en pleine forme.");
    const cost = Math.ceil(
      (8 + p.level * 3) *
        (p.buildings.some((b) => b?.type === "infirmerie") ? 0.5 : 1),
    );
    this.spend(p, cost);
    p.hp = s.hp;
    p.mana = s.mana;
    await this.save(tx, p);
    return {
      p,
      type: "base",
      message: `Repos complet pour ${cost} or. Ton énergie se recharge avec le temps.`,
    };
  }
  async daily(tx, id, _, now) {
    const p = await this.player(tx, id, now);
    const today = dayKey(now);
    ensure(
      p.dailyClaimed !== today,
      "Tes provisions du jour sont déjà récupérées. Renouvellement à minuit UTC.",
    );
    p.streak =
      p.dailyClaimed === dayKey(now - DAY) ? Math.min(7, p.streak + 1) : 1;
    p.dailyClaimed = today;
    const gold = 50 + p.streak * 15;
    p.gold += gold;
    add(p.resources, { potion: 2, bois: 8, pierre: 6 });
    p.energy = Math.min(100, p.energy + 25);
    await this.save(tx, p);
    return {
      p,
      type: "profile",
      message: `🎁 Série ${p.streak}/7 : +${gold} or, 2 potions, 8 bois, 6 pierres et 25 énergie.`,
    };
  }
  async quests(tx, id, _, now) {
    return { p: await this.player(tx, id, now), type: "quests" };
  }
  async claimQuest(tx, id, { questId }, now) {
    const p = await this.player(tx, id, now);
    const q = DAILY_QUESTS.find((q) => q.id === questId);
    ensure(q, "Contrat inconnu.");
    ensure(!p.quests.claimed.includes(q.id), "Récompense déjà réclamée.");
    ensure(p.quests[q.id] >= q.target, "Ce contrat n’est pas encore terminé.");
    p.quests.claimed.push(q.id);
    p.gold += q.gold;
    this.gainXp(p, q.xp);
    await this.save(tx, p);
    return {
      p,
      type: "quests",
      message: `📜 ${q.name} : +${q.gold} or et +${q.xp} XP.`,
    };
  }
  async talent(tx, id, { stat }, now) {
    const p = await this.player(tx, id, now);
    this.home(p);
    ensure(Object.hasOwn(p.talents, stat), "Talent inconnu.");
    ensure(
      p.talentPoints > 0,
      "Gagne un niveau pour obtenir un point de talent.",
    );
    p.talentPoints--;
    p.talents[stat]++;
    await this.save(tx, p);
    return {
      p,
      type: "profile",
      message: "Ton entraînement porte ses fruits.",
    };
  }
  async equip(tx, id, { itemId }, now) {
    const p = await this.player(tx, id, now);
    this.home(p);
    const item = p.gear.find((g) => g.id === itemId);
    ensure(item, "Équipement introuvable dans ton coffre.");
    ensure(p.level >= item.level, `Niveau ${item.level} requis.`);
    p.equipment[item.slot] = item.id;
    const s = statsOf(p);
    p.hp = Math.min(p.hp, s.hp);
    p.mana = Math.min(p.mana, s.mana);
    await this.save(tx, p);
    return { p, type: "inventory", message: `${gearLabel(item)} équipé.` };
  }
  async unequip(tx, id, { slot }, now) {
    const p = await this.player(tx, id, now);
    this.home(p);
    ensure(Object.hasOwn(p.equipment, slot), "Emplacement inconnu.");
    p.equipment[slot] = null;
    const s = statsOf(p);
    p.hp = Math.min(p.hp, s.hp);
    p.mana = Math.min(p.mana, s.mana);
    await this.save(tx, p);
    return { p, type: "inventory", message: "Équipement retiré." };
  }
  async consume(tx, id, { resource = "potion" }, now) {
    const p = await this.player(tx, id, now);
    this.noBattle(p);
    ensure(
      ["potion", "ether"].includes(resource),
      "Utilise une potion ou un éther.",
    );
    const s = statsOf(p);
    ensure(
      resource === "potion" ? p.hp < s.hp : p.mana < s.mana,
      "La jauge est déjà pleine.",
    );
    this.spend(p, 0, { [resource]: 1 });
    if (resource === "potion")
      p.hp = Math.min(
        s.hp,
        p.hp +
          Math.ceil(
            s.hp * 0.4 * (1 + s.healing + (worldEvent(now).healing ?? 0)),
          ),
      );
    else p.mana = Math.min(s.mana, p.mana + Math.ceil(s.mana * 0.5));
    await this.save(tx, p);
    return {
      p,
      type: p.location === "base" ? "base" : "campaign",
      message: `${RESOURCES[resource]} utilisé.`,
    };
  }
  accrue(p, now) {
    for (const b of p.buildings.filter(Boolean)) {
      if (BUILDINGS[b.type].races.length && !BUILDINGS[b.type].races.includes(p.raceId)) { b.producedAt = now; continue; }
      const elapsed = Math.max(0, Math.min(12 * HOUR, now - b.producedAt));
      for (const [k, qty] of Object.entries(BUILDINGS[b.type].production))
        add(p.production, { [k]: (elapsed / HOUR) * qty * b.level });
      b.producedAt = now;
    }
  }
  async build(tx, id, { buildingId, slot }, now) {
    const p = await this.player(tx, id, now);
    this.home(p);
    const b = BUILDINGS[buildingId];
    ensure(b, "Bâtiment inconnu. Consulte Info → Bâtiments.");
    ensure(integer(slot, 1, 3), "Choisis un emplacement de 1 à 3.");
    ensure(
      !p.buildings[slot - 1],
      "Cet emplacement est occupé. Améliore-le ou démolis-le.",
    );
    ensure(
      !p.buildings.some((v) => v?.type === buildingId),
      "Tu possèdes déjà ce bâtiment.",
    );
    ensure(
      !b.races.length || b.races.includes(p.raceId),
      "Ce bâtiment appartient à un autre peuple.",
    );
    const cost = buildingCost(1);
    this.spend(p, cost.gold, cost.resources);
    p.buildings[slot - 1] = { type: buildingId, level: 1, producedAt: now };
    await this.save(tx, p);
    return {
      p,
      type: "base",
      message: `🏗️ ${b.name} construit dans l’emplacement ${slot}. ${b.description}`,
    };
  }
  async upgradeBuilding(tx, id, { slot }, now) {
    const p = await this.player(tx, id, now);
    this.home(p);
    ensure(
      integer(slot, 1, 3) && p.buildings[slot - 1],
      "Emplacement vide ou invalide.",
    );
    const b = p.buildings[slot - 1];
    ensure(b.level < 5, "Ce bâtiment est déjà au niveau maximal (5).");
    const cost = buildingCost(b.level + 1);
    this.spend(p, cost.gold, cost.resources);
    this.accrue(p, now);
    b.level++;
    await this.save(tx, p);
    return {
      p,
      type: "base",
      message: `🏗️ ${BUILDINGS[b.type].name} passe au niveau ${b.level}.`,
    };
  }
  async demolish(tx, id, { slot }, now) {
    const p = await this.player(tx, id, now);
    this.home(p);
    ensure(
      integer(slot, 1, 3) && p.buildings[slot - 1],
      "Emplacement vide ou invalide.",
    );
    const b = p.buildings[slot - 1];
    this.accrue(p, now);
    let refund = 0;
    for (let l = 1; l <= b.level; l++)
      refund += Math.floor(buildingCost(l).gold / 2);
    p.gold += refund;
    p.buildings[slot - 1] = null;
    const s = statsOf(p);
    p.hp = Math.min(p.hp, s.hp);
    p.mana = Math.min(p.mana, s.mana);
    await this.save(tx, p);
    return {
      p,
      type: "base",
      message: `Emplacement libéré. ${refund} or remboursé (50 %). Matériaux non remboursés.`,
    };
  }
  async collect(tx, id, _, now) {
    const p = await this.player(tx, id, now);
    this.home(p);
    this.accrue(p, now);
    const collected = {};
    for (const [k, qty] of Object.entries(p.production)) {
      const units = Math.floor(qty + 1e-9);
      if (units > 0) {
        collected[k] = units;
        p.production[k] = Math.max(0, qty - units);
        p.quests.gather += units;
      }
    }
    add(p.resources, collected);
    await this.save(tx, p);
    return {
      p,
      type: "base",
      message: Object.keys(collected).length
        ? `📦 Récolte : ${Object.entries(collected)
            .map(([k, n]) => `${n} ${RESOURCES[k]}`)
            .join(", ")}.`
        : "Aucune unité complète à récupérer. La production s’accumule pendant 12 h maximum entre deux collectes.",
    };
  }
  async craft(tx, id, { recipeId, quantity = 1 }, now) {
    const p = await this.player(tx, id, now);
    this.home(p);
    const r = RECIPES[recipeId];
    ensure(r, "Recette inconnue. Consulte Marché → Atelier.");
    ensure(integer(quantity, 1, 20), "Fabrique entre 1 et 20 lots.");
    ensure(
      !r.slot || p.gear.length + quantity <= 100,
      "Le coffre est plein (100 équipements).",
    );
    this.spend(
      p,
      r.gold * quantity,
      Object.fromEntries(
        Object.entries(r.cost).map(([k, n]) => [k, n * quantity]),
      ),
    );
    for (let i = 0; i < quantity; i++) {
      if (r.slot)
        p.gear.push(this.generateGear(p.level, r.slot, r.rarity ?? 2));
      else add(p.resources, r.output);
    }
    p.quests.craft += quantity;
    await this.save(tx, p);
    return {
      p,
      type: "inventory",
      message: `⚒️ ${quantity} × ${r.name} fabriqué.`,
    };
  }
  async enchant(tx, id, { itemId }, now) {
    const p = await this.player(tx, id, now);
    this.home(p);
    ensure(
      p.buildings.some((b) => activeBuilding(p, b) && ["forge", "forge_ancestrale"].includes(b.type)),
      "Construis une forge pour enchanter.",
    );
    const item = p.gear.find((g) => g.id === itemId);
    ensure(item, "Équipement introuvable.");
    ensure(item.upgrade < 5, "Enchantement maximal (+5).");
    const n = item.upgrade + 1;
    this.spend(p, 80 * n * n, { fer: 5 * n, essence: 2 * n });
    item.upgrade++;
    for (const k of Object.keys(item.stats)) {
      if (k === "crit") item.stats[k] += 0.005;
      else item.stats[k] += Math.max(1, Math.ceil(item.stats[k] * 0.12));
    }
    await this.save(tx, p);
    return {
      p,
      type: "inventory",
      message: `✨ ${gearLabel(item)} enchanté. Réussite garantie.`,
    };
  }
  async salvage(tx, id, { itemId }, now) {
    const p = await this.player(tx, id, now);
    this.home(p);
    const item = p.gear.find((g) => g.id === itemId);
    ensure(item, "Équipement introuvable.");
    ensure(
      !Object.values(p.equipment).includes(itemId),
      "Déséquipe cet objet avant de le recycler.",
    );
    p.gear = p.gear.filter((g) => g.id !== itemId);
    const resources = {
      fer: 2 + item.rarity * 2,
      essence: Math.max(1, item.rarity),
    };
    add(p.resources, resources);
    await this.save(tx, p);
    return {
      p,
      type: "inventory",
      message: `♻️ Objet recyclé : ${resources.fer} fer et ${resources.essence} essence.`,
    };
  }
  async expireListings(tx, now) {
    const listings = await tx.list("listing");
    for (const listing of listings.filter((l) => l.expiresAt <= now)) {
      const seller = await tx.get("player", listing.sellerId);
      ensure(
        seller,
        "Vendeur absent de la sauvegarde. Contacte l’administrateur.",
      );
      this.returnListing(seller, listing);
      await this.save(tx, seller);
      await tx.delete("listing", listing.id);
    }
    return listings.filter((l) => l.expiresAt > now);
  }
  returnListing(p, listing) {
    if (listing.item) p.gear.push(listing.item);
    else add(p.resources, { [listing.resource]: listing.quantity });
  }
  async market(tx, id, { page = 1, mine = false, resource }, now) {
    ensure(integer(page, 1, 10000), "Page invalide.");
    let listings = await this.expireListings(tx, now);
    const p = await this.player(tx, id, now);
    listings = listings
      .filter(
        (l) =>
          (!mine || l.sellerId === id) &&
          (!resource || l.resource === resource),
      )
      .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
    const pages = Math.max(1, Math.ceil(listings.length / 5));
    page = Math.min(page, pages);
    return {
      p,
      type: "market",
      listings: listings.slice((page - 1) * 5, page * 5),
      page,
      pages,
      mine,
      resource,
    };
  }
  async sell(tx, id, { resource, itemId, quantity = 1, price }, now) {
    const listings = await this.expireListings(tx, now);
    const p = await this.player(tx, id, now);
    this.home(p);
    ensure(
      integer(price, 1, 1_000_000),
      "Prix total du lot : entre 1 et 1 000 000 or.",
    );
    ensure(integer(quantity, 1, 10000), "Quantité : entre 1 et 10 000.");
    ensure(
      listings.filter((l) => l.sellerId === id).length < 10,
      "Tu as déjà 10 annonces actives.",
    );
    ensure(
      Boolean(resource) !== Boolean(itemId),
      "Choisis une ressource OU un équipement.",
    );
    const listing = {
      id: shortId(),
      sellerId: id,
      sellerName: p.name,
      price,
      quantity,
      createdAt: now,
      expiresAt: now + 7 * DAY,
    };
    if (itemId) {
      const item = p.gear.find((g) => g.id === itemId);
      ensure(item, "Équipement introuvable.");
      ensure(quantity === 1, "Un équipement se vend à l’unité.");
      ensure(
        !Object.values(p.equipment).includes(itemId),
        "Déséquipe cet objet pour le vendre.",
      );
      listing.item = item;
      p.gear = p.gear.filter((g) => g.id !== itemId);
    } else {
      ensure(
        RESOURCES[resource] && resource !== "insigne",
        "Cette ressource n’est pas échangeable.",
      );
      this.spend(p, 0, { [resource]: quantity });
      listing.resource = resource;
    }
    await tx.set("listing", listing.id, listing);
    await this.save(tx, p);
    return {
      p,
      type: "notice",
      message: `⚖️ Annonce ${listing.id} publiée : ${listing.quantity} × ${listing.item ? gearLabel(listing.item) : RESOURCES[listing.resource]}, ${price} or le lot entier. Commission à la vente : 5 % arrondis au supérieur. Expire dans 7 jours.`,
    };
  }
  async buy(tx, id, { listingId }, now) {
    await this.expireListings(tx, now);
    const p = await this.player(tx, id, now);
    this.home(p);
    const l = await tx.get("listing", listingId);
    ensure(l, "Cette annonce a été achetée, annulée ou a expiré.");
    ensure(l.sellerId !== id, "Tu ne peux pas acheter ta propre annonce.");
    ensure(!l.item || p.gear.length < 100, "Ton coffre est plein.");
    const seller = await this.player(tx, l.sellerId, now);
    this.spend(p, l.price);
    this.returnListing(p, l);
    const fee = Math.ceil(l.price * 0.05);
    seller.gold += l.price - fee;
    await this.save(tx, seller);
    await this.save(tx, p);
    await tx.delete("listing", listingId);
    return {
      p,
      type: "notice",
      message: `🤝 Achat réussi pour ${l.price} or. Le lot est dans ton coffre. Le vendeur reçoit ${l.price - fee} or après commission.`,
    };
  }
  async cancelListing(tx, id, { listingId }, now) {
    await this.expireListings(tx, now);
    const p = await this.player(tx, id, now);
    this.home(p);
    const l = await tx.get("listing", listingId);
    ensure(
      l && l.sellerId === id,
      "Cette annonce ne t’appartient pas ou n’existe plus.",
    );
    this.returnListing(p, l);
    await tx.delete("listing", listingId);
    await this.save(tx, p);
    return {
      p,
      type: "notice",
      message: "Annonce annulée. Le lot est de retour dans ton coffre.",
    };
  }
  async gift(tx, id, { targetId, gold = 0, resource, quantity = 1 }, now) {
    const p = await this.player(tx, id, now);
    this.home(p);
    ensure(targetId !== id, "Choisis un autre aventurier.");
    ensure(
      integer(gold, 0, 1_000_000) && integer(quantity, 1, 10000),
      "Montant ou quantité invalide.",
    );
    ensure(
      Boolean(gold) !== Boolean(resource),
      "Donne de l’or OU une ressource.",
    );
    const target = await this.player(tx, targetId, now);
    ensure(
      !p.social.blocked.includes(targetId) &&
        !target.social.blocked.includes(id),
      "Les cadeaux avec cet aventurier ne sont pas disponibles.",
    );
    ensure(
      !resource || (RESOURCES[resource] && resource !== "insigne"),
      "Ressource non échangeable.",
    );
    this.spend(p, gold, resource ? { [resource]: quantity } : {});
    target.gold += gold;
    if (resource) add(target.resources, { [resource]: quantity });
    await this.save(tx, p);
    await this.save(tx, target);
    return {
      p,
      type: "notice",
      message: `🎁 ${target.name} reçoit ${gold ? `${gold} or` : `${quantity} ${RESOURCES[resource]}`}.`,
    };
  }
  async leaderboard(tx, id, _, now) {
    const p = await this.player(tx, id, now);
    const players = await tx.list("player");
    const leaders = players
      .sort(
        (a, b) =>
          b.level - a.level || b.bosses.length - a.bosses.length || b.xp - a.xp,
      )
      .slice(0, 10);
    return { p, type: "leaderboard", leaders };
  }
  async guildCreate(tx, id, { name }, now) {
    const p = await this.player(tx, id, now);
    this.home(p);
    ensure(!p.guildId, "Tu appartiens déjà à une guilde.");
    ensure(
      typeof name === "string" && /^[\p{L}\p{N} '\-]{3,32}$/u.test(name.trim()),
      "Nom de guilde : 3 à 32 caractères, lettres, chiffres, espaces ou tirets.",
    );
    const guilds = await tx.list("guild");
    ensure(
      !guilds.some(
        (g) =>
          g.name.toLocaleLowerCase("fr") ===
          name.trim().toLocaleLowerCase("fr"),
      ),
      "Ce nom de guilde est déjà pris.",
    );
    this.spend(p, 200);
    const guild = {
      id: shortId(),
      name: name.trim(),
      leaderId: id,
      members: [id],
      gold: 0,
      level: 1,
      createdAt: now,
    };
    p.guildId = guild.id;
    await tx.set("guild", guild.id, guild);
    await this.save(tx, p);
    return {
      p,
      guild,
      type: "guild",
      message: `Guilde fondée pour 200 or. Invite tes amis avec le code ${guild.id}. L’adhésion est ouverte.`,
    };
  }
  async guildJoin(tx, id, { guildId }, now) {
    const p = await this.player(tx, id, now);
    this.home(p);
    ensure(!p.guildId, "Quitte d’abord ta guilde actuelle.");
    const guild = await tx.get("guild", guildId);
    ensure(guild, "Guilde introuvable.");
    ensure(guild.members.length < 30, "La guilde est complète (30 membres).");
    guild.members.push(id);
    p.guildId = guild.id;
    await tx.set("guild", guild.id, guild);
    await this.save(tx, p);
    return { p, guild, type: "guild", message: `Tu rejoins ${guild.name}.` };
  }
  async guildInfo(tx, id, { guildId }, now) {
    const p = await this.player(tx, id, now);
    const guild = await tx.get("guild", guildId ?? p.guildId ?? "");
    const guilds = guild ? undefined : (await tx.list("guild")).slice(0, 10);
    const members = guild
      ? (await Promise.all(guild.members.map((uid) => tx.get("player", uid))))
          .filter(Boolean)
          .map((v) => ({ name: v.name, level: v.level, id: v.id }))
      : [];
    return { p, guild, guilds, members, type: "guild" };
  }
  async guildDonate(tx, id, { gold }, now) {
    const p = await this.player(tx, id, now);
    this.home(p);
    ensure(integer(gold), "Don : entre 1 et 1 000 000 or.");
    const guild = await tx.get("guild", p.guildId ?? "");
    ensure(guild, "Tu dois appartenir à une guilde.");
    this.spend(p, gold);
    guild.gold += gold;
    await tx.set("guild", guild.id, guild);
    await this.save(tx, p);
    return {
      p,
      guild,
      type: "guild",
      message: `${gold} or versé au trésor commun.`,
    };
  }
  async guildUpgrade(tx, id, _, now) {
    const p = await this.player(tx, id, now);
    this.home(p);
    const guild = await tx.get("guild", p.guildId ?? "");
    ensure(
      guild?.leaderId === id,
      "Seul le chef de guilde peut investir le trésor.",
    );
    ensure(guild.level < 10, "Niveau maximal atteint.");
    const cost = guild.level * 500;
    ensure(guild.gold >= cost, `Le trésor doit contenir ${cost} or.`);
    guild.gold -= cost;
    guild.level++;
    await tx.set("guild", guild.id, guild);
    return {
      p,
      guild,
      type: "guild",
      message: `La guilde passe au niveau ${guild.level} ! Bonus d’XP de campagne : ${guild.level * 2} %.`,
    };
  }
  async guildLeave(tx, id, _, now) {
    const p = await this.player(tx, id, now);
    this.home(p);
    const guild = await tx.get("guild", p.guildId ?? "");
    ensure(guild, "Tu n’as pas de guilde.");
    guild.members = guild.members.filter((uid) => uid !== id);
    if (guild.officers)
      guild.officers = guild.officers.filter((uid) => uid !== id);
    if (guild.city?.guards) delete guild.city.guards[id];
    if (!guild.members.length) await tx.delete("guild", guild.id);
    else {
      if (guild.leaderId === id) guild.leaderId = guild.members[0];
      await tx.set("guild", guild.id, guild);
    }
    p.guildId = null;
    await this.save(tx, p);
    return {
      p,
      type: "notice",
      message:
        "Tu quittes la guilde. Si tu étais chef, le membre le plus ancien te succède. Une guilde vide est dissoute, son trésor disparaît.",
    };
  }
  async partyCreate(tx, id, { raidId = 0 }, now) {
    const p = await this.player(tx, id, now);
    this.home(p);
    ensure(!p.partyId, "Quitte ton groupe actuel avant d’en créer un autre.");
    ensure(RAIDS[raidId], "Raid inconnu.");
    ensure(
      p.level >= RAIDS[raidId].level,
      `Niveau ${RAIDS[raidId].level} requis.`,
    );
    const party = {
      id: shortId(),
      leaderId: id,
      members: [id],
      raidId,
      createdAt: now,
    };
    p.partyId = party.id;
    await tx.set("party", party.id, party);
    await this.save(tx, p);
    return {
      p,
      party,
      type: "party",
      message: `Groupe créé ! Code : ${party.id}. Tes amis peuvent te retrouver dans Compagnons → Groupes ouverts. Rejoindre autorise le chef à lancer le raid (20 énergie par personne).`,
    };
  }
  async partyJoin(tx, id, { partyId }, now) {
    const p = await this.player(tx, id, now);
    this.home(p);
    ensure(!p.partyId, "Tu es déjà dans un groupe.");
    const party = await tx.get("party", partyId);
    ensure(party, "Groupe introuvable.");
    ensure(party.members.length < 4, "Groupe complet (4 aventuriers).");
    ensure(
      p.level >= RAIDS[party.raidId].level,
      `Niveau ${RAIDS[party.raidId].level} requis.`,
    );
    party.members.push(id);
    p.partyId = party.id;
    await this.save(tx, p);
    await tx.set("party", party.id, party);
    return {
      p,
      party,
      type: "party",
      message:
        "Tu rejoins le groupe et acceptes le lancement par le chef. Reste à la base avec 20 énergie.",
    };
  }
  async partyLeave(tx, id, _, now) {
    const p = await this.player(tx, id, now);
    const party = await tx.get("party", p.partyId ?? "");
    ensure(party, "Tu n’as pas de groupe.");
    party.members = party.members.filter((uid) => uid !== id);
    if (party.members.length) {
      if (party.leaderId === id) party.leaderId = party.members[0];
      await tx.set("party", party.id, party);
    } else await tx.delete("party", party.id);
    p.partyId = null;
    await this.save(tx, p);
    return { p, type: "notice", message: "Tu quittes le groupe." };
  }
  async partyInfo(tx, id, _, now) {
    const p = await this.player(tx, id, now);
    const party = await tx.get("party", p.partyId ?? "");
    const members = party
      ? (await Promise.all(party.members.map((uid) => tx.get("player", uid))))
          .filter(Boolean)
          .map((v) => ({ id: v.id, name: v.name, level: v.level }))
      : [];
    return { p, party, members, type: "party" };
  }
  async raid(tx, id, _, now) {
    const p = await this.player(tx, id, now);
    const party = await tx.get("party", p.partyId ?? "");
    ensure(party?.leaderId === id, "Seul le chef de groupe lance le raid.");
    ensure(
      party.members.length >= 2,
      "Il faut 2 à 4 joueurs pour affronter ce boss.",
    );
    const boss = RAIDS[party.raidId];
    const players = [];
    for (const uid of party.members) {
      const member = await this.player(tx, uid, now);
      this.home(member);
      ensure(member.energy >= 20, `${member.name} doit avoir 20 énergie.`);
      ensure(
        member.hp >= statsOf(member).hp * 0.5,
        `${member.name} doit avoir au moins 50 % de ses PV.`,
      );
      ensure(
        member.raidAt === null || now - member.raidAt >= DAY,
        `${member.name} doit attendre 24 h entre deux raids.`,
      );
      ensure(
        member.gear.length < 100,
        `${member.name} doit libérer de la place dans son coffre.`,
      );
      players.push(member);
    }
    const fighters = players.map((v) => ({
      p: v,
      s: statsOf(v),
      hp: v.hp,
      damage: 0,
      healing: 0,
      mana: statsOf(v).mana,
      techniques: {},
      rescued: new Set(),
    }));
    let bossHp = boss.hp,
      turns = 0;
    for (
      turns = 1;
      turns <= 35 && bossHp > 0 && fighters.some((f) => f.hp > 0);
      turns++
    ) {
      for (const f of fighters.filter((v) => v.hp > 0)) {
        const sk = skillOf(f.p);
        const specialized = Boolean(specializationOf(f.p));
        const use = turns % 3 === 0 && (!specialized || f.mana >= sk.cost);
        if (use) { f.mana = Math.max(0, f.mana - sk.cost); activateTechnique(sk, f.techniques, turns); }
        else f.mana = Math.min(f.s.mana, f.mana + 3);
        if (sk.kind === "heal" && use) {
          const heal = Math.ceil(f.s.power * 0.8 * (1 + f.s.healing));
          for (const ally of fighters.filter((a) => a.hp > 0)) {
            const before = ally.hp;
            ally.hp = Math.min(ally.s.hp, ally.hp + heal);
            f.healing += ally.hp - before;
            if (ally.p.id !== f.p.id && before <= ally.s.hp * 0.25 && ally.hp > ally.s.hp * 0.25 && !f.rescued.has(ally.p.id)) {
              f.rescued.add(ally.p.id); f.p.social.rescues = (f.p.social.rescues ?? 0) + 1;
            }
          }
        }
        if (specialized && use && sk.kind === "rage") f.hp = Math.max(1, f.hp - Math.ceil(f.s.hp * 0.08));
        const damage = this.hit(
          specialized && use && ["magic", "drain_magic"].includes(sk.kind) ? f.s.power : Math.max(f.s.attack, f.s.power),
          boss.defense * (specialized && use && ["magic", "drain_magic", "pierce"].includes(sk.kind) ? 0.5 : 1),
          (use ? specialized ? sk.multiplier : 1.7 : 1) *
            (specialized && use && sk.kind === "execute" && bossHp / boss.hp < 0.35 ? 2 : 1) * (this.random() < f.s.crit ? 1.6 : 1),
        );
        if (specialized && use && DRAIN_RATES[sk.kind]) {
          const before = f.hp;
          f.hp = Math.min(f.s.hp, f.hp + Math.round(drainHealing(sk.kind, Math.min(bossHp, damage), f.s.healing) * (1 + (sk.drainBonus ?? 0))));
          f.healing += f.hp - before;
        }
        bossHp -= damage;
        f.damage += damage;
        for (const effect of techniqueDamage(f.techniques, f.s, turns)) { bossHp -= effect.amount; f.damage += effect.amount; }
        if (bossHp <= 0) break;
      }
      if (bossHp <= 0) break;
      const targets =
        turns % 3 === 0
          ? fighters.filter((f) => f.hp > 0)
          : [this.pick(fighters.filter((f) => f.hp > 0))];
      for (const target of targets)
        target.hp = Math.max(
          0,
          target.hp -
            Math.round(this.hit(
              boss.attack,
              target.s.defense,
              (turns > 20 ? 1.7 : 1) * (turns % 3 === 0 ? 0.8 : 1.2),
            ) * techniqueProtection({ ...target.techniques, curse: Math.max(...fighters.map((f) => f.techniques.curse ?? 0)) }, turns)),
        );
    }
    const won = bossHp <= 0;
    for (const f of fighters) {
      const member = f.p;
      member.energy -= 20;
      member.raidAt = now;
      member.hp = Math.max(Math.ceil(f.s.hp * 0.2), f.hp);
      member.recoveryAt = now;
      if (won) {
        member.gold += boss.reward;
        member.raids++;
        member.raidWins[party.raidId] = (member.raidWins[party.raidId] ?? 0) + 1;
        add(member.resources, {
          insigne: 1 + party.raidId,
          [boss.resource]: 5 + party.raidId * 3,
        });
        this.gainXp(member, boss.reward * 2);
        member.gear.push(
          this.generateGear(
            boss.level,
            undefined,
            this.random() < 0.15 ? 3 : 2,
          ),
        );
      }
      await this.save(tx, member);
    }
    return {
      p: players.find((v) => v.id === id),
      type: "raid",
      won,
      boss,
      turns: Math.min(turns, 35),
      fighters: fighters.map((f) => ({
        name: f.p.name,
        damage: f.damage,
        healing: f.healing,
        hp: f.hp,
      })),
      message: won
        ? `🏆 ${boss.name} tombe ! Chaque participant reçoit ${boss.reward} or, ${boss.reward * 2} XP, des matériaux, des insignes et un équipement rare ou épique.`
        : `💀 ${boss.name} vous repousse. Vous rentrez vivants, sans récompense. Préparez équipement et soutiens pour la prochaine tentative.`,
    };
  }

  async shopBuy(tx, id, { resource, quantity = 1 }, now) {
    const p = await this.player(tx, id, now);
    this.home(p);
    const product = SHOP[resource];
    ensure(product, "Cette provision n’est pas proposée par le marchand.");
    ensure(integer(quantity, 1, 100), "Choisis une quantité entre 1 et 100.");
    this.spend(p, product.price * quantity);
    add(p.resources, { [resource]: quantity });
    await this.save(tx, p);
    return {
      p,
      type: "store",
      message: `${quantity} ${RESOURCES[resource]} acheté pour ${product.price * quantity} or. Les provisions sont dans ton coffre.`,
    };
  }
}
Object.assign(Game.prototype, socialMethods);
Object.assign(Game.prototype, identityMethods);
