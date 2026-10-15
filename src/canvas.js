import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import { fileURLToPath } from "node:url";

const asset = (name) =>
  fileURLToPath(new URL(`./assets/${name}`, import.meta.url));
GlobalFonts.registerFromPath(asset("fonts/Cinzel-Regular.ttf"), "BrumeTitle");
GlobalFonts.registerFromPath(asset("fonts/Lato-Regular.ttf"), "BrumeText");
let backdrop;
const WIDTH = 1280,
  PAD = 58,
  GAP = 20;
const PALETTE = {
  gold: "#c6a46a",
  paper: "#ece3d0",
  muted: "#b4b1a4",
  line: "#63513a",
  dark: "#121919",
  green: "#83b396",
  red: "#d68c85",
  blue: "#8aa9d0",
  purple: "#b09ac6",
};
export const plainText = (value) =>
  String(value ?? "")
    .replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu, "")
    .replace(/\*\*|`/g, "")
    .replace(/<@!?(\d+)>/g, "aventurier")
    .trim();
function font(ctx, size, title = false) {
  ctx.font = `${size}px ${title ? "BrumeTitle" : "BrumeText"}`;
  ctx.textBaseline = "top";
}
export function wrapText(ctx, text, width) {
  const lines = [];
  for (const paragraph of plainText(text).split("\n")) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if (ctx.measureText(`${line}${line ? " " : ""}${word}`).width <= width) {
        line += `${line ? " " : ""}${word}`;
        continue;
      }
      if (line) {
        lines.push(line);
        line = "";
      }
      // Même un nom sans espaces doit rester à l’intérieur de sa carte.
      for (const char of [...word]) {
        if (line && ctx.measureText(line + char).width > width) {
          lines.push(line);
          line = "";
        }
        line += char;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}
function text(
  ctx,
  value,
  x,
  y,
  { size = 23, color = PALETTE.paper, width, title = false, maxLines } = {},
) {
  font(ctx, size, title);
  ctx.fillStyle = color;
  let lines = width ? wrapText(ctx, value, width) : [plainText(value)];
  if (maxLines && lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let last = lines[maxLines - 1];
    while (last && ctx.measureText(`${last}…`).width > width)
      last = last.slice(0, -1);
    lines[maxLines - 1] = `${last}…`;
  }
  lines.forEach((line, i) => ctx.fillText(line, x, y + i * (size + 8)));
  return lines.length * (size + 8);
}
function box(ctx, x, y, width, height, accent = PALETTE.line) {
  const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
  gradient.addColorStop(0, "rgba(19,27,27,.96)");
  gradient.addColorStop(1, "rgba(13,18,19,.88)");
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
  ctx.strokeStyle = "rgba(198,164,106,.11)";
  ctx.strokeRect(x + 5.5, y + 5.5, width - 11, height - 11);
  ctx.fillStyle = accent;
  ctx.fillRect(x, y, 3, Math.min(height, 40));
}
function diamond(ctx, x, y, radius, fill = PALETTE.gold) {
  ctx.beginPath();
  ctx.moveTo(x, y - radius);
  ctx.lineTo(x + radius, y);
  ctx.lineTo(x, y + radius);
  ctx.lineTo(x - radius, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}
function ornament(ctx, x, y, dir = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 34);
  ctx.lineTo(0, 0);
  ctx.lineTo(70, 0);
  ctx.moveTo(7, 27);
  ctx.lineTo(7, 7);
  ctx.lineTo(47, 7);
  ctx.stroke();
  diamond(ctx, 0, 0, 4);
  diamond(ctx, 50, 7, 2);
  ctx.restore();
}
function seal(ctx, x, y, tone) {
  ctx.save();
  ctx.strokeStyle = tone;
  ctx.lineWidth = 1.3;
  for (const r of [42, 47, 57]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    diamond(ctx, x + Math.cos(a) * 51, y + Math.sin(a) * 51, 2, tone);
  }
  // Blason original : une lame devant les deux montagnes de Brumeterre.
  ctx.beginPath();
  ctx.moveTo(x - 28, y + 19);
  ctx.lineTo(x - 11, y - 5);
  ctx.lineTo(x, y + 10);
  ctx.lineTo(x + 16, y - 12);
  ctx.lineTo(x + 31, y + 19);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - 32);
  ctx.lineTo(x + 5, y - 21);
  ctx.lineTo(x + 2, y + 21);
  ctx.lineTo(x - 2, y + 21);
  ctx.lineTo(x - 5, y - 21);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 13, y + 17);
  ctx.lineTo(x + 13, y + 17);
  ctx.moveTo(x, y + 21);
  ctx.lineTo(x, y + 33);
  ctx.stroke();
  ctx.restore();
}

export async function drawPanel(screen) {
  backdrop ??= loadImage(asset("brumeterre.png"));
  const image = await backdrop;
  const measure = createCanvas(WIDTH, 100).getContext("2d");
  const tone = PALETTE[screen.tone] ?? PALETTE.gold;
  const cardWidth = (WIDTH - PAD * 2 - GAP) / 2;
  font(measure, 22);
  let cursor = 170;
  const noticeLines = screen.notice
    ? wrapText(measure, screen.notice, WIDTH - PAD * 2 - 36)
    : [];
  const noticeHeight = noticeLines.length ? noticeLines.length * 30 + 30 : 0;
  if (noticeHeight) cursor += noticeHeight + 20;
  const metricsY = cursor;
  if (screen.metrics?.length) cursor += 112;
  const cards = [];
  for (let i = 0; i < (screen.cards ?? []).length; i += 2) {
    const pair = screen.cards.slice(i, i + 2).map((card) => {
      font(measure, 21, true);
      const titles = wrapText(measure, card.title, cardWidth - 42);
      font(measure, 23);
      const lines = wrapText(measure, card.text, cardWidth - 42);
      return {
        ...card,
        titles,
        lines,
        height:
          42 +
          titles.length * 29 +
          12 +
          lines.length * 31 +
          (card.tag ? 33 : 0),
      };
    });
    const height = Math.max(...pair.map((card) => card.height));
    pair.forEach((card, j) =>
      cards.push({
        ...card,
        x: PAD + j * (cardWidth + GAP),
        y: cursor,
        width: cardWidth,
        height,
      }),
    );
    cursor += height + GAP;
  }
  const height = Math.max(760, cursor + 90);
  const canvas = createCanvas(WIDTH, height),
    ctx = canvas.getContext("2d");
  const imageScale = Math.max(WIDTH / image.width, height / image.height);
  ctx.drawImage(
    image,
    WIDTH - image.width * imageScale,
    (height - image.height * imageScale) / 2,
    image.width * imageScale,
    image.height * imageScale,
  );
  const veil = ctx.createLinearGradient(0, 0, WIDTH, height);
  veil.addColorStop(0, "rgba(7,14,16,.91)");
  veil.addColorStop(0.55, "rgba(8,14,16,.76)");
  veil.addColorStop(1, "rgba(13,16,18,.60)");
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, WIDTH, height);
  // Grain discret déterministe, sans ressource distante ni hasard de rendu.
  ctx.fillStyle = "rgba(225,207,165,.025)";
  for (let i = 0; i < 900; i++)
    ctx.fillRect((i * 173) % WIDTH, (i * 127) % height, 1, 1);
  ctx.strokeStyle = "#6d5838";
  ctx.strokeRect(24.5, 24.5, WIDTH - 49, height - 49);
  ctx.strokeStyle = "#2f352e";
  ctx.strokeRect(32.5, 32.5, WIDTH - 65, height - 65);
  ornament(ctx, 24, 24);
  ornament(ctx, WIDTH - 24, 24, -1);
  ctx.save();
  ctx.translate(0, height);
  ctx.scale(1, -1);
  ornament(ctx, 24, 24);
  ornament(ctx, WIDTH - 24, 24, -1);
  ctx.restore();
  text(ctx, screen.kicker ?? "LES CHRONIQUES DE BRUMETERRE", PAD, 54, {
    size: 15,
    color: PALETTE.gold,
  });
  let titleSize = 40;
  font(ctx, titleSize, true);
  while (
    ctx.measureText(plainText(screen.title)).width > WIDTH - PAD * 2 - 145 &&
    titleSize > 26
  )
    font(ctx, --titleSize, true);
  text(ctx, screen.title, PAD, 81, {
    size: titleSize,
    title: true,
    color: "#f1e6cc",
    width: WIDTH - PAD * 2 - 145,
    maxLines: 1,
  });
  text(
    ctx,
    screen.subtitle ?? "Une histoire à écrire, un refuge à défendre.",
    PAD,
    135,
    {
      size: 20,
      color: PALETTE.muted,
      width: WIDTH - PAD * 2 - 140,
      maxLines: 1,
    },
  );
  seal(ctx, WIDTH - PAD - 58, 99, tone);
  if (noticeHeight) {
    box(ctx, PAD, 170, WIDTH - PAD * 2, noticeHeight, tone);
    text(ctx, screen.notice, PAD + 18, 184, {
      size: 22,
      width: WIDTH - PAD * 2 - 36,
    });
  }
  if (screen.metrics?.length) {
    const w =
      (WIDTH - PAD * 2 - GAP * (screen.metrics.length - 1)) /
      screen.metrics.length;
    screen.metrics.forEach((metric, i) => {
      const x = PAD + i * (w + GAP),
        color = PALETTE[metric.color] ?? tone;
      box(ctx, x, metricsY, w, 91);
      text(ctx, metric.label.toUpperCase(), x + 18, metricsY + 13, {
        size: 15,
        color: PALETTE.muted,
      });
      text(ctx, metric.value, x + 18, metricsY + 36, {
        size: 27,
        color: PALETTE.paper,
        width: w - 36,
        maxLines: 1,
      });
      if (metric.max) {
        ctx.fillStyle = "#29302d";
        ctx.fillRect(x + 18, metricsY + 77, w - 36, 3);
        ctx.fillStyle = color;
        ctx.fillRect(
          x + 18,
          metricsY + 77,
          (w - 36) * Math.max(0, Math.min(1, metric.current / metric.max)),
          3,
        );
      }
    });
  }
  for (const card of cards) {
    const accent = PALETTE[card.accent] ?? PALETTE.line;
    box(ctx, card.x, card.y, card.width, card.height, accent);
    let y = card.y + 21;
    y += text(ctx, card.title, card.x + 21, y, {
      size: 21,
      color: PALETTE.gold,
      title: true,
      width: card.width - 42,
    });
    y += 12;
    y += text(ctx, card.text, card.x + 21, y, {
      size: 23,
      width: card.width - 42,
    });
    if (card.tag)
      text(ctx, card.tag, card.x + 21, y + 7, {
        size: 17,
        color: PALETTE.muted,
        width: card.width - 42,
        maxLines: 1,
      });
  }
  const footerY = height - 65;
  ctx.strokeStyle = "#5b4d36";
  ctx.beginPath();
  ctx.moveTo(PAD, footerY - 13);
  ctx.lineTo(WIDTH - PAD, footerY - 13);
  ctx.stroke();
  diamond(ctx, WIDTH / 2, footerY - 13, 4);
  text(ctx, "TERRE DES NOOBS", PAD, footerY, {
    size: 14,
    color: PALETTE.gold,
    title: true,
  });
  text(
    ctx,
    screen.footer ??
      "Continue ton histoire avec les boutons et les menus ci-dessous.",
    PAD + 220,
    footerY - 1,
    {
      size: 17,
      color: PALETTE.muted,
      width: WIDTH - PAD * 2 - 220,
      maxLines: 1,
    },
  );
  return {
    buffer: await canvas.encode("png"),
    width: WIDTH,
    height,
    cards: cards.map(({ x, y, width, height }) => ({ x, y, width, height })),
  };
}
