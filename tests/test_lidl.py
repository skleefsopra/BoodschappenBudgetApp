import datetime

from prijzen.koppel import Ingredient
from prijzen.lidl import combineer, kandidaten, lees_folder

VANDAAG = datetime.date(2026, 10, 21)
GELDIG = [{"validFrom": 1792360800, "validUntil": 1792965599}]  # 19/10 - 25/10
DECEMBER = [{"validFrom": 1796598000, "validUntil": 1797202799}]  # 7/12 - 13/12
VERLOPEN = [{"validFrom": 1791756000, "validUntil": 1792360799}]  # 12/10 - 18/10


def item(titel, prijs, maat=None, categorie="Food", geldig=GELDIG):
    return {"gridbox": {"data": {
        "fullTitle": titel, "category": categorie, "canonicalUrl": f"/p/{titel.lower()}/p1",
        "price": {"price": prijs, "packaging": {"text": maat} if maat else {}},
        "stockAvailability": {"badgeInfoV2": geldig},
    }}}


ANTWOORD = {"items": [
    item("Kipfilet", 9.49, "900 gram", geldig=DECEMBER + GELDIG),
    item("Gewassen spinazie", 0.99, "Zak 450 gram"),
    item("Avocado in net", 2.29, "Net 750 g", categorie="F+V"),
    item("Braadworsten", None),                       # actie nog niet begonnen
    item("Kipfilet oud", 7.99, "1 kg", geldig=VERLOPEN),
    item("Boerenbruin heel", 1.19, "800 g", geldig=DECEMBER),  # actie begint pas over weken
    item("SILVERCREST Staafmixer", 14.99, categorie="Assortiment/Keuken"),
]}


def test_lees_folder_houdt_alleen_eten_met_prijs_voor_deze_en_volgende_week():
    folder = lees_folder(ANTWOORD, VANDAAG)
    assert [p["n"] for p in folder] == ["Kipfilet", "Gewassen spinazie", "Avocado in net"]
    assert folder[0]["s"] == "900 gram" and folder[0]["tot"] == "2026-10-25"


def test_kandidaten_in_koppelformaat_met_bron_en_looptijd():
    kip = Ingredient({"naam": "kipfilet", "eenheid": "g", "zoek": ["kipfilet"]})
    (c,) = kandidaten(kip, lees_folder(ANTWOORD, VANDAAG))
    assert c["verpakking"] == 900 and c["prijs"] == 9.49 and not c["geschat"]
    assert c["url"] == "https://www.lidl.nl/p/kipfilet/p1"
    assert c["bron"] == "lidl.nl" and c["geldig_van"] == "2026-10-19" and c["geldig_tot"] == "2026-10-25"


def test_maat_met_verpakkingswoord_ervoor():
    spinazie = Ingredient({"naam": "spinazie", "eenheid": "g", "zoek": ["spinazie"]})
    (c,) = kandidaten(spinazie, lees_folder(ANTWOORD, VANDAAG))
    assert c["verpakking"] == 450


def test_combineer_folder_vervangt_geschatte_reserve():
    folder = [{"product": "folder", "eenheidsprijs": 0.2, "geschat": False}]
    reserve = [{"product": "geschat", "eenheidsprijs": 0.1, "geschat": True},
               {"product": "gemeten", "eenheidsprijs": 0.15, "geschat": False}]
    assert [c["product"] for c in combineer(folder, reserve)] == ["gemeten", "folder"]
    assert combineer([], reserve) == reserve
