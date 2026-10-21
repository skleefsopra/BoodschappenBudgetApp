import datetime
import json

from prijzen.aldi import _lijkt_op, kandidaten, lees_pagina, lees_producten
from prijzen.koppel import Ingredient

VANDAAG = datetime.date(2026, 10, 21)


def product(naam, maat, prijs=None, doorgestreept=None, acties=()):
    p = {"objectID": naam, "name": naam, "productSlug": naam.lower().replace(" ", "-"), "salesUnit": maat}
    if prijs is not None:
        p["currentPrice"] = {"priceValue": prijs}
        if doorgestreept:
            p["currentPrice"]["strikePrice"] = {"strikePriceValue": doorgestreept}
    p["promotionPrices"] = [{"priceValue": a, "validFromLocalDate": van, "validUntilLocalDate": tot}
                            for a, van, tot in acties]
    return p


ANTWOORD = {"producten": [
    product("Scharrelkipfilet", "500 g", 6.90),                                       # vaste prijs
    product("Broccoli", "500 g", 1.15, acties=[(0.89, "2026-10-26", "2026-11-01")]),  # actie volgende week
    product("Wortels", "1 kg", 0.89, doorgestreept=1.29,
            acties=[(0.89, "2026-10-19", "2026-10-25")]),                             # actie nu
    product("Premium bier", "6x330 ml", 4.39, acties=[(4.39, "2026-10-26", "2026-11-01")]),  # alleen in de actie
    product("Kerstkransjes", "200 g", 1.99, acties=[(1.49, "2026-12-07", "2026-12-13")]),    # actie te ver weg
    product("Perssinaas\xadappels", "2 kg", 2.99),
    product("Vintage cheddar", "250 g"),                                              # geen prijs
]}


def namen_en_prijzen(producten):
    return [(p["n"], p["p"], p["tot"]) for p in producten]


def test_lees_producten_vaste_prijs_en_acties_voor_deze_en_volgende_week():
    assert namen_en_prijzen(lees_producten(ANTWOORD, VANDAAG)) == [
        ("Scharrelkipfilet", 6.90, None),
        ("Broccoli", 0.89, "2026-11-01"), ("Broccoli", 1.15, None),
        ("Wortels", 0.89, "2026-10-25"), ("Wortels", 1.29, None),
        ("Premium bier", 4.39, "2026-11-01"),
        ("Kerstkransjes", 1.99, None),
        ("Perssinaasappels", 2.99, None),
    ]


def test_kandidaten_in_koppelformaat_met_bron_en_alleen_bij_actie_looptijd():
    broccoli = Ingredient({"naam": "broccoli", "eenheid": "g", "zoek": ["broccoli"]})
    actie, vast = kandidaten(broccoli, lees_producten(ANTWOORD, VANDAAG))
    assert actie["prijs"] == 0.89 and actie["verpakking"] == 500 and actie["bron"] == "aldi.nl"
    assert actie["geldig_van"] == "2026-10-26" and actie["geldig_tot"] == "2026-11-01"
    assert actie["url"] == "https://www.aldi.nl/product/broccoli.html"
    assert vast["prijs"] == 1.15 and "geldig_tot" not in vast


def test_zacht_afbreekstreepje_uit_de_naam():
    appels = Ingredient({"naam": "appels", "eenheid": "g", "zoek": ["appels"]})
    assert kandidaten(appels, lees_producten(ANTWOORD, VANDAAG)) == []


def test_lees_pagina_haalt_product_uit_paginadata():
    api = json.dumps([["PRODUCT_DETAIL_GET", {"res": {"products": [product("Spaghetti", "500 g", 0.39)]}}]])
    data = {"props": {"pageProps": {"page": {"main": {"apiData": api}}}}}
    html = f'<html><script id="__NEXT_DATA__" type="application/json">{json.dumps(data)}</script></html>'
    assert lees_pagina(html)["currentPrice"]["priceValue"] == 0.39
    assert lees_pagina("<html></html>") is None


def test_lijkt_op_kijkt_ruim_naar_de_url_naam():
    test = _lijkt_op([{"zoek": ["halfvolle melk", "*kipfilet"]}])
    assert test("houdbare-halfvolle-melk") and test("scharrelkipfilet")
    assert not test("volle-kwark")
