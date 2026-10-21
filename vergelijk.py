"""Laat zien bij welke supermarkt je weekrecepten het goedkoopst zijn.

    python3 vergelijk.py                   # alle supermarkten
    python3 vergelijk.py jumbo             # met de boodschappenlijst voor één supermarkt
    python3 vergelijk.py --dag 2026-10-26  # voor een andere boodschappendag
"""
import argparse
import datetime
import json

from prijzen.recepten import laad_recepten, porties, vergelijk_winkels


def main():
    a = argparse.ArgumentParser()
    a.add_argument("keten", nargs="?")
    a.add_argument("--dag", type=datetime.date.fromisoformat, default=datetime.date.today())
    args = a.parse_args()

    with open("ingredientprijzen.json", encoding="utf-8") as f:
        prijzen = json.load(f)["ingredienten"]
    with open("huishouden.json", encoding="utf-8") as f:
        huishouden = json.load(f)
    with open("ingredienten.json", encoding="utf-8") as f:
        houdbaar = {d["naam"] for d in json.load(f) if d.get("houdbaar")}
    recepten = laad_recepten("recepten.json", prijzen)

    winkels = vergelijk_winkels(recepten, prijzen, huishouden, args.dag, houdbaar)
    print(f"{len(recepten)} recepten, {porties(huishouden['personen']):g} porties per maaltijd, boodschappen op {args.dag}\n")
    for w in winkels:
        mist = f"  mist: {', '.join(w['ontbrekend'])}" if w["ontbrekend"] else ""
        print(f"  {w['keten']:6} weekbedrag € {w['weekbedrag']:6.2f}  kassabon € {w['kassabon']:6.2f}{mist}")
    for w in winkels:
        if w["keten"] == args.keten:
            print(f"\nBoodschappen bij {w['keten']}:")
            for r in w["boodschappen"]:
                print(f"  {r['aantal']}x {r['product']:50} € {r['prijs']:6.2f}")


if __name__ == "__main__":
    main()
