"""Maakt een weekmenu per supermarkt en laat de totaalprijs zien.

    python3 plan_week.py                  # vergelijk alle supermarkten
    python3 plan_week.py jumbo            # menu en boodschappenlijst voor één supermarkt
    python3 plan_week.py --dag 2026-10-26 # plannen voor een andere boodschappendag

Schrijft weekplan.json met alle plannen, voor de app.
"""
import argparse
import datetime
import json

from prijzen.planner import vergelijk
from prijzen.recepten import laad_recepten, porties


def main():
    a = argparse.ArgumentParser()
    a.add_argument("keten", nargs="?")
    a.add_argument("--dag", type=datetime.date.fromisoformat, default=datetime.date.today())
    a.add_argument("--seed", type=int)
    args = a.parse_args()

    with open("ingredientprijzen.json", encoding="utf-8") as f:
        prijzen = json.load(f)["ingredienten"]
    with open("huishouden.json", encoding="utf-8") as f:
        huishouden = json.load(f)
    with open("ingredienten.json", encoding="utf-8") as f:
        houdbaar = {d["naam"] for d in json.load(f) if d.get("houdbaar")}
    recepten = laad_recepten("recepten.json", prijzen)

    plannen = vergelijk(recepten, prijzen, huishouden, args.dag, houdbaar, seed=args.seed)
    with open("weekplan.json", "w", encoding="utf-8") as f:
        json.dump(plannen, f, ensure_ascii=False, indent=1)

    budget = huishouden.get("budget_per_week")
    print(f"Week vanaf {args.dag}, {porties(huishouden['personen']):g} porties per maaltijd, budget € {budget:.2f}\n")
    for p in plannen:
        teken = "binnen budget" if p["binnen_budget"] else f"€ {p['totaal'] - budget:.2f} te duur"
        print(f"  {p['keten']:6} € {p['totaal']:6.2f}  ({teken}, kassabon deze week € {p['kassabon']:.2f})")

    for p in plannen:
        if args.keten and p["keten"] != args.keten:
            continue
        print(f"\n== {p['keten']}: € {p['totaal']:.2f}")
        for d in p["menu"]:
            print(f"  {d['dag']:10} {d['ontbijt']:32} | {d['lunch']:30} | {d['diner']}")
        if args.keten:
            print("\n  Boodschappenlijst:")
            for r in p["boodschappen"]:
                extra = (" (maat geschat)" if r["geschat"] else "") + (" (gaat langer mee)" if r["houdbaar"] else "")
                print(f"    {r['aantal']}x {r['product']:50} € {r['prijs']:6.2f}{extra}")


if __name__ == "__main__":
    main()
