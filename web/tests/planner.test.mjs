// node --test web/tests
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { leesMaat, kosten, eigenKandidaat, metEigenPrijzen, vergelijk, prijzenOpDag } from "../planner.js";

const lees = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const prijzen = lees("../data/ingredientprijzen.json").ingredienten;
const recepten = lees("../data/recepten.json");
const ing = Object.fromEntries(lees("../data/ingredienten.json").map((d) => [d.naam, d]));

test("maten lezen zoals de Python-versie", () => {
  assert.deepEqual(leesMaat("6 x 1 L"), [6000, "ml"]);
  assert.deepEqual(leesMaat("1,8 kg"), [1800, "g"]);
  assert.deepEqual(leesMaat("Scharreleieren 18st."), [18, "stuk"]);
  assert.deepEqual(leesMaat("per stuk"), [1, "stuk"]);
  assert.equal(leesMaat("een tros"), null);
});

test("hele verpakkingen", () => assert.deepEqual(kosten({ verpakking: 500, prijs: 1.2 }, 600), [2, 2.4]));

test("eigen prijs rekent om en vervangt geschatte", () => {
  const c = eigenKandidaat({ product: "Bananen", prijs: 1.8, maat: "1,8 kg" }, { naam: "bananen", ...ing.bananen });
  assert.equal(c.verpakking, 10);
  const p = metEigenPrijzen(prijzen, ing, { lidl: { komkommer: [{ product: "Komkommer", prijs: 0.7, maat: "1 stuk" }] } });
  assert.ok(p.komkommer.ketens.lidl.every((c) => !c.geschat));
  assert.throws(() => eigenKandidaat({ product: "x", prijs: 1, maat: "1 L" }, { naam: "bananen", ...ing.bananen }), /past niet/);
});

test("verlopen aanbiedingen vallen weg", () => {
  const p = { x: { ketens: { lidl: [{ product: "oud", geldig_tot: "2026-10-19" }, { product: "vast" }] } } };
  assert.deepEqual(prijzenOpDag(p, "2026-10-21").x.ketens.lidl.map((c) => c.product), ["vast"]);
});

test("weekmenu per winkel, goedkoopste eerst, binnen ruim budget", () => {
  const houdbaar = new Set(Object.values(ing).filter((d) => d.houdbaar).map((d) => d.naam));
  const plannen = vergelijk(recepten, prijzen, { personen: [{ naam: "a", factor: 1 }], budget_per_week: 60, supermarkten: ["ah", "jumbo", "lidl"] },
    { dag: "2026-10-21", houdbaar, seed: 1 });
  assert.equal(plannen.length, 3);
  assert.ok(plannen.every((p) => p.binnen_budget && p.menu.length === 7));
  assert.deepEqual(plannen.map((p) => p.totaal), [...plannen.map((p) => p.totaal)].sort((a, b) => a - b));
});
