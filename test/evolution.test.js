import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { ActionRowBuilder, PermissionFlagsBits } from "discord.js";
import { Game, statsOf } from "../src/game.js";
import { MemoryStore } from "../src/store.js";
import { RACES, CLASSES, ZONES, HOUR } from "../src/content.js";
import { SPECIALIZATIONS, skillOf, specializationOf } from "../src/specializations.js";
import { HONORS, honorAppearance, unlockedHonors } from "../src/honors.js";
import { ENEMY_TRAITS } from "../src/bestiary.js";
import { campaignEnemy } from "../src/campaign.js";
import { previewReset, confirmReset } from "../src/admin.js";
import { buildView } from "../src/views.js";
import { drawPanel } from "../src/canvas.js";
import { normalizeImage } from "../src/profile-media.js";
import { resolveRoute, createInteractionHandler } from "../src/controller.js";
import { routeComponent, routeModal, buildModal, commands, uiId } from "../src/commands.js";
import { raceBody, gearIcon } from "../src/equipment-art.js";

const A = "111111111111111111", B = "222222222222222222", C = "333333333333333333";
async function create(game, id = A, classId = "guerrier", raceId = "humain") {
  return game.execute("create", id, { name: "Veilleur", classId, raceId });
}
async function setup() {
  let now = Date.UTC(2026, 9, 16, 12);
  const store = new MemoryStore(), game = new Game(store, { now: () => now, random: () => 0.5 });
  await create(game);
  return { game, store, advance: (n) => { now += n; } };
}
async function edit(game, change, id = A) {
  await game.store.transaction(async (tx) => { const p = await tx.get("player", id); change(p); await tx.set("player", id, p); });
}
async function wealthy(game, id = A) {
  await edit(game, (p) => { p.level = 10; p.gold = 10000; p.hp = statsOf(p).hp; p.mana = statsOf(p).mana; }, id);
}
const player = async (game, id = A) => (await game.execute("profile", id)).p;
function validate(view, owner = A) {
  assert.ok(view.components.length <= 5, view.screen.title);
  const ids = new Set();
  for (const row of view.components) {
    new ActionRowBuilder(row).toJSON();
    for (const c of row.components) {
      assert.ok(!ids.has(c.custom_id)); ids.add(c.custom_id);
      if (c.disabled) continue;
      for (const value of c.options?.map((o) => o.value) ?? [undefined])
        assert.ok(routeComponent(c.custom_id, owner, value ? [value] : []), c.custom_id);
    }
  }
}
async function battle(trait = "swarm", classId = "guerrier", specIndex) {
  const fixture = await setup(), { game } = fixture;
  await edit(game, (p) => { p.classId = classId; });
  await wealthy(game);
  if (specIndex !== undefined) await game.execute("chooseSpecialization", A, { specId: SPECIALIZATIONS[classId][specIndex].id });
  await game.execute("travel", A, { zoneId: 0 });
  await game.execute("explore", A, { mode: "farm", zoneId: 0, enemyIndex: 0, boss: false, elite: false });
  await edit(game, (p) => { p.battle.enemy.trait = trait; p.battle.enemy.hp = 10000; p.battle.enemy.maxHp = 10000; p.battle.enemy.attack = 1; });
  return fixture;
}

