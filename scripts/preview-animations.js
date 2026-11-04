import { mkdir, writeFile } from 'node:fs/promises';
import { createCanvas } from '@napi-rs/canvas';
import { GifReader } from 'omggif';
import { createGachaPreviewGame } from './preview-gacha.js';
import { renderGacha } from '../src/gacha-ui.js';
import { CATALOG } from '../src/gacha-catalog.js';
const dir = new URL('../.local/gacha-animations/', import.meta.url);
await mkdir(dir, { recursive: true });
const game = await createGachaPreviewGame(), user = '111111111111111111';
const normal = await game.execute('open', user, { pack: 'mix' });
for (const rarity of [4, 5]) {
  const card = CATALOG.cards.find(c => c.rarity === rarity);
  const data = { ...normal, pulls: normal.pulls.map((p, i) => i === 2 ? { cardId: card.id, fresh: true } : p) };
  const start = performance.now(), panel = await renderGacha(data, user), file = panel.files[0];
  if (!file.name.endsWith('.gif')) throw new Error('Animation failed');
  await writeFile(new URL(file.name, dir), file.attachment);
  const reader = new GifReader(file.attachment), pixels = new Uint8ClampedArray(reader.width * reader.height * 4);
  for (let f = 0; f < reader.numFrames(); f++) {
    reader.decodeAndBlitFrameRGBA(f, pixels);
    if ([0, 15, reader.numFrames() - 1].includes(f)) {
      const canvas = createCanvas(reader.width, reader.height), ctx = canvas.getContext('2d'), image = ctx.createImageData(reader.width, reader.height);
      image.data.set(pixels); ctx.putImageData(image, 0, 0);
      await writeFile(new URL(`${rarity}-frame-${f}.png`, dir), await canvas.encode('png'));
    }
  }
  console.log(`${file.name}: ${file.attachment.length} bytes, ${reader.numFrames()} frames, ${Math.round(performance.now() - start)} ms`);
}
