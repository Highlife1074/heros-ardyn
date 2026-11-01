# Héros d'Ardyn — jeu de rôle familial avec un Maître du Jeu IA

Même format que mes autres apps : **GitHub Pages** pour le site, **Firebase** (Authentication + Firestore) pour les comptes et les données, **clé Claude** saisie dans l'app.

## Contenu
- Comptes, campagnes avec code d'invitation, un héros par joueur.
- Création de personnage complète (SRD 5.2, compatible Héros & Dragons), fiche vivante, progression 1 → 20.
- Maître du Jeu Claude : narration en français, jets demandés avec DD secret, combats, XP, trésors, repos, quêtes, mémoire de campagne.
- **Le monde en bref** : résumé public d'Ardyn (`data/ardyn-public.md`, sans secrets), lisible par tous à la création du héros et dans le journal ; l'hôte peut le réécrire (🗺️ → Résumé joueurs).
- **Carnet des héros** : le MJ y inscrit les personnages rencontrés et les lieux découverts (éléments de la bible ou inventions). L'hôte choisit ensuite, dans 🗺️ → Versions, quels ajouts intégrer à la bible (ajout simple sans clé, ou réécriture par Claude).
- Monde vivant (🗺️) : cadre fixé par l'hôte (Lancedragon / Seigneur des Anneaux / Game of Thrones, magie rare, interdits, classes et peuples jouables), ajouts du MJ à relire, Bible vN téléchargeable, codex des joueurs.
- Dés 3D ; chaque jet est enregistré immédiatement dans Firestore et visible de toute la table (impossible de relancer en douce).
- Écran de table (📺) avec voix du MJ.

## Fichiers
```
index.html, css/, js/          l'app (aucune compilation)
js/firebase-config.js          ← la configuration Firebase à coller
js/server/                     logique de jeu (règles, dés, MJ, monde), exécutée dans le navigateur
data/                          règles SRD 5.2, bestiaire, bible d'Ardyn
firestore.rules                règles de sécurité à coller dans la console Firebase
tests/                         tests automatiques (facultatif : cd tests && node run.js)
```

## Mise en route
1. Firebase : Authentication → E-mail/Mot de passe ; Firestore → créer ; Firestore → Règles → coller `firestore.rules` → Publier ; Authentication → Paramètres → Domaines autorisés → ajouter `highlife1074.github.io`.
2. Coller la configuration web Firebase dans `js/firebase-config.js`.
3. GitHub : dépôt `heros-ardyn`, envoyer les fichiers, Settings → Pages → branche `main`, dossier `/ (root)`.
4. Ouvrir `https://highlife1074.github.io/heros-ardyn/`, créer un compte, une campagne, puis ⚙️ → coller la clé Claude (la même qu'EduSmart).

La clé Claude est stockée dans la campagne et lisible par les membres de la table, comme dans EduSmart.

## Licences
Règles : SRD 5.2 (CC-BY-4.0, données 5e-bits/5e-database). Dés 3D : @3d-dice/dice-box-threejs (MIT). Univers d'Ardyn : © son auteur.


## MJ externe : jouer avec l'abonnement Claude (sans crédit API)

Dans ⚙️ de la campagne, règle **MJ externe** sur « Oui ». L'app n'appelle plus l'API : quand un joueur appuie sur « Au MJ », elle affiche
« Le Maître du Jeu arrive… ». Claude Code (sur ton ordinateur, avec ton abonnement) joue alors le MJ avec `tools/mj.mjs`.

Installation (une seule fois) :

    git clone https://github.com/Highlife1074/heros-ardyn.git
    cd heros-ardyn/tools && npm install && cd ..
    export MJ_EMAIL="ton-email-de-l-app"
    export MJ_PASSWORD="ton-mot-de-passe-de-l-app"

Lancer une séance : dans le dossier `heros-ardyn`, ouvre Claude Code (`claude`) et écris :
« Lis tools/CLAUDE.md et joue le MJ de ma campagne ».