test("les sceaux s’achètent et changent l’identité au refuge sans perdre progression, objets ou personnalisations", async () => {
  const { game, advance } = await setup(); await wealthy(game);
  await game.execute("build", A, { buildingId: "comptoir", slot: 1 });
  await game.execute("shopBuy", A, { resource: "sceau_race", quantity: 2 });
  await game.execute("shopBuy", A, { resource: "sceau_classe", quantity: 1 });
  await edit(game, (p) => { p.talents.attack = 3; p.talentPoints = 6; p.hp = 55; p.mana = 10; p.customization.bio = "Mon histoire"; p.unlockedZone = 2; p.bosses = [0, 1]; });
  const before = await player(game), beforeStats = statsOf(before);
  let { p } = await game.execute("changeIdentity", A, { kind: "race", target: "nain" });
  assert.equal(p.resources.sceau_race, 1); assert.equal(p.raceId, "nain");
  assert.equal(p.buildings[0].type, "comptoir"); assert.equal(statsOf(p).gold, 0);
  assert.ok(p.hp / statsOf(p).hp <= before.hp / beforeStats.hp);
  assert.equal(p.unlockedZone, 2); assert.deepEqual(p.bosses, [0, 1]);
  assert.deepEqual(p.gear, before.gear); assert.equal(p.customization.bio, "Mon histoire");
  const wood = p.resources.bois; advance(HOUR);
  p = (await game.execute("collect", A)).p; assert.equal(p.resources.bois, wood);
  p = (await game.execute("changeIdentity", A, { kind: "class", target: "necromancien" })).p;
  assert.equal(p.level, 10); assert.equal(p.talentPoints, 9); assert.equal(p.talents.attack, 0);
  assert.equal(p.specialization, null); assert.equal(p.resources.sceau_classe, 0);
  await assert.rejects(game.execute("changeIdentity", A, { kind: "class", target: "mage" }), /sceau/);
  await game.execute("changeIdentity", A, { kind: "race", target: "humain" });
  assert.ok(statsOf(await player(game)).gold > 0);
});

test("les transformations refusent les faux paramètres et les combats, et un sceau ne peut pas être consommé deux fois", async () => {
  const { game } = await setup(); await wealthy(game);
  await game.execute("shopBuy", A, { resource: "sceau_classe", quantity: 1 });
  for (const args of [{ kind: "race", target: "__proto__" }, { kind: "toString", target: "mage" }, { kind: "class", target: "inconnu" }, { kind: "class", target: "guerrier" }]) {
    const before = await player(game); await assert.rejects(game.execute("changeIdentity", A, args));
    assert.deepEqual(await player(game), before);
  }
  await game.execute("travel", A, { zoneId: 0 });
  await assert.rejects(game.execute("changeIdentity", A, { kind: "class", target: "mage" }), /base/);
  await game.execute("returnHome", A);
  const attempts = await Promise.allSettled(["mage", "necromancien"].map((target) => game.execute("changeIdentity", A, { kind: "class", target })));
  assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await player(game)).resources.sceau_classe, 0);
});

test("54 spécialisations : trois voies effectives par classe, premier choix gratuit, changement payant et compétences persistantes", async () => {
  assert.equal(Object.values(SPECIALIZATIONS).flat().length, 54);
  for (const classId of Object.keys(CLASSES)) {
    const game = new Game(new MemoryStore(), { random: () => 0.5 });
    await create(game, A, classId); await wealthy(game);
    const baseline = statsOf(await player(game));
    for (const [index, spec] of SPECIALIZATIONS[classId].entries()) {
      const before = await player(game);
      const { p } = await game.execute("chooseSpecialization", A, { specId: spec.id });
      assert.equal(before.gold - p.gold, index === 0 ? 0 : 300);
      assert.notDeepEqual(statsOf(p), baseline, classId);
      assert.equal(skillOf(p).name, spec.skill.name);
      assert.equal(specializationOf((await new Game(game.store).execute("profile", A)).p).id, spec.id);
      validate(buildView(await resolveRoute(game, { action: "specializations" }, A), A));
    }
  }
});

test("spécialisations : niveau minimum, classe, base et prix sont revérifiés à la confirmation", async () => {
  const { game } = await setup();
  await assert.rejects(game.execute("chooseSpecialization", A, { specId: "guerrier_0" }), /Niveau 5/);
  await wealthy(game);
  await assert.rejects(game.execute("chooseSpecialization", A, { specId: "mage_0" }), /autre classe/);
  await game.execute("chooseSpecialization", A, { specId: "guerrier_0" });
  await edit(game, (p) => { p.gold = 299; });
  await assert.rejects(game.execute("chooseSpecialization", A, { specId: "guerrier_1" }), /pièces/);
  assert.equal((await player(game)).specialization, "guerrier_0");
  await game.execute("travel", A, { zoneId: 0 });
  await assert.rejects(game.execute("chooseSpecialization", A, { specId: "guerrier_1" }), /base/);
});

