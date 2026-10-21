from prijzen.koppel import Ingredient, kandidaten, kosten


def keten(*producten):
    return {"u": "https://voorbeeld/", "d": [dict(n=n, p=p, s=s, l="x") for n, p, s in producten]}


def test_past_naam_met_jokers_en_uitsluitingen():
    ing = Ingredient({"naam": "eieren", "eenheid": "stuk", "zoek": ["*eieren"], "niet": ["paas*"]})
    assert ing.past_naam("AH Scharreleieren")
    assert not ing.past_naam("Gevulde paaseieren")


def test_ingredient_na_met_telt_niet():
    ing = Ingredient({"naam": "tonijn", "eenheid": "g", "zoek": ["tonijn"]})
    assert ing.past_naam("Statesman Tonijn stukken in water")
    assert not ing.past_naam("Kipsalade met tonijn")


def test_goedkoopste_per_eenheid_en_omrekenen_stuks():
    ing = Ingredient({"naam": "uien", "eenheid": "g", "stuk_gewicht": 120, "zoek": ["uien"]})
    k = kandidaten(ing, keten(("Gele uien", 0.99, "1 kg"), ("Uien net", 1.99, "5 kg"), ("Uien", 0.05, "1 kg")))
    assert [c["product"] for c in k] == ["Uien net", "Gele uien"]  # te goedkope regel valt af


def test_standaard_maat_wordt_als_geschat_gemarkeerd():
    ing = Ingredient({"naam": "komkommer", "eenheid": "stuk", "standaard_maat": 1, "zoek": ["komkommer"]})
    (c,) = kandidaten(ing, keten(("Komkommer", 0.75, "")))
    assert c["geschat"] and c["verpakking"] == 1


def test_kosten_rondt_af_op_hele_verpakkingen():
    assert kosten({"verpakking": 500, "prijs": 1.20}, 600) == (2, 2.40)
    assert kosten({"verpakking": 500, "prijs": 1.20}, 500) == (1, 1.20)


def test_vetpercentage_sluit_niet_uit():
    ing = Ingredient({"naam": "rundergehakt", "eenheid": "g", "zoek": ["rundergehakt"]})
    assert ing.past_naam("Rundergehakt 15%")
    assert not ing.past_naam("Whiskas brokken rundergehakt")
