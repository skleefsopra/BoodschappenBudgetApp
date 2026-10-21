// De weekplanner van prijzen/planner.py, omgezet naar JavaScript zodat hij op de telefoon draait.
// Werkt in de browser en in Node (voor de tests).

export const TYPES = ["ontbijt", "lunch", "diner"];
export const DAGEN = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"];
export const MAX_HERHALING = { ontbijt: 3, lunch: 3, diner: 2 };
const STRAF_BUDGET = 100; // per euro boven budget
const STRAF_HERHALING = 1.5; // 2e keer hetzelfde recept € 1,50, 3e keer € 6
const BONUS_EIGEN = 0.5;

// --- Maten, zoals prijzen/maat.py ---------------------------------------------------------

const EENHEDEN = {
  g: ["g", 1], gr: ["g", 1], gram: ["g", 1], kg: ["g", 1000], kilo: ["g", 1000],
  ml: ["ml", 1], cl: ["ml", 10], l: ["ml", 1000], liter: ["ml", 1000],
  st: ["stuk", 1], stuk: ["stuk", 1], stuks: ["stuk", 1],
};
const EENHEID = "(kg|kilo|gram|gr|g|ml|cl|liter|l|stuks|stuk|st)";
const GETAL = "(\\d+(?:[.,]\\d+)?)";

export function leesMaat(tekst) {
  if (!tekst) return null;
  const t = tekst.trim().toLowerCase();
  if (/^(los\s+)?per\s+(kilo|kg)$/.test(t)) return [1000, "g"];
  if (/^per\s+(stuk|bos|bosje)$/.test(t)) return [1, "stuk"];
  const getal = (s) => parseFloat(s.replace(",", "."));
  let m = new RegExp(`(\\d+)\\s*x\\s*${GETAL}\\s*${EENHEID}\\b`).exec(t);
  if (m) {
    const [eenheid, factor] = EENHEDEN[m[3]];
    return [parseInt(m[1]) * getal(m[2]) * factor, eenheid];
  }
  m = new RegExp(`${GETAL}\\s*${EENHEID}\\b`).exec(t);
  if (m) {
    const [eenheid, factor] = EENHEDEN[m[2]];
    return [getal(m[1]) * factor, eenheid];
  }
  return null;
}

// Verpakkingsgrootte in de eenheid van het ingrediënt, of null.
export function hoeveelheid(maat, ingredient) {
  if (!maat) return null;
  const [n, eenheid] = maat;
  if (eenheid === ingredient.eenheid) return n;
  const sg = ingredient.stuk_gewicht;
  if (sg && eenheid === "g" && ingredient.eenheid === "stuk") return n / sg;
  if (sg && eenheid === "stuk" && ingredient.eenheid === "g") return n * sg;
  return null;
}

// --- Eigen prijzen, zoals prijzen/eigen.py -----------------------------------------------

export function eigenKandidaat(invoer, ingredient) {
  const maat = leesMaat(invoer.maat);
  if (!maat) throw new Error(`"${invoer.maat}" is geen maat. Schrijf bijvoorbeeld 500 g, 1 kg of 6 stuks.`);
  const n = hoeveelheid(maat, ingredient);
  const naam = { g: "gram", ml: "milliliter", stuk: "stuks" }[ingredient.eenheid];
  if (!n) throw new Error(`"${invoer.maat}" past niet bij ${ingredient.naam}. Dat gaat in ${naam}, schrijf bijvoorbeeld "500 g" of "6 stuks".`);
  return {
    product: invoer.product, prijs: invoer.prijs, verpakking: n, eenheidsprijs: invoer.prijs / n,
    url: "", geschat: false, bron: "eigen", datum: invoer.datum || null,
  };
}

// Prijzen met de eigen invoer erin: per keten en ingrediënt vervangen eigen producten de geschatte.
export function metEigenPrijzen(prijzen, ingredienten, eigen) {
  const uit = structuredClone(prijzen);
  for (const [keten, perIngredient] of Object.entries(eigen || {})) {
    for (const [naam, lijst] of Object.entries(perIngredient)) {
      if (!uit[naam] || !lijst.length) continue;
      const ing = { naam, ...ingredienten[naam], eenheid: uit[naam].eenheid };
      const gemeten = (uit[naam].ketens[keten] || []).filter((c) => !c.geschat);
      uit[naam].ketens[keten] = [...gemeten, ...lijst.map((e) => eigenKandidaat(e, ing))]
        .sort((a, b) => a.eenheidsprijs - b.eenheidsprijs);
    }
  }
  return uit;
}

// --- Rekenen, zoals prijzen/recepten.py --------------------------------------------------

export function kosten(keuze, nodig) {
  const pakken = Math.ceil(nodig / keuze.verpakking - 1e-9);
  return [pakken, Math.round(pakken * keuze.prijs * 100) / 100];
}

export const porties = (personen) => personen.reduce((s, p) => s + (p.factor ?? 1), 0);

export function benodigd(menu, personen) {
  const n = porties(personen);
  const totaal = {};
  for (const r of menu) for (const i of r.ingredienten) totaal[i.naam] = (totaal[i.naam] || 0) + i.hoeveelheid * n;
  return totaal;
}

export function boodschappen(nodig, prijzen, keten) {
  const lijst = [];
  for (const naam of Object.keys(nodig).sort()) {
    const opties = prijzen[naam].ketens[keten];
    let beste = null, besteKosten = null;
    for (const c of opties) {
      const k = kosten(c, nodig[naam]);
      if (!besteKosten || k[1] < besteKosten[1]) [beste, besteKosten] = [c, k];
    }
    if (!beste) continue;
    lijst.push({
      ingredient: naam, nodig: nodig[naam], product: beste.product, aantal: besteKosten[0],
      verpakking: beste.verpakking, prijs: besteKosten[1], url: beste.url, geschat: beste.geschat,
      bron: beste.bron || null,
    });
  }
  return lijst;
}

