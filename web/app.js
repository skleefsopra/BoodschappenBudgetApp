import { vergelijkWinkels, receptPrijs, metEigenPrijzen, eigenKandidaat, porties, benodigd } from "./planner.js";

const KETENS = { ah: "AH", jumbo: "Jumbo", lidl: "Lidl", aldi: "Aldi" };
const FACTOREN = [["Volwassene", 1], ["Grote eter", 1.3], ["Tiener", 1.1], ["Kind (4-11)", 0.6], ["Peuter", 0.4]];
const EENHEID = { g: "gram", ml: "ml", stuk: "stuks" };

// --- Opslag op de telefoon --------------------------------------------------------------

const STANDAARD = {
  huishouden: { personen: [{ naam: "Ik", factor: 1 }], budget_per_week: 50, supermarkten: ["ah", "jumbo", "lidl", "aldi"], voorraad: {} },
  aantallen: {}, eigenPrijzen: {}, keten: null, afgevinkt: {}, tab: "week",
};
function lees() {
  try { return { ...STANDAARD, ...JSON.parse(localStorage.getItem("weekmenu") || "{}") }; } catch { return structuredClone(STANDAARD); }
}
let staat = lees();
// Aldi kwam er later bij: zet hem ook aan voor wie de app al gebruikte.
if (!staat.aldiToegevoegd) {
  if (!staat.huishouden.supermarkten.includes("aldi")) staat.huishouden.supermarkten.push("aldi");
  staat.aldiToegevoegd = true;
}
function bewaar() { try { localStorage.setItem("weekmenu", JSON.stringify(staat)); } catch { /* opslag geblokkeerd: werkt verder zonder */ } }

// --- Data --------------------------------------------------------------------------------

let data = null; // { prijzen, gemaakt, recepten, ingredienten }
let plannen = [];

async function laadData() {
  const [p, r, i] = await Promise.all(["data/ingredientprijzen.json", "data/recepten.json", "data/ingredienten.json"]
    .map((u) => fetch(u).then((x) => { if (!x.ok) throw new Error(u); return x.json(); })));
  data = { prijzen: p.ingredienten, gemaakt: p.gemaakt, recepten: r, ingredienten: Object.fromEntries(i.map((d) => [d.naam, d])) };
}

const alleRecepten = () => data.recepten;
const aantal = (naam) => staat.aantallen[naam] ?? 1;
const recept = (naam) => alleRecepten().find((r) => r.naam === naam);
const houdbaar = () => new Set(Object.values(data.ingredienten).filter((d) => d.houdbaar).map((d) => d.naam));
const vandaag = () => new Date().toLocaleDateString("sv-SE");

function prijzen() {
  try { return metEigenPrijzen(data.prijzen, data.ingredienten, staat.eigenPrijzen); }
  catch (e) { toon(e.message); return data.prijzen; }
}

