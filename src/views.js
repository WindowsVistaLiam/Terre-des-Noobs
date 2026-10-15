import {
  RACES,
  CLASSES,
  ZONES,
  RESOURCES,
  BUILDINGS,
  RECIPES,
  RAIDS,
  DAILY_QUESTS,
  RARITIES,
  xpRequired,
  buildingCost,
  worldEvent,
} from "./content.js";
import { statsOf, gearLabel } from "./game.js";

const COLORS = {
  gold: 0xd6ab66,
  green: 0x74b69c,
  red: 0xc96565,
  purple: 0x9b83ca,
};
const T = String.fromCharCode(96);
const clip = (text, max = 1024) => String(text).slice(0, max);
const field = (name, value, inline = false) => ({
  name,
  value: clip(value || "—"),
  inline,
});
const row = (...components) => ({ type: 1, components });
const button = (id, label, style = 2, disabled = false) => ({
  type: 2,
  custom_id: id,
  label: clip(label, 80),
  style,
  disabled,
});
const resText = (resources) =>
  Object.entries(resources)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${RESOURCES[k] ?? k} **${Math.floor(n)}**`)
    .join(" · ") || "Rien pour le moment";
const costText = (cost) =>
  `${cost.gold} or · ${resText(cost.resources ?? cost.cost ?? {})}`;
const statText = (stats) =>
  Object.entries(stats)
    .map(
      ([k, n]) =>
        `${{ hp: "PV", mana: "mana", attack: "ATQ", defense: "DÉF", power: "PUI", crit: "crit.", luck: "butin", xp: "XP", gold: "or", healing: "soins" }[k] ?? k} +${n < 1 ? `${Math.round(n * 100)} %` : n}`,
    )
    .join(" · ");
export const bar = (value, max) => {
  const n = Math.max(
    0,
    Math.min(10, Math.round((value / Math.max(1, max)) * 10)),
  );
  return "▰".repeat(n) + "▱".repeat(10 - n);
};

export const HELP = `**Bienvenue dans les Chroniques de Brumeterre.**
La Brume dévore les routes. Votre refuge est le dernier endroit où la cloche sonne encore juste.

**01 · Incarne ton héros**
Explore /codex, puis /creer nom:… race:… classe:…. Une race, une classe, un personnage par compte, partagé entre tous les serveurs de ce bot.

**02 · Prépare ton refuge**
/quotidien pour les provisions. /base construire pour l’un de tes **3 bâtiments**. Scierie et carrière facilitent les débuts. Ton peuple possède un bâtiment exclusif.

**03 · Prends la route**
/carte → /voyager → /campagne. Explore, attaque, utilise ta compétence et protège-toi quand une frappe lourde est annoncée. Trois victoires font apparaître le boss.

**04 · Choisis jusqu’où aller**
Tes PV et ton mana persistent entre les combats. /rentrer sécurise ton sac. Une défaite coûte la moitié de l’or et des matériaux du sac et tous ses équipements. Le coffre reste protégé.

**05 · Fais vivre le monde**
/atelier pour fabriquer et recycler, /marche pour commercer, /donner pour aider un ami. Crée une /guilde, puis forme un /groupe pour les raids à 2–4 joueurs.

