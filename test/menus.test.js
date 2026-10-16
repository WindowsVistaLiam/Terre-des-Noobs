import test from "node:test";
import assert from "node:assert/strict";
import { ActionRowBuilder, ModalBuilder } from "discord.js";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { Game } from "../src/game.js";
import { MemoryStore } from "../src/store.js";
import { buildView } from "../src/views.js";
import { drawPanel } from "../src/canvas.js";
import { resolveRoute, createInteractionHandler } from "../src/controller.js";
import { routeComponent, publicId, uiId } from "../src/commands.js";
import { normalizeImage } from "../src/profile-media.js";

const A = "111111111111111111", B = "222222222222222222";
async function setup() {
  const game = new Game(new MemoryStore(), { now: () => Date.UTC(2026, 9, 16, 12), random: () => 0.5 });
  for (const [id, name] of [[A, "Aelys"], [B, "Borin"]])
    await game.execute("create", id, { name, raceId: "humain", classId: "guerrier" });
  return game;
}
const controls = (view) => view.components.flatMap((r) => r.components);
function findOption(view, label) {
  const menu = controls(view).find((c) => c.options?.some((o) => o.label === label));
  assert.ok(menu, `Option introuvable : ${label}`);
  return { menu, option: menu.options.find((o) => o.label === label) };
}
function validate(view, owner = A) {
  assert.ok(view.components.length <= 5, view.screen.title);
  const ids = new Set();
  for (const row of view.components) {
    new ActionRowBuilder(row).toJSON();
    for (const c of row.components) {
      assert.ok(!ids.has(c.custom_id)); ids.add(c.custom_id);
      if (c.disabled) continue;
      for (const value of c.options?.map((o) => o.value) ?? [undefined])
        assert.ok(routeComponent(c.custom_id, owner, value ? [value] : c.type === 5 ? [B] : []));
    }
  }
}

test("profil, social, marché, info et personnalisation utilisent des listes tout en gardant leurs actions principales", async () => {
  const game = await setup();
  const views = {};
  for (const action of ["profile", "social", "market", "info", "customize"]) {
    const view = buildView(await resolveRoute(game, { action }, A), A);
    views[action] = view; validate(view);
    assert.ok(controls(view).some((c) => c.type === 3 && c.custom_id.includes(":menu:")));
    assert.ok(controls(view).filter((c) => c.type === 2 && !c.disabled).length <= 3, action);
  }
  for (const label of ["Personnalisation du profil", "Talents", "⌂ Mon refuge"])
    assert.ok(findOption(views.profile, label));
  for (const label of ["Mes amis", "Ma guilde", "Notre cité", "Mes duels", "Carte de la campagne"])
    assert.ok(findOption(views.social, label));
  for (const label of ["Coffre", "Ressources / vendre", "Atelier", "Marchand"])
    assert.ok(findOption(views.market, label));
  assert.ok(controls(views.profile).some((c) => c.type === 2 && c.label === "⚔ Partir à l’aventure"));
  assert.ok(controls(views.profile).some((c) => c.type === 2 && c.label === "Récupérer les provisions"));
  assert.ok(!controls(views.customize).some((c) => c.options?.some((o) => o.label === "Retirer le portrait")));
});

test("les listes privées et publiques refusent un autre propriétaire, les mutations publiques et les menus récursifs", () => {
  const privateMenu = uiId(A, "menu", "context", 0), publicMenu = publicId("menu", "context", 0);
  assert.deepEqual(routeComponent(privateMenu, A, [uiId(A, "nav", "customize")]), {
    action: "customize", args: { page: 1, mine: false },
  });
  assert.equal(routeComponent(privateMenu, B, [uiId(A, "nav", "profile")]), null);
  assert.equal(routeComponent(privateMenu, A, [uiId(B, "nav", "profile")]), null);
  assert.equal(routeComponent(privateMenu, A, [publicId("profile")]), null);
  assert.equal(routeComponent(privateMenu, A, [privateMenu]), null);
  assert.equal(routeComponent(privateMenu, A, [null]), null);
  assert.equal(routeComponent(publicMenu, B, [uiId(A, "do", "returnHome")]), null);
  assert.equal(routeComponent(publicMenu, B, [publicId("do", "daily")]), null);
  assert.equal(routeComponent(publicMenu, B, [publicMenu]), null);
  assert.equal(routeComponent(publicMenu, B, ["x".repeat(101)]), null);
  assert.deepEqual(routeComponent(publicMenu, B, [publicId("social")]), { action: "social", args: {} });
  // Les boutons publiés avant cette mise à jour gardent leurs routes.
  assert.equal(routeComponent(uiId(A, "nav", "customize"), A).action, "customize");
});

test("un formulaire de personnalisation s’ouvre directement depuis la liste Discord", async () => {
  const game = await setup();
  const view = buildView(await resolveRoute(game, { action: "customize" }, A), A);
  const { menu, option } = findOption(view, "Changer mon portrait");
  const calls = [];
  const handler = createInteractionHandler(game, { cooldownMs: 0 });
  await handler({
    id: "choose-photo", user: { id: A }, customId: menu.custom_id, values: [option.value],
    inGuild: () => true, isChatInputCommand: () => false, isButton: () => false,
    isStringSelectMenu: () => true, isModalSubmit: () => false,
    async showModal(modal) { new ModalBuilder(modal).toJSON(); calls.push(modal); },
    async deferReply() { assert.fail("Le formulaire doit être la première réponse."); },
    async deferUpdate() { assert.fail("Le formulaire doit être la première réponse."); },
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].custom_id, /portraitUpload/);
});

