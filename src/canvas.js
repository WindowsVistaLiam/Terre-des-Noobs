import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import { fileURLToPath } from "node:url";
import { DEFAULT_PORTRAIT } from "./portraits.js";

const asset = (name) =>
  fileURLToPath(new URL(`./assets/${name}`, import.meta.url));
GlobalFonts.registerFromPath(asset("fonts/Cinzel-Regular.ttf"), "BrumeTitle");
GlobalFonts.registerFromPath(asset("fonts/Lato-Regular.ttf"), "BrumeText");
const backdrops = new Map();
const portraits = new Map();
async function portraitImage(ref) {
  if (!ref) return null;
  const key = ref.hash ?? `atlas-${ref.atlas}`;
  if (!portraits.has(key)) {
    const source =
      ref.data && ref.mime === "image/webp"
        ? Buffer.from(ref.data, "base64")
        : Number.isInteger(ref.atlas) && ref.atlas >= 0 && ref.atlas <= 3
          ? asset(`portraits/atlas-${ref.atlas}.webp`)
          : null;
    if (!source) return null;
    portraits.set(key, loadImage(source));
    while (portraits.size > 24) portraits.delete(portraits.keys().next().value);
  }
  let image;
  try {
    image = await portraits.get(key);
  } catch {
    portraits.delete(key);
    return null;
  }
  const columns = ref.columns ?? 1;
  const cellW = image.width / columns,
    cellH = image.height / columns;
  return {
    image,
    sx: ((ref.index ?? 0) % columns) * cellW,
    sy: Math.floor((ref.index ?? 0) / columns) * cellH,
    sw: cellW,
    sh: cellH,
  };
}
function drawPortrait(ctx, picture, x, y, size, accent) {
  if (!picture) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(
    picture.image,
    picture.sx,
    picture.sy,
    picture.sw,
    picture.sh,
    x,
    y,
    size,
    size,
  );
  ctx.restore();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2 + 3, 0, Math.PI * 2);
  ctx.stroke();
}
const BACKGROUNDS = {
  profile: "brumeterre.png",
  social: "social.png",
  market: "market.png",
  info: "info.png",
};
const colorOf = (value, fallback) =>
  PALETTE[value] ?? (/^#[0-9a-f]{6}$/i.test(value ?? "") ? value : fallback);
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

const MAP_COLORS = ["#e3bd72", "#80b9dd", "#a5c98b", "#d99aaa", "#b6a0df", "#d5b18f"];
function campaignMapLayout(ctx, map, y) {
  const width = WIDTH - PAD * 2, cellWidth = (width - 60) / 4;
  font(ctx, 18);
  const nodes = map.stages.map((stage, index) => {
    const members = map.travelers.flatMap((traveler, marker) => {
      if (traveler.stage !== index) return [];
      const name = `${traveler.name}${marker === 0 ? " · Toi" : ""}`;
      const height = Math.max(54, wrapText(ctx, name, cellWidth - 80).length * 26 + 12);
      return [{ traveler, marker, name, height }];
    });
    return { ...stage, members, width: cellWidth,
      height: Math.max(144, 118 + members.reduce((n, m) => n + m.height, 0) + 8) };
  });
  let top = y + 46;
  for (let band = 0; band < 3; band++) {
    const group = nodes.slice(band * 4, band * 4 + 4);
    const bandHeight = Math.max(...group.map((n) => n.height));
    group.forEach((node, index) => {
      const column = band % 2 ? 3 - index : index;
      node.x = PAD + 12 + column * (cellWidth + 12);
      node.y = top;
      node.height = bandHeight;
    });
    top += bandHeight + 30;
  }
  return { y, height: top - y + 20, nodes };
}
function drawCampaignMap(ctx, map, layout, pictures) {
  const { y, height, nodes } = layout;
  const width = WIDTH - PAD * 2;
  box(ctx, PAD, y, width, height, PALETTE.gold);
  text(ctx, "LA ROUTE DES DOUZE GARDIENS", PAD + 20, y + 13,
    { size: 17, title: true, color: PALETTE.gold });
  for (let i = 1; i < nodes.length; i++) {
    const from = nodes[i - 1], to = nodes[i];
    ctx.strokeStyle = map.stages[i].unlocked ? "#b89658" : "#525956";
    ctx.lineWidth = 4;
    ctx.setLineDash(map.stages[i].unlocked ? [] : [6, 7]);
    ctx.beginPath();
    ctx.moveTo(from.x + from.width / 2, from.y + from.height / 2);
    ctx.lineTo(to.x + to.width / 2, to.y + to.height / 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  const markers = [];
  nodes.forEach((stage, index) => {
    const { x, y: top, width: cellWidth, height: cellHeight } = stage;
    const accent = stage.current ? PALETTE.blue : stage.cleared ? PALETTE.green
      : stage.unlocked ? PALETTE.gold : "#525956";
    ctx.fillStyle = "#101818";
    ctx.fillRect(x, top, cellWidth, cellHeight);
    box(ctx, x, top, cellWidth, cellHeight, accent);
    text(ctx, `${String(index + 1).padStart(2, "0")}  ${stage.cleared ? "Vaincu" : stage.unlocked ? "Route ouverte" : "Verrouillé"}`,
      x + 12, top + 10, { size: 16, color: accent });
    text(ctx, stage.name, x + 12, top + 35,
      { size: 19, width: cellWidth - 24, maxLines: 2, color: stage.unlocked ? PALETTE.paper : PALETTE.muted });
    text(ctx, `Niv. ${stage.level}${stage.current ? " · Tu es ici" : ""}`,
      x + 12, top + 91, { size: 15, color: PALETTE.muted });
    let memberY = top + 118;
    for (const member of stage.members) {
      const { traveler, marker, name, height: memberHeight } = member;
      const portraitX = x + 13, portraitY = memberY + 3;
      drawPortrait(ctx, pictures[marker], portraitX, portraitY, 40, MAP_COLORS[marker]);
      text(ctx, name, x + 66, memberY + 4,
        { size: 18, color: marker === 0 ? PALETTE.gold : PALETTE.paper, width: cellWidth - 80 });
      markers.push({ id: traveler.id, name: traveler.name, stage: index,
        x: x + 10, y: memberY, width: cellWidth - 20, height: memberHeight,
        portraitX, portraitY, portraitSize: 40 });
      memberY += memberHeight;
    }
  });
  text(ctx, "Portraits : progression des héros · Bleu : ta région actuelle · Vert : gardien vaincu",
    PAD + 20, y + height - 30, { size: 17, width: width - 40, maxLines: 1, color: PALETTE.muted });
  return markers;
}

export async function drawPanel(screen) {
  const file = BACKGROUNDS[screen.background] ?? BACKGROUNDS.profile;
  if (!backdrops.has(file)) backdrops.set(file, loadImage(asset(file)));
  const image = await backdrops.get(file);
  const [heroPortrait, bannerPicture] = await Promise.all([
    portraitImage(screen.portrait),
    portraitImage(screen.banner),
  ]);
  const cardPictures = await Promise.all(
    (screen.cards ?? []).map((c) => portraitImage(c.portrait)),
  );
  const mapPictures = await Promise.all((screen.campaignMap?.travelers ?? []).map(async (v) =>
    (await portraitImage(v.portrait)) ?? portraitImage(DEFAULT_PORTRAIT)));
  const measure = createCanvas(WIDTH, 100).getContext("2d");
  const tone = PALETTE[screen.tone] ?? PALETTE.gold;
  const columns = screen.compact ? 1 : 2;
  const cardWidth = (WIDTH - PAD * 2 - GAP * (columns - 1)) / columns;
  font(measure, 22);
  const headerBottom = bannerPicture ? 300 : 170;
  let cursor = headerBottom;
  const noticeLines = screen.notice
    ? wrapText(measure, screen.notice, WIDTH - PAD * 2 - 36)
    : [];
  const noticeHeight = noticeLines.length ? noticeLines.length * 30 + 30 : 0;
  if (noticeHeight) cursor += noticeHeight + 20;
  const metricsY = cursor;
  if (screen.metrics?.length) cursor += 112;
  const mapLayout = screen.campaignMap ? campaignMapLayout(measure, screen.campaignMap, cursor) : null;
  if (mapLayout) cursor += mapLayout.height + 20;
  const cards = [];
  for (let i = 0; i < (screen.cards ?? []).length; i += columns) {
    const pair = screen.cards.slice(i, i + columns).map((card, offset) => {
      const picture = cardPictures[i + offset];
      const textWidth = cardWidth - 42 - (picture ? 140 : 0);
      font(measure, 21, true);
      const titles = wrapText(measure, card.title, textWidth);
      font(measure, 23);
      const lines = wrapText(measure, card.text, textWidth);
      return {
        ...card,
        titles,
        lines,
        picture,
        textWidth,
        height: Math.max(
          picture ? 168 : 0,
          42 +
            titles.length * 29 +
            12 +
            lines.length * 31 +
            (card.tag ? 33 : 0),
        ),
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
  const height = Math.max(screen.compact ? 360 : 760, cursor + 90);
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
  if (bannerPicture) {
    const cropHeight = (250 * bannerPicture.image.width) / (WIDTH - 48);
    ctx.drawImage(
      bannerPicture.image,
      0,
      (bannerPicture.image.height - cropHeight) / 2,
      bannerPicture.image.width,
      cropHeight,
      24,
      24,
      WIDTH - 48,
      250,
    );
  }
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
  if (heroPortrait)
    drawPortrait(ctx, heroPortrait, WIDTH - PAD - 112, 43, 112, tone);
  else seal(ctx, WIDTH - PAD - 58, 99, tone);
  if (noticeHeight) {
    box(ctx, PAD, headerBottom, WIDTH - PAD * 2, noticeHeight, tone);
    text(ctx, screen.notice, PAD + 18, headerBottom + 14, {
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
  const mapMarkers = mapLayout ? drawCampaignMap(ctx, screen.campaignMap, mapLayout, mapPictures) : [];
  const mapNodes = (mapLayout?.nodes ?? []).map(({ x, y, width, height }) => ({ x, y, width, height }));
  for (const card of cards) {
    const accent = colorOf(card.accent, PALETTE.line);
    box(ctx, card.x, card.y, card.width, card.height, accent);
    if (card.picture)
      drawPortrait(ctx, card.picture, card.x + 20, card.y + 24, 112, accent);
    const textX = card.x + 21 + (card.picture ? 140 : 0);
    let y = card.y + 21;
    y += text(ctx, card.title, textX, y, {
      size: 21,
      color: colorOf(card.titleColor, PALETTE.gold),
      title: true,
      width: card.textWidth,
    });
    y += 12;
    y += text(ctx, card.text, textX, y, {
      size: 23,
      color: colorOf(card.textColor, PALETTE.paper),
      width: card.textWidth,
    });
    if (card.tag)
      text(ctx, card.tag, textX, y + 7, {
        size: 17,
        color: PALETTE.muted,
        width: card.textWidth,
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
    mapNodes,
    mapMarkers,
  };
}
