import test from "node:test";
import assert from "node:assert/strict";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { ActionRowBuilder, ModalBuilder } from "discord.js";
import { Game } from "../src/game.js";
import { MemoryStore } from "../src/store.js";
import {
  buildModal,
  routeComponent,
  routeModal,
  uiId,
} from "../src/commands.js";
import { resolveRoute, createInteractionHandler } from "../src/controller.js";
import { render, buildView } from "../src/views.js";
import {
  importAttachment,
  normalizeImage,
  uploadUrl,
  imageDimensions,
  MEDIA_LIMIT,
} from "../src/profile-media.js";
import { ENEMY_PORTRAITS, enemyPortrait } from "../src/portraits.js";
import { ZONES, RAIDS } from "../src/content.js";

const A = "111111111111111111",
  B = "222222222222222222";
async function png(color = "#1040ee", width = 128, height = 128) {
  const c = createCanvas(width, height),
    ctx = c.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return c.encode("png");
}
async function setup() {
  const game = new Game(new MemoryStore(), {
    random: () => 0.5,
    now: () => Date.UTC(2026, 9, 15, 12),
  });
  for (const [id, name] of [
    [A, "Aelys"],
    [B, "Borin"],
  ])
    await game.execute("create", id, {
      name,
      raceId: "humain",
      classId: "guerrier",
    });
  return game;
}
async function setPortrait(game, id = A, color = "#1040ee") {
  const media = await normalizeImage(await png(color), "portrait");
  await game.execute("customizeImage", id, { slot: "portrait", media });
  return media;
}

test("les anciens personnages reçoivent une personnalisation vide sans changer leurs statistiques", async () => {
  const g = await setup();
  const before = (await g.execute("profile", A)).p;
  await g.store.transaction(async (tx) => {
    const p = await tx.get("player", A);
    delete p.customization;
    await tx.set("player", A, p);
  });
  const after = (await g.execute("customizeInfo", A)).p;
  assert.deepEqual(after.customization, {
    title: "",
    bio: "",
    portrait: null,
    banner: null,
    avatar: null,
  });
  for (const key of ["level", "xp", "gold", "hp", "mana", "energy"])
    assert.equal(after[key], before[key]);
});

test("portrait, bannière et textes persistent après une nouvelle instance du jeu, sans URL expirante", async () => {
  const g = await setup();
  const media = await setPortrait(g);
  await g.execute("customizeImage", A, {
    slot: "banner",
    media: await normalizeImage(await png("#bb2030", 800, 200), "banner"),
  });
  await g.execute("customizeText", A, {
    title: "Gardienne des Marches",
    bio: "Une histoire\nsur deux lignes. @everyone <@333333333333333333>",
  });
  const restarted = new Game(g.store);
  const result = await resolveRoute(
    restarted,
    { action: "publicProfile", args: { targetId: A } },
    B,
  );
  assert.equal(result.target.title, "Gardienne des Marches");
  assert.match(result.target.bio, /Une histoire/);
  assert.equal(result.appearance.portrait.hash, media.hash);
  assert.equal(result.appearance.banner.width, 1280);
  assert.equal(result.p, undefined);
  const saved = (await g.execute("profile", A)).p;
  assert.equal(saved.customization.portrait.data, undefined);
  assert.equal(JSON.stringify(saved).includes("cdn.discordapp.com"), false);
  assert.equal(result.appearance.portrait.mime, "image/webp");
});