test("nécromancien : invocation pendant trois tours, drain amélioré et malédiction produisent trois styles distincts", async () => {
  for (let index = 0; index < 3; index++) {
    const { game } = await battle("swarm", "necromancien", index);
    await edit(game, (p) => { p.hp = 20; });
    const result = await game.execute("combat", A, { move: "skill" });
    assert.match(result.message, [ /Invocation/, /Vol de vie/, /Malédiction/ ][index]);
    if (index === 1) assert.ok(result.p.hp > 20);
    if (index === 0) {
      for (let turn = 2; turn <= 4; turn++) {
        const guard = await game.execute("combat", A, { move: "guard" });
        assert.equal(guard.message.includes("Invocation"), turn <= 3);
      }
    }
  }
});

test("36 créatures : les trois choix de chaque région ont des caractéristiques différentes, y compris leurs élites", () => {
  assert.equal(Object.keys(ENEMY_TRAITS).length, 36);
  for (const z of ZONES) for (const elite of [false, true]) {
    const enemies = z.enemies.map((_, i) => campaignEnemy(z, i, { elite }));
    assert.equal(new Set(enemies.map((e) => e.trait)).size, 3);
    assert.equal(new Set(enemies.map((e) => `${e.hp}/${e.attack}/${e.defense}`)).size, 3);
    assert.ok(enemies.every((e) => e.hp > 0 && e.attack > 0 && e.defense > 0));
  }
});

test("pillard : vole seulement le sac, la garde empêche le vol et la victoire restitue les pièces", async () => {
  for (const move of ["attack", "guard"]) {
    const { game } = await battle("thief"); game.hit = () => 1;
    await edit(game, (p) => { p.bag.gold = 100; p.battle.turn = 3; });
    const before = await player(game);
    const { p } = await game.execute("combat", A, { move });
    assert.equal(p.gold, before.gold);
    assert.equal(p.bag.gold, move === "guard" ? 100 : 93);
    if (move === "attack") {
      await edit(game, (v) => { v.battle.enemy.hp = 1; });
      const won = await game.execute("combat", A, { move: "attack" });
      assert.match(won.message, /récupères les 7 or/);
      assert.ok(won.p.bag.gold >= 140);
    }
  }
});

test("venin, régénération et sentinelle influencent réellement les tours", async () => {
  for (const move of ["attack", "guard"]) {
    const { game } = await battle("venom"); game.hit = () => 1;
    await edit(game, (p) => { p.battle.turn = 3; });
    const result = await game.execute("combat", A, { move });
    assert.equal(result.message.includes("Poison :"), move === "attack");
    if (move === "attack") {
      const healed = await game.execute("combat", A, { move: "potion" });
      assert.equal(healed.p.battle.poisonTurns, 0); assert.ok(!healed.message.includes("Poison :"));
    }
  }
  const regen = (await battle("regenerating")).game; regen.hit = () => 1;
  await edit(regen, (p) => { p.battle.turn = 3; p.battle.enemy.hp = 500; p.battle.enemy.maxHp = 1000; });
  assert.equal((await regen.execute("combat", A, { move: "attack" })).p.battle.enemy.hp, 579);
  const sentinel = (await battle("sentinel")).game; sentinel.hit = () => 100;
  const first = await sentinel.execute("combat", A, { move: "attack" });
  assert.match(first.message, /70 dégâts/);
});

