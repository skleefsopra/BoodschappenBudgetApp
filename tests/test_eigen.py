import pytest

from prijzen.eigen import kandidaat, voeg_toe
from prijzen.koppel import Ingredient

BANANEN = Ingredient({"naam": "bananen", "eenheid": "stuk", "stuk_gewicht": 180, "zoek": ["bananen"]})


def test_maat_wordt_omgerekend_naar_eenheid_van_ingredient():
    c = kandidaat({"product": "Bananen", "prijs": 1.80, "maat": "1,8 kg"}, BANANEN)
    assert c["verpakking"] == 10 and c["eenheidsprijs"] == pytest.approx(0.18)
    assert c["bron"] == "eigen" and not c["geschat"]


def test_eigen_product_vervangt_geschatte_maar_niet_gemeten_producten():
    dataset = [{"product": "geschat", "eenheidsprijs": 0.1, "geschat": True},
               {"product": "gemeten", "eenheidsprijs": 0.3, "geschat": False}]
    uit = voeg_toe(dataset, [{"product": "eigen", "prijs": 1.0, "maat": "5 stuks"}], BANANEN)
    assert [c["product"] for c in uit] == ["eigen", "gemeten"]


def test_zonder_eigen_invoer_blijft_alles_gelijk():
    dataset = [{"product": "geschat", "eenheidsprijs": 0.1, "geschat": True}]
    assert voeg_toe(dataset, None, BANANEN) == dataset


def test_duidelijke_fout_bij_verkeerde_maat():
    with pytest.raises(ValueError, match="past niet"):
        kandidaat({"product": "Bananen", "prijs": 1.0, "maat": "1 L"}, BANANEN)
    with pytest.raises(ValueError, match="geen maat"):
        kandidaat({"product": "Bananen", "prijs": 1.0, "maat": "een tros"}, BANANEN)
