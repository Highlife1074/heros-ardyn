#!/usr/bin/env python3
"""Compile le SRD 5.2 (CC-BY-4.0, 5e-bits/5e-database, dossier src/2024/en)
en deux fichiers compacts :
  public/data/rules.json      -> utilisé par l'interface (création, fiche, sorts...)
  functions/data/rules.json   -> même fichier, utilisé par le serveur (calculs, MJ)
  functions/data/monsters.json-> bestiaire compact pour le MJ IA
Usage : python3 tools/build_rules.py /chemin/vers/5e-database/src/2024/en
"""
import json, os, re, sys

SRC = sys.argv[1]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
L = lambda f: json.load(open(os.path.join(SRC, f"5e-SRD-{f}.json"), encoding="utf-8"))

FR_CLASS = {"barbarian": "Barbare", "bard": "Barde", "cleric": "Clerc", "druid": "Druide",
            "fighter": "Guerrier", "monk": "Moine", "paladin": "Paladin", "ranger": "Rôdeur",
            "rogue": "Roublard", "sorcerer": "Ensorceleur", "warlock": "Occultiste", "wizard": "Magicien"}
CAST_ABI = {"bard": "cha", "cleric": "wis", "druid": "wis", "paladin": "cha", "ranger": "wis",
            "sorcerer": "cha", "warlock": "cha", "wizard": "int"}
FR_SPECIES = {"dragonborn": "Drakéide", "dwarf": "Nain", "elf": "Elfe", "gnome": "Gnome",
              "goliath": "Goliath", "halfling": "Halfelin", "human": "Humain", "orc": "Orc",
              "tiefling": "Tieffelin"}
# Habillage Ardyn (purement narratif, les règles restent celles du SRD)
ARDYN_SPECIES = {"dragonborn": "Sangdragon (Istar)", "dwarf": "Nain (Hardyll / Collines Bleues)",
                 "elf": "Elfe (Belm, Aelen, Elenesti ou Selvanari)", "gnome": "Gnome",
                 "goliath": "Jorlandais (hommes du Nord)", "halfling": "Halfelin",
                 "human": "Humain", "orc": "Orc", "tiefling": "Tieffelin (marqué par l'Ombre)"}
FR_BG = {"acolyte": "Acolyte", "criminal": "Criminel", "sage": "Sage", "soldier": "Soldat"}
FR_SKILL = {"acrobatics": "Acrobaties", "animal-handling": "Dressage", "arcana": "Arcanes",
            "athletics": "Athlétisme", "deception": "Tromperie", "history": "Histoire",
            "insight": "Perspicacité", "intimidation": "Intimidation", "investigation": "Investigation",
            "medicine": "Médecine", "nature": "Nature", "perception": "Perception",
            "performance": "Représentation", "persuasion": "Persuasion", "religion": "Religion",
            "sleight-of-hand": "Escamotage", "stealth": "Discrétion", "survival": "Survie"}
FR_COND = {"blinded": "Aveuglé", "charmed": "Charmé", "deafened": "Assourdi", "exhaustion": "Épuisement",
           "frightened": "Effrayé", "grappled": "Agrippé", "incapacitated": "Neutralisé",
           "invisible": "Invisible", "paralyzed": "Paralysé", "petrified": "Pétrifié",
           "poisoned": "Empoisonné", "prone": "À terre", "restrained": "Entravé", "stunned": "Étourdi",
           "unconscious": "Inconscient"}
FR_SCHOOL = {"abjuration": "Abjuration", "conjuration": "Invocation", "divination": "Divination",
             "enchantment": "Enchantement", "evocation": "Évocation", "illusion": "Illusion",
             "necromancy": "Nécromancie", "transmutation": "Transmutation"}

def idx(ref):
    return ref["index"] if isinstance(ref, dict) else ref

def option_items(opt):
    """Aplatit une option d'équipement en [{index,name,count}] ; '50 GP' -> gold."""
    out, gold = [], 0
    def walk(o):
        nonlocal gold
        t = o.get("option_type")
        if t == "multiple":
            for it in o.get("items", []):
                walk(it)
        elif t == "counted_reference":
            out.append({"index": o["of"]["index"], "name": o["of"]["name"], "count": o.get("count", 1)})
        elif t == "reference":
            out.append({"index": o["item"]["index"], "name": o["item"]["name"], "count": 1})
        elif t == "money":
            gold += o.get("count", o.get("quantity", 0))
        elif "count" in o and o.get("unit") == "gp":
            gold += o["count"]
    walk(opt)
    return out, gold

