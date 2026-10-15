import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Game, statsOf } from "../src/game.js";
import { MemoryStore } from "../src/store.js";
import { resolveRoute } from "../src/controller.js";
import { render } from "../src/views.js";

export async function createPreviewGame() {
  const store = new MemoryStore();
  const game = new Game(store, {
    random: () => 0.5,
    now: () => Date.UTC(2026, 9, 15, 18),
  });
  await game.execute("create", "demo", {
    name: "Aelys de Vesper",
    raceId: "haut_elfe",
    classId: "mage",
  });
  await game.execute("create", "merchant", {
    name: "Borin Cendrefer",
    raceId: "nain",
    classId: "guerrier",
  });
  await store.transaction(async (tx) => {
    const p = await tx.get("player", "demo");
    p.level = 12;
    p.gold = 1260;
    p.xp = 280;
    p.energy = 76;
    p.talentPoints = 3;
    p.kills = 47;
    p.bosses = [0, 1, 2];
    p.unlockedZone = 3;
    p.buildings = [
      { type: "observatoire", level: 2, producedAt: game.now() },
      { type: "forge", level: 1, producedAt: game.now() },
      null,
    ];
    p.gear.push(
      game.generateGear(12, "armor", 2),
      game.generateGear(10, "charm", 3),
      game.generateGear(8, "weapon", 1),
    );
    p.equipment.armor = p.gear[1].id;
    p.equipment.charm = p.gear[2].id;
    p.resources = {
      ...p.resources,
      bois: 84,
      pierre: 62,
      fer: 37,
      herbe: 28,
      essence: 12,
      cristal: 4,
      insigne: 2,
    };
    const s = statsOf(p);
    p.hp = s.hp - 39;
    p.mana = s.mana - 24;
    await tx.set("player", p.id, p);
  });
  await game.execute("sell", "merchant", {
    resource: "fer",
    quantity: 5,
    price: 30,
  });
  await game.execute("sell", "merchant", {
    resource: "bois",
    quantity: 20,
    price: 60,
  });
  return game;
}

export async function createSocialPreviewGame() {
  const game = await createPreviewGame();
  await game.store.transaction(async (tx) => {
    const merchant = await tx.get("player", "merchant");
    merchant.level = 12;
    merchant.gold = 1000;
    merchant.hp = statsOf(merchant).hp;
    await tx.set("player", "merchant", merchant);
  });
  const { guild } = await game.execute("guildCreate", "demo", {
    name: "Les Veilleurs de Vesper",
  });
  await game.execute("guildJoin", "merchant", { guildId: guild.id });
  await game.execute("friendRequest", "demo", { targetId: "merchant" });
  await game.execute("friendRespond", "merchant", {
    requestId: "demo.merchant",
    response: "accept",
  });
  await game.execute("duelChallenge", "merchant", { targetId: "demo" });
  await game.execute("cityInfo", "demo");
  await game.store.transaction(async (tx) => {
    const g = await tx.get("guild", guild.id);
    g.gold = 900;
    g.bulletin = "La cité tient tant que nous veillons ensemble.";
    g.city.buildings = { remparts: 2, caserne: 1, infirmerie: 1, phare: 1 };
    g.city.prestige = 85;
    g.city.integrity = 700;
    g.city.resources = { bois: 80, pierre: 65, fer: 32, herbe: 20, essence: 9 };
    g.city.guards = {
      merchant: {
        name: "Borin Cendrefer",
        until: game.now() + 86400000,
        power: 95,
      },
    };
    await tx.set("guild", g.id, g);
  });
  return game;
}

async function main() {
  const game = await createSocialPreviewGame();
  const destination = resolve(".local/previews");
  await mkdir(destination, { recursive: true });
  const routes = {
    profil: { action: "profile" },
    marche: { action: "market" },
    info: { action: "info" },
    social: { action: "social" },
    amis: { action: "friends" },
    reception: { action: "inbox" },
    cite: { action: "city" },
    defense: { action: "cityDefensePlan" },
    races: { action: "codex", args: { category: "races", page: 1 } },
    classes: { action: "codex", args: { category: "classes", page: 1 } },
    refuge: { action: "base" },
    coffre: { action: "inventory" },
    ressources: { action: "resources" },
    atelier: { action: "crafting" },
    carte: { action: "map" },
    metiers: { action: "codex", args: { category: "metiers" } },
  };
  for (const [name, route] of Object.entries(routes)) {
    const payload = await render(
      await resolveRoute(game, route, "demo"),
      "demo",
    );
    await writeFile(
      resolve(destination, `${name}.png`),
      payload.files[0].attachment,
    );
  }
  await game.execute("travel", "demo", { zoneId: 2 });
  await game.execute("explore", "demo");
  await writeFile(
    resolve(destination, "combat.png"),
    (
      await render(
        await resolveRoute(game, { action: "campaign" }, "demo"),
        "demo",
      )
    ).files[0].attachment,
  );
  console.log(
    `${Object.keys(routes).length + 1} panneaux de démonstration générés dans ${destination}`,
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
