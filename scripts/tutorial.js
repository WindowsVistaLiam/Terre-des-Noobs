import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// Infographies dessinées en Canvas : texte, formes et pictogrammes vectoriels.
// Aucune illustration générée, capture Discord ou ressource distante.
const root = fileURLToPath(new URL("../", import.meta.url));
GlobalFonts.registerFromPath(
  resolve(root, "src/assets/fonts/Cinzel-Regular.ttf"),
  "GuideTitle",
);
GlobalFonts.registerFromPath(
  resolve(root, "src/assets/fonts/Lato-Regular.ttf"),
  "GuideText",
);
const W = 1080,
  H = 1440,
  margin = 64,
  wide = W - margin * 2;
const C = {
  bg: "#101b24",
  panel: "#182a35",
  stroke: "#344b55",
  text: "#f3eee1",
  muted: "#b8c9cd",
  gold: "#d8bc83",
  mint: "#a0d2bc",
  paper: "#efe9db",
  ink: "#152b35",
  red: "#e3b1a4",
};
let ctx;
const font = (size, title = false) => {
  ctx.font = `${size}px ${title ? "GuideTitle" : "GuideText"}`;
  ctx.textBaseline = "top";
};
const line = (x, y, xx, yy, color = C.stroke, width = 1) => {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(xx, yy);
  ctx.stroke();
};
const box = (x, y, w, h, fill = C.panel, border = C.stroke, radius = 16) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
};
function text(
  value,
  x,
  y,
  width,
  {
    size = 27,
    color = C.text,
    title = false,
    leading = 1.35,
    bottom = H - 80,
  } = {},
) {
  font(size, title);
  ctx.fillStyle = color;
  let cursor = y;
  for (const paragraph of value.split("\n")) {
    const words = paragraph.split(/\s+/);
    let current = "";
    const flush = () => {
      if (cursor + size > bottom)
        throw new Error(`Texte hors cadre : ${value.slice(0, 60)}`);
      ctx.fillText(current, x, cursor);
      cursor += size * leading;
    };
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (ctx.measureText(next).width > width && current) {
        flush();
        current = word;
      } else current = next;
    }
    flush();
  }
  return cursor;
}
function icon(kind, x, y, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const path = (points, close = false) => {
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for (const p of points.slice(1)) ctx.lineTo(...p);
    if (close) ctx.closePath();
    ctx.stroke();
  };
  if (kind === "hero" || kind === "fight") {
    path(
      [
        [18, 62],
        [60, 20],
        [60, 8],
        [48, 8],
        [6, 50],
      ],
      true,
    );
    path([
      [4, 43],
      [25, 64],
    ]);
    path([
      [4, 64],
      [15, 53],
    ]);
  } else if (kind === "prep" || kind === "city") {
    path(
      [
        [4, 12],
        [32, 2],
        [60, 12],
        [56, 40],
        [47, 55],
        [32, 66],
        [17, 55],
        [8, 40],
      ],
      true,
    );
    path([
      [20, 32],
      [29, 41],
      [45, 23],
    ]);
  } else if (kind === "market") {
    path(
      [
        [4, 20],
        [12, 4],
        [52, 4],
        [60, 20],
      ],
      true,
    );
    path([
      [10, 20],
      [10, 60],
      [54, 60],
      [54, 20],
    ]);
    path([
      [26, 60],
      [26, 35],
      [41, 35],
      [41, 60],
    ]);
  } else {
    for (const [cx, cy, r] of [
      [32, 13, 10],
      [10, 27, 7],
      [54, 27, 7],
    ]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    path([
      [15, 63],
      [15, 48],
      [23, 36],
      [41, 36],
      [49, 48],
      [49, 63],
    ]);
    path([
      [0, 62],
      [0, 46],
      [7, 41],
    ]);
    path([
      [64, 62],
      [64, 46],
      [57, 41],
    ]);
  }
  ctx.restore();
}
function header(page) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 18; i++)
    line(740 + i * 26, 0, 220 + i * 26, H, "#172730");
  ctx.strokeStyle = C.stroke;
  ctx.lineWidth = 1;
  ctx.strokeRect(24, 24, W - 48, H - 48);
  text("TERRE DES NOOBS", margin, 53, 700, {
    size: 23,
    color: C.gold,
    title: true,
  });
  text(`GUIDE DU JOUEUR   /   0${page.n}`, margin, 93, 750, {
    size: 17,
    color: C.muted,
  });
  box(906, 51, 110, 45, C.bg, C.stroke, 22);
  text(`0${page.n} / 06`, 925, 62, 90, { size: 19, color: C.gold });
  text(page.title, margin, 153, 800, {
    size: 59,
    title: true,
    leading: 1.12,
    bottom: 300,
  });
  icon(page.icon, 921, 187, 0.95);
  text(page.intro, margin, 297, wide, {
    size: 26,
    color: C.muted,
    leading: 1.25,
    bottom: 370,
  });
  line(margin, 1368, W - margin, 1368);
  text("LES CHRONIQUES DE BRUMETERRE", margin, 1388, 720, {
    size: 16,
    color: C.gold,
    bottom: H - 30,
  });
  text(`FICHE 0${page.n} / 06`, 870, 1388, 160, {
    size: 16,
    color: C.muted,
    bottom: H - 30,
  });
}
function card({ x = margin, y, w = wide, h, tag, title, body, light = false }) {
  box(x, y, w, h, light ? C.paper : C.panel, light ? null : C.stroke);
  const ink = light ? C.ink : C.text;
  let yy = y + 20;
  if (tag)
    yy =
      text(tag, x + 24, yy, w - 48, {
        size: 16,
        leading: 1.2,
        color: light ? "#53686a" : C.gold,
        bottom: y + h - 20,
      }) + 7;
  yy =
    text(title, x + 24, yy, w - 48, {
      size: 30,
      color: ink,
      leading: 1.15,
      bottom: y + h - 20,
    }) + 12;
  text(body, x + 24, yy, w - 48, {
    size: 24,
    color: light ? C.ink : C.muted,
    leading: 1.25,
    bottom: y + h - 20,
  });
}
function pill(label, x, y, w, color = C.gold) {
  box(x, y, w, 64, C.bg, C.stroke, 12);
  text(label, x + 20, y + 18, w - 40, { size: 25, color });
}