def equipment_options(lst):
    res = []
    for eo in lst or []:
        desc = eo.get("desc", "")
        opts = []
        for o in eo.get("from", {}).get("options", []):
            items, gold = option_items(o)
            opts.append({"items": items, "gold": gold})
        # Le SRD encode souvent l'or uniquement dans la description : on le récupère.
        golds = re.findall(r"(\d+)\s*GP", desc)
        labels = re.split(r";\s*(?:or\s*)?(?=\([A-Za-z]\))", re.sub(r"^Choose [^:]*:\s*", "", desc))
        for i, o in enumerate(opts):
            if i < len(labels):
                g = re.findall(r"(\d+)\s*GP", labels[i])
                if g and not o["gold"]:
                    o["gold"] = int(g[-1])
                o["label"] = re.sub(r"^(Choose A or B:\s*)?\(?[A-Za-z]\)\s*", "", labels[i]).strip()
        if not opts and golds:
            opts = [{"items": [], "gold": int(golds[-1]), "label": desc}]
        res.append({"desc": desc, "options": opts})
    return res

def skill_choices(c):
    for pc in c.get("proficiency_choices", []):
        opts = [o["item"]["index"] for o in pc.get("from", {}).get("options", []) if o.get("item")]
        sk = [o.replace("skill-", "") for o in opts if o.startswith("skill-")]
        if sk:
            return {"choose": pc["choose"], "from": sk}
    return {"choose": 0, "from": []}

classes_raw = L("Classes")
levels = L("Levels")
features_raw = L("Features")
subclasses_raw = L("Subclasses")

features = {f["index"]: {"name": f["name"], "level": f.get("level", {}).get("index", ""),
                          "class": f.get("class", {}).get("index"), "description": f.get("description", "")}
            for f in features_raw}

classes = {}
for c in classes_raw:
    ci = c["index"]
    lv = {}
    for l in levels:
        if l.get("class", {}).get("index") == ci and not l.get("subclass"):
            lv[l["level"]] = {"prof": l.get("prof_bonus", 2),
                              "features": [f["index"] for f in l.get("features", [])],
                              "spellcasting": l.get("spellcasting"),
                              "specific": l.get("class_specific") or {}}
    profs = [p["index"] for p in c.get("proficiencies", [])]
    classes[ci] = {
        "index": ci, "name": c["name"], "nameFr": FR_CLASS.get(ci, c["name"]),
        "hitDie": c["hit_die"],
        "primary": [a["index"] for a in c.get("primary_ability", {}).get("ability_scores", [])],
        "saves": [s["index"] for s in c.get("saving_throws", [])],
        "proficiencies": profs,
        "skills": skill_choices(c),
        "equipment": equipment_options(c.get("starting_equipment_options")),
        "castAbility": CAST_ABI.get(ci),
        "levels": lv,
    }

subclasses = {s["index"]: {"index": s["index"], "name": s["name"], "class": s["class"]["index"],
                           "summary": s.get("summary", ""), "description": s.get("description", ""),
                           "features": [{"name": f["name"], "level": f["level"],
                                         "description": f.get("description", "")} for f in s.get("features", [])]}
              for s in subclasses_raw}

traits = {t["index"]: {"name": t["name"], "description": t.get("description", "")} for t in L("Traits")}
species = {}
for s in L("Species"):
    species[s["index"]] = {"index": s["index"], "name": s["name"], "nameFr": FR_SPECIES.get(s["index"], s["name"]),
                           "nameArdyn": ARDYN_SPECIES.get(s["index"]), "size": s.get("size"),
                           "speed": s.get("speed", 30), "traits": [t["index"] for t in s.get("traits", [])],
                           "subspecies": [x["index"] for x in s.get("subspecies", [])]}
subspecies = {s["index"]: {"name": s["name"], "species": s["species"]["index"],
                           "traits": [t["index"] for t in s.get("traits", [])],
                           "damageType": (s.get("damage_type") or {}).get("index")} for s in L("Subspecies")}

backgrounds = {}
for b in L("Backgrounds"):
    profs = [p["index"] for p in b.get("proficiencies", [])]
    backgrounds[b["index"]] = {
        "index": b["index"], "name": b["name"], "nameFr": FR_BG.get(b["index"], b["name"]),
        "abilities": [a["index"] for a in b.get("ability_scores", [])],
        "feat": {"index": b.get("feat", {}).get("index"), "name": b.get("feat", {}).get("name"),
                 "note": b.get("feat", {}).get("note")},
        "skills": [p.replace("skill-", "") for p in profs if p.startswith("skill-")],
        "tools": [p for p in profs if p.startswith("tool-")],
        "equipment": equipment_options(b.get("equipment_options")),
    }

feats = {f["index"]: {"name": f["name"], "type": f.get("type"), "description": f.get("description", ""),
                      "repeatable": bool(f.get("repeatable"))} for f in L("Feats")}
skills = {s["index"]: {"name": s["name"], "nameFr": FR_SKILL.get(s["index"], s["name"]),
                       "ability": s["ability_score"]["index"]} for s in L("Skills")}
