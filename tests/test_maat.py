import pytest
from prijzen.maat import lees_maat


@pytest.mark.parametrize("tekst, verwacht", [
    ("500 g", (500, "g")),
    ("ca. 350 g", (350, "g")),
    ("1,5 l", (1500, "ml")),
    ("1.5 L", (1500, "ml")),
    ("75 cl", (750, "ml")),
    ("6 x 1 L", (6000, "ml")),
    ("2 x 75 ML", (150, "ml")),
    ("8 x 100 g", (800, "g")),
    ("450gr", (450, "g")),
    ("1KG", (1000, "g")),
    ("12 stuks", (12, "stuk")),
    ("Scharreleieren 18st.", (18, "stuk")),
    ("per stuk", (1, "stuk")),
    ("los per kilo", (1000, "g")),
    ("Swirl Vuilniszakken 60 liter 10 stuks", (10, "stuk")),
    ("Halfvolle melk houd.", None),
    ("", None),
])
def test_lees_maat(tekst, verwacht):
    assert lees_maat(tekst) == verwacht
