import { RACES } from "./content.js";

export const raceBody = (raceId) => ({ sheet: "races", index: Math.max(0, Object.keys(RACES).indexOf(raceId)), columns: 4 });
export function gearIcon(item) {
  const name = String(item.name).toLowerCase();
  if (item.slot === "charm") return /anneau/.test(name) ? "ring" : "amulet";
  if (item.slot === "armor") return /manteau|robe/.test(name) ? "robe" : /cotte|maille/.test(name) ? "mail" : "armor";
  return /arc\b/.test(name) ? "bow" : /bâton|baton/.test(name) ? "staff" : /hache/.test(name) ? "axe" : /rapière/.test(name) ? "rapier" : "sword";
}
const COLORS = ["#a9aaa0", "#81b08b", "#82abd4", "#b695db", "#e4b95e"];
export function drawItemIcon(ctx, item, x, y, size) {
  const icon = item ? gearIcon(item) : "empty", color = COLORS[item?.rarity ?? 0] ?? COLORS[0];
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 100, size / 100);
  ctx.fillStyle = "#182328"; ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(1, 1, 98, 98, 12); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = color; ctx.fillStyle = "#b8c5c6"; ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.lineJoin = "round";
  const path = (points, fill = false) => { ctx.beginPath(); points.forEach(([a, b], i) => i ? ctx.lineTo(a, b) : ctx.moveTo(a, b)); if (fill) { ctx.closePath(); ctx.fill(); } ctx.stroke(); };
  if (["sword", "rapier"].includes(icon)) {
    path([[29, 72], [71, 24], [77, 19], [76, 31], [37, 77]], true);
    ctx.strokeStyle = "#d6af6b"; path([[26, 61], [48, 80]]); path([[31, 74], [22, 85]]);
  } else if (icon === "axe") {
    path([[29, 83], [65, 19]]); path([[59, 25], [82, 33], [70, 57], [49, 45]], true);
  } else if (icon === "bow") {
    ctx.beginPath(); ctx.moveTo(30, 17); ctx.bezierCurveTo(90, 27, 90, 72, 30, 84); ctx.stroke(); path([[30, 17], [43, 51], [30, 84]]); path([[17, 51], [82, 51]]); path([[70, 43], [82, 51], [70, 59]]);
  } else if (icon === "staff") {
    path([[31, 84], [60, 31]]); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(64, 25, 11, 0, Math.PI * 2); ctx.fill();
  } else if (["armor", "mail", "robe"].includes(icon)) {
    path([[35, 22], [20, 31], [24, 49], [32, 45], [icon === "robe" ? 22 : 30, 81], [icon === "robe" ? 79 : 70, 81], [68, 45], [77, 49], [81, 31], [64, 22], [58, 33], [43, 33]], true);
    ctx.strokeStyle = "#627779"; path([[50, 39], [50, 74]]);
    if (icon === "mail") for (let row = 44; row < 78; row += 9) path([[35, row], [65, row]]);
  } else if (icon === "ring") {
    ctx.beginPath(); ctx.ellipse(50, 58, 20, 26, 0, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = color; path([[39, 28], [50, 15], [62, 28], [51, 41]], true);
  } else if (icon === "amulet") {
    path([[28, 19], [50, 53], [73, 19]]); ctx.fillStyle = color; path([[50, 47], [67, 65], [50, 84], [33, 65]], true);
  } else { path([[30, 50], [70, 50]]); path([[50, 30], [50, 70]]); }
  ctx.restore();
}
