"""Recepten inlezen, omrekenen naar het huishouden en de kosten per supermarkt berekenen.

Hoeveelheden in een recept zijn per volwassen portie. Een huishouden is een lijst
personen met een portiefactor, zodat een kind of een grote eter meeschaalt:

    [{"naam": "Sander", "factor": 1.0}, {"naam": "kind", "factor": 0.6}]
"""
import copy
import json
from collections import defaultdict

from .koppel import kosten

TYPES = ("ontbijt", "lunch", "diner")


def laad_recepten(pad, ingredientprijzen):
    with open(pad, encoding="utf-8") as f:
        recepten = json.load(f)
    fouten = controleer(recepten, ingredientprijzen)
    if fouten:
        raise ValueError("Fouten in recepten:\n  " + "\n  ".join(fouten))
    return recepten


def controleer(recepten, ingredientprijzen):
    """Geeft een lijst met problemen, zodat een typefout in een recept meteen opvalt."""
    fouten = []
    for r in recepten:
        if r.get("type") not in TYPES:
            fouten.append(f"{r['naam']}: type moet een van {', '.join(TYPES)} zijn")
        for i in r["ingredienten"]:
            info = ingredientprijzen.get(i["naam"])
            if info is None:
                fouten.append(f"{r['naam']}: onbekend ingrediënt '{i['naam']}' (voeg het toe aan ingredienten.json)")
            elif i.get("eenheid", info["eenheid"]) != info["eenheid"]:
                fouten.append(f"{r['naam']}: '{i['naam']}' moet in {info['eenheid']}")
    return fouten


def porties(huishouden):
    return sum(p.get("factor", 1.0) for p in huishouden)


def benodigd(recepten, huishouden):
    """Totale hoeveelheid per ingrediënt voor een lijst recepten (een recept mag vaker voorkomen)."""
    n = porties(huishouden)
    totaal = defaultdict(float)
    for r in recepten:
        for i in r["ingredienten"]:
            totaal[i["naam"]] += i["hoeveelheid"] * n
    return dict(totaal)


def boodschappen(nodig, ingredientprijzen, keten):
    """Boodschappenlijst bij één keten: per ingrediënt de verpakking die voor deze hoeveelheid het goedkoopst is.

    Geeft (lijst, totaal, ontbrekend). Ontbrekend zijn ingrediënten waarvoor deze keten geen product heeft.
    """
    lijst, ontbrekend = [], []
    for naam, hoeveel in sorted(nodig.items()):
        opties = ingredientprijzen[naam]["ketens"][keten]
        if not opties:
            ontbrekend.append(naam)
            continue
        beste = min(opties, key=lambda c: kosten(c, hoeveel)[1])
        pakken, prijs = kosten(beste, hoeveel)
        lijst.append({"ingredient": naam, "nodig": round(hoeveel, 1), "product": beste["product"],
                      "aantal": pakken, "verpakking": beste["verpakking"], "prijs": prijs, "url": beste["url"], "geschat": beste["geschat"]})
    return lijst, round(sum(r["prijs"] for r in lijst), 2), ontbrekend


def portieprijs(recept, ingredientprijzen, keten):
    """Wat één portie kost als je alleen het gebruikte deel van elke verpakking telt.

    Handig om recepten te vergelijken; de echte rekening (hele verpakkingen) maakt `boodschappen`.
    Geeft None als de keten een ingrediënt niet heeft.
    """
    totaal = 0.0
    for i in recept["ingredienten"]:
        opties = ingredientprijzen[i["naam"]]["ketens"][keten]
        if not opties:
            return None
        totaal += opties[0]["eenheidsprijs"] * i["hoeveelheid"]
    return round(totaal, 2)


def prijzen_op_dag(ingredientprijzen, dag):
    """Laat aanbiedingen weg die op de boodschappendag niet geldig zijn (lidl.nl-folder)."""
    dag = dag.isoformat()
    uit = copy.deepcopy(ingredientprijzen)
    for info in uit.values():
        for keten, opties in info["ketens"].items():
            info["ketens"][keten] = [c for c in opties
                                     if not (c.get("geldig_tot") and c["geldig_tot"] < dag)
                                     and not (c.get("geldig_van") and c["geldig_van"] > dag)]
    return uit


def vergelijk_winkels(recepten, ingredientprijzen, huishouden, dag, houdbaar=(), aantallen=None):
    """Wat je weekrecepten kosten bij elke supermarkt, goedkoopste eerst.

    `aantallen` zegt hoe vaak je een recept deze week maakt (standaard 1 keer, 0 is overslaan).
    Houdbare ingrediënten (pot, fles, pak) tellen voor het weekbedrag alleen mee voor wat je
    deze week gebruikt; de kassabon telt hele verpakkingen. Een winkel die een ingrediënt niet
    heeft, komt achteraan met de lijst van wat ontbreekt.
    """
    aantallen = aantallen or {}
    menu = [r for r in recepten for _ in range(aantallen.get(r["naam"], 1))]
    prijzen = prijzen_op_dag(ingredientprijzen, dag)
    nodig = benodigd(menu, huishouden["personen"])
    for naam, hoeveel in huishouden.get("voorraad", {}).items():
        if naam in nodig:
            nodig[naam] = max(0.0, nodig[naam] - hoeveel)
    nodig = {n: h for n, h in nodig.items() if h > 0}

    uit = []
    for keten in huishouden.get("supermarkten", ("ah", "jumbo", "lidl", "aldi")):
        lijst, kassabon, ontbrekend = boodschappen(nodig, prijzen, keten)
        weekbedrag = 0.0
        for r in lijst:
            r["houdbaar"] = r["ingredient"] in houdbaar
            weekbedrag += r["prijs"] * min(1.0, r["nodig"] / (r["aantal"] * r["verpakking"])) if r["houdbaar"] else r["prijs"]
        uit.append({"keten": keten, "weekbedrag": round(weekbedrag, 2), "kassabon": kassabon,
                    "ontbrekend": ontbrekend, "boodschappen": lijst})
    return sorted(uit, key=lambda w: (not w["boodschappen"], bool(w["ontbrekend"]), w["weekbedrag"]))