function herbereken() {
  plannen = vergelijkWinkels(alleRecepten(), prijzen(), staat.huishouden, { dag: vandaag(), houdbaar: houdbaar(), aantallen: staat.aantallen });
  if (!plannen.some((p) => p.keten === staat.keten)) staat.keten = plannen[0]?.keten ?? null;
  bewaar(); teken();
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
  if (!plannen.length) return `<div class="card">Kies bij Huishouden minstens één supermarkt om te vergelijken.</div>`;
  const keer = alleRecepten().reduce((n, r) => n + aantal(r.naam), 0);
  const budget = h.budget_per_week;
  const pct = budget ? Math.min(100, (p.weekbedrag / budget) * 100) : 0;
  const goedkoopst = (r) => {
    const bedragen = plannen.map((w) => [w.keten, receptPrijs(r, prijzen(), w.keten, h.personen)]).filter(([, b]) => b != null);
    return bedragen.length ? bedragen.reduce((a, b) => (b[1] < a[1] ? b : a)) : null;
  };
  return `
  <header class="kop">
    <div class="row between"><h1>Deze week</h1><span class="pill">${keer} ${keer === 1 ? "maaltijd" : "maaltijden"} · ${porties(h.personen).toLocaleString("nl-NL")} ${porties(h.personen) === 1 ? "portie" : "porties"}</span></div>
    ${budget ? `<div class="stack" style="gap:6px">
      <div class="row between"><span class="muted small">Weekbedrag bij ${KETENS[p.keten]}</span>
        <span class="geld">${euro(p.weekbedrag)} <span class="muted">van ${euro(budget)}</span></span></div>
      <div class="meter ${p.weekbedrag <= budget ? "" : "over"}" role="img" aria-label="${Math.round(pct)}% van het budget"><i style="width:${pct}%"></i></div>
    </div>` : ""}
  </header>

  <section class="stack" aria-labelledby="kies">
    <h2 id="kies">Waar is het goedkoopst?</h2>
    <div class="winkels">
      ${plannen.map((x, i) => `
        <button class="winkel card" data-keten="${x.keten}" aria-pressed="${x.keten === staat.keten}">
          <span class="row between"><span class="naam">${KETENS[x.keten]}</span>${i === 0 && !x.ontbrekend.length ? `<span class="pill ok">Goedkoopst</span>` : ""}</span>
          <span class="bedrag">${x.boodschappen.length ? euro(x.weekbedrag) : "–"}</span>
          ${x.boodschappen.length ? `<span class="small muted">Kassabon ${euro(x.kassabon)}</span>` : ""}
          ${!x.boodschappen.length ? `<span class="pill">Nog geen prijzen</span>`
            : x.ontbrekend.length ? `<span class="small fout">Mist ${x.ontbrekend.map(esc).join(", ")}</span>` : ""}
        </button>`).join("")}
    </div>
    <p class="small muted">Lang houdbare producten, zoals rijst en sriracha mayo, tellen mee voor wat je deze week gebruikt; de kassabon is wat je nu afrekent. Mist een winkel iets, vul het dan in bij Prijzen.</p>
  </section>

  <section class="card stack" aria-labelledby="menu">
    <h2 id="menu">Recepten deze week</h2>
    <ul class="lijstje">
      ${alleRecepten().map((r) => {
        const g = goedkoopst(r);
        return `<li style="align-items:center">
          <span style="min-width:0"><button class="tekst" data-recept="${esc(r.naam)}" style="text-align:left;padding-left:0">${esc(r.naam)}</button>
            <span class="detail small muted" style="display:block">${g ? `Goedkoopst bij ${KETENS[g[0]]}, ${euro(g[1])}` : "Nergens compleet"}</span></span>
          <span class="row" style="flex-wrap:nowrap;gap:4px">
            <button class="klein" data-minder="${esc(r.naam)}" aria-label="${esc(r.naam)} minder vaak" ${aantal(r.naam) === 0 ? "disabled" : ""}>−</button>
            <span class="mono" style="min-width:2.4em;text-align:center">${aantal(r.naam)}×</span>
            <button class="klein" data-meer="${esc(r.naam)}" aria-label="${esc(r.naam)} vaker" ${aantal(r.naam) >= 7 ? "disabled" : ""}>+</button>
          </span></li>`;
      }).join("")}
    </ul>
  </section>`;
}

