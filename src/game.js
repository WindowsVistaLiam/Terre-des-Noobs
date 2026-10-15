import { randomInt, randomUUID } from "node:crypto";
import { socialMethods, normalizeSocial } from "./social-game.js";
import { DRAIN_RATES, drainHealing, hpChangeText } from "./combat-math.js";
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
  add(s, RACES[p.raceId].bonuses);
  add(s, {
    attack: p.talents.attack * 2,
    defense: p.talents.defense * 2,
    power: p.talents.power * 2,
    hp: p.talents.vitality * 10,
  });
  for (const b of p.buildings.filter(Boolean)) {
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
      ...Object.keys(socialMethods),
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
    return {
      id: shortId(),
      name: `${this.pick(names[slot])} ${this.pick(["de l’aube", "des brumes", "du serment", "de Vesper", "des étoiles"])}`,
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
    ensure(
      p.location === "base" || p.zone === zoneId,
      "Sécurise ton butin à la base avant de changer de région.",
    );
    p.zone = zoneId;
    p.location = "campaign";
    p.recoveryAt = now;
    await this.save(tx, p);
    return { p, message: ZONES[zoneId].story, type: "campaign" };
  }
  async explore(tx, id, _, now) {
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
    p.energy -= 5;
    const zone = ZONES[p.zone];
    const roll = this.random();
    const boss = (p.zoneWins[p.zone] ?? 0) >= VICTORIES_FOR_BOSS;
    if (!boss && roll < 0.12) {
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
    const elite = !boss && roll > 0.88;
    const level = zone.level + (boss ? 2 : elite ? 1 : 0);
    const scale = boss ? 2.2 : elite ? 1.5 : 1;
    const hp = Math.round((82 + level * 28) * scale);
    p.battle = {
      id: shortId(),
      turn: 1,
      skillReady: 1,
      log: [],
      enemy: {
        name: boss
          ? zone.boss
          : `${elite ? "Élite · " : ""}${this.pick(zone.enemies)}`,
        level,
        boss,
        elite,
        hp,
        maxHp: hp,
        attack: Math.round((11 + level * 3) * (boss ? 1.25 : elite ? 1.12 : 1)),
        defense: 3 + level * 1.5,
      },
    };
    await this.save(tx, p);
    return {
      p,
      type: "campaign",
      message: boss
        ? "Le gardien de la région te barre la route !"
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
      p.zoneWins[p.zone] = 0;
      await this.save(tx, p);
      return {
        p,
        type: "campaign",
        message: `Tu échappes au combat. Tu perds ${lost} or du sac ; la progression vers le boss est remise à zéro.`,
      };
    }
    if (move === "potion" || move === "ether") {
      ensure((p.resources[move] ?? 0) > 0, `Il te faut ${RESOURCES[move]}.`);
      p.resources[move]--;
      if (move === "potion") {
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
        const sk = CLASSES[p.classId].skill;
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
        const damage = this.hit(
          attack,
          defense,
          multiplier * (critical ? 1.6 : 1),
        );
        e.hp = Math.max(0, e.hp - damage);
        log.push(
          `${critical ? "💥 Critique !" : "⚔️"} Tu infliges ${damage} dégâts.`,
        );
        if (move === "skill") {
          const kind = CLASSES[p.classId].skill.kind;
          if (DRAIN_RATES[kind])
            heal(
              drainHealing(kind, damage, s.healing),
              "Vol de vie",
              `${DRAIN_RATES[kind] * 100} % de ${damage} dégâts${s.healing ? `, bonus de soins +${Math.round(s.healing * 100)} %` : ""}`,
            );
        }
      }
    }
    if (e.hp <= 0) {
      log.push("Ennemi vaincu : aucune riposte.");
      return this.victory(tx, p, now, log, hpBefore);
    }
    const heavy = b.turn % 3 === 0;
    const enrage = b.turn > 20 ? 1 + (b.turn - 20) * 0.2 : 1;
    const phase = e.boss && e.hp < e.maxHp * 0.4 ? 1.2 : 1;
    const damage = Math.max(
      1,
      Math.round(
        this.hit(e.attack, s.defense, (heavy ? 1.8 : 1) * enrage * phase) *
          (guarding ? 0.3 : 1),
      ),
    );
    p.hp = Math.max(0, p.hp - damage);
    log.push(
      `${heavy ? "💢 Frappe lourde" : "🩸 Riposte"} : ${damage} dégâts.`,
    );
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
      p.zoneWins[p.zone] = 0;
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
    p.quests.kills++;
    p.zoneWins[p.zone] = (p.zoneWins[p.zone] ?? 0) + 1;
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
      p.buildings.some((b) => ["forge", "forge_ancestrale"].includes(b?.type)),
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
    }));
    let bossHp = boss.hp,
      turns = 0;
    for (
      turns = 1;
      turns <= 35 && bossHp > 0 && fighters.some((f) => f.hp > 0);
      turns++
    ) {
      for (const f of fighters.filter((v) => v.hp > 0)) {
        const sk = CLASSES[f.p.classId].skill;
        if (sk.kind === "heal" && turns % 3 === 0) {
          const heal = Math.ceil(f.s.power * 0.8 * (1 + f.s.healing));
          for (const ally of fighters.filter((a) => a.hp > 0)) {
            const before = ally.hp;
            ally.hp = Math.min(ally.s.hp, ally.hp + heal);
            f.healing += ally.hp - before;
          }
        }
        const damage = this.hit(
          Math.max(f.s.attack, f.s.power),
          boss.defense,
          (turns % 3 === 0 ? 1.7 : 1) * (this.random() < f.s.crit ? 1.6 : 1),
        );
        bossHp -= damage;
        f.damage += damage;
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
            this.hit(
              boss.attack,
              target.s.defense,
              (turns > 20 ? 1.7 : 1) * (turns % 3 === 0 ? 0.8 : 1.2),
            ),
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