test("les exploits gagnés débloquent titres, cadres et décorations sans changer les statistiques", async () => {
  const { game } = await setup(); const before = statsOf(await player(game));
  await assert.rejects(game.execute("equipHonor", A, { slot: "frame", honorId: "raid" }), /pas encore/);
  await edit(game, (p) => { p.kills = 25; p.raids = 1; p.social.defenses = 1; p.social.rescues = 1; p.social.wins = 5; p.raidWins[2] = 1; p.bosses = ZONES.map((z) => z.id); p.bestiary = Object.fromEntries(ZONES.flatMap((z) => z.enemies.map((n) => [n, 1]))); });
  assert.equal(unlockedHonors(await player(game)).length, HONORS.length);
  for (const slot of ["title", "frame", "decoration"]) await game.execute("equipHonor", A, { slot, honorId: "chasseur" });
  const after = await player(game); assert.deepEqual(statsOf(after), before);
  assert.equal(honorAppearance(after).earnedTitle, "Pisteur de Brume");
  const publicView = buildView(await resolveRoute(game, { action: "publicProfile", args: { targetId: A } }, B), B);
  assert.equal(publicView.screen.frame.id, "forest");
  assert.ok(publicView.screen.cards.some((c) => c.text === "Pisteur de Brume"));
  validate(publicView, B);
  for (const slot of ["title", "frame", "decoration"]) await game.execute("equipHonor", A, { slot, honorId: "none" });
  assert.equal(honorAppearance(await player(game)).frame, null);
});

test("un vrai soin sur un allié blessé en raid compte pour l’exploit de sauvetage", async () => {
  const { game } = await setup(); await edit(game, (p) => { p.classId = "pretre"; });
  await wealthy(game); await create(game, B); await wealthy(game, B);
  await edit(game, (p) => { p.hp = Math.ceil(statsOf(p).hp * 0.5); }, B);
  const { party } = await game.execute("partyCreate", A, { raidId: 0 });
  await game.execute("partyJoin", B, { partyId: party.id });
  const hurt = Math.ceil(statsOf(await player(game, B)).hp * 0.4); let hits = 0;
  game.pick = (list) => list.at(-1);
  game.hit = (attack) => attack === 24 ? (++hits === 1 ? hurt : 0) : 1;
  await game.execute("raid", A);
  assert.equal((await player(game)).social.rescues, 1);
  assert.ok(unlockedHonors(await player(game)).some((h) => h.id === "secours"));
});

test("le reset nettoie les liens et les annonces, transmet les directions et conserve les biens des autres joueurs", async () => {
  const { game, store } = await setup(); await create(game, B); await create(game, C);
  await wealthy(game); await wealthy(game, B);
  await game.execute("friendRequest", B, { targetId: A });
  await game.execute("friendRespond", A, { requestId: `${B}.${A}`, response: "accept" });
  await game.execute("blockPlayer", C, { targetId: B });
  const { guild } = await game.execute("guildCreate", B, { name: "Les Veilleurs" });
  await game.execute("guildJoin", A, { guildId: guild.id });
  await game.execute("guildDonate", B, { gold: 50 });
  await store.transaction(async (tx) => {
    const g = await tx.get("guild", guild.id);
    g.city = { invasion: { hp: 0, won: true, contributions: { [A]: 100, [B]: 200 }, sorties: { [B]: 3 }, claimed: [] } };
    await tx.set("guild", g.id, g);
  });
  const { party } = await game.execute("partyCreate", B, { raidId: 0 });
  await game.execute("partyJoin", A, { partyId: party.id });
  await game.execute("sell", B, { resource: "bois", quantity: 2, price: 10 });
  await game.execute("duelChallenge", B, { targetId: A });
  const original = await player(game), target = await player(game, B);
  const pending = await previewReset(game, A, B, "main");
  assert.equal((await player(game, B)).generation, target.generation);
  await assert.rejects(confirmReset(game, C, pending.token, "main"), /autorisée/);
  await assert.rejects(confirmReset(game, A, pending.token, "other"), /autorisée/);
  await confirmReset(game, A, pending.token, "main");
  assert.equal(await store.transaction((tx) => tx.get("player", B)), null);
  const survivor = await player(game); assert.equal(survivor.gold, original.gold);
  assert.deepEqual(survivor.gear, original.gear); assert.deepEqual(survivor.social.friends, []);
  assert.ok((await player(game, C)).social.blocked.includes(B));
  const g = await store.transaction((tx) => tx.get("guild", guild.id));
  assert.equal(g.leaderId, A); assert.equal(g.gold, 50);
  assert.equal(g.city.invasion.contributions[B], undefined);
  assert.equal(g.city.invasion.contributions[A], 100);
  assert.equal(g.city.invasion.sorties[B], 3); assert.equal(g.city.invasion.won, true);
  assert.equal((await store.transaction((tx) => tx.get("party", party.id))).leaderId, A);
  assert.equal((await store.transaction((tx) => tx.list("listing"))).length, 0);
  assert.equal((await store.transaction((tx) => tx.list("duel"))).filter((d) => d.status === "pending").length, 0);
  assert.equal((await store.transaction((tx) => tx.list("admin_audit"))).length, 1);
  await assert.rejects(confirmReset(game, A, pending.token, "main"));
  await create(game, B); assert.notEqual((await player(game, B)).generation, target.generation);
});

