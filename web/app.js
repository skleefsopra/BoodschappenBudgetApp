import { TYPES, DAGEN, vergelijk, metEigenPrijzen, eigenKandidaat, porties, benodigd } from "./planner.js";

const KETENS = { ah: "AH", jumbo: "Jumbo", lidl: "Lidl" };
const FACTOREN = [["Volwassene", 1], ["Grote eter", 1.3], ["Tiener", 1.1], ["Kind (4-11)", 0.6], ["Peuter", 0.4]];
const EENHEID = { g: "gram", ml: "ml", stuk: "stuks" };

// --- Opslag op de telefoon --------------------------------------------------------------

const STANDAARD = {
  huishouden: { personen: [{ naam: "Ik", factor: 1 }], budget_per_week: 50, supermarkten: ["ah", "jumbo", "lidl"], voorraad: {} },
  eigenRecepten: [], verborgen: [], eigenPrijzen: {}, keten: null, seed: 1, afgevinkt: {}, tab: "week",
};
function lees() {
  try { return { ...STANDAARD, ...JSON.parse(localStorage.getItem("weekmenu") || "{}") }; } catch { return structuredClone(STANDAARD); }
}
let staat = lees();
function bewaar() { try { localStorage.setItem("weekmenu", JSON.stringify(staat)); } catch { /* opslag geblokkeerd: werkt verder zonder */ } }

// --- Data --------------------------------------------------------------------------------

let data = null; // { prijzen, gemaakt, recepten, ingredienten }
let plannen = [];
let rekenen = false;

async function laadData() {
  const [p, r, i] = await Promise.all(["data/ingredientprijzen.json", "data/recepten.json", "data/ingredienten.json"]
    .map((u) => fetch(u).then((x) => { if (!x.ok) throw new Error(u); return x.json(); })));
  data = { prijzen: p.ingredienten, gemaakt: p.gemaakt, recepten: r, ingredienten: Object.fromEntries(i.map((d) => [d.naam, d])) };
}

const alleRecepten = () => [...staat.eigenRecepten, ...data.recepten.filter((r) => !staat.verborgen.includes(r.naam))];
const recept = (naam) => alleRecepten().find((r) => r.naam === naam);
const houdbaar = () => new Set(Object.values(data.ingredienten).filter((d) => d.houdbaar).map((d) => d.naam));
const vandaag = () => new Date().toLocaleDateString("sv-SE");

function prijzen() {
  try { return metEigenPrijzen(data.prijzen, data.ingredienten, staat.eigenPrijzen); }
  catch (e) { toon(e.message); return data.prijzen; }
}

function herbereken() {
  rekenen = true; teken();
  setTimeout(() => {
    plannen = vergelijk(alleRecepten(), prijzen(), staat.huishouden, { dag: vandaag(), houdbaar: houdbaar(), seed: staat.seed });
    if (!plannen.some((p) => p.keten === staat.keten)) staat.keten = plannen[0]?.keten ?? null;
    rekenen = false; bewaar(); teken();
  }, 30);
}

// --- Hulpjes -----------------------------------------------------------------------------

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const euro = (n) => "€ " + n.toFixed(2).replace(".", ",");
const getal = (n) => (Math.round(n * 10) / 10).toLocaleString("nl-NL");
const $ = (s, el = document) => el.querySelector(s);
function toon(tekst) {
  const m = $("#melding"); m.textContent = tekst; m.hidden = false;
  clearTimeout(toon.t); toon.t = setTimeout(() => (m.hidden = true), 2600);
}
function hoeveelTekst(naam, n) {
  const e = data.ingredienten[naam]?.eenheid || data.prijzen[naam]?.eenheid;
  if (e === "g" && n >= 1000) return `${getal(n / 1000)} kg`;
  if (e === "ml" && n >= 1000) return `${getal(n / 1000)} liter`;
  return `${getal(n)} ${EENHEID[e] || ""}`;
}
const gekozen = () => plannen.find((p) => p.keten === staat.keten);
const ingredientOpties = (gekozenNaam = "") => Object.keys(data.prijzen).sort((a, b) => a.localeCompare(b))
  .map((n) => `<option value="${esc(n)}" ${n === gekozenNaam ? "selected" : ""}>${esc(n)} (${EENHEID[data.prijzen[n].eenheid]})</option>`).join("");

