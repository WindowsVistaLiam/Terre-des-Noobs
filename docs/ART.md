# Direction graphique et ressources

Les interfaces s’inspirent de l’ambiance de fantasy sombre demandée : pierre noire, laiton patiné, dorures discrètes, brume verte, lumière chaude et textes de grimoire. Les références indiquées étaient Baldur’s Gate 3 et Total War: Warhammer III. Aucun logo, personnage, capture ou élément de ces jeux n’est livré avec le bot.

Le projet local `fairy-slayer-v1` a servi de référence technique pour les pièces jointes Canvas et l’emploi de polices embarquées. Le moteur de rendu de Brumeterre est écrit pour ce projet : mise en page mesurée, retours à la ligne, cartes, jauges et descriptions alternatives.

## Fichiers embarqués

- `src/assets/brumeterre.png` : panorama original généré pour ce projet avec ImageGen. Une seule illustration est créée à la conception ; aucun appel d’IA pendant les parties.
- `src/assets/fonts/Cinzel-Regular.ttf` : Cinzel, pour les titres ; licence SIL Open Font License, fournie dans `OFL-Cinzel.txt`.
- `src/assets/fonts/Lato-Regular.ttf` : Lato, pour le texte courant ; licence SIL Open Font License, fournie dans `OFL-Lato.txt`.

Les polices sont enregistrées explicitement dans Canvas, ce qui rend les images identiques sur Windows et dans le conteneur Linux. Les émojis natifs restent dans les boutons et sélections Discord ; ils sont retirés du texte des images pour ne pas dépendre des polices système.

## Prévisualiser

`npm run preview` crée douze exemples avec des personnages fictifs dans `.local/previews/`. Les personnages de démonstration et ces images ne sont pas des sauvegardes de joueurs.

Le rendu utilise une largeur de 1280 pixels et une hauteur calculée selon le texte. Chaque ligne est mesurée avant dessin ; même un nom sans espaces revient à la ligne. Les pièces jointes sont en PNG, avec une description alternative allant jusqu’à 1024 caractères. Discord affiche l’image et les contrôles natifs en dessous. Les formulaires sont les fenêtres natives de Discord.

Les captures dans `docs/images` proviennent de ce même moteur de rendu.