test("les formulaires natifs acceptent un seul fichier et restent liés à leur propriétaire", () => {
  for (const kind of ["portraitUpload", "bannerUpload", "profileText"])
    new ModalBuilder(buildModal(A, kind)).toJSON();
  const modal = buildModal(A, "portraitUpload");
  assert.equal(modal.components[0].component.type, 19);
  assert.equal(modal.components[0].component.max_values, 1);
  const attachment = {
    url: "https://cdn.discordapp.com/attachments/1/2/image.png",
    size: 300,
  };
  const fields = { getUploadedFiles: () => new Map([["file", attachment]]) };
  const route = routeModal(modal.custom_id, A, fields);
  assert.equal(route.action, "profileUpload");
  assert.equal(route.args.slot, "portrait");
  assert.equal(route.args.attachment, attachment);
  assert.equal(routeModal(modal.custom_id, B, fields), null);
  assert.equal(
    routeComponent(uiId(A, "do", "customizeReset", "portrait"), B),
    null,
  );
});

test("les dimensions sont bornées avant décodage et les imports ne suivent pas des URL arbitraires", async () => {
  assert.ok(
    uploadUrl(
      "https://cdn.discordapp.com/ephemeral-attachments/1/2/upload.jpg?ex=expiry",
    ),
  );
  for (const url of [
    "http://cdn.discordapp.com/attachments/a/b/c",
    "https://cdn.discordapp.com.evil.example/attachments/a/b/c",
    "https://127.0.0.1/attachments/a/b/c",
    "https://cdn.discordapp.com:8443/attachments/a/b/c",
    "https://user:pass@cdn.discordapp.com/attachments/a/b/c",
    "https://cdn.discordapp.com/api/private",
    "file:///etc/passwd",
  ])
    assert.throws(() => uploadUrl(url));
  const bytes = await png();
  const bomb = Buffer.from(bytes);
  bomb.writeUInt32BE(100000, 16);
  await assert.rejects(normalizeImage(bomb, "portrait"), /trop grande/);
  await assert.rejects(
    normalizeImage(Buffer.from("<svg>unsafe</svg>"), "portrait"),
    /PNG, JPG ou WebP/,
  );
  await assert.rejects(
    normalizeImage(Buffer.alloc(MEDIA_LIMIT + 1), "portrait"),
    /5 Mo/,
  );
  await assert.rejects(
    normalizeImage(await png("red", 16, 16), "portrait"),
    /trop petite/,
  );
  assert.equal(imageDimensions(bytes).width, 128);
});

test("les PNG, JPG et WebP valides sont recadrés et réencodés sans métadonnées source", async () => {
  const c = createCanvas(160, 80),
    ctx = c.getContext("2d");
  ctx.fillStyle = "gold";
  ctx.fillRect(0, 0, 160, 80);
  for (const format of ["png", "jpeg", "webp"]) {
    const bytes = await c.encode(format);
    assert.equal(imageDimensions(bytes).width, 160);
    for (const slot of ["portrait", "banner"]) {
      const media = await normalizeImage(bytes, slot),
        out = await loadImage(Buffer.from(media.data, "base64"));
      assert.equal(out.width, slot === "portrait" ? 256 : 1280);
      assert.equal(out.height, slot === "portrait" ? 256 : 320);
      assert.equal(media.hash.length, 64);
    }
  }
});

test("le téléchargement est borné même si le serveur ment sur la taille du fichier", async () => {
  const bytes = await png(),
    attachment = {
      url: "https://cdn.discordapp.com/attachments/1/2/file.png?ex=expiry",
      size: bytes.length,
    };
  let options;
  const media = await importAttachment(attachment, "portrait", {
    fetcher: async (url, opts) => {
      options = opts;
      return new Response(bytes, {
        headers: { "content-length": String(bytes.length) },
      });
    },
  });
  assert.equal(media.width, 256);
  assert.equal(options.redirect, "error");
  assert.ok(options.signal);
  await assert.rejects(
    importAttachment(attachment, "portrait", {
      fetcher: async () => new Response(Buffer.alloc(MEDIA_LIMIT + 1)),
    }),
    /5 Mo/,
  );
  await assert.rejects(
    importAttachment(attachment, "portrait", {
      fetcher: async () => {
        throw new Error("redirect");
      },
    }),
    /téléchargement/,
  );
});

