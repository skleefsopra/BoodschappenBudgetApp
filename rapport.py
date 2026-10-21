"""Laat per ingrediënt de beste koppelingen per keten zien, om de zoektermen te controleren."""
import json, sys
from prijzen.data import laad, KETENS
from prijzen.koppel import Ingredient, kandidaten

ketens = laad()
filt = sys.argv[1:]
for d in json.load(open("ingredienten.json", encoding="utf-8")):
    if filt and d["naam"] not in filt:
        continue
    ing = Ingredient(d)
    print(f"\n== {ing.naam} ({ing.eenheid})")
    for k in KETENS:
        ks = kandidaten(ing, ketens[k])
        print(f"  {k}: {len(ks)} kandidaten")
        for c in ks[:4]:
            print(f"     € {c['prijs']:>5.2f} / {c['verpakking']:>7g} = {c['eenheidsprijs']*(1000 if ing.eenheid!='stuk' else 1):6.2f}  {c['product']}")