Les contrats et provisions changent à **minuit UTC**. Ton énergie récupère de **1 toutes les 5 minutes**, même hors ligne.`;

export function codexEntries(category, p) {
  switch (category) {
    case "races":
      return Object.entries(RACES).map(([id, r]) =>
        field(
          `${r.emoji} ${r.name}`,
          `${r.lore}\n${statText(r.bonuses)}\nBâtiment : **${BUILDINGS[r.building].name}** · ${T}${id}${T}`,
        ),
      );
    case "classes":
      return Object.entries(CLASSES).map(([id, c]) =>
        field(
          `${c.emoji} ${c.name} · ${c.role}`,
          `${statText(c.stats)}\n**${c.skill.name}** · ${c.skill.cost} mana · disponible un tour sur deux\n${c.skill.text}\n${T}${id}${T}`,
        ),
      );
    case "batiments":
      return Object.entries(BUILDINGS)
        .sort(
          ([, a], [, b]) =>
            Number(!(!a.races.length || a.races.includes(p?.raceId))) -
            Number(!(!b.races.length || b.races.includes(p?.raceId))),
        )
        .map(([id, b]) =>
          field(
            `${b.races.length ? RACES[b.races[0]].emoji : "🏗️"} ${b.name}`,
            `${b.description}\n${b.races.length ? `Réservé : ${b.races.map((r) => RACES[r].name).join(", ")}` : "Tous les peuples"} · ${T}${id}${T}\nNiv. 1 : ${costText(buildingCost(1))}`,
          ),
        );
    case "recettes":
      return Object.entries(RECIPES).map(([id, r]) =>
        field(
          `⚒️ ${r.name}`,
          `${costText(r)}\n${T}/atelier fabriquer recette:${id}${T}${r.slot ? "\nÉquipement créé à ton niveau actuel." : ""}`,
        ),
      );
    case "raids":
      return RAIDS.map((r) =>
        field(
          `☠️ ${r.name} · niveau ${r.level}`,
          `${r.story}\n${r.hp} PV · ${r.attack} ATQ · ${r.defense} DÉF\n2–4 joueurs · 20 énergie chacun · délai de 24 h entre tentatives\nVictoire : ${r.reward} or, ${r.reward * 2} XP, un équipement, des insignes et matériaux par joueur.`,
        ),
      );
    default:
      return [
        field(
          "Combats",
          "Attaque : +3 mana. Défense : 70 % des dégâts bloqués et +10 mana. Compétence : coût en mana, disponible un tour sur deux. Potions et éthers consomment un tour. Fuir est garanti mais coûte 25 % de l’or du sac et remet le compteur du boss à zéro.",
        ),
        field(
          "Progression",
          "Trois combats gagnés dans une région font apparaître son boss. Sa première défaite ouvre la route suivante, avec un niveau minimal. Chaque niveau accorde un point de talent permanent. Niveau maximal : 50. L’équipement ne se change qu’à la base.",
        ),
        field(
          "Refuge",
          "3 emplacements, un exemplaire par bâtiment, niveau maximal 5. Bonus passifs toujours actifs. Production accumulée pendant 12 h maximum entre collectes. À la base, 2 % des PV max (au moins 2) et 3 mana par minute. Le repos payant restaure les jauges immédiatement.",
        ),
        field(
          "Économie",
          "Les annonces retirent le lot de ton coffre jusqu’à la vente ou l’annulation. Prix affiché = lot ENTIER. Commission : 5 %, arrondie au supérieur. Expiration : 7 jours, retour automatique au prochain accès au marché. 10 annonces par vendeur. Les insignes de raid ne sont pas échangeables.",
        ),
        field(
          "Guildes & raids",
          "Guildes ouvertes de 30 membres maximum. Bonus de campagne : +2 % XP par niveau. Groupe persistant de 2 à 4 aventuriers. En rejoignant, tu autorises le chef à engager le raid : chacun doit être à la base, avec 20 énergie et au moins 50 % de vie. Simulation collective de 35 tours maximum ; les prêtres et druides soignent le groupe.",
        ),
        field(
          "Compagnons & magie",
          "Les compétences du rôdeur représentent son compagnon. Les armes sont universelles : chaque arme donne attaque et puissance ; son nom est esthétique. Les potions profitent des bonus de soin. Les événements du monde tournent tous les jours UTC.",
        ),
      ];
  }
}

export function render(result, viewerId, { readOnly = false } = {}) {
  const { p, now = Date.now(), message } = result;
  const embed = {
    color: COLORS.gold,
    title: "🌫️ Terre des Noobs",
    description: message ? clip(message, 1800) : undefined,
    fields: [],
    footer: { text: "BRUMETERRE • Les routes se souviennent de vos pas" },
  };
  const components = [];
  const id = (...parts) => ["rpg", viewerId, ...parts].join(":");
  const btn = (action, label, style = 2, disabled = false, ...args) =>
    button(id(action, ...args), label, style, disabled);
  const navigation = () =>
    components.push(
      row(
        btn("profile", "Personnage"),
        btn("map", "Carte"),
        btn("base", "Refuge"),
        btn("inventory", "Coffre"),
      ),
    );
  const s = p ? statsOf(p) : null;
  const vitals = () => [
    field("❤️ Vie", `${bar(p.hp, s.hp)} ${p.hp}/${s.hp}`, true),
    field("💧 Mana", `${bar(p.mana, s.mana)} ${p.mana}/${s.mana}`, true),
    field("⚡ Énergie", `${p.energy}/100 · +1 / 5 min`, true),
  ];
  switch (result.type) {
    case "help":
      embed.title = "📖 Le carnet du nouvel aventurier";
      embed.description = HELP;
      break;
    case "codex": {
      const names = {
        races: "Les peuples",
        classes: "Les vocations",
        batiments: "Les bâtisseurs",
        recettes: "Le livre d’atelier",
        raids: "Les grands périls",
        regles: "Les règles de Brumeterre",
      };
      const category = result.category ?? "races";
      const entries = codexEntries(category, p);
      const pages = Math.ceil(entries.length / 4);
      const page = Math.max(1, Math.min(pages, result.page ?? 1));
      embed.title = `📚 ${names[category] ?? names.regles}`;
      embed.fields = entries.slice((page - 1) * 4, page * 4);
      embed.footer.text += ` • ${page}/${pages}`;
      if (pages > 1)
        components.push(
          row(
            btn("codex", "←", 2, page === 1, category, page - 1),
            btn("codex", "→", 2, page === pages, category, page + 1),
          ),
        );
      components.push(
        row(
          btn("codex", "Peuples", 2, false, "races", 1),
          btn("codex", "Classes", 2, false, "classes", 1),
          btn("codex", "Bâtiments", 2, false, "batiments", 1),
          btn("codex", "Recettes", 2, false, "recettes", 1),
          btn("codex", "Règles", 2, false, "regles", 1),
        ),
      );
      break;
    }
    case "profile": {
      embed.title = `${RACES[p.raceId].emoji} ${p.name} · ${CLASSES[p.classId].name}`;
      embed.fields = [
        ...vitals(),
        field(
          "✦ Progression",
          `Niveau **${p.level}** · ${p.xp}/${xpRequired(p.level)} XP\n${p.bosses.length}/12 gardiens vaincus · ${p.kills} victoires`,
        ),
        field(
          "⚔️ Caractéristiques",
          `${s.attack} ATQ · ${s.defense} DÉF · ${s.power} PUI · ${Math.round(s.crit * 100)} % critiques`,
        ),
        field(
          "🪙 Fortune & refuge",
          `${p.gold} or au coffre · ${p.bag.gold} or dans le sac\n${p.location === "base" ? "🏡 Au refuge" : `${ZONES[p.zone].emoji} ${ZONES[p.zone].name}`}`,
        ),
        field(
          "✨ Vocation",
          `${CLASSES[p.classId].skill.name} · ${CLASSES[p.classId].skill.cost} mana\n${CLASSES[p.classId].skill.text}\n${p.talentPoints} point(s) de talent à dépenser avec /talent`,
        ),
        field(
          "🌍 Aujourd’hui",
          `${worldEvent(now).name} — ${worldEvent(now).description}`,
        ),
      ];
      if (p.bosses.includes(11))
        embed.fields.push(field("👑 Titre", "Briseur de Brume"));
      if (!readOnly) {
        components.push(
          row(
            btn("campaign", p.battle ? "Reprendre le combat" : "Aventure", 1),
            btn("daily", "Provisions"),
            btn("quests", "Contrats"),
          ),
        );
        navigation();
      }
      break;
    }
    case "map": {
      embed.title = "🗺️ Les routes de Brumeterre";
      embed.description = ZONES.map(
        (z) =>
          `${z.id <= p.unlockedZone ? (p.bosses.includes(z.id) ? "✅" : "🧭") : "🔒"} ${z.emoji} **${z.name}** · niv. ${z.level}${z.id === p.zone ? " ◀" : ""}`,
      ).join("\n");
      embed.fields = [
        field(
          "Le voyage",
          "Vaincs le gardien pour ouvrir la région suivante. Respecte aussi son niveau minimal. Rejouer les régions précédentes rapporte XP et matériaux. Sélectionne ta destination ci-dessous.",
        ),
      ];
      const options = ZONES.filter(
        (z) => z.id <= p.unlockedZone && z.level <= p.level,
      ).map((z) => ({
        label: z.name,
        value: String(z.id),
        description: `Niveau ${z.level} · ${z.biome}`,
      }));
      components.push(
        row({
          type: 3,
          custom_id: id("destination"),
          placeholder: "Choisir une destination",
          options,
        }),
      );
      navigation();
      break;
    }
    case "campaign": {
      const z = ZONES[p.zone];
      const b = p.battle;
      embed.title = `${z.emoji} ${z.name}`;
      embed.color = b ? COLORS.red : COLORS.green;
      embed.fields = [...vitals()];
      if (b) {
        const e = b.enemy;
        embed.title = `${e.boss ? "👑" : "⚔️"} ${e.name} · tour ${b.turn}`;
        embed.fields.push(
          field(
            `Ennemi · niveau ${e.level}`,
            `${bar(e.hp, e.maxHp)} **${e.hp}/${e.maxHp} PV**\n${e.attack} ATQ · ${Math.round(e.defense)} DÉF${e.boss && e.hp / e.maxHp < 0.4 ? "\n🔥 Le gardien est enragé !" : ""}`,
          ),
          field(
            "Son prochain mouvement",
            b.turn % 3 === 0
              ? "💢 **Frappe lourde imminente. Défends-toi !**"
              : b.turn > 20
                ? "🔥 L’ennemi gagne en puissance à chaque tour."
                : "Une attaque se prépare.",
          ),
          field(
            "Ta compétence",
            `${CLASSES[p.classId].skill.name} · ${CLASSES[p.classId].skill.cost} mana\n${b.turn >= b.skillReady ? "Disponible" : "Disponible au prochain tour"}`,
          ),
        );
        const fight = (move, label, style = 2, disabled = false) =>
          btn("combat", label, style, disabled, move, b.id, b.turn);
        components.push(
          row(
            fight("attack", "⚔️ Attaquer", 1),
            fight(
              "skill",
              "✨ Compétence",
              1,
              b.turn < b.skillReady || p.mana < CLASSES[p.classId].skill.cost,
            ),
            fight("guard", "🛡️ Défendre"),
          ),
        );
        components.push(
          row(
            fight(
              "potion",
              `🧪 Soin (${p.resources.potion ?? 0})`,
              2,
              !p.resources.potion,
            ),
            fight(
              "ether",
              `💧 Éther (${p.resources.ether ?? 0})`,
              2,
              !p.resources.ether,
            ),
            fight("flee", "🏃 Fuir", 4),
          ),
        );
      } else if (p.location === "base") {
        embed.title = "🏡 Tu es au refuge";
        embed.fields.push(
          field(
            "La cloche t’attend",
            "Choisis une région sur la carte pour prendre la route.",
          ),
        );
        components.push(
          row(btn("map", "🗺️ Prendre la route", 1), btn("base", "Refuge")),
        );
      } else {
        embed.fields.push(
          field("📖 Chronique", z.story),
          field(
            "🚩 Vers le gardien",
            `${Math.min(3, p.zoneWins[p.zone] ?? 0)}/3 victoires${(p.zoneWins[p.zone] ?? 0) >= 3 ? " · Le gardien t’attend au prochain pas." : ""}`,
          ),
        );
        components.push(
          row(
            btn("explore", "⚔️ Continuer · 5 énergie", 1, p.energy < 5),
            btn("returnHome", "🏡 Rentrer & sécuriser", 3),
          ),
        );
      }
      embed.fields.push(
        field(
          "🎒 Sac d’expédition · exposé",
          `${p.bag.gold} or · ${p.bag.gear.length} équipement(s)\n${resText(p.bag.resources)}`,
        ),
      );
      break;
    }
    case "base": {
      embed.title = `🏡 Le refuge de ${p.name}`;
      embed.color = COLORS.green;
      embed.fields = [
        ...vitals(),
        field("🪙 Coffre", `${p.gold} or · ${resText(p.resources)}`),
      ];
      p.buildings.forEach((b, i) =>
        embed.fields.push(
          field(
            `Emplacement ${i + 1}`,
            b
              ? `**${BUILDINGS[b.type].name} · niv. ${b.level}/5**\n${BUILDINGS[b.type].description}\n${b.level < 5 ? `Prochain niveau : ${costText(buildingCost(b.level + 1))}` : "Niveau maximal"}`
              : "Terrain libre · /base construire",
          ),
        ),
      );
      embed.fields.push(
        field(
          `${RACES[p.raceId].emoji} Héritage de ton peuple`,
          `${BUILDINGS[RACES[p.raceId].building].name} : ${BUILDINGS[RACES[p.raceId].building].description}`,
        ),
      );
      const restCost = Math.ceil(
        (8 + p.level * 3) *
          (p.buildings.some((b) => b?.type === "infirmerie") ? 0.5 : 1),
      );
      embed.fields.push(
        field(
          "Gestion",
          "Construire, améliorer ou démolir : /base\nÀ la base : récupération passive de PV et mana. Production plafonnée à 12 h entre collectes.",
        ),
      );
      components.push(
        row(
          btn("collect", "📦 Récolter", 3),
          btn("rest", `💤 Repos · ${restCost} or`),
          btn("codex", "Plans des bâtiments", 2, false, "batiments", 1),
        ),
      );
      navigation();
      break;
    }
    case "inventory": {
      const pages = Math.max(1, Math.ceil(p.gear.length / 6));
      const page = Math.max(1, Math.min(pages, result.page ?? 1));
      embed.title = `🎒 Le coffre de ${p.name}`;
      embed.fields = [
        field("Provisions et matériaux", resText(p.resources)),
        field(
          "Équipements",
          `${p.gear.length}/100 · page ${page}/${pages}\nÉquipe avec /equiper, recycle avec /atelier recycler, vends avec /marche vendre-objet.`,
        ),
      ];
      for (const item of p.gear.slice((page - 1) * 6, page * 6))
        embed.fields.push(
          field(
            `${Object.values(p.equipment).includes(item.id) ? "◆ " : ""}${gearLabel(item)}`,
            `Niv. ${item.level} · ${{ weapon: "Arme", armor: "Armure", charm: "Talisman" }[item.slot]} · ${statText(item.stats)}\nID : ${T}${item.id}${T}`,
          ),
        );
      if (pages > 1)
        components.push(
          row(
            btn("inventory", "←", 2, page === 1, page - 1),
            btn("inventory", "→", 2, page === pages, page + 1),
          ),
        );
      navigation();
      break;
    }
    case "quests":
      embed.title = "📜 Les contrats du jour";
      embed.description = `${message ? `${message}\n\n` : ""}Date UTC : ${p.quests.day}. Récompenses à réclamer avant minuit UTC.`;
      embed.fields = DAILY_QUESTS.map((q) =>
        field(
          `${p.quests.claimed.includes(q.id) ? "✅" : "📌"} ${q.name}`,
          `${Math.min(q.target, p.quests[q.id])}/${q.target} · ${q.gold} or et ${q.xp} XP`,
        ),
      );
      components.push(
        row(
          ...DAILY_QUESTS.map((q) =>
            btn(
              "claimQuest",
              q.name,
              3,
              p.quests[q.id] < q.target || p.quests.claimed.includes(q.id),
              q.id,
            ),
          ),
        ),
      );
      break;
    case "market": {
      embed.title = "⚖️ La Halle des routes";
      embed.description = `Marché global · **${p.gold} or** au coffre\nPrix du lot entier · commission vendeur : 5 %\nPage ${result.page}/${result.pages}${result.mine ? " · Tes annonces" : ""}${result.resource ? ` · ${RESOURCES[result.resource]}` : ""}`;
      for (const l of result.listings) {
        embed.fields.push(
          field(
            `${l.item ? gearLabel(l.item) : `${l.quantity} × ${RESOURCES[l.resource]}`} · ${l.price} or`,
            `${l.item ? `Niv. ${l.item.level} · ${statText(l.item.stats)}\n` : ""}Vendeur : ${l.sellerName} · ID : ${T}${l.id}${T}\nExpire <t:${Math.floor(l.expiresAt / 1000)}:R>`,
          ),
        );
      }
      if (!result.listings.length)
        embed.fields.push(
          field(
            "Les étals attendent vos trouvailles",
            "Publie ta première annonce avec /marche vendre-ressource ou /marche vendre-objet.",
          ),
        );
      if (result.listings.length)
        components.push(
          row(
            ...result.listings.map((l, i) =>
              btn(
                l.sellerId === viewerId ? "cancelListing" : "buy",
                `${l.sellerId === viewerId ? "Retirer" : "Acheter"} ${i + 1} · ${l.price} or`,
                l.sellerId === viewerId ? 2 : 3,
                false,
                l.id,
              ),
            ),
          ),
        );
      components.push(
        row(
          btn(
            "market",
            "←",
            2,
            result.page === 1,
            result.page - 1,
            result.mine ? 1 : 0,
            result.resource ?? "",
          ),
          btn(
            "market",
            "→",
            2,
            result.page === result.pages,
            result.page + 1,
            result.mine ? 1 : 0,
            result.resource ?? "",
          ),
          btn(
            "market",
            result.mine ? "Tout le marché" : "Mes annonces",
            2,
            false,
            1,
            result.mine ? 0 : 1,
          ),
        ),
      );
      break;
    }
    case "guild": {
      const g = result.guild;
      embed.title = g ? `🏰 ${g.name}` : "🏰 Les guildes de Brumeterre";
      embed.color = COLORS.purple;
      if (g)
        embed.fields = [
          field(
            "Bannière",
            `Code : ${T}${g.id}${T} · ${g.members.length}/30 membres\nChef : <@${g.leaderId}>`,
          ),
          field(
            "Trésor commun",
            `${g.gold} or · niveau ${g.level}/10\nBonus de campagne : +${g.level * 2} % XP\nAmélioration : ${g.level * 500} or`,
          ),
          field(
            "Compagnons",
            result.members?.length
              ? result.members
                  .map((m) => `${m.name} · niv. ${m.level}`)
                  .join("\n")
              : `${g.members.length} membre(s) · /guilde voir`,
          ),
          field(
            "Vie de guilde",
            "/guilde rejoindre, donner, ameliorer, quitter\nLes dons financent les améliorations, sans retrait individuel.",
          ),
        ];
      else
        embed.fields = [
          field(
            "Recrutement ouvert",
            result.guilds
              ?.map(
                (g) =>
                  `**${g.name}** · niv. ${g.level} · ${g.members.length}/30 · ${T}${g.id}${T}`,
              )
              .join("\n") || "Aucune guilde pour le moment.",
          ),
          field(
            "Une bannière à partager",
            "/guilde creer nom:… coûte 200 or.\n/guilde rejoindre code:… pour retrouver tes amis.",
          ),
        ];
      break;
    }
    case "party": {
      const party = result.party;
      embed.title = "🕯️ La table des aventuriers";
      if (party)
        embed.fields = [
          field(
            "Votre cible",
            `${RAIDS[party.raidId].name} · niv. ${RAIDS[party.raidId].level}\n${RAIDS[party.raidId].story}`,
          ),
          field(
            "Rassemblement",
            `Code : ${T}${party.id}${T} · ${party.members.length}/4 joueurs\nChef : <@${party.leaderId}>\n${result.members?.map((m) => `${m.name} · niv. ${m.level}`).join("\n") || "/groupe voir pour la liste"}`,
          ),
          field(
            "Avant de lancer /raid",
            "2–4 joueurs à la base · au moins 50 % des PV\n20 énergie par personne · délai de 24 h entre tentatives\nRejoindre autorise le chef à lancer le raid. /groupe quitter pour se retirer.",
          ),
        ];
      else
        embed.fields = [
          field(
            "Rassemble tes amis",
            "/groupe creer raid:…\n/groupe rejoindre code:…\nLe groupe persiste après le raid et les redémarrages.",
          ),
        ];
      break;
    }
    case "raid":
      embed.title = `${result.won ? "🏆" : "💀"} ${result.boss.name}`;
      embed.color = result.won ? COLORS.green : COLORS.red;
      embed.fields = [
        field(
          "Le récit de la bataille",
          `${result.turns} tours\n${result.fighters.map((f) => `**${f.name}** · ${f.damage} dégâts · ${f.healing} soins · ${f.hp > 0 ? `${f.hp} PV` : "à terre"}`).join("\n")}`,
        ),
      ];
      break;
    case "leaderboard":
      embed.title = "🏆 Les héros de Brumeterre";
      embed.description = result.leaders
        .map(
          (v, i) =>
            `**${i + 1}. ${v.name}** · ${CLASSES[v.classId].emoji} niv. ${v.level}\n${v.bosses.length}/12 gardiens · ${v.kills} victoires · ${v.raids} raids`,
        )
        .join("\n\n");
      break;
    default:
      if (p && !readOnly) navigation();
  }
  // Les profils d’un autre compte n’exposent aucune commande de modification.
  return {
    embeds: [embed],
    components: readOnly ? [] : components,
    allowedMentions: { parse: [] },
  };
}
