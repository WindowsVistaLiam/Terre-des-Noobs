import test from "node:test";
import assert from "node:assert/strict";
import { Game, statsOf } from "../src/game.js";
import { MemoryStore } from "../src/store.js";
import { DAY, HOUR } from "../src/content.js";

function setup() {
  let now = Date.UTC(2026, 9, 15, 12);
  const game = new Game(new MemoryStore(), {
    random: () => 0.5,
    now: () => now,
  });
  return {
    game,
    advance: (ms) => {
      now += ms;
    },
  };
}
async function player(game, id, level = 1) {
  await game.execute("create", id, {
    name: id[0].toUpperCase() + id.slice(1),
    raceId: "humain",
    classId: "guerrier",
  });
  if (level > 1)
    await edit(game, id, (p) => {
      p.level = level;
      p.gold = 50000;
      p.hp = statsOf(p).hp;
      p.mana = statsOf(p).mana;
      for (const key of ["bois", "pierre", "fer", "herbe", "essence"])
        p.resources[key] = 1000;
    });
}
async function edit(game, id, fn) {
  await game.store.transaction(async (tx) => {
    const p = await tx.get("player", id);
    fn(p);
    await tx.set("player", id, p);
  });
}
async function guild(game, leader = "alice", name = "Les Veilleurs") {
  return (await game.execute("guildCreate", leader, { name })).guild.id;
}
async function fund(game, guildId) {
  await game.store.transaction(async (tx) => {
    const g = await tx.get("guild", guildId);
    g.gold = 50000;
    await tx.set("guild", guildId, g);
  });
}

test("les sauvegardes antérieures reçoivent les champs sociaux sans perdre de données", async () => {
  const { game } = setup();
  await player(game, "alice");
  await edit(game, "alice", (p) => {
    delete p.social;
    p.gold = 321;
  });
  const { p } = await game.execute("profile", "alice");
  assert.deepEqual(p.social.friends, []);
  assert.equal(p.gold, 321);
  assert.ok(p.lastActiveAt);
  assert.equal(p.schemaVersion, 1);
});

test("demandes d’amis : propriété, acceptation atomique, réciprocité et retrait", async () => {
  const { game } = setup();
  for (const id of ["alice", "bob", "carol"]) await player(game, id);
  await game.execute("friendRequest", "alice", { targetId: "bob" });
  const mail = await game.execute("inboxInfo", "bob");
  const key = mail.incoming[0].id;
  await assert.rejects(
    game.execute("friendRespond", "carol", {
      requestId: key,
      response: "accept",
    }),
    /appartient/,
  );
  await assert.rejects(
    game.execute("friendRequest", "bob", { targetId: "alice" }),
    /déjà envoyé/,
  );
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      game.execute("friendRespond", "bob", {
        requestId: key,
        response: "accept",
      }),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.deepEqual((await game.execute("profile", "alice")).p.social.friends, [
    "bob",
  ]);
  assert.deepEqual((await game.execute("profile", "bob")).p.social.friends, [
    "alice",
  ]);
  await game.execute("friendRemove", "alice", { targetId: "bob" });
  assert.equal((await game.execute("friendsInfo", "bob")).entries.length, 0);
});

test("les demandes expirent et un refus impose un délai contre les répétitions", async () => {
  const { game, advance } = setup();
  await player(game, "alice");
  await player(game, "bob");
  await game.execute("friendRequest", "alice", { targetId: "bob" });
  await game.execute("friendRespond", "bob", {
    requestId: "alice.bob",
    response: "decline",
  });
  await assert.rejects(
    game.execute("friendRequest", "alice", { targetId: "bob" }),
    /délai/,
  );
  advance(DAY);
  await game.execute("friendRequest", "alice", { targetId: "bob" });
  advance(8 * DAY);
  assert.equal((await game.execute("inboxInfo", "bob")).incoming.length, 0);
  await assert.rejects(
    game.execute("friendRespond", "bob", {
      requestId: "alice.bob",
      response: "accept",
    }),
    /disponible/,
  );
});

