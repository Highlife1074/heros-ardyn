# Traductions françaises : lignées et traits d'espèce (SRD 5.2).
SUBSPECIES = {
    "draconic-ancestor-black": "Ascendance draconique : Noir",
    "draconic-ancestor-blue": "Ascendance draconique : Bleu",
    "draconic-ancestor-brass": "Ascendance draconique : Airain",
    "draconic-ancestor-bronze": "Ascendance draconique : Bronze",
    "draconic-ancestor-copper": "Ascendance draconique : Cuivre",
    "draconic-ancestor-gold": "Ascendance draconique : Or",
    "draconic-ancestor-green": "Ascendance draconique : Vert",
    "draconic-ancestor-red": "Ascendance draconique : Rouge",
    "draconic-ancestor-silver": "Ascendance draconique : Argent",
    "draconic-ancestor-white": "Ascendance draconique : Blanc",
    "elven-lineage-drow": "Lignée elfique : Drow",
    "elven-lineage-high-elf": "Lignée elfique : Haut-elfe",
    "elven-lineage-wood-elf": "Lignée elfique : Elfe des bois",
    "gnomish-lineage-forest-gnome": "Lignée gnome : Gnome des forêts",
    "gnomish-lineage-rock-gnome": "Lignée gnome : Gnome des roches",
    "giant-ancestry-clouds-jaunt": "Ascendance géante : Saut des nuages",
    "giant-ancestry-fires-burn": "Ascendance géante : Brûlure du feu",
    "giant-ancestry-frosts-chill": "Ascendance géante : Morsure du givre",
    "giant-ancestry-hills-tumble": "Ascendance géante : Culbute des collines",
    "giant-ancestry-stones-endurance": "Ascendance géante : Endurance de la pierre",
    "giant-ancestry-storms-thunder": "Ascendance géante : Tonnerre de la tempête",
    "fiendish-legacy-abyssal": "Héritage fiélon : Abyssal",
    "fiendish-legacy-chthonic": "Héritage fiélon : Chthonien",
    "fiendish-legacy-infernal": "Héritage fiélon : Infernal",
}

_BREATH = ("Quand vous effectuez l'action Attaque à votre tour, vous pouvez remplacer l'une de vos attaques par une expiration d'énergie magique, "
           "en cône de 4,5 m ou en ligne de 9 m de long sur 1,5 m de large (choisissez la forme à chaque fois). Chaque créature dans la zone fait un jet de "
           "sauvegarde de Dextérité (DD 8 + votre modificateur de Constitution + votre bonus de maîtrise). En cas d'échec, elle subit 1d10 dégâts {t} ; "
           "en cas de réussite, la moitié. Ces dégâts augmentent de 1d10 aux niveaux 5 (2d10), 11 (3d10) et 17 (4d10).\n"
           "Vous pouvez utiliser ce Souffle un nombre de fois égal à votre bonus de maîtrise, et récupérez toutes les utilisations après un repos long.")
_DRES = "Vous avez la résistance aux dégâts {t}, déterminée par votre trait Ascendance draconique."
_SPELL = "Vous connaissez le sort {s}."

