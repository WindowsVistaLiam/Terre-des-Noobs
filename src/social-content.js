export const RACE_COLORS = {
  humain: "#d6b56a",
  haut_elfe: "#9fc9ee",
  elfe_sylvain: "#96cf8f",
  elfe_sombre: "#c59ee9",
  nain: "#e3a56d",
  nain_cendre: "#db8c7a",
  demi_dragon: "#e58a6a",
  orc: "#b2c783",
  demi_orc: "#b5bd91",
  halfelin: "#e0ce77",
  gnome: "#94d2ce",
  infernal: "#e9979d",
  celeste: "#eee0ae",
  homme_bete: "#d7b78c",
  revenant: "#a6c7d6",
  homme_lezard: "#8dcca8",
};
export const CITY_UPGRADES = {
  remparts: {
    name: "Remparts",
    description:
      "+100 intégrité et +60 défense de siège par niveau ; renforce les sorties de bastion.",
    resources: { bois: 25, pierre: 40, fer: 10 },
  },
  caserne: {
    name: "Caserne de la cité",
    description:
      "+90 puissance de siège par niveau ; renforce les sorties d’assaut.",
    resources: { bois: 40, pierre: 20, fer: 15 },
  },
  infirmerie: {
    name: "Hospice",
    description:
      "+10 intégrité réparée par heure et sorties de soutien renforcées.",
    resources: { bois: 30, pierre: 25, herbe: 20 },
  },
  phare: {
    name: "Phare de veille",
    description:
      "+30 défense de siège par niveau et +8 à toutes les sorties contre les invasions.",
    resources: { pierre: 30, fer: 15, essence: 5 },
  },
};
export const cityUpgradeCost = (type, level) => ({
  gold: 150 * level * level,
  resources: Object.fromEntries(
    Object.entries(CITY_UPGRADES[type].resources).map(([k, v]) => [
      k,
      v * level,
    ]),
  ),
});
export const INVASIONS = [
  "Les Pillards de la Brume",
  "La Meute des Cendres",
  "Les Revenants du Fossé",
];
export const DEFENSE_ROLES = {
  assault: "Assaut",
  bastion: "Bastion",
  support: "Soutien",
};
export const FRIEND_LIMIT = 100;
export const SOCIAL_TYPES = new Set([
  "social",
  "friends",
  "blocked",
  "inbox",
  "request",
  "directory",
  "playerCard",
  "duels",
  "duel",
  "pvpLeaderboard",
  "city",
  "cityUpgrade",
  "cityDefensePlan",
  "cityTargets",
  "siegePreview",
  "siege",
  "guild",
  "guildPreview",
  "guilds",
  "guildRoster",
  "guildMember",
  "party",
  "partyPreview",
  "parties",
  "raidPreview",
  "raid",
  "giftOptions",
]);
