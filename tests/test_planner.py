import datetime
import json
import pathlib

from prijzen.planner import DAGEN, MAX_HERHALING, plan, prijzen_op_dag, vergelijk
from prijzen.recepten import laad_recepten

MAP = pathlib.Path(__file__).parent.parent
PRIJZEN = json.loads((MAP / "ingredientprijzen.json").read_text(encoding="utf-8"))["ingredienten"]
RECEPTEN = laad_recepten(MAP / "recepten.json", PRIJZEN)
HOUDBAAR = {d["naam"] for d in json.loads((MAP / "ingredienten.json").read_text(encoding="utf-8")) if d.get("houdbaar")}
DAG = datetime.date(2026, 10, 21)


def huishouden(budget, **extra):
    return {"personen": [{"naam": "a"}], "budget_per_week": budget, "supermarkten": ["ah", "jumbo", "lidl"], **extra}


def test_volledige_week_met_afwisseling():
    p = plan(RECEPTEN, PRIJZEN, huishouden(60), "jumbo", DAG, HOUDBAAR, seed=1)
    assert [d["dag"] for d in p["menu"]] == list(DAGEN)
    for soort, maximaal in MAX_HERHALING.items():
        namen = [d[soort] for d in p["menu"]]
        assert max(namen.count(n) for n in namen) <= maximaal
        assert all(a != b for a, b in zip(namen, namen[1:])), f"twee dagen achter elkaar hetzelfde {soort}"


def test_ruim_budget_wordt_gehaald_en_houdbaar_telt_naar_verbruik():
    p = plan(RECEPTEN, PRIJZEN, huishouden(60), "ah", DAG, HOUDBAAR, seed=1)
    assert p["binnen_budget"] and p["totaal"] <= 60
    assert p["totaal"] < p["kassabon"]  # een pot pindakaas is niet in één week op


def test_te_krap_budget_wordt_gemeld():
    p = plan(RECEPTEN, PRIJZEN, huishouden(5), "ah", DAG, HOUDBAAR, seed=1)
    assert not p["binnen_budget"]


def test_voorraad_hoeft_niet_gekocht():
    zonder = plan(RECEPTEN, PRIJZEN, huishouden(60), "jumbo", DAG, HOUDBAAR, seed=3)
    voorraad = {r["ingredient"]: 10_000 for r in zonder["boodschappen"] if r["houdbaar"]}
    met = plan(RECEPTEN, PRIJZEN, huishouden(60, voorraad=voorraad), "jumbo", DAG, HOUDBAAR, seed=3)
    assert not any(r["ingredient"] in voorraad for r in met["boodschappen"])


def test_verlopen_aanbieding_valt_weg():
    prijzen = {"x": {"eenheid": "g", "ketens": {"lidl": [
        {"product": "oud", "geldig_tot": "2026-10-19"}, {"product": "nu", "geldig_van": "2026-10-20", "geldig_tot": "2026-10-26"},
        {"product": "later", "geldig_van": "2026-11-09"}, {"product": "vast"}]}}}
    assert [c["product"] for c in prijzen_op_dag(prijzen, DAG)["x"]["ketens"]["lidl"]] == ["nu", "vast"]


def test_vergelijk_geeft_goedkoopste_eerst():
    plannen = vergelijk(RECEPTEN, PRIJZEN, huishouden(60), DAG, HOUDBAAR, seed=1)
    assert len(plannen) == 3
    assert [p["totaal"] for p in plannen] == sorted(p["totaal"] for p in plannen)
