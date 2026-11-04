import { parentPort, workerData } from 'node:worker_threads';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import gifenc from 'gifenc';
const { GIFEncoder, quantize, applyPalette } = gifenc;
const TAU = Math.PI * 2;
function star(ctx, x, y, size, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x - size, y); ctx.lineTo(x + size, y); ctx.moveTo(x, y - size); ctx.lineTo(x, y + size); ctx.stroke();
}
function crown(ctx, x, y, size, color) {
  ctx.beginPath(); ctx.moveTo(x - size, y + size * .5); ctx.lineTo(x - size, y - size * .45); ctx.lineTo(x - size * .45, y);
  ctx.lineTo(x, y - size * .8); ctx.lineTo(x + size * .45, y); ctx.lineTo(x + size, y - size * .45); ctx.lineTo(x + size, y + size * .5); ctx.closePath();
  ctx.fillStyle = `${color}35`; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
}
function orbit(ctx, x, y, radius, angle, color) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.strokeStyle = color; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(0, 0, radius, radius * .42, 0, 0, TAU); ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(Math.cos(a) * radius, Math.sin(a) * radius * .42, 2.4, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
async function encode() {
  const { png, width: originalWidth, height: originalHeight, celebration, firstY } = workerData;
  const w = Math.min(960, originalWidth), scale = w / originalWidth, h = Math.round(originalHeight * scale);
  const base = createCanvas(w, h), baseCtx = base.getContext('2d');
  baseCtx.drawImage(await loadImage(Buffer.from(png)), 0, 0, w, h);
  const rgba = baseCtx.getImageData(0, 0, w, h).data;
  const palette = quantize(rgba, 248);
  palette.push([255, 210, 96], [255, 244, 190], [255, 121, 151], [182, 140, 255], [255, 255, 255], [12, 14, 24], [90, 60, 130]);
  while (palette.length < 256) palette.push([255, 0, 255]);
  const opaquePalette = palette.slice(0, 255), baseIndex = applyPalette(rgba, opaquePalette);
  const gif = GIFEncoder();
  gif.writeFrame(baseIndex, w, h, { palette, repeat: -1, delay: 140, dispose: 1 });
  const overlay = createCanvas(w, h), ctx = overlay.getContext('2d');
  const header = { x: 0, y: 0, w, h: Math.ceil(180 * scale) };
  const boxes = celebration.rares.map(card => ({ x: (48 + card.index % 5 * 241) * scale, y: (firstY + Math.floor(card.index / 5) * 370) * scale, w: 220 * scale, h: 345 * scale, rarity: card.rarity }));
  const regions = [header, ...boxes.map(b => ({ x: Math.max(0, Math.floor(b.x - 13)), y: Math.max(0, Math.floor(b.y - 13)), w: Math.ceil(b.w + 26), h: Math.ceil(b.h + 26) }))].map(r => ({ ...r, w: Math.min(r.w, w - r.x), h: Math.min(r.h, h - r.y) }));
  for (let frame = 0; frame < 30; frame++) {
    const t = frame / 29, angle = t * TAU, color = celebration.color;
    ctx.clearRect(0, 0, w, h);
    // Redraw only the animated regions; transparent pixels preserve the rest of the result.
    for (const r of regions) ctx.drawImage(base, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, header.w, header.h); ctx.clip();
    const hx = 720 * scale, hy = 88 * scale;
    if (celebration.rarity === 4) {
      ctx.strokeStyle = '#ffd26050'; ctx.lineWidth = 2;
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * TAU + angle * .12;
        ctx.beginPath(); ctx.moveTo(hx + Math.cos(a) * 40, hy + Math.sin(a) * 40); ctx.lineTo(hx + Math.cos(a) * (65 + 12 * Math.sin(angle + i)), hy + Math.sin(a) * (65 + 12 * Math.sin(angle + i))); ctx.stroke();
      }
      crown(ctx, hx, hy + Math.sin(angle) * 3, 26, color);
    } else {
      orbit(ctx, hx, hy, 52, angle * .5, '#ff7997');
      orbit(ctx, hx, hy, 42, -angle * .5 + Math.PI / 2, '#b68cff');
      star(ctx, hx, hy, 11 + Math.sin(angle) * 3, '#ffb4d2');
    }
    ctx.restore();
    for (const [j, b] of boxes.entries()) {
      const c = b.rarity === 4 ? '#ffd260' : '#ff7997';
      ctx.save(); ctx.beginPath(); ctx.rect(b.x - 12, b.y - 12, b.w + 24, b.h + 24); ctx.clip();
      ctx.strokeStyle = `${c}bb`; ctx.lineWidth = 2 + Math.sin(angle) * .5;
      ctx.beginPath(); ctx.roundRect(b.x - 5, b.y - 5, b.w + 10, b.h + 10, 16); ctx.stroke();
      const progress = (t + j * .17) % 1, perimeter = 2 * (b.w + b.h), travel = progress * perimeter;
      let sx, sy;
      if (travel < b.w) { sx = b.x + travel; sy = b.y - 5; }
      else if (travel < b.w + b.h) { sx = b.x + b.w + 5; sy = b.y + travel - b.w; }
      else if (travel < 2 * b.w + b.h) { sx = b.x + 2 * b.w + b.h - travel; sy = b.y + b.h + 5; }
      else { sx = b.x - 5; sy = b.y + perimeter - travel; }
      star(ctx, sx, sy, 6, c);
      if (b.rarity === 4) crown(ctx, b.x + b.w / 2, b.y - 5, 9, '#fff4be');
      else orbit(ctx, b.x + b.w / 2, b.y - 5, 11, -angle, '#b68cff');
      ctx.restore();
    }
    const indexed = new Uint8Array(w * h); indexed.fill(255);
    for (const r of regions) {
      const patch = applyPalette(ctx.getImageData(r.x, r.y, r.w, r.h).data, opaquePalette);
      for (let y = 0; y < r.h; y++) indexed.set(patch.subarray(y * r.w, (y + 1) * r.w), (r.y + y) * w + r.x);
    }
    gif.writeFrame(indexed, w, h, { delay: 80, transparent: true, transparentIndex: 255, dispose: 1 });
  }
  gif.writeFrame(baseIndex, w, h, { delay: 1600, dispose: 1 });
  gif.finish();
  return gif.bytes();
}
if (parentPort && workerData) {
  try { const bytes = await encode(); parentPort.postMessage({ bytes }, [bytes.buffer]); }
  catch { parentPort.postMessage({ error: true }); }
}