const pages = [
  {
    n: 1,
    file: "01-creer-son-heros.png",
    icon: "hero",
    title: "Crée ton\naventurier",
    intro: "Quatre commandes. Le reste se joue avec les boutons.",
    blocks: [
      {
        y: 380,
        h: 178,
        tag: "01   OUVRE TON CARNET",
        title: "/profil → Mon carnet privé",
        body: "Clique ensuite sur « Créer mon aventurier » pour lancer la création de ton personnage.",
      },
      {
        y: 580,
        h: 205,
        tag: "02   CHOISIS TON IDENTITÉ",
        title: "Un peuple, une classe, un nom",
        body: "16 peuples et 18 classes, toutes les combinaisons sont possibles. Des sceaux du marchand permettent de changer de race ou de classe.",
      },
      {
        y: 807,
        h: 178,
        tag: "03   RETROUVE TOUJOURS TON CHEMIN",
        title: "Tes quatre portes d’entrée",
        body: "Profil : ton héros. Marché : objets et atelier.\nSocial : tes amis. Info : les règles et le codex.",
      },
      {
        y: 1110,
        h: 205,
        light: true,
        tag: "À SAVOIR",
        title: "Un panneau pour chacun",
        body: "Les commandes Profil, Marché et Info sont publiques. Leurs boutons ouvrent ton propre menu privé : tu ne modifies jamais le héros d’un autre joueur.",
      },
    ],
    extra() {
      const pw = 223;
      ["/profil", "/marché", "/social", "/info"].forEach((p, i) =>
        pill(p, margin + i * 243, 1014, pw),
      );
    },
  },
  {
    n: 2,
    file: "02-preparer-son-depart.png",
    icon: "prep",
    title: "Prépare ton\npremier départ",
    intro: "Les premiers ennemis résistent. L’équipement compte.",
    blocks: [
      {
        y: 380,
        h: 265,
        light: true,
        tag: "LE CONSEIL DU DÉPART",
        title: "Fabrique une protection",
        body: "/marché → Mon marché → Atelier\nChoisis « Protection du voyageur » :\n35 or + 4 fers + 4 cuirs + 6 bois.\nPuis ouvre le Coffre et équipe l’armure.",
      },
      {
        y: 669,
        h: 206,
        tag: "PROFIL → MON CARNET PRIVÉ → MON REFUGE",
        title: "Construis ton premier bâtiment",
        body: "Une caserne aide en mêlée ; une tour des arcanes aide la magie. Tu as trois emplacements. Certains bâtiments sont réservés à ton peuple.",
      },
      {
        y: 899,
        h: 181,
        tag: "AVANT DE PRENDRE LA ROUTE",
        title: "Provisions, potions et talents",
        body: "Récupère tes provisions du jour depuis ton profil. Après un niveau gagné, dépense tes points dans Talents.",
      },
      {
        y: 1110,
        h: 205,
        light: true,
        tag: "POUR PROGRESSER",
        title: "Reviens mieux préparé",
        body: "Le refuge récupère ta vie et ton mana. L’énergie remonte de 1 toutes les 5 minutes, même hors ligne. Améliorer ton héros rend les anciennes routes plus accessibles.",
      },
    ],
  },
  {
    n: 3,
    file: "03-combattre-et-rentrer.png",
    icon: "fight",
    title: "Choisis tes coups.\nSauve ton butin.",
    intro: "Profil → Mon carnet privé → Partir à l’aventure",
    blocks: [
      {
        x: margin,
        y: 500,
        w: 464,
        h: 205,
        title: "Attaque",
        body: "Inflige des dégâts et récupère 3 mana.\nUne bonne option pour préparer ta compétence.",
      },
      {
        x: 552,
        y: 500,
        w: 464,
        h: 205,
        title: "Défense",
        body: "Bloque 70 % des dégâts et rend 10 mana.\nUtile face à la frappe lourde annoncée.",
      },
      {
        x: margin,
        y: 729,
        w: 464,
        h: 205,
        title: "Compétence",
        body: "Ton pouvoir de classe.\nConsomme du mana et se relance un tour sur deux.",
      },
      {
        x: 552,
        y: 729,
        w: 464,
        h: 205,
        title: "Potion ou éther",
        body: "Soigne ta vie ou restaure ton mana.\nUtiliser un consommable prend ton tour.",
      },
      {
        y: 964,
        h: 350,
        light: true,
        tag: "LE BON MOMENT POUR RENTRER",
        title: "Le sac est exposé. Le coffre est protégé.",
        body: "Choisis ton ennemi : avancer débloque le gardien après deux victoires ; chasser donne du butin sans avancer. Tu décides quand défier le gardien.\nRentrer sécurise le sac. Défaite : moitié de l’or et des matériaux perdue, tous les équipements perdus. Fuir coûte 25 % de l’or. En progression, fuite et défaite remettent le compteur du gardien à zéro ; en chasse, il est conservé.",
      },
    ],
    extra() {
      ["Choisir un ennemi", "Avancer ou chasser", "Rentrer au refuge"].forEach(
        (p, i) => {
          const x = margin + i * 325;
          pill(p, x, 393, 302, C.mint);
        },
      );
    },
  },
  {
    n: 4,
    file: "04-marche-et-equipement.png",
    icon: "market",
    title: "Fais vivre\nle marché",
    intro: "/marché → Mon marché : échanges, coffre et artisanat.",
    blocks: [
      {
        y: 380,
        h: 206,
        tag: "ACHETER",
        title: "Une offre, un lot, un prix",
        body: "Choisis une annonce pour voir son contenu et son vendeur. Le prix affiché est celui du lot entier. L’achat transfère les objets dans ton coffre.",
      },
      {
        y: 610,
        h: 206,
        tag: "VENDRE",
        title: "Tes trouvailles peuvent servir aux autres",
        body: "Depuis Ressources, choisis une quantité à vendre. Depuis Coffre, sélectionne un équipement non porté. Fixe ensuite le prix du lot.",
      },
      {
        y: 840,
        h: 206,
        tag: "AMÉLIORER TON HÉROS",
        title: "Fabrique, équipe et enchante",
        body: "L’Atelier transforme tes matériaux en objets. Dans le Coffre, équipe tes trouvailles ; une forge permet de les enchanter. Les objets inutiles se recyclent.",
      },
      {
        y: 1110,
        h: 205,
        light: true,
        tag: "LES RÈGLES DE LA HALLE",
        title: "5 % de commission • 7 jours de vente",
        body: "Le lot quitte ton coffre tant que l’annonce est active. Tu peux la retirer. Une annonce expirée est rendue au prochain accès au marché. Maximum : 10 annonces actives.",
      },
    ],
  },
  {
    n: 5,
    file: "05-jouer-avec-ses-amis.png",
    icon: "social",
    title: "La Brume se brave\nà plusieurs",
    intro: "/social rassemble tes amis, ta guilde et tes défis.",
    blocks: [
      {
        y: 380,
        h: 206,
        tag: "TES COMPAGNONS",
        title: "Profils, amitiés et cadeaux",
        body: "Ouvre « Voir les profils » et sélectionne un héros. Propose ton amitié, un cadeau ou un duel. Les demandes et invitations se traitent dans Réception.",
      },
      {
        y: 610,
        h: 206,
        tag: "UNE BANNIÈRE COMMUNE",
        title: "Rejoins ou fonde une guilde",
        body: "Dans « Ma guilde », rejoins une bannière ou fonde la tienne pour 200 or. Jusqu’à 30 membres, un trésor commun et une cité à développer.",
      },
      {
        y: 840,
        h: 206,
        tag: "LES GRANDS COMBATS",
        title: "Formez un groupe pour les raids",
        body: "Réunissez 2 à 4 héros du niveau requis. Chacun doit être au refuge avec 50 % de vie et 20 énergie. Rejoindre autorise le chef à lancer le raid. Délai : 24 h.",
      },
      {
        y: 1110,
        h: 205,
        light: true,
        tag: "POUR SE CHAMBRER ENTRE AMIS",
        title: "Des duels acceptés, sans perte",
        body: "L’adversaire doit accepter le défi. Le combat est simulé à pleine vie et plein mana. Le classement change ; tes jauges, ton or et tes objets restent intacts.",
      },
    ],
  },
  {
    n: 6,
    file: "06-defendre-la-cite.png",
    icon: "city",
    title: "Bâtissez une cité.\nDéfendez-la.",
    intro: "/social → Notre cité : votre objectif commun de guilde.",
    blocks: [
      {
        x: margin,
        y: 380,
        w: 464,
        h: 145,
        title: "Remparts",
        body: "Renforcent l’intégrité\net la défense.",
      },
      {
        x: 552,
        y: 380,
        w: 464,
        h: 145,
        title: "Caserne",
        body: "Renforce les assauts\net la puissance de siège.",
      },
      {
        x: margin,
        y: 549,
        w: 464,
        h: 145,
        title: "Hospice",
        body: "Aide aux réparations\net aux sorties de soutien.",
      },
      {
        x: 552,
        y: 549,
        w: 464,
        h: 145,
        title: "Phare de veille",
        body: "Renforce la défense\net les sorties d’invasion.",
      },
      {
        y: 718,
        h: 297,
        light: true,
        tag: "DÉFENDRE ENSEMBLE",
        title: "Repoussez l’invasion du jour",
        body: "À partir de deux membres : trois sorties par personne, espacées de 5 minutes. Chaque sortie coûte 10 énergie et 10 % des PV maximaux ; il faut 50 % de vie au refuge.\nChoisis Assaut, Bastion ou Soutien. Après la victoire, les participants réclament leur récompense.",
      },
      {
        y: 1039,
        h: 276,
        tag: "CONSTRUIRE ET SE DÉFIER",
        title: "Gardes et sièges entre guildes",
        body: "Tous peuvent donner or et matériaux ; chef et officiers améliorent la cité. Une garde la défend pendant 24 h pour 10 énergie.\nLes sièges exigent l’accord des deux guildes. Aucun coffre pillé, aucun bâtiment détruit.",
      },
    ],
  },
];

