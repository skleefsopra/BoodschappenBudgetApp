"""Zet de gegevens klaar voor de telefoon-app in web/data/.

    python3 bouw_prijzen.py && python3 bouw_web.py

De app (web/) heeft alleen deze drie kleine bestanden nodig; de rest rekent hij zelf uit.
"""
import json
import os
import shutil

DOEL = os.path.join("web", "data")

if __name__ == "__main__":
    os.makedirs(DOEL, exist_ok=True)
    shutil.copy("ingredientprijzen.json", DOEL)
    shutil.copy("recepten.json", DOEL)
    with open("ingredienten.json", encoding="utf-8") as f:
        definities = json.load(f)
    # Alleen wat de app nodig heeft om eigen prijzen om te rekenen, niet de zoektermen.
    licht = [{k: d[k] for k in ("naam", "eenheid", "stuk_gewicht", "houdbaar") if k in d} for d in definities]
    with open(os.path.join(DOEL, "ingredienten.json"), "w", encoding="utf-8") as f:
        json.dump(licht, f, ensure_ascii=False)
    print(f"web/data bijgewerkt: {len(licht)} ingrediënten")