test("un import invalide laisse le portrait précédent intact et le retrait supprime ses octets", async () => {
  const g = await setup(),
    initial = await setPortrait(g);
  await assert.rejects(
    g.execute("customizeImage", A, {
      slot: "portrait",
      media: { data: "bad" },
    }),
    /Image invalide/,
  );
  assert.equal(
    (await resolveRoute(g, { action: "profile" }, A)).appearance.portrait.hash,
    initial.hash,
  );
  await g.execute("customizeReset", A, { slot: "portrait" });
  assert.equal(
    (await resolveRoute(g, { action: "profile" }, A)).appearance.portrait,
    null,
  );
  assert.equal(
    await g.store.transaction((tx) => tx.get("profile_media", `${A}.portrait`)),
    null,
  );
  assert.equal((await g.execute("profile", B)).p.customization.portrait, null);
  await assert.rejects(
    g.execute("customizeText", A, { title: "x".repeat(41), bio: "" }),
    /40 caractères/,
  );
});

test("tous les menus portent le portrait du joueur, et le profil d’autrui porte son propre portrait", async () => {
  const g = await setup();
  const own = await setPortrait(g),
    other = await setPortrait(g, B, "#e02020");
  for (const action of ["profile", "market", "social", "info", "customize"]) {
    const result = await resolveRoute(g, { action }, A),
      view = buildView(result, A);
    assert.equal(view.screen.portrait.hash, own.hash, action);
    assert.ok(view.components.length <= 5);
    for (const row of view.components) new ActionRowBuilder(row).toJSON();
  }
  assert.equal(
    (
      await resolveRoute(
        g,
        { action: "publicProfile", args: { targetId: B } },
        A,
      )
    ).appearance.portrait.hash,
    other.hash,
  );
  const p = await render(await resolveRoute(g, { action: "profile" }, A), A),
    image = await loadImage(p.files[0].attachment),
    c = createCanvas(image.width, image.height),
    ctx = c.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const pixel = ctx.getImageData(1166, 99, 1, 1).data;
  assert.ok(pixel[2] > 200 && pixel[0] < 60, Array.from(pixel).join(","));
  assert.equal(p.content, `<@${A}>`);
  assert.deepEqual(p.allowedMentions, {
    parse: [],
    users: [A],
    repliedUser: false,
  });
});

test("les erreurs et les annonces gardent aussi le portrait et la mention de leur auteur", async () => {
  const g = await setup(),
    media = await setPortrait(g),
    calls = [];
  const handler = createInteractionHandler(g, {
    cooldownMs: 0,
    renderer: async (result, owner) => ({ result, owner }),
  });
  const interaction = (customId, id) => ({
    id,
    user: { id: A },
    customId,
    message: { id: "private", flags: { has: () => true } },
    inGuild: () => true,
    isChatInputCommand: () => false,
    isModalSubmit: () => false,
    isButton: () => true,
    isStringSelectMenu: () => false,
    async deferUpdate() {
      this.deferred = true;
    },
    async deferReply() {
      this.deferred = true;
    },
    async editReply(p) {
      calls.push(p);
    },
    async followUp(p) {
      calls.push(p);
    },
  });
  await handler(interaction(uiId(A, "do", "buy", "missing"), "error"));
  assert.equal(calls.at(-1).result.type, "error");
  assert.equal(calls.at(-1).result.appearance.portrait.hash, media.hash);
  await handler(interaction(uiId(A, "do", "build", 1, "caserne"), "build"));
  assert.equal(calls.at(-1).result.type, "publicActivity");
  assert.equal(calls.at(-1).result.appearance.portrait.hash, media.hash);
});

