import test from "node:test";
import assert from "node:assert/strict";
import { loadImage, createCanvas } from "@napi-rs/canvas";
import {
  createPreviewGame,
  createSocialPreviewGame,
} from "../scripts/preview.js";
import { resolveRoute } from "../src/controller.js";
import { buildView, render, codexEntries } from "../src/views.js";
import { drawPanel, wrapText } from "../src/canvas.js";
import { uiId } from "../src/commands.js";
import { RACE_COLORS } from "../src/social-content.js";

async function verifyImage(result, owner = "demo") {
  const { screen } = buildView(result, owner);
  const panel = await drawPanel(screen);
  assert.ok(
    panel.buffer
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  );
  const png = await loadImage(panel.buffer);
  assert.equal(png.width, 1280);
  assert.equal(png.height, panel.height);
  assert.ok(
    panel.buffer.length < 8_000_000,
    `${screen.title}: attachment too large`,
  );
  for (const card of panel.cards) {
    assert.ok(card.x >= 0 && card.x + card.width <= panel.width);
    assert.ok(
      card.y >= 170 && card.y + card.height <= panel.height - 80,
      `${screen.title}: footer overlap`,
    );
  }
  return panel;
}

test("les panneaux sont de vraies images PNG, sans embed texte et sans ancienne pièce jointe", async () => {
  const game = await createPreviewGame();
  const payload = await render(
    await resolveRoute(game, { action: "profile" }, "demo"),
    "demo",
  );
  assert.equal(payload.files.length, 1);
  assert.ok(Buffer.isBuffer(payload.files[0].attachment));
  assert.deepEqual(payload.embeds, []);
  assert.deepEqual(payload.attachments, []);
  assert.equal(payload.content, "");
  assert.deepEqual(payload.allowedMentions, { parse: [] });
  assert.ok(payload.files[0].description.includes("Aelys"));
  assert.ok(payload.files[0].description.length <= 1024);
});

test("tous les menus principaux et leurs sous-menus se rendent sans débordement", async () => {
  const game = await createPreviewGame();
  const p = (await game.execute("profile", "demo")).p;
  const listingId = (await game.execute("market", "demo")).listings[0].id;
  const routes = [
    ...[
      "profile",
      "market",
      "info",
      "map",
      "campaign",
      "base",
      "talents",
      "quests",
      "social",
      "guildInfo",
      "partyInfo",
      "guilds",
      "parties",
      "inventory",
      "resources",
      "crafting",
      "store",
      "leaderboard",
    ].map((action) => ({ action })),
    { action: "slot", args: { slot: 1 } },
    { action: "slot", args: { slot: 3 } },
    { action: "building", args: { slot: 3, buildingId: "jardin" } },
    { action: "item", args: { itemId: p.gear[2].id } },
    { action: "recipe", args: { recipeId: "arme_antique" } },
    { action: "listing", args: { listingId } },
    { action: "shopDetail", args: { resource: "potion" } },
    { action: "giftOptions", args: {} },
    { action: "giftOptions", args: { targetId: "merchant" } },
    { action: "raidPreview", args: { raidId: 0 } },
    { action: "confirm", args: { kind: "salvage", value: p.gear[2].id } },
  ];
  for (const route of routes)
    await verifyImage(await resolveRoute(game, route, "demo"));
});

test("chaque page des huit chapitres du codex reste lisible et dans son cadre", async () => {
  const game = await createPreviewGame();
  const p = (await game.execute("profile", "demo")).p;
  for (const category of [
    "races",
    "classes",
    "metiers",
    "items",
    "batiments",
    "recettes",
    "raids",
    "regles",
  ]) {
    for (
      let page = 1;
      page <= Math.ceil(codexEntries(category, p).length / 4);
      page++
    )
      await verifyImage({ p, type: "codex", category, page });
  }
});

test("création, erreurs et long message de combat sont aussi rendus en images", async () => {
  for (const result of [
    { type: "welcome" },
    { type: "creationRace" },
    { type: "creationClass", raceId: "demi_dragon" },
    {
      type: "creationReview",
      raceId: "demi_dragon",
      classId: "chevalier_noir",
    },
    { type: "error", message: "Une erreur de validation bien expliquée." },
  ])
    await verifyImage(result);
  const game = await createPreviewGame();
  await game.execute("travel", "demo", { zoneId: 2 });
  await game.execute("explore", "demo");
  const result = await resolveRoute(game, { action: "campaign" }, "demo");
  await verifyImage({
    ...result,
    message:
      "La lame frappe dans la Brume.\nLe gardien prépare sa riposte.\nTu récupères du mana.\nVictoire ! Tu trouves une arme rare et des matériaux.",
  });
});

test("guildes nombreuses et noms très longs ne débordent pas des cartes", async () => {
  const game = await createPreviewGame();
  const p = (await game.execute("profile", "demo")).p;
  const members = Array.from({ length: 30 }, (_, i) => ({
    id: `member-${i}`,
    name: "A".repeat(24),
    level: 50,
  }));
  await verifyImage({
    p,
    type: "guild",
    guild: {
      id: "demo",
      name: "La Confrérie des Longues Veillées",
      members: members.map((m) => m.id),
      leaderId: "demo",
      level: 10,
      gold: 123456,
    },
    members,
  });
  const context = createCanvas(600, 200).getContext("2d");
  context.font = "23px BrumeText";
  const lines = wrapText(context, "A".repeat(100), 180);
  assert.ok(lines.length > 1);
  assert.ok(lines.every((line) => context.measureText(line).width <= 180));
});

test("les quatre espaces ont des décors distincts et le profil garde son fond initial", async () => {
  const game = await createSocialPreviewGame();
  const hashes = new Set();
  for (const [action, background] of [
    ["profile", "profile"],
    ["social", "social"],
    ["market", "market"],
    ["info", "info"],
  ]) {
    const result = await resolveRoute(game, { action }, "demo");
    assert.equal(buildView(result, "demo").screen.background, background);
    const panel = await verifyImage(result);
    hashes.add(panel.buffer.toString("base64").slice(-1000));
  }
  assert.equal(hashes.size, 4);
});

test("les pages de peuples colorent le texte et réutilisent une seule bibliothèque", () => {
  const cards = codexEntries("races");
  assert.equal(cards.length, 16);
  assert.equal(new Set(cards.map((c) => c.textColor)).size, 16);
  assert.deepEqual(
    new Set(cards.map((c) => c.textColor)),
    new Set(Object.values(RACE_COLORS)),
  );
  for (const card of cards) assert.match(card.textColor, /^#[0-9a-f]{6}$/i);
});

test("les amis, la réception, la cité et les sorties coopératives sont aussi de vrais PNG", async () => {
  const game = await createSocialPreviewGame();
  for (const action of [
    "social",
    "friends",
    "inbox",
    "directory",
    "city",
    "cityDefensePlan",
    "guildRoster",
    "pvpLeaderboard",
  ])
    await verifyImage(await resolveRoute(game, { action }, "demo"));
  const mail = await game.execute("inboxInfo", "demo");
  await verifyImage(
    await resolveRoute(
      game,
      { action: "duel", args: { duelId: mail.challenges[0].id } },
      "demo",
    ),
  );
  await verifyImage(
    await resolveRoute(
      game,
      { action: "cityPlan", args: { buildingId: "remparts" } },
      "demo",
    ),
  );
});