const out = resolve(root, "docs/tutorial");
await mkdir(out, { recursive: true });
for (const page of pages) {
  const canvas = createCanvas(W, H);
  ctx = canvas.getContext("2d");
  header(page);
  for (const block of page.blocks) card(block);
  page.extra?.();
  await writeFile(resolve(out, page.file), canvas.toBuffer("image/png"));
}
// Aperçu 2 × 3 : les six pages entières, sans recadrage.
const contact = createCanvas(1080, 960),
  cc = contact.getContext("2d");
cc.fillStyle = C.bg;
cc.fillRect(0, 0, 1080, 960);
const { loadImage } = await import("@napi-rs/canvas");
for (const [i, page] of pages.entries())
  cc.drawImage(
    await loadImage(resolve(out, page.file)),
    20 + (i % 3) * 357,
    20 + Math.floor(i / 3) * 470,
    337,
    449,
  );
await writeFile(resolve(out, "apercu.png"), contact.toBuffer("image/png"));
const transcript = pages
  .map(
    (p) =>
      `## ${p.n}. ${p.title.replaceAll("\n", " ")}\n\n${p.intro}\n\n${p.blocks.map((b) => `### ${b.title}\n\n${b.body}`).join("\n\n")}\n\n![Fiche ${p.n}](${p.file})`,
  )
  .join("\n\n");
await writeFile(
  resolve(out, "LIRE-MOI.md"),
  `# Terre des Noobs — guide du joueur\n\nSix fiches PNG de 1080 × 1440 pixels, à publier dans l’ordre dans un salon Discord. Le texte est retranscrit ci-dessous. Le message d’annonce est dans annonce-discord.txt.\n\nCréation graphique en Canvas, avec formes et pictogrammes vectoriels, sans illustration générée par IA. Les polices Cinzel et Lato sont celles du projet. Pour régénérer les images : npm run tutorial.\n\n${transcript}\n`,
);
console.log(`6 fiches et leur aperçu générés dans ${out}`);