test("choisir Social sur un profil public ouvre le carnet du visiteur et conserve le message partagé", async () => {
  const game = await setup(), calls = [];
  const view = buildView(await resolveRoute(game, { action: "publicProfile", args: { targetId: A } }, B), B);
  validate(view, B);
  const { menu, option } = findOption(view, "Social");
  assert.ok(menu.custom_id.startsWith("tdnp:menu:"));
  const handler = createInteractionHandler(game, {
    cooldownMs: 0, renderer: async (result) => ({ result }),
  });
  await handler({
    id: "public-social", user: { id: B }, customId: menu.custom_id, values: [option.value],
    message: { id: "public-profile", flags: { has: () => false } },
    inGuild: () => true, isChatInputCommand: () => false, isButton: () => false,
    isStringSelectMenu: () => true, isModalSubmit: () => false,
    async deferReply(options) { this.deferred = true; calls.push(["defer", options]); },
    async deferUpdate() { assert.fail("Ne pas modifier le profil partagé."); },
    async editReply(payload) { calls.push(["edit", payload]); },
  });
  assert.equal(calls[0][1].flags, 64);
  assert.equal(calls[1][1].result.type, "social");
  assert.equal(calls[1][1].result.p.id, B);
});

test("quitter une guilde depuis une liste exige toujours la confirmation et les boutons de combat restent directs", async () => {
  const game = await setup();
  await game.execute("daily", A);
  const { guild } = await game.execute("guildCreate", A, { name: "Les Veilleurs" });
  const view = buildView(await resolveRoute(game, { action: "guildInfo" }, A), A);
  const { menu, option } = findOption(view, "Quitter…");
  const confirmation = buildView(await resolveRoute(game, routeComponent(menu.custom_id, A, [option.value]), A), A);
  assert.equal((await game.execute("profile", A)).p.guildId, guild.id);
  assert.ok(controls(confirmation).some((c) => c.type === 2 && c.label === "Confirmer"));
  await game.execute("travel", A, { zoneId: 0 });
  const result = await game.execute("explore", A);
  const fight = buildView(result, A); validate(fight);
  assert.equal(controls(fight).filter((c) => c.type === 2).length, 6);
  assert.ok(controls(fight).some((c) => c.label === "Fuir"));
});

test("la carte affiche les vrais portraits et les noms complets de six héros au même endroit sans chevauchement", async () => {
  const game = await setup();
  for (let i = 0; i < 4; i++) await game.execute("create", `other${i}`, {
    name: i === 0 ? "W".repeat(24) : `Aventurier ${i}`, raceId: "humain", classId: "mage",
  });
  const media = {};
  for (const [id, color] of [[A, "#ff0000"], [B, "#0000ff"]]) {
    const c = createCanvas(64, 64), ctx = c.getContext("2d");
    ctx.fillStyle = color; ctx.fillRect(0, 0, 64, 64);
    media[id] = await normalizeImage(await c.encode("png"), "portrait");
    await game.execute("customizeImage", id, { slot: "portrait", media: media[id] });
  }
  const result = await resolveRoute(new Game(game.store), { action: "map" }, A);
  assert.equal(Object.keys(result.appearance.travelers).length, 6);
  assert.equal(result.appearance.travelers[A].hash, media[A].hash);
  assert.equal(result.appearance.travelers[B].hash, media[B].hash);
  assert.ok(result.travelers.every((v) => !("portrait" in v) && !("gold" in v)));
  const view = buildView(result, A); validate(view);
  const panel = await drawPanel(view.screen);
  const png = await loadImage(panel.buffer), c = createCanvas(png.width, png.height), ctx = c.getContext("2d");
  ctx.drawImage(png, 0, 0);
  assert.equal(panel.mapMarkers.length, 6);
  assert.ok(panel.buffer.length < 8_000_000);
  for (const marker of panel.mapMarkers) {
    const node = panel.mapNodes[marker.stage];
    assert.ok(marker.x >= node.x && marker.x + marker.width <= node.x + node.width);
    assert.ok(marker.y >= node.y && marker.y + marker.height <= node.y + node.height);
    const pixel = ctx.getImageData(marker.portraitX + 20, marker.portraitY + 20, 1, 1).data;
    if (marker.id === A) assert.ok(pixel[0] > 220 && pixel[2] < 50, Array.from(pixel).join(","));
    if (marker.id === B) assert.ok(pixel[2] > 220 && pixel[0] < 50, Array.from(pixel).join(","));
    const next = panel.mapMarkers.find((v) => v.stage === marker.stage && v.y > marker.y);
    if (next) assert.ok(marker.y + marker.height <= next.y);
  }
  assert.ok(panel.mapMarkers.some((m) => m.name === "W".repeat(24)));
  assert.ok(view.screen.cards.every((c) => !/^\d+ ·/.test(c.title)));
});
