"""Een ingrediënt koppelen aan het goedkoopste passende product per keten.

Een ingrediënt beschrijft met zoektermen welke producten erbij horen:

    {"naam": "kipfilet", "eenheid": "g",
     "zoek": ["kipfilet"], "niet": ["gerookt*", "*blokjes", "kant en klaar"]}

Een zoekterm is een of meer woorden die allemaal in de productnaam moeten
staan. Een woord is een heel woord, tenzij het met * begint of eindigt:
'*eieren' vindt ook 'scharreleieren', 'yoghurt*' ook 'yoghurtdrank'.
"""
import math
import re
import unicodedata

from .maat import maat_van_product

MIN_PRIJS = 0.10  # Lidl-kassabondata bevat regels als 'refill verpakking € 0,01'

# Woorden die nooit een los ingrediënt zijn, voor elk ingrediënt: diervoer,
# babyvoeding, kant-en-klaarmaaltijden, snacks en vitaminepillen.
ALTIJD_NIET = [
    "whiskas", "sheba", "purina", "gourmet", "felix", "pedigree", "*natvoer*", "brokken", "kattenvoer", "hondenvoer",
    "olvarit", "*12m*", "*8m*", "*6m*", "*hapje*", "baby*",
    "*maaltijd*", "ovenschotel", "protein bowl", "high protein meals", "vers aan tafel", "pasta pronto", "*kant en klaar*",
    "chips", "croky", "lay s", "doritos", "tuc", "aviko",
    "kauwtabletten", "davitamon", "*vitamine*", "*plant", "*knuffel*",
]
_ALTIJD_NIET = None


def normaliseer(tekst):
    tekst = unicodedata.normalize("NFKD", tekst.lower())
    tekst = "".join(c for c in tekst if not unicodedata.combining(c))
    return " ".join(re.sub(r"[^a-z0-9]+", " ", tekst).split())


def _woord_regex(woord):
    begin = "" if woord.startswith("*") else r"\b"
    eind = "" if woord.endswith("*") else r"\b"
    kern = re.escape(normaliseer(woord.strip("*")))
    return f"{begin}{kern}{eind}"


def _term_regexen(term):
    return [re.compile(_woord_regex(w)) for w in term.split()]


class Ingredient:
    def __init__(self, definitie):
        self.naam = definitie["naam"]
        self.eenheid = definitie["eenheid"]
        self.stuk_gewicht = definitie.get("stuk_gewicht")  # gram per stuk, voor omrekenen
        self.min_maat = definitie.get("min_maat", 0)
        self.max_maat = definitie.get("max_maat", math.inf)
        self.zoek = [_term_regexen(t) for t in definitie["zoek"]]
        # Grootte voor producten zonder maat, zoals Lidl 'Komkommer' of een AH-brood 'per stuk'.
        # Prijzen op basis hiervan krijgen het label 'geschat'.
        self.standaard_maat = definitie.get("standaard_maat")
        self.niet = [re.compile(_woord_regex(w)) for w in definitie.get("niet", [])]

    def past_naam(self, naam):
        global _ALTIJD_NIET
        if _ALTIJD_NIET is None:
            _ALTIJD_NIET = [re.compile(_woord_regex(w)) for w in ALTIJD_NIET]
        naam = normaliseer(naam)
        if any(r.search(naam) for r in self.niet) or any(r.search(naam) for r in _ALTIJD_NIET):
            return False
        for term in self.zoek:
            treffers = [r.search(naam) for r in term]
            if all(treffers):
                # 'Maïs met kidneybonen' of 'Brokken met tonijn' is geen kidneybonen of tonijn.
                begin = min(t.start() for t in treffers)
                if not re.search(r"\b(met|en)\b", naam[:begin]):
                    return True
        return False

    def hoeveelheid(self, maat):
        """Verpakkingsgrootte in de eenheid van dit ingrediënt, of None als die niet om te rekenen is."""
        if maat is None:
            return None
        hoeveel, eenheid = maat
        if eenheid == self.eenheid:
            return hoeveel
        if self.stuk_gewicht and {eenheid, self.eenheid} == {"g", "stuk"}:
            return hoeveel / self.stuk_gewicht if eenheid == "g" else hoeveel * self.stuk_gewicht
        return None


def kandidaten(ingredient, keten):
    """Alle passende producten van een keten, goedkoopste prijs per eenheid eerst."""
    uit = []
    for p in keten["d"]:
        if p["p"] < MIN_PRIJS or not ingredient.past_naam(p["n"]):
            continue
        hoeveel = ingredient.hoeveelheid(maat_van_product(p))
        geschat = False
        if not hoeveel and ingredient.standaard_maat:
            hoeveel, geschat = ingredient.standaard_maat, True
        if not hoeveel or not ingredient.min_maat <= hoeveel <= ingredient.max_maat:
            continue
        uit.append({
            "product": p["n"],
            "prijs": p["p"],
            "verpakking": round(hoeveel, 2),
            "eenheidsprijs": p["p"] / hoeveel,
            "url": keten["u"] + p["l"],
            "geschat": geschat,
        })
    uit.sort(key=lambda k: k["eenheidsprijs"])
    return uit


def kosten(keuze, nodig):
    """Wat je kwijt bent als je `nodig` (in de eenheid van het ingrediënt) moet kopen."""
    pakken = math.ceil(nodig / keuze["verpakking"] - 1e-9)
    return pakken, round(pakken * keuze["prijs"], 2)
