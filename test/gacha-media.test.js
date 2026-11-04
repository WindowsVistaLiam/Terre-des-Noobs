import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { normalizeImage, importAttachment, uploadUrl, imageDimensions, MEDIA_LIMIT } from '../src/profile-media.js';
import { MemoryStore } from '../src/store.js';
import { GachaGame } from '../src/gacha-game.js';
const user = '111111111111111111';
async function sample() { const canvas = createCanvas(64, 96); const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ff9933'; ctx.fillRect(0, 0, 64, 96); return canvas.encode('png'); }
test('Médias gacha : seulement les pièces jointes HTTPS Discord, sans port ni identifiants', () => {
  assert.equal(new URL(uploadUrl('https://cdn.discordapp.com/attachments/1/2/a.png')).hostname, 'cdn.discordapp.com');
  for (const value of ['http://cdn.discordapp.com/attachments/1/2/a.png', 'https://example.com/a.png', 'https://cdn.discordapp.com.evil.test/attachments/a', 'https://user:password@cdn.discordapp.com/attachments/a', 'https://cdn.discordapp.com:444/attachments/a', 'https://cdn.discordapp.com/not-an-attachment']) assert.throws(() => uploadUrl(value));
});
test('Médias gacha : dimensions vérifiées avant décodage, formats invalides et animations refusés', async () => {
  const bytes = await sample(); bytes.writeUInt32BE(90000, 16);
  await assert.rejects(normalizeImage(bytes, 'portrait'), /grande/);
  await assert.rejects(normalizeImage(Buffer.from('<svg></svg>'), 'portrait'), /PNG/);
  await assert.rejects(normalizeImage(await sample(), 'avatar'), /inconnu/);
  const animated = Buffer.alloc(30); animated.write('RIFF', 0); animated.write('WEBP', 8); animated.write('VP8X', 12); animated[20] = 2;
  assert.throws(() => imageDimensions(animated), /animation/);
});
test('Médias gacha : portraits carrés et bannières réencodés, sans dépendance à une URL expirante', async () => {
  const portrait = await normalizeImage(await sample(), 'portrait'), banner = await normalizeImage(await sample(), 'banner');
  assert.equal(portrait.width, 256); assert.equal(portrait.height, 256); assert.equal(banner.width, 1280); assert.equal(banner.height, 320);
  const image = await loadImage(Buffer.from(portrait.data, 'base64')); assert.equal(image.width, 256); assert.equal(portrait.hash.length, 64);
  const game = new GachaGame(new MemoryStore()); await game.execute('media', user, { slot: 'portrait', media: portrait });
  assert.equal((await new GachaGame(game.store).execute('view', user, { view: 'profile' })).appearance.portrait.hash, portrait.hash);
  await game.execute('clearMedia', user, { slot: 'portrait' }); assert.equal((await game.execute('view', user, { view: 'profile' })).appearance.portrait, null);
});
test('Médias gacha : téléchargement limité même sans en-tête de taille', async () => {
  const attachment = { url: 'https://cdn.discordapp.com/attachments/1/2/a.png', size: 300 };
  const fake = async (_url, options) => {
    assert.equal(options.redirect, 'error'); assert.ok(options.signal);
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MEDIA_LIMIT + 1)); controller.close(); } }));
  };
  await assert.rejects(importAttachment(attachment, 'portrait', { fetcher: fake }), /5 Mo/);
});
test('Médias gacha : échec HTTP, fichier trop lourd et import valide', async () => {
  const attachment = { url: 'https://cdn.discordapp.com/attachments/1/2/a.png', size: 300 };
  await assert.rejects(importAttachment({ ...attachment, size: MEDIA_LIMIT + 1 }, 'portrait'), /5 Mo/);
  await assert.rejects(importAttachment(attachment, 'portrait', { fetcher: async () => new Response('', { status: 404 }) }), /expiré/);
  const bytes = await sample();
  const media = await importAttachment(attachment, 'portrait', { fetcher: async () => new Response(bytes) }); assert.equal(media.mime, 'image/webp');
});
