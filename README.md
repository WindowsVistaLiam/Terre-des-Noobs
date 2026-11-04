# Terre des Noobs — Manga Club

Un **gacha Discord social en français**, inspiré du principe de collection de Kyara : ouvrir des boosters, découvrir des personnages de manga, compléter des albums et échanger ses doublons. Les menus, cartes et résultats sont dessinés en **Canvas**, avec les contrôles natifs de Discord. Aucun service d’IA n’est utilisé en jeu.

**Catalogue embarqué : 4 978 personnages, 1 471 univers et 4 978 portraits**, importés depuis les données publiques AniList. One Piece, Naruto, Dragon Ball, Bleach, Jujutsu Kaisen, Demon Slayer, Hunter × Hunter, Berserk, Frieren… Ce catalogue est large, mais ne prétend pas contenir tous les personnages de tous les mangas existants. Il fonctionne sans accès à Kyara ni à une API externe au démarrage ou pendant les tirages.

## Jouer

| Commande | Accès |
| --- | --- |
| `/profil` | Vitrine, favoris, quotidien, boosters, personnalisation |
| `/profil joueur:@ami` | Profil public d’un autre collectionneur |
| `/gacha` | Boosters gratuits ou obtenus contre des éclats |
| `/collection` | Cartes, doublons, filtres, recherche, vente et échanges |
| `/marché` | Annonces, achats, mes ventes, recherche et souhaits |
| `/social` | Amis, demandes, propositions d’échange et blocages |
| `/info` | Règles et taux ; navigation vers albums, missions et classement |

Une seule commande suffit : le menu **Explorer le Manga Club…** relie toutes les rubriques. Les boutons restent réservés aux ouvertures, confirmations et pages. Aucune commande par carte et aucun identifiant à recopier pour jouer ou échanger.

Les profils, le marché, le guide et **les résultats d’ouverture** sont publics. Collection, demandes, confirmations et gestion du profil restent privés. Un contrôle sur une image publique ouvre un panneau personnel ; il ne remplace pas le message partagé. Chaque réponse mentionne uniquement son auteur, sans autoriser `@everyone` ni les rôles. Les portraits personnalisés, ou la première favorite à défaut, servent de repère en haut à droite.

## Boosters et progression

- Départ : **300 éclats, 10 boosters rechargeables et 5 boosters de bienvenue**.
- **1 booster gratuit toutes les 10 minutes**, jusqu’à **10** en réserve rechargeable. Les boosters offerts sont stockés séparément, sans expiration. Les rechargeables sont utilisés en premier ; le temps passé au plafond ne crée pas de recharge cachée.
- **5 cartes par booster**, ouverture par 1 ou par 5. Chaque carte possède une rareté fixe, une puissance et une aura de collection. Il n’y a plus de combat RPG.
- **Animations de tirage** : mythique rose/violette avec orbites et particules ; légendaire dorée avec rayons et couronne. Le GIF Canvas se joue une fois (environ quatre secondes), conserve toutes les cartes visibles et se termine sur le résultat complet. Si les deux raretés tombent ensemble, le légendaire donne l’ambiance principale ; les hauts rangs gardent leur couleur. L’animation s’applique aussi aux doublons. La lecture dépend des préférences d’animation du client Discord.
- **Mix multivers**, **sélection du jour**, et **boosters par univers** : la liste propose les principaux univers, et chaque album d’au moins six personnages donne accès à son propre booster. Les deux monnaies d’ouverture fonctionnent pour chacun.
- Booster contre **150 éclats**, avec confirmation. Les éclats se gagnent uniquement en jouant : quotidien, missions, albums, recyclage et marché. Aucun paiement réel.
- Quotidien : **3 boosters et 100 éclats**, plus 10 éclats par jour consécutif supplémentaire, plafonné à 160. Renouvellement à **minuit UTC** (01 h en hiver / 02 h en été en France).
- Missions quotidiennes et objectifs permanents à réclamer dans les menus ; album complété d’au moins six personnages : **250 éclats et 2 boosters**, une seule fois par univers.
- Les **découvertes** restent dans l’album après une vente ou un échange. Le classement porte sur les personnages découverts ; l’inventaire représente les copies réellement détenues.

| Rareté | Taux de base par carte | Recyclage / copie |
| --- | ---: | ---: |
| Commune | 50 % | 2 éclats |
| Peu commune | 28 % | 5 éclats |
| Rare | 15 % | 12 éclats |
| Épique | 5 % | 35 éclats |
| Mythique | 1,7 % | 120 éclats |
| Légendaire | 0,3 % | 500 éclats |

La **cinquième carte** est toujours **rare ou mieux** : ses taux sont renormalisés sur ces rangs. Après 19 boosters sans épique, le 20e garantit une épique ou mieux ; après 99 sans mythique, le 100e garantit une mythique ou mieux. Les deux compteurs se réinitialisent dès qu’une carte du rang concerné ou supérieur apparaît, et sont partagés entre les boosters. Un petit univers peut ne pas comporter toutes les raretés : les rangs absents sont retirés du tirage et ses taux propres sont affichés avant ouverture. Une garantie utilise le meilleur rang présent si le rang attendu est absent.

Les raretés, puissance et aura sont des choix d’équilibrage du jeu : elles ne constituent pas un classement officiel des personnages.

## Collection et social

