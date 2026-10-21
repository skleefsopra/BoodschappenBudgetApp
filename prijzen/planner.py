"""Weekplanner: 7 ontbijten, 7 lunches en 7 diners binnen het weekbudget, bij één supermarkt.

Per supermarkt maken we een eigen weekmenu, omdat wat goedkoop is per winkel verschilt.
Daarna kies je zelf bij welke winkel je haalt.

De planner zoekt met een eenvoudige lokale zoektocht: begin met een willekeurig menu en
wissel steeds één maaltijd om zolang het menu daar beter van wordt. 'Beter' betekent:
1. binnen het budget blijven (zwaarst),
2. afwisseling: hetzelfde recept niet te vaak,
3. eigen recepten gaan voor voorgestelde,
4. goedkoper is beter.
Omdat de rekening hele verpakkingen telt, kiest de planner vanzelf recepten die
ingrediënten delen: een zak aardappelen voor drie diners is goedkoper dan drie halve.

Houdbare ingrediënten (pot pindakaas, fles olie, pak rijst) gaan meerdere weken mee.
Die tellen voor het budget alleen mee voor het deel dat je deze week gebruikt; op de
boodschappenlijst staat wel de hele verpakking. Wat je al in huis hebt zet je onder
"voorraad" in huishouden.json, dat koop je dan niet.
"""
import copy
import datetime
import random

from .recepten import TYPES, benodigd, boodschappen

DAGEN = ("maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag")
MAX_HERHALING = {"ontbijt": 3, "lunch": 3, "diner": 2}  # keer per week
STRAF_BUDGET = 100.0  # per euro boven budget
STRAF_HERHALING = 1.5  # in euro's: 2e keer hetzelfde recept € 1,50, 3e keer € 6, oplopend
BONUS_EIGEN = 0.5  # per maaltijd uit een eigen recept


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


def beschikbaar(recepten, ingredientprijzen, keten):
    """Recepten waarvan elk ingrediënt bij deze keten te koop is."""
    return [r for r in recepten if all(ingredientprijzen[i["naam"]]["ketens"][keten] for i in r["ingredienten"])]


def _rekening(menu, huishouden, ingredientprijzen, keten, voorraad, houdbaar):
    """Geeft (boodschappenlijst, kassabon, budgetbedrag).

    Het budgetbedrag telt houdbare ingrediënten alleen voor wat je deze week gebruikt.
    """
    nodig = benodigd(menu, huishouden)
    for naam, hoeveel in voorraad.items():
        if naam in nodig:
            nodig[naam] = max(0.0, nodig[naam] - hoeveel)
    nodig = {n: h for n, h in nodig.items() if h > 0}
    lijst, kassabon, _ = boodschappen(nodig, ingredientprijzen, keten)
    budgetbedrag = 0.0
    for r in lijst:
        r["houdbaar"] = r["ingredient"] in houdbaar
        verbruik = r["prijs"] * min(1.0, r["nodig"] / (r["aantal"] * r["verpakking"])) if r["houdbaar"] else r["prijs"]
        budgetbedrag += verbruik
    return lijst, kassabon, round(budgetbedrag, 2)


def _score(keuze, totaal, budget):
    s = max(0.0, totaal - budget) * STRAF_BUDGET + totaal
    for soort, recepten in keuze.items():
        tellingen = {}
        for r in recepten:
            tellingen[r["naam"]] = tellingen.get(r["naam"], 0) + 1
        for n in tellingen.values():
            s += STRAF_HERHALING * (n - 1) ** 2
            if n > MAX_HERHALING[soort]:
                s += 1000
        s -= BONUS_EIGEN * sum(r.get("bron") == "eigen" for r in recepten)
    return s


def _verdeel_over_week(recepten, rnd):
    """Zet herhalingen zo ver mogelijk uit elkaar: niet twee dagen achter elkaar hetzelfde."""
    rest = list(recepten)
    rnd.shuffle(rest)
    rest.sort(key=lambda r: -sum(x["naam"] == r["naam"] for x in recepten))
    week = [None] * 7
    plekken = list(range(0, 7, 2)) + list(range(1, 7, 2))
    for r, plek in zip(rest, plekken):
        week[plek] = r
    return week


def plan(recepten, ingredientprijzen, huishouden, keten, boodschappendag=None, houdbaar=(),
         pogingen=6, stappen=400, seed=None):
    """Maakt een weekmenu voor één keten. Geeft None als er voor een maaltijdtype geen recept beschikbaar is.

    `houdbaar` zijn de namen van ingrediënten die meerdere weken meegaan.
    """
    boodschappendag = boodschappendag or datetime.date.today()
    prijzen = prijzen_op_dag(ingredientprijzen, boodschappendag)
    budget = huishouden.get("budget_per_week", float("inf"))
    voorraad = huishouden.get("voorraad", {})
    rnd = random.Random(seed)
    per_type = {t: [r for r in beschikbaar(recepten, prijzen, keten) if r["type"] == t] for t in TYPES}
    if not all(per_type.values()):
        return None

    def beoordeel(keuze):
        menu = [r for rs in keuze.values() for r in rs]
        _, _, budgetbedrag = _rekening(menu, huishouden["personen"], prijzen, keten, voorraad, houdbaar)
        return _score(keuze, budgetbedrag, budget), budgetbedrag

    beste, beste_score = None, float("inf")
    for _ in range(pogingen):
        keuze = {t: [rnd.choice(per_type[t]) for _ in DAGEN] for t in TYPES}
        score, _ = beoordeel(keuze)
        for _ in range(stappen):
            t = rnd.choice(TYPES)
            i = rnd.randrange(7)
            oud = keuze[t][i]
            keuze[t][i] = rnd.choice(per_type[t])
            nieuw, _ = beoordeel(keuze)
            if nieuw <= score:
                score = nieuw
            else:
                keuze[t][i] = oud
        if score < beste_score:
            beste, beste_score = {t: list(rs) for t, rs in keuze.items()}, score

    menu = [r for rs in beste.values() for r in rs]
    lijst, kassabon, budgetbedrag = _rekening(menu, huishouden["personen"], prijzen, keten, voorraad, houdbaar)
    week = {t: _verdeel_over_week(beste[t], rnd) for t in TYPES}
    return {
        "keten": keten,
        "boodschappendag": boodschappendag.isoformat(),
        "budget": budget,
        "totaal": budgetbedrag,  # wat deze week op gaat, houdbare producten naar verbruik
        "kassabon": kassabon,  # wat je deze week afrekent
        "binnen_budget": budgetbedrag <= budget,
        "menu": [{"dag": d, **{t: week[t][i]["naam"] for t in TYPES}} for i, d in enumerate(DAGEN)],
        "boodschappen": lijst,
    }


def vergelijk(recepten, ingredientprijzen, huishouden, boodschappendag=None, houdbaar=(), seed=None):
    """Een weekmenu per supermarkt uit het huishouden, goedkoopste eerst."""
    plannen = [plan(recepten, ingredientprijzen, huishouden, k, boodschappendag, houdbaar, seed=seed)
               for k in huishouden.get("supermarkten", ("ah", "jumbo", "lidl"))]
    return sorted((p for p in plannen if p), key=lambda p: p["totaal"])