test("le blocage coupe amitié, demandes, cadeaux, défis et invitations dans les deux sens", async () => {
  const { game } = setup();
  await player(game, "alice", 10);
  await player(game, "bob");
  await guild(game);
  await game.execute("friendRequest", "alice", { targetId: "bob" });
  await game.execute("friendRespond", "bob", {
    requestId: "alice.bob",
    response: "accept",
  });
  await game.execute("duelChallenge", "alice", { targetId: "bob" });
  await game.execute("blockPlayer", "bob", { targetId: "alice" });
  assert.equal((await game.execute("duelsInfo", "alice")).entries.length, 0);
  assert.deepEqual(
    (await game.execute("profile", "alice")).p.social.friends,
    [],
  );
  for (const [action, args] of [
    ["friendRequest", { targetId: "bob" }],
    ["duelChallenge", { targetId: "bob" }],
    ["guildInvite", { targetId: "bob" }],
    ["gift", { targetId: "bob", gold: 5 }],
  ])
    await assert.rejects(game.execute(action, "alice", args));
  await game.execute("unblockPlayer", "bob", { targetId: "alice" });
  await game.execute("duelChallenge", "alice", { targetId: "bob" });
});

test("un profil social public ne révèle ni coffre, ni or, ni liste privée", async () => {
  const { game } = setup();
  await player(game, "alice");
  await player(game, "bob");
  const { target } = await game.execute("playerCard", "alice", {
    targetId: "bob",
  });
  for (const key of ["gold", "gear", "resources", "social", "bag", "equipment"])
    assert.equal(target[key], undefined);
  assert.ok(target.stats.attack > 0);
});

test("duels : consentement, classement et absence de pertes ou de création de monnaie", async () => {
  const { game } = setup();
  await player(game, "alice", 20);
  await player(game, "bob");
  await player(game, "carol");
  const a = (await game.execute("profile", "alice")).p,
    b = (await game.execute("profile", "bob")).p;
  const { duel } = await game.execute("duelChallenge", "alice", {
    targetId: "bob",
  });
  await assert.rejects(
    game.execute("duelRespond", "carol", {
      duelId: duel.id,
      response: "accept",
    }),
    /appartient/,
  );
  const result = await game.execute("duelRespond", "bob", {
    duelId: duel.id,
    response: "accept",
  });
  assert.equal(result.duel.status, "finished");
  assert.equal(result.duel.winner, "alice");
  for (const before of [a, b]) {
    const after = (await game.execute("profile", before.id)).p;
    for (const key of ["hp", "mana", "gold", "energy", "xp"])
      assert.equal(after[key], before[key], key);
    assert.deepEqual(after.gear, before.gear);
  }
  assert.equal((await game.execute("profile", "alice")).p.social.wins, 1);
  await assert.rejects(
    game.execute("duelRespond", "bob", { duelId: duel.id, response: "accept" }),
    /disponible/,
  );
  const second = await game.execute("duelChallenge", "alice", {
    targetId: "bob",
  });
  await assert.rejects(
    game.execute("duelRespond", "bob", {
      duelId: second.duel.id,
      response: "accept",
    }),
    /minute/,
  );
});

test("un duel refusé ou expiré ne peut plus être lancé", async () => {
  const { game, advance } = setup();
  await player(game, "alice");
  await player(game, "bob");
  const { duel } = await game.execute("duelChallenge", "alice", {
    targetId: "bob",
  });
  await game.execute("duelRespond", "bob", {
    duelId: duel.id,
    response: "decline",
  });
  await assert.rejects(
    game.execute("duelRespond", "bob", { duelId: duel.id, response: "accept" }),
  );
  const second = await game.execute("duelChallenge", "alice", {
    targetId: "bob",
  });
  advance(16 * 60000);
  await assert.rejects(
    game.execute("duelRespond", "bob", {
      duelId: second.duel.id,
      response: "accept",
    }),
  );
});

