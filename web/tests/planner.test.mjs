// node --test web/tests
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { leesMaat, kosten, eigenKandidaat, metEigenPrijzen, vergelijkWinkels, receptPrijs, prijzenOpDag } from "../planner.js";

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

test("winkels vergelijken: goedkoopste complete winkel eerst, aantallen tellen mee", () => {
  const houdbaar = new Set(Object.values(ing).filter((d) => d.houdbaar).map((d) => d.naam));
  const huishouden = { personen: [{ naam: "a", factor: 1 }], supermarkten: ["ah", "jumbo", "lidl"] };
  const w = vergelijkWinkels(recepten, prijzen, huishouden, { dag: "2026-10-21", houdbaar });
  assert.equal(w.length, 3);
  const compleet = w.filter((x) => !x.ontbrekend.length);
  assert.deepEqual(w.slice(0, compleet.length), compleet);
  assert.ok(w.every((x) => x.weekbedrag <= x.kassabon));
  const zonder = vergelijkWinkels(recepten, prijzen, huishouden, { dag: "2026-10-21", aantallen: Object.fromEntries(recepten.map((r) => [r.naam, 0])) });
  assert.ok(zonder.every((x) => x.kassabon === 0));
});

test("receptprijs schaalt met personen en is null als iets ontbreekt", () => {
  const r = { ingredienten: [{ naam: "uien", hoeveelheid: 100 }] };
  const een = receptPrijs(r, prijzen, "ah", [{ factor: 1 }]);
  assert.ok(Math.abs(receptPrijs(r, prijzen, "ah", [{ factor: 1 }, { factor: 1 }]) - 2 * een) < 0.011);
  assert.equal(receptPrijs({ ingredienten: [{ naam: "bestaat niet", hoeveelheid: 1 }] }, prijzen, "ah", [{}]), null);
});