test("reset : expiration et génération empêchent une ancienne confirmation d’effacer un nouveau personnage", async () => {
  const { game, advance } = await setup(); await create(game, B);
  const first = await previewReset(game, A, B, "main"), second = await previewReset(game, A, B, "main");
  await confirmReset(game, A, first.token, "main"); await create(game, B);
  await assert.rejects(confirmReset(game, A, second.token, "main"), /déjà été/);
  const expired = await previewReset(game, A, B, "main"); advance(6 * 60_000);
  await assert.rejects(confirmReset(game, A, expired.token, "main"), /expirée/);
  assert.ok(await player(game, B));
});

test("la commande reset est privée et vérifie le serveur principal et le rôle admin à chaque interaction", async () => {
  const { game } = await setup(); await create(game, B);
  assert.equal(commands.find((c) => c.name === "admin-reset").default_member_permissions, "8");
  const handler = createInteractionHandler(game, { adminGuildId: "main", cooldownMs: 0, renderer: async (r) => ({ result: r }) });
  const calls = [];
  const mock = (guildId, allowed, extras = {}) => ({
    id: `admin-${Math.random()}`, user: { id: A }, guildId,
    memberPermissions: { has: (bit) => bit === PermissionFlagsBits.Administrator && allowed },
    commandName: "admin-reset", options: { getUser: () => ({ id: B }) },
    inGuild: () => true, isChatInputCommand: () => true, isModalSubmit: () => false,
    async deferReply(o) { this.deferred = true; calls.push(o); },
    async editReply(payload) { calls.push(payload); }, ...extras,
  });
  for (const [guildId, allowed] of [["other", true], ["main", false]]) {
    calls.length = 0; await handler(mock(guildId, allowed));
    assert.equal(calls[0].flags, 64); assert.equal(calls[1].result.type, "error");
  }
  calls.length = 0; await handler(mock("main", true));
  assert.equal(calls[0].flags, 64); assert.equal(calls[1].result.type, "adminResetPreview");
  const preview = calls[1].result; validate(buildView(preview, A));
  calls.length = 0;
  await handler(mock("main", false, { isChatInputCommand: () => false, isButton: () => true,
    customId: uiId(A, "adminConfirm", preview.token) }));
  assert.equal(calls.at(-1).result.type, "error"); assert.ok(await player(game, B));
  calls.length = 0;
  await handler(mock("main", true, { isChatInputCommand: () => false, isButton: () => true,
    customId: uiId(A, "adminConfirm", preview.token), message: { id: "admin-preview", flags: { has: () => true } },
    async deferUpdate() { this.deferred = true; },
  }));
  assert.equal(calls.at(-1).result.type, "adminResetDone");
  assert.equal(await game.store.transaction((tx) => tx.get("player", B)), null);
});