test("invitations de guilde, rangs d’officier, message et exclusion vérifient les rôles", async () => {
  const { game } = setup();
  for (const id of ["alice", "bob", "carol"]) await player(game, id, 10);
  const gid = await guild(game);
  await game.execute("guildInvite", "alice", { targetId: "bob" });
  const key = (await game.execute("inboxInfo", "bob")).invitations[0].id;
  await assert.rejects(
    game.execute("guildInviteRespond", "carol", {
      invitationId: key,
      response: "accept",
    }),
  );
  await game.execute("guildInviteRespond", "bob", {
    invitationId: key,
    response: "accept",
  });
  await assert.rejects(
    game.execute("guildInvite", "bob", { targetId: "carol" }),
    /officiers/,
  );
  await game.execute("guildManage", "alice", {
    targetId: "bob",
    operation: "promote",
  });
  await game.execute("guildInvite", "bob", { targetId: "carol" });
  await game.execute("guildBulletin", "bob", {
    text: "Rendez-vous aux remparts ce soir.",
  });
  assert.match(
    (await game.execute("guildInfo", "alice")).guild.bulletin,
    /remparts/,
  );
  await assert.rejects(
    game.execute("guildManage", "bob", {
      targetId: "alice",
      operation: "kick",
    }),
    /chef/,
  );
  await game.execute("guildManage", "alice", {
    targetId: "bob",
    operation: "kick",
  });
  assert.equal((await game.execute("profile", "bob")).p.guildId, null);
  assert.equal(
    (await game.execute("guildInfo", "alice")).guild.officers.length,
    0,
  );
});

test("cité : matériaux et or sont dépensés atomiquement, gardes limités à 24 h", async () => {
  const { game, advance } = setup();
  await player(game, "alice", 10);
  await player(game, "bob", 10);
  const gid = await guild(game);
  await game.execute("guildJoin", "bob", { guildId: gid });
  await fund(game, gid);
  const before = (await game.execute("profile", "bob")).p.resources.pierre;
  await game.execute("cityDonate", "bob", { resource: "pierre", quantity: 40 });
  assert.equal(
    (await game.execute("profile", "bob")).p.resources.pierre,
    before - 40,
  );
  await assert.rejects(
    game.execute("cityUpgrade", "bob", { buildingId: "remparts" }),
    /officiers/,
  );
  await assert.rejects(
    game.execute("cityUpgrade", "alice", { buildingId: "remparts" }),
    /réserve/,
  );
  const unchanged = (await game.execute("cityInfo", "alice")).guild;
  assert.equal(unchanged.gold, 50000);
  assert.equal(unchanged.city.resources.pierre, 40);
  for (const [resource, quantity] of [
    ["bois", 25],
    ["fer", 10],
  ])
    await game.execute("cityDonate", "alice", { resource, quantity });
  const upgraded = await game.execute("cityUpgrade", "alice", {
    buildingId: "remparts",
  });
  assert.equal(upgraded.guild.city.buildings.remparts, 1);
  assert.equal(upgraded.guild.gold, 49850);
  const guard = await game.execute("cityGuard", "bob");
  assert.equal(guard.p.energy, 90);
  await assert.rejects(game.execute("cityGuard", "bob"), /déjà/);
  advance(DAY);
  assert.equal((await game.execute("cityInfo", "alice")).cityStats.guards, 0);
});