function schermLijst() {
  const p = gekozen();
  if (!p) return `<div class="card">Kies eerst een supermarkt bij Week.</div>`;
  const af = new Set(staat.afgevinkt[p.keten + p.boodschappendag] || []);
  const open = p.boodschappen.filter((r) => !af.has(r.ingredient));
  return `
  <header class="row between"><h1>Boodschappen</h1><span class="pill">${open.length} van ${p.boodschappen.length} te halen</span></header>
  <section class="bon" aria-label="Boodschappenlijst">
    <h2>${KETENS[p.keten]}</h2>
    <p class="small muted" style="text-align:center">Week vanaf ${new Date(p.boodschappendag).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })}</p>
    <div class="streep"></div>
    ${p.boodschappen.map((r) => {
      const tags = [r.houdbaar && "gaat langer mee", r.geschat && "maat geschat", r.bron === "eigen" && "eigen prijs", r.aanbieding && "aanbieding"].filter(Boolean);
      return `<label class="regel ${af.has(r.ingredient) ? "af" : ""}">
        <input type="checkbox" data-af="${esc(r.ingredient)}" ${af.has(r.ingredient) ? "checked" : ""}>
        <span class="wat">${r.aantal}× ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.product)}</a>` : esc(r.product)}
          <span class="detail">nodig ${hoeveelTekst(r.ingredient, r.nodig)} ${esc(r.ingredient)}${tags.length ? " · " + tags.join(" · ") : ""}</span></span>
        <span class="prijs">${euro(r.prijs)}</span></label>`;
    }).join("")}
    <div class="streep"></div>
    <div class="totaal groot"><span>TOTAAL</span><span>${euro(p.kassabon)}</span></div>
    <div class="totaal muted small"><span>waarvan deze week verbruikt</span><span>${euro(p.weekbedrag)}</span></div>
    ${p.ontbrekend.length ? `<p class="fout small" style="font-family:var(--f-body)">Niet te koop in de gegevens: ${p.ontbrekend.map(esc).join(", ")}. Vul het in bij Prijzen.</p>` : ""}
  </section>
  <p class="small muted">Klopt een prijs of verpakking niet? Vul hem zelf in bij Prijzen.</p>`;
}

function schermRecepten() {
  const h = staat.huishouden, p = prijzen();
  return `
  <header class="stack" style="gap:4px"><h1>Recepten</h1>
    <p class="small muted">Je vaste recepten. Wil je er een wijzigen of toevoegen, vraag het dan in de chat. Hoe vaak je ze deze week maakt, stel je in bij Week.</p></header>
  ${alleRecepten().map((r) => `
    <section class="card stack" aria-label="${esc(r.naam)}">
      <div class="row between"><h2>${esc(r.naam)}</h2><button class="tekst small" data-recept="${esc(r.naam)}">Bereiding</button></div>
      <p class="small muted">${r.ingredienten.map((i) => esc(i.naam)).join(", ")}</p>
      <div class="row">${plannen.map((w) => {
        const b = receptPrijs(r, p, w.keten, h.personen);
        return `<span class="pill ${b == null ? "bad" : ""}">${KETENS[w.keten]} ${b == null ? "mist iets" : euro(b)}</span>`;
      }).join("")}</div>
    </section>`).join("")}`;
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
        ${geen.length === Object.keys(p).length ? `<p class="small muted">Nog geen prijzen van ${KETENS[k]}. Vul hieronder in wat je wilt vergelijken.</p>` : `<div class="row">${geen.map((n) => `<button class="pill bad" data-vul="${k}|${esc(n)}">${esc(n)}: geen product</button>`).join("")}
        ${geschat.map((n) => `<button class="pill warn" data-vul="${k}|${esc(n)}">${esc(n)}: maat geschat</button>`).join("")}</div>`}
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
    <label class="veld">Weekbudget in euro (leeg laten mag)<input id="budget" inputmode="decimal" value="${h.budget_per_week ?? ""}"></label>
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
  <button class="primair" id="opnieuw">Opnieuw vergelijken</button>`;
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
  else if (d.meer || d.minder) {
    const n = d.meer || d.minder;
    staat.aantallen[n] = Math.max(0, Math.min(7, aantal(n) + (d.meer ? 1 : -1)));
    herbereken();
  }
  else if (d.recept) receptVenster(d.recept);
  else if (d.sluit !== undefined) $("#venster").close();
  else if (d.af) {
    const p = gekozen(), sleutel = p.keten + p.boodschappendag;
    const af = new Set(staat.afgevinkt[sleutel] || []);
    t.checked ? af.add(d.af) : af.delete(d.af);
    staat.afgevinkt = { [sleutel]: [...af] }; // alleen de lijst van deze week bewaren
    bewaar(); teken();
  }
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
  if (t.id === "budget") { const b = decimaal(t.value); h.budget_per_week = b > 0 ? b : null; bewaar(); }
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
  }
});

$("#venster").addEventListener("click", (e) => { if (e.target.id === "venster") e.target.close(); });

laadData().then(() => { teken(); herbereken(); }).catch(() => {
  $("#app").innerHTML = `<div class="card">De prijzen konden niet geladen worden. Controleer je internetverbinding en open de app opnieuw.</div>`;
});

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
