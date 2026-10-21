"""Zelf ingevulde prijzen, voor wat de dataset niet (goed) heeft.

Vooral voor Lidl: daar ontbreken vaak de verpakkingsgrootte of het hele product.
Je vult ze in in eigen_prijzen.json, per supermarkt en ingrediënt:

    {"lidl": {
        "bananen": [{"product": "Bananen tros", "prijs": 1.29, "maat": "5 stuks", "datum": "2026-10-21"}],
        "broccoli": [{"product": "Broccoli", "prijs": 0.99, "maat": "500 g"}]
    }}

`maat` schrijf je zoals op het schap ('1 kg', '6 x 1 L', '10 stuks'). Een zelf
ingevuld product vervangt de geschatte producten voor dat ingrediënt, want die
zijn minder betrouwbaar. Echte producten uit de dataset blijven gewoon meedoen.
"""
import json
import os

from .maat import lees_maat


def laad(pad):
    if not os.path.exists(pad):
        return {}
    with open(pad, encoding="utf-8") as f:
        return json.load(f)


def kandidaat(invoer, ingredient):
    """Maakt van een ingevuld product een kandidaat in hetzelfde formaat als koppel.kandidaten."""
    maat = lees_maat(invoer["maat"])
    if maat is None:
        raise ValueError(f"'{invoer['maat']}' bij {invoer['product']} is geen maat (schrijf bijvoorbeeld '500 g' of '6 stuks')")
    hoeveel = ingredient.hoeveelheid(maat)
    if not hoeveel:
        raise ValueError(f"{invoer['product']}: '{invoer['maat']}' past niet bij {ingredient.naam}, "
                         f"dat in {ingredient.eenheid} gaat")
    return {
        "product": invoer["product"],
        "prijs": invoer["prijs"],
        "verpakking": round(hoeveel, 2),
        "eenheidsprijs": invoer["prijs"] / hoeveel,
        "url": invoer.get("url", ""),
        "geschat": False,
        "bron": "eigen",
        "datum": invoer.get("datum"),
    }


def voeg_toe(kandidaten, eigen, ingredient):
    """Voegt zelf ingevulde producten toe; geschatte producten uit de dataset vallen dan weg."""
    if not eigen:
        return kandidaten
    gemeten = [c for c in kandidaten if not c.get("geschat")]
    samen = gemeten + [kandidaat(e, ingredient) for e in eigen]
    return sorted(samen, key=lambda c: c["eenheidsprijs"])
