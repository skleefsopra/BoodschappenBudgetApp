"""Prijzen van aldi.nl, want Checkjebon heeft geen Aldi-producten.

aldi.nl heeft geen openbare prijzenlijst, maar wel drie dingen die we kunnen lezen:

- een lijst van alle ongeveer 2.700 product-id's (/api/product/algolia/browse/nl),
- de aanbiedingen van deze en volgende week, met prijs en looptijd (/api/offer/nl/current en /next),
- per product een pagina met de vaste prijs en de verpakking in de paginadata (__NEXT_DATA__).

Alle productpagina's ophalen kost te lang, daarom halen we alleen de pagina's op
waarvan de naam in de url op een zoekterm van een ingrediënt lijkt (een paar
honderd). Een aanbieding wordt een kandidaat met `geldig_van`/`geldig_tot`, net
als bij lidl.nl; de vaste prijs een kandidaat zonder looptijd.

Volgorde voor Aldi: zelf ingevulde prijzen (eigen.py) gaan voor, dan aldi.nl.
"""
import concurrent.futures
import datetime
import json
import os
import re
import time
import urllib.request

from .koppel import kandidaten as _kandidaten
from .koppel import normaliseer
from .lidl import combineer  # noqa: F401  zelfde regel als bij Lidl

BASIS = "https://www.aldi.nl"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    "Accept-Language": "nl-NL,nl;q=0.9",
}
CACHE = os.path.join(os.path.dirname(__file__), "..", "cache", "aldi.json")
TEGELIJK = 6  # productpagina's die we tegelijk ophalen
_NEXT_DATA = re.compile(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.S)


def _haal(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=60) as r:
        return r.read().decode("utf-8")


def _api_data(o):
    """Zoekt de 'apiData'-velden in de paginadata; daarin staat het product."""
    if isinstance(o, dict):
        for k, v in o.items():
            if k == "apiData" and isinstance(v, str):
                yield from json.loads(v)
            else:
                yield from _api_data(v)
    elif isinstance(o, list):
        for v in o:
            yield from _api_data(v)


def lees_pagina(html):
    """Het product uit de paginadata van een productpagina, of None."""
    m = _NEXT_DATA.search(html)
    if not m:
        return None
    for naam, data in _api_data(json.loads(m.group(1))):
        if naam == "PRODUCT_DETAIL_GET":
            producten = (data.get("res") or {}).get("products") or []
            return producten[0] if producten else None
    return None


def _lijkt_op(definities):
    """Test of een url-naam ('scharrel-kipdijfilet') op een zoekterm lijkt. Ruim: spaties en jokers tellen niet."""
    termen = [[normaliseer(w.strip("*")).replace(" ", "") for w in t.split()] for d in definities for t in d["zoek"]]

    def test(slug):
        s = normaliseer(slug).replace(" ", "")
        return any(all(w in s for w in term) for term in termen)
    return test


def _pagina(product_id, slug):
    try:
        return lees_pagina(_haal(f"{BASIS}/product/{slug}-{product_id}.html"))
    except Exception:
        return None


def haal_op(definities):
    """Aanbiedingen plus de productpagina's die bij een ingrediënt kunnen horen, als ruwe productgegevens."""
    producten = {}
    for week in ("current", "next"):
        producten.update(json.loads(_haal(f"{BASIS}/api/offer/nl/{week}")).get("algoliaDataMap") or {})
    lijkt_op = _lijkt_op(definities)
    alle = [h for pagina in json.loads(_haal(f"{BASIS}/api/product/algolia/browse/nl")) for h in pagina["hits"]]
    te_halen = [(h["objectID"], h["productSlug"]) for h in alle
                if h["objectID"] not in producten and lijkt_op(h["productSlug"])]
    with concurrent.futures.ThreadPoolExecutor(TEGELIJK) as pool:
        for p in pool.map(lambda h: _pagina(*h), te_halen):
            if p:
                producten[p["objectID"]] = p
    return {"producten": list(producten.values())}


def _looptijd(prijs):
    return prijs.get("validFromLocalDate"), prijs.get("validUntilLocalDate")


def lees_producten(antwoord, vandaag=None):
    """Zet ruwe productgegevens om naar producten: naam, prijs, maat, url en (bij een aanbieding) looptijd.

    Een product kan twee keer voorkomen: als aanbieding en met de vaste prijs.
    Aanbiedingen die al voorbij zijn of pas na volgende week beginnen slaan we over.
    """
    vandaag = vandaag or datetime.date.today()
    vandaag, over_een_week = vandaag.isoformat(), (vandaag + datetime.timedelta(days=7)).isoformat()
    uit = []
    for p in antwoord.get("producten", []):
        if not p.get("name") or not p.get("productSlug"):
            continue
        # aldi.nl zet zachte afbreekstreepjes in lange namen: 'Perssinaas\xadappels'.
        basis = {"n": p["name"].replace("\xad", ""), "s": p.get("salesUnit") or "", "l": f"/product/{p['productSlug']}.html"}
        acties = []
        for a in p.get("promotionPrices") or []:
            van, tot = _looptijd(a)
            if a.get("priceValue") is None or (tot and tot < vandaag) or (van and van > over_een_week):
                continue
            acties.append(a["priceValue"])
            uit.append({**basis, "p": a["priceValue"], "van": van, "tot": tot})
        # Tijdens een actie is currentPrice de actieprijs; de vaste prijs staat dan in strikePrice.
        nu = p.get("currentPrice") or {}
        vast = (nu.get("strikePrice") or {}).get("strikePriceValue") or nu.get("priceValue")
        # Zelfde prijs als een actie: een actieartikel dat alleen die week te koop is.
        if vast is not None and vast not in acties:
            uit.append({**basis, "p": vast, "van": None, "tot": None})
    return uit


def laad(definities, max_leeftijd_uur=12, cache=CACHE):
    """Haalt de producten op, met een lokale kopie. Lukt het niet, dan een lege lijst: Aldi heeft dan geen prijzen."""
    cache = os.path.abspath(cache)
    if not (os.path.exists(cache) and time.time() - os.path.getmtime(cache) < max_leeftijd_uur * 3600):
        try:
            antwoord = haal_op(definities)
        except Exception as e:
            print(f"aldi.nl niet bereikbaar ({e}), geen Aldi-prijzen")
            return []
        os.makedirs(os.path.dirname(cache), exist_ok=True)
        with open(cache, "w", encoding="utf-8") as f:
            json.dump(antwoord, f, ensure_ascii=False)
    with open(cache, encoding="utf-8") as f:
        return lees_producten(json.load(f))


def kandidaten(ingredient, producten):
    """Passende producten, in hetzelfde formaat als koppel.kandidaten plus bron en (bij een aanbieding) looptijd."""
    uit = []
    for p in producten:
        for c in _kandidaten(ingredient, {"u": BASIS, "d": [p]}):
            c["bron"] = "aldi.nl"
            if p["van"] or p["tot"]:
                c["geldig_van"], c["geldig_tot"] = p["van"], p["tot"]
            uit.append(c)
    uit.sort(key=lambda c: c["eenheidsprijs"])
    return uit
