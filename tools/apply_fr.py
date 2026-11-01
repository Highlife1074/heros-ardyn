#!/usr/bin/env python3
"""Traduit en français les noms (et les textes courts) de data/rules.json.
Idempotent : l'anglais est conservé dans nameEn / descriptionEn et sert toujours de source.
Usage : python3 tools/apply_fr.py   (à relancer après tools/build_rules.py)"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fr_species import SUBSPECIES, TRAITS
from fr_class import FEATS, SUBCLASSES, FEATURES
from fr_spells import SPELLS, SPELL_FIELDS, FEET_M
from fr_items import EQUIPMENT, MAGIC_ITEMS, RARITY
from fr_features import FEATURE_DESC

P = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "rules.json")
R = json.load(open(P, encoding="utf-8"))
missing = []

def en(v, f="name"):
    return v.get(f + "En", v.get(f))

def set_fr(v, f, fr):
    if fr is None: return
    v.setdefault(f + "En", v[f]) if f in v else None
    v[f] = fr

def name_from(table, v, sec, key):
    fr = table.get(en(v))
    if fr is None: missing.append(f"{sec}/{key}: {en(v)}")
    set_fr(v, "name", fr)

CONDITIONS = {
    "blinded": "**Ne voit pas.** Vous ne voyez rien et ratez automatiquement tout test qui nécessite la vue.\n**Attaques.** Les jets d'attaque contre vous ont l'avantage ; les vôtres ont le désavantage.",
    "charmed": "**Ne peut pas nuire au charmeur.** Vous ne pouvez pas attaquer le charmeur ni le cibler avec des capacités ou effets magiques nuisibles.\n**Avantage social.** Le charmeur a l'avantage aux tests d'interaction sociale avec vous.",
    "deafened": "**N'entend pas.** Vous n'entendez rien et ratez automatiquement tout test qui nécessite l'ouïe.",
    "exhaustion": "**Niveaux cumulatifs.** Chaque fois que vous subissez cet état, vous gagnez 1 niveau d'épuisement. Au niveau 6, vous mourez.\n**Tests de d20.** Vos tests de d20 subissent un malus de 2 × votre niveau d'épuisement.\n**Vitesse réduite.** Votre vitesse diminue de 1,5 m × votre niveau d'épuisement.\n**Récupération.** Un repos long retire 1 niveau d'épuisement.",
    "frightened": "**Tests et attaques.** Vous avez le désavantage aux tests de caractéristique et aux jets d'attaque tant que la source de votre peur est en vue.\n**Ne peut pas approcher.** Vous ne pouvez pas vous rapprocher volontairement de la source de votre peur.",
    "grappled": "**Vitesse 0.** Votre vitesse est de 0 et ne peut pas augmenter.\n**Attaques.** Vous avez le désavantage aux jets d'attaque contre toute cible autre que celle qui vous agrippe.\n**Déplaçable.** Celui qui vous agrippe peut vous traîner ou vous porter (chaque mètre lui coûte 1 mètre de plus, sauf si vous êtes bien plus petit).",
    "incapacitated": "**Inactif.** Vous ne pouvez effectuer ni action, ni action bonus, ni réaction.\n**Pas de concentration.** Votre concentration est rompue.\n**Muet.** Vous ne pouvez pas parler.\n**Surpris.** Si vous êtes Neutralisé en lançant l'initiative, vous avez le désavantage.",
    "invisible": "**Surprise.** Si vous êtes Invisible en lançant l'initiative, vous avez l'avantage.\n**Dissimulé.** Les effets qui exigent de vous voir ne vous affectent pas ; votre équipement est aussi invisible.\n**Attaques.** Les jets d'attaque contre vous ont le désavantage ; les vôtres ont l'avantage (sauf contre une créature qui peut vous voir).",
    "paralyzed": "**Neutralisé.** Vous êtes Neutralisé.\n**Vitesse 0.** Votre vitesse est de 0 et ne peut pas augmenter.\n**Sauvegardes.** Vous ratez automatiquement les jets de sauvegarde de Force et de Dextérité.\n**Attaques.** Les jets d'attaque contre vous ont l'avantage.\n**Critiques automatiques.** Toute attaque qui vous touche à 1,5 m ou moins est un coup critique.",
    "petrified": "**Changé en pierre.** Vous et vos objets non magiques êtes changés en substance inanimée (souvent de la pierre). Votre poids est multiplié par dix et vous cessez de vieillir.\n**Neutralisé.** Vous êtes Neutralisé.\n**Vitesse 0.** Votre vitesse est de 0.\n**Attaques.** Les jets d'attaque contre vous ont l'avantage.\n**Sauvegardes.** Vous ratez automatiquement les sauvegardes de Force et de Dextérité.\n**Résistance.** Vous avez la résistance à tous les dégâts et l'immunité à l'état Empoisonné.",
    "poisoned": "**Tests et attaques.** Vous avez le désavantage aux jets d'attaque et aux tests de caractéristique.",
    "prone": "**Mouvement limité.** Vous ne pouvez que ramper, ou dépenser la moitié de votre vitesse pour vous relever (impossible si votre vitesse est 0).\n**Attaques.** Vous avez le désavantage aux jets d'attaque. Une attaque contre vous a l'avantage si l'attaquant est à 1,5 m ou moins, sinon le désavantage.",
    "restrained": "**Vitesse 0.** Votre vitesse est de 0 et ne peut pas augmenter.\n**Attaques.** Les jets d'attaque contre vous ont l'avantage ; les vôtres ont le désavantage.\n**Sauvegardes.** Vous avez le désavantage aux jets de sauvegarde de Dextérité.",
    "stunned": "**Neutralisé.** Vous êtes Neutralisé.\n**Sauvegardes.** Vous ratez automatiquement les jets de sauvegarde de Force et de Dextérité.\n**Attaques.** Les jets d'attaque contre vous ont l'avantage.",
    "unconscious": "**Inerte.** Vous êtes Neutralisé et À terre, et lâchez ce que vous tenez. À la fin de l'état, vous restez À terre.\n**Vitesse 0.** Votre vitesse est de 0.\n**Attaques.** Les jets d'attaque contre vous ont l'avantage.\n**Sauvegardes.** Vous ratez automatiquement les sauvegardes de Force et de Dextérité.\n**Critiques automatiques.** Toute attaque qui vous touche à 1,5 m ou moins est un coup critique.\n**Inconscient.** Vous n'avez pas conscience de ce qui vous entoure.",
}

for k, v in R["subspecies"].items():
    fr = SUBSPECIES.get(k)
    if fr is None: missing.append(f"subspecies/{k}")
    set_fr(v, "name", fr)
for k, v in R["traits"].items():
    t = TRAITS.get(k)
    if t is None: missing.append(f"traits/{k}"); continue
    set_fr(v, "name", t[0]); set_fr(v, "description", t[1])
for k, v in R["feats"].items():
    t = FEATS.get(k)
    if t is None: missing.append(f"feats/{k}"); continue
    set_fr(v, "name", t[0]); set_fr(v, "description", t[1])
for k, v in R["subclasses"].items():
    t = SUBCLASSES.get(k)
    if t is None: missing.append(f"subclasses/{k}"); continue
    set_fr(v, "name", t[0]); set_fr(v, "summary", t[1]); set_fr(v, "description", t[2])
    for f in v.get("features") or []:
        n = en(f) or ""
        fr = FEATURES.get(n) or next((FEATURES[x] for x in FEATURES if n.startswith(x + " ")), None)  # nom mal découpé dans la source
        if fr: set_fr(f, "name", fr)
for k, v in R["features"].items():
    name_from(FEATURES, v, "features", k)
    if k in FEATURE_DESC: set_fr(v, "description", FEATURE_DESC[k])
for k, v in R["conditions"].items():
    if k in CONDITIONS: set_fr(v, "description", CONDITIONS[k])

def field_fr(s):
    for pat, rep in SPELL_FIELDS:
        s = re.sub(pat, rep, s)
    return re.sub(r"\b(\d+) feet\b", lambda m: FEET_M.get(m.group(1), m.group(1) + " pieds"), s)

for k, v in R["spells"].items():
    name_from(SPELLS, v, "spells", k)
    for f in ("time", "range", "duration"):
        if isinstance(v.get(f), str): set_fr(v, f, field_fr(en(v, f)))
for k, v in R["equipment"].items():
    name_from(EQUIPMENT, v, "equipment", k)
for k, v in R["magicItems"].items():
    name_from(MAGIC_ITEMS, v, "magicItems", k)
    if isinstance(v.get("rarity"), str): set_fr(v, "rarity", RARITY.get(en(v, "rarity"), en(v, "rarity")))

# Équipement de départ des classes et historiques : mêmes noms que l'équipement
for sec in ("classes", "backgrounds"):
    for c in R[sec].values():
        for grp in c.get("equipment") or []:
            for opt in grp.get("options") or []:
                for it in opt.get("items") or []:
                    e = R["equipment"].get(it.get("index"))
                    if e: it["name"] = e["name"]
# Don d'historique
for b in R["backgrounds"].values():
    f = b.get("feat")
    if isinstance(f, dict) and f.get("index") in R["feats"]: f["name"] = R["feats"][f["index"]]["name"]

json.dump(R, open(P, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("rules.json traduit." + (f" Sans traduction ({len(missing)}) : " + "; ".join(missing) if missing else " Tout est traduit."))