test("silhouettes : les seize races ont des cellules distinctes et les anciens objets possèdent tous une icône", async () => {
  const atlas = await loadImage(fileURLToPath(new URL("../src/assets/race-bodies.webp", import.meta.url)));
  const hashes = new Set();
  for (const raceId of Object.keys(RACES)) {
    const ref = raceBody(raceId), c = createCanvas(100, 100);
    c.getContext("2d").drawImage(atlas, (ref.index % 4) * atlas.width / 4, Math.floor(ref.index / 4) * atlas.height / 4, atlas.width / 4, atlas.height / 4, 0, 0, 100, 100);
    hashes.add(createHash("sha256").update(await c.encode("png")).digest("hex"));
  }
  assert.equal(hashes.size, 16);
  assert.equal(gearIcon({ name: "Arc des étoiles", slot: "weapon" }), "bow");
  assert.equal(gearIcon({ name: "Bâton ancien", slot: "weapon" }), "staff");
  assert.equal(gearIcon({ name: "Objet inconnu", slot: "armor" }), "armor");
});

test("avatar d’équipement : upload séparé, persistance, objets autour de l’image et retrait sans perte d’équipement", async () => {
  const { game } = await setup(); await wealthy(game);
  const c = createCanvas(64, 96); c.getContext("2d").fillStyle = "#0000ff"; c.getContext("2d").fillRect(0, 0, 64, 96);
  const avatar = await normalizeImage(await c.encode("png"), "avatar");
  assert.equal(avatar.width, 512); assert.equal(avatar.height, 768);
  await game.execute("customizeImage", A, { slot: "avatar", media: avatar });
  const restored = new Game(game.store), result = await resolveRoute(restored, { action: "inventory" }, A);
  assert.equal(result.appearance.avatar.hash, avatar.hash);
  const view = buildView(result, A), panel = await drawPanel(view.screen);
  const png = await loadImage(panel.buffer), out = createCanvas(png.width, png.height), ctx = out.getContext("2d"); ctx.drawImage(png, 0, 0);
  const body = panel.equipmentBounds.avatar, pixel = ctx.getImageData(body.x + body.width / 2, body.y + body.height / 2, 1, 1).data;
  assert.ok(pixel[2] > 220 && pixel[0] < 50);
  assert.equal(panel.equipmentBounds.slots.length, 3);
  for (const s of panel.equipmentBounds.slots) {
    assert.ok(s.x + s.width <= body.x || s.x >= body.x + body.width);
    assert.ok(s.y + s.height <= panel.height - 80);
  }
  assert.equal(panel.equipmentBounds.slots[0].name, result.p.gear[0].name);
  const gear = structuredClone(result.p.gear);
  await game.execute("customizeReset", A, { slot: "avatar" });
  assert.deepEqual((await player(game)).gear, gear);
  assert.equal((await resolveRoute(game, { action: "inventory" }, A)).appearance.avatar, null);
  const modal = buildModal(A, "avatarUpload");
  const parsed = routeModal(modal.custom_id, A, { getUploadedFiles: () => new Map([["image", { size: 40, url: "x" }]]) });
  assert.equal(parsed.args.slot, "avatar");
});

test("tous les nouveaux menus et les confirmations respectent les limites et leurs routes Discord", async () => {
  const { game } = await setup(); await wealthy(game);
  for (const action of ["identity", "specializations", "honors", "customize", "inventory"])
    validate(buildView(await resolveRoute(game, { action }, A), A));
  for (const route of [
    { action: "identityPreview", args: { kind: "race", target: "nain" } },
    { action: "identityPreview", args: { kind: "class", target: "mage" } },
    { action: "specializationPreview", args: { specId: "guerrier_0" } },
    { action: "codex", args: { category: "specialisations", page: 14 } },
    { action: "codex", args: { category: "bestiaire", page: 9 } },
  ]) {
    const view = buildView(await resolveRoute(game, route, A), A); validate(view);
    assert.ok((await drawPanel(view.screen)).buffer.length < 8_000_000);
  }
});