TRAITS = {
    "adrenaline-rush": ("Poussée d'adrénaline", "Vous pouvez effectuer l'action Foncer par une action bonus. Vous gagnez alors des points de vie temporaires égaux à votre bonus de maîtrise.\nVous pouvez utiliser ce trait un nombre de fois égal à votre bonus de maîtrise, et récupérez toutes les utilisations après un repos court ou long."),
    "brave": ("Brave", "Vous avez l'avantage aux jets de sauvegarde pour éviter ou mettre fin à l'état Effrayé."),
    "draconic-breath-weapon-acid": ("Souffle : acide", _BREATH.format(t="d'acide")),
    "draconic-breath-weapon-cold": ("Souffle : froid", _BREATH.format(t="de froid")),
    "draconic-breath-weapon-fire": ("Souffle : feu", _BREATH.format(t="de feu")),
    "draconic-breath-weapon-lightning": ("Souffle : foudre", _BREATH.format(t="de foudre")),
    "draconic-breath-weapon-poison": ("Souffle : poison", _BREATH.format(t="de poison")),
    "draconic-damage-resistance-acid": ("Résistance : acide", _DRES.format(t="d'acide")),
    "draconic-damage-resistance-cold": ("Résistance : froid", _DRES.format(t="de froid")),
    "draconic-damage-resistance-fire": ("Résistance : feu", _DRES.format(t="de feu")),
    "draconic-damage-resistance-lightning": ("Résistance : foudre", _DRES.format(t="de foudre")),
    "draconic-damage-resistance-poison": ("Résistance : poison", _DRES.format(t="de poison")),
    "darkvision-60": ("Vision dans le noir (18 m)", "Vous voyez dans le noir jusqu'à 18 m (60 pieds)."),
    "darkvision-120": ("Vision dans le noir (36 m)", "Vous voyez dans le noir jusqu'à 36 m (120 pieds)."),
    "draconic-ancestry": ("Ascendance draconique", "Votre lignée descend d'un dragon. Choisissez le type de dragon : il détermine votre Souffle, votre Résistance aux dégâts et votre apparence.\n"
                          "Noir : acide · Bleu : foudre · Airain : feu · Bronze : foudre · Cuivre : acide · Vert : poison · Or : feu · Rouge : feu · Argent : froid · Blanc : froid"),
    "draconic-flight": ("Vol draconique", "À partir du niveau 5, par une action bonus, des ailes spectrales vous poussent dans le dos pour 10 minutes (ou jusqu'à ce que vous les rétractiez, ou que vous soyez Neutralisé). Vous avez alors une vitesse de vol égale à votre vitesse. Utilisable une fois par repos long."),
    "dwarven-resilience": ("Résilience naine", "Vous avez la résistance aux dégâts de poison, et l'avantage aux jets de sauvegarde pour éviter ou mettre fin à l'état Empoisonné."),
    "dwarven-toughness": ("Robustesse naine", "Votre maximum de points de vie augmente de 1, puis de 1 à chaque niveau gagné."),
    "elven-lineage": ("Lignée elfique", "Votre lignée vous accorde des capacités surnaturelles. Vous gagnez le bénéfice de niveau 1 de votre lignée, puis un sort aux niveaux 3 et 5. Ces sorts sont toujours préparés ; vous pouvez lancer chacun une fois sans emplacement par repos long, ou avec vos emplacements.\n"
                      "Drow — niv. 1 : vision dans le noir portée à 36 m et tour de magie Lumières dansantes ; niv. 3 : Lueurs féeriques ; niv. 5 : Ténèbres.\n"
                      "Haut-elfe — niv. 1 : tour de magie Prestidigitation (remplaçable par un autre tour de magicien après un repos long) ; niv. 3 : Détection de la magie ; niv. 5 : Foulée brumeuse.\n"
                      "Elfe des bois — niv. 1 : vitesse 10,5 m et tour de magie Druidisme ; niv. 3 : Grande foulée ; niv. 5 : Passage sans trace.\n"
                      "Caractéristique d'incantation : Intelligence, Sagesse ou Charisme (au choix)."),
    "fey-ancestry": ("Ascendance féerique", "Vous avez l'avantage aux jets de sauvegarde pour éviter ou mettre fin à l'état Charmé."),
    "fiendish-legacy": ("Héritage fiélon", "Un héritage d'outre-monde vous accorde des capacités surnaturelles : bénéfice de niveau 1, puis un sort aux niveaux 3 et 5 (toujours préparés, une fois sans emplacement par repos long).\n"
                        "Abyssal — niv. 1 : résistance au poison et tour de magie Aspersion de poison ; niv. 3 : Rayon empoisonné ; niv. 5 : Immobilisation de personne.\n"
                        "Chthonien — niv. 1 : résistance aux dégâts nécrotiques et tour de magie Contact glacial ; niv. 3 : Simulacre de vie ; niv. 5 : Rayon affaiblissant.\n"
                        "Infernal — niv. 1 : résistance au feu et tour de magie Trait de feu ; niv. 3 : Représailles infernales ; niv. 5 : Ténèbres.\n"
                        "Caractéristique d'incantation : Intelligence, Sagesse ou Charisme (au choix)."),
    "giant-ancestry": ("Ascendance géante", "Vous descendez des géants. Choisissez un bienfait, utilisable un nombre de fois égal à votre bonus de maîtrise par repos long :\n"
                       "Saut des nuages : téléportation de 9 m par une action bonus.\nBrûlure du feu : +1d10 dégâts de feu quand vous touchez.\n"
                       "Morsure du givre : +1d6 dégâts de froid et vitesse de la cible −3 m.\nCulbute des collines : la créature touchée (taille G ou moins) tombe À terre.\n"
                       "Endurance de la pierre : par une réaction, réduisez les dégâts subis de 1d12 + Constitution.\nTonnerre de la tempête : par une réaction, 1d8 dégâts de tonnerre à la créature qui vous blesse (à 18 m ou moins)."),
    "giant-ancestry-clouds-jaunt": ("Saut des nuages", "Par une action bonus, vous vous téléportez magiquement jusqu'à 9 m vers un espace inoccupé que vous voyez."),
    "giant-ancestry-fires-burn": ("Brûlure du feu", "Quand vous touchez une cible avec un jet d'attaque et lui infligez des dégâts, vous pouvez lui infliger 1d10 dégâts de feu supplémentaires."),
    "giant-ancestry-frosts-chill": ("Morsure du givre", "Quand vous touchez une cible avec un jet d'attaque et lui infligez des dégâts, vous pouvez lui infliger 1d6 dégâts de froid et réduire sa vitesse de 3 m jusqu'au début de votre prochain tour."),
    "giant-ancestry-hills-tumble": ("Culbute des collines", "Quand vous touchez une créature de taille G ou inférieure avec un jet d'attaque et lui infligez des dégâts, vous pouvez la faire tomber À terre."),
    "giant-ancestry-stones-endurance": ("Endurance de la pierre", "Quand vous subissez des dégâts, vous pouvez utiliser votre réaction pour lancer 1d12, ajouter votre modificateur de Constitution et réduire les dégâts d'autant."),
    "giant-ancestry-storms-thunder": ("Tonnerre de la tempête", "Quand une créature à 18 m ou moins vous inflige des dégâts, vous pouvez utiliser votre réaction pour lui infliger 1d8 dégâts de tonnerre."),
    "gnomish-cunning": ("Ruse gnome", "Vous avez l'avantage aux jets de sauvegarde d'Intelligence, de Sagesse et de Charisme."),
    "gnomish-lineage": ("Lignée gnome", "Votre lignée vous accorde des capacités surnaturelles (caractéristique d'incantation : Intelligence, Sagesse ou Charisme, au choix) :\n"
                        "Gnome des forêts : tour de magie Illusion mineure, et Communication avec les animaux toujours préparé, lançable sans emplacement un nombre de fois égal à votre bonus de maîtrise par repos long.\n"
                        "Gnome des roches : tours de magie Réparation et Prestidigitation. En 10 minutes, vous pouvez fabriquer un petit mécanisme (CA 5, 1 PV : jouet, briquet, boîte à musique…) qui reproduit un effet de Prestidigitation quand on l'active d'une action bonus. Trois au maximum ; chacun se défait après 8 heures."),
    "gnomish-lineage-forest-gnome": ("Gnome des forêts", "Vous avez toujours le sort Communication avec les animaux préparé. Vous pouvez le lancer sans emplacement un nombre de fois égal à votre bonus de maîtrise, et récupérez ces utilisations après un repos long."),
    "gnomish-lineage-rock-gnome": ("Gnome des roches", "Vous connaissez le tour de magie Prestidigitation. En 10 minutes, vous pouvez fabriquer un petit mécanisme (CA 5, 1 PV : jouet, briquet, boîte à musique…) qui reproduit un effet de Prestidigitation quand on l'active par une action bonus. Vous pouvez en avoir trois à la fois ; chacun se défait après 8 heures ou quand vous le démontez."),
    "halfling-nimbleness": ("Agilité halfeline", "Vous pouvez traverser l'espace de toute créature plus grande que vous d'au moins une taille, sans pouvoir vous y arrêter."),
    "high-elf-cantrip-versatility": ("Haut-elfe : tour de magie", "Vous connaissez le tour de magie Prestidigitation. Après chaque repos long, vous pouvez le remplacer par un autre tour de magie de la liste du magicien."),
    "keen-senses": ("Sens aiguisés", "Vous maîtrisez la compétence Perspicacité, Perception ou Survie (au choix)."),
    "large-form": ("Forme imposante", "À partir du niveau 5, par une action bonus, vous pouvez passer à la taille G pendant 10 minutes (si l'espace le permet). Vous avez alors l'avantage aux tests de Force et votre vitesse augmente de 3 m. Une fois par repos long."),
    "lineage-resistance-fire": ("Résistance : feu", "Vous avez la résistance aux dégâts de feu."),
    "lineage-resistance-necrotic": ("Résistance : nécrotique", "Vous avez la résistance aux dégâts nécrotiques."),
    "lineage-resistance-poison": ("Résistance : poison", "Vous avez la résistance aux dégâts de poison."),
    "lineage-spell-chill-touch": ("Contact glacial", _SPELL.format(s="Contact glacial")),
    "lineage-spell-dancing-lights": ("Lumières dansantes", _SPELL.format(s="Lumières dansantes")),
    "lineage-spell-darkness": ("Ténèbres", _SPELL.format(s="Ténèbres")),
    "lineage-spell-detect-magic": ("Détection de la magie", _SPELL.format(s="Détection de la magie")),
    "lineage-spell-faerie-fire": ("Lueurs féeriques", _SPELL.format(s="Lueurs féeriques")),
    "lineage-spell-false-life": ("Simulacre de vie", _SPELL.format(s="Simulacre de vie")),
    "lineage-spell-fire-bolt": ("Trait de feu", _SPELL.format(s="Trait de feu")),
    "lineage-spell-hellish-rebuke": ("Représailles infernales", _SPELL.format(s="Représailles infernales")),
    "lineage-spell-hold-person": ("Immobilisation de personne", _SPELL.format(s="Immobilisation de personne")),
    "lineage-spell-longstrider": ("Grande foulée", _SPELL.format(s="Grande foulée")),
    "lineage-spell-mending": ("Réparation", "Vous connaissez le tour de magie Réparation."),
    "lineage-spell-minor-illusion": ("Illusion mineure", _SPELL.format(s="Illusion mineure")),
    "lineage-spell-misty-step": ("Foulée brumeuse", _SPELL.format(s="Foulée brumeuse")),
    "lineage-spell-pass-without-trace": ("Passage sans trace", _SPELL.format(s="Passage sans trace")),
    "lineage-spell-poison-spray": ("Aspersion de poison", _SPELL.format(s="Aspersion de poison")),
    "lineage-spell-ray-of-enfeeblement": ("Rayon affaiblissant", _SPELL.format(s="Rayon affaiblissant")),
    "lineage-spell-ray-of-sickness": ("Rayon empoisonné", _SPELL.format(s="Rayon empoisonné")),
    "luck": ("Chanceux", "Quand vous obtenez 1 au d20 d'un test de d20, vous pouvez relancer le dé et devez garder le nouveau résultat."),
    "naturally-stealthy": ("Discrétion naturelle", "Vous pouvez effectuer l'action Se cacher même si vous n'êtes masqué que par une créature plus grande que vous d'au moins une taille."),
    "otherworldly-presence": ("Présence d'outre-monde", "Vous connaissez le tour de magie Thaumaturgie, lancé avec la même caractéristique que votre Héritage fiélon."),
    "powerful-build": ("Carrure puissante", "Vous avez l'avantage aux tests de caractéristique pour mettre fin à l'état Agrippé, et comptez comme une taille de plus pour votre capacité de charge."),
    "relentless-endurance": ("Endurance implacable", "Quand vous tombez à 0 point de vie sans être tué sur le coup, vous pouvez rester à 1 point de vie à la place. Une fois par repos long."),
    "resourceful": ("Débrouillard", "Vous gagnez l'Inspiration héroïque à la fin de chaque repos long."),
    "skillful": ("Doué", "Vous maîtrisez une compétence de votre choix."),
    "stonecunning": ("Connaissance de la pierre", "Par une action bonus, vous gagnez la perception des vibrations sur 18 m pendant 10 minutes, tant que vous êtes sur de la pierre ou la touchez (naturelle ou taillée). Utilisable un nombre de fois égal à votre bonus de maîtrise par repos long."),
    "trance": ("Transe", "Vous n'avez pas besoin de dormir et la magie ne peut pas vous endormir. Vous terminez un repos long en 4 heures de méditation pendant lesquelles vous restez conscient."),
    "versatile": ("Polyvalent", "Vous gagnez un don d'origine de votre choix (Doué est recommandé)."),
    "wood-elf-speed-increase": ("Elfe des bois : vitesse", "Votre vitesse passe à 10,5 m (35 pieds)."),
}
