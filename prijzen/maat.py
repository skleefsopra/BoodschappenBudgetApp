"""Verpakkingsgroottes uitlezen, bijvoorbeeld '2 x 75 ml' of 'ca. 350 g'.

Alles wordt omgerekend naar een basiseenheid: g, ml of stuk.
"""
import re

EENHEDEN = {
    "g": ("g", 1), "gr": ("g", 1), "gram": ("g", 1), "grams": ("g", 1), "grm": ("g", 1),
    "kg": ("g", 1000), "kilo": ("g", 1000),
    "ml": ("ml", 1), "mililiters": ("ml", 1), "milliliter": ("ml", 1),
    "cl": ("ml", 10),
    "l": ("ml", 1000), "liter": ("ml", 1000), "liters": ("ml", 1000), "ltr": ("ml", 1000),
    "st": ("stuk", 1), "stuk": ("stuk", 1), "stuks": ("stuk", 1), "stk": ("stuk", 1),
}

_GETAL = r"(\d+(?:[.,]\d+)?)"
_EENHEID = r"(kg|kilo|grams|gram|grm|gr|g|mililiters|milliliter|ml|cl|liters|liter|ltr|l|stuks|stuk|stk|st)"
# '6 x 1 L', '2x75ml', '8 x 100 g'
_MULTI = re.compile(rf"(\d+)\s*x\s*{_GETAL}\s*{_EENHEID}\b\.?", re.I)
_ENKEL = re.compile(rf"{_GETAL}\s*{_EENHEID}\b\.?", re.I)
_PER = re.compile(r"^(los\s+)?per\s+(stuk|bos|bosje|kilo|kg)$", re.I)


def _getal(s):
    return float(s.replace(",", "."))


def lees_maat(tekst):
    """Geeft (hoeveelheid, eenheid) of None als er geen maat in de tekst staat."""
    if not tekst:
        return None
    t = tekst.strip()
    m = _PER.match(t)
    if m:
        return (1000.0, "g") if m.group(2).lower() in ("kilo", "kg") else (1.0, "stuk")
    m = _MULTI.search(t)
    if m:
        eenheid, factor = EENHEDEN[m.group(3).lower()]
        return int(m.group(1)) * _getal(m.group(2)) * factor, eenheid
    # Bij meerdere maten in een naam ('60 liter 10 stuks') telt de laatste;
    # bij producten staat de verpakkingsgrootte bijna altijd achteraan.
    treffers = list(_ENKEL.finditer(t))
    if treffers:
        m = treffers[-1]
        eenheid, factor = EENHEDEN[m.group(2).lower()]
        return _getal(m.group(1)) * factor, eenheid
    return None


def maat_van_product(product):
    """Maat uit het maatveld, en anders uit de productnaam (Jumbo en Lidl laten het veld vaak leeg)."""
    return lees_maat(product.get("s")) or lees_maat(product.get("n"))
