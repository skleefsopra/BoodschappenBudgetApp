"""Aanbiedingen van de week van lidl.nl, als extra bron naast de Checkjebon-data.

Lidl zet niet het vaste assortiment online, alleen de folder: ongeveer 50 tot 60
etenswaren per week, met prijs, verpakkingsgrootte en de dagen dat de actie
loopt. Producten zonder prijs en acties die pas na volgende week beginnen slaan
we over. Het overzicht zonder zoekwoord mist een deel van de folder, daarom
zoeken we ook op de eerste zoekterm van elk ingrediënt.

Volgorde voor Lidl: zelf ingevulde prijzen (eigen.py) gaan voor, dan lidl.nl,
dan boodschaapje via Checkjebon als reserve.
"""
import datetime
import json
import os
import time
import urllib.parse
import urllib.request
import zoneinfo

from .koppel import kandidaten as _kandidaten

BASIS = "https://www.lidl.nl"
ZOEK = BASIS + "/q/api/search?"
# Zonder browserachtige headers geeft lidl.nl 503.
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "nl-NL,nl;q=0.9",
}
NL = zoneinfo.ZoneInfo("Europe/Amsterdam")
ETEN = ("Food", "F+V")  # 'P+F' is planten en bloemen
CACHE = os.path.join(os.path.dirname(__file__), "..", "cache", "lidl.json")


def _datum(epoch):
    return datetime.datetime.fromtimestamp(epoch, NL).date().isoformat() if epoch else None


def lees_folder(antwoord, vandaag=None):
    """Zet het antwoord van de zoek-API om naar producten: naam, prijs, maat, url en looptijd."""
    vandaag = vandaag or datetime.date.today()
    vandaag, over_een_week = vandaag.isoformat(), (vandaag + datetime.timedelta(days=7)).isoformat()
    uit = []
    for item in antwoord.get("items", []):
        g = item.get("gridbox", {}).get("data", {})
        prijs = (g.get("price") or {}).get("price")
        if g.get("category") not in ETEN or prijs is None:
            continue
        # Een product kan meerdere actieperiodes hebben ('19/10 - 25/10' en '09/11 - 15/11').
        periodes = [(_datum(b.get("validFrom")), _datum(b.get("validUntil")))
                    for b in (g.get("stockAvailability") or {}).get("badgeInfoV2") or [{}]]
        lopend = [(van, tot) for van, tot in periodes
                  if not (tot and tot < vandaag) and not (van and van > over_een_week)]
        if not lopend:
            continue
        van, tot = min(lopend, key=lambda p: p[0] or "")
        uit.append({
            "n": g["fullTitle"],
            "p": prijs,
            "s": ((g["price"].get("packaging") or {}).get("text") or ""),
            "l": g.get("canonicalUrl", ""),
            "van": van,
            "tot": tot,
        })
    return uit


def _zoek(q):
    url = ZOEK + urllib.parse.urlencode({"q": q, "category": "Eten & drinken", "assortment": "NL",
                                         "locale": "nl_NL", "version": "v2.0.0", "fetchsize": 1000})
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=60) as r:
        return json.load(r).get("items", [])


def haal_op(zoektermen=()):
    """Alle etenswaren uit de folder: het overzicht plus een zoekopdracht per zoekterm, zonder dubbelen."""
    items = {}
    for q in ("", *dict.fromkeys(zoektermen)):
        for item in _zoek(q):
            items.setdefault(item.get("code"), item)
        time.sleep(0.3)
    return {"items": list(items.values())}


def laad(zoektermen=(), max_leeftijd_uur=12, cache=CACHE):
    """Haalt de folder op, met een lokale kopie. Lukt het niet, dan een lege lijst: Checkjebon blijft dan over."""
    cache = os.path.abspath(cache)
    if not (os.path.exists(cache) and time.time() - os.path.getmtime(cache) < max_leeftijd_uur * 3600):
        try:
            antwoord = haal_op(zoektermen)
        except Exception as e:
            print(f"lidl.nl niet bereikbaar ({e}), alleen Checkjebon-prijzen voor Lidl")
            return []
        os.makedirs(os.path.dirname(cache), exist_ok=True)
        with open(cache, "w", encoding="utf-8") as f:
            json.dump(antwoord, f, ensure_ascii=False)
    with open(cache, encoding="utf-8") as f:
        return lees_folder(json.load(f))


def zoektermen(definities):
    """De eerste zoekterm van elk ingrediënt, zonder jokers: 'halfvolle melk', 'eieren'."""
    return [d["zoek"][0].replace("*", "") for d in definities]


def kandidaten(ingredient, folder):
    """Passende folderproducten, in hetzelfde formaat als koppel.kandidaten plus bron en looptijd."""
    looptijd = {BASIS + p["l"]: (p["van"], p["tot"]) for p in folder}
    uit = _kandidaten(ingredient, {"u": BASIS, "d": folder})
    for c in uit:
        c["bron"] = "lidl.nl"
        c["geldig_van"], c["geldig_tot"] = looptijd[c["url"]]
    return uit


def combineer(folder, reserve):
    """Folderproducten en Checkjebon samen. Met een folderproduct vallen geschatte Checkjebon-producten weg."""
    if not folder:
        return reserve
    gemeten = [c for c in reserve if not c.get("geschat")]
    return sorted(folder + gemeten, key=lambda c: c["eenheidsprijs"])
