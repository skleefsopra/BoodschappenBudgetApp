// Het rekenwerk van prijzen/recepten.py, in JavaScript zodat de app het op de telefoon doet.
// Werkt in de browser en in Node (voor de tests).

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
      bron: beste.bron || null, aanbieding: Boolean(beste.geldig_tot),
    });
  }
  return lijst;
}

// --- Winkels vergelijken, zoals prijzen/recepten.vergelijk_winkels ------------------------

export function prijzenOpDag(prijzen, dag) {
  const uit = structuredClone(prijzen);
  for (const info of Object.values(uit))
    for (const keten of Object.keys(info.ketens))
      info.ketens[keten] = info.ketens[keten].filter(
        (c) => !(c.geldig_tot && c.geldig_tot < dag) && !(c.geldig_van && c.geldig_van > dag));
  return uit;
}

// Wat de weekrecepten kosten per supermarkt, goedkoopste eerst; winkels waar iets ontbreekt achteraan.
// `aantallen`: hoe vaak per week je een recept maakt (standaard 1, 0 is overslaan).
export function vergelijkWinkels(recepten, prijzen, huishouden, { dag, houdbaar = new Set(), aantallen = {} } = {}) {
  dag = dag || new Date().toISOString().slice(0, 10);
  const p = prijzenOpDag(prijzen, dag);
  const menu = recepten.flatMap((r) => Array(aantallen[r.naam] ?? 1).fill(r));
  const nodig = benodigd(menu, huishouden.personen);
  for (const [naam, n] of Object.entries(huishouden.voorraad || {}))
    if (naam in nodig) nodig[naam] = Math.max(0, nodig[naam] - n);
  for (const naam of Object.keys(nodig)) if (nodig[naam] <= 0) delete nodig[naam];

  return (huishouden.supermarkten || ["ah", "jumbo", "lidl", "aldi"]).map((keten) => {
    const lijst = boodschappen(nodig, p, keten);
    const ontbrekend = Object.keys(nodig).filter((n) => !p[n]?.ketens[keten]?.length).sort();
    let kassabon = 0, weekbedrag = 0;
    for (const r of lijst) {
      r.houdbaar = houdbaar.has(r.ingredient);
      kassabon += r.prijs;
      weekbedrag += r.houdbaar ? r.prijs * Math.min(1, r.nodig / (r.aantal * r.verpakking)) : r.prijs;
    }
    const rond = (n) => Math.round(n * 100) / 100;
    return { keten, boodschappendag: dag, weekbedrag: rond(weekbedrag), kassabon: rond(kassabon), ontbrekend, boodschappen: lijst };
  }).sort((a, b) => (!a.boodschappen.length) - (!b.boodschappen.length)
    || (a.ontbrekend.length > 0) - (b.ontbrekend.length > 0) || a.weekbedrag - b.weekbedrag);
}

// Wat één keer dit recept kost bij een winkel als je alleen het gebruikte deel telt; null als iets ontbreekt.
export function receptPrijs(recept, prijzen, keten, personen) {
  let totaal = 0;
  for (const i of recept.ingredienten) {
    const opties = prijzen[i.naam]?.ketens[keten];
    if (!opties?.length) return null;
    totaal += Math.min(...opties.map((c) => c.eenheidsprijs)) * i.hoeveelheid;
  }
  return Math.round(totaal * porties(personen) * 100) / 100;
}