// --- Planner, zoals prijzen/planner.py ---------------------------------------------------

export function prijzenOpDag(prijzen, dag) {
  const uit = structuredClone(prijzen);
  for (const info of Object.values(uit))
    for (const keten of Object.keys(info.ketens))
      info.ketens[keten] = info.ketens[keten].filter(
        (c) => !(c.geldig_tot && c.geldig_tot < dag) && !(c.geldig_van && c.geldig_van > dag));
  return uit;
}

const beschikbaar = (recepten, prijzen, keten) =>
  recepten.filter((r) => r.ingredienten.every((i) => prijzen[i.naam]?.ketens[keten]?.length));

function rekening(menu, huishouden, prijzen, keten, houdbaar) {
  const nodig = benodigd(menu, huishouden.personen);
  for (const [naam, n] of Object.entries(huishouden.voorraad || {}))
    if (naam in nodig) nodig[naam] = Math.max(0, nodig[naam] - n);
  for (const naam of Object.keys(nodig)) if (nodig[naam] <= 0) delete nodig[naam];
  const lijst = boodschappen(nodig, prijzen, keten);
  let kassabon = 0, budgetbedrag = 0;
  for (const r of lijst) {
    r.houdbaar = houdbaar.has(r.ingredient);
    kassabon += r.prijs;
    budgetbedrag += r.houdbaar ? r.prijs * Math.min(1, r.nodig / (r.aantal * r.verpakking)) : r.prijs;
  }
  return { lijst, kassabon: Math.round(kassabon * 100) / 100, budgetbedrag: Math.round(budgetbedrag * 100) / 100 };
}

function score(keuze, totaal, budget) {
  let s = Math.max(0, totaal - budget) * STRAF_BUDGET + totaal;
  for (const [soort, recepten] of Object.entries(keuze)) {
    const tel = {};
    for (const r of recepten) tel[r.naam] = (tel[r.naam] || 0) + 1;
    for (const n of Object.values(tel)) {
      s += STRAF_HERHALING * (n - 1) ** 2;
      if (n > MAX_HERHALING[soort]) s += 1000;
    }
    s -= BONUS_EIGEN * recepten.filter((r) => r.bron === "eigen").length;
  }
  return s;
}

// Kleine voorspelbare randomgenerator, zodat dezelfde seed hetzelfde menu geeft.
function maakRandom(seed) {
  let a = seed >>> 0 || 1;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rnd.kies = (lijst) => lijst[Math.floor(rnd() * lijst.length)];
  return rnd;
}

function verdeelOverWeek(recepten, rnd) {
  const rest = [...recepten].sort(() => rnd() - 0.5);
  const aantal = (r) => recepten.filter((x) => x.naam === r.naam).length;
  rest.sort((a, b) => aantal(b) - aantal(a) || a.naam.localeCompare(b.naam));
  const week = new Array(7);
  [0, 2, 4, 6, 1, 3, 5].forEach((plek, i) => (week[plek] = rest[i]));
  return week;
}

export function plan(recepten, prijzen, huishouden, keten, { dag, houdbaar = new Set(), seed = 1, pogingen = 6, stappen = 400 } = {}) {
  dag = dag || new Date().toISOString().slice(0, 10);
  const p = prijzenOpDag(prijzen, dag);
  const budget = huishouden.budget_per_week ?? Infinity;
  const rnd = maakRandom(seed);
  const perType = {};
  for (const t of TYPES) perType[t] = beschikbaar(recepten, p, keten).filter((r) => r.type === t);
  if (!TYPES.every((t) => perType[t].length)) return null;

  const beoordeel = (keuze) =>
    score(keuze, rekening(Object.values(keuze).flat(), huishouden, p, keten, houdbaar).budgetbedrag, budget);

  let beste = null, besteScore = Infinity;
  for (let poging = 0; poging < pogingen; poging++) {
    const keuze = {};
    for (const t of TYPES) keuze[t] = DAGEN.map(() => rnd.kies(perType[t]));
    let s = beoordeel(keuze);
    for (let stap = 0; stap < stappen; stap++) {
      const t = rnd.kies(TYPES), i = Math.floor(rnd() * 7), oud = keuze[t][i];
      keuze[t][i] = rnd.kies(perType[t]);
      const nieuw = beoordeel(keuze);
      if (nieuw <= s) s = nieuw;
      else keuze[t][i] = oud;
    }
    if (s < besteScore) [beste, besteScore] = [Object.fromEntries(TYPES.map((t) => [t, [...keuze[t]]])), s];
  }

  const { lijst, kassabon, budgetbedrag } = rekening(Object.values(beste).flat(), huishouden, p, keten, houdbaar);
  const week = Object.fromEntries(TYPES.map((t) => [t, verdeelOverWeek(beste[t], rnd)]));
  return {
    keten, boodschappendag: dag, budget, totaal: budgetbedrag, kassabon, binnen_budget: budgetbedrag <= budget,
    menu: DAGEN.map((d, i) => ({ dag: d, ...Object.fromEntries(TYPES.map((t) => [t, week[t][i].naam])) })),
    boodschappen: lijst,
  };
}

export function vergelijk(recepten, prijzen, huishouden, opties = {}) {
  return (huishouden.supermarkten || ["ah", "jumbo", "lidl"])
    .map((k) => plan(recepten, prijzen, huishouden, k, opties))
    .filter(Boolean)
    .sort((a, b) => a.totaal - b.totaal);
}