test("invasion coopérative : sorties, délais, victoire et récompense unique", async () => {
  const { game, advance } = setup();
  await player(game, "alice", 35);
  await player(game, "bob", 35);
  const gid = await guild(game);
  await game.execute("guildJoin", "bob", { guildId: gid });
  await game.execute("cityDefense", "alice", { role: "assault" });
  await assert.rejects(
    game.execute("cityDefense", "alice", { role: "assault" }),
    /cinq minutes/,
  );
  let info = await game.execute("cityDefense", "bob", { role: "bastion" });
  if (!info.guild.city.invasion.won) {
    advance(5 * 60000);
    info = await game.execute("cityDefense", "alice", { role: "assault" });
  }
  assert.equal(info.guild.city.invasion.won, true);
  for (const id of ["alice", "bob"]) {
    const result = await game.execute("cityClaim", id);
    assert.equal(result.p.social.honor, 5);
    assert.equal(result.p.social.defenses, 1);
    await assert.rejects(game.execute("cityClaim", id), /déjà/);
  }
  await assert.rejects(
    game.execute("cityDefense", "alice", { role: "support" }),
    /déjà/,
  );
  advance(DAY);
  assert.equal(
    (await game.execute("cityInfo", "alice")).guild.city.invasion.won,
    false,
  );
});

test("un départ de guilde retire la garde et la promotion", async () => {
  const { game } = setup();
  await player(game, "alice", 10);
  await player(game, "bob", 10);
  const gid = await guild(game);
  await game.execute("guildJoin", "bob", { guildId: gid });
  await game.execute("guildManage", "alice", {
    targetId: "bob",
    operation: "promote",
  });
  await game.execute("cityGuard", "bob");
  await game.execute("guildLeave", "bob");
  const result = await game.execute("cityInfo", "alice");
  assert.equal(result.cityStats.guards, 0);
  assert.deepEqual(result.guild.officers, []);
});

test("sièges : volontariat, dépenses, protection, classement et absence de pillage", async () => {
  const { game, advance } = setup();
  await player(game, "alice", 35);
  await player(game, "bob", 5);
  const aid = await guild(game),
    bid = await guild(game, "bob", "Les Sentinelles");
  await fund(game, aid);
  await fund(game, bid);
  await assert.rejects(
    game.execute("citySiege", "alice", { guildId: bid }),
    /activé/,
  );
  await game.execute("cityWarToggle", "alice");
  await game.execute("cityWarToggle", "bob");
  const victim = (await game.execute("profile", "bob")).p;
  const results = await Promise.allSettled(
    [1, 2].map(() => game.execute("citySiege", "alice", { guildId: bid })),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await game.execute("cityInfo", "alice")).guild.gold, 49880);
  const defended = await game.execute("cityInfo", "bob");
  assert.ok(defended.guild.city.shieldUntil > game.now());
  assert.ok(
    defended.guild.city.integrity >= defended.cityStats.maxIntegrity * 0.25,
  );
  const after = (await game.execute("profile", "bob")).p;
  assert.equal(after.gold, victim.gold);
  assert.deepEqual(after.gear, victim.gear);
  assert.equal(after.hp, victim.hp);
  await assert.rejects(game.execute("cityWarToggle", "alice"), /six heures/);
  advance(6 * HOUR);
  await game.execute("cityWarToggle", "alice");
  assert.equal(
    (await game.execute("cityInfo", "alice")).guild.city.warfare,
    false,
  );
});

test("les sièges refusent des cités trop éloignées en niveau et une énergie insuffisante", async () => {
  const { game } = setup();
  await player(game, "alice", 10);
  await player(game, "bob", 10);
  const aid = await guild(game),
    bid = await guild(game, "bob", "Les Sentinelles");
  await game.execute("cityWarToggle", "alice");
  await game.execute("cityWarToggle", "bob");
  await fund(game, aid);
  await game.store.transaction(async (tx) => {
    const g = await tx.get("guild", bid);
    g.level = 8;
    await tx.set("guild", bid, g);
  });
  await assert.rejects(
    game.execute("citySiege", "alice", { guildId: bid }),
    /comparables/,
  );
  await game.store.transaction(async (tx) => {
    const g = await tx.get("guild", bid);
    g.level = 1;
    await tx.set("guild", bid, g);
  });
  await edit(game, "alice", (p) => {
    p.energy = 0;
  });
  await assert.rejects(
    game.execute("citySiege", "alice", { guildId: bid }),
    /énergie/,
  );
  assert.equal((await game.execute("cityInfo", "alice")).guild.gold, 50000);
});
