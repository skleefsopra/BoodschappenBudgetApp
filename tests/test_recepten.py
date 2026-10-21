import json
import pathlib

from prijzen.recepten import benodigd, boodschappen, controleer, porties, portieprijs

MAP = pathlib.Path(__file__).parent.parent

PRIJZEN = {
    "spaghetti": {"eenheid": "g", "ketens": {"ah": [{"product": "Spaghetti", "prijs": 1.0, "verpakking": 500,
                                                     "eenheidsprijs": 0.002, "url": "", "geschat": False}],
                                             "lidl": []}},
}
RECEPT = {"naam": "Pasta", "type": "diner", "ingredienten": [{"naam": "spaghetti", "hoeveelheid": 100}]}


def test_porties_tellen_factoren_op():
    assert porties([{"naam": "a", "factor": 1.0}, {"naam": "kind", "factor": 0.6}]) == 1.6


def test_benodigd_schaalt_en_telt_herhalingen_op():
    huishouden = [{"naam": "a"}, {"naam": "b"}]
    assert benodigd([RECEPT, RECEPT, RECEPT], huishouden) == {"spaghetti": 600}


def test_boodschappen_koopt_hele_verpakkingen_en_meldt_ontbrekend():
    lijst, totaal, ontbrekend = boodschappen({"spaghetti": 600}, PRIJZEN, "ah")
    assert lijst[0]["aantal"] == 2 and totaal == 2.0 and ontbrekend == []
    assert boodschappen({"spaghetti": 600}, PRIJZEN, "lidl")[2] == ["spaghetti"]


def test_portieprijs_telt_alleen_gebruikt_deel():
    assert portieprijs(RECEPT, PRIJZEN, "ah") == 0.2
    assert portieprijs(RECEPT, PRIJZEN, "lidl") is None


def test_controleer_vindt_typefouten():
    fout = {"naam": "X", "type": "brunch", "ingredienten": [{"naam": "spagetti", "hoeveelheid": 1}]}
    assert len(controleer([fout], PRIJZEN)) == 2


def test_meegeleverde_recepten_zijn_geldig():
    prijzen = json.loads((MAP / "ingredientprijzen.json").read_text(encoding="utf-8"))["ingredienten"]
    recepten = json.loads((MAP / "recepten.json").read_text(encoding="utf-8"))
    assert controleer(recepten, prijzen) == []