// --- Schermen ----------------------------------------------------------------------------

function schermWeek() {
  const h = staat.huishouden, p = gekozen();
  if (rekenen && !plannen.length) return `<p class="bezig">Weekmenu wordt samengesteld…</p>`;
  if (!plannen.length) return `<div class="card">Er is geen weekmenu te maken. Kies minstens één supermarkt bij Huishouden en zorg dat er van elk soort maaltijd een recept is.</div>`;
  const pct = Math.min(100, (p.totaal / h.budget_per_week) * 100);
  return `
  <header class="kop">
    <div class="row between"><h1>Deze week</h1><span class="pill">${porties(h.personen).toLocaleString("nl-NL")} ${porties(h.personen) === 1 ? "portie" : "porties"} per maaltijd</span></div>
    <div class="stack" style="gap:6px">
      <div class="row between"><span class="muted small">Weekbedrag bij ${KETENS[p.keten]}</span>
        <span class="geld">${euro(p.totaal)} <span class="muted">van ${euro(h.budget_per_week)}</span></span></div>
      <div class="meter ${p.binnen_budget ? "" : "over"}" role="img" aria-label="${Math.round(pct)}% van het budget"><i style="width:${pct}%"></i></div>
      ${p.binnen_budget ? "" : `<p class="fout">Dit menu is ${euro(p.totaal - h.budget_per_week)} duurder dan je budget. Voeg goedkopere recepten toe of verhoog het budget.</p>`}
    </div>
  </header>

  <section class="stack" aria-labelledby="kies">
    <div class="row between"><h2 id="kies">Kies je supermarkt</h2>
      <button class="klein" id="nieuw" ${rekenen ? "disabled" : ""}>${rekenen ? "Bezig…" : "Ander menu"}</button></div>
    <div class="winkels">
      ${plannen.map((x, i) => `
        <button class="winkel card" data-keten="${x.keten}" aria-pressed="${x.keten === staat.keten}">
          <span class="row between"><span class="naam">${KETENS[x.keten]}</span>${i === 0 ? `<span class="pill ok">Goedkoopst</span>` : ""}</span>
          <span class="bedrag">${euro(x.totaal)}</span>
          <span class="small muted">Kassabon ${euro(x.kassabon)}</span>
          <span>${x.binnen_budget ? `<span class="pill ok">Binnen budget</span>` : `<span class="pill bad">${euro(x.totaal - h.budget_per_week)} te duur</span>`}</span>
        </button>`).join("")}
    </div>
    <p class="small muted">Elke winkel krijgt een eigen menu, want wat goedkoop is verschilt per winkel. Lang houdbare producten tellen mee voor wat je deze week gebruikt; de kassabon is wat je nu afrekent.</p>
  </section>

  <section class="card" aria-labelledby="menu">
    <h2 id="menu" style="margin-bottom:8px">Menu bij ${KETENS[p.keten]}</h2>
    ${p.menu.map((d, i) => `
      <div class="dag">
        <div class="wk">${d.dag.slice(0, 2).replace(/^./, (c) => c.toUpperCase())}<small>${d.dag}</small></div>
        <div class="maaltijden">
          ${TYPES.map((t) => `<button class="maal" data-recept="${esc(d[t])}"><span class="soort">${t}</span>
            <span class="gerecht">${esc(d[t])}${recept(d[t])?.bron === "eigen" ? `<span class="eigen-tag">eigen</span>` : ""}</span></button>`).join("")}
        </div>
      </div>`).join("")}
  </section>`;
}