test("le texte de personnalisation est prérempli et un formulaire d’import termine le parcours Discord", async (t) => {
  const g = await setup(),
    bytes = await png(),
    calls = [];
  await g.execute("customizeText", A, {
    title: "Sentinelle",
    bio: "Mon histoire",
  });
  t.mock.method(globalThis, "fetch", async () => new Response(bytes));
  const handler = createInteractionHandler(g, {
    cooldownMs: 0,
    renderer: async (result) => ({ result }),
  });
  const base = {
    id: "form",
    user: { id: A },
    inGuild: () => true,
    isChatInputCommand: () => false,
    isStringSelectMenu: () => false,
    message: { id: "p", flags: { has: () => true } },
    isFromMessage: () => true,
    async showModal(p) {
      calls.push(p);
    },
    async deferUpdate() {
      this.deferred = true;
    },
    async editReply(p) {
      calls.push(p);
    },
    async followUp(p) {
      calls.push(p);
    },
  };
  await handler({
    ...base,
    isButton: () => true,
    isModalSubmit: () => false,
    customId: uiId(A, "form", "profileText"),
  });
  assert.equal(calls.at(-1).components[0].components[0].value, "Sentinelle");
  await handler({
    ...base,
    id: "upload",
    isButton: () => false,
    isModalSubmit: () => true,
    customId: uiId(A, "submit", "portraitUpload"),
    fields: {
      getUploadedFiles: () =>
        new Map([
          [
            "file",
            {
              url: "https://cdn.discordapp.com/attachments/1/2/img.png",
              size: bytes.length,
            },
          ],
        ]),
    },
  });
  assert.equal(calls.at(-1).result.type, "customize");
  assert.ok(calls.at(-1).result.appearance.portrait.data);
});

test("chaque ennemi, élite et boss de raid est associé à un portrait du bestiaire", () => {
  assert.equal(Object.keys(ENEMY_PORTRAITS).length, 51);
  for (const name of [
    ...ZONES.flatMap((z) => [...z.enemies, z.boss]),
    ...RAIDS.map((r) => r.name),
  ]) {
    assert.ok(ENEMY_PORTRAITS[name]);
    assert.deepEqual(enemyPortrait(`Élite · ${name}`), enemyPortrait(name));
  }
});

test("les quatre atlas embarqués contiennent 51 portraits distincts et lisibles", async () => {
  const atlases = await Promise.all(
    [0, 1, 2, 3].map((i) =>
      loadImage(
        fileURLToPath(
          new URL(`../src/assets/portraits/atlas-${i}.webp`, import.meta.url),
        ),
      ),
    ),
  );
  for (const atlas of atlases) {
    assert.equal(atlas.width, 1024);
    assert.equal(atlas.height, 1024);
  }
  const hashes = new Set();
  for (const ref of Object.values(ENEMY_PORTRAITS)) {
    const atlas = atlases[ref.atlas],
      cell = 1024 / ref.columns,
      c = createCanvas(64, 64);
    c.getContext("2d").drawImage(
      atlas,
      (ref.index % ref.columns) * cell,
      Math.floor(ref.index / ref.columns) * cell,
      cell,
      cell,
      0,
      0,
      64,
      64,
    );
    const hash = createHash("sha256")
      .update(await c.encode("png"))
      .digest("hex");
    assert.ok(!hashes.has(hash));
    hashes.add(hash);
  }
});

test("une longue histoire et une bannière personnalisée restent dans le cadre du profil", async () => {
  const g = await setup();
  await g.execute("customizeText", A, {
    title: "Titre " + "x".repeat(34),
    bio: "a".repeat(600),
  });
  await g.execute("customizeImage", A, {
    slot: "banner",
    media: await normalizeImage(await png("#d02020", 1280, 320), "banner"),
  });
  const result = await resolveRoute(
    g,
    { action: "publicProfile", args: { targetId: A } },
    B,
  );
  assert.ok(result.appearance.banner);
  const { drawPanel } = await import("../src/canvas.js");
  const panel = await drawPanel(buildView(result, B).screen);
  for (const card of panel.cards)
    assert.ok(card.y >= 300 && card.y + card.height < panel.height - 80);
  assert.ok(panel.buffer.length < 8_000_000);
});
