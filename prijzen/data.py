"""Actuele productprijzen ophalen uit de open dataset van Checkjebon."""
import json
import os
import time
import urllib.request

URL = "https://raw.githubusercontent.com/supermarkt/checkjebon/main/data/supermarkets.json"
KETENS = ("ah", "jumbo", "lidl")
CACHE = os.path.join(os.path.dirname(__file__), "..", "cache", "supermarkets.json")


def laad(max_leeftijd_uur=12, cache=CACHE):
    """Laadt de dataset, met een lokale kopie zodat we niet elke run 10 MB downloaden."""
    cache = os.path.abspath(cache)
    vers = os.path.exists(cache) and time.time() - os.path.getmtime(cache) < max_leeftijd_uur * 3600
    if not vers:
        os.makedirs(os.path.dirname(cache), exist_ok=True)
        with urllib.request.urlopen(URL, timeout=120) as r:
            inhoud = r.read()
        with open(cache, "wb") as f:
            f.write(inhoud)
    with open(cache, encoding="utf-8") as f:
        data = json.load(f)
    return {s["n"]: s for s in data if s["n"] in KETENS}