function schermLijst() {
  const p = gekozen();
  if (!p) return `<div class="card">Nog geen menu. Kies eerst een supermarkt bij Week.</div>`;
  const af = new Set(staat.afgevinkt[p.keten + p.boodschappendag + staat.seed] || []);
  const open = p.boodschappen.filter((r) => !af.has(r.ingredient));
  return `
  <header class="row between"><h1>Boodschappen</h1><span class="pill">${open.length} van ${p.boodschappen.length} te halen</span></header>
  <section class="bon" aria-label="Boodschappenlijst">
    <h2>${KETENS[p.keten]}</h2>
    <p class="small muted" style="text-align:center">Week vanaf ${new Date(p.boodschappendag).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })}</p>
    <div class="streep"></div>
    ${p.boodschappen.map((r) => {
      const tags = [r.houdbaar && "gaat langer mee", r.geschat && "maat geschat", r.bron === "eigen" && "eigen prijs", r.bron === "lidl.nl" && "aanbieding"].filter(Boolean);
      return `<label class="regel ${af.has(r.ingredient) ? "af" : ""}">
        <input type="checkbox" data-af="${esc(r.ingredient)}" ${af.has(r.ingredient) ? "checked" : ""}>
        <span class="wat">${r.aantal}× ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.product)}</a>` : esc(r.product)}
          <span class="detail">nodig ${hoeveelTekst(r.ingredient, r.nodig)} ${esc(r.ingredient)}${tags.length ? " · " + tags.join(" · ") : ""}</span></span>
        <span class="prijs">${euro(r.prijs)}</span></label>`;
    }).join("")}
    <div class="streep"></div>
    <div class="totaal groot"><span>TOTAAL</span><span>${euro(p.kassabon)}</span></div>
    <div class="totaal muted small"><span>waarvan deze week verbruikt</span><span>${euro(p.totaal)}</span></div>
  </section>
  <p class="small muted">Klopt een prijs of verpakking niet? Vul hem zelf in bij Prijzen.</p>`;
}

function schermRecepten() {
  const lijst = (t) => alleRecepten().filter((r) => r.type === t);
  return `
  <header class="row between"><h1>Recepten</h1><button class="primair klein" id="recept-nieuw">Recept toevoegen</button></header>
  ${TYPES.map((t) => `
    <section class="card stack" aria-label="${t}">
      <h2>${t[0].toUpperCase() + t.slice(1)}</h2>
      <ul class="lijstje">
        ${lijst(t).map((r) => `<li><button class="tekst" data-recept="${esc(r.naam)}" style="text-align:left">${esc(r.naam)}</button>
          <span class="row">${r.bron === "eigen" ? `<span class="pill ok">eigen</span>` : ""}
          <button class="tekst small" data-verwijder-recept="${esc(r.naam)}" aria-label="${esc(r.naam)} niet meer gebruiken">Weg</button></span></li>`).join("")}
      </ul>
    </section>`).join("")}
  ${staat.verborgen.length ? `<p class="small muted">${staat.verborgen.length} voorgestelde recepten staan uit. <button class="tekst" id="herstel">Zet ze terug</button></p>` : ""}`;
}

function schermPrijzen() {
  const p = prijzen();
  const zorgen = staat.huishouden.supermarkten.map((k) => {
    const geen = Object.keys(p).filter((n) => !p[n].ketens[k]?.length);
    const geschat = Object.keys(p).filter((n) => p[n].ketens[k]?.length && p[n].ketens[k].every((c) => c.geschat));
    return { k, geen, geschat };
  });
  const eigen = Object.entries(staat.eigenPrijzen).flatMap(([k, per]) => Object.entries(per).flatMap(([n, l]) => l.map((e, i) => ({ k, n, i, ...e }))));
  return `
  <header class="stack" style="gap:4px"><h1>Prijzen</h1>
    <p class="muted small">Prijzen van ${new Date(data.gemaakt).toLocaleDateString("nl-NL", { day: "numeric", month: "long" })}. Ontbreekt er iets, of klopt een verpakking niet? Vul het hier in. Jouw prijs gaat voor een geschatte.</p></header>

  <section class="card stack" aria-labelledby="mist">
    <h2 id="mist">Wat ontbreekt</h2>
    ${zorgen.map(({ k, geen, geschat }) => `
      <div class="stack" style="gap:6px"><h3>${KETENS[k]}</h3>
        ${!geen.length && !geschat.length ? `<p class="small muted">Alles compleet.</p>` : ""}
        <div class="row">${geen.map((n) => `<button class="pill bad" data-vul="${k}|${esc(n)}">${esc(n)}: geen product</button>`).join("")}
        ${geschat.map((n) => `<button class="pill warn" data-vul="${k}|${esc(n)}">${esc(n)}: maat geschat</button>`).join("")}</div>
      </div>`).join("")}
  </section>

  <form class="card stack" id="prijs-form" aria-labelledby="zelf">
    <h2 id="zelf">Zelf invullen</h2>
    <div class="grid2">
      <label class="veld">Supermarkt<select id="pf-keten">${Object.entries(KETENS).map(([k, n]) => `<option value="${k}" ${k === "lidl" ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <label class="veld">Ingrediënt<select id="pf-ing">${ingredientOpties()}</select></label>
    </div>
    <label class="veld">Product zoals in de winkel<input id="pf-product" placeholder="Bananen tros" required></label>
    <div class="grid2">
      <label class="veld">Prijs in euro<input id="pf-prijs" inputmode="decimal" placeholder="1,29" required></label>
      <label class="veld">Verpakking<input id="pf-maat" placeholder="5 stuks, 1 kg, 6 x 1 L" required></label>
    </div>
    <p class="fout" id="pf-fout" hidden></p>
    <button class="primair" type="submit">Prijs opslaan</button>
  </form>

  ${eigen.length ? `<section class="card stack" aria-labelledby="mijn"><h2 id="mijn">Jouw prijzen</h2><ul class="lijstje">
    ${eigen.map((e) => `<li><span>${KETENS[e.k]} · ${esc(e.product)} <span class="muted small">(${esc(e.n)}, ${esc(e.maat)}${e.datum ? ", " + new Date(e.datum).toLocaleDateString("nl-NL") : ""})</span></span>
      <span class="row"><span class="geld">${euro(e.prijs)}</span><button class="tekst small" data-wis-prijs="${e.k}|${esc(e.n)}|${e.i}">Wis</button></span></li>`).join("")}
  </ul></section>` : ""}`;
}

function schermInstellingen() {
  const h = staat.huishouden;
  const voorraad = Object.entries(h.voorraad || {});
  return `
  <header><h1>Huishouden</h1></header>
  <section class="card stack" aria-labelledby="budget-kop">
    <h2 id="budget-kop">Budget</h2>
    <label class="veld">Weekbudget in euro<input id="budget" inputmode="decimal" value="${h.budget_per_week}"></label>
  </section>

  <section class="card stack" aria-labelledby="pers">
    <h2 id="pers">Wie eet er mee?</h2>
    ${h.personen.map((p, i) => `
      <div class="grid3">
        <label class="veld">Naam<input data-persoon-naam="${i}" value="${esc(p.naam)}"></label>
        <label class="veld">Portie<select data-persoon-factor="${i}">${FACTOREN.map(([n, f]) => `<option value="${f}" ${f === p.factor ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        <button class="klein" data-weg-persoon="${i}" ${h.personen.length === 1 ? "disabled" : ""} aria-label="${esc(p.naam)} verwijderen">Weg</button>
      </div>`).join("")}
    <button class="klein" id="persoon-erbij">Persoon toevoegen</button>
  </section>

  <section class="card stack" aria-labelledby="wink">
    <h2 id="wink">Supermarkten om te vergelijken</h2>
    <div class="row">${Object.entries(KETENS).map(([k, n]) => `<label class="row" style="gap:6px"><input type="checkbox" style="width:20px;height:20px;accent-color:var(--accent)" data-winkel="${k}" ${h.supermarkten.includes(k) ? "checked" : ""}>${n}</label>`).join("")}</div>
  </section>

  <section class="card stack" aria-labelledby="voor">
    <h2 id="voor">Al in huis</h2>
    <p class="small muted">Wat hier staat wordt niet gekocht, bijvoorbeeld een halve zak rijst.</p>
    ${voorraad.length ? `<ul class="lijstje">${voorraad.map(([n, q]) => `<li><span>${esc(n)}</span><span class="row"><span class="mono">${hoeveelTekst(n, q)}</span><button class="tekst small" data-weg-voorraad="${esc(n)}">Weg</button></span></li>`).join("")}</ul>` : ""}
    <form id="voorraad-form" class="grid3">
      <label class="veld">Ingrediënt<select id="vr-ing">${ingredientOpties()}</select></label>
      <label class="veld">Hoeveel<input id="vr-hoeveel" inputmode="decimal" placeholder="500" required></label>
      <button class="klein" type="submit">Toevoegen</button>
    </form>
  </section>
  <button class="primair" id="opnieuw">Menu opnieuw berekenen</button>`;
}

function receptVenster(naam) {
  const r = recept(naam);
  if (!r) return;
  const per = porties(staat.huishouden.personen);
  const nodig = benodigd([r], staat.huishouden.personen);
  $("#venster-inhoud").innerHTML = `
    <div class="row between"><span class="label">${r.type}${r.bron === "eigen" ? " · eigen recept" : ""}</span><button class="tekst" data-sluit>Sluiten</button></div>
    <h2>${esc(r.naam)}</h2>
    <p class="small muted">Voor ${per.toLocaleString("nl-NL")} porties</p>
    <ul class="lijstje">${Object.entries(nodig).map(([n, q]) => `<li><span>${esc(n)}</span><span class="mono">${hoeveelTekst(n, q)}</span></li>`).join("")}</ul>
    ${r.bereiding ? `<p>${esc(r.bereiding)}</p>` : ""}`;
  $("#venster").showModal();
}

function receptFormulier() {
  const rij = () => `<div class="grid3" data-rij><label class="veld">Ingrediënt<select data-r-ing>${ingredientOpties()}</select></label>
    <label class="veld">Per persoon<input data-r-hoeveel inputmode="decimal" placeholder="100" required></label>
    <button type="button" class="klein" data-r-weg aria-label="Regel weg">Weg</button></div>`;
  $("#venster-inhoud").innerHTML = `
    <form id="recept-form" class="stack">
      <div class="row between"><h2>Eigen recept</h2><button type="button" class="tekst" data-sluit>Annuleren</button></div>
      <label class="veld">Naam<input id="rf-naam" required placeholder="Ovenschotel van oma"></label>
      <label class="veld">Soort<select id="rf-type">${TYPES.map((t) => `<option>${t}</option>`).join("")}</select></label>
      <div class="stack" id="rf-rijen">${rij()}${rij()}</div>
      <p class="small muted">Hoeveelheid voor één volwassen portie, in de eenheid achter het ingrediënt. Brood: één snee is 0,045. Knoflook: één teen is 0,1.</p>
      <button type="button" class="klein" id="rf-erbij">Ingrediënt toevoegen</button>
      <label class="veld">Bereiding (mag leeg)<textarea id="rf-bereiding"></textarea></label>
      <p class="fout" id="rf-fout" hidden></p>
      <button class="primair" type="submit">Recept opslaan</button>
    </form>`;
  $("#rf-erbij").onclick = () => $("#rf-rijen").insertAdjacentHTML("beforeend", rij());
  $("#venster").showModal();
}

// --- Tekenen en gebeurtenissen -----------------------------------------------------------

const SCHERMEN = { week: schermWeek, lijst: schermLijst, recepten: schermRecepten, prijzen: schermPrijzen, instellingen: schermInstellingen };

function teken() {
  if (!data) return;
  $("#app").innerHTML = SCHERMEN[staat.tab]();
  document.querySelectorAll("nav.tabs button").forEach((b) => b.dataset.tab === staat.tab ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"));
}

const decimaal = (s) => parseFloat(String(s).replace(",", "."));

document.addEventListener("click", (e) => {
  const t = e.target.closest("button, input[type=checkbox]");
  if (!t) return;
  const d = t.dataset;
  if (d.tab) { staat.tab = d.tab; bewaar(); teken(); scrollTo(0, 0); }
  else if (d.keten) { staat.keten = d.keten; bewaar(); teken(); }
  else if (t.id === "nieuw") { staat.seed = Math.floor(Math.random() * 1e6); herbereken(); }
  else if (d.recept) receptVenster(d.recept);
  else if (d.sluit !== undefined) $("#venster").close();
  else if (d.af) {
    const p = gekozen(), sleutel = p.keten + p.boodschappendag + staat.seed;
    const af = new Set(staat.afgevinkt[sleutel] || []);
    t.checked ? af.add(d.af) : af.delete(d.af);
    staat.afgevinkt = { [sleutel]: [...af] }; // alleen de lijst van deze week bewaren
    bewaar(); teken();
  }
  else if (t.id === "recept-nieuw") receptFormulier();
  else if (d.rWeg !== undefined) t.closest("[data-rij]").remove();
  else if (d.verwijderRecept) {
    const n = d.verwijderRecept;
    if (staat.eigenRecepten.some((r) => r.naam === n)) staat.eigenRecepten = staat.eigenRecepten.filter((r) => r.naam !== n);
    else staat.verborgen.push(n);
    toon(`${n} wordt niet meer gebruikt`); herbereken();
  }
  else if (t.id === "herstel") { staat.verborgen = []; herbereken(); }
  else if (d.vul) {
    const [k, n] = d.vul.split("|");
    $("#pf-keten").value = k; $("#pf-ing").value = n; $("#pf-product").focus();
  }
  else if (d.wisPrijs) {
    const [k, n, i] = d.wisPrijs.split("|");
    staat.eigenPrijzen[k][n].splice(+i, 1);
    if (!staat.eigenPrijzen[k][n].length) delete staat.eigenPrijzen[k][n];
    herbereken();
  }
  else if (t.id === "persoon-erbij") { staat.huishouden.personen.push({ naam: `Persoon ${staat.huishouden.personen.length + 1}`, factor: 1 }); bewaar(); teken(); }
  else if (d.wegPersoon) { staat.huishouden.personen.splice(+d.wegPersoon, 1); bewaar(); teken(); }
  else if (d.wegVoorraad) { delete staat.huishouden.voorraad[d.wegVoorraad]; bewaar(); teken(); }
  else if (t.id === "opnieuw") { herbereken(); staat.tab = "week"; }
});

document.addEventListener("change", (e) => {
  const t = e.target, d = t.dataset, h = staat.huishouden;
  if (t.id === "budget") { const b = decimaal(t.value); if (b > 0) { h.budget_per_week = b; bewaar(); } else toon("Vul een bedrag in, bijvoorbeeld 50"); }
  else if (d.persoonNaam) { h.personen[+d.persoonNaam].naam = t.value; bewaar(); }
  else if (d.persoonFactor) { h.personen[+d.persoonFactor].factor = +t.value; bewaar(); }
  else if (d.winkel) { h.supermarkten = Object.keys(KETENS).filter((k) => $(`[data-winkel=${k}]`).checked); bewaar(); }
});

document.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.id === "prijs-form") {
    const k = $("#pf-keten").value, n = $("#pf-ing").value;
    const invoer = { product: $("#pf-product").value.trim(), prijs: decimaal($("#pf-prijs").value), maat: $("#pf-maat").value.trim(), datum: vandaag() };
    const fout = $("#pf-fout");
    try {
      if (!(invoer.prijs > 0)) throw new Error("Vul een prijs in, bijvoorbeeld 1,29.");
      eigenKandidaat(invoer, { naam: n, ...data.ingredienten[n], eenheid: data.prijzen[n].eenheid });
    } catch (err) { fout.textContent = err.message; fout.hidden = false; return; }
    ((staat.eigenPrijzen[k] ||= {})[n] ||= []).push(invoer);
    toon(`Prijs voor ${n} bij ${KETENS[k]} opgeslagen`); herbereken();
  } else if (f.id === "voorraad-form") {
    const q = decimaal($("#vr-hoeveel").value);
    if (!(q > 0)) return toon("Vul een hoeveelheid in");
    staat.huishouden.voorraad[$("#vr-ing").value] = q; bewaar(); teken();
  } else if (f.id === "recept-form") {
    const naam = $("#rf-naam").value.trim(), fout = $("#rf-fout");
    const ingredienten = [...f.querySelectorAll("[data-rij]")].map((r) => ({ naam: $("[data-r-ing]", r).value, hoeveelheid: decimaal($("[data-r-hoeveel]", r).value) }));
    const probleem = !naam ? "Geef het recept een naam."
      : alleRecepten().some((r) => r.naam === naam) ? "Er is al een recept met deze naam."
      : !ingredienten.length || ingredienten.some((i) => !(i.hoeveelheid > 0)) ? "Vul bij elk ingrediënt een hoeveelheid in." : null;
    if (probleem) { fout.textContent = probleem; fout.hidden = false; return; }
    staat.eigenRecepten.push({ naam, type: $("#rf-type").value, bron: "eigen", ingredienten, bereiding: $("#rf-bereiding").value.trim() });
    $("#venster").close(); toon(`${naam} toegevoegd`); herbereken();
  }
});

$("#venster").addEventListener("click", (e) => { if (e.target.id === "venster") e.target.close(); });

laadData().then(() => { teken(); herbereken(); }).catch(() => {
  $("#app").innerHTML = `<div class="card">De prijzen konden niet geladen worden. Controleer je internetverbinding en open de app opnieuw.</div>`;
});

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
