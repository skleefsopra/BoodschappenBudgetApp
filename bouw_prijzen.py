"""Maakt ingredientprijzen.json: per ingrediënt de goedkoopste passende producten per keten.

Dit kleine bestand is wat de weekplanner en later de telefoon-app gebruiken,
zodat die niet zelf de hele dataset van 10 MB hoeven te laden.

    python3 bouw_prijzen.py
"""
import datetime
import json

from prijzen import aldi, eigen, lidl
from prijzen.data import KETENS, laad
from prijzen.koppel import Ingredient, kandidaten

MAX_KANDIDATEN = 5


def bouw(ketens, definities, eigen_prijzen=None, lidl_folder=None, aldi_producten=None):
    eigen_prijzen = eigen_prijzen or {}
    uit = {}
    for d in definities:
        ing = Ingredient(d)
        gevonden = {k: kandidaten(ing, ketens[k]) for k in KETENS}
        # Lidl: eerst de folder van lidl.nl, Checkjebon als reserve; eigen prijzen gaan daar weer boven.
        gevonden["lidl"] = lidl.combineer(lidl.kandidaten(ing, lidl_folder or []), gevonden["lidl"])
        # Aldi: aldi.nl, want Checkjebon heeft geen Aldi-producten.
        gevonden["aldi"] = aldi.combineer(aldi.kandidaten(ing, aldi_producten or []), gevonden["aldi"])
        uit[ing.naam] = {
            "eenheid": ing.eenheid,
            "ketens": {k: eigen.voeg_toe(gevonden[k], eigen_prijzen.get(k, {}).get(ing.naam), ing)
                       [:MAX_KANDIDATEN] for k in KETENS},
        }
        for lijst in uit[ing.naam]["ketens"].values():
            for c in lijst:
                c["eenheidsprijs"] = round(c["eenheidsprijs"], 5)
    return uit


if __name__ == "__main__":
    with open("ingredienten.json", encoding="utf-8") as f:
        definities = json.load(f)
    folder = lidl.laad(lidl.zoektermen(definities))
    aldi_producten = aldi.laad(definities)
    prijzen = bouw(laad(), definities, eigen.laad("eigen_prijzen.json"), folder, aldi_producten)
    with open("ingredientprijzen.json", "w", encoding="utf-8") as f:
        json.dump({"gemaakt": datetime.datetime.now().isoformat(timespec="minutes"),
                   "ingredienten": prijzen}, f, ensure_ascii=False, indent=1)
    print(f"{len(prijzen)} ingrediënten, {len(folder)} Lidl-aanbiedingen op lidl.nl, "
          f"{len(aldi_producten)} Aldi-prijzen op aldi.nl.")
    for n, i in prijzen.items():
        for c in i["ketens"]["lidl"]:
            if c.get("bron") == "lidl.nl":
                print(f"  lidl.nl aanbieding voor {n}: {c['product']} € {c['prijs']:.2f} t/m {c['geldig_tot']}")
    for k in KETENS:
        ontbreekt = [n for n, i in prijzen.items() if not i["ketens"][k]]
        geschat = [n for n, i in prijzen.items() if i["ketens"][k] and all(c["geschat"] for c in i["ketens"][k])]
        if ontbreekt:
            print(f"  {k}, geen product: {', '.join(ontbreekt)}")
        if geschat:
            print(f"  {k}, alleen geschatte maat: {', '.join(geschat)}")
    print("Vul ontbrekende prijzen zelf in via eigen_prijzen.json (zie README).")
