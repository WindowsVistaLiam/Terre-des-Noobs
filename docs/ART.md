# Direction graphique et ressources

Les interfaces s’inspirent de l’ambiance de fantasy sombre demandée : pierre noire, laiton patiné, dorures discrètes, brume verte, lumière chaude et textes de grimoire. Les références indiquées étaient Baldur’s Gate 3 et Total War: Warhammer III. Aucun logo, personnage, capture ou élément de ces jeux n’est livré avec le bot.

Le projet local `fairy-slayer-v1` a servi de référence technique pour les pièces jointes Canvas et l’emploi de polices embarquées. Le moteur de rendu de Brumeterre est écrit pour ce projet : mise en page mesurée, retours à la ligne, cartes, jauges et descriptions alternatives.

## Fichiers embarqués

- `src/assets/brumeterre.png` : panorama original du Profil, conservé intact.
- `src/assets/social.png` : salle de guilde autour d’une table, pour les menus sociaux.
- `src/assets/market.png` : rue marchande aux lanternes, pour le commerce, le coffre et l’atelier.
- `src/assets/info.png` : bibliothèque ancienne, pour le codex.
- `src/assets/portraits/atlas-0.webp` à `atlas-3.webp` : 51 portraits de bestiaire et un portrait d’aventurier par défaut. Les trois premières planches contiennent 16 portraits chacune, la dernière les trois boss de raid et le personnage par défaut. Les atlas sont carrés, en WebP de 1024 pixels. Le mapping est dans `src/portraits.js`.
- Ces quatre illustrations originales sont générées à la conception avec ImageGen. Aucun appel d’IA pendant les parties. Les races réutilisent la bibliothèque avec 16 couleurs de texte distinctes, sans image supplémentaire.
- `src/assets/fonts/Cinzel-Regular.ttf` : Cinzel, pour les titres ; licence SIL Open Font License, fournie dans `OFL-Cinzel.txt`.
- `src/assets/fonts/Lato-Regular.ttf` : Lato, pour le texte courant ; licence SIL Open Font License, fournie dans `OFL-Lato.txt`.

Les polices sont enregistrées explicitement dans Canvas, ce qui rend les images identiques sur Windows et dans le conteneur Linux. Les émojis natifs restent dans les boutons et sélections Discord ; ils sont retirés du texte des images pour ne pas dépendre des polices système.

## Prévisualiser

`npm run preview` crée 24 exemples avec des personnages fictifs dans `.local/previews/`, dont le menu de personnalisation, un profil avec portrait/bannière et un combat avec deux portraits. Les personnages de démonstration et ces images ne sont pas des sauvegardes de joueurs.

Le rendu utilise une largeur de 1280 pixels et une hauteur calculée selon le texte. Chaque ligne est mesurée avant dessin ; même un nom sans espaces revient à la ligne. Les pièces jointes sont en PNG, avec une description alternative allant jusqu’à 1024 caractères. Discord affiche l’image et les contrôles natifs en dessous. Les formulaires sont les fenêtres natives de Discord.

Les captures dans `docs/images` proviennent de ce même moteur de rendu.

Les portraits de bestiaire ont été créés avec l’outil ImageGen intégré, puis réduits en atlas WebP avec Canvas. Les prompts et l’ordre des sujets figurent dans [portraits-prompts.json](portraits-prompts.json). Aucun appel à ImageGen n’a lieu en jeu. Les photos des joueurs sont leurs propres fichiers importés via Discord ; elles ne sont pas envoyées à un générateur d’images.