Depuis une carte : favoris, souhaits, fiche AniList après découverte, album, vente, recyclage ou échange. **La dernière copie d’une favorite est protégée** contre les ventes, échanges et recyclages. Le recyclage groupé ne prend que les doublons communs, peu communs ou rares, et conserve toujours une copie. Les rangs supérieurs se recyclent individuellement, après confirmation.

Un échange se propose en choisissant sa carte, un joueur Discord, puis une carte dans sa collection. L’offre est réservée pendant **24 heures** ; le destinataire la consulte dans **Social**, puis accepte ou refuse après vérification. Les transferts sont simultanés. Refus, annulation et expiration restituent les cartes offertes. Il n’y a ni DM automatique ni transfert sans consentement.

Marché global : lots entiers, prix par carte affiché avec total, **commission vendeur de 5 % arrondie au supérieur**, **10 annonces actives** par joueur, expiration après **7 jours**, annulation et restitution des invendus. Les cartes en vente sont réservées et ne peuvent plus servir ailleurs. Le blocage coupe la consultation des profils et les nouvelles transactions entre les deux joueurs ; il n’empêche pas d’annuler une offre en cours.

Nom et description personnalisables ; import direct d’un portrait et d’une bannière depuis les formulaires Discord (PNG/JPG/WebP fixes, 5 Mo maximum). Les images normalisées sont conservées en PostgreSQL. Le téléchargement est limité aux pièces jointes Discord, borné en taille et durée, sans redirection.

## Tester et héberger

Node.js **22.12+**, recommandé **24**. Dépendances verrouillées par `package-lock.json`.

```powershell
npm.cmd ci
npm.cmd start
```

Variables `.env` locales ou Railway :

```dotenv
DISCORD_TOKEN=TOKEN_DU_BOT
DISCORD_CLIENT_ID=APPLICATION_ID
DISCORD_GUILD_ID=SERVEUR_PRINCIPAL
DATABASE_URL=URL_POSTGRESQL
DEMO_MODE=false
REGISTER_COMMANDS=true
PORT=3000
```

`DEMO_MODE=true` permet un essai local sans PostgreSQL, mais **toutes les collections de démo sont perdues au redémarrage**. Ce mode est interdit sur Railway/en production. Ne publie jamais le `.env`.

Railway : le Dockerfile et `railway.json` existants restent utilisés. **Aucune nouvelle variable, API ou volume n’est nécessaire.** La base PostgreSQL existante convient. Le démarrage enregistre automatiquement les **7 commandes** si `REGISTER_COMMANDS=true`. Le service doit suivre `main`, avec les déploiements automatiques activés. Voir [le guide Railway](docs/RAILWAY.md).

`/admin-reset joueur:@ami` reste réservé aux **administrateurs du serveur principal** `DISCORD_GUILD_ID`, avec confirmation de cinq minutes et vérification des permissions au clic final. Il efface seulement la collection gacha du joueur, retire ses ventes, ferme ses échanges en rendant leurs cartes aux autres joueurs et nettoie ses amitiés et images. La génération du profil empêche une ancienne confirmation de supprimer un profil recréé. Une trace d’administration est enregistrée.

## Passage du RPG au gacha

Le point d’entrée utilise désormais exclusivement `GachaGame` et ses interactions. **Les anciens boutons RPG sont refusés** avec une invitation à ouvrir `/profil`. Les anciens documents `player`, guildes et inventaires restent conservés dans la base : aucune progression RPG n’est effacée et aucun or RPG n’est converti. À la première visite uniquement, le nom, la description, le portrait et la bannière peuvent être repris ; les données gacha vivent dans des documents `gacha_*` distincts.

Le moteur RPG, ses commandes, ses illustrations, ses tests et ses anciens tutoriels ont été retirés du dépôt. Seul le gacha et son infrastructure restent dans cette version ; les anciennes révisions restent accessibles dans l’historique Git.

## Vérifier les changements

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run preview:gacha
npm.cmd run preview:animations
```

Les aperçus locaux sont écrits dans `.local/gacha-previews/` ; les deux GIFs et leurs images de contrôle dans `.local/gacha-animations/`. Pour les tests de persistance et de concurrence PostgreSQL, définir **une base de test** dans `TEST_DATABASE_URL` ; chaque test crée puis supprime son propre schéma isolé. Ne pas utiliser la base Railway de production comme banc de test.

La CI exécute les tests avec PostgreSQL et vérifie les rendus Canvas dans l’image Docker de production, sans connexion à Discord. [Aperçus et annonce](docs/GACHA.md).

## Catalogue et ressources

Le catalogue est versionné avec les atlas WebP dans `src/assets/gacha/` (environ 36 Mo). Au maximum douze atlas sont gardés dans le cache de rendu. Pas de récupération de portraits à la demande et pas de clé API nécessaire.

`npm run catalog:import` reconstruit le catalogue depuis l’API publique AniList et conserve les identifiants et raretés existants. Il utilise un cache de développement dans `.local/gacha-import/`, respecte les réponses de limitation de débit et normalise les portraits en 160 × 220. L’import de construction ne s’exécute **jamais** au démarrage Railway. Les noms et portraits proviennent d’AniList ; chaque carte possède sa source. Les illustrations restent celles de leurs ayants droit ; aucun asset ni compte privé de Kyara n’est importé. Détails dans [GACHA.md](docs/GACHA.md).
