# Descriptions françaises des capacités de classe de niveau 1 (affichées à la création du héros). Résumés fidèles du SRD 5.2.
_SPELLS = ("Vous lancez des sorts grâce à {how}.\n"
           "**Tours de magie.** Vous connaissez {c} tours de magie de la liste {l} ({rec} recommandés). {swap}Vous en apprenez un de plus aux niveaux 4 et 10.\n"
           "**Emplacements de sorts.** La table de la classe indique vos emplacements pour lancer les sorts de niveau 1 et plus ; vous les récupérez tous après un repos long.\n"
           "**Sorts préparés.** Vous préparez {p} ; leur nombre augmente avec votre niveau. {change}\n"
           "**Caractéristique d'incantation.** {abi}. Vous pouvez utiliser {focus} comme focaliseur.")
_SWAP = "À chaque niveau gagné, vous pouvez remplacer un tour de magie par un autre de la même liste. "
_MASTERY = ("Votre entraînement vous permet d'utiliser les bottes (propriétés de maîtrise) de {n} types d'armes de votre choix{ex}. "
            "Après un repos long, vous pouvez changer l'un de ces choix. Le nombre de types augmente à certains niveaux.")

FEATURE_DESC = {
    "barbarian-rage": ("Vous pouvez entrer en Rage, une force primitive qui vous rend puissant et résistant, par une action bonus si vous ne portez pas d'armure lourde. "
                       "Nombre de rages selon la table du barbare : vous en récupérez une après un repos court, toutes après un repos long.\n"
                       "**Résistance.** Vous avez la résistance aux dégâts contondants, perforants et tranchants.\n"
                       "**Dégâts de rage.** Vos attaques utilisant la Force (arme ou mains nues) infligent des dégâts supplémentaires (+2 au niveau 1, selon la table).\n"
                       "**Avantage de Force.** Vous avez l'avantage aux tests et jets de sauvegarde de Force.\n"
                       "**Pas de concentration ni de sorts.** Vous ne pouvez ni lancer de sorts ni vous concentrer.\n"
                       "**Durée.** Jusqu'à la fin de votre prochain tour ; vous pouvez la prolonger chaque tour en attaquant, en forçant un ennemi à faire un jet de sauvegarde ou par une action bonus. "
                       "Elle s'arrête au bout de 10 minutes, si vous enfilez une armure lourde ou si vous êtes Neutralisé."),
    "barbarian-unarmored-defense": "Tant que vous ne portez pas d'armure, votre CA de base est égale à 10 + modificateur de Dextérité + modificateur de Constitution. Vous pouvez porter un bouclier.",
    "barbarian-weapon-mastery": _MASTERY.format(n="deux", ex=" parmi les armes de corps à corps courantes ou de guerre (par exemple grande hache et hachette)"),
    "bard-bardic-inspiration": ("Vous inspirez les autres par la parole, la musique ou la danse. Votre dé d'Inspiration bardique est un d6 (il grandit avec le niveau).\n"
                                "**Utilisation.** Par une action bonus, une créature à 18 m ou moins qui vous voit ou vous entend reçoit un dé. Dans l'heure qui suit, quand elle rate un test de d20, "
                                "elle peut le lancer et l'ajouter au résultat, ce qui peut changer l'échec en réussite.\n"
                                "**Utilisations.** Un nombre de fois égal à votre modificateur de Charisme (minimum 1), récupérées après un repos long."),
    "bard-spellcasting": _SPELLS.format(how="vos arts de barde", c="deux", l="du barde", rec="Lumières dansantes et Moquerie cruelle", swap=_SWAP,
                                        p="d'abord quatre sorts de niveau 1 (Charme-personne, Couleurs dansantes, Murmures dissonants et Mot de guérison sont recommandés)",
                                        change="À chaque niveau gagné, vous pouvez en remplacer un.", abi="Charisme", focus="un instrument de musique"),
    "cleric-divine-order": ("Vous vous consacrez à l'un de ces rôles sacrés, au choix :\n"
                            "**Protecteur.** Formé au combat, vous maîtrisez les armes de guerre et les armures lourdes.\n"
                            "**Thaumaturge.** Vous connaissez un tour de magie de clerc supplémentaire, et ajoutez votre modificateur de Sagesse (minimum +1) à vos tests d'Intelligence (Arcanes ou Religion)."),
    "cleric-spellcasting": _SPELLS.format(how="la prière et la méditation", c="trois", l="du clerc", rec="Assistance, Flamme sacrée et Thaumaturgie", swap=_SWAP,
                                          p="d'abord quatre sorts de niveau 1 (Bénédiction, Soins, Éclair traçant et Bouclier de la foi sont recommandés)",
                                          change="Après un repos long, vous pouvez changer cette liste.", abi="Sagesse", focus="un symbole sacré"),
    "druid-druidic": ("Vous connaissez le druidique, la langue secrète des druides, et avez toujours le sort Communication avec les animaux préparé. "
                      "Vous pouvez laisser des messages cachés en druidique : les druides les repèrent d'emblée, les autres avec un test d'Intelligence (Investigation) DD 15, sans pouvoir les lire sans magie."),
    "druid-primal-order": ("Vous vous consacrez à l'un de ces rôles sacrés, au choix :\n"
                           "**Magicien.** Vous connaissez un tour de magie de druide supplémentaire, et ajoutez votre modificateur de Sagesse (minimum +1) à vos tests d'Intelligence (Arcanes ou Nature).\n"
                           "**Gardien.** Formé au combat, vous maîtrisez les armes de guerre et les armures intermédiaires."),
    "druid-spellcasting": _SPELLS.format(how="l'étude des forces mystiques de la nature", c="deux", l="du druide", rec="Druidisme et Production de flamme", swap=_SWAP,
                                         p="d'abord quatre sorts de niveau 1 (Amitié avec les animaux, Soins, Lueurs féeriques et Vague tonnante sont recommandés)",
                                         change="Après un repos long, vous pouvez changer cette liste.", abi="Sagesse", focus="un focaliseur druidique"),
    "fighter-fighting-style": "Vous gagnez un don de Style de combat de votre choix (Défense est recommandé). À chaque niveau de guerrier gagné, vous pouvez le remplacer par un autre.",
    "fighter-second-wind": ("Par une action bonus, vous puisez dans votre endurance pour récupérer 1d10 + votre niveau de guerrier en points de vie. "
                            "Deux utilisations : vous en récupérez une après un repos court, toutes après un repos long. Le nombre d'utilisations augmente avec le niveau."),
    "fighter-weapon-mastery": _MASTERY.format(n="trois", ex=" parmi les armes courantes ou de guerre"),
    "monk-martial-arts": ("Vous maîtrisez le combat à mains nues et avec les armes de moine (armes courantes de corps à corps et armes de guerre de corps à corps légères). "
                          "Sans armure ni bouclier, et en n'utilisant que ces armes :\n"
                          "**Frappe bonus.** Vous pouvez faire une frappe à mains nues par une action bonus.\n"
                          "**Dé d'arts martiaux.** Vous pouvez lancer 1d6 au lieu des dégâts normaux (le dé grandit avec le niveau).\n"
                          "**Attaques adroites.** Vous pouvez utiliser la Dextérité au lieu de la Force pour l'attaque et les dégâts, et pour les sauvegardes contre vos empoignades et bousculades."),
    "monk-unarmored-defense": "Sans armure ni bouclier, votre CA de base est égale à 10 + modificateur de Dextérité + modificateur de Sagesse.",
    "paladin-lay-on-hands": ("Votre toucher béni guérit. Vous disposez d'une réserve de soins égale à 5 × votre niveau de paladin, rechargée après un repos long. "
                             "Par une action bonus, vous touchez une créature (vous compris) et lui rendez des points de vie puisés dans la réserve. "
                             "Vous pouvez aussi dépenser 5 points de la réserve pour retirer l'état Empoisonné."),
    "paladin-spellcasting": ("Vous lancez des sorts grâce à la prière et la méditation.\n"
                             "**Emplacements de sorts.** La table du paladin indique vos emplacements ; vous les récupérez tous après un repos long.\n"
                             "**Sorts préparés.** Vous préparez d'abord deux sorts de niveau 1 (Héroïsme et Frappe ardente sont recommandés) ; leur nombre augmente avec le niveau. Après un repos long, vous pouvez en changer un.\n"
                             "**Caractéristique d'incantation.** Charisme. Vous pouvez utiliser un symbole sacré comme focaliseur."),
    "paladin-weapon-mastery": _MASTERY.format(n="deux", ex=" que vous maîtrisez (par exemple épée longue et javeline)"),
    "ranger-favored-enemy": ("Vous avez toujours le sort Marque du chasseur préparé. Vous pouvez le lancer deux fois sans emplacement de sort, et récupérez ces utilisations après un repos long. "
                             "Ce nombre augmente à certains niveaux."),
    "ranger-spellcasting": ("Vous canalisez l'essence magique de la nature pour lancer des sorts.\n"
                            "**Emplacements de sorts.** La table du rôdeur indique vos emplacements ; vous les récupérez tous après un repos long.\n"
                            "**Sorts préparés.** Vous préparez d'abord deux sorts de niveau 1 (Soins et Frappe piégeuse sont recommandés) ; leur nombre augmente avec le niveau. Après un repos long, vous pouvez en changer un.\n"
                            "**Caractéristique d'incantation.** Sagesse. Vous pouvez utiliser un focaliseur druidique."),
    "ranger-weapon-mastery": _MASTERY.format(n="deux", ex=" que vous maîtrisez (par exemple arc long et épée courte)"),
    "rogue-expertise": "Vous gagnez l'Expertise (bonus de maîtrise doublé) dans deux compétences que vous maîtrisez (Escamotage et Discrétion sont recommandés). Deux de plus au niveau 6.",
    "rogue-sneak-attack": ("Une fois par tour, vous infligez 1d6 dégâts supplémentaires à une créature touchée par une attaque avec une arme de finesse ou à distance, "
                           "si vous avez l'avantage au jet. L'avantage n'est pas nécessaire si un allié non Neutralisé se trouve à 1,5 m de la cible et que vous n'avez pas le désavantage. "
                           "Les dégâts supplémentaires augmentent avec le niveau."),
    "rogue-thieves-cant": "Vous connaissez l'argot des voleurs, langage codé des milieux interlopes, ainsi qu'une autre langue de votre choix.",
    "rogue-weapon-mastery": _MASTERY.format(n="deux", ex=" que vous maîtrisez (par exemple dague et arc court)"),
    "sorcerer-innate-sorcery": ("Un événement de votre passé vous a imprégné de magie. Par une action bonus, vous la libérez pendant 1 minute : "
                                "le DD de sauvegarde de vos sorts d'ensorceleur augmente de 1, et vous avez l'avantage aux jets d'attaque de ces sorts. "
                                "Deux utilisations, récupérées après un repos long."),
    "sorcerer-spellcasting": _SPELLS.format(how="votre magie innée", c="quatre", l="de l'ensorceleur", rec="Lumière, Prestidigitation, Poigne électrique et Salve ensorcelée", swap=_SWAP,
                                            p="d'abord deux sorts de niveau 1 (Mains brûlantes et Détection de la magie sont recommandés)",
                                            change="À chaque niveau gagné, vous pouvez en remplacer un.", abi="Charisme", focus="un focaliseur arcanique"),
    "warlock-eldritch-invocations": ("Vous avez découvert des Manifestations occultes, fragments de savoir interdit qui vous accordent des pouvoirs durables. "
                                     "Vous en gagnez une de votre choix (par exemple Pacte du grimoire), puis d'autres avec le niveau. "
                                     "Certaines ont des prérequis. À chaque niveau gagné, vous pouvez en remplacer une."),
    "warlock-pact-magic": ("Par un rituel occulte, vous avez conclu un pacte avec une entité mystérieuse qui vous permet de lancer des sorts.\n"
                           "**Tours de magie.** Vous connaissez deux tours de magie d'occultiste (Décharge occulte et Prestidigitation sont recommandés), puis un de plus aux niveaux 4 et 10.\n"
                           "**Emplacements de pacte.** Peu nombreux mais toujours du plus haut niveau disponible ; vous les récupérez après un repos court ou long.\n"
                           "**Sorts préparés.** Vous préparez d'abord deux sorts de niveau 1 (Charme-personne et Maléfice sont recommandés) ; à chaque niveau, vous pouvez en remplacer un.\n"
                           "**Caractéristique d'incantation.** Charisme. Vous pouvez utiliser un focaliseur arcanique."),
    "wizard-arcane-recovery": ("En étudiant votre grimoire pendant un repos court, vous récupérez des emplacements de sorts dépensés dont le total de niveaux ne dépasse pas la moitié de votre niveau de magicien (arrondie au supérieur), "
                               "aucun de niveau 6 ou plus. Une fois par repos long."),
    "wizard-ritual-adept": "Vous pouvez lancer comme rituel tout sort de votre grimoire qui porte la mention rituel, sans l'avoir préparé, en le lisant dans le livre.",
    "wizard-spellcasting": ("Étudiant des arcanes, vous lancez des sorts.\n"
                            "**Tours de magie.** Vous connaissez trois tours de magie de magicien (Lumière, Main de mage et Rayon de givre sont recommandés). Après un repos long, vous pouvez en remplacer un. Un de plus aux niveaux 4 et 10.\n"
                            "**Grimoire.** Il contient six sorts de niveau 1 de votre choix ; vous y ajoutez deux sorts à chaque niveau, et pouvez copier ceux que vous trouvez.\n"
                            "**Emplacements de sorts.** La table du magicien les indique ; vous les récupérez tous après un repos long.\n"
                            "**Sorts préparés.** Vous préparez chaque jour une partie des sorts de votre grimoire (quatre au niveau 1) ; après un repos long, vous pouvez changer cette liste.\n"
                            "**Caractéristique d'incantation.** Intelligence. Vous pouvez utiliser un focaliseur arcanique ou votre grimoire."),
}
