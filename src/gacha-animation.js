import { Worker } from 'node:worker_threads';
import { CARDS } from './gacha-catalog.js';
export function rarePull(data) {
  if (data.view !== 'pull' || !data.pulls?.length) return null;
  const rares = data.pulls.flatMap((p, index) => {
    const card = CARDS.get(p.cardId);
    return card?.rarity >= 4 ? [{ index, rarity: card.rarity, cardId: card.id }] : [];
  }).sort((a, b) => b.rarity - a.rarity || a.index - b.index);
  if (!rares.length) return null;
  const rarity = rares[0].rarity;
  return { rarity, kind: rarity === 5 ? 'mythique' : 'legendaire', title: rarity === 5 ? 'MYTHIQUE !' : 'LÉGENDAIRE !', color: rarity === 5 ? '#ff7997' : '#ffd260', rares: rares.slice(0, 5), total: rares.length };
}
let tail = Promise.resolve(), pending = 0;
export async function animateRarePull(canvas, data) {
  const celebration = rarePull(data);
  if (!celebration) return null;
  // One encoder at a time keeps native Canvas memory bounded on small Railway plans.
  if (pending >= 8) throw new Error('ANIMATION_QUEUE_FULL');
  pending++;
  const previous = tail;
  let release;
  tail = new Promise(resolve => { release = resolve; });
  await previous;
  let worker;
  try {
    const buffer = await new Promise((resolve, reject) => {
      worker = new Worker(new URL('./gacha-animation-worker.js', import.meta.url), {
        execArgv: [],
        workerData: { png: canvas.buffer, width: canvas.width, height: canvas.height, celebration, firstY: data.message ? 275 : 195 },
      });
      const timer = setTimeout(() => reject(new Error('ANIMATION_TIMEOUT')), 12000);
      const finish = fn => value => { clearTimeout(timer); fn(value); };
      worker.once('message', finish(message => message.error ? reject(new Error('ANIMATION_ENCODING_FAILED')) : resolve(Buffer.from(message.bytes))));
      worker.once('error', finish(reject));
      worker.once('exit', finish(() => reject(new Error('ANIMATION_WORKER_EXIT'))));
    });
    if (buffer.length > 8_000_000 || buffer.toString('ascii', 0, 6) !== 'GIF89a') throw new Error('ANIMATION_SIZE_OR_FORMAT');
    return { buffer, name: `tirage-${celebration.kind}.gif`, width: Math.min(canvas.width, 960), kind: celebration.kind };
  } finally {
    await worker?.terminate();
    pending--; release();
  }
}