conditions = {c["index"]: {"name": c["name"], "nameFr": FR_COND.get(c["index"], c["name"]),
                           "description": c.get("description", "")} for c in L("Conditions")}

spells = {}
for s in L("Spells"):
    spells[s["index"]] = {
        "name": s["name"], "level": s["level"], "school": FR_SCHOOL.get(s["school"]["index"], s["school"]["name"]),
        "classes": [c["index"] for c in s.get("classes", [])],
        "time": s.get("casting_time"), "range": s.get("range"), "components": s.get("components", []),
        "material": s.get("material"), "duration": s.get("duration"),
        "concentration": s.get("concentration", False), "ritual": s.get("ritual", False),
        "attack": s.get("attack_type"),
        "save": (s.get("dc") or {}).get("dc_type", {}).get("index"),
        "damage": s.get("damage"), "heal": s.get("heal_at_slot_level"),
        "description": s.get("description", ""), "higher": s.get("higher_level", ""),
    }

equipment = {}
for e in L("Equipment"):
    cats = [c["index"] for c in e.get("equipment_categories", [])]
    item = {"name": e["name"], "cats": cats, "weight": e.get("weight", 0),
            "cost": e.get("cost")}
    if e.get("damage"):
        item["damage"] = e["damage"].get("damage_dice")
        item["damageType"] = (e["damage"].get("damage_type") or {}).get("index")
    if e.get("two_handed_damage"):
        item["twoHanded"] = e["two_handed_damage"].get("damage_dice")
    if e.get("properties"):
        item["props"] = [p["index"] for p in e["properties"]]
    if e.get("range"):
        item["range"] = e["range"]
    if e.get("mastery"):
        item["mastery"] = e["mastery"].get("index")
    if e.get("armor_class"):
        item["ac"] = e["armor_class"]
        item["strMin"] = e.get("str_minimum", 0)
        item["stealthDis"] = e.get("stealth_disadvantage", False)
    if e.get("contents"):
        item["contents"] = [{"index": c["item"]["index"], "count": c.get("quantity", 1)} for c in e["contents"]]
    if e.get("description"):
        item["description"] = e["description"][:600]
    equipment[e["index"]] = item

magic_items = {m["index"]: {"name": m["name"], "rarity": (m.get("rarity") or {}).get("name"),
                            "attunement": m.get("attunement", False), "description": m.get("desc", "")[:1500]}
               for m in L("Magic-Items") if not m.get("variants")}

rules = {"source": "SRD 5.2 (CC-BY-4.0) via 5e-bits/5e-database", "classes": classes,
         "subclasses": subclasses, "features": features, "species": species, "subspecies": subspecies,
         "traits": traits, "backgrounds": backgrounds, "feats": feats, "skills": skills,
         "conditions": conditions, "spells": spells, "equipment": equipment, "magicItems": magic_items}

def compact_monster(m):
    def acts(lst):
        return [{"name": a["name"], "desc": a.get("desc", "")[:700]} for a in (lst or [])]
    ac = m.get("armor_class", [{}])[0].get("value")
    return {
        "name": m["name"], "size": m.get("size"), "type": m.get("type"), "ac": ac,
        "hp": m.get("hit_points"), "hitDice": m.get("hit_dice"), "speed": m.get("speed"),
        "abilities": {"str": m.get("strength"), "dex": m.get("dexterity"), "con": m.get("constitution"),
                      "int": m.get("intelligence"), "wis": m.get("wisdom"), "cha": m.get("charisma")},
        "cr": m.get("challenge_rating"), "xp": m.get("xp"),
        "resist": m.get("damage_resistances"), "immune": m.get("damage_immunities"),
        "condImmune": [c.get("index") if isinstance(c, dict) else c for c in m.get("condition_immunities", [])],
        "senses": m.get("senses"), "languages": m.get("languages"),
        "traits": acts(m.get("special_abilities")), "actions": acts(m.get("actions")),
        "bonus": acts(m.get("bonus_actions")), "reactions": acts(m.get("reactions")),
        "legendary": acts(m.get("legendary_actions")),
    }

monsters = {}
for m in L("Monsters"):
    key = m.get("index") or re.sub(r"[^a-z0-9]+", "-", m["name"].lower()).strip("-")
    monsters[key] = compact_monster(m)

for path in [os.path.join(ROOT, "public", "data", "rules.json"), os.path.join(ROOT, "functions", "data", "rules.json")]:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(rules, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
json.dump(monsters, open(os.path.join(ROOT, "functions", "data", "monsters.json"), "w", encoding="utf-8"),
          ensure_ascii=False, separators=(",", ":"))
print("classes", len(classes), "spells", len(spells), "equipment", len(equipment), "monsters", len(monsters),
      "magic items", len(magic_items))
