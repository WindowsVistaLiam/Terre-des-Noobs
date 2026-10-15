import { createCanvas, loadImage } from "@napi-rs/canvas";
import { createHash } from "node:crypto";
import { GameError, ensure } from "./game.js";

export const MEDIA_LIMIT = 5 * 1024 * 1024;
const CDN_HOSTS = new Set(["cdn.discordapp.com", "media.discordapp.net"]);
const SLOTS = new Set(["portrait", "banner"]);
export const mediaKey = (id, slot) => `${id}.${slot}`;
export function uploadUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new GameError(
      "Le fichier Discord n’est plus disponible. Importe-le à nouveau.",
    );
  }
  ensure(
    url.protocol === "https:" &&
      CDN_HOSTS.has(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port &&
      /^\/(?:ephemeral-)?attachments\//.test(url.pathname),
    "Importe directement ton image dans le formulaire Discord.",
  );
  return url.href;
}

export function imageDimensions(bytes) {
  if (
    bytes.length >= 24 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return {
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
      type: "png",
    };
  if (
    bytes.length >= 30 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    const type = bytes.toString("ascii", 12, 16);
    if (type === "VP8X") {
      ensure(!(bytes[20] & 2), "Choisis une image fixe, sans animation.");
      return {
        width: 1 + bytes.readUIntLE(24, 3),
        height: 1 + bytes.readUIntLE(27, 3),
        type: "webp",
      };
    }
    if (
      type === "VP8 " &&
      bytes.subarray(23, 26).equals(Buffer.from([0x9d, 1, 0x2a]))
    )
      return {
        width: bytes.readUInt16LE(26) & 0x3fff,
        height: bytes.readUInt16LE(28) & 0x3fff,
        type: "webp",
      };
    if (type === "VP8L" && bytes[20] === 0x2f)
      return {
        width: 1 + ((bytes[21] | (bytes[22] << 8)) & 0x3fff),
        height:
          1 +
          (((bytes[22] >> 6) | (bytes[23] << 2) | (bytes[24] << 10)) & 0x3fff),
        type: "webp",
      };
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let p = 2;
    while (p + 4 < bytes.length) {
      if (bytes[p++] !== 0xff) break;
      while (bytes[p] === 0xff) p++;
      const marker = bytes[p++];
      if ([0xd9, 0xda].includes(marker)) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
      if (p + 2 > bytes.length) break;
      const length = bytes.readUInt16BE(p);
      if (length < 2 || p + length > bytes.length) break;
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker) &&
        length >= 7
      )
        return {
          width: bytes.readUInt16BE(p + 5),
          height: bytes.readUInt16BE(p + 3),
          type: "jpeg",
        };
      p += length;
    }
  }
  throw new GameError(
    "Choisis une image PNG, JPG ou WebP valide (sans animation).",
  );
}

export async function normalizeImage(bytes, slot) {
  ensure(SLOTS.has(slot), "Emplacement d’image inconnu.");
  ensure(
    Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= MEDIA_LIMIT,
    "L’image doit peser au maximum 5 Mo.",
  );
  const dimensions = imageDimensions(bytes);
  ensure(
    dimensions.width >= 32 &&
      dimensions.height >= 32 &&
      dimensions.width <= 4096 &&
      dimensions.height <= 4096 &&
      dimensions.width * dimensions.height <= 16_000_000,
    "Image trop grande ou trop petite : de 32 à 4096 pixels par côté, au maximum 16 millions de pixels.",
  );
  let source;
  try {
    source = await loadImage(bytes);
  } catch {
    throw new GameError(
      "Impossible de lire cette image. Essaie un autre PNG, JPG ou WebP.",
    );
  }
  const width = slot === "portrait" ? 256 : 1280,
    height = slot === "portrait" ? 256 : 320;
  const canvas = createCanvas(width, height),
    ctx = canvas.getContext("2d");
  const scale = Math.max(width / source.width, height / source.height);
  ctx.fillStyle = "#15212a";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(
    source,
    (width - source.width * scale) / 2,
    (height - source.height * scale) / 2,
    source.width * scale,
    source.height * scale,
  );
  const normalized = await canvas.encode("webp", 85);
  return {
    data: normalized.toString("base64"),
    mime: "image/webp",
    width,
    height,
    hash: createHash("sha256").update(normalized).digest("hex"),
  };
}

export async function importAttachment(
  attachment,
  slot,
  { fetcher = fetch } = {},
) {
  ensure(
    attachment && attachment.size > 0 && attachment.size <= MEDIA_LIMIT,
    "Choisis une image de 5 Mo maximum.",
  );
  const url = uploadUrl(attachment.url);
  let response;
  try {
    response = await fetcher(url, {
      redirect: "error",
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new GameError(
      "Le téléchargement a échoué. Importe à nouveau ton image depuis Discord.",
    );
  }
  ensure(
    response.ok && response.body,
    "Le fichier Discord a expiré. Importe-le à nouveau.",
  );
  if (!(Number(response.headers.get("content-length") ?? 0) <= MEDIA_LIMIT)) {
    await response.body.cancel();
    throw new GameError("L’image dépasse 5 Mo.");
  }
  const reader = response.body.getReader(),
    chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MEDIA_LIMIT) {
        await reader.cancel();
        throw new GameError("L’image dépasse 5 Mo.");
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    if (error instanceof GameError) throw error;
    throw new GameError(
      "Le téléchargement a été interrompu. Réessaie ton import.",
    );
  } finally {
    reader.releaseLock();
  }
  return normalizeImage(Buffer.concat(chunks), slot);
}

// Les octets restent dans un document séparé, hors des listes de personnages.
export async function decorateAppearance(game, result, viewerId) {
  if (result.duplicate) return result;
  const id = ["publicProfile", "playerCard"].includes(result.type)
    ? result.target.id
    : (result.actorId ?? viewerId);
  const data = await game.store.transaction(async (tx) => {
    const p = result.p?.id === id ? result.p : await tx.get("player", id);
    const profile = p?.customization ?? {};
    const portrait = profile.portrait
      ? await tx.get("profile_media", mediaKey(id, "portrait"))
      : null;
    const banner =
      ["profile", "publicProfile", "playerCard", "customize"].includes(
        result.type,
      ) && profile.banner
        ? await tx.get("profile_media", mediaKey(id, "banner"))
        : null;
    return { portrait, banner };
  });
  return {
    ...result,
    appearance: data,
    ...(result.activity
      ? { activity: await decorateAppearance(game, result.activity, viewerId) }
      : {}),
  };
}
